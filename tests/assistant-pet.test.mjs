import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantPetMotion, clampPetPosition } from '../concept-graph/src/assistant/ui/pet-state.ts'

const idle = {
  running: false, hasAnswer: false, hasTools: false, error: false,
  stopped: false, connectionError: false, demoMode: false,
}

test('assistant reactions follow waiting, streaming and tool work', () => {
  assert.equal(assistantPetMotion(idle), 'idle')
  assert.equal(assistantPetMotion({ ...idle, running: true }), 'thinking')
  assert.equal(assistantPetMotion({ ...idle, running: true, hasAnswer: true }), 'processing')
  assert.equal(assistantPetMotion({ ...idle, running: true, hasTools: true }), 'processing')
})

test('a stopped partial reply never becomes a success reaction', () => {
  assert.equal(assistantPetMotion({ ...idle, hasAnswer: true, stopped: true }), 'idle')
  assert.equal(assistantPetMotion({ ...idle, running: true, hasAnswer: true, stopped: true }), 'idle')
})

test('demo works independently of runtime outages and real errors remain visible', () => {
  assert.equal(assistantPetMotion({ ...idle, connectionError: true }), 'error')
  assert.equal(assistantPetMotion({ ...idle, connectionError: true, demoMode: true, running: true }), 'thinking')
  assert.equal(assistantPetMotion({ ...idle, hasAnswer: true, error: true }), 'error')
})

test('dragging and resizing keep the full pet inside normal and narrow viewports', () => {
  assert.deepEqual(clampPetPosition(-200, -100, 168, 149, 1280, 800), { x: 8, y: 8 })
  assert.deepEqual(clampPetPosition(2000, 2000, 168, 149, 1280, 800), { x: 1104, y: 643 })
  assert.deepEqual(clampPetPosition(900, 700, 112, 100, 320, 568), { x: 200, y: 460 })
})
