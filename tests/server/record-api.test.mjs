import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { validate } from '../../server/src/record/schemas.mjs'
import { tempDir, writeTopic, standardTopics, startApp, clock, event, manifest } from './record-helpers.mjs'

const goalBody = (title, folders = []) => ({ title, intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders })

async function world(t, env = {}) {
  const learn = await tempDir(t)
  const data = await tempDir(t)
  for (const m of standardTopics()) await writeTopic(learn, m)
  const app = await startApp(t, { env: { RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data, ...env }, record: { now: clock('2026-11-07T10:00:00Z') } })
  return { ...app, learn, data }
}

function assertEnvelope(body, schema) {
  assert.ok(validate('envelope', body).ok, validate('envelope', body).message)
  assert.equal(body.meta.source, 'record')
  if (!schema) return
  const rows = Array.isArray(body.data) ? body.data : [body.data]
  for (const row of rows) {
    const check = validate(schema, row)
    assert.ok(check.ok, `${schema}: ${check.message}`)
  }
}

test('no model configured: every record route works and /api/copilotkit stays 503', async (t) => {
  const { call } = await world(t)
  const health = (await call('GET', '/health')).body
  assert.equal(health.ready, false)
  assert.deepEqual(Object.keys(health.record).slice(0, 4), ['ready', 'topics', 'organizer', 'reason'])
  assert.equal(health.record.ready, true)
  assert.equal(health.record.topics, 3)
  assert.equal(health.record.organizer, 'folder')
  assert.equal(health.record.organizerLabel, '按文件夹归类（没调用模型）')
  const recordHealth = await call('GET', '/api/record/health')
  assertEnvelope(recordHealth.body)
  const copilot = await call('POST', '/api/copilotkit', {})
  assert.equal(copilot.status, 503)
  assert.equal(copilot.body.error, 'model_provider_not_configured')

  const g = await call('POST', '/api/record/goals', goalBody('量化交易', ['量化']))
  assert.equal(g.status, 201)
  assertEnvelope(g.body, 'goal')
  const checks = [
    ['/api/record/topics', null],
    ['/api/record/goals', 'goal'],
    ['/api/record/proposals', 'proposals'],
    ['/api/record/items', 'item'],
    ['/api/record/changelog', 'changelog'],
    ['/api/record/overrides', null],
    ['/api/record/events', 'event'],
    ['/api/record/mastery?tz=UTC', 'mastery'],
    ['/api/record/today?tz=Asia/Shanghai', 'today'],
    ['/api/record/stats?range=month&tz=UTC', 'stats'],
    ['/api/record/panorama?tz=UTC', 'panorama'],
  ]
  for (const [url, schema] of checks) {
    const res = await call('GET', url)
    assert.equal(res.status, 200, url)
    assertEnvelope(res.body, schema)
  }
  const items = (await call('GET', '/api/record/items')).body.data
  const ma = items.find((i) => i.topicId === 't-ma')
  assert.equal(ma.identity.about, '均线的基本用法')
  assert.equal(ma.status, 'done')
  assert.deepEqual(ma.goalIds, [g.body.data.id])
  const detail = await call('GET', `/api/record/items/${ma.id}`)
  assertEnvelope(detail.body)
  const { groups, assignments, changeLogIds, orphaned, ...rest } = detail.body.data
  assert.ok(validate('item', rest).ok)
  assert.deepEqual(groups.map((x) => x.name), ['基础', '信号'])
  assert.ok(assignments.length >= 1 && assignments.every((a) => validate('assignment', a).ok))
  assert.ok(changeLogIds.length >= 1)
  assert.deepEqual(orphaned, [])
  const learn = await call('GET', '/api/record/topics/t-ma/learn')
  assert.equal(learn.body.data.learn.schema, 'learning.learn/0.1')
  assert.ok(learn.body.meta.warnings.includes('未提供 tz，按 UTC 聚合'))
  for (const m of learn.body.data.overlay.mastery) assert.ok(validate('mastery', m).ok)
})

test('topics: unknown 404, invalid / traversal ids 400, symlink escape and bad manifests skipped', async (t) => {
  const { call, learn } = await world(t)
  const outside = await tempDir(t)
  const evil = manifest({ id: 'evil', title: '外部', concepts: [{ id: 'x', label: 'x' }] })
  await writeTopic(outside, evil)
  await fs.symlink(path.join(outside, 'evil'), path.join(learn, 'evil'))
  await fs.mkdir(path.join(learn, 'broken'))
  await fs.writeFile(path.join(learn, 'broken', 'manifest.json'), '{"schema":"learning.manifest/0.1"}')
  await fs.writeFile(path.join(learn, 'broken', 'learn.json'), '{}')
  await fs.mkdir(path.join(learn, 'mismatch'))
  await writeTopic(learn, manifest({ id: 'mismatch-other', title: 'x', concepts: [] }))
  await fs.rename(path.join(learn, 'mismatch-other', 'manifest.json'), path.join(learn, 'mismatch', 'manifest.json'))
  await fs.rename(path.join(learn, 'mismatch-other', 'learn.json'), path.join(learn, 'mismatch', 'learn.json'))
  await fs.rm(path.join(learn, 'mismatch-other'), { recursive: true })

  const topics = (await call('GET', '/api/record/topics')).body.data.map((x) => x.topicId).sort()
  assert.deepEqual(topics, ['t-ai', 't-ma', 't-trend'])
  const skipped = (await call('GET', '/health')).body.record.skippedTopics
  assert.deepEqual(skipped.map((s) => s.dir).sort(), ['broken', 'evil', 'mismatch'])
  assert.match(skipped.find((s) => s.dir === 'evil').reason, /之外/)
  assert.equal((await call('GET', '/api/record/topics/evil/learn')).status, 404)
  assert.equal((await call('GET', '/api/record/topics/nope/learn')).status, 404)
  for (const bad of ['..', '%2e%2e', '..%2F..%2Fetc', 'a%2Fb', '%00']) {
    const res = await call('GET', `/api/record/topics/${bad}/learn`)
    assert.ok([400, 404].includes(res.status), `${bad} → ${res.status}`)
    assert.notEqual(res.status, 200)
  }
  assert.equal((await call('GET', '/api/record/topics/..%2F..%2Fetc/learn')).status, 400)
  assert.equal((await call('POST', '/api/record/items', { kind: 'notes', topicId: '../t-ma' })).status, 400)
  assert.equal((await call('POST', '/api/record/items', { kind: 'notes', topicId: 'evil' })).status, 404)
  assert.equal((await call('GET', '/api/record/mastery?topicId=..')).status, 404)
  // A corrupt learn.json is reported without echoing its content.
  await fs.writeFile(path.join(learn, 't-ai', 'learn.json'), '{"secret note text": oops')
  const broken = await call('GET', '/api/record/topics/t-ai/learn')
  assert.equal(broken.status, 502)
  assert.equal(broken.body.error, 'learn_unreadable')
  assert.ok(!JSON.stringify(broken.body).includes('secret'))
})

test('POST /items: idea pending, video queued without fabricated identity, article / pdf 422, local paths refused', async (t) => {
  const { call } = await world(t)
  const idea = await call('POST', '/api/record/items', { kind: 'idea', text: '均线拐头前，能不能提前判断？' })
  assert.equal(idea.status, 201)
  assertEnvelope(idea.body, 'item')
  assert.equal(idea.body.data.status, 'pending')
  assert.equal(idea.body.data.pipeline.steps.find((s) => s.key === 'extract').state, 'skipped')
  assert.equal((await call('POST', '/api/record/items', { kind: 'idea', text: '长'.repeat(1001) })).body.error, 'text_too_long')
  assert.equal((await call('POST', '/api/record/items', { kind: 'idea', text: '   ' })).status, 422)

  const video = await call('POST', '/api/record/items', { kind: 'video', url: 'https://www.youtube.com/watch?v=abc' })
  assert.equal(video.status, 201)
  assertEnvelope(video.body, 'item')
  assert.equal(video.body.data.pipeline.state, 'queued')
  assert.equal(video.body.data.pipeline.reason, '排队中，本轮不自动解析')
  assert.equal(video.body.data.identity.about, null)
  assert.equal(video.body.data.status, 'organizing')
  assert.equal((await call('POST', `/api/record/items/${video.body.data.id}/organize`)).status, 409)
  for (const url of ['ftp://x.example/v', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', 'C:\\video.mp4']) {
    const res = await call('POST', '/api/record/items', { kind: 'video', url })
    assert.equal(res.status, 422, url)
    assert.equal(res.body.error, 'invalid_url')
  }
  for (const kind of ['article', 'pdf']) {
    const res = await call('POST', '/api/record/items', { kind, url: 'https://x.example' })
    assert.equal(res.status, 422)
    assert.equal(res.body.error, 'unsupported_kind')
  }
  assert.equal((await call('POST', '/api/record/items', { kind: 'notes', topicId: 't-ma', path: '/home/me/notes' })).status, 422)
  assert.equal((await call('POST', '/api/record/items', { kind: 'notes', topicId: 'missing' })).body.error, 'topic_not_found')
  const existing = await call('POST', '/api/record/items', { kind: 'notes', topicId: 't-ma' })
  assert.equal(existing.status, 200, 'topic already registered → returned, not duplicated')
  assert.equal((await call('GET', '/api/record/items?kind=notes')).body.data.length, 3)
  assert.equal((await call('GET', '/api/record/items?kind=video')).body.data.length, 1)
  assert.equal((await call('GET', '/api/record/items?status=pending')).body.data.length, 1)
  assert.equal((await call('GET', '/api/record/items?status=weird')).status, 400)
  assert.equal((await call('GET', '/api/record/items/missing')).status, 404)
})

test('idea flow: attach to a concept → done; shows on the item and the pending count drops', async (t) => {
  const { call } = await world(t)
  const idea = (await call('POST', '/api/record/items', { kind: 'idea', text: '能不能提前判断拐头' })).body.data
  const o = { id: 'o-attach', at: '2026-11-07T10:00:00Z', target: `item:${idea.id}`, op: 'attach_idea', value: { conceptRef: 'concept:t-ma/ma' }, reason: null }
  const res = await call('POST', '/api/record/overrides', o)
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.data.effective, res.body.data.orphaned], [true, false])
  const after = (await call('GET', `/api/record/items/${idea.id}`)).body.data
  assert.equal(after.status, 'done')
  assert.equal(after.identity.relation, '挂到「移动平均」')
  const notesItem = (await call('GET', '/api/record/items?kind=notes')).body.data[0]
  const bad = await call('POST', '/api/record/overrides', { ...o, id: 'o-bad', target: `item:${notesItem.id}` })
  assert.equal(bad.status, 422)
})

test('goals: create, confirm proposal, patch, immutable fields, 404', async (t) => {
  const { call } = await world(t, { RECORD_ORGANIZER: 'mock' })
  // mock organizer (UI dev only) proposes a goal when there are none.
  const proposals = (await call('GET', '/api/record/proposals')).body.data
  assert.ok(proposals.goalProposals.length >= 1)
  const items = (await call('GET', '/api/record/items')).body.data
  assert.ok(items.every((i) => i.identity.by.mock === false), 'identity comes from the compiler, not the mock organizer')
  const log = (await call('GET', '/api/record/changelog')).body.data[0]
  assert.equal(log.organizer.mock, true, 'mock output is marked by.mock')
  const p = proposals.goalProposals[0]
  const created = await call('POST', '/api/record/goals', { ...goalBody('量化交易'), fromProposalId: p.id })
  assert.equal(created.status, 201)
  assert.equal(created.body.data.origin, 'proposed')
  assert.equal((await call('POST', '/api/record/goals', { ...goalBody('again'), fromProposalId: p.id })).status, 409)
  assert.equal((await call('POST', '/api/record/goals', { ...goalBody('x'), fromProposalId: 'nope' })).status, 404)
  assert.equal((await call('POST', '/api/record/goals', { ...goalBody(''), colorKey: 'amber' })).status, 422)
  assert.equal((await call('POST', '/api/record/goals', { ...goalBody('x'), colorKey: 'pink' })).status, 422)
  assert.equal((await call('POST', '/api/record/goals', { ...goalBody('x'), id: 'mine' })).status, 422)
  const id = created.body.data.id
  const patched = await call('PATCH', `/api/record/goals/${id}`, { status: 'paused', folders: ['量化'] })
  assert.equal(patched.status, 200)
  assertEnvelope(patched.body, 'goal')
  assert.equal(patched.body.data.status, 'paused')
  assert.equal((await call('PATCH', `/api/record/goals/${id}`, { ...patched.body.data, title: '新名' })).status, 200, 'unchanged immutable fields may be echoed')
  assert.equal((await call('PATCH', `/api/record/goals/${id}`, { id: 'other' })).body.error, 'immutable_field')
  assert.equal((await call('PATCH', `/api/record/goals/${id}`, { status: 'gone' })).status, 422)
  assert.equal((await call('PATCH', '/api/record/goals/nope', { status: 'done' })).status, 404)
})

test('events: batch ≤ 50, schema / subject checks, since & limit', async (t) => {
  const { call } = await world(t)
  const many = Array.from({ length: 51 }, (_, i) => event('visit', 'concept:t-ma/ma', `2026-11-07T0${i % 10}:00:00Z`))
  assert.equal((await call('POST', '/api/record/events', many)).body.error, 'batch_limit')
  const bad = [
    event('visit', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { durationSec: 2 }),
    event('visit', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { durationSec: 1801 }),
    { ...event('visit', 'concept:t-ma/ma', '2026-11-07T08:00:00Z'), id: 'not-a-uuid' },
    event('recall', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { result: 'maybe' }),
    event('reflection', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { text: 'x'.repeat(1001) }),
    event('question', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { text: 'x'.repeat(501) }),
    event('checklist', 'concept:t-ma/ma', '2026-11-07T08:00:00Z'),
    event('recall', '../../etc', '2026-11-07T08:00:00Z'),
  ]
  for (const e of bad) assert.equal((await call('POST', '/api/record/events', e)).status, 422, JSON.stringify(e).slice(0, 80))
  const good = [
    event('visit', 'concept:t-ma/ma', '2026-11-07T08:00:00Z', { durationSec: 30 }),
    event('recall', 'concept:t-ma/ma', '2026-11-07T08:01:00Z', { result: 'remembered' }),
    event('checklist', 'procitem:t-ma/p1/s1', '2026-11-07T08:02:00Z', { checked: true }),
    event('reflection', 'concept:t-ma/ma', '2026-11-07T08:03:00Z', { text: '我的思考' }),
  ]
  assert.equal((await call('POST', '/api/record/events', good)).status, 200)
  assert.equal((await call('GET', '/api/record/events?since=2026-11-07T08:01:00Z')).body.data.length, 3)
  assert.equal((await call('GET', '/api/record/events?limit=2')).body.data.length, 2)
  assert.equal((await call('GET', '/api/record/events?limit=0')).status, 400)
  assert.equal((await call('GET', '/api/record/events?since=yesterday')).status, 400)
  const learn = (await call('GET', '/api/record/topics/t-ma/learn?tz=UTC')).body.data
  assert.deepEqual(learn.overlay.checklist, { 'procitem:t-ma/p1/s1': true })
  assert.equal(learn.overlay.mastery.find((m) => m.subject === 'concept:t-ma/ma').level, 2)
  const mastery = (await call('GET', '/api/record/mastery?topicId=t-ma&tz=UTC')).body.data
  assert.equal(mastery.length, 5)
})

test('derived endpoints validate query parameters', async (t) => {
  const { call } = await world(t)
  assert.equal((await call('GET', '/api/record/today?tz=Mars/Base')).body.error, 'invalid_tz')
  assert.equal((await call('GET', '/api/record/today?date=2026-13-40&tz=UTC')).status, 400)
  assert.equal((await call('GET', '/api/record/today?date=2026-11-08&tz=UTC')).body.data.date, '2026-11-08')
  assert.equal((await call('GET', '/api/record/stats?range=year&tz=UTC')).status, 400)
  assert.equal((await call('GET', '/api/record/stats?tz=UTC&tz=Asia/Shanghai')).status, 400)
  assert.equal((await call('GET', '/api/record/panorama?goalId=nope&tz=UTC')).status, 404)
  assert.equal((await call('GET', '/api/record/overrides?target=nonsense')).status, 400)
  assert.equal((await call('GET', '/api/record/changelog?itemId=missing')).status, 404)
  assert.equal((await call('POST', '/api/record/changelog/missing/undo')).status, 404)
  assert.equal((await call('GET', '/api/record/nothing-here')).status, 404)
})

test('body limits and malformed JSON; overrides validated against the schema', async (t) => {
  const { call } = await world(t)
  const big = await call('POST', '/api/record/items', JSON.stringify({ kind: 'idea', text: 'x'.repeat(70000) }))
  assert.equal(big.status, 413)
  assert.equal((await call('POST', '/api/record/items', '{oops')).status, 400)
  const base = { id: 'o-x', at: '2026-11-07T10:00:00Z', target: 'concept:t-ma/ma', op: 'hide', value: { hidden: 'yes' }, reason: null }
  assert.equal((await call('POST', '/api/record/overrides', base)).status, 422)
  assert.equal((await call('POST', '/api/record/overrides', { ...base, value: { hidden: true }, target: 'goal:x' })).body.error, 'invalid_target')
  assert.equal((await call('POST', '/api/record/overrides', { ...base, op: 'reassign', target: 'item:x', value: { goalIds: ['ghost'] } })).body.error, 'unknown_goal')
  assert.equal((await call('POST', '/api/record/overrides', { ...base, value: { hidden: true }, sample: true })).status, 422)
})

test('misconfigured record layer answers 503 explicitly; it never falls back', async (t) => {
  const { call } = await startApp(t, { env: { RECORD_ORGANIZER: 'magic', RECORD_DATA_DIR: await tempDir(t) } })
  const res = await call('GET', '/api/record/topics')
  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'record_misconfigured')
  const health = (await call('GET', '/health')).body
  assert.equal(health.record.ready, false)
  assert.match(health.record.reason, /RECORD_ORGANIZER/)
})

test('unconfigured learn dir: empty topics with an explicit reason; nothing written to disk on reads', async (t) => {
  const data = path.join(await tempDir(t), 'record')
  const { call } = await startApp(t, { env: { RECORD_DATA_DIR: data } })
  assert.deepEqual((await call('GET', '/api/record/topics')).body.data, [])
  assert.match((await call('GET', '/health')).body.record.reason, /RECORD_LEARN_DIR/)
  await call('GET', '/api/record/stats?tz=UTC')
  await assert.rejects(fs.stat(data), { code: 'ENOENT' })
})

// A local protocol fixture, not a real model. No API key or external request.
test('assistant: get_learning_record is a read-only server tool returning derived summaries', async (t) => {
  const learn = await tempDir(t)
  const data = await tempDir(t)
  for (const m of standardTopics()) await writeTopic(learn, m)
  const calls = []
  const model = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    calls.push(body)
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const tool = body.messages.find((m) => m.role === 'tool')
    const chunks = !tool ? [
      [{ role: 'assistant', tool_calls: [{ index: 0, id: 'rec', type: 'function', function: { name: 'get_learning_record', arguments: '{"part":"today","tz":"Asia/Shanghai"}' } }] }, null],
      [{}, 'tool_calls'],
    ] : [[{ role: 'assistant', content: '本地协议测试回答' }, null], [{}, 'stop']]
    for (const [delta, finish] of chunks) res.write(`data: ${JSON.stringify({ id: 'f', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise((r) => model.listen(0, '127.0.0.1', r))
  t.after(() => new Promise((r) => { model.closeAllConnections(); model.close(r) }))
  const { call, base } = await startApp(t, {
    env: {
      ASSISTANT_PROVIDER: 'openai-compatible', ASSISTANT_API_KEY: 'local-fixture-not-a-real-key', ASSISTANT_MODEL: 'fixture-model',
      ASSISTANT_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data,
    },
    record: { now: clock('2026-11-07T10:00:00Z') },
  })
  await call('POST', '/api/record/goals', goalBody('量化交易', ['量化']))
  const response = await fetch(`${base}/api/copilotkit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ method: 'agent/run', params: { agentId: 'default' }, body: {
      threadId: randomUUID(), runId: randomUUID(), state: {}, tools: [], forwardedProps: {},
      messages: [{ id: randomUUID(), role: 'user', content: '为什么今天学这个？' }],
      context: [{ description: 'scene', value: JSON.stringify({ schema: 'learning.context/0.2', view: 'today', layer: null, record: { source: 'record', pendingCount: 0 } }) }],
    } }),
    signal: AbortSignal.timeout(15000),
  })
  const stream = await response.text()
  assert.equal(response.status, 200, stream)
  assert.match(stream, /本地协议测试回答/)
  assert.ok(!stream.includes('RUN_ERROR'), stream)
  const first = calls[0]
  assert.ok(first.tools.some((x) => x.function.name === 'get_learning_record'))
  const system = first.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  assert.match(system, /learning\.context\/0\.2/)
  assert.match(system, /open_adjust/)
  const result = JSON.parse(calls[1].messages.find((m) => m.role === 'tool').content)
  assert.equal(result.ok, true)
  assert.equal(result.source, 'record')
  assert.equal(result.data.tz, 'Asia/Shanghai')
  assert.ok(result.data.entries.length > 0)
  assert.ok(result.data.entries.every((e) => typeof e.why === 'string' && e.why.length > 0))
})
