/**
 * Assemble the overlaid view every derivation reads: topics with their
 * effective (renamed / hidden / pinned) concepts, topic → goal membership and
 * per-concept mastery. Pure function of store state + topic index.
 */

import { ref } from '../ids.mjs'
import { collectFacts, masteryFromFacts } from './mastery.mjs'
import { localDate } from './time.mjs'

/**
 * @param {object} p
 * @param {object} p.state       store.state
 * @param {object[]} p.topics    topic index entries
 * @param {object} p.overlay     buildOverlay result
 * @param {string} p.tz
 * @param {string} [p.until]     include only events on or before this local date
 */
export function buildView({ state, topics, overlay, tz, until }) {
  const events = until ? state.events.filter((e) => localDate(e.at, tz) <= until) : state.events
  const facts = collectFacts(events)
  const goals = state.goals
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const itemByTopic = new Map()
  for (const item of state.items) {
    if (item.kind === 'notes' && item.topicId && !itemByTopic.has(item.topicId)) itemByTopic.set(item.topicId, item)
  }

  const viewTopics = []
  for (const entry of topics) {
    const topicId = entry.topicId
    const topicRef = ref.topic(topicId)
    if (overlay.hidden(topicRef)) continue
    const item = itemByTopic.get(topicId) || null
    const goalIds = item ? overlay.itemGoalIds(item.id) : []
    const concepts = [...entry.manifest.concepts]
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const subject = ref.concept(topicId, c.id)
        const pin = overlay.pin(subject)
        return {
          id: c.id,
          subject,
          label: overlay.label(subject, c.label),
          originalLabel: c.label,
          aliases: c.aliases,
          group: c.group,
          order: c.order,
          importance: pin ?? c.importanceHint ?? 1, // Neutral minimum display size when no hint exists.
          pin,
          hidden: overlay.hidden(subject),
          mastery: masteryFromFacts(subject, facts.get(subject), tz),
        }
      })
    const conceptById = new Map(concepts.map((c) => [c.id, c]))
    const procedures = entry.manifest.procedures.map((p) => {
      const subject = ref.procedure(topicId, p.id)
      return {
        id: p.id,
        subject,
        title: overlay.label(subject, p.title),
        hidden: overlay.hidden(subject),
        items: p.items.map((it) => ({ id: it.id, subject: ref.procitem(topicId, p.id, it.id), text: it.text })),
      }
    })
    viewTopics.push({
      topicId,
      entry,
      item,
      title: overlay.label(topicRef, entry.manifest.topic.title),
      goalIds,
      concepts,
      conceptById,
      visible: concepts.filter((c) => !c.hidden),
      route: entry.route.map((id) => conceptById.get(id)).filter((c) => c && !c.hidden),
      procedures,
    })
  }
  // Topics follow the order their notes items were added, then id.
  viewTopics.sort((a, b) => {
    const x = a.item?.addedAt || '9999'
    const y = b.item?.addedAt || '9999'
    return x < y ? -1 : x > y ? 1 : a.topicId < b.topicId ? -1 : 1
  })
  return { events, facts, goals, goalById, topics: viewTopics, tz, overlay }
}

/** Latest checklist state per procitem subject from the event log. */
export function checklistState(events) {
  const sorted = [...events].filter((e) => e.kind === 'checklist').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const out = new Map()
  for (const e of sorted) out.set(e.subject, { checked: e.checked, at: e.at })
  return out
}
