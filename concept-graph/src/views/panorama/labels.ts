/**
 * 屏幕坐标下的标签避让。按优先级逐个放：每个标签试若干候选位置，
 * 取第一个既不压住星、名牌、标题，也不压住已放标签的位置。
 * 放不下的普通标签先隐藏（悬停或放大后会出现）；强制标签取重叠最少的位置。
 */

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface LabelRequest {
  id: string
  /** 锚点：星心或椭圆中心 */
  x: number
  y: number
  w: number
  h: number
  /** 锚点周围要让开的距离：星的半径，或椭圆半轴 */
  rx: number
  ry: number
  /** 被强制显示的标签放不下也要显示 */
  force: boolean
  /** 自己的星（不算障碍） */
  self?: string
  /** 椭圆锚点优先放上下，星优先放下方 */
  shape: 'star' | 'ellipse'
}

export interface Obstacle extends Rect {
  id?: string
}

export interface PlacedLabel extends Rect {
  id: string
}

/** 不依赖画布的文字宽度估算：中日韩字符按一个字宽，其余按 0.58。 */
export function textWidth(text: string, fontSize: number): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    width += code > 0x2e80 ? fontSize : code === 32 ? fontSize * 0.3 : fontSize * 0.58
  }
  return width
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

function candidates(req: LabelRequest): Rect[] {
  const { x, y, w, h, rx, ry } = req
  const gap = 4
  const at = (cx: number, cy: number): Rect => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 })
  if (req.shape === 'ellipse') {
    return [
      at(x, y - ry - gap - h / 2),
      at(x, y + ry + gap + h / 2),
      at(x + rx + gap + w / 2, y),
      at(x - rx - gap - w / 2, y),
      at(x + rx * 0.7 + w / 2, y - ry * 0.7 - h / 2),
      at(x - rx * 0.7 - w / 2, y - ry * 0.7 - h / 2),
      at(x + rx * 0.7 + w / 2, y + ry * 0.7 + h / 2),
      at(x - rx * 0.7 - w / 2, y + ry * 0.7 + h / 2),
    ]
  }
  const d = rx + gap
  const diag = rx * 0.75 + gap
  return [
    at(x, y + d + h / 2),
    at(x + d + w / 2, y),
    at(x - d - w / 2, y),
    at(x, y - d - h / 2),
    at(x + diag + w / 2, y + diag + h / 2 - 2),
    at(x - diag - w / 2, y + diag + h / 2 - 2),
    at(x + diag + w / 2, y - diag - h / 2 + 2),
    at(x - diag - w / 2, y - diag - h / 2 + 2),
  ]
}

/** 按传入顺序放置（调用方先排好优先级）。返回已显示的标签。 */
export function placeLabels(requests: LabelRequest[], obstacles: Obstacle[]): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  for (const req of requests) {
    let best: Rect | null = null
    let bestCost = Number.POSITIVE_INFINITY
    for (const rect of candidates(req)) {
      let cost = 0
      for (const obstacle of obstacles) {
        if (obstacle.id !== undefined && obstacle.id === req.self) continue
        cost += overlapArea(rect, obstacle)
      }
      for (const other of placed) cost += overlapArea(rect, other) * 2
      if (cost < bestCost) {
        bestCost = cost
        best = rect
        if (cost === 0) break
      }
    }
    if (!best) continue
    if (bestCost > 0 && !req.force) continue
    placed.push({ id: req.id, ...best })
  }
  return placed
}
