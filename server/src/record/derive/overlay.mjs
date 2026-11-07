/**
 * The single overlay implementation: user Overrides applied on top of the
 * compiled artifacts and the organizer's proposals. The frontend only reads
 * the result.
 *
 * Rules
 * - Overrides are append-only; their order in overrides.jsonl is authoritative
 *   (later wins per target and op family).
 * - `revert{overrideId}` deactivates the referenced override. A revert can
 *   itself be reverted, which re-activates the original.
 * - An override whose target (or referenced assignment / concept / override)
 *   does not exist in the current artifacts is `orphaned`: kept, reported,
 *   and not applied. It becomes effective again if the target reappears.
 */

import { parseRef } from '../ids.mjs'

export function relationKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function conceptExists(topics, refText) {
  const r = parseRef(refText)
  if (!r || r.kind !== 'concept') return false
  const t = topics.get(r.topicId)
  return Boolean(t && t.concepts.has(r.conceptId))
}

export function buildOverlay({ overrides, topics, goals, items, assignments }) {
  const byId = new Map(overrides.map((o) => [o.id, o]))
  const goalIds = new Set(goals.map((g) => g.id))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const assignmentById = new Map(assignments.map((a) => [a.id, a]))
  const topicMap = { get: (id) => topics.get(id) }

  function targetExists(o) {
    const r = parseRef(o.target)
    if (!r) return false
    let ok
    switch (r.kind) {
      case 'goal': ok = goalIds.has(r.goalId); break
      case 'item': ok = itemById.has(r.itemId); break
      case 'topic': ok = Boolean(topicMap.get(r.topicId)); break
      case 'concept': ok = conceptExists(topicMap, o.target); break
      case 'procedure': {
        const t = topicMap.get(r.topicId)
        ok = Boolean(t && t.procedures.has(r.procId))
        break
      }
      case 'procitem': {
        const t = topicMap.get(r.topicId)
        ok = Boolean(t && t.procedures.get(r.procId)?.itemIds.has(r.itemId))
        break
      }
      case 'relation': {
        const t = topicMap.get(r.topicId)
        ok = Boolean(t)
        break
      }
      default: ok = false
    }
    if (!ok) return false
    switch (o.op) {
      case 'accept_assignment':
      case 'reject_assignment':
        return assignmentById.has(o.value.assignmentId)
      case 'attach_idea':
        return conceptExists(topicMap, o.value.conceptRef)
      case 'confirm_relation':
      case 'reject_relation':
        return conceptExists(topicMap, o.value.a) && conceptExists(topicMap, o.value.b)
      case 'revert':
        return byId.has(o.value.overrideId)
      default:
        return true
    }
  }

  const orphanMemo = new Map()
  const isOrphaned = (o) => {
    if (!orphanMemo.has(o.id)) orphanMemo.set(o.id, !targetExists(o))
    return orphanMemo.get(o.id)
  }

  // Reverts targeting each override, in order.
  const revertsOf = new Map()
  for (const o of overrides) {
    if (o.op !== 'revert') continue
    const list = revertsOf.get(o.value.overrideId) || []
    list.push(o)
    revertsOf.set(o.value.overrideId, list)
  }
  const activeMemo = new Map()
  function isActive(o, depth = 0) {
    if (activeMemo.has(o.id)) return activeMemo.get(o.id)
    if (depth > 50) return true
    const reverts = revertsOf.get(o.id) || []
    const value = !reverts.some((r) => r !== o && isActive(r, depth + 1) && !isOrphaned(r))
    activeMemo.set(o.id, value)
    return value
  }

  const status = new Map()
  for (const o of overrides) {
    const active = isActive(o)
    const orphaned = isOrphaned(o)
    status.set(o.id, { active, orphaned, effective: active && !orphaned })
  }

  const labels = new Map()
  const hidden = new Map()
  const pins = new Map()
  const reassign = new Map()
  const decisions = new Map()
  const attachments = new Map()
  const relations = new Map()
  const touched = new Set()

  for (const o of overrides) {
    if (!status.get(o.id).effective || o.op === 'revert') continue
    touched.add(o.target)
    switch (o.op) {
      case 'rename': labels.set(o.target, o.value.label); break
      case 'hide': hidden.set(o.target, o.value.hidden); break
      case 'pin_importance':
        if (o.value.level === null) pins.delete(o.target)
        else pins.set(o.target, o.value.level)
        break
      case 'reassign': reassign.set(parseRef(o.target).itemId, o.value.goalIds); break
      case 'accept_assignment': decisions.set(o.value.assignmentId, 'accepted'); break
      case 'reject_assignment': decisions.set(o.value.assignmentId, 'rejected'); break
      case 'attach_idea': attachments.set(parseRef(o.target).itemId, o.value.conceptRef); break
      case 'confirm_relation':
        relations.set(relationKey(o.value.a, o.value.b), { state: 'confirmed', kind: o.value.kind, a: o.value.a, b: o.value.b })
        break
      case 'reject_relation':
        relations.set(relationKey(o.value.a, o.value.b), { state: 'rejected', a: o.value.a, b: o.value.b })
        break
      default: break
    }
  }

  function assignmentState(a) {
    return decisions.get(a.id) || a.state
  }

  function itemGoalIds(itemId) {
    if (reassign.has(itemId)) return [...new Set(reassign.get(itemId).filter((g) => goalIds.has(g)))]
    const subject = `item:${itemId}`
    const out = []
    for (const a of assignments) {
      if (a.subject !== subject || !a.goalId || !goalIds.has(a.goalId)) continue
      if (assignmentState(a) === 'accepted' && !out.includes(a.goalId)) out.push(a.goalId)
    }
    return out
  }

  /** Organizer decision inputs (learning.organize/0.1 `decisions`). */
  function decisionsFor(subjects) {
    const accepted = []
    const rejected = []
    for (const subject of subjects) {
      const itemId = parseRef(subject)?.itemId
      if (!itemId) continue
      const effective = itemGoalIds(itemId)
      if (effective.length) accepted.push({ subject, goalIds: effective })
      const seen = new Set()
      for (const a of assignments) {
        if (a.subject !== subject || !a.goalId) continue
        const rejectedByUser = assignmentState(a) === 'rejected'
        const droppedByReassign = reassign.has(itemId) && !reassign.get(itemId).includes(a.goalId)
        if ((rejectedByUser || droppedByReassign) && !seen.has(a.goalId)) {
          seen.add(a.goalId)
          rejected.push({ subject, goalId: a.goalId })
        }
      }
    }
    return { accepted, rejected }
  }

  return {
    status: (id) => status.get(id) || { active: false, orphaned: true, effective: false },
    orphaned: () => overrides.filter((o) => status.get(o.id).orphaned),
    label: (subject, fallback) => labels.get(subject) ?? fallback,
    renamed: (subject) => labels.has(subject),
    hidden: (subject) => hidden.get(subject) === true,
    pin: (subject) => pins.get(subject) ?? null,
    touched: (subject) => touched.has(subject),
    hasReassign: (itemId) => reassign.has(itemId),
    assignmentState,
    itemGoalIds,
    decisionsFor,
    attachment: (itemId) => attachments.get(itemId) || null,
    relation: (a, b) => relations.get(relationKey(a, b)) || null,
    confirmedRelations: () => [...relations.values()].filter((r) => r.state === 'confirmed'),
  }
}
