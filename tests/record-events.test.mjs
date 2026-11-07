import test from 'node:test'
import assert from 'node:assert/strict'
import {createEventQueue,makeVisit} from '../concept-graph/src/record/event-queue.ts'
const event=()=>({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'recall',subject:'concept:t/c',cardId:null,result:'remembered'})
test('visit excludes short stays and clamps long stays',()=>{
 assert.equal(makeVisit('concept:t/c',0,2999),null)
 assert.equal(makeVisit('concept:t/c',0,3000).durationSec,3)
 assert.equal(makeVisit('concept:t/c',0,9999999).durationSec,1800)
})
test('failed transport persists original UUID across reload and retries in batches',async()=>{
 const memory=new Map();const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}
 const q=createEventQueue({addEvents:async()=>{throw Error('offline')}},storage)
 const rows=Array.from({length:55},event);for(const e of rows)q.enqueue(e)
 await q.flush();assert.equal(q.status().pending,55);assert.ok(q.status().error)
 const batches=[];const restored=createEventQueue({addEvents:async batch=>{batches.push(structuredClone(batch))}},storage)
 await Promise.all([restored.flush(),restored.flush()]);assert.deepEqual(batches.map(b=>b.length),[50,5]);assert.equal(batches[0][0].id,rows[0].id);assert.equal(restored.status().pending,0)
})
test('events enqueued during a request survive acknowledgment of earlier batch',async()=>{
 let release;const gate=new Promise(r=>release=r);let calls=0
 const q=createEventQueue({addEvents:async()=>{calls++;await gate}})
 q.enqueue(event());const sent=q.flush();q.enqueue(event());release();await sent;assert.equal(calls,2);assert.equal(q.status().pending,0)
})
test('page hiding uses keepalive and retains failures for retry',async()=>{
 const original=globalThis.fetch;let options
 try{globalThis.fetch=async(_url,o)=>{options=o;return new Response('{}',{status:503})}
 const q=createEventQueue({addEvents:async()=>{}},undefined,'test','/api/record/events');q.enqueue(event());await q.flush(true);assert.equal(options.keepalive,true);assert.equal(q.status().pending,1)
 }finally{globalThis.fetch=original}
})
