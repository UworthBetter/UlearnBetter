import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import { gapEllipse, simFromStars, type PanoramaLayout } from './layout.ts'
import { step, type Sim } from './physics.ts'
import { placeLabels, textWidth, type LabelRequest, type Obstacle } from './labels.ts'
import { clampK, fitView, zoomAround, type SafeArea, type ViewTransform } from './viewport.ts'
import './panorama.css'

const COLORS = { amber: '#ffb547', cyan: '#86dcff', violet: '#c9b6ff' } as const
const LABEL_FONT = 12
const LABEL_H = 17
const GAP_FONT = 11.5
const GAP_H = 22
const PILL_H = 30
const DRAG_THRESHOLD = 4

type Point = { x: number; y: number }
type Gesture =
  | { kind: 'pan'; id: number; start: Point; tx: number; ty: number; moved: boolean }
  | { kind: 'node'; id: number; index: number; start: Point; moved: boolean }
  | { kind: 'pinch'; d0: number; k0: number; mid: Point; tx0: number; ty0: number; moved: true }

interface Props {
  layout: PanoramaLayout
  safe: SafeArea
  onTopic: (topicId: string) => void
  onConcept: (topicId: string, conceptId: string) => void
}

export default function PanoramaSky({ layout, safe, onTopic, onConcept }: Props) {
  const skyRef = useRef<HTMLDivElement>(null)
  const pairs = useMemo(() => layout.links.flatMap((link) => (link.a && link.b ? [{ a: link.a, b: link.b }] : [])), [layout])
  const indexOf = useMemo(() => new Map(layout.stars.map((star, index) => [star.key, index])), [layout])
  const gapMembers = useMemo(() => layout.gaps.map((gap) => layout.stars.flatMap((star, index) => (
    star.topicId === gap.topicId && star.group === gap.group ? [index] : []
  ))), [layout])
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const pair of pairs) {
      map.set(pair.a, (map.get(pair.a) ?? new Set()).add(pair.b))
      map.set(pair.b, (map.get(pair.b) ?? new Set()).add(pair.a))
    }
    return map
  }, [pairs])

  // 父组件在布局变化时用 key 重新挂载本组件，所以这里的初值就是适配后的视图。
  const [view, setViewState] = useState<ViewTransform>(() => fitView(layout.bounds, safe))
  /** 用户动过视图后，可视区域变化（如助手栏变高）不再自动适配。 */
  const [touched, setTouched] = useState(false)
  const [fittedFor, setFittedFor] = useState(safe)
  if (fittedFor !== safe) {
    setFittedFor(safe)
    if (!touched) setViewState(fitView(layout.bounds, safe))
  }
  const setView = useCallback((next: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => {
    setTouched(true)
    setViewState(next)
  }, [])
  const [points, setPoints] = useState<Point[]>(() => layout.stars.map((star) => ({ x: star.x, y: star.y })))
  /** 力导向模拟是外部可变对象，只在事件和动画帧里读写；渲染只读 points 快照。 */
  const simRef = useRef<Sim | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const suppressClick = useRef(false)
  const frame = useRef(0)

  useEffect(() => {
    simRef.current = simFromStars(layout.stars, pairs)
    return () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      simRef.current = null
    }
  }, [layout, pairs])

  const kick = useCallback(() => {
    if (frame.current) return
    const loop = () => {
      const sim = simRef.current
      if (!sim) {
        frame.current = 0
        return
      }
      const active = step(sim)
      setPoints(sim.nodes.map((node) => ({ x: node.x, y: node.y })))
      frame.current = active ? requestAnimationFrame(loop) : 0
    }
    frame.current = requestAnimationFrame(loop)
  }, [])

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setView((prev) => zoomAround(prev, px, py, factor))
  }, [setView])

  useEffect(() => {
    const element = skyRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const speed = event.deltaMode === 1 ? 0.05 : event.ctrlKey ? 0.01 : 0.0018
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * speed))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  function local(event: ReactPointerEvent): Point {
    const rect = skyRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function releaseNode() {
    const current = gesture.current
    const sim = simRef.current
    if (sim && current?.kind === 'node' && current.moved) {
      // 松手后以落点为这颗星自己的锚点：它停在放下的位置，周围的星再重新排开。
      const node = sim.nodes[current.index]
      node.fixed = false
      node.ax = node.x
      node.ay = node.y
      sim.alphaTarget = 0
      kick()
      setDragging(null)
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const point = local(event)
    pointers.current.set(event.pointerId, point)
    suppressClick.current = false
    if (pointers.current.size === 2) {
      releaseNode()
      const [p, q] = [...pointers.current.values()]
      gesture.current = {
        kind: 'pinch', d0: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), k0: view.k,
        mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, tx0: view.tx, ty0: view.ty, moved: true,
      }
      skyRef.current?.setPointerCapture(event.pointerId)
      return
    }
    if (pointers.current.size > 2) return
    const starElement = (event.target as Element).closest<HTMLElement>('[data-star]')
    gesture.current = starElement
      ? { kind: 'node', id: event.pointerId, index: Number(starElement.dataset.star), start: point, moved: false }
      : { kind: 'pan', id: event.pointerId, start: point, tx: view.tx, ty: view.ty, moved: false }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    const point = local(event)
    pointers.current.set(event.pointerId, point)
    const current = gesture.current
    if (!current) return
    if (current.kind === 'pinch') {
      if (pointers.current.size < 2) return
      const [p, q] = [...pointers.current.values()]
      const k = clampK(current.k0 * (Math.hypot(p.x - q.x, p.y - q.y) / current.d0))
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
      const wx = (current.mid.x - current.tx0) / current.k0
      const wy = (current.mid.y - current.ty0) / current.k0
      setView({ k, tx: mid.x - wx * k, ty: mid.y - wy * k })
      return
    }
    if (current.id !== event.pointerId) return
    const sim = simRef.current
    if (!current.moved) {
      if (Math.hypot(point.x - current.start.x, point.y - current.start.y) < DRAG_THRESHOLD) return
      current.moved = true
      suppressClick.current = true
      skyRef.current?.setPointerCapture(event.pointerId)
      if (current.kind === 'node' && sim) {
        sim.nodes[current.index].fixed = true
        sim.alphaTarget = 0.22
        sim.alpha = Math.max(sim.alpha, 0.35)
        setDragging(sim.nodes[current.index].key)
      } else if (current.kind === 'pan') {
        setPanning(true)
      }
    }
    if (current.kind === 'pan') {
      const { start, tx: tx0, ty: ty0 } = current
      setView((prev) => ({ k: prev.k, tx: tx0 + point.x - start.x, ty: ty0 + point.y - start.y }))
    } else if (sim) {
      const node = sim.nodes[current.index]
      node.x = (point.x - view.tx) / view.k
      node.y = (point.y - view.ty) / view.k
      kick()
    }
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return
    if (skyRef.current?.hasPointerCapture(event.pointerId)) skyRef.current.releasePointerCapture(event.pointerId)
    const current = gesture.current
    if (current?.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      else {
        const [id, point] = [...pointers.current.entries()][0]
        gesture.current = { kind: 'pan', id, start: point, tx: view.tx, ty: view.ty, moved: true }
      }
      return
    }
    releaseNode()
    setPanning(false)
    gesture.current = null
  }

  /** 点击（不是拖拽结束）才导航；键盘回车同样触发 click。 */
  function guardClick(event: ReactMouseEvent, action: () => void) {
    if (suppressClick.current) {
      suppressClick.current = false
      event.preventDefault()
      return
    }
    action()
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const cx = (safe.x0 + safe.x1) / 2
    const cy = (safe.y0 + safe.y1) / 2
    const move = (dx: number, dy: number) => setView((prev) => ({ k: prev.k, tx: prev.tx + dx, ty: prev.ty + dy }))
    const keys: Record<string, () => void> = {
      '+': () => zoomAt(cx, cy, 1.25),
      '=': () => zoomAt(cx, cy, 1.25),
      '-': () => zoomAt(cx, cy, 0.8),
      '0': () => fitNow(),
      ArrowLeft: () => move(60, 0),
      ArrowRight: () => move(-60, 0),
      ArrowUp: () => move(0, 60),
      ArrowDown: () => move(0, -60),
    }
    const action = keys[event.key]
    if (!action || event.altKey || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    action()
  }

  // ---------- 每帧：世界坐标 → 屏幕坐标，再做标签避让 ----------
  const { k, tx, ty } = view
  const starScale = Math.min(1.5, Math.max(0.75, Math.sqrt(k)))
  const screen = points.map((node) => ({ x: node.x * k + tx, y: node.y * k + ty }))
  const focusKey = dragging ?? hover
  const focusNeighbors = focusKey ? neighbors.get(focusKey) : undefined
  const nextByKey = new Map(layout.next.map((item) => [item.key, item.index]))

  // 画布左右边缘之外、以及右侧摘要栏盖住的区域都算障碍，标签不往那里放。
  const rightEdge = safe.narrow ? safe.x1 + 10 : safe.x1 + 20
  const obstacles: Obstacle[] = [
    { x0: -1e5, y0: -1e5, x1: 2, y1: 1e5 },
    { x0: rightEdge, y0: -1e5, x1: 1e5, y1: 1e5 },
  ]
  layout.stars.forEach((star, index) => {
    const r = star.radius * starScale + 3
    const p = screen[index]
    obstacles.push({ id: star.key, x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r })
    if (nextByKey.has(star.key)) {
      const bx = p.x + star.radius * starScale + 6
      const by = p.y - star.radius * starScale - 6
      obstacles.push({ x0: bx - 9, y0: by - 9, x1: bx + 9, y1: by + 9 })
    }
  })
  const pills = layout.topics.map((topic) => {
    const x = topic.x * k + tx
    const y = topic.y * k + ty
    const w = textWidth(topic.title, 13.5) + textWidth(`${topic.learned}/${topic.total}`, 11) + 8 + 28
    obstacles.push({ x0: x - w / 2, y0: y, x1: x + w / 2, y1: y + PILL_H })
    return { topic, x, y }
  })
  const titleFont = Math.min(26, Math.max(10, 20 * k))
  const titles = layout.goals.map((goal) => {
    const x = goal.x * k + tx
    const y = goal.y * k + ty
    const width = goal.width * k
    const lines = Math.min(2, Math.ceil((textWidth(goal.title, titleFont) * 1.08) / Math.max(1, width)))
    const textW = Math.min(width, textWidth(goal.title, titleFont) * 1.08)
    const height = 18 + lines * titleFont * 1.3
    obstacles.push({ x0: x - textW / 2, y0: y, x1: x + textW / 2, y1: y + height })
    return { goal, x, y, width }
  })

  const gapShapes = layout.gaps.map((gap, gapIndex) => {
    const members = gapMembers[gapIndex].map((index) => points[index])
    const shape = members.length ? gapEllipse(members) : gap
    const text = `缺口 · ${gap.group} 0/${gap.count}`
    return { gap, text, x: shape.x * k + tx, y: shape.y * k + ty, rx: shape.rx * k, ry: shape.ry * k }
  })
  const requests: LabelRequest[] = gapShapes.map((shape, index) => ({
    id: `gap:${index}`, x: shape.x, y: shape.y, rx: shape.rx, ry: shape.ry,
    w: textWidth(shape.text, GAP_FONT) + 22, h: GAP_H, shape: 'ellipse',
    // 缺口移到摘要栏底下时不再强制显示
    force: shape.x > 0 && shape.x < rightEdge,
  }))
  const order = layout.stars.map((star, index) => ({ star, index })).sort((a, b) => {
    const rank = (item: { star: (typeof layout.stars)[number] }) => (
      (item.star.key === focusKey ? 1000 : 0)
      + (nextByKey.has(item.star.key) ? 100 : 0)
      + (focusNeighbors?.has(item.star.key) ? 50 : 0)
      + item.star.importance * 10
      + item.star.level
    )
    return rank(b) - rank(a) || a.index - b.index
  })
  for (const { star, index } of order) {
    const p = screen[index]
    requests.push({
      id: star.key, x: p.x, y: p.y, rx: star.radius * starScale + 2, ry: star.radius * starScale + 2,
      w: textWidth(star.label, LABEL_FONT) + 6, h: LABEL_H,
      force: star.key === focusKey || nextByKey.has(star.key), self: star.key, shape: 'star',
    })
  }
  const placed = new Map(placeLabels(requests, obstacles).map((rect) => [rect.id, rect]))

  function fitNow() {
    setTouched(false)
    setViewState(fitView(layout.bounds, safe))
  }

  return (
    <div
      ref={skyRef}
      className={`ub-pv-sky${panning ? ' panning' : ''}`}
      style={safe.narrow ? { height: safe.skyH } : undefined}
      tabIndex={0}
      role="application"
      aria-label="学习全景星图：拖动画布平移，滚轮或加减号缩放，拖动星星调整位置，0 键适配视口"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <svg aria-hidden="true">
        {layout.links.map((link, index) => {
          if (link.kind === 'tether') {
            return <line key={`t-${index}`} x1={link.x1 * k + tx} y1={link.y1 * k + ty} x2={link.x2 * k + tx} y2={link.y2 * k + ty} className="ub-pv-tether" />
          }
          const a = screen[indexOf.get(link.a!)!]
          const b = screen[indexOf.get(link.b!)!]
          const hot = focusKey !== null && (link.a === focusKey || link.b === focusKey)
          const cls = `ub-pv-link${link.kind === 'confirmed' ? '' : ' pend'}${hot ? ' hot' : focusKey ? ' faint' : ''}`
          return <line key={`${link.a}|${link.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} />
        })}
        {gapShapes.map((shape) => (
          <ellipse key={`${shape.gap.topicId}/${shape.gap.group}`} cx={shape.x} cy={shape.y} rx={shape.rx} ry={shape.ry} className="ub-pv-gapring" />
        ))}
        {layout.next.length > 1 && (
          <polyline
            className="ub-pv-route"
            points={layout.next.map((item) => {
              const p = screen[indexOf.get(item.key)!]
              return `${p.x},${p.y}`
            }).join(' ')}
          />
        )}
      </svg>

      {titles.map(({ goal, x, y, width }) => (
        <div key={goal.id} className={`ub-pv-goal ${goal.colorKey}`} style={{ left: x, top: y, width }}>
          <div className="ub-eyebrow" style={{ color: COLORS[goal.colorKey] }}>目标</div>
          <h2 style={{ fontSize: titleFont }}>{goal.title}</h2>
        </div>
      ))}

      {layout.stars.map((star, index) => {
        const p = screen[index]
        const r = star.radius * starScale
        const color = COLORS[star.colorKey]
        const nextIndex = nextByKey.get(star.key)
        const cls = `ub-pv-star${star.key === focusKey ? ' hot' : ''}${star.key === dragging ? ' dragging' : ''}${focusKey && star.key !== focusKey && !focusNeighbors?.has(star.key) ? ' faint' : ''}`
        return (
          <button
            key={star.key}
            type="button"
            data-star={index}
            className={cls}
            style={{ left: p.x, top: p.y }}
            aria-label={`${star.label}（${star.group}）`}
            onClick={(event) => guardClick(event, () => onConcept(star.topicId, star.conceptId))}
            onPointerEnter={() => setHover(star.key)}
            onPointerLeave={() => setHover((value) => (value === star.key ? null : value))}
            onFocus={() => setHover(star.key)}
            onBlur={() => setHover((value) => (value === star.key ? null : value))}
          >
            {star.due && <span className="due" style={{ width: r * 5, height: r * 5 }} />}
            <span className="core" style={{ width: r * 2, height: r * 2, ['--c' as string]: color, opacity: 0.35 + star.level * 0.2 }} />
            <span className="hit" />
            {nextIndex && <span className="ub-pv-next" style={{ left: r + 6, top: -r - 6 }}>{nextIndex}</span>}
          </button>
        )
      })}

      {layout.stars.map((star) => {
        const rect = placed.get(star.key)
        if (!rect) return null
        const tone = star.key === focusKey ? ' hot' : star.level === 0 ? ' dim' : ''
        return (
          <span key={`label-${star.key}`} className={`ub-pv-label${tone}`} style={{ left: rect.x0, top: rect.y0, width: rect.x1 - rect.x0 }} aria-hidden="true">
            {star.label}
          </span>
        )
      })}

      {gapShapes.map((shape, index) => {
        const rect = placed.get(`gap:${index}`)
        if (!rect) return null
        return (
          <button
            key={`gap-${shape.gap.topicId}/${shape.gap.group}`}
            type="button"
            className="ub-pv-gap"
            style={{ left: rect.x0, top: rect.y0, width: rect.x1 - rect.x0 }}
            title={shape.gap.why}
            onClick={(event) => guardClick(event, () => onTopic(shape.gap.topicId))}
          >
            {shape.text}
          </button>
        )
      })}

      {pills.map(({ topic, x, y }) => (
        <button
          key={topic.topicId}
          type="button"
          className={topic.pending ? 'ub-pv-topic pend' : 'ub-pv-topic'}
          style={{ left: x, top: y }}
          onClick={(event) => guardClick(event, () => onTopic(topic.topicId))}
        >
          <b>{topic.title}</b>
          <span>{topic.learned}/{topic.total}</span>
        </button>
      ))}

      <div
        className="ub-pv-tools"
        style={{ left: safe.x1, top: safe.narrow ? safe.y0 : 78 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="ub-pv-hint">拖动画布 · 滚轮缩放 · 可拖动星星</span>
        <button type="button" aria-label="放大" onClick={() => zoomAt((safe.x0 + safe.x1) / 2, (safe.y0 + safe.y1) / 2, 1.25)}>+</button>
        <button type="button" aria-label="缩小" onClick={() => zoomAt((safe.x0 + safe.x1) / 2, (safe.y0 + safe.y1) / 2, 0.8)}>−</button>
        <button type="button" aria-label="适配视口" className="wide" onClick={fitNow}>适配</button>
        <span className="ub-pv-scale" aria-hidden="true">{Math.round(k * 100)}%</span>
      </div>
    </div>
  )
}
