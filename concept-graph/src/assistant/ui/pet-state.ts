export const PET_MOTIONS = {
  idle: { label: '陪你学习', duration: 4200 },
  click: { label: '你好呀，一起学点新东西吧！', duration: 1680 },
  drag: { label: '今天也要加油呀！', duration: 1680 },
  thinking: { label: '正在整理思路…', duration: 4320 },
  processing: { label: '正在回答，请稍等…', duration: 4200 },
  'task-complete': { label: '回答好啦，一起来看看', duration: 3600 },
  'new-message': { label: '有一条新回答，点我查看', duration: 3480 },
  error: { label: '遇到一点问题，点我查看', duration: 3840 },
  coding: { label: '编码动作预览', duration: 4200 },
  debugging: { label: '调试动作预览', duration: 4480 },
  stretch: { label: '活动一下肩颈吧', duration: 2160 },
  'drink-water': { label: '记得喝口水呀', duration: 4200 },
  'break-reminder': { label: '学了一阵子，休息一下吧', duration: 4320 },
} as const

export type PetMotion = keyof typeof PET_MOTIONS

export interface AssistantPetActivity {
  running: boolean
  hasAnswer: boolean
  hasTools: boolean
  error: boolean
  stopped: boolean
  connectionError: boolean
  demoMode: boolean
}

/** Only application events drive automatic reactions; previews do not imply OS monitoring. */
export function assistantPetMotion(activity: AssistantPetActivity): PetMotion {
  if (activity.error || (!activity.demoMode && activity.connectionError)) return 'error'
  if (activity.stopped) return 'idle'
  if (activity.running) return activity.hasAnswer || activity.hasTools ? 'processing' : 'thinking'
  return 'idle'
}

export function clampPetPosition(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const edge = 8
  return {
    x: Math.min(Math.max(edge, x), Math.max(edge, viewportWidth - width - edge)),
    y: Math.min(Math.max(edge, y), Math.max(edge, viewportHeight - height - edge)),
  }
}

export interface PetRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface AssistantPanelAnchor {
  left: number
  width: number
  maxHeight: number
  placement: 'above' | 'below'
  /** Offset from the viewport bottom while the panel sits above the pet. */
  bottom: number | null
  /** Offset from the viewport top while the panel sits below the pet. */
  top: number | null
}

export interface PanelAnchorOptions {
  width?: number
  gutter?: number
  gap?: number
  topPadding?: number
  maxHeight?: number
  minHeight?: number
}

/**
 * Keep the chat panel glued to the draggable pet: above it while there is room,
 * otherwise below it, always inside the viewport and clear of the top bar.
 */
export function placeAssistantPanel(
  pet: PetRect,
  viewport: ViewportSize,
  options: PanelAnchorOptions = {},
): AssistantPanelAnchor {
  const gutter = options.gutter ?? 16
  const gap = options.gap ?? 8
  const topPadding = options.topPadding ?? 88
  const cap = options.maxHeight ?? 620
  const minHeight = options.minHeight ?? 260
  const width = Math.max(240, Math.min(options.width ?? 424, viewport.width - gutter * 2))
  // Centre the panel over the pet, then clamp it so it never spills past the page edges.
  const centred = pet.x + pet.width / 2 - width / 2
  const left = Math.min(Math.max(gutter, centred), Math.max(gutter, viewport.width - width - gutter))
  const spaceAbove = pet.y - gap - topPadding
  const spaceBelow = viewport.height - (pet.y + pet.height) - gap - gutter
  const placement = spaceAbove >= minHeight || spaceAbove >= spaceBelow ? 'above' : 'below'
  if (placement === 'above') {
    return {
      left,
      width,
      placement,
      bottom: viewport.height - pet.y + gap,
      top: null,
      maxHeight: Math.max(200, Math.min(cap, spaceAbove)),
    }
  }
  return {
    left,
    width,
    placement,
    bottom: null,
    top: pet.y + pet.height + gap,
    maxHeight: Math.max(200, Math.min(cap, spaceBelow)),
  }
}
