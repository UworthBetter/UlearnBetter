import test from 'node:test'
import assert from 'node:assert/strict'
import { createLearningSession } from '../concept-graph/src/assistant/context-store.ts'

const scene = (id) => ({
  view: 'star-dive', topic: { id: 'topic', title: '课程' },
  concept: { id, label: id, summary: '说明', relatedIds: [], cards: [] },
  card: null, interaction: null,
})

test('sent question keeps its context after navigation and caller mutation', () => {
  const session = createLearningSession()
  const input = scene('ma')
  session.updateScene(input)
  session.selectText('窗口的方向')
  const request = session.capture()
  input.concept.label = 'mutated'
  session.updateScene(scene('ema'))
  assert.equal(request.concept.id, 'ma')
  assert.equal(request.selection.text, '窗口的方向')
  assert.equal(session.getSnapshot().selection, null)
  request.concept.label = 'caller change'
  assert.equal(session.getSnapshot().concept.label, 'ema')
  assert.ok(Object.isFrozen(session.getSnapshot().concept))
})

test('only actual changes notify selection subscribers; unsubscribe works', () => {
  const session = createLearningSession()
  let notifications = 0
  const unsubscribe = session.subscribe(() => notifications++)
  session.selectText('')
  session.selectText('解释')
  session.selectText('解释')
  assert.equal(notifications, 1)
  unsubscribe()
  session.selectText('其他')
  assert.equal(notifications, 1)
})

test('stale cleanup cannot disconnect a newer scene', async () => {
  const session = createLearningSession()
  const oldCleanup = session.bindActions(() => ({ ok: true, message: 'old' }))
  const newCleanup = session.bindActions(() => ({ ok: true, message: 'new' }))
  oldCleanup()
  assert.equal((await session.execute({ type: 'close_card' })).message, 'new')
  newCleanup()
  assert.equal((await session.execute({ type: 'close_card' })).ok, false)
})

test('unknown operations and handler failures return explicit failure', async () => {
  const session = createLearningSession()
  let invoked = false
  session.bindActions(() => { invoked = true; throw new Error('private details') })
  assert.equal((await session.execute({ type: 'delete_notes' })).ok, false)
  assert.equal(invoked, false)
  const result = await session.execute({ type: 'close_card' })
  assert.equal(result.ok, false)
  assert.ok(!result.message.includes('private'))
})

test('shell and scene bindings remain independent with record context 0.2', async()=>{
 const session=createLearningSession()
 const cleanup=session.bindShellActions(a=>({ok:a.to==='today',message:'shell'}))
 session.bindActions(()=>({ok:true,message:'scene'}))
 session.updateScene({...scene('x'),layer:'adjust',record:null})
 session.selectText('selection');session.updateScene({...scene('y'),layer:'stats',record:null})
 assert.equal(session.capture().schema,'learning.context/0.2');assert.equal(session.capture().selection,null)
 assert.equal((await session.execute({type:'navigate',to:'today'})).message,'shell')
 assert.equal((await session.execute({type:'close_card'})).message,'scene')
 cleanup();assert.equal((await session.execute({type:'open_adjust'})).ok,false)
})
