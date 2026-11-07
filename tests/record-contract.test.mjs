import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockRecordClient, createHttpRecordClient, RecordError } from '../concept-graph/src/record/client.ts'
import { parseRoute, routeHash } from '../concept-graph/src/shell/routes.ts'
test('mock reads are cloned, writes isolated and event IDs idempotent', async()=>{
 const a=createMockRecordClient(), b=createMockRecordClient()
 const rows=await a.listItems();assert.equal(rows.meta.source,'mock');rows.data.length=0
 assert.equal((await a.listItems()).data.length,6)
 const event={id:crypto.randomUUID(),at:new Date().toISOString(),kind:'recall',subject:'concept:t-0/c-0',cardId:null,result:'remembered'}
 await a.addEvents([event,event]);assert.equal((await a.listEvents()).data.length,2);assert.equal((await b.listEvents()).data.length,1)
 await assert.rejects(a.getItem('missing'),e=>e instanceof RecordError&&e.code==='not_found')
 for(const method of ['listTopics','listGoals','getProposals','listChangeLog','listOverrides','getMastery','getToday','getStats','getPanorama'])assert.equal((await a[method]()).meta.source,'mock')
})
test('HTTP preserves errors and encodes IDs and query values',async()=>{
 const original=globalThis.fetch;let url
 try {globalThis.fetch=async u=>{url=u;return new Response(JSON.stringify({error:'not_found',message:'missing'}),{status:404})}
 await assert.rejects(createHttpRecordClient().getItem('a/b'),e=>e.code==='not_found');assert.equal(url,'/api/record/items/a%2Fb')
 }finally{globalThis.fetch=original}
})
test('routes roundtrip encoded IDs and overlays',()=>{
 for(const r of [{view:'today',layer:'stats'},{view:'library',itemId:'光 线'},{view:'panorama',goalId:'g'},{view:'star-dive',topicId:'t',conceptId:'c'}])assert.deepEqual({...parseRoute(routeHash(r)),adjust:undefined},{...r,adjust:undefined})
 assert.equal(parseRoute('#/library/i?sheet=adjust').adjust!==undefined,true)
 assert.equal(parseRoute('#/star-dive/%').view,'today')
})

test('mock event writes feed mastery and checklist overlays',async()=>{
 const client=createMockRecordClient()
 await client.addEvents({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'recall',subject:'concept:t-0/c-0',cardId:null,result:'remembered'})
 assert.equal((await client.getMastery('t-0')).data.find(m=>m.subject==='concept:t-0/c-0').level,2)
 await client.addEvents({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'checklist',subject:'procitem:t-0/p-paper/paper',cardId:'p-paper',checked:true})
 assert.equal((await client.getTopicLearn('t-0')).data.overlay.checklist['procitem:t-0/p-paper/paper'],true)
})

test('all date-sensitive HTTP reads include the local IANA timezone',async()=>{
 const original=globalThis.fetch,urls=[]
 try{globalThis.fetch=async url=>{urls.push(url);return new Response(JSON.stringify({schema:'learning.record-api/0.1',data:null,meta:{source:'record',generatedAt:new Date().toISOString(),warnings:[]}}))}
 const client=createHttpRecordClient();await client.getToday();await client.getStats();await client.getMastery('t');await client.getPanorama();await client.getTopicLearn('t')
 for(const url of urls)assert.equal(new URL(url,'http://localhost').searchParams.get('tz'),Intl.DateTimeFormat().resolvedOptions().timeZone)
 }finally{globalThis.fetch=original}
})
