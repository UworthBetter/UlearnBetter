import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import App from './App'
import { learningSession } from './assistant/context-store'
import { createHttpRecordClient, createMockRecordClient, type RecordClient } from './record/client'
import { createEventQueue } from './record/event-queue'
import type { AdjustOptions, RecordRoute, RecordScene } from './record/view-props'
import type { RecallRequest } from './star-dive/StarDive'
import { parseRoute, routeHash } from './shell/routes'
import TodayView from './views/today/TodayView'
import LibraryView from './views/library/LibraryView'
import PanoramaView from './views/panorama/PanoramaView'
const NotesView = lazy(() => import('./views/notes/NotesView'))
import AdjustLayer from './views/layers/AdjustLayer'
import RecallPrompt from './views/recall/RecallPrompt'
import ViewsPreview from './views/dev/ViewsPreview'
import './shell/shell.css'
const StarDive = lazy(() => import('./star-dive/StarDive'))
const mock = new URLSearchParams(location.search).get('record')==='mock'
const transport = mock ? createMockRecordClient() : createHttpRecordClient()
let sawMock = mock
const client = Object.fromEntries(Object.entries(transport).map(([key,fn])=>[key,async (...args: unknown[])=>{
 const response=await fn(...args)
 if(response.meta.source==='mock'){sawMock=true;window.dispatchEvent(new Event('record:mock'))}
 if(['createGoal','updateGoal','addItem','organizeItem','undoChangeLog','addOverride','addEvents'].includes(key))window.dispatchEvent(new Event('record:changed'))
 return response
}])) as unknown as RecordClient
const navigate = (route: RecordRoute) => {location.hash = routeHash(route)}
const openAdjust = (opts: AdjustOptions = {}) => {const [path,query='']=location.hash.split('?'); const q=new URLSearchParams(query);q.set('sheet','adjust');for(const k of ['changeLogId','itemId'] as const)if(opts[k])q.set(k,opts[k]);location.hash=path+'?'+q}
const assistantRecord = {client,navigate,openAdjust}
const GlobalAssistant = lazy(() => import('./assistant/ui/GlobalAssistant'))
let storage: Storage|undefined
try {storage=localStorage}catch{/* In-memory queue remains available. */}
const queue = createEventQueue(client,storage,'ulearnbetter.events.'+(mock?'mock':'record'),mock?undefined:'/api/record/events')
function closeAdjust() {const [path,query='']=location.hash.split('?');const q=new URLSearchParams(query);for(const k of ['sheet','changeLogId','itemId'])q.delete(k);location.hash=path+(q.size?'?'+q:'')}
export default function Root() {
 const [route,setRoute]=useState(()=>parseRoute(location.hash))
 const [error,setError]=useState('')
 const [mockSeen,setMockSeen]=useState(()=>sawMock)
 useEffect(()=>{const mark=()=>setMockSeen(true);window.addEventListener('record:mock',mark);return()=>window.removeEventListener('record:mock',mark)},[])
 const [reload,setReload]=useState(0)
 const [recalls,setRecalls]=useState<RecallRequest[]>([])
 const [queueStatus,setQueueStatus]=useState(queue.status)
 const snapshot=useSyncExternalStore(learningSession.subscribe,learningSession.getSnapshot)
 const baseRecord=useRef<RecordScene['record']>(null)
 const requestRecall=useCallback((r: RecallRequest)=>setRecalls(rows=>[...rows,r]),[])
 const reportScene=useCallback((scene: RecordScene)=>{
   const base=baseRecord.current
   const record=scene.record?{...scene.record,todayPlan:scene.record.todayPlan??base?.todayPlan??null,stats:scene.record.stats??base?.stats??null,pendingCount:base?.pendingCount??scene.record.pendingCount}:null
   learningSession.updateRecord({record,layer:parseRoute(location.hash).adjust?'adjust':scene.layer})
 },[])
 useEffect(()=>{const changed=()=>setReload(v=>v+1);window.addEventListener('record:changed',changed);return()=>window.removeEventListener('record:changed',changed)},[])
 useEffect(()=>{const root=document.documentElement;root.style.setProperty('--ub-rail-width',route.view==='panorama'?'332px':'0px');return()=>{root.style.removeProperty('--ub-rail-width')}},[route.view])
 useEffect(()=>{const change=()=>setRoute(parseRoute(location.hash));addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change)},[])
 useEffect(()=>{const unsubscribe=queue.subscribe(()=>setQueueStatus(queue.status()));const retry=()=>void queue.flush();const timer=setInterval(retry,5000);window.addEventListener('online',retry);retry();return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('online',retry)}},[])
 useEffect(()=>{
   if(route.view!=='star-dive')learningSession.updateScene({view:route.view==='dev'||route.view==='notes'?'none':route.view,topic:null,concept:null,card:null,interaction:null,record:null,layer:route.adjust?'adjust':route.view==='today'?route.layer??null:null})
   else learningSession.updateRecord({record:learningSession.getSnapshot().record,layer:route.adjust?'adjust':null})
   let live=true
   Promise.all([client.getProposals(),client.listGoals(),client.getToday(undefined,Intl.DateTimeFormat().resolvedOptions().timeZone),client.getStats('week',Intl.DateTimeFormat().resolvedOptions().timeZone),client.listItems(),client.getMastery(route.view==='star-dive'?route.topicId:undefined)]).then(([p,g,t,s,items,mastery])=>{
    if(!live)return
    const goalId=route.view==='panorama'?route.goalId:route.view==='star-dive'?items.data.find(i=>i.topicId===route.topicId)?.goalIds[0]:null
    const goal=g.data.find(g=>g.id===goalId)
    const current=learningSession.getSnapshot()
    const focusedMastery=route.view==='star-dive'&&current.concept?mastery.data.find(m=>m.subject===`concept:${route.topicId}/${current.concept!.id}`):null
    const record: NonNullable<RecordScene['record']>={source:p.meta.source,goal:goal?{id:goal.id,title:goal.title}:null,todayPlan:t.data,pendingCount:items.data.filter(i=>i.status==='pending').length+p.data.goalProposals.length+p.data.relationCandidates.filter(r=>!r.confirmed).length,selectedItem:null,mastery:focusedMastery??null,stats:{weekMinutes:s.data.weekMinutes,streakDays:s.data.streakDays,recallRate:s.data.recallRate,learned:s.data.learned,total:s.data.total}}
    if(route.view==='library'&&route.itemId)client.getItem(route.itemId).then(item=>{if(live)reportScene({record:{...record,selectedItem:item.data},layer:route.adjust?'adjust':null})}).catch(e=>{if(live)setError(e.message)})
    baseRecord.current=record
    if(route.view==='library'&&!route.itemId&&current.record?.selectedItem)record.selectedItem=current.record.selectedItem
    reportScene({record,layer:route.adjust?'adjust':route.view==='today'?route.layer??null:null});setError('')
   }).catch(e=>{if(live)setError(e instanceof Error?e.message:'记录服务不可用')})
   return()=>{live=false}
 },[route,reportScene,reload])
 useEffect(()=>learningSession.bindShellActions(async action=>{
  if(action.type==='navigate') {
   if(!['today','stats','panorama','library'].includes(action.to))return {ok:false,message:'视图不存在'}
   if(action.goalId){if(action.to!=='panorama'||!(await client.listGoals()).data.some(g=>g.id===action.goalId))return {ok:false,message:'目标不存在'}}
   if(action.itemId){if(action.to!=='library')return {ok:false,message:'资料导航无效'};await client.getItem(action.itemId)}
   navigate(action.to==='stats'?{view:'today',layer:'stats'}:action.to==='library'?{view:'library',itemId:action.itemId}:action.to==='panorama'?{view:'panorama',goalId:action.goalId}:{view:'today'})
   return {ok:true,message:'已打开视图'}
  }
  if(action.type==='open_adjust') {
   if(action.itemId)await client.getItem(action.itemId)
   if(action.changeLogId&&!(await client.listChangeLog()).data.some(c=>c.id===action.changeLogId))return {ok:false,message:'整理记录不存在'}
   openAdjust(action);return {ok:true,message:'已打开调整归类；请点击按钮确认'}
  }
  return {ok:false,message:'不支持的外壳动作'}
 }),[])
 useEffect(()=>{
   const key=(e: KeyboardEvent)=>{
    if(e.key==='Escape') {
     if(route.adjust){e.preventDefault();e.stopImmediatePropagation();closeAdjust()}
     else if(route.view==='today'&&route.layer==='stats'){e.preventDefault();e.stopImmediatePropagation();navigate({view:'today'})}
     else if(route.view==='star-dive'&&!learningSession.getSnapshot().concept){e.preventDefault();e.stopImmediatePropagation();navigate({view:'panorama'})}
    }
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target instanceof Element&&e.target.closest('input,textarea,[contenteditable=true]'))) {
      const input=document.querySelector<HTMLElement>('[data-agent-input],.ga-composer textarea,.global-assistant textarea,.ula-panel-open textarea,.ula-bar textarea')
      if(input){e.preventDefault();input.focus()}
      else {e.preventDefault();document.querySelector<HTMLButtonElement>('[data-testid=assistant-launcher][aria-expanded=false]')?.click();requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('[data-testid=assistant-input]')?.focus());document.dispatchEvent(new CustomEvent('ulearnbetter:focus-agent'))}
    }
   };document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true)
 },[route])
 const props={client,route:route as RecordRoute,navigate,openAdjust,reportScene}
 const active=recalls[0]
 return <div className="ub-shell" style={{'--ub-rail-width':route.view==='panorama'?'332px':'0px'} as CSSProperties}>
 <header className="ub-topbar"><a className="ub-brand" href="#/today">ULEARNBETTER <span>学习留下的星光</span></a><nav aria-label="主导航">{([['today','今天'],['panorama','全景'],['library','资料'],['notes','笔记']] as const).map(([view,label])=><a key={view} href={'#/'+view} aria-current={route.view===view?'page':undefined}>{label}{view==='library'&&(snapshot.record?.pendingCount??0)>0&&<span className="ub-pending" aria-label={`${snapshot.record?.pendingCount} 项待确认`}/>}</a>)}</nav>{(mockSeen||snapshot.record?.source==='mock')&&<span className="ub-mock">示例数据</span>}{import.meta.env.VITE_UB_DEMO==='1'&&<span className="ub-mock" title="预置数据：笔记由真实视频字幕经模型与编译器生成，识别与归类由模型完成；学习记录（停留、回忆、勾选、想法文字）由学习者脚本模拟">预置数据</span>}</header>
 {error&&<div className="ub-service-error" role="alert">{error} <button onClick={()=>setReload(v=>v+1)}>重试</button><a href="?record=mock#/today">查看示例数据</a></div>}
 {queueStatus.pending>0&&<div className="ub-sync" role="status">{queueStatus.error||'正在同步学习记录'} · {queueStatus.pending}</div>}
 <main className={route.view==='star-dive'||route.view==='graph'?'ub-immersive':'ub-view'}>
 {route.view==='graph'?<App/>:route.view==='dev'?<ViewsPreview/>:route.view==='today'?<TodayView key={reload} {...props}/>:route.view==='library'?<LibraryView key={reload} {...props}/>:route.view==='panorama'?<PanoramaView key={reload} {...props}/>:route.view==='notes'?<Suspense fallback={<p className="ub-muted">正在打开笔记…</p>}><NotesView {...props}/></Suspense>:<Suspense fallback={<p>正在加载星图…</p>}><StarDive key={route.topicId} topicId={route.topicId} initialFocus={route.conceptId} client={client} queue={queue} onRecall={requestRecall}/></Suspense>}
 </main>
 {route.adjust&&<div className="ub ub-overlay"><AdjustLayer client={client} {...route.adjust} navigate={navigate} onClose={()=>{closeAdjust();setReload(v=>v+1)}}/></div>}
 {active&&<div className="ub ub-recall-host"><RecallPrompt subject={active.subject} label={active.label} onResult={result=>{
   queue.enqueue({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'recall',subject:active.subject,cardId:null,result})
   setRecalls(rows=>rows.slice(1));void queue.flush().then(async()=>{try{const response=await client.getMastery(active.topicId);window.dispatchEvent(new CustomEvent('learning-mastery',{detail:{topicId:active.topicId,mastery:response.data}}));setReload(v=>v+1)}catch{/* Queue status keeps failures visible. */}})
 }}/></div>}
 <Suspense fallback={null}><GlobalAssistant record={assistantRecord}/></Suspense>
 </div>
}
