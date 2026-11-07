// Hand-written cases for every derivation rule in SPRINT_02 「派生规则」.
// samples/record/demo derived files are NOT used as expected answers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { indexManifest } from '../../server/src/record/topics.mjs'
import { buildOverlay } from '../../server/src/record/derive/overlay.mjs'
import { buildView } from '../../server/src/record/derive/view.mjs'
import { collectFacts, masteryFromFacts } from '../../server/src/record/derive/mastery.mjs'
import { computeToday } from '../../server/src/record/derive/today.mjs'
import { computeStats } from '../../server/src/record/derive/stats.mjs'
import { computePanorama, relationCandidates } from '../../server/src/record/derive/panorama.mjs'
import { normalizeLabel } from '../../server/src/record/ids.mjs'
import { validate } from '../../server/src/record/schemas.mjs'
import { manifest } from './record-helpers.mjs'

const ev = (kind, subject, at, extra = {}) => ({ id: randomUUID(), at, kind, subject, cardId: null, ...extra })
const recall = (subject, at, result) => ev('recall', subject, at, { result })
const visit = (subject, at, durationSec, cardId = null) => ev('visit', subject, at, { durationSec, cardId })

function mastery(events, subject = 'concept:t/c', tz = 'UTC') {
  return masteryFromFacts(subject, collectFacts(events).get(subject), tz)
}

function scenario({ topics, goals = [], items = [], assignments = [], overrides = [], events = [], tz = 'UTC', until }) {
  const entries = topics.map((m) => ({ topicId: m.topic.id, manifest: m, ...indexManifest(m) }))
  const map = new Map(entries.map((e) => [e.topicId, e]))
  const state = { goals, items, derived: { assignments, goalProposals: [], ideaAttachments: [] }, overrides, events, changelog: [] }
  const overlay = buildOverlay({ overrides, topics: map, goals, items, assignments })
  return buildView({ state, topics: entries, overlay, tz, until })
}

const goal = (id, title, status = 'active') => ({ id, title, intent: null, status, origin: 'user', confirmedAt: '2026-11-01T00:00:00Z', colorKey: 'amber', folders: [] })
const notesItem = (id, topicId, addedAt = '2026-11-01T00:00:00Z') => ({ id, kind: 'notes', title: topicId, addedAt, ref: { topicId }, contentHash: 'h', topicId })
const accepted = (id, itemId, goalId) => ({ id, subject: `item:${itemId}`, goalId, confidence: 1, reason: 'test', evidence: [], by: { kind: 'user', name: 't', version: '0', model: null, promptVersion: null, mock: false }, state: 'accepted', autoAccepted: false, changeLogId: 'log-x', createdAt: '2026-11-01T00:00:00Z' })

test('mastery: four levels, card-open counts as seen, forgot returns to 1', () => {
  assert.equal(mastery([]).level, 0)
  assert.equal(mastery([visit('concept:t/c', '2026-11-01T00:00:00Z', 19)]).level, 0, '19 s is not enough')
  assert.equal(mastery([visit('concept:t/c', '2026-11-01T00:00:00Z', 12), visit('concept:t/c', '2026-11-01T01:00:00Z', 8)]).level, 1, 'cumulative 20 s')
  assert.equal(mastery([visit('concept:t/c', '2026-11-01T00:00:00Z', 4, 'card-1')]).level, 1, 'opened a card')
  assert.equal(mastery([recall('concept:t/c', '2026-11-01T00:00:00Z', 'remembered')]).level, 2)
  const sameDay = [recall('concept:t/c', '2026-11-01T01:00:00Z', 'remembered'), recall('concept:t/c', '2026-11-01T05:00:00Z', 'remembered')]
  assert.equal(mastery(sameDay).level, 2, 'two remembered on one date is not stable')
  const twoDays = [recall('concept:t/c', '2026-11-01T01:00:00Z', 'remembered'), recall('concept:t/c', '2026-11-02T01:00:00Z', 'remembered')]
  const stable = mastery(twoDays)
  assert.equal(stable.level, 3)
  assert.equal(stable.rememberedCount, 2)
  const forgot = mastery([...twoDays, recall('concept:t/c', '2026-11-03T01:00:00Z', 'forgot')])
  assert.equal(forgot.level, 1)
  assert.equal(forgot.lastRecall, 'forgot')
  assert.equal(forgot.due, '2026-11-04T01:00:00.000Z', 'forgot → due after 1 day')
  // After a forgot, earlier remembered do not make it stable again.
  assert.equal(mastery([...twoDays, recall('concept:t/c', '2026-11-03T01:00:00Z', 'forgot'), recall('concept:t/c', '2026-11-04T01:00:00Z', 'remembered')]).level, 2)
})

test('mastery: skipped does not change level or due, only lastRecall', () => {
  const base = [recall('concept:t/c', '2026-11-01T00:00:00Z', 'remembered')]
  const withSkip = mastery([...base, recall('concept:t/c', '2026-11-02T00:00:00Z', 'skipped')])
  assert.equal(withSkip.level, 2)
  assert.equal(withSkip.due, mastery(base).due)
  assert.equal(withSkip.lastRecall, 'skipped')
})

test('mastery: "different dates" uses the request tz', () => {
  // 15:00Z and 17:00Z on Nov 1 are Nov 1 23:00 and Nov 2 01:00 in Shanghai.
  const events = [recall('concept:t/c', '2026-11-01T15:00:00Z', 'remembered'), recall('concept:t/c', '2026-11-01T17:00:00Z', 'remembered')]
  assert.equal(mastery(events, 'concept:t/c', 'UTC').level, 2)
  assert.equal(mastery(events, 'concept:t/c', 'Asia/Shanghai').level, 3)
})

test('simple-v0 intervals 1/3/7/14/30 days, capped at 30', () => {
  const days = []
  const events = []
  for (let i = 0; i < 6; i++) {
    const at = `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
    events.push(recall('concept:t/c', at, 'remembered'))
    const due = mastery(events).due
    days.push((Date.parse(due) - Date.parse(at)) / 86400000)
  }
  assert.deepEqual(days, [1, 3, 7, 14, 30, 30])
})

function planWorld() {
  const t1 = manifest({
    id: 't1', title: '主题一',
    concepts: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' }, { id: 'f', label: 'F' }],
    procedures: [{ id: 'p', title: '清单', items: [{ id: 'x', text: 'x' }, { id: 'y', text: 'y' }, { id: 'z', text: 'z' }] }],
  })
  const t2 = manifest({ id: 't2', title: '主题二', concepts: [{ id: 'm', label: 'M' }, { id: 'n', label: 'N' }, { id: 'o', label: 'O' }] })
  return {
    topics: [t1, t2],
    goals: [goal('g1', '目标一'), goal('g2', '目标二'), goal('g3', '暂停的', 'paused')],
    items: [notesItem('i1', 't1'), notesItem('i2', 't2', '2026-11-02T00:00:00Z')],
    assignments: [accepted('a1', 'i1', 'g1'), accepted('a2', 'i2', 'g2'), accepted('a3', 'i2', 'g3')],
  }
}

test('today-v0: reviews by overdue desc (max 3), round-robin new per goal, pinned first, hidden skipped, one practice, ≤ 5', () => {
  const w = planWorld()
  const events = [
    // four due reviews (forgot → due next day); overdue on 11-07: a 5, b 3, c 1, m 0 days
    recall('concept:t1/a', '2026-11-01T09:00:00Z', 'forgot'),
    recall('concept:t1/b', '2026-11-03T09:00:00Z', 'forgot'),
    recall('concept:t1/c', '2026-11-05T09:00:00Z', 'forgot'),
    recall('concept:t2/m', '2026-11-06T09:00:00Z', 'forgot'),
    ev('checklist', 'procitem:t1/p/x', '2026-11-06T10:00:00Z', { checked: true }),
  ]
  const overrides = [
    { id: 'o1', at: '2026-11-06T00:00:00Z', target: 'concept:t1/d', op: 'hide', value: { hidden: true }, reason: null },
    { id: 'o2', at: '2026-11-06T00:00:00Z', target: 'concept:t2/o', op: 'pin_importance', value: { level: 3 }, reason: null },
  ]
  const view = scenario({ ...w, events, overrides, until: '2026-11-07' })
  const plan = computeToday(view, '2026-11-07')
  assert.ok(validate('today', plan).ok, validate('today', plan).message)
  assert.equal(plan.entries.length, 5)
  assert.deepEqual(plan.entries.map((e) => `${e.kind}:${e.subject}`), [
    'review:concept:t1/a', 'review:concept:t1/b', 'review:concept:t1/c',
    'new:concept:t1/e', // g1: d is hidden, e is next level-0 on route
    'practice:procedure:t1/p',
  ])
  assert.equal(plan.entries[0].why, '6 天前离星回忆选了「忘了」，按 1 天间隔已逾期 5 天')
  assert.match(plan.entries[3].why, /^目标「目标一」的建议路线（按笔记顺序）里下一颗还没学的星：「主题一」第 \d\/\d 颗$/)
  assert.equal(plan.entries[4].why, '实操清单「清单」已勾选 1/3 项，还差 2 项')

  // Without reviews, goals alternate and g2's pinned concept comes first.
  const view2 = scenario({ ...w, overrides, until: '2026-11-07' })
  const plan2 = computeToday(view2, '2026-11-07')
  assert.deepEqual(plan2.entries.map((e) => e.subject), ['concept:t1/a', 'concept:t2/o', 'concept:t1/b', 'concept:t2/m', 'concept:t1/c'])
  assert.match(plan2.entries[1].why, /你把它的重要性置顶为 3$/)
  assert.deepEqual(plan2.entries[1].goalIds, ['g2', 'g3'])
})

test('today-v0: a remembered review explains its streak and interval; due in the future is not listed', () => {
  const w = planWorld()
  const events = [recall('concept:t1/a', '2026-11-04T09:00:00Z', 'remembered'), recall('concept:t1/a', '2026-11-05T09:00:00Z', 'remembered'), recall('concept:t1/b', '2026-11-07T08:00:00Z', 'remembered')]
  const plan = computeToday(scenario({ ...w, events, until: '2026-11-08' }), '2026-11-08')
  const reviews = plan.entries.filter((e) => e.kind === 'review')
  assert.deepEqual(reviews.map((e) => e.subject), ['concept:t1/a', 'concept:t1/b'])
  assert.equal(reviews[0].why, '3 天前离星回忆选了「记得」（连续 2 次），按 3 天间隔今天到期')
  assert.equal(reviews[1].why, '昨天离星回忆选了「记得」（连续 1 次），按 1 天间隔今天到期')
  const earlier = computeToday(scenario({ ...w, events, until: '2026-11-07' }), '2026-11-07')
  assert.equal(earlier.entries.filter((e) => e.kind === 'review').length, 0)
})

test('stats: streak (today 0 → from yesterday), beforeStart, recall rate ignores skipped, trend null under 3 days', () => {
  const w = planWorld()
  const events = [
    visit('concept:t1/a', '2026-11-05T10:00:00Z', 600),
    visit('concept:t1/b', '2026-11-06T10:00:00Z', 300),
    recall('concept:t1/a', '2026-11-06T10:05:00Z', 'remembered'),
    recall('concept:t1/b', '2026-11-06T10:06:00Z', 'remembered'),
    recall('concept:t1/c', '2026-11-06T10:07:00Z', 'forgot'),
    recall('concept:t1/e', '2026-11-06T10:08:00Z', 'skipped'),
    recall('concept:t1/f', '2026-11-06T10:09:00Z', 'skipped'),
  ]
  const view = scenario({ ...w, events, until: '2026-11-07' })
  const s = computeStats(view, { range: 'week', today: '2026-11-07' })
  assert.ok(validate('stats', s).ok, validate('stats', s).message)
  assert.equal(s.todayDone, false)
  assert.equal(s.streakDays, 2)
  assert.equal(s.weekMinutes, 15)
  assert.equal(s.recallRate, 0.667)
  assert.equal(s.trend, 2.1, '3 days since start (11-05..11-07): trend is defined')
  assert.deepEqual(s.days.map((d) => d.beforeStart), [true, true, true, true, false, false, false])
  assert.deepEqual(s.days.slice(-3).map((d) => d.minutes), [10, 5, 0])

  const young = computeStats(scenario({ ...w, events: events.slice(1), until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(young.trend, null, 'only 2 days since the first event')

  const withToday = computeStats(scenario({ ...w, events: [...events, visit('concept:t1/a', '2026-11-07T01:00:00Z', 60)], until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(withToday.streakDays, 3)
  assert.equal(withToday.todayDone, true)

  const empty = computeStats(scenario({ ...w, until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(empty.recallRate, null)
  assert.equal(empty.streakDays, 0)
  assert.ok(empty.days.every((d) => d.beforeStart))
})

test('stats: shared topic counts toward each goal and is noted; hidden concepts are excluded', () => {
  const w = planWorld()
  const overrides = [{ id: 'o1', at: '2026-11-06T00:00:00Z', target: 'concept:t2/n', op: 'hide', value: { hidden: true }, reason: null }]
  const events = [visit('concept:t2/m', '2026-11-06T10:00:00Z', 30), recall('concept:t2/m', '2026-11-06T10:01:00Z', 'remembered')]
  const s = computeStats(scenario({ ...w, overrides, events, until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(s.total, 8, '6 + 3 concepts minus one hidden')
  const g2 = s.goals.find((g) => g.goalId === 'g2')
  const g3 = s.goals.find((g) => g.goalId === 'g3')
  assert.deepEqual([g2.learned, g2.total], [1, 2])
  assert.deepEqual([g3.learned, g3.total], [1, 2])
  assert.equal(g2.history.at(-1).recalled, 1)
  assert.equal(g2.history.at(-3).recalled, 0)
  assert.equal(s.sharedTopicsNote, '「主题二」同时计入「目标二」「暂停的」')
})

test('day aggregation follows tz', () => {
  const w = planWorld()
  const events = [visit('concept:t1/a', '2026-11-06T20:00:00Z', 120)]
  const shanghai = computeStats(scenario({ ...w, events, tz: 'Asia/Shanghai', until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(shanghai.days.at(-1).minutes, 2)
  assert.equal(shanghai.todayDone, true)
  const utc = computeStats(scenario({ ...w, events, until: '2026-11-07' }), { range: 'week', today: '2026-11-07' })
  assert.equal(utc.days.at(-2).minutes, 2)
  assert.equal(utc.todayDone, false)
})

test('gaps: group with ≥ 3 visible concepts all at level 0; hidden concepts do not count', () => {
  const m = manifest({
    id: 't', title: 'T',
    concepts: [
      { id: 'a1', label: 'a1', group: 'G3' }, { id: 'a2', label: 'a2', group: 'G3' }, { id: 'a3', label: 'a3', group: 'G3' },
      { id: 'b1', label: 'b1', group: 'G2' }, { id: 'b2', label: 'b2', group: 'G2' },
      { id: 'c1', label: 'c1', group: 'Gl' }, { id: 'c2', label: 'c2', group: 'Gl' }, { id: 'c3', label: 'c3', group: 'Gl' },
      { id: 'd1', label: 'd1', group: 'Gh' }, { id: 'd2', label: 'd2', group: 'Gh' }, { id: 'd3', label: 'd3', group: 'Gh' },
    ],
  })
  const overrides = [{ id: 'o', at: '2026-11-06T00:00:00Z', target: 'concept:t/d3', op: 'hide', value: { hidden: true }, reason: null }]
  const events = [visit('concept:t/c1', '2026-11-06T00:00:00Z', 30)]
  const view = scenario({ topics: [m], overrides, events })
  const p = computePanorama(view, { today: computeToday(view, '2026-11-07'), goalId: undefined })
  assert.ok(validate('panorama', p).ok, validate('panorama', p).message)
  assert.deepEqual(p.gaps.map((g) => [g.group, g.count]), [['G3', 3]])
  assert.equal(p.gaps[0].why, '「T」的分组「G3」共 3 颗星，都还没学')
  assert.equal(p.summary.concepts, 10)
  assert.equal(p.summary.unassigned, 1)
})

test('panorama next steps are the first three of today; same-name candidates are proposed, not merged', () => {
  const t1 = manifest({ id: 't1', title: '一', concepts: [{ id: 'x', label: '金叉（MA）' }, { id: 'y', label: 'ＭＣＰ ' }] })
  const t2 = manifest({ id: 't2', title: '二', concepts: [{ id: 'x2', label: '金 叉' }, { id: 'y2', label: 'mcp' }, { id: 'z', label: '别的' }] })
  const w = { topics: [t1, t2], goals: [goal('g1', '目标')], items: [notesItem('i1', 't1'), notesItem('i2', 't2')], assignments: [accepted('a1', 'i1', 'g1'), accepted('a2', 'i2', 'g1')] }
  const view = scenario(w)
  const today = computeToday(view, '2026-11-07')
  const p = computePanorama(view, { today, goalId: undefined })
  assert.deepEqual(p.nextSteps, today.entries.slice(0, 3))
  const pairs = p.relationCandidates.map((r) => [r.a, r.b, r.kind, r.confirmed])
  assert.deepEqual(pairs, [
    ['concept:t1/x', 'concept:t2/x2', 'same_label', false],
    ['concept:t1/y', 'concept:t2/y2', 'same_label', false],
  ])
  assert.equal(p.summary.concepts, 5, 'candidates are not merged')
  assert.equal(normalizeLabel('双均线系统（MA+EMA）'), normalizeLabel('双均线系统'))
  // Confirm one, reject the other.
  const overrides = [
    { id: 'o1', at: '2026-11-07T00:00:00Z', target: 'concept:t1/x', op: 'confirm_relation', value: { a: 'concept:t2/x2', b: 'concept:t1/x', kind: 'related' }, reason: null },
    { id: 'o2', at: '2026-11-07T00:00:00Z', target: 'concept:t1/y', op: 'reject_relation', value: { a: 'concept:t1/y', b: 'concept:t2/y2' }, reason: null },
  ]
  const decided = relationCandidates(scenario({ ...w, overrides }))
  assert.deepEqual(decided.map((r) => [r.a, r.kind, r.confirmed]), [['concept:t1/x', 'related', true]])
})
