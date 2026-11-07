import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { tempDir, manifest, writeTopic, startApp, event } from './record-helpers.mjs'
import { validate } from '../../server/src/record/schemas.mjs'

test('effective ideas and reflections reach the overlay; reverted attachments disappear; learn remains verbatim', async t => {
 const learn=await tempDir(t),data=await tempDir(t)
 await writeTopic(learn,manifest({id:'thoughts',title:'纸上观察',concepts:[{id:'paper',label:'纸张'}]}))
 const raw=await fs.readFile(path.join(learn,'thoughts','learn.json'),'utf8')
 const {call}=await startApp(t,{env:{RECORD_LEARN_DIR:learn,RECORD_DATA_DIR:data}})
 const item=(await call('POST','/api/record/items',{kind:'idea',text:'纸张纤维会影响承重吗？'})).body.data
 const attach={id:randomUUID(),at:new Date().toISOString(),target:`item:${item.id}`,op:'attach_idea',value:{conceptRef:'concept:thoughts/paper'},reason:null}
 assert.equal((await call('POST','/api/record/overrides',attach)).status,201)
 await call('POST','/api/record/events',event('reflection','concept:thoughts/paper',new Date().toISOString(),{text:'比较两个方向'}))
 let topic=(await call('GET','/api/record/topics/thoughts/learn?tz=UTC')).body.data
 assert.equal(topic.overlay.ideas.paper.length,2)
 assert.equal(validate('topic-overlay',topic.overlay).ok,true)
 assert.deepEqual(topic.learn,JSON.parse(raw))
 await call('POST','/api/record/overrides',{id:randomUUID(),at:new Date().toISOString(),target:attach.target,op:'revert',value:{overrideId:attach.id},reason:null})
 topic=(await call('GET','/api/record/topics/thoughts/learn?tz=UTC')).body.data
 assert.deepEqual(topic.overlay.ideas.paper.map(i=>i.text),['比较两个方向'])
})
test('compiled relations reach panorama with neutral display importance and disappear when an endpoint is hidden', async t => {
 const learn=await tempDir(t),data=await tempDir(t)
 const m=manifest({id:'relations',title:'纸上关系',concepts:[{id:'a',label:'纸张'},{id:'b',label:'纤维'}]});m.concepts[0].importanceHint=null
 await writeTopic(learn,m)
 const file=path.join(learn,'relations','learn.json');const raw=JSON.parse(await fs.readFile(file,'utf8'));raw.relations=[{a:'a',b:'b',kind:'related',ev:[]}];await fs.writeFile(file,JSON.stringify(raw))
 const {call}=await startApp(t,{env:{RECORD_LEARN_DIR:learn,RECORD_DATA_DIR:data}})
 let panorama=(await call('GET','/api/record/panorama?tz=UTC')).body.data
 assert.deepEqual(panorama.relations,[{a:'concept:relations/a',b:'concept:relations/b',kind:'related'}]);assert.equal(validate('panorama',panorama).ok,true)
 await call('POST','/api/record/overrides',{id:randomUUID(),at:new Date().toISOString(),target:'concept:relations/a',op:'hide',value:{hidden:true},reason:null})
 panorama=(await call('GET','/api/record/panorama?tz=UTC')).body.data;assert.deepEqual(panorama.relations,[])
})

test('record CORS honors configured origins and PATCH without model configuration',async t=>{
 const {call}=await startApp(t,{env:{RECORD_DATA_DIR:await tempDir(t),ASSISTANT_ALLOWED_ORIGINS:'http://127.0.0.1:5184'}})
 const response=await call('OPTIONS','/api/record/goals',undefined,{Origin:'http://127.0.0.1:5184','Access-Control-Request-Method':'PATCH'})
 assert.equal(response.status,204)
 assert.equal((await call('GET','/api/record/topics',undefined,{Origin:'http://unapproved.example'})).status,403)
 assert.equal((await call('GET','/health',undefined,{Origin:'http://127.0.0.1:5184'})).body.record.ready,true)
})
