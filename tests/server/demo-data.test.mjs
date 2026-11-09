// 预置演示数据的一键加载：时间平移、仓库文件不被修改，以及加载后
// 在「没有模型配置」时用真实记录层后端读出各视图需要的数据，
// 助手入口返回明确的 503（不伪装成 AI 回答）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { addDays, dayDiff, shiftValue, shiftText, prepareDemo, DEMO_RECORD, DEMO_LEARN } from '../../tools/demo/start_demo.mjs'
import { parseEnvFile, stableUuid, rng, at } from '../../tools/demo/build_record.mjs'
import { createApp } from '../../server/src/app.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const TZ = 'Asia/Shanghai'

async function hashTree(dir) {
  const h = createHash('sha256')
  for (const name of (await fs.readdir(dir, { recursive: true })).sort()) {
    const p = path.join(dir, name)
    if ((await fs.stat(p)).isFile()) h.update(name).update(await fs.readFile(p))
  }
  return h.digest('hex')
}

test('date helpers shift ISO timestamps by whole days and keep their format', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(dayDiff('2026-11-06', '2026-12-01'), 25)
  const shifted = shiftValue({ at: '2026-10-14T12:07:00.000Z', local: '2026-10-14T20:07:00+08:00', id: '2026-10-14', n: 3, list: ['x', '2026-10-31T00:00Z'] }, 2)
  assert.deepEqual(shifted, { at: '2026-10-16T12:07:00.000Z', local: '2026-10-16T20:07:00+08:00', id: '2026-10-14', n: 3, list: ['x', '2026-11-02T00:00Z'] })
  const jsonl = '{"at":"2026-10-14T12:00:00.000Z"}\n{"at":"2026-10-15T12:00:00.000Z"}\n'
  assert.equal(shiftText('events.jsonl', jsonl, 1), '{"at":"2026-10-15T12:00:00.000Z"}\n{"at":"2026-10-16T12:00:00.000Z"}\n')
})

test('build helpers: env parsing, deterministic ids and random stream', () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\n B = "two" \nbad line\nC=\'3\'\n'), { A: '1', B: 'two', C: '3' })
  assert.match(stableUuid('visit', 'concept:a/b'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(stableUuid('a', 'b'), stableUuid('a', 'b'))
  const r1 = rng(42), r2 = rng(42)
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()])
  assert.equal(at('2026-10-14', 20 * 60 + 5).toISOString(), '2026-10-14T12:05:00.000Z')
})

test('prepareDemo puts the last study day on yesterday without touching the committed data', async (t) => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ub-demo-'))
  t.after(() => fs.rm(target, { recursive: true, force: true }))
  const before = [await hashTree(DEMO_RECORD), await hashTree(DEMO_LEARN)]
  const meta = JSON.parse(await fs.readFile(path.join(DEMO_RECORD, 'demo-meta.json'), 'utf8'))
  const today = '2027-01-10'
  const { learnDir, dataDir, shiftDays } = await prepareDemo({ target, today })
  assert.equal(shiftDays, dayDiff(meta.anchorDate, '2027-01-09'))
  const events = (await fs.readFile(path.join(dataDir, 'events.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
  const lastLocalDay = new Intl.DateTimeFormat('en-CA', { timeZone: meta.tz }).format(new Date(events.at(-1).at))
  assert.equal(lastLocalDay, '2027-01-09')
  const learn = JSON.parse(await fs.readFile(path.join(learnDir, 'nn-basics', 'learn.json'), 'utf8'))
  const original = JSON.parse(await fs.readFile(path.join(DEMO_LEARN, 'nn-basics', 'learn.json'), 'utf8'))
  assert.equal(learn.topic.generated.at, shiftValue(original.topic.generated.at, shiftDays))
  assert.deepEqual(learn.concepts, original.concepts)
  assert.deepEqual([await hashTree(DEMO_RECORD), await hashTree(DEMO_LEARN)], before)
  const kept = await prepareDemo({ target, today: '2027-02-01', keep: true })
  assert.equal(kept.kept, true)
})

test('loaded demo data serves every view from the real record API with no model configured', async (t) => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'ub-demo-api-'))
  t.after(() => fs.rm(target, { recursive: true, force: true }))
  const today = '2027-01-10'
  const { learnDir, dataDir } = await prepareDemo({ target, today })
  const now = new Date(`${today}T10:00:00+08:00`)
  const { app, ready, reason } = await createApp(
    { RECORD_LEARN_DIR: learnDir, RECORD_DATA_DIR: dataDir, RECORD_ORGANIZER: 'folder' },
    { record: { now: () => now } },
  )
  assert.equal(ready, false)
  assert.match(reason, /ASSISTANT_PROVIDER/)
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  const get = async (p) => {
    const res = await fetch(base + '/api/record' + p + (p.includes('?') ? '&' : '?') + 'tz=' + TZ)
    assert.equal(res.status, 200, p)
    const body = await res.json()
    assert.equal(body.meta.source, 'record')
    return body.data
  }

  const health = await get('/health')
  assert.equal(health.ready, true)
  assert.equal(health.topics, 3)

  const plan = await get('/today')
  assert.equal(plan.date, today)
  assert.ok(plan.entries.length >= 3)
  for (const e of plan.entries) assert.ok(e.why && e.title, JSON.stringify(e))
  assert.ok(plan.entries.some((e) => e.kind === 'review'))
  assert.ok(plan.entries.some((e) => e.kind === 'practice'))

  const stats = await get('/stats?range=month')
  assert.ok(stats.weekMinutes > 0)
  assert.ok(stats.streakDays >= 1)
  assert.equal(stats.todayDone, false)
  assert.ok(stats.recallRate > 0 && stats.recallRate < 1)
  assert.ok(stats.learned > 0 && stats.learned < stats.total)

  const panorama = await get('/panorama')
  assert.equal(panorama.summary.goals, 3)
  assert.equal(panorama.summary.topics, 3)
  assert.ok(panorama.gaps.length >= 1)
  assert.ok(panorama.nextSteps.length >= 1)

  const items = await get('/items')
  assert.equal(items.filter((i) => i.kind === 'notes').length, 3)
  assert.ok(items.filter((i) => i.kind === 'idea').every((i) => i.status === 'done'))
  const video = items.find((i) => i.kind === 'video')
  assert.equal(video.pipeline.state, 'queued')
  assert.equal(video.identity.about, null)
  const notes = items.find((i) => i.kind === 'notes')
  const detail = await get(`/items/${notes.id}`)
  assert.ok(detail.goalIds.length >= 1)
  assert.match(detail.pipeline.steps.find((s) => s.key === 'classify').note, /模型归类/)

  const dive = await get('/topics/nn-basics/learn')
  assert.ok(Object.keys(dive.overlay.ideas).length >= 1, '我的思考 needs attached ideas or reflections')
  assert.ok(Object.values(dive.overlay.mastery).some((m) => m.level >= 2))
  const shapes = new Set(dive.learn.concepts.flatMap((c) => c.blocks.map((b) => b.shape)))
  assert.ok(shapes.has('variation') && shapes.has('structure'))

  const assistant = await fetch(base + '/api/copilotkit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(assistant.status, 503)
})

test('committed demo data is not git-ignored, while secrets and raw subtitles stay ignored', async () => {
  const gitignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8')
  assert.match(gitignore, /^\.env$/m)
  assert.match(gitignore, /^\/ingest\/$/m)
  assert.match(gitignore, /^!\/samples\/demo\/$/m)
})
