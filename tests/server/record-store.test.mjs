import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createStore, StoreError } from '../../server/src/record/store.mjs'
import { tempDir, startApp, event } from './record-helpers.mjs'

test('json files are replaced atomically and serialized writes do not interleave', async (t) => {
  const dir = await tempDir(t)
  const store = createStore(dir)
  await store.load()
  // Many concurrent read-modify-write sections: every one must be applied.
  await Promise.all(Array.from({ length: 25 }, (_, i) => store.exclusive(async () => {
    await store.replace('goals', [...store.state.goals, { id: `g-${i}` }])
  })))
  assert.equal(store.state.goals.length, 25)
  const files = await fs.readdir(dir)
  assert.deepEqual(files.filter((f) => f.endsWith('.tmp')), [], 'no temp files left behind')
  const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'goals.json'), 'utf8'))
  assert.equal(onDisk.length, 25)
  const reloaded = createStore(dir)
  await reloaded.load()
  assert.equal(reloaded.state.goals.length, 25)
})

test('corrupt jsonl lines are skipped and reported, never truncated; appends start on a new line', async (t) => {
  const dir = await tempDir(t)
  const good = { id: 'e1', at: '2026-11-07T00:00:00Z', kind: 'visit', subject: 'concept:t/c', cardId: null, durationSec: 30 }
  const raw = `${JSON.stringify(good)}\n{broken json\n\n{"no":"id"}\n{"id":"e2","at":"2026-11-07T01:00:00Z"` // last line partial, no newline
  await fs.writeFile(path.join(dir, 'events.jsonl'), raw)
  const store = createStore(dir)
  await store.load()
  assert.deepEqual(store.state.events.map((e) => e.id), ['e1'])
  assert.deepEqual(store.health().corruptLines, { 'events.jsonl': 3 })
  await store.append('events', [{ ...good, id: 'e3' }])
  const text = await fs.readFile(path.join(dir, 'events.jsonl'), 'utf8')
  assert.ok(text.startsWith(raw), 'original content (including bad lines) is preserved')
  const reloaded = createStore(dir)
  await reloaded.load()
  assert.deepEqual(reloaded.state.events.map((e) => e.id), ['e1', 'e3'])
})

test('a corrupt .json file blocks writes instead of being overwritten', async (t) => {
  const dir = await tempDir(t)
  await fs.writeFile(path.join(dir, 'goals.json'), '{not json')
  const store = createStore(dir)
  await store.load()
  assert.deepEqual(store.health().corruptFiles, ['goals.json'])
  await assert.rejects(store.replace('goals', []), (e) => e instanceof StoreError && e.code === 'store_corrupt')
  assert.equal(await fs.readFile(path.join(dir, 'goals.json'), 'utf8'), '{not json')
})

test('corrupt store files are reported by /health', async (t) => {
  const dir = await tempDir(t)
  await fs.writeFile(path.join(dir, 'overrides.jsonl'), 'garbage\n')
  const { call } = await startApp(t, { env: { RECORD_DATA_DIR: dir } })
  const health = (await call('GET', '/health')).body
  assert.equal(health.record.store.corruptLines['overrides.jsonl'], 1)
  assert.match(health.record.reason, /overrides\.jsonl/)
})

test('events are idempotent by id; same id with different content is 409', async (t) => {
  const dir = await tempDir(t)
  const { call } = await startApp(t, { env: { RECORD_DATA_DIR: dir } })
  const e = event('visit', 'concept:t/c', '2026-11-07T08:00:00Z', { durationSec: 40 })
  assert.equal((await call('POST', '/api/record/events', e)).status, 200)
  const again = await call('POST', '/api/record/events', [e, e])
  assert.equal(again.status, 200)
  assert.equal(again.body.data.length, 2, 'submitted events are echoed')
  assert.equal((await call('GET', '/api/record/events')).body.data.length, 1)
  const conflict = await call('POST', '/api/record/events', { ...e, durationSec: 41 })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error, 'event_conflict')
  const lines = (await fs.readFile(path.join(dir, 'events.jsonl'), 'utf8')).trim().split('\n')
  assert.equal(lines.length, 1)
  // A conflicting batch writes nothing, not even its fresh rows.
  const fresh = event('visit', 'concept:t/c', '2026-11-07T09:00:00Z')
  assert.equal((await call('POST', '/api/record/events', [fresh, { ...e, durationSec: 99 }])).status, 409)
  assert.equal((await call('GET', '/api/record/events')).body.data.length, 1)
})

test('overrides are append-only; undo appends a revert', async (t) => {
  const dir = await tempDir(t)
  const { call } = await startApp(t, { env: { RECORD_DATA_DIR: dir } })
  const o1 = { id: 'o-1', at: '2026-11-07T08:00:00Z', target: 'concept:t/c', op: 'rename', value: { label: '新名' }, reason: null }
  const created = await call('POST', '/api/record/overrides', o1)
  assert.equal(created.status, 201)
  assert.equal(created.body.data.orphaned, true, 'target topic does not exist → orphaned but kept')
  assert.equal((await call('POST', '/api/record/overrides', o1)).status, 200, 'same id + same content is idempotent')
  assert.equal((await call('POST', '/api/record/overrides', { ...o1, value: { label: '别的' } })).status, 409)
  const revert = { id: 'o-2', at: '2026-11-07T08:01:00Z', target: 'concept:t/c', op: 'revert', value: { overrideId: 'o-1' }, reason: null }
  assert.equal((await call('POST', '/api/record/overrides', revert)).status, 201)
  const list = (await call('GET', '/api/record/overrides?target=concept:t/c')).body.data
  assert.deepEqual(list.map((r) => r.override.id), ['o-1', 'o-2'])
  assert.equal(list[0].effective, false)
  const lines = (await fs.readFile(path.join(dir, 'overrides.jsonl'), 'utf8')).trim().split('\n')
  assert.equal(lines.length, 2)
})
