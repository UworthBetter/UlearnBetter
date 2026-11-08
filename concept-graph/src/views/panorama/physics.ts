/**
 * 全景星图的轻量力导向模拟。只在同一主题的星之间产生作用，
 * 每颗星被拉向所属分组的锚点，并被限制在主题星团椭圆内，
 * 所以星团之间永远不会挤在一起。没有随机数，同样的初值得到同样的结果。
 */

export interface SimNode {
  key: string
  topic: string
  x: number
  y: number
  vx: number
  vy: number
  /** 碰撞半径（世界坐标）。水平方向会按 ASPECT 放大，给横排标签留位置。 */
  r: number
  /** 分组锚点 */
  ax: number
  ay: number
  /** 主题星团椭圆中心与横、纵半轴 */
  cx: number
  cy: number
  R: number
  Ry: number
  fixed: boolean
}

export interface SimLink {
  s: number
  t: number
}

export interface Sim {
  nodes: SimNode[]
  links: SimLink[]
  alpha: number
  alphaTarget: number
}

const ASPECT = 1.6
const LINK_REST = 92
const VELOCITY_KEEP = 0.58
const ALPHA_DECAY = 0.028
export const ALPHA_MIN = 0.004

export function createSim(nodes: SimNode[], links: SimLink[], alpha = 1): Sim {
  const sameTopic = links.filter((link) => (
    link.s !== link.t && nodes[link.s] && nodes[link.t] && nodes[link.s].topic === nodes[link.t].topic
  ))
  return { nodes, links: sameTopic, alpha, alphaTarget: 0 }
}

/** 前进一步。返回模拟是否仍在运动。 */
export function step(sim: Sim): boolean {
  const { nodes, links } = sim
  const a = sim.alpha
  for (const node of nodes) {
    if (node.fixed) continue
    node.vx += (node.ax - node.x) * 0.03 * a + (node.cx - node.x) * 0.004 * a
    node.vy += (node.ay - node.y) * 0.03 * a + (node.cy - node.y) * 0.004 * a
  }
  for (const link of links) {
    const s = nodes[link.s]
    const t = nodes[link.t]
    const dx = t.x - s.x
    const dy = t.y - s.y
    const d = Math.hypot(dx, dy) || 1
    const pull = ((d - LINK_REST) / d) * 0.012 * a
    if (!s.fixed) { s.vx += dx * pull; s.vy += dy * pull }
    if (!t.fixed) { t.vx -= dx * pull; t.vy -= dy * pull }
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const p = nodes[i]
    for (let j = i + 1; j < nodes.length; j += 1) {
      const q = nodes[j]
      if (p.topic !== q.topic) continue
      let dx = q.x - p.x
      let dy = q.y - p.y
      if (dx === 0 && dy === 0) { dx = (j - i) * 0.37; dy = (i + 1) * 0.21 }
      const d2 = (dx / ASPECT) ** 2 + dy * dy
      if (d2 > 260 * 260) continue
      const d = Math.sqrt(d2) || 1
      const push = (2600 * a) / Math.max(d2, 64)
      const ux = dx / d
      const uy = dy / d
      if (!p.fixed) { p.vx -= ux * push; p.vy -= uy * push }
      if (!q.fixed) { q.vx += ux * push; q.vy += uy * push }
    }
  }
  for (const node of nodes) {
    if (node.fixed) { node.vx = 0; node.vy = 0; continue }
    node.vx *= VELOCITY_KEEP
    node.vy *= VELOCITY_KEEP
    node.x += node.vx
    node.y += node.vy
  }
  for (let pass = 0; pass < 2; pass += 1) collide(nodes)
  for (const node of nodes) {
    if (node.fixed) continue
    const dx = node.x - node.cx
    const dy = node.y - node.cy
    const ex = Math.max(1, node.R - node.r * 0.6)
    const ey = Math.max(1, node.Ry - node.r * 0.6)
    const d = Math.hypot(dx / ex, dy / ey)
    if (d > 1) {
      node.x = node.cx + dx / d
      node.y = node.cy + dy / d
    }
  }
  sim.alpha += (sim.alphaTarget - sim.alpha) * ALPHA_DECAY
  return sim.alpha > ALPHA_MIN || sim.alphaTarget > 0
}

function collide(nodes: SimNode[]) {
  for (let i = 0; i < nodes.length; i += 1) {
    const p = nodes[i]
    for (let j = i + 1; j < nodes.length; j += 1) {
      const q = nodes[j]
      if (p.topic !== q.topic || (p.fixed && q.fixed)) continue
      const dx = (q.x - p.x) / ASPECT
      const dy = q.y - p.y
      const min = p.r + q.r
      const d = Math.hypot(dx, dy)
      if (d >= min) continue
      const safe = d || 0.01
      const overlap = (min - safe) / safe
      const ox = (dx || 0.01) * overlap * ASPECT
      const oy = (dy || 0.01) * overlap
      const share = p.fixed ? 0 : q.fixed ? 1 : 0.5
      p.x -= ox * share
      p.y -= oy * share
      q.x += ox * (1 - share)
      q.y += oy * (1 - share)
    }
  }
}

export function settle(sim: Sim, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) step(sim)
  sim.alpha = 0
}
