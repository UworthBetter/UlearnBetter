import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tempDir, writeTopic, standardTopics, startApp, clock, manifest } from './record-helpers.mjs'

let seq = 0
const override = (target, op, value) => ({ id: `o-${++seq}`, at: '2026-11-07T09:00:00Z', target, op, value, reason: null })

async function world(t, organizer = 'folder', dirs) {
  const learn = dirs?.learn ?? await tempDir(t)
  const data = dirs?.data ?? await tempDir(t)
  if (!dirs) for (const m of standardTopics()) await writeTopic(learn, m)
  const app = await startApp(t, { env: { RECORD_LEARN_DIR: learn, RECORD_DATA_DIR: data, RECORD_ORGANIZER: organizer }, record: { now: clock('2026-11-07T10:00:00Z') } })
  return { ...app, learn, data }
}

const itemFor = async (call, topicId) => (await call('GET', '/api/record/items?kind=notes')).body.data.find((i) => i.topicId === topicId)

test('rename / hide / pin are applied by the backend overlay', async (t) => {
  const { call } = await world(t)
  await call('POST', '/api/record/overrides', override('concept:t-ma/ma', 'rename', { label: '简单移动平均' }))
  await call('POST', '/api/record/overrides', override('concept:t-ma/ema', 'hide', { hidden: true }))
  await call('POST', '/api/record/overrides', override('concept:t-ma/slope', 'pin_importance', { level: 3 }))
  await call('POST', '/api/record/overrides', override('topic:t-ma', 'rename', { label: '均线（改名）' }))
  const learn = (await call('GET', '/api/record/topics/t-ma/learn?tz=UTC')).body.data
  assert.deepEqual(learn.overlay.renames, { ma: '简单移动平均' })
  assert.deepEqual(learn.overlay.hidden, ['ema'])
  assert.deepEqual(learn.overlay.pins, { slope: 3 })
  assert.equal(learn.learn.concepts.find((c) => c.id === 'ma').label, '移动平均', 'learn is the compiled original')
  const topics = (await call('GET', '/api/record/topics')).body.data
  const ma = topics.find((x) => x.topicId === 't-ma')
  assert.equal(ma.title, '均线（改名）')
  assert.equal(ma.conceptCount, 4)
  const pano = (await call('GET', '/api/record/panorama?tz=UTC')).body.data
  const concepts = pano.topics.find((x) => x.topicId === 't-ma').groups.flatMap((g) => g.concepts)
  assert.equal(concepts.find((c) => c.id === 'ma').label, '简单移动平均')
  assert.equal(concepts.some((c) => c.id === 'ema'), false)
  assert.equal(concepts.find((c) => c.id === 'slope').importance, 3)
  const item = await itemFor(call, 't-ma')
  const detail = (await call('GET', `/api/record/items/${item.id}`)).body.data
  const flagged = detail.groups.flatMap((g) => g.concepts).filter((c) => c.overridden).map((c) => c.id).sort()
  assert.deepEqual(flagged, ['ema', 'ma', 'slope'], 'detail lists hidden concepts too, flagged as overridden')
})

test('reassign is authoritative over organizer assignments; revert restores', async (t) => {
  const { call } = await world(t)
  const quant = (await call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: ['量化'] })).body.data
  const ai = (await call('POST', '/api/record/goals', { title: 'AI', intent: null, status: 'active', origin: 'user', colorKey: 'cyan', folders: [] })).body.data
  let item = await itemFor(call, 't-ma')
  assert.deepEqual(item.goalIds, [quant.id], 'folder 0.9 ≥ 0.85 → auto-accepted')
  const o = override(`item:${item.id}`, 'reassign', { goalIds: [ai.id] })
  const res = await call('POST', '/api/record/overrides', o)
  assert.equal(res.body.data.effective, true)
  item = await itemFor(call, 't-ma')
  assert.deepEqual(item.goalIds, [ai.id])
  // Re-organizing does not bring the dropped goal back as a proposal.
  await call('POST', `/api/record/items/${item.id}/organize`)
  assert.deepEqual((await itemFor(call, 't-ma')).goalIds, [ai.id])
  assert.equal((await call('GET', '/api/record/proposals')).body.data.assignments.length, 0)
  await call('POST', '/api/record/overrides', override(`item:${item.id}`, 'revert', { overrideId: o.id }))
  assert.deepEqual((await itemFor(call, 't-ma')).goalIds, [quant.id])
})

test('a concept removed by recompilation orphans its override; restoring it re-applies', async (t) => {
  const { call, learn } = await world(t)
  await call('POST', '/api/record/overrides', override('concept:t-ma/cross', 'rename', { label: '黄金交叉' }))
  const before = (await call('GET', '/api/record/overrides?target=concept:t-ma/cross')).body.data[0]
  assert.deepEqual([before.effective, before.orphaned], [true, false])
  const original = standardTopics()[0]
  const changed = manifest({
    id: 't-ma', title: '均线入门', folderHint: '量化', contentHash: 'sha1:bbb',
    concepts: original.concepts.filter((c) => c.id !== 'cross').map((c) => ({ id: c.id, label: c.label, group: c.group })),
  })
  // mtime resolution: make sure the rewrite is visible to the cache key.
  await new Promise((r) => setTimeout(r, 20))
  await writeTopic(learn, changed)
  const after = (await call('GET', '/api/record/overrides?target=concept:t-ma/cross')).body.data[0]
  assert.deepEqual([after.effective, after.orphaned], [false, true])
  const item = await itemFor(call, 't-ma')
  const detail = (await call('GET', `/api/record/items/${item.id}`)).body.data
  assert.deepEqual(detail.orphaned.map((o) => o.target), ['concept:t-ma/cross'])
  assert.equal(detail.contentHash, 'sha1:bbb')
  assert.match(detail.pipeline.steps.find((s) => s.key === 'compile').note, /笔记已更新/)
  await new Promise((r) => setTimeout(r, 20))
  await writeTopic(learn, original)
  const restored = (await call('GET', '/api/record/overrides?target=concept:t-ma/cross')).body.data[0]
  assert.deepEqual([restored.effective, restored.orphaned], [true, false])
})

test('recompiling a topic keeps a user-changed assignment', async (t) => {
  const { call, learn } = await world(t)
  const quant = (await call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: ['量化'] })).body.data
  const other = (await call('POST', '/api/record/goals', { title: '别的', intent: null, status: 'active', origin: 'user', colorKey: 'violet', folders: [] })).body.data
  const item = await itemFor(call, 't-trend')
  await call('POST', '/api/record/overrides', override(`item:${item.id}`, 'reassign', { goalIds: [quant.id, other.id] }))
  await new Promise((r) => setTimeout(r, 20))
  await writeTopic(learn, { ...standardTopics()[1], contentHash: 'sha1:new' })
  const after = await itemFor(call, 't-trend')
  assert.deepEqual(after.goalIds, [quant.id, other.id])
  assert.equal(after.contentHash, 'sha1:new')
})

test('switching organizer folder → null → folder keeps accepted assignments', async (t) => {
  const first = await world(t, 'folder')
  const quant = (await first.call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: ['量化'] })).body.data
  const ma = await itemFor(first.call, 't-ma')
  assert.deepEqual(ma.goalIds, [quant.id])
  // Accept the auto-accepted one explicitly as well for the trend topic.
  const auto = (await first.call('GET', '/api/record/proposals')).body.data.autoAccepted
  assert.equal(auto.length, 2)
  const trend = await itemFor(first.call, 't-trend')
  const a = auto.find((x) => x.subject === `item:${trend.id}`)
  await first.call('POST', '/api/record/overrides', override(`item:${trend.id}`, 'accept_assignment', { assignmentId: a.id }))

  const second = await world(t, 'null', { learn: first.learn, data: first.data })
  for (const id of [ma.id, trend.id]) {
    const log = await second.call('POST', `/api/record/items/${id}/organize`)
    assert.equal(log.status, 201)
    assert.equal(log.body.data.organizer.name, 'null')
  }
  assert.deepEqual((await itemFor(second.call, 't-ma')).goalIds, [quant.id])
  assert.deepEqual((await itemFor(second.call, 't-trend')).goalIds, [quant.id])

  const third = await world(t, 'folder', { learn: first.learn, data: first.data })
  await third.call('POST', `/api/record/items/${ma.id}/organize`)
  assert.deepEqual((await itemFor(third.call, 't-ma')).goalIds, [quant.id])
  const assignments = JSON.parse(await fs.readFile(path.join(first.data, 'assignments.json'), 'utf8')).assignments
  assert.equal(assignments.filter((x) => x.subject === `item:${ma.id}` && x.goalId === quant.id).length, 1, 'no duplicate for an accepted pair')
})

test('undoing a ChangeLog rejects its assignments and is not repeatable', async (t) => {
  const { call } = await world(t)
  await call('POST', '/api/record/goals', { title: '量化交易', intent: null, status: 'active', origin: 'user', colorKey: 'amber', folders: ['量化'] })
  const item = await itemFor(call, 't-ma')
  const logs = (await call('GET', `/api/record/changelog?itemId=${item.id}`)).body.data
  const log = logs.find((l) => l.changes.some((c) => c.state === 'accepted'))
  const undone = await call('POST', `/api/record/changelog/${log.id}/undo`)
  assert.equal(undone.status, 200)
  assert.equal(undone.body.data.undone, true)
  assert.ok(undone.body.data.changes.every((c) => c.state === 'rejected'))
  assert.deepEqual((await itemFor(call, 't-ma')).goalIds, [])
  assert.equal((await call('POST', `/api/record/changelog/${log.id}/undo`)).status, 409)
  // The rejected pair is not proposed again.
  await call('POST', `/api/record/items/${item.id}/organize`)
  assert.deepEqual((await itemFor(call, 't-ma')).goalIds, [])
  const overrides = (await call('GET', `/api/record/overrides?target=item:${item.id}`)).body.data
  assert.ok(overrides.some((o) => o.override.op === 'reject_assignment'))
})
