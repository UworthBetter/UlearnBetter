import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantPetMotion, clampPetPosition, clampPetScale, placeAssistantPanel, PET_SCALE_DEFAULT, PET_SCALE_MAX, PET_SCALE_MIN } from '../concept-graph/src/assistant/ui/pet-state.ts'

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

const petAt = (x, y) => ({ x, y, width: 168, height: 149 })

test('the pet can be resized, but only inside a usable range', () => {
  assert.equal(clampPetScale(100), 100)
  assert.equal(clampPetScale(PET_SCALE_MIN - 30), PET_SCALE_MIN)
  assert.equal(clampPetScale(PET_SCALE_MAX + 30), PET_SCALE_MAX)
  assert.equal(clampPetScale(117.6), 118)
  assert.equal(clampPetScale(Number.NaN), PET_SCALE_DEFAULT)
  assert.equal(clampPetScale(Number.POSITIVE_INFINITY), PET_SCALE_DEFAULT)
  // A resized pet still has to fit when dragged to the edge.
  assert.deepEqual(clampPetPosition(2000, 2000, 252, 224, 1280, 800), { x: 1020, y: 568 })
})

test('the chat panel hangs above the pet wherever the pet is dragged', () => {
  const corner = placeAssistantPanel(petAt(1256, 739), { width: 1440, height: 900 })
  assert.equal(corner.placement, 'above')
  assert.equal(corner.width, 424)
  assert.equal(corner.left, 1000)
  assert.equal(corner.bottom, 169)
  assert.equal(corner.top, null)
  assert.equal(corner.maxHeight, 620)

  const moved = placeAssistantPanel(petAt(600, 700), { width: 1440, height: 900 })
  assert.equal(moved.placement, 'above')
  assert.equal(moved.left, 472)
  assert.equal(moved.width, 424)
  assert.equal(moved.bottom, 208)
  // centred over the pet, not pushed against the right edge
  assert.equal(moved.left + moved.width / 2, 684)
})

test('the panel flips below the pet and never leaves the viewport', () => {
  const topLeft = placeAssistantPanel(petAt(8, 8), { width: 1440, height: 900 })
  assert.equal(topLeft.placement, 'below')
  assert.equal(topLeft.top, 165)
  assert.equal(topLeft.left, 16)
  assert.ok(topLeft.maxHeight <= 620)

  const narrow = placeAssistantPanel(petAt(1096, 559), { width: 1280, height: 720 })
  assert.equal(narrow.placement, 'above')
  assert.equal(narrow.maxHeight, 463)
  assert.equal(narrow.bottom, 169)

  const tiny = placeAssistantPanel(petAt(200, 500), { width: 390, height: 844 })
  assert.equal(tiny.width, 358)
  assert.equal(tiny.left, 16)
  assert.ok(tiny.left + tiny.width <= 390 - 16)
})
