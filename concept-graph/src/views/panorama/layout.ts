/** 全景布局只由数据决定。同一份数据和同一宽高，每次坐标相同。 */

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
}

export interface PlacedTopic {
  topicId: string
  title: string
  x: number
  y: number
  learned: number
  total: number
  pending: boolean
  goalIds: string[]
}

export interface PlacedGoal {
  id: string
  title: string
  colorKey: 'amber' | 'cyan' | 'violet'
  x: number
  y: number
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
  kind: 'relation' | 'same-name' | 'tether'
}

export interface PanoramaLayout {
  showPartitions: boolean
  goals: PlacedGoal[]
  topics: PlacedTopic[]
  stars: PlacedStar[]
  gaps: PlacedGap[]
  next: PlacedNext[]
  links: PlacedLink[]
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

export function layoutPanorama(input: LayoutInput, width: number, height: number): PanoramaLayout {
  const fieldWidth = Math.max(320, width)
  const fieldHeight = Math.max(360, height)
  const goals = input.goals
  const showPartitions = goals.length > 1
  const columns = Math.max(1, goals.length)
  const padX = fieldWidth < 720 ? 36 : 72
  const top = 128
  const bottom = fieldWidth < 720 ? 230 : 150
  const colWidth = (fieldWidth - padX * 2) / columns
  const goalCenters = goals.map((entry, index) => ({
    id: entry.goal.id,
    title: entry.goal.title,
    colorKey: entry.goal.colorKey,
    x: padX + colWidth * index + colWidth / 2,
    y: top + 28,
  }))
  const goalOfTopic = (topic: LayoutTopic): LayoutGoal | undefined => (
    goals.find((entry) => entry.topicIds.includes(topic.topicId))
    ?? goals.find((entry) => topic.goalIds.includes(entry.goal.id))
    ?? goals[0]
  )
  const byGoal = new Map<string, LayoutTopic[]>()
  for (const topic of input.topics) {
    const goal = goalOfTopic(topic)
    const key = goal?.goal.id ?? '_all'
    const list = byGoal.get(key) ?? []
    list.push(topic)
    byGoal.set(key, list)
  }
  const stars: PlacedStar[] = []
  const topics: PlacedTopic[] = []
  const buckets = showPartitions ? goals.map((entry) => entry.goal.id) : ['_all']
  if (!showPartitions) {
    byGoal.set('_all', input.topics)
  }
  buckets.forEach((goalId, column) => {
    const list = byGoal.get(goalId) ?? []
    const originX = showPartitions ? padX + colWidth * column + colWidth / 2 : fieldWidth / 2
    const span = Math.max(1, list.length)
    list.forEach((topic, topicIndex) => {
      const y = top + 78 + ((fieldHeight - top - bottom - 40) * (topicIndex + 0.5)) / span
      const concepts = topic.groups.flatMap((group) => group.concepts.map((concept) => ({ ...concept, group: group.name })))
      const learned = concepts.filter((concept) => concept.level >= 1).length
      topics.push({
        topicId: topic.topicId,
        title: topic.title,
        x: originX,
        y: y + 62,
        learned,
        total: concepts.length,
        pending: topic.goalIds.length > 1,
        goalIds: topic.goalIds,
      })
      const groupNames = [...new Set(concepts.map((concept) => concept.group))]
      groupNames.forEach((name, groupIndex) => {
        const members = concepts.filter((concept) => concept.group === name)
        const spread = Math.min(46, 18 + members.length * 8)
        const angle0 = ((hashText(`${topic.topicId}/${name}`) % 360) * Math.PI) / 180
        const gx = originX + Math.cos(angle0 + groupIndex) * (groupNames.length > 1 ? 36 : 0)
        const gy = y + Math.sin(angle0 + groupIndex * 0.7) * (groupNames.length > 1 ? 16 : 0)
        members.forEach((concept, conceptIndex) => {
          const turn = angle0 + (Math.PI * 2 * conceptIndex) / Math.max(1, members.length)
          const colorKey = goalCenters.find((goal) => topic.goalIds.includes(goal.id))?.colorKey
            ?? goals[0]?.goal.colorKey
            ?? 'amber'
          stars.push({
            key: `${topic.topicId}/${concept.id}`,
            topicId: topic.topicId,
            conceptId: concept.id,
            label: concept.label,
            group: name,
            x: gx + Math.cos(turn) * spread * 0.55,
            y: gy + Math.sin(turn) * spread * 0.42,
            radius: radiusFor(concept.importance),
            level: concept.level,
            importance: concept.importance,
            due: concept.due,
            colorKey,
            goalIds: topic.goalIds,
          })
        })
      })
    })
  })

  const gaps: PlacedGap[] = []
  for (const gap of input.gaps) {
    const members = stars.filter((star) => star.topicId === gap.topicId && star.group === gap.group)
    if (members.length === 0) continue
    const xs = members.map((star) => star.x)
    const ys = members.map((star) => star.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    gaps.push({
      topicId: gap.topicId,
      group: gap.group,
      count: gap.count,
      why: gap.why,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      rx: Math.max(36, (maxX - minX) / 2 + 28),
      ry: Math.max(28, (maxY - minY) / 2 + 22),
    })
  }

  const next: PlacedNext[] = []
  input.nextSteps.slice(0, 3).forEach((step, index) => {
    const star = stars.find((item) => (
      item.topicId === step.topicId && (step.conceptId === null || item.conceptId === step.conceptId)
    )) ?? stars.find((item) => item.label === step.title)
    if (!star) return
    next.push({
      key: star.key,
      index: index + 1,
      x: star.x,
      y: star.y,
      title: step.title,
      topicId: star.topicId,
      conceptId: star.conceptId,
    })
  })

  const links: PlacedLink[] = []
  const starByKey = new Map(stars.map((star) => [star.key, star]))
  for (const relation of input.relationCandidates) {
    if (relation.confirmed) continue
    const left = starByKey.get(relation.a.replace(/^concept:/, ''))
    const right = starByKey.get(relation.b.replace(/^concept:/, ''))
    if (!left || !right) continue
    links.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y, kind: 'relation' })
  }
  const byLabel = new Map<string, PlacedStar[]>()
  for (const star of stars) {
    const list = byLabel.get(star.label) ?? []
    list.push(star)
    byLabel.set(star.label, list)
  }
  for (const group of byLabel.values()) {
    const topicsInLabel = new Set(group.map((star) => star.topicId))
    if (topicsInLabel.size < 2) continue
    const [left, right] = group
    links.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y, kind: 'same-name' })
  }
  if (showPartitions) {
    for (const topic of topics) {
      if (topic.goalIds.length < 2) continue
      const home = goalCenters.find((goal) => goal.id === topic.goalIds[0])
      const away = goalCenters.find((goal) => goal.id === topic.goalIds[1])
      if (!home || !away) continue
      links.push({ x1: topic.x, y1: topic.y, x2: away.x, y2: away.y + 36, kind: 'tether' })
    }
  }

  return {
    showPartitions,
    goals: showPartitions ? goalCenters : [],
    topics,
    stars,
    gaps,
    next,
    links,
  }
}
