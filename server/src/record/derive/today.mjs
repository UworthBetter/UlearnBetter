/**
 * today-v0 (SPRINT_02 「派生规则」). Deterministic, no model calls.
 *
 * 1. Due reviews, most overdue first, at most 3.
 * 2. For each active goal, in goal order, the next level-0 visible concept on
 *    its suggested route (compiled order, not prerequisites); pinned concepts
 *    first. Goals take turns.
 * 3. One started-but-unfinished checklist (most recently touched).
 * At most 5 entries; one slot is kept for the checklist when one exists.
 * Every `why` is assembled from recorded facts only.
 */

import { reviewFacts } from './mastery.mjs'
import { addDays, daysAgoText, diffDays, localDate } from './time.mjs'
import { checklistState } from './view.mjs'

export const MAX_ENTRIES = 5
export const MAX_REVIEWS = 3

function reviewWhy(f, overdue, date, tz) {
  const facts = reviewFacts(f)
  const ago = diffDays(localDate(facts.lastAt, tz), date)
  const when = overdue > 0 ? `已逾期 ${overdue} 天` : '今天到期'
  if (facts.lastResult === 'forgot') return `${daysAgoText(ago)}离星回忆选了「忘了」，按 1 天间隔${when}`
  return `${daysAgoText(ago)}离星回忆选了「记得」（连续 ${facts.run} 次），按 ${facts.interval} 天间隔${when}`
}

export function practiceCandidate(view) {
  const checks = checklistState(view.events)
  let best = null
  for (const topic of view.topics) {
    for (const proc of topic.procedures) {
      if (proc.hidden || !proc.items.length) continue
      let done = 0
      let latest = null
      for (const it of proc.items) {
        const c = checks.get(it.subject)
        if (!c) continue
        if (c.checked) done++
        if (!latest || c.at > latest) latest = c.at
      }
      if (done === 0 || done === proc.items.length) continue
      if (!best || latest > best.latest) best = { topic, proc, done, latest }
    }
  }
  if (!best) return null
  const total = best.proc.items.length
  return {
    kind: 'practice',
    subject: best.proc.subject,
    title: best.proc.title,
    why: `实操清单「${best.proc.title}」已勾选 ${best.done}/${total} 项，还差 ${total - best.done} 项`,
    topicId: best.topic.topicId,
    conceptId: null,
    goalIds: [...best.topic.goalIds],
  }
}

/**
 * @param {object} view  buildView result (events limited to `date`)
 * @param {string} date  'YYYY-MM-DD' in view.tz
 */
export function computeToday(view, date) {
  const tz = view.tz
  const entries = []
  const chosen = new Set()

  // 1. Due reviews.
  const due = []
  for (const topic of view.topics) {
    for (const c of topic.visible) {
      if (!c.mastery.due) continue
      const dueDate = localDate(c.mastery.due, tz)
      if (dueDate > date) continue
      due.push({ topic, c, overdue: diffDays(dueDate, date) })
    }
  }
  due.sort((a, b) => b.overdue - a.overdue || (a.c.subject < b.c.subject ? -1 : 1))
  for (const { topic, c, overdue } of due.slice(0, MAX_REVIEWS)) {
    chosen.add(c.subject)
    entries.push({
      kind: 'review',
      subject: c.subject,
      title: c.label,
      why: reviewWhy(view.facts.get(c.subject), overdue, date, tz),
      topicId: topic.topicId,
      conceptId: c.id,
      goalIds: [...topic.goalIds],
    })
  }

  const practice = practiceCandidate(view)
  const newSlots = MAX_ENTRIES - entries.length - (practice ? 1 : 0)

  // 2. Next new concept per active goal, round robin.
  const queues = []
  for (const goal of view.goals) {
    if (goal.status !== 'active') continue
    const list = []
    for (const topic of view.topics) {
      if (!topic.goalIds.includes(goal.id)) continue
      const route = topic.route
      route.forEach((c, index) => {
        if (c.mastery.level === 0) list.push({ topic, c, position: index + 1, length: route.length })
      })
    }
    // Pinned first (higher importance first); otherwise keep route order.
    list.sort((a, b) => (b.c.pin ?? 0) - (a.c.pin ?? 0))
    queues.push({ goal, list })
  }
  const newEntries = []
  let progressed = true
  while (newEntries.length < newSlots && progressed) {
    progressed = false
    for (const q of queues) {
      if (newEntries.length >= newSlots) break
      while (q.list.length && chosen.has(q.list[0].c.subject)) q.list.shift()
      const next = q.list.shift()
      if (!next) continue
      progressed = true
      chosen.add(next.c.subject)
      let why = `目标「${q.goal.title}」的建议路线（按笔记顺序）里下一颗还没学的星：「${next.topic.title}」第 ${next.position}/${next.length} 颗`
      if (next.c.pin) why += `；你把它的重要性置顶为 ${next.c.pin}`
      newEntries.push({
        kind: 'new',
        subject: next.c.subject,
        title: next.c.label,
        why,
        topicId: next.topic.topicId,
        conceptId: next.c.id,
        goalIds: [...next.topic.goalIds],
      })
    }
  }
  entries.push(...newEntries)
  if (practice && entries.length < MAX_ENTRIES) entries.push(practice)
  return { date, tz, algorithm: 'today-v0', entries }
}

export function todayIn(tz, now = new Date()) {
  return localDate(now, tz)
}

export { addDays }
