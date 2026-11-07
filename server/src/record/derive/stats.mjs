/**
 * Learning statistics (SPRINT_02 「派生规则 · 统计」). Deterministic.
 *
 * - minutes come only from `visit` events
 * - an active day is any day with at least one learning event
 *   (visit / recall / checklist / reflection / question)
 * - streak counts back from today; when today has no activity it counts from
 *   yesterday and `todayDone` is false
 * - days before the first recorded event are `beforeStart`
 * - recallRate = remembered / (remembered + forgot) within the range;
 *   skipped is not counted; null when there is nothing to count
 * - trend (trend-v0): change in average daily minutes versus the previous
 *   window of the same length; null for `all`, or when fewer than 3 days
 *   have passed since the first event
 * - goals: learned = visible concepts at level ≥ 1; history = cumulative
 *   number of concepts with at least one `remembered` recall, per day.
 *   Topics shared by several goals count toward each of them.
 */

import { addDays, diffDays, localDate } from './time.mjs'

export const RANGE_DAYS = { week: 7, month: 30 }
const MAX_ALL_DAYS = 3660

const round1 = (n) => Math.round(n * 10) / 10

export function computeStats(view, { range, today }) {
  const tz = view.tz
  const minutesByDay = new Map()
  const activeDays = new Set()
  let firstDay = null
  const recalls = []
  for (const e of view.events) {
    const day = localDate(e.at, tz)
    if (day > today) continue
    activeDays.add(day)
    if (!firstDay || day < firstDay) firstDay = day
    if (e.kind === 'visit') minutesByDay.set(day, (minutesByDay.get(day) || 0) + e.durationSec / 60)
    if (e.kind === 'recall') recalls.push({ day, subject: e.subject, result: e.result, at: e.at })
  }

  let length = RANGE_DAYS[range]
  if (!length) length = firstDay ? Math.min(diffDays(firstDay, today) + 1, MAX_ALL_DAYS) : 1
  const start = addDays(today, -(length - 1))
  const days = []
  for (let i = 0; i < length; i++) {
    const date = addDays(start, i)
    days.push({ date, minutes: round1(minutesByDay.get(date) || 0), beforeStart: !firstDay || date < firstDay })
  }

  const sumMinutes = (from, to) => {
    let total = 0
    for (const [day, m] of minutesByDay) if (day >= from && day <= to) total += m
    return total
  }
  const weekMinutes = round1(sumMinutes(addDays(today, -6), today))

  const todayDone = activeDays.has(today)
  let streakDays = 0
  for (let d = todayDone ? today : addDays(today, -1); activeDays.has(d); d = addDays(d, -1)) streakDays++

  const inRange = recalls.filter((r) => r.day >= start && r.day <= today)
  const remembered = inRange.filter((r) => r.result === 'remembered').length
  const forgot = inRange.filter((r) => r.result === 'forgot').length
  const recallRate = remembered + forgot ? Math.round((remembered / (remembered + forgot)) * 1000) / 1000 : null

  let trend = null
  if (range !== 'all' && firstDay && diffDays(firstDay, today) + 1 >= 3) {
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(start, -length)
    trend = round1((sumMinutes(start, today) - sumMinutes(prevStart, prevEnd)) / length)
  }

  let learned = 0
  let total = 0
  for (const t of view.topics) {
    for (const c of t.visible) {
      total++
      if (c.mastery.level >= 1) learned++
    }
  }

  // First `remembered` day per concept, for cumulative history.
  const firstRemembered = new Map()
  for (const r of recalls) {
    if (r.result !== 'remembered') continue
    const prev = firstRemembered.get(r.subject)
    if (!prev || r.day < prev) firstRemembered.set(r.subject, r.day)
  }

  const goals = view.goals.map((goal) => {
    const concepts = []
    for (const t of view.topics) if (t.goalIds.includes(goal.id)) concepts.push(...t.visible)
    const learnedG = concepts.filter((c) => c.mastery.level >= 1).length
    const history = days.map((d) => ({
      date: d.date,
      recalled: concepts.filter((c) => {
        const first = firstRemembered.get(c.subject)
        return first && first <= d.date
      }).length,
    }))
    return { goalId: goal.id, title: goal.title, learned: learnedG, total: concepts.length, history }
  })

  const shared = view.topics.filter((t) => t.goalIds.length > 1)
  const sharedTopicsNote = shared.length
    ? shared.map((t) => `「${t.title}」同时计入${t.goalIds.map((g) => `「${view.goalById.get(g)?.title ?? g}」`).join('')}`).join('；')
    : null

  return {
    range, tz, weekMinutes, streakDays, todayDone, learned, total, recallRate, trend, days, goals, sharedTopicsNote,
  }
}
