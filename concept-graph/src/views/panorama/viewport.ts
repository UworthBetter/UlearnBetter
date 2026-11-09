/** 全景画布的可视区域与缩放平移变换。屏幕坐标 = 世界坐标 × k + t。 */

export interface SafeArea {
  /** 画布内不被顶栏、摘要栏、助手栏挡住的区域（相对画布左上角） */
  x0: number
  y0: number
  x1: number
  y1: number
  narrow: boolean
  /** 窄屏时画布自身的高度；宽屏画布铺满窗口 */
  skyH: number
}

export interface ViewTransform {
  k: number
  tx: number
  ty: number
}

export const MIN_K = 0.25
export const MAX_K = 3
const FIT_MAX_K = 1.25

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k))
}

function cssNumber(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

export function measureSafeArea(): SafeArea {
  const width = window.innerWidth
  const height = window.innerHeight
  if (width <= 900) {
    const skyH = Math.max(420, Math.round(height * 0.72))
    return { x0: 12, y0: 12, x1: width - 12, y1: skyH - 12, narrow: true, skyH }
  }
  const rail = cssNumber('--ub-rail-width', 332) || 332
  const bar = cssNumber('--ub-agent-bar-height', 140)
  const x0 = 28
  const y0 = 124
  return {
    x0,
    y0,
    x1: Math.max(x0 + 320, width - rail - 48),
    y1: Math.max(y0 + 280, height - bar - 20),
    narrow: false,
    skyH: height,
  }
}

export function sameSafeArea(a: SafeArea, b: SafeArea): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1 && a.narrow === b.narrow && a.skyH === b.skyH
}

/** 让全部内容居中放进可视区域。 */
export function fitView(bounds: { x0: number; y0: number; x1: number; y1: number }, safe: SafeArea): ViewTransform {
  const bw = Math.max(1, bounds.x1 - bounds.x0)
  const bh = Math.max(1, bounds.y1 - bounds.y0)
  const sw = safe.x1 - safe.x0
  const sh = safe.y1 - safe.y0
  const k = Math.min(FIT_MAX_K, Math.max(MIN_K, Math.min(sw / bw, sh / bh)))
  return {
    k,
    tx: safe.x0 + (sw - bw * k) / 2 - bounds.x0 * k,
    ty: safe.y0 + (sh - bh * k) / 2 - bounds.y0 * k,
  }
}

/** 以屏幕点 (px, py) 为中心缩放，该点下的世界坐标保持不动。 */
export function zoomAround(view: ViewTransform, px: number, py: number, factor: number): ViewTransform {
  const k = clampK(view.k * factor)
  const ratio = k / view.k
  return { k, tx: px - (px - view.tx) * ratio, ty: py - (py - view.ty) * ratio }
}
