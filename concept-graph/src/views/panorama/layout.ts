/**
 * 全景布局只由数据决定。同一份数据和同一视口尺寸，每次坐标相同。
 *
 * 坐标是「世界坐标」：每个目标占一块，块内每个主题占一个星团圆，
 * 星在圆内由力导向排开。视图再按视口做适配缩放和平移。
 * 视口尺寸只决定目标块排成几列，不改变星团内部的结构。
 */
import { createSim, settle, type Sim, type SimLink, type SimNode } from './physics.ts'

export interface LayoutConcept {
  id: string
  label: string
  level: 0 | 1 | 2 | 3
  due: string | null
  importance: 1 | 2 | 3
}

export interface LayoutTopic {
  topicId: string
  title: string
  goalIds: string[]
  groups: { name: string; concepts: LayoutConcept[] }[]
}

export interface LayoutGoal {
  goal: { id: string; title: string; colorKey: 'amber' | 'cyan' | 'violet' }
  topicIds: string[]
}

export interface LayoutGap {
  topicId: string
  group: string
  count: number
  why: string
}

export interface LayoutNext {
  subject: string
  topicId: string
  conceptId: string | null
  title: string
}

export interface LayoutRelation {
  id: string
  a: string
  b: string
  confirmed: boolean
}

export interface LayoutInput {
  goals: LayoutGoal[]
  topics: LayoutTopic[]
  gaps: LayoutGap[]
  nextSteps: LayoutNext[]
  relationCandidates: LayoutRelation[]
}

export interface PlacedStar {
  key: string
  topicId: string
  conceptId: string
  label: string
  group: string
  x: number
  y: number
  radius: number
  level: 0 | 1 | 2 | 3
  importance: 1 | 2 | 3
  due: string | null
  colorKey: 'amber' | 'cyan' | 'violet'
  goalIds: string[]
  /** 分组锚点（力导向回弹的目标） */
  ax: number
  ay: number
  /** 所属主题星团椭圆中心与横、纵半轴 */
  cx: number
  cy: number
  clusterR: number
  clusterRy: number
}

export interface PlacedTopic {
  topicId: string
  title: string
  /** 主题名牌顶部中点 */
  x: number
  y: number
  /** 星团椭圆中心与横、纵半轴 */
  cx: number
  cy: number
  r: number
  ry: number
  learned: number
  total: number
  pending: boolean
  goalIds: string[]
}

export interface PlacedGoal {
  id: string
  title: string
  colorKey: 'amber' | 'cyan' | 'violet'
  /** 标题区顶部中点 */
  x: number
  y: number
  /** 标题可用宽度与高度（世界坐标） */
  width: number
  height: number
}

export interface PlacedGap {
  topicId: string
  group: string
  count: number
  why: string
  x: number
  y: number
  rx: number
  ry: number
}

export interface PlacedNext {
  key: string
  index: number
  x: number
  y: number
  title: string
  topicId: string
  conceptId: string | null
}

export interface PlacedLink {
  x1: number
  y1: number
  x2: number
  y2: number
  kind: 'relation' | 'same-name' | 'tether' | 'confirmed'
  /** 两端星的 key；牵引线没有 */
  a?: string
  b?: string
}

export interface PanoramaLayout {
  showPartitions: boolean
  goals: PlacedGoal[]
  topics: PlacedTopic[]
  stars: PlacedStar[]
  gaps: PlacedGap[]
  next: PlacedNext[]
  links: PlacedLink[]
  /** 全部内容的世界坐标外框，供视图适配缩放 */
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

export function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function radiusFor(importance: 1 | 2 | 3): number {
  if (importance >= 3) return 7
  if (importance === 2) return 5.5
  return 4
}

/** 星团半径随星数增长，给每颗星和它的标签留出位置。 */
export function clusterRadius(count: number): number {
  return Math.round(64 + 26 * Math.sqrt(Math.max(1, count)))
}

/** 目标标题在世界坐标里占的高度（标题随缩放一起缩放） */
export const GOAL_TITLE_H = 84
const CLUSTER_PAD_X = 46
const PILL_H = 60
const BLOCK_GAP_X = 56
const BLOCK_GAP_Y = 64
const COLLIDE_R = 25
const SETTLE_TICKS = 360

export function layoutPanorama(input: LayoutInput, width: number, height: number): PanoramaLayout {
  const viewW = Math.max(280, width)
  const viewH = Math.max(320, height)
  const goals = input.goals
  const showPartitions = goals.length > 1
  const goalOfTopic = (topic: LayoutTopic): LayoutGoal | undefined => (
    goals.find((entry) => entry.topicIds.includes(topic.topicId))
    ?? goals.find((entry) => topic.goalIds.includes(entry.goal.id))
    ?? goals[0]
  )
  const byGoal = new Map<string, LayoutTopic[]>()
  if (showPartitions) {
    for (const topic of input.topics) {
      const key = goalOfTopic(topic)?.goal.id ?? goals[0].goal.id
      byGoal.set(key, [...(byGoal.get(key) ?? []), topic])
    }
  } else {
    byGoal.set('_all', input.topics)
  }
  const buckets = showPartitions ? goals.map((entry) => entry.goal.id) : ['_all']
  const countOf = (topic: LayoutTopic) => topic.groups.reduce((sum, group) => sum + group.concepts.length, 0)

  // 每个目标块：主题按近似方阵排列；所有块统一尺寸，方便对齐。
  const shapes = buckets.map((id) => {
    const list = byGoal.get(id) ?? []
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)))
    const rows = Math.max(1, Math.ceil(list.length / cols))
    return { id, list, cols, rows }
  })
  const maxR = Math.max(clusterRadius(1), ...input.topics.map((topic) => clusterRadius(countOf(topic))))
  const cellW = maxR * 2 + CLUSTER_PAD_X * 2
  const titleH = showPartitions ? GOAL_TITLE_H : 0
  const maxCols = Math.max(...shapes.map((shape) => shape.cols))
  const maxRows = Math.max(...shapes.map((shape) => shape.rows))
  const blockW = maxCols * cellW
  const blockHFor = (stretch: number) => titleH + maxRows * (maxR * 2 * stretch + PILL_H + 24)

  // 目标块排几列：取能让整体在视口里放得最大的列数；并列时取列数多的。
  let gridCols = 1
  let bestScale = 0
  for (let cols = 1; cols <= buckets.length; cols += 1) {
    const rows = Math.ceil(buckets.length / cols)
    const worldW = cols * blockW + (cols - 1) * BLOCK_GAP_X
    const worldH = rows * blockHFor(1) + (rows - 1) * BLOCK_GAP_Y
    const scale = Math.min(viewW / worldW, viewH / worldH)
    if (scale >= bestScale - 1e-9) {
      bestScale = scale
      gridCols = cols
    }
  }
  const gridRows = Math.ceil(buckets.length / gridCols)
  // 宽度先撑满时，把星团纵向拉长去用掉多出来的高度，星和标签就更松。
  const spareH = viewH / bestScale - (gridRows * blockHFor(1) + (gridRows - 1) * BLOCK_GAP_Y)
  const stretch = Math.min(1.3, Math.max(1, 1 + (spareH * 0.55) / (gridRows * maxRows * maxR * 2)))
  const cellH = maxR * 2 * stretch + PILL_H + 24
  const blockH = blockHFor(stretch)

  const goalCenters: PlacedGoal[] = []
  const topics: PlacedTopic[] = []
  const stars: PlacedStar[] = []
  const anchors = new Map<string, { ax: number; ay: number }>()
  const topTop = new Map<string, number>()
  const colorOf = (topic: LayoutTopic) => (
    goals.find((entry) => topic.goalIds.includes(entry.goal.id))?.goal.colorKey
    ?? goalOfTopic(topic)?.goal.colorKey
    ?? 'amber'
  )

  shapes.forEach((shape, blockIndex) => {
    const bx = (blockIndex % gridCols) * (blockW + BLOCK_GAP_X)
    const by = Math.floor(blockIndex / gridCols) * (blockH + BLOCK_GAP_Y)
    const entry = goals.find((item) => item.goal.id === shape.id)
    if (showPartitions && entry) {
      goalCenters.push({
        id: entry.goal.id,
        title: entry.goal.title,
        colorKey: entry.goal.colorKey,
        x: bx + blockW / 2,
        y: by,
        width: blockW - 24,
        height: titleH,
      })
    }
    // 块内主题居中排布
    const usedW = shape.cols * cellW
    const offsetX = bx + (blockW - usedW) / 2
    shape.list.forEach((topic, topicIndex) => {
      const col = topicIndex % shape.cols
      const row = Math.floor(topicIndex / shape.cols)
      const r = clusterRadius(countOf(topic))
      const ry = Math.round(r * stretch)
      const cx = offsetX + (col + 0.5) * cellW
      const cy = by + titleH + row * cellH + maxR * stretch + 8
      topTop.set(topic.topicId, by + titleH + row * cellH + 22)
      const concepts = topic.groups.flatMap((group) => group.concepts.map((concept) => ({ ...concept, group: group.name })))
      topics.push({
        topicId: topic.topicId,
        title: topic.title,
        x: cx,
        y: cy + ry + 24,
        cx,
        cy,
        r,
        ry,
        learned: concepts.filter((concept) => concept.level >= 1).length,
        total: concepts.length,
        pending: topic.goalIds.length > 1,
        goalIds: topic.goalIds,
      })
      const groupNames = [...new Set(concepts.map((concept) => concept.group))]
      const base = ((hashText(topic.topicId) % 360) * Math.PI) / 180
      const ring = groupNames.length > 1 ? r * 0.52 : 0
      groupNames.forEach((name, groupIndex) => {
        const turn = base + (Math.PI * 2 * groupIndex) / Math.max(1, groupNames.length)
        anchors.set(`${topic.topicId}\u0000${name}`, {
          ax: cx + Math.cos(turn) * ring * 1.1,
          ay: cy + Math.sin(turn) * ring * 0.95 * stretch,
        })
      })
      const colorKey = colorOf(topic)
      concepts.forEach((concept) => {
        const anchor = anchors.get(`${topic.topicId}\u0000${concept.group}`) ?? { ax: cx, ay: cy }
        const memberIndex = concepts.filter((item) => item.group === concept.group).findIndex((item) => item.id === concept.id)
        const angle = ((hashText(`${topic.topicId}/${concept.id}`) % 360) * Math.PI) / 180 + memberIndex * 2.4
        const dist = 8 + 14 * Math.sqrt(memberIndex)
        stars.push({
          key: `${topic.topicId}/${concept.id}`,
          topicId: topic.topicId,
          conceptId: concept.id,
          label: concept.label,
          group: concept.group,
          x: anchor.ax + Math.cos(angle) * dist,
          y: anchor.ay + Math.sin(angle) * dist,
          radius: radiusFor(concept.importance),
          level: concept.level,
          importance: concept.importance,
          due: concept.due,
          colorKey,
          goalIds: topic.goalIds,
          ax: anchor.ax,
          ay: anchor.ay,
          cx,
          cy,
          clusterR: r,
          clusterRy: ry,
        })
      })
    })
  })

  // 关联：去掉重复的无向边，已确认优先。
  const starByKey = new Map(stars.map((star) => [star.key, star]))
  const pairs = new Map<string, { a: string; b: string; confirmed: boolean }>()
  for (const relation of input.relationCandidates) {
    const a = relation.a.replace(/^concept:/, '')
    const b = relation.b.replace(/^concept:/, '')
    if (a === b || !starByKey.has(a) || !starByKey.has(b)) continue
    const id = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
    const prev = pairs.get(id)
    if (!prev) pairs.set(id, { a, b, confirmed: relation.confirmed })
    else if (relation.confirmed) prev.confirmed = true
  }

  // 力导向排开星团内部，固定步数，结果确定。
  const sim = simFromStars(stars, [...pairs.values()], 1)
  settle(sim, SETTLE_TICKS)
  sim.nodes.forEach((node, index) => {
    stars[index].x = round(node.x)
    stars[index].y = round(node.y)
  })
  // 星团没占满椭圆时，整体上移贴近目标标题，主题名牌紧跟在最下面的星下方。
  for (const topic of topics) {
    const members = stars.filter((star) => star.topicId === topic.topicId)
    if (members.length === 0) continue
    const minY = Math.min(...members.map((star) => star.y))
    const shift = Math.min(0, (topTop.get(topic.topicId) ?? minY) - minY)
    for (const star of members) {
      star.y = round(star.y + shift)
      star.ay = round(star.ay + shift)
      star.cy = round(star.cy + shift)
    }
    topic.cy = round(topic.cy + shift)
    topic.y = round(Math.min(topic.y + shift, Math.max(...members.map((star) => star.y)) + 36))
  }

  const gaps: PlacedGap[] = []
  for (const gap of input.gaps) {
    const members = stars.filter((star) => star.topicId === gap.topicId && star.group === gap.group)
    if (members.length === 0) continue
    gaps.push({ topicId: gap.topicId, group: gap.group, count: gap.count, why: gap.why, ...gapEllipse(members) })
  }

  const next: PlacedNext[] = []
  input.nextSteps.slice(0, 3).forEach((stepItem, index) => {
    const star = stars.find((item) => (
      item.topicId === stepItem.topicId && (stepItem.conceptId === null || item.conceptId === stepItem.conceptId)
    )) ?? stars.find((item) => item.label === stepItem.title)
    if (!star) return
    next.push({
      key: star.key,
      index: index + 1,
      x: star.x,
      y: star.y,
      title: stepItem.title,
      topicId: star.topicId,
      conceptId: star.conceptId,
    })
  })

  const links: PlacedLink[] = []
  for (const pair of pairs.values()) {
    const left = starByKey.get(pair.a)!
    const right = starByKey.get(pair.b)!
    links.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y, kind: pair.confirmed ? 'confirmed' : 'relation', a: pair.a, b: pair.b })
  }
  if (showPartitions) {
    for (const topic of topics) {
      if (topic.goalIds.length < 2) continue
      const away = goalCenters.find((goal) => goal.id === topic.goalIds[1])
      if (!away) continue
      links.push({ x1: topic.cx, y1: topic.cy, x2: away.x, y2: away.y + away.height - 12, kind: 'tether' })
    }
  }

  const gridW = gridCols * blockW + (gridCols - 1) * BLOCK_GAP_X
  const gridH = Math.max(
    titleH,
    ...topics.map((topic) => topic.y + PILL_H - 20),
    ...stars.map((star) => star.y + 30),
  )
  return {
    showPartitions,
    goals: showPartitions ? goalCenters : [],
    topics,
    stars,
    gaps,
    next,
    links,
    bounds: { x0: 0, y0: 0, x1: gridW, y1: gridH },
  }
}

/** 由已排好的星构造模拟；视图拖拽时用同一套力。 */
export function simFromStars(stars: PlacedStar[], pairs: { a: string; b: string }[], alpha = 0): Sim {
  const index = new Map(stars.map((star, position) => [star.key, position]))
  const nodes: SimNode[] = stars.map((star) => ({
    key: star.key,
    topic: star.topicId,
    x: star.x,
    y: star.y,
    vx: 0,
    vy: 0,
    r: COLLIDE_R,
    ax: star.ax,
    ay: star.ay,
    cx: star.cx,
    cy: star.cy,
    R: star.clusterR,
    Ry: star.clusterRy,
    fixed: false,
  }))
  const links: SimLink[] = []
  for (const pair of pairs) {
    const s = index.get(pair.a)
    const t = index.get(pair.b)
    if (s !== undefined && t !== undefined) links.push({ s, t })
  }
  return createSim(nodes, links, alpha)
}

/** 包住一组星的椭圆（世界坐标） */
export function gapEllipse(members: { x: number; y: number }[]): { x: number; y: number; rx: number; ry: number } {
  const xs = members.map((star) => star.x)
  const ys = members.map((star) => star.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    rx: Math.max(30, ((maxX - minX) / 2) * 1.35 + 20),
    ry: Math.max(24, ((maxY - minY) / 2) * 1.35 + 18),
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
