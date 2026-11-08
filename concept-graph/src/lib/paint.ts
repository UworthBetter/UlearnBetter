import type { Status } from '../data/concepts'

/** 与 WordLink `RING_FRACTION` 同一套弧长：见过 1/4，学习中 2/3，掌握则闭合。 */
const RING_FRACTION: Record<Status, number> = {
  unlearned: 0.25,
  learning: 0.66,
  mastered: 1,
}

/**
 * 外圈颜色。已掌握盖过优先级；学习中同理。
 * 还没学时，重要性 ≥ 3 为红，其余为灰。
 */
export function statusColor(status: Status, importance: number): string {
  if (status === 'mastered') return '#34d399'
  if (status === 'learning') return '#f5c451'
  if (importance >= 3) return '#fb7185'
  return '#8b95a7'
}

export function nodeRadius(importance: number): number {
  return importance * 8
}

function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(other.slice(1), 16)
  const channel = (shift: number) => {
    const from = (a >> shift) & 255
    const to = (b >> shift) & 255
    return Math.round(from + (to - from) * t)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

function jewelStops(color: string): [string, string, string] {
  return [mix(color, '#ffffff', 0.55), color, mix(color, '#000000', 0.3)]
}

/** WordLink `paintProgressRing`：底轨淡圈 + 从 12 点方向顺时针的弧。 */
export function paintProgressRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  status: Status,
  color: string,
  scale: number,
) {
  const radius = r + 4 / scale
  const fraction = RING_FRACTION[status]
  ctx.save()
  ctx.lineWidth = (status === 'mastered' ? 2.4 : 2) / scale
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  if (fraction < 1) {
    ctx.globalAlpha *= 0.22
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha /= 0.22
  }
  ctx.beginPath()
  ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export function paintJewel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  scale: number,
) {
  const [highlight, body, rim] = jewelStops(color)
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = 18 / scale
  const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  gradient.addColorStop(0, highlight)
  gradient.addColorStop(0.55, body)
  gradient.addColorStop(1, rim)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.restore()
}
