import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutPanorama } from '../concept-graph/src/views/panorama/layout.ts'

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
