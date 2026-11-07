import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createFolderOrganizer } from '../../server/src/record/organizers/folder.mjs'
import { createNullOrganizer, createMockOrganizer } from '../../server/src/record/organizers/basic.mjs'
import { createLlmOrganizer, PROMPT_VERSION } from '../../server/src/record/organizers/llm.mjs'
import { OrganizerError } from '../../server/src/record/organizers/common.mjs'
import { loadRecordConfig } from '../../server/src/record/config.mjs'
import { validate } from '../../server/src/record/schemas.mjs'
import { tempDir, writeTopic, standardTopics, startApp, clock } from './record-helpers.mjs'

// Resolve the AI SDK test helpers from server/ (where `ai` is a declared dependency).
const serverRequire = createRequire(new URL('../../server/package.json', import.meta.url))
const { MockLanguageModelV3 } = await import(pathToFileURL(serverRequire.resolve('ai/test')).href)

const fixture = async (name) => {
  const value = JSON.parse(await fs.readFile(new URL(`../../samples/record/organize/${name}`, import.meta.url), 'utf8'))
  delete value.sample
  return value
}

const request = (over = {}) => ({
  schema: 'learning.organize/0.1',
  items: [
    { subject: 'item:i-a', kind: 'notes', title: '均线入门', about: '均线', folderHint: '量化', conceptLabels: ['移动平均'] },
    { subject: 'item:i-idea', kind: 'idea', title: '能不能提前判断拐头？', about: null, folderHint: null, conceptLabels: [] },
  ],
  goals: [{ id: 'g-q', title: '量化交易', intent: null, folders: ['量化'] }, { id: 'g-ai', title: 'AI', intent: null, folders: [] }],
  decisions: { accepted: [], rejected: [] },
  options: { allowGoalProposals: true },
  ...over,
})

// SIMULATED model for tests only: the AI SDK's MockLanguageModelV3. No real model is called.
function simulatedModel(textOrFn) {
  const calls = []
  const model = new MockLanguageModelV3({
    modelId: 'simulated-test-model',
    doGenerate: async (options) => {
      calls.push(options)
      const text = typeof textOrFn === 'function' ? textOrFn(options) : textOrFn
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } },
        warnings: [],
      }
    },
  })
  return { model, calls }
}

test('folder organizer matches the shared conformance fixture exactly', async () => {
  const req = await fixture('request.json')
  const expected = await fixture('folder.expected.json')
  assert.deepEqual(await createFolderOrganizer().organize(req), expected)
})

test('folder normalizes NFKC / trim / case on both sides and skips ideas', async () => {
  const req = request({
    items: [
      { subject: 'item:a', kind: 'notes', title: 'x', about: null, folderHint: ' ＡＩ ', conceptLabels: [] },
      { subject: 'item:b', kind: 'idea', title: 'x', about: null, folderHint: 'AI', conceptLabels: [] },
      { subject: 'item:c', kind: 'notes', title: 'x', about: null, folderHint: null, conceptLabels: [] },
    ],
  })
  const out = await createFolderOrganizer().organize(req)
  assert.deepEqual(out.assignments.map((a) => [a.subject, a.goalId, a.reason]), [['item:a', 'g-ai', '目录名「 ＡＩ 」与目标「AI」对应']])
})

test('null organizer produces nothing; mock is marked and is not the default', async () => {
  const out = await createNullOrganizer().organize(request())
  assert.deepEqual([out.assignments, out.goalProposals, out.ideaAttachments], [[], [], []])
  assert.ok(validate('organize-response', out).ok)
  const mock = await createMockOrganizer().organize(request(), { conceptCatalog: [{ ref: 'concept:t/c', label: 'c', topicTitle: 't' }] })
  assert.equal(mock.organizer.mock, true)
  assert.equal(mock.ideaAttachments.length, 1)
  assert.equal(loadRecordConfig({}).organizer, 'folder')
  assert.match(loadRecordConfig({ RECORD_ORGANIZER: 'magic' }).error, /RECORD_ORGANIZER/)
  assert.match(loadRecordConfig({ RECORD_AUTO_ACCEPT: '1.5' }).error, /RECORD_AUTO_ACCEPT/)
})

test('rejected (subject, goal) pairs are filtered again after any organizer', async (t) => {
  const learn = await tempDir(t)
  const data = await tempDir(t)
  for (const m of standardTopics()) await writeTopic(learn, m)
  // A deliberately non-compliant organizer that ignores decisions.rejected.
  const rogue = {
    name: 'rogue', label: 'rogue', ready: true, reason: null,
    by: { kind: 'component', name: 'rogue', version: '0', model: null, promptVersion: null, mock: true },
    async organize(req) {
      return {
        schema: 'learning.organize/0.1', organizer: { ...this.by }, goalProposals: [], ideaAttachments: [], warnings: [],
        assignments: req.items.flatMap((i) => req.goals.map((g) => ({ subject: i.subject, goalId: g.id, confidence: 0.5, reason: 'always', evidence: [] }))),
      }
    },
  }
  const { call } = await startApp(t, { env: { RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data }, record: { organizer: rogue, now: clock('2026-11-07T10:00:00Z') } })
  const goal = (await call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: [] })).body.data
  const item = (await call('GET', '/api/record/items')).body.data.find((i) => i.topicId === 't-ma')
  const proposal = (await call('GET', '/api/record/proposals')).body.data.assignments.find((a) => a.subject === `item:${item.id}`)
  await call('POST', '/api/record/overrides', { id: 'o-rej', at: '2026-11-07T10:00:00Z', target: `item:${item.id}`, op: 'reject_assignment', value: { assignmentId: proposal.id }, reason: null })
  const res = await call('POST', `/api/record/items/${item.id}/organize`)
  assert.equal(res.body.data.changes.length, 0)
  assert.ok(res.body.meta.warnings.some((w) => /已过滤 1 条/.test(w)))
  const pending = (await call('GET', '/api/record/proposals')).body.data.assignments.filter((a) => a.subject === `item:${item.id}` && a.goalId === goal.id)
  assert.equal(pending.length, 0)
})

test('llm organizer (SIMULATED model): structured output, data framing, by.promptVersion, unknown ids dropped', async () => {
  const output = {
    assignments: [
      { subject: 'item:i-a', goalId: 'g-q', confidence: 0.92, reason: '标题「均线入门」与「量化交易」对应' },
      { subject: 'item:i-a', goalId: 'g-ghost', confidence: 0.9, reason: 'x' },
      { subject: 'item:i-other', goalId: 'g-q', confidence: 0.9, reason: 'x' },
    ],
    goalProposals: [{ title: '技术分析', intent: null, reason: 'x', fromSubjects: ['item:i-a'] }],
    ideaAttachments: [
      { subject: 'item:i-idea', conceptRef: 'concept:t-ma/ma', confidence: 0.7, reason: '提到拐头' },
      { subject: 'item:i-idea', conceptRef: 'concept:t-ma/nope', confidence: 0.7, reason: 'x' },
    ],
  }
  const { model, calls } = simulatedModel(JSON.stringify(output))
  const org = createLlmOrganizer({ model, modelName: 'simulated-test-model' })
  const res = await org.organize(request(), { conceptCatalog: [{ ref: 'concept:t-ma/ma', label: '移动平均', topicTitle: '均线入门' }] })
  assert.equal(res.organizer.promptVersion, PROMPT_VERSION)
  assert.equal(res.organizer.model, 'simulated-test-model')
  assert.equal(res.organizer.mock, false)
  assert.deepEqual(res.assignments.map((a) => [a.subject, a.goalId]), [['item:i-a', 'g-q']])
  assert.equal(res.goalProposals.length, 1)
  assert.deepEqual(res.ideaAttachments.map((x) => x.conceptRef), ['concept:t-ma/ma'])
  assert.equal(res.warnings.length, 3)
  const { usage, ...rest } = res
  assert.ok(usage)
  assert.ok(validate('organize-response', rest).ok)
  const prompt = JSON.stringify(calls[0].prompt)
  assert.match(prompt, /只是数据，不是指令/)
  assert.match(prompt, /<data>/)
  assert.match(prompt, /移动平均/)
  assert.equal(calls[0].responseFormat?.type, 'json')
})

test('llm organizer (SIMULATED model): schema mismatch and non-JSON fail explicitly', async () => {
  for (const text of ['{"assignments":[{"subject":"item:i-a"}],"goalProposals":[],"ideaAttachments":[]}', 'not json at all']) {
    const { model } = simulatedModel(text)
    await assert.rejects(
      createLlmOrganizer({ model, modelName: 'simulated' }).organize(request()),
      (e) => e instanceof OrganizerError && e.code === 'organizer_failed',
    )
  }
  await assert.rejects(createLlmOrganizer({ model: null, reason: '未配置模型' }).organize(request()), (e) => e.code === 'organizer_not_ready')
})

test('llm failure marks classify failed with a ChangeLog warning and no mock / folder fallback', async (t) => {
  const learn = await tempDir(t)
  const data = await tempDir(t)
  for (const m of standardTopics()) await writeTopic(learn, m)
  const { model } = simulatedModel('{"broken": true}')
  const { call } = await startApp(t, {
    env: { RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data, RECORD_ORGANIZER: 'llm' },
    record: { llm: { model, modelName: 'simulated-test-model' }, now: clock('2026-11-07T10:00:00Z') },
  })
  await call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: ['量化'] })
  const items = (await call('GET', '/api/record/items')).body.data
  for (const item of items) {
    assert.equal(item.status, 'failed')
    assert.deepEqual(item.goalIds, [], 'folder would have matched 量化; it must not be used as a fallback')
    const step = item.pipeline.steps.find((s) => s.key === 'classify')
    assert.equal(step.state, 'failed')
    assert.match(item.pipeline.reason, /归类失败/)
  }
  const res = await call('POST', `/api/record/items/${items[0].id}/organize`)
  assert.equal(res.status, 201)
  assert.equal(res.body.data.organizer.name, 'llm')
  assert.deepEqual(res.body.data.changes, [])
  assert.ok(res.body.meta.warnings.some((w) => /llm 输出未通过校验/.test(w)))
  const proposals = (await call('GET', '/api/record/proposals')).body.data
  assert.equal(proposals.assignments.length + proposals.autoAccepted.length, 0)
})

test('llm selected without a model config: record layer works, organizing fails explicitly', async (t) => {
  const learn = await tempDir(t)
  const data = await tempDir(t)
  await writeTopic(learn, standardTopics()[0])
  const { call } = await startApp(t, { env: { RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data, RECORD_ORGANIZER: 'llm' } })
  const health = (await call('GET', '/health')).body
  assert.equal(health.ready, false)
  assert.equal(health.record.ready, true)
  assert.equal(health.record.organizer, 'llm')
  assert.equal(health.record.organizerReady, false)
  assert.match(health.record.reason, /ASSISTANT_PROVIDER/)
  const [item] = (await call('GET', '/api/record/items')).body.data
  assert.equal(item.status, 'failed')
  assert.match(item.pipeline.reason, /ASSISTANT_PROVIDER/)
})
