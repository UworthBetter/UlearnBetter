/**
 * Mastery (SPRINT_02 「派生规则」) and simple-v0 due dates.
 *
 * level 0  not studied
 * level 1  seen: total visit ≥ 20 s, or a card was opened (a visit event
 *          carrying a cardId); also the level right after a `forgot`
 * level 2  recalled: the latest non-skipped recall is `remembered`
 * level 3  stable: the latest non-skipped recall is `remembered` and the
 *          current run of `remembered` (since the last `forgot`) spans at
 *          least two different local dates
 *
 * `skipped` recalls never change level or due; they only show in lastRecall.
 * due (simple-v0): the n-th consecutive `remembered` schedules the next
 * review INTERVALS[n-1] days after it (capped at 30); `forgot` schedules 1 day.
 */

import { localDate } from './time.mjs'

export const INTERVALS = [1, 3, 7, 14, 30]
export const SEEN_SECONDS = 20
const DAY_MS = 86400000

export function emptyMastery(subject) {
  return { subject, level: 0, due: null, visitSeconds: 0, rememberedCount: 0, lastRecall: null }
}

/**
 * Per-subject facts used by the mastery rule and by `why` texts.
 * @returns {Map<string, object>}
 */
export function collectFacts(events) {
  const facts = new Map()
  const get = (subject) => {
    let f = facts.get(subject)
    if (!f) {
      f = { visitSeconds: 0, opened: false, recalls: [] }
      facts.set(subject, f)
    }
    return f
  }
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  for (const e of sorted) {
    if (e.kind === 'visit') {
      const f = get(e.subject)
      f.visitSeconds += e.durationSec
      if (e.cardId) f.opened = true
    } else if (e.kind === 'recall') {
      get(e.subject).recalls.push({ at: e.at, result: e.result })
    }
  }
  return facts
}

export function masteryFromFacts(subject, f, tz) {
  const state = emptyMastery(subject)
  if (!f) return state
  state.visitSeconds = Math.round(f.visitSeconds)
  state.rememberedCount = f.recalls.filter((r) => r.result === 'remembered').length
  state.lastRecall = f.recalls.length ? f.recalls[f.recalls.length - 1].result : null
  const decided = f.recalls.filter((r) => r.result !== 'skipped')
  const last = decided[decided.length - 1]
  const seen = f.visitSeconds >= SEEN_SECONDS || f.opened
  if (!last) {
    state.level = seen ? 1 : 0
    return state
  }
  if (last.result === 'forgot') {
    state.level = 1
    state.due = new Date(Date.parse(last.at) + DAY_MS).toISOString()
    return state
  }
  // Current run of `remembered` since the last forgot.
  let run = 0
  const dates = new Set()
  for (let i = decided.length - 1; i >= 0 && decided[i].result === 'remembered'; i--) {
    run++
    dates.add(localDate(decided[i].at, tz))
  }
  state.level = dates.size >= 2 ? 3 : 2
  const interval = INTERVALS[Math.min(run, INTERVALS.length) - 1]
  state.due = new Date(Date.parse(last.at) + interval * DAY_MS).toISOString()
  return state
}

/** Explanation facts for a due review (used to build `why` strictly from data). */
export function reviewFacts(f) {
  const decided = (f?.recalls || []).filter((r) => r.result !== 'skipped')
  const last = decided[decided.length - 1]
  if (!last) return null
  let run = 0
  for (let i = decided.length - 1; i >= 0 && decided[i].result === 'remembered'; i--) run++
  return { lastResult: last.result, lastAt: last.at, run, interval: last.result === 'forgot' ? 1 : INTERVALS[Math.min(run, INTERVALS.length) - 1] }
}
