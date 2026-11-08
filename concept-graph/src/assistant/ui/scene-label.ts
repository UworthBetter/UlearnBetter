import type { LearningContext } from '../contracts.ts'

export function sceneTitle(scene: LearningContext): string {
  if (scene.view === 'none') return '尚未进入学习场景'
  if (scene.concept && scene.card) return `${scene.concept.label} · ${scene.card.title}`
  if (scene.concept) return scene.concept.label
  if (scene.topic) return scene.topic.title
  if (scene.view === 'today') return scene.layer === 'stats' ? '学习统计' : '今天'
  if (scene.view === 'library') return scene.record?.selectedItem?.title ?? '资料'
  if (scene.view === 'panorama') return scene.record?.goal?.title ?? '全部目标'
  return scene.view === 'star-dive' ? '星图' : '概念图'
}

export function sceneChip(scene: LearningContext): string {
  if (scene.view === 'library') {
    const title = scene.record?.selectedItem?.title
    return title ? `资料 · ${title}` : '资料'
  }
  if (scene.view === 'panorama') return scene.record?.goal ? `全景 · ${scene.record.goal.title}` : '全景 · 全部目标'
  if (scene.view === 'today') return scene.layer === 'stats' ? '今天 · 学习统计' : '今天'
  if (scene.view === 'star-dive') {
    if (scene.concept) return `潜航 · ${scene.concept.label}`
    if (scene.topic) return `潜航 · ${scene.topic.title}`
    return '星图'
  }
  if (scene.view === 'graph') return '概念图'
  return '无场景'
}

export function viewLabel(view: LearningContext['view']): string {
  if (view === 'star-dive') return '星图'
  if (view === 'graph') return '概念图'
  if (view === 'today') return '今天'
  if (view === 'panorama') return '全景'
  if (view === 'library') return '资料'
  return '无场景'
}

export function selectionPreview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 72) return compact
  return `${compact.slice(0, 72)}…`
}

export function sameSubject(left: LearningContext, right: LearningContext): boolean {
  return left.view === right.view
    && left.topic?.id === right.topic?.id
    && left.concept?.id === right.concept?.id
    && left.card?.id === right.card?.id
    && (left.selection?.text ?? '') === (right.selection?.text ?? '')
}

export function formatCapturedAt(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}
