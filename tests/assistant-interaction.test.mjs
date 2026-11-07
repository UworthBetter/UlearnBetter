import test from 'node:test'
import assert from 'node:assert/strict'
import { createInteractionReporter } from '../concept-graph/src/star-dive/modules/interaction.ts'
import { createLearningSession } from '../concept-graph/src/assistant/context-store.ts'

test('module reports are isolated from later changes and deduplicated', () => {
  const updates = []
  const report = createInteractionReporter(new AbortController().signal, (value) => updates.push(value))
  const parameters = { n: 8 }
  report({ parameters, readouts: { value: 256 } })
  report({ parameters, readouts: { value: 256 } })
  parameters.n = 9
  report({ parameters, readouts: { value: 512 } })
  assert.equal(updates.length, 2)
  assert.equal(updates[0].parameters.n, 8)
  assert.equal(updates[1].readouts.value, 512)
})

test('closing a module prevents its timer or animation from changing the next card', () => {
  const controller = new AbortController()
  const updates = []
  const report = createInteractionReporter(controller.signal, (value) => updates.push(value))
  report({ parameters: { step: 1 }, readouts: { label: '开始' } })
  controller.abort()
  report({ parameters: { step: 2 }, readouts: { label: '迟到的动画' } })
  assert.equal(updates.length, 1)
})

test('non-finite numbers and objects cannot masquerade as chart readings', () => {
  let update
  const report = createInteractionReporter(new AbortController().signal, (value) => { update = value })
  report({ parameters: { n: 5, invalid: NaN }, readouts: {
    infinity: Infinity, negative: -Infinity, missing: undefined,
    object: { n: 1 }, valid: 12.5, visible: true, label: '当前曲线',
  } })
  assert.deepEqual(update, { parameters: { n: 5 }, readouts: { valid: 12.5, visible: true, label: '当前曲线' } })
})

test('a question captures exact readings without retaining a closed card interaction', () => {
  const session = createLearningSession()
  const scene = { view: 'star-dive', topic: { id: 'cs', title: 'CS' },
    concept: { id: 'bits', label: '比特', summary: '说明', relatedIds: [], cards: [] },
    card: { id: 'bits:card:1', type: 'param_demo', title: '位数', content: {}, evidence: [] }, interaction: null }
  session.updateScene(scene)
  const controller = new AbortController()
  const report = createInteractionReporter(controller.signal, (interaction) => session.updateScene({ ...scene, interaction }))
  report({ parameters: { n: 8 }, readouts: { possibilities: 256 } })
  const question = session.capture()
  controller.abort()
  session.updateScene({ ...scene, card: null, interaction: null })
  report({ parameters: { n: 9 }, readouts: { possibilities: 512 } })
  assert.equal(question.interaction.readouts.possibilities, 256)
  assert.equal(session.getSnapshot().interaction, null)
  assert.equal(session.getSnapshot().card, null)
})
