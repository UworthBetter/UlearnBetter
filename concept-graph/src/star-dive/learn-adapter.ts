import type { TopicOverlay } from '../record/types.ts'
import type { EvidenceRef } from '../assistant/contracts.ts'
import type { CardSpec, StarDiveData } from './types.ts'

type ObjectData = Record<string, any>
const object = (v: unknown): v is ObjectData => !!v && typeof v === 'object' && !Array.isArray(v)
const shapes = new Set(['definition', 'structure', 'process', 'comparison', 'variation', 'procedure'])
const style: Record<string, string> = { definition: 'definition', structure: 'definition', process: 'process', comparison: 'compare', variation: 'formula', procedure: 'process' }

/** Normalize imported notes without guessing timestamps, relations, or computations. */
export function adaptLearnDocument(value: unknown, overlay?: TopicOverlay): StarDiveData {
  value = structuredClone(value)
  if (!object(value) || value.schema !== 'learning.learn/0.1' || !object(value.topic)
    || typeof value.topic.id !== 'string' || typeof value.topic.title !== 'string'
    || !Array.isArray(value.concepts) || value.concepts.length < 1 || value.concepts.length > 500
    || !Array.isArray(value.sources) || !Array.isArray(value.relations)) throw new Error('请选择有效的 learning.learn/0.1 笔记文件（1–500 个概念）。')
  const topic = value.topic
  const sources = new Map<string, ObjectData>()
  for (const source of value.sources) if (object(source) && typeof source.id === 'string') sources.set(source.id, source)
  const ids = new Set<string>()
  const blockIds = new Set<string>()
  const evidence = (refs: unknown): EvidenceRef[] => (Array.isArray(refs) ? refs : []).filter(object).flatMap<EvidenceRef>((ref) => {
    if (typeof ref.note === 'string') return [{ sourceId: topic.id, note: ref.note }]
    const source = sources.get(ref.src)
    if (!source) return []
    const url = source.platform === 'youtube' && typeof source.ref === 'string'
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(source.ref)}${typeof ref.t === 'number' && Number.isFinite(ref.t) && ref.t >= 0 ? `&t=${Math.round(ref.t)}s` : ''}` : undefined
    return [{ sourceId: `${topic.id}:${ref.src}`, ...(url ? { url } : {}),
      ...(typeof ref.t === 'number' && Number.isFinite(ref.t) && ref.t >= 0 ? { startSec: ref.t } : {}) }]
  })
  function card(block: ObjectData): CardSpec {
    if (typeof block.id !== 'string' || blockIds.has(block.id) || !shapes.has(block.shape)) throw new Error('内容块编号重复或类型无效。')
    for (const field of ['points', 'terms', 'nodes', 'edges', 'groups', 'steps', 'items', 'series', 'inputs', 'preserved']) {
      if (block[field] != null && (!Array.isArray(block[field]) || !block[field].every(object))) throw new Error(`内容块的 ${field} 格式无效。`)
    }
    for (const group of block.groups || []) if (!Array.isArray(group.items) || !group.items.every(object)) throw new Error('实操步骤格式无效。')
    if (block.cells != null && (!Array.isArray(block.cells) || !block.cells.every((row: unknown) => Array.isArray(row) && row.every(object)))) throw new Error('对比表格格式无效。')
    blockIds.add(block.id)
    return { type: 'learning_block', id: block.id, title: String(block.title || '学习笔记'), block,
      evidence: evidence(block.ev) }
  }
  const concepts = value.concepts.map((c: unknown) => {
    if (!object(c) || typeof c.id !== 'string' || !c.id || ids.has(c.id)
      || typeof c.label !== 'string' || typeof c.one_liner !== 'string' || !Array.isArray(c.blocks) || !c.blocks.every(object) || c.blocks.length < 1 || c.blocks.length > 64) throw new Error('概念编号重复或内容不完整。')
    if (c.preserved != null && (!Array.isArray(c.preserved) || !c.preserved.every(object))) throw new Error('补充原文格式无效。')
    ids.add(c.id)
    const cards = c.blocks.filter(object).map(card)
    if (Array.isArray(c.preserved) && c.preserved.length) cards.push({
      type: 'learning_block', id: `${c.id}:preserved`, title: '完整补充笔记',
      block: { shape: 'definition', grounding: 'note', preserved: c.preserved },
      evidence: [{ sourceId: topic.id, note: c.note }],
    })
    const visible = cards.length > 4 ? [...cards.slice(0, 3), {
      type: 'learning_block', id: `${c.id}:more`, title: `更多笔记（${cards.length - 3}）`,
      block: { shape: 'collection', grounding: 'note', children: cards.slice(3).map((item) => item.block) },
      evidence: cards.slice(3).flatMap((item) => item.evidence || []),
    }] : cards
    return { id: c.id, label: c.label, summary: c.one_liner, shape: style[c.blocks.find((b: ObjectData) => b.shape !== 'definition')?.shape || 'definition'], relations: [] as string[], cards: visible }
  })
  // A checklist has its own node, rather than an invented prerequisite or arbitrary owner.
  for (const procedure of value.procedures || []) {
    if (!object(procedure) || ids.has(procedure.id)) throw new Error('实操编号重复或无效。')
    ids.add(procedure.id)
    procedure.recordTopicId = topic.id
    procedure.recordChecked = {}
    for (const g of procedure.groups || []) for (const item of g.items || []) if (item.id) procedure.recordChecked[item.id] = !!overlay?.checklist[`procitem:${topic.id}/${procedure.id}/${item.id}`]
    concepts.push({ id: procedure.id, label: String(procedure.title || '实操清单'), summary: '按步骤实践，勾选会写入学习记录；不会修改原笔记。', shape: 'process', relations: [], cards: [card(procedure)] })
  }
  const byId = new Map(concepts.map((c) => [c.id, c]))
  for (const relation of value.relations) {
    if (!object(relation) || !byId.has(relation.a) || !byId.has(relation.b)) continue
    const a = byId.get(relation.a)!, b = byId.get(relation.b)!
    if (!a.relations.includes(b.id)) a.relations.push(b.id)
    if (!b.relations.includes(a.id)) b.relations.push(a.id)
  }
  const visible = concepts.filter(c => !overlay?.hidden.includes(c.id) && !overlay?.hidden.includes(`concept:${topic.id}/${c.id}`))
  for (const c of visible) {
    const mastery = overlay?.mastery.find(m => m.subject === `concept:${topic.id}/${c.id}`)
    Object.assign(c, {masteryLevel: mastery?.level ?? 0, due: mastery?.due ?? null, importance: overlay?.pins[c.id] ?? overlay?.pins[`concept:${topic.id}/${c.id}`] ?? 1})
    c.label = overlay?.renames[c.id] ?? overlay?.renames[`concept:${topic.id}/${c.id}`] ?? c.label
    c.relations = c.relations.filter(id => visible.some(c => c.id === id))
  }
  return { meta: { topic_id: topic.id, title: topic.title, channel: '导入的学习笔记', source_count: sources.size,
    video_id: '', url: '', duration_sec: 0 }, concepts: visible }
}
