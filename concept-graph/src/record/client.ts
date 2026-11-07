import fixture0 from '../../../samples/record/demo/assignment.json' with { type: 'json' }
import fixture1 from '../../../samples/record/demo/changelog.json' with { type: 'json' }
import fixture2 from '../../../samples/record/demo/envelope.json' with { type: 'json' }
import fixture3 from '../../../samples/record/demo/event.json' with { type: 'json' }
import fixture4 from '../../../samples/record/demo/goal-0.json' with { type: 'json' }
import fixture5 from '../../../samples/record/demo/goal-1.json' with { type: 'json' }
import fixture6 from '../../../samples/record/demo/item-0.json' with { type: 'json' }
import fixture7 from '../../../samples/record/demo/item-1.json' with { type: 'json' }
import fixture8 from '../../../samples/record/demo/item-2.json' with { type: 'json' }
import fixture9 from '../../../samples/record/demo/item-3.json' with { type: 'json' }
import fixture10 from '../../../samples/record/demo/item-4.json' with { type: 'json' }
import fixture11 from '../../../samples/record/demo/item-5.json' with { type: 'json' }
import fixture12 from '../../../samples/record/demo/manifest.json' with { type: 'json' }
import fixture13 from '../../../samples/record/demo/mastery.json' with { type: 'json' }
import fixture14 from '../../../samples/record/demo/override.json' with { type: 'json' }
import fixture15 from '../../../samples/record/demo/panorama.json' with { type: 'json' }
import fixture16 from '../../../samples/record/demo/proposals.json' with { type: 'json' }
import fixture17 from '../../../samples/record/demo/stats.json' with { type: 'json' }
import fixture18 from '../../../samples/record/demo/today.json' with { type: 'json' }
import fixture19 from '../../../samples/record/demo/topic-0.json' with { type: 'json' }
import fixture20 from '../../../samples/record/demo/topic-1.json' with { type: 'json' }
import fixture21 from '../../../samples/record/demo/topic-2.json' with { type: 'json' }
import type * as T from './types.ts'
export class RecordError extends Error { code: string; status: number; constructor(code: string, message: string, status = 0) { super(message); this.name = 'RecordError'; this.code = code; this.status = status } }
export interface RecordClient {
 listTopics(): Promise<T.Envelope<T.TopicSummary[]>>
 getTopicLearn(id: string): Promise<T.Envelope<T.TopicLearn>>
 listGoals(): Promise<T.Envelope<T.Goal[]>>
 createGoal(input: T.CreateGoal): Promise<T.Envelope<T.Goal>>
 updateGoal(id: string, input: Partial<T.Goal>): Promise<T.Envelope<T.Goal>>
 getProposals(): Promise<T.Envelope<T.Proposals>>
 listItems(filter?: {status?: string; kind?: string}): Promise<T.Envelope<T.Item[]>>
 getItem(id: string): Promise<T.Envelope<T.ItemDetail>>
 addItem(input: T.AddItem): Promise<T.Envelope<T.Item>>
 organizeItem(id: string): Promise<T.Envelope<T.ChangeLog>>
 listChangeLog(itemId?: string): Promise<T.Envelope<T.ChangeLog[]>>
 undoChangeLog(id: string): Promise<T.Envelope<T.ChangeLog>>
 listOverrides(target?: string): Promise<T.Envelope<T.OverrideResult[]>>
 addOverride(input: T.Override): Promise<T.Envelope<T.OverrideResult>>
 listEvents(filter?: {since?: string; limit?: number}): Promise<T.Envelope<T.LearningEvent[]>>
 addEvents(events: T.LearningEvent | T.LearningEvent[]): Promise<T.Envelope<T.LearningEvent[]>>
 getMastery(topicId?: string): Promise<T.Envelope<T.MasteryState[]>>
 getToday(date?: string, tz?: string): Promise<T.Envelope<T.TodayPlan>>
 getStats(range?: T.Stats['range'], tz?: string): Promise<T.Envelope<T.Stats>>
 getPanorama(goalId?: string): Promise<T.Envelope<T.Panorama>>
}
export function createHttpRecordClient(base = '/api/record'): RecordClient {
 async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T.Envelope<T>> {
   let response: Response
   try { response = await fetch(base + path, {method, headers: body === undefined ? undefined : {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)}) }
   catch { throw new RecordError('network_error', '无法连接学习记录服务') }
   let value: unknown
   try { value = await response.json() } catch { throw new RecordError('invalid_response', '服务未返回 JSON', response.status) }
   const data = value as {error?: string; message?: string; schema?: string; meta?: {source?: string}}
   if (!response.ok) throw new RecordError(data.error || 'http_error', data.message || '记录请求失败', response.status)
   if (data.schema !== 'learning.record-api/0.1' || !['record','mock'].includes(data.meta?.source || '')) throw new RecordError('invalid_response', '记录信封无效')
   return value as T.Envelope<T>
 }
 const id = encodeURIComponent
 const query = (values: object) => {const q = new URLSearchParams(); for (const [k,v] of Object.entries(values)) if (v !== undefined) q.set(k,String(v)); return q.size ? '?' + q : ''}
 return {
 listTopics: () => request('/topics'), getTopicLearn: (v) => request('/topics/'+id(v)+'/learn'),
 listGoals: () => request('/goals'), createGoal: (v) => request('/goals','POST',v), updateGoal: (v,b) => request('/goals/'+id(v),'PATCH',b),
 getProposals: () => request('/proposals'), listItems: (v = {}) => request('/items'+query(v)), getItem: (v) => request('/items/'+id(v)), addItem: (v) => request('/items','POST',v), organizeItem: (v) => request('/items/'+id(v)+'/organize','POST'),
 listChangeLog: (itemId) => request('/changelog'+query({itemId})), undoChangeLog: (v) => request('/changelog/'+id(v)+'/undo','POST'),
 listOverrides: (target) => request('/overrides'+query({target})), addOverride: (v) => request('/overrides','POST',v),
 listEvents: (v = {}) => request('/events'+query(v)), addEvents: (v) => request('/events','POST',v),
 getMastery: (topicId) => request('/mastery'+query({topicId})), getToday: (date,tz) => request('/today'+query({date,tz})),
 getStats: (range,tz) => request('/stats'+query({range,tz})), getPanorama: (goalId) => request('/panorama'+query({goalId})),
 }
}
export type MockFixtures = Record<string, unknown>
/** Inject fixtures in Node tests. The browser loads only explicitly selected mock mode. */
export function createMockRecordClient(fixtures: MockFixtures = {'assignment': fixture0, 'changelog': fixture1, 'envelope': fixture2, 'event': fixture3, 'goal-0': fixture4, 'goal-1': fixture5, 'item-0': fixture6, 'item-1': fixture7, 'item-2': fixture8, 'item-3': fixture9, 'item-4': fixture10, 'item-5': fixture11, 'manifest': fixture12, 'mastery': fixture13, 'override': fixture14, 'panorama': fixture15, 'proposals': fixture16, 'stats': fixture17, 'today': fixture18, 'topic-0': fixture19, 'topic-1': fixture20, 'topic-2': fixture21}): RecordClient {
 const f = structuredClone(fixtures) as Record<string, any>
 const goals: T.Goal[] = [f['goal-0'],f['goal-1']]
 const items: T.Item[] = Array.from({length:6},(_,i) => f['item-'+i])
 const events: T.LearningEvent[] = [f.event]
 const overrides: T.OverrideResult[] = []
 const logs: T.ChangeLog[] = [f.changelog]
 const result = async <V>(data: V): Promise<T.Envelope<V>> => structuredClone({schema:'learning.record-api/0.1',data,meta:{source:'mock',generatedAt:new Date().toISOString(),warnings:['示例数据；写入仅保留在内存']}})
 const find = <V extends {id: string}>(rows: V[],id: string) => {const v = rows.find(v=>v.id===id);if(!v)throw new RecordError('not_found','记录不存在',404);return v}
 const topic = (id: string): T.TopicLearn => {const t = Object.values(f).find((v:any)=>v?.learn?.topic?.id===id);if(!t)throw new RecordError('not_found','主题不存在',404);return t}
 function masteries(): T.MasteryState[] {
  const subjects=new Set<T.SubjectRef>([f.mastery.subject,...events.filter(e=>e.kind==='visit'||e.kind==='recall').map(e=>e.subject)])
  return [...subjects].map(subject=>{
   const rows=events.filter(e=>e.subject===subject)
   const visits=rows.filter((e): e is Extract<T.LearningEvent,{kind:'visit'}>=>e.kind==='visit').reduce((n,e)=>n+e.durationSec,0)
   const recalls=rows.filter((e): e is Extract<T.LearningEvent,{kind:'recall'}>=>e.kind==='recall'&&e.result!=='skipped').sort((a,b)=>a.at.localeCompare(b.at))
   const last=recalls.at(-1)
   const days=new Set(recalls.filter(e=>e.result==='remembered').map(e=>e.at.slice(0,10)))
   let level: T.MasteryState['level']=visits>=20?1:0
   if(last)level=last.result==='forgot'?1:days.size>=2?3:2
   let due=subject===f.mastery.subject?f.mastery.due:null
   if(last)due=new Date(Date.parse(last.at)+86400000*(last.result==='forgot'?1:[1,3,7,14,30][Math.min(4,days.size-1)])).toISOString()
   return {subject,level,due,visitSeconds:visits,rememberedCount:recalls.filter(e=>e.result==='remembered').length,lastRecall:last?.result??(subject===f.mastery.subject?f.mastery.lastRecall:null)}
  })
 }
 function topicWithEvents(id: string): T.TopicLearn {
  const value=structuredClone(topic(id));value.overlay.mastery=masteries().filter(m=>m.subject.startsWith('concept:'+id+'/'))
  for(const e of events)if(e.kind==='checklist'&&e.subject.startsWith('procitem:'+id+'/'))value.overlay.checklist[e.subject]=e.checked
  for(const {override:o} of overrides) {
   if(!o.target.startsWith('concept:'+id+'/'))continue
   const conceptId=o.target.split('/')[1]
   if(o.op==='rename')value.overlay.renames[conceptId]=o.value.label
   if(o.op==='hide'){value.overlay.hidden=value.overlay.hidden.filter(v=>v!==conceptId);if(o.value.hidden)value.overlay.hidden.push(conceptId)}
   if(o.op==='pin_importance'){if(o.value.level)value.overlay.pins[conceptId]=o.value.level;else delete value.overlay.pins[conceptId]}
  }
  return value
 }
 const client: RecordClient = {
 listTopics: () => result([0,1,2].map(i=>({topicId:'t-'+i,title:f['topic-'+i].learn.topic.title,conceptCount:3,generatedAt:f.envelope.meta.generatedAt,compilerVersion:'0.1'}))),
 getTopicLearn: id => result(topicWithEvents(id)), listGoals: () => result(goals),
 createGoal: input => {const v: T.Goal = {...input,id:crypto.randomUUID(),confirmedAt:new Date().toISOString()};goals.push(v);return result(v)},
 updateGoal: (id,input) => {const v=find(goals,id);Object.assign(v,input,{id});return result(v)},
 getProposals: () => result(f.proposals), listItems: (filter={}) => result(items.filter(v=>(!filter.kind||filter.kind===v.kind)&&(!filter.status||filter.status===v.status))),
 getItem: id => {const v=find(items,id);return result({...v,groups:[],assignments:f.proposals.assignments.filter((a:T.Assignment)=>a.subject==='item:'+id),changeLogIds:logs.filter(l=>l.trigger==='item:'+id).map(l=>l.id),orphaned:overrides.filter(o=>o.orphaned).map(o=>o.override)})},
 addItem: input => {if(!['notes','idea','video'].includes(input.kind))throw new RecordError('unsupported_kind','本轮不支持该类型',422); const v: T.Item={...structuredClone(items[0]),id:crypto.randomUUID(),kind:input.kind,title:input.kind==='idea'?input.text:input.kind==='video'?input.url:input.topicId,ref:input.kind==='idea'?{text:input.text}:input.kind==='video'?{url:input.url}:{topicId:input.topicId},addedAt:new Date().toISOString(),topicId:input.kind==='notes'?input.topicId:null,goalIds:[],conceptCount:0,status:'organizing',pipeline:{state:'queued',steps:[],reason:input.kind==='video'?'排队中，本轮不自动解析':null}};items.push(v);return result(v)},
 organizeItem: id => {find(items,id);const v: T.ChangeLog={id:crypto.randomUUID(),at:new Date().toISOString(),trigger:`item:${id}`,organizer:f.changelog.organizer,changes:[],undone:false};logs.push(v);return result(v)},
 listChangeLog: itemId => result(logs.filter(v=>!itemId||v.trigger==='item:'+itemId)), undoChangeLog: id => {const v=find(logs,id);v.undone=true;return result(v)},
 listOverrides: target => result(overrides.filter(v=>!target||v.override.target===target)),
 addOverride: input => {const v={override:structuredClone(input),effective:true,orphaned:false};overrides.push(v); const [kind, target] = input.target.split(':');
 if(kind==='item'&&input.op==='reassign') find(items,target).goalIds=[...input.value.goalIds]
 if(input.op==='accept_assignment'||input.op==='reject_assignment'){const a=find<T.Assignment>(f.proposals.assignments,input.value.assignmentId);a.state=input.op==='accept_assignment'?'accepted':'rejected';f.proposals.assignments=f.proposals.assignments.filter((v:T.Assignment)=>v.id!==a.id)}
 return result(v)},
 listEvents: (filter={}) => result(events.filter(e=>!filter.since||e.at>=filter.since).slice(0,filter.limit??events.length)),
 addEvents: input => {const batch=Array.isArray(input)?input:[input];if(batch.length>50)throw new RecordError('batch_limit','最多 50 条',422);for(const e of batch)if(!events.some(v=>v.id===e.id))events.push(structuredClone(e));return result(batch)},
 getMastery: topicId => result(masteries().filter(m=>!topicId||m.subject.startsWith('concept:'+topicId+'/'))), getToday: (date,tz) => result({...f.today,...(date?{date}:{}),...(tz?{tz}:{})}),
 getStats: (range,tz) => result({...f.stats,...(range?{range}:{}),...(tz?{tz}:{})}), getPanorama: goalId => {if(goalId)find(goals,goalId);return result(f.panorama)},
 }
 return Object.fromEntries(Object.entries(client).map(([key, fn]) => [key, async (...args: unknown[]) => fn(...args)])) as unknown as RecordClient
}
