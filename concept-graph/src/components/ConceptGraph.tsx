import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceCollide } from 'd3-force'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { conceptById, type Concept, type Status } from '../data/concepts'
import { nodeRadius, paintJewel, paintProgressRing, statusColor } from '../lib/paint'

interface GraphNode {
  id: string
  name: string
  short: string
  importance: number
  status: Status
  x?: number
  y?: number
}

interface GraphLink {
  source: string
  target: string
}

type GraphData = { nodes: GraphNode[]; links: GraphLink[] }

interface ScreenPoint {
  id: string
  x: number
  y: number
}

export default function ConceptGraph({
  concepts,
  centerId,
  canBack,
  canForward,
  onSelect,
  onBack,
  onForward,
}: {
  concepts: Concept[]
  centerId: string
  canBack: boolean
  canForward: boolean
  onSelect: (id: string) => void
  onBack: () => void
  onForward: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const positions = useRef(new Map<string, { x: number; y: number }>())
  const fitted = useRef<string | null>(null)
  const tunedFor = useRef<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const center = conceptById(concepts, centerId)
  const statusKey = concepts.map((concept) => `${concept.id}:${concept.status}`).join('|')

  const graphData = useMemo<GraphData>(() => {
    const current = conceptById(concepts, centerId)
    const neighborIds = current.neighbors.filter((id) => concepts.some((item) => item.id === id))
    const visible = [current, ...neighborIds.map((id) => conceptById(concepts, id))]
    return {
      nodes: visible.map((concept, index) => {
        const saved = positions.current.get(concept.id)
        const node: GraphNode = {
          id: concept.id,
          name: concept.name,
          short: concept.short,
          importance: concept.importance,
          status: concept.status,
        }
        if (saved) {
          node.x = saved.x
          node.y = saved.y
        } else if (index === 0) {
          node.x = 0
          node.y = 0
        } else {
          const angle = ((index - 1) / Math.max(neighborIds.length, 1)) * Math.PI * 2 - Math.PI / 2
          node.x = Math.cos(angle) * 168
          node.y = Math.sin(angle) * 168
        }
        return node
      }),
      links: neighborIds.map((id) => ({ source: current.id, target: id })),
    }
  }, [centerId, concepts, statusKey])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const tuneForces = useCallback(() => {
    const fg = fgRef.current
    if (!fg || tunedFor.current === centerId) return
    const link = fg.d3Force('link')
    const charge = fg.d3Force('charge')
    if (!link || !charge) return
    link.distance(156)
    charge.strength(-70)
    fg.d3Force(
      'collision',
      forceCollide<GraphNode>((node) => nodeRadius(node.importance) + 20).strength(0.9) as never,
    )
    tunedFor.current = centerId
    fitted.current = null
    fg.d3ReheatSimulation()
  }, [centerId])

  useEffect(() => {
    tuneForces()
  }, [graphData, tuneForces])

  useEffect(() => {
    const api = {
      screens(): ScreenPoint[] {
        const fg = fgRef.current
        const canvas = wrapRef.current?.querySelector('canvas')
        if (!fg || !canvas) return []
        const box = canvas.getBoundingClientRect()
        return graphData.nodes.flatMap((node) => {
          if (node.x === undefined || node.y === undefined) return []
          const point = fg.graph2ScreenCoords(node.x, node.y)
          return [{ id: node.id, x: box.left + point.x, y: box.top + point.y }]
        })
      },
    }
    window.__conceptGraph = api
  }, [graphData])

  const neighborCount = graphData.nodes.length - 1

  return (
    <section className="col graph-col">
      <header className="col-head graph-head">
        <button type="button" className="nav-btn" onClick={onBack} disabled={!canBack} aria-label="返回上一个概念">
          ←
        </button>
        <div className="head-copy">
          <div className="eyebrow">概念星图</div>
          <div className="head-title">
            {center.short}
            <span className="head-count">邻居 {neighborCount}</span>
          </div>
        </div>
        <button type="button" className="nav-btn" onClick={onForward} disabled={!canForward} aria-label="前进到下一个概念">
          →
        </button>
      </header>
      <div ref={wrapRef} className="graph-stage">
        {size.width > 0 && (
          <ForceGraph2D<GraphNode, GraphLink>
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#05070d"
            nodeId="id"
            nodeLabel={() => ''}
            nodeRelSize={1}
            nodeVal={(node) => nodeRadius(node.importance) ** 2}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(node, ctx, scale) => {
              if (node.x === undefined || node.y === undefined) return
              positions.current.set(node.id, { x: node.x, y: node.y })
              const safeScale = scale || 1
              const radius = nodeRadius(node.importance) / safeScale
              const color = statusColor(node.status, node.importance)
              paintJewel(ctx, node.x, node.y, radius, color, safeScale)
              paintProgressRing(ctx, node.x, node.y, radius, node.status, color, safeScale)
              if (node.id === centerId) {
                ctx.beginPath()
                ctx.arc(node.x, node.y, radius + 7 / safeScale, 0, Math.PI * 2)
                ctx.strokeStyle = 'rgba(234,242,255,0.85)'
                ctx.lineWidth = 1.2 / safeScale
                ctx.stroke()
              }
              ctx.font = `${12 / safeScale}px "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = '#eaf2ff'
              ctx.fillText(node.short, node.x, node.y + radius + 8 / safeScale)
            }}
            nodePointerAreaPaint={(node, color, ctx, globalScale) => {
              if (node.x === undefined || node.y === undefined) return
              const safeScale = globalScale || 1
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x, node.y, (nodeRadius(node.importance) + 8) / safeScale, 0, Math.PI * 2)
              ctx.fill()
            }}
            linkColor={() => 'rgba(140,163,196,0.4)'}
            linkWidth={1}
            cooldownTicks={120}
            warmupTicks={40}
            onEngineTick={tuneForces}
            onNodeClick={(node) => {
              if (node.id !== centerId) onSelect(node.id)
            }}
            onEngineStop={() => {
              if (fitted.current === centerId) return
              fitted.current = centerId
              fgRef.current?.zoomToFit(400, 72)
            }}
          />
        )}
      </div>
      <footer className="legend">
        <span><i className="swatch red" /> 未掌握 · 高重要性</span>
        <span><i className="swatch yellow" /> 学习中</span>
        <span><i className="swatch green" /> 已掌握</span>
        <span><i className="swatch gray" /> 低优先级</span>
        <span>环：1/4 未掌握 · 2/3 学习中 · 闭合已掌握</span>
      </footer>
    </section>
  )
}

declare global {
  interface Window {
    __conceptGraph?: { screens: () => ScreenPoint[] }
  }
}
