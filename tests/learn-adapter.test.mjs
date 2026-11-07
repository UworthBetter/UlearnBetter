import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptLearnDocument } from '../concept-graph/src/star-dive/learn-adapter.ts'
const block = (id, shape = 'definition') => ({ id, shape, title: id, ev: [{ note: 'concept.md' }, { src: 'v2', t: 12 }] })
const fixture = () => ({ schema: 'learning.learn/0.1', topic: { id: 'finance', title: '学习主题' },
  sources: [{ id: 'v1', platform: 'youtube', ref: 'first' }, { id: 'v2', platform: 'youtube', ref: 'second' }],
  concepts: [{ id: 'ma', label: 'MA', one_liner: '平均', blocks: [block('def')] }], relations: [], procedures: [] })
test('import keeps video identities and note provenance without inventing timeline times', () => {
  const result = adaptLearnDocument(fixture())
  assert.equal(result.meta.topic_id, 'finance')
  assert.equal(result.meta.duration_sec, 0)
  assert.equal(result.concepts[0].cards[0].evidence[1].url, 'https://www.youtube.com/watch?v=second&t=12s')
  assert.equal(result.concepts[0].cards[0].evidence[0].note, 'concept.md')
})
test('more than four blocks remain accessible through collection', () => {
  const input = fixture()
  input.concepts[0].blocks = Array.from({ length: 7 }, (_, i) => block(`b${i}`))
  const cards = adaptLearnDocument(input).concepts[0].cards
  assert.equal(cards.length, 4)
  assert.equal(cards[3].block.children.length, 4)
})
test('duplicate ids and malformed table cells are rejected before rendering', () => {
  const input = fixture()
  input.concepts.push(input.concepts[0])
  assert.throws(() => adaptLearnDocument(input))
  const malformed = fixture()
  malformed.concepts[0].blocks[0].cells = [null]
  assert.throws(() => adaptLearnDocument(malformed))
})
test('procedure nodes have no invented prerequisite relation', () => {
  const input = fixture()
  input.procedures = [block('setup', 'procedure')]
  const result = adaptLearnDocument(input)
  assert.equal(result.concepts.length, 2)
  assert.deepEqual(result.concepts[1].relations, [])
})
