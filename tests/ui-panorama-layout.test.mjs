import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutPanorama, simFromStars } from '../concept-graph/src/views/panorama/layout.ts'
import { step } from '../concept-graph/src/views/panorama/physics.ts'
import { overlapArea, placeLabels, textWidth } from '../concept-graph/src/views/panorama/labels.ts'
import { fitView, zoomAround } from '../concept-graph/src/views/panorama/viewport.ts'

const star = (id, label) => ({ id, label, level: 1, due: null, importance: 2 })

function sample(goalCount) {
  const goals = [
    { goal: { id: 'g-lab', title: '纸上实验', colorKey: 'amber' }, topicIds: ['t-0'] },
    { goal: { id: 'g-craft', title: '手作研究', colorKey: 'cyan' }, topicIds: ['t-1'] },
  ].slice(0, goalCount)
  return {
    goals,
    topics: [
      { topicId: 't-0', title: '光影观察', goalIds: goalCount > 1 ? ['g-lab', 'g-craft'] : ['g-lab'], groups: [{ name: '基础实验', concepts: [star('c-0', '观察'), star('c-1', '记录')] }] },
      { topicId: 't-1', title: '纸桥搭建', goalIds: ['g-lab'], groups: [{ name: '结构', concepts: [star('c-2', '承重')] }] },
    ],
    gaps: [{ topicId: 't-1', group: '结构', count: 1, why: '还没学' }],
    nextSteps: [{ subject: 'concept:t-0/c-0', topicId: 't-0', conceptId: 'c-0', title: '观察' }],
    relationCandidates: [],
  }
}

test('同一份数据和尺寸，全景布局每次相同', () => {
  const input = sample(2)
  const first = layoutPanorama(input, 1200, 800)
  const second = layoutPanorama(input, 1200, 800)
  assert.deepEqual(second, first)
  assert.equal(first.showPartitions, true)
  assert.equal(first.goals.length, 2)
})

test('只有一个目标时不画分区', () => {
  const layout = layoutPanorama(sample(1), 900, 700)
  assert.equal(layout.showPartitions, false)
  assert.deepEqual(layout.goals, [])
})

test('已确认关联画实线；没有后端候选时不凭同名补画虚线',()=>{
 const input=sample(1);input.topics[1].groups[0].concepts[0].label='观察'
 assert.equal(layoutPanorama(input,900,700).links.length,0)
 input.relationCandidates=[{id:'r',a:'concept:t-0/c-0',b:'concept:t-1/c-2',confirmed:true}]
 assert.equal(layoutPanorama(input,900,700).links[0].kind,'confirmed')
})

function denseSample() {
  const colors = ['amber', 'cyan', 'violet']
  const sizes = [12, 11, 8]
  const goals = sizes.map((_, index) => ({ goal: { id: `g-${index}`, title: `一个相当长的学习目标标题第${index}号：理解与掌握`, colorKey: colors[index] }, topicIds: [`t-${index}`] }))
  const topics = sizes.map((size, index) => ({
    topicId: `t-${index}`,
    title: `主题${index}`,
    goalIds: [`g-${index}`],
    groups: [0, 1, 2, 3].map((group) => ({
      name: `分组${group}`,
      concepts: Array.from({ length: size }, (_, item) => item).filter((item) => item % 4 === group)
        .map((item) => ({ id: `c-${item}`, label: `概念名称${item}`, level: item % 4, due: null, importance: (item % 3) + 1 })),
    })),
  }))
  const relationCandidates = []
  topics.forEach((topic, index) => {
    for (let item = 1; item < sizes[index]; item += 1) {
      relationCandidates.push({ id: `r-${index}-${item}`, a: `concept:t-${index}/c-${item - 1}`, b: `concept:t-${index}/c-${item}`, confirmed: true })
      relationCandidates.push({ id: `d-${index}-${item}`, a: `concept:t-${index}/c-${item}`, b: `concept:t-${index}/c-${item - 1}`, confirmed: true })
    }
  })
  return {
    goals,
    topics,
    gaps: [{ topicId: 't-0', group: '分组1', count: 3, why: '还没学' }],
    nextSteps: [{ subject: 'concept:t-1/c-0', topicId: 't-1', conceptId: 'c-0', title: '概念名称0' }],
    relationCandidates,
  }
}

test('多个目标时星团互不重叠，星都留在自己的星团里，目标标题区不重叠', () => {
  for (const [width, height] of [[1040, 600], [700, 900], [380, 640]]) {
    const layout = layoutPanorama(denseSample(), width, height)
    assert.equal(layout.stars.length, 31)
    for (let i = 0; i < layout.topics.length; i += 1) {
      for (let j = i + 1; j < layout.topics.length; j += 1) {
        const a = layout.topics[i]
        const b = layout.topics[j]
        const apartX = Math.abs(a.cx - b.cx) >= a.r + b.r
        const apartY = Math.abs(a.cy - b.cy) >= a.ry + b.ry
        assert.ok(apartX || apartY, `星团 ${a.topicId} 与 ${b.topicId} 重叠`)
      }
    }
    for (const star of layout.stars) {
      const d = Math.hypot((star.x - star.cx) / star.clusterR, (star.y - star.cy) / star.clusterRy)
      assert.ok(d <= 1.001, `${star.key} 跑出了星团`)
      assert.ok(star.x >= layout.bounds.x0 && star.x <= layout.bounds.x1 && star.y <= layout.bounds.y1)
    }
    for (let i = 0; i < layout.goals.length; i += 1) {
      for (let j = i + 1; j < layout.goals.length; j += 1) {
        const a = layout.goals[i]
        const b = layout.goals[j]
        const apartX = Math.abs(a.x - b.x) >= (a.width + b.width) / 2
        const apartY = Math.abs(a.y - b.y) >= Math.max(a.height, b.height)
        assert.ok(apartX || apartY, '目标标题区重叠')
      }
    }
  }
})

test('同一对星的重复关联只画一条，星团内星彼此保持间距', () => {
  const layout = layoutPanorama(denseSample(), 1040, 600)
  assert.equal(layout.links.length, 11 + 10 + 7)
  for (let i = 0; i < layout.stars.length; i += 1) {
    for (let j = i + 1; j < layout.stars.length; j += 1) {
      const a = layout.stars[i]
      const b = layout.stars[j]
      if (a.topicId !== b.topicId) continue
      assert.ok(Math.hypot((a.x - b.x) / 1.6, a.y - b.y) > 30, `${a.key} 和 ${b.key} 挤在一起`)
    }
  }
})

test('拖动后模拟会停下，松手的星留在星团里', () => {
  const layout = layoutPanorama(denseSample(), 1040, 600)
  const sim = simFromStars(layout.stars, layout.links.filter((link) => link.a).map((link) => ({ a: link.a, b: link.b })))
  const node = sim.nodes[0]
  node.fixed = true
  node.x += 400
  sim.alphaTarget = 0.22
  sim.alpha = 0.35
  for (let tick = 0; tick < 30; tick += 1) step(sim)
  node.fixed = false
  sim.alphaTarget = 0
  let ticks = 0
  while (step(sim)) ticks += 1
  assert.ok(ticks < 400, '模拟没有停下')
  for (const item of sim.nodes) {
    assert.ok(Math.hypot((item.x - item.cx) / item.R, (item.y - item.cy) / item.Ry) <= 1.001)
    assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y))
  }
})

test('标签避让：放出的标签互不重叠，也不压在障碍上；强制标签一定显示', () => {
  const requests = Array.from({ length: 20 }, (_, index) => ({
    id: `s-${index}`, x: 100 + (index % 5) * 30, y: 100 + Math.floor(index / 5) * 20, w: 60, h: 16, rx: 5, ry: 5,
    force: index === 7, self: `s-${index}`, shape: 'star',
  }))
  const obstacles = requests.map((req) => ({ id: req.id, x0: req.x - 6, y0: req.y - 6, x1: req.x + 6, y1: req.y + 6 }))
  const placed = placeLabels(requests, obstacles)
  assert.ok(placed.some((rect) => rect.id === 's-7'))
  const free = placed.filter((rect) => rect.id !== 's-7')
  for (let i = 0; i < free.length; i += 1) {
    for (let j = i + 1; j < free.length; j += 1) assert.equal(overlapArea(free[i], free[j]), 0)
    for (const obstacle of obstacles) {
      if (obstacle.id === free[i].id) continue
      assert.equal(overlapArea(free[i], obstacle), 0)
    }
  }
  assert.ok(textWidth('缺口 · 仓位', 12) > textWidth('abc', 12))
})

test('适配视口把内容放进可视区域，滚轮缩放保持光标下的点不动', () => {
  const safe = { x0: 28, y0: 124, x1: 1060, y1: 740, narrow: false, skyH: 900 }
  const bounds = { x0: 0, y0: 0, x1: 1300, y1: 500 }
  const view = fitView(bounds, safe)
  assert.ok(bounds.x0 * view.k + view.tx >= safe.x0 - 0.01)
  assert.ok(bounds.x1 * view.k + view.tx <= safe.x1 + 0.01)
  assert.ok(bounds.y1 * view.k + view.ty <= safe.y1 + 0.01)
  const zoomed = zoomAround(view, 400, 300, 1.7)
  const before = { x: (400 - view.tx) / view.k, y: (300 - view.ty) / view.k }
  const after = { x: (400 - zoomed.tx) / zoomed.k, y: (300 - zoomed.ty) / zoomed.k }
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9)
})
