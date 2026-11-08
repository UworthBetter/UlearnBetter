/**
 * Panorama: goals → topics → groups → concepts, plus gaps, next steps,
 * relation candidates and summary counts. Deterministic.
 *
 * - gap: a group with at least 3 visible concepts, all at level 0
 * - next steps: the first 3 entries of today's plan
 * - relations: only same-name candidates (pending, dashed) and relations the
 *   user confirmed. Same-name = labels equal after normalizeLabel across
 *   different topics; candidates are never merged.
 */

import { normalizeLabel, shortHash } from '../ids.mjs'
import { relationKey } from './overlay.mjs'

export const GAP_MIN = 3
export const UNGROUPED = '未分组'

export function topicGroups(topic, { includeHidden = false } = {}) {
  const groups = []
  const placed = new Set()
  for (const g of topic.entry.manifest.groups) {
    const concepts = g.conceptIds
      .map((id) => topic.conceptById.get(id))
      .filter((c) => c && !placed.has(c.id) && (includeHidden || !c.hidden))
    concepts.forEach((c) => placed.add(c.id))
    groups.push({ name: g.name, concepts })
  }
  const rest = new Map()
  for (const c of topic.concepts) {
    if (placed.has(c.id) || (!includeHidden && c.hidden)) continue
    const name = c.group || UNGROUPED
    if (!rest.has(name)) rest.set(name, [])
    rest.get(name).push(c)
  }
  for (const [name, concepts] of rest) {
    const existing = groups.find((g) => g.name === name)
    if (existing) existing.concepts.push(...concepts)
    else groups.push({ name, concepts })
  }
  return groups.filter((g) => g.concepts.length)
}

/** Same-name candidates and user-confirmed relations. */
export function relationCandidates(view, { includeConfirmed = true } = {}) {
  const byName = new Map()
  for (const t of view.topics) {
    for (const c of t.visible) {
      const key = normalizeLabel(c.label)
      if (!key) continue
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push({ t, c })
    }
  }
  const out = []
  const seen = new Set()
  for (const list of byName.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]
        const y = list[j]
        if (x.t.topicId === y.t.topicId) continue
        const [p, q] = x.c.subject < y.c.subject ? [x, y] : [y, x]
        const key = relationKey(p.c.subject, q.c.subject)
        if (seen.has(key)) continue
        seen.add(key)
        const decision = view.overlay.relation(p.c.subject, q.c.subject)
        if (decision?.state === 'rejected') continue
        if (decision?.state === 'confirmed' && !includeConfirmed) continue
        out.push({
          id: `rc-${shortHash(key)}`,
          a: p.c.subject,
          b: q.c.subject,
          kind: decision?.state === 'confirmed' ? decision.kind : 'same_label',
          reason: `「${p.c.label}」（${p.t.title}）与「${q.c.label}」（${q.t.title}）规范化后同名；只作候选，未合并`,
          confirmed: decision?.state === 'confirmed',
        })
      }
    }
  }
  if (includeConfirmed) {
    for (const r of view.overlay.confirmedRelations()) {
      const key = relationKey(r.a, r.b)
      if (seen.has(key)) continue
      seen.add(key)
      const [a, b] = r.a < r.b ? [r.a, r.b] : [r.b, r.a]
      out.push({ id: `rc-${shortHash(key)}`, a, b, kind: r.kind, reason: '你确认过的关联', confirmed: true })
    }
  }
  return out
}

export function computePanorama(view, { today, goalId }) {
  const goals = goalId ? view.goals.filter((g) => g.id === goalId) : view.goals
  const topics = goalId ? view.topics.filter((t) => t.goalIds.includes(goalId)) : view.topics
  const plannedIn = new Map()
  for (const e of today.entries) if (e.conceptId) plannedIn.set(`${e.topicId}/${e.conceptId}`, e)

  const gaps = []
  const outTopics = topics.map((t) => {
    const groups = topicGroups(t)
    for (const g of groups) {
      if (g.concepts.length >= GAP_MIN && g.concepts.every((c) => c.mastery.level === 0)) {
        const planned = g.concepts.filter((c) => plannedIn.has(`${t.topicId}/${c.id}`)).map((c) => `「${c.label}」`)
        gaps.push({
          topicId: t.topicId,
          group: g.name,
          count: g.concepts.length,
          why: `「${t.title}」的分组「${g.name}」共 ${g.concepts.length} 颗星，都还没学${planned.length ? `；其中${planned.join('')}已排进今天` : ''}`,
        })
      }
    }
    return {
      topicId: t.topicId,
      title: t.title,
      goalIds: [...t.goalIds],
      groups: groups.map((g) => ({
        name: g.name,
        concepts: g.concepts.map((c) => ({ id: c.id, label: c.label, level: c.mastery.level, due: c.mastery.due, importance: c.importance })),
      })),
    }
  })

  const concepts = topics.flatMap((t) => t.visible)
  const nextSteps = (goalId ? today.entries.filter((e) => e.goalIds.includes(goalId)) : today.entries).slice(0, 3)
  const topicIds = new Set(topics.map((t) => t.topicId))
  return {
    relations: topics.flatMap(t => (t.entry.compiledRelations || []).filter(r => t.visible.some(c=>c.id===r.a) && t.visible.some(c=>c.id===r.b)).map(r=>({a:`concept:${t.topicId}/${r.a}`,b:`concept:${t.topicId}/${r.b}`,kind:r.kind}))),
    goals: goals.map((goal) => ({ goal, topicIds: view.topics.filter((t) => t.goalIds.includes(goal.id)).map((t) => t.topicId) })),
    topics: outTopics,
    gaps,
    nextSteps,
    relationCandidates: relationCandidates(view).filter((r) => {
      const ta = r.a.slice('concept:'.length).split('/')[0]
      const tb = r.b.slice('concept:'.length).split('/')[0]
      return topicIds.has(ta) || topicIds.has(tb)
    }),
    summary: {
      goals: goals.length,
      topics: topics.length,
      concepts: concepts.length,
      learned: concepts.filter((c) => c.mastery.level >= 1).length,
      recalled: concepts.filter((c) => c.mastery.level >= 2).length,
      stable: concepts.filter((c) => c.mastery.level === 3).length,
      unassigned: view.topics.filter((t) => t.goalIds.length === 0).length,
    },
  }
}
