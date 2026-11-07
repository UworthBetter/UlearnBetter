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
