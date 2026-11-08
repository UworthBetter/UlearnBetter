import type { LearningEvent } from './types.ts'
import type { RecordClient } from './client.ts'
export interface QueueStorage {getItem(key: string): string|null; setItem(key: string, value: string): void}
/** Persist before sending. Replays use the original UUID, so ambiguous responses are safe. */
export function createEventQueue(client: RecordClient, storage?: QueueStorage, key = 'ulearnbetter.events.v1', keepaliveUrl?: string) {
 let pending: LearningEvent[] = []
 let flight: Promise<void>|null = null
 let lastError: string|null = null
 const listeners = new Set<()=>void>()
 try {const saved=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(saved))pending=saved.filter(e=>e&&typeof e.id==='string'&&typeof e.at==='string'&&typeof e.subject==='string')}catch{lastError='无法读取待同步记录'}
 function persist() {try{storage?.setItem(key,JSON.stringify(pending))}catch{lastError='本机存储不可用，请保持页面打开以同步'};for(const fn of listeners)fn()}
 function acknowledge(batch: LearningEvent[]) {const ids=new Set(batch.map(e=>e.id));pending=pending.filter(e=>!ids.has(e.id));lastError=null;persist()}
 async function send(keepalive: boolean) {
  while(pending.length) {
   const batch=pending.slice(0,50)
   try {
    if(keepalive&&keepaliveUrl) {
     const res=await fetch(keepaliveUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batch),keepalive:true})
     if(!res.ok)throw new Error('sync')
     const body=await res.json();if(body.schema!=='learning.record-api/0.1')throw new Error('envelope')
    }else await client.addEvents(batch)
    acknowledge(batch)
   }catch{lastError='学习记录待同步，将自动重试';persist();break}
  }
 }
 return {
  enqueue(event: LearningEvent) {if(!pending.some(e=>e.id===event.id)){pending.push(structuredClone(event));persist()}},
  flush(keepalive=false) {if(keepalive && keepaliveUrl)return send(true);if(flight)return flight;flight=send(false).finally(()=>{flight=null});return flight},
  status: ()=>({pending:pending.length,error:lastError}),
  subscribe(fn: ()=>void) {listeners.add(fn);return()=>{listeners.delete(fn)}},
 }
}
export type EventQueue = ReturnType<typeof createEventQueue>
export function makeVisit(subject: LearningEvent['subject'], startedAt: number, endedAt: number, cardId: string|null = null): LearningEvent|null {
 const durationSec=Math.min(1800,Math.max(0,Math.floor((endedAt-startedAt)/1000)))
 return durationSec<3?null:{id:crypto.randomUUID(),at:new Date().toISOString(),kind:'visit',subject,cardId,durationSec}
}
