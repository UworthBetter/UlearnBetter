import { learningSession } from '../assistant/context-store'
import type { RecordClient } from '../record/client'
import type { EventQueue } from '../record/event-queue'
import { makeVisit } from '../record/event-queue'
import type { TopicOverlay, SubjectRef, RelationCandidate } from '../record/types'
import { useEffect, useRef, useState } from 'react'
import rawData from '../data/star-dive.json'
import './star-dive.css'
import './learning.css'
import type { StarDiveData } from './types'
import { useStarDive } from './useStarDive'
import { fmt, SHAPES } from './util'
import { adaptLearnDocument } from './learn-adapter'

const DATA = rawData as unknown as StarDiveData

/**
 * Star Dive · 星图潜航 — immersive star-map view of one video's concepts.
 * React owns the static shell (layers + brand/legend HUD); the scene engine (useStarDive) drives
 * the canvases, stars, focus/orbit cards, panels and timeline exactly like the prototype.
 */
export interface RecallRequest {subject: SubjectRef; label: string; topicId: string}
export default function StarDive({ initialFocus, topicId, client, queue, onRecall }: {initialFocus?: string|null; topicId?: string; client?: RecordClient; queue?: EventQueue; onRecall?: (request: RecallRequest)=>void}) {
  const [data, setData] = useState<StarDiveData>(DATA)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [remote, setRemote] = useState(false)
  const [overlay, setOverlay] = useState<TopicOverlay|null>(null)
  const [candidates, setCandidates] = useState<RelationCandidate[]>([])
  const [focus, setFocus] = useState<string|null>(null)
  useEffect(() => {
    if (!client || !topicId || topicId==='cs-demo' || DATA.concepts.some(c=>c.id===topicId)) return
    let live=true
    client.getTopicLearn(topicId).then(response=>{if(!live)return;setData(adaptLearnDocument(response.data.learn,response.data.overlay));setOverlay(response.data.overlay);setRemote(true);setError('')}).catch(e=>{if(live)setError(e instanceof Error?e.message:'主题加载失败')})
    client.getProposals().then(r=>{if(live)setCandidates(r.data.relationCandidates)}).catch(()=>{})
    return()=>{live=false}
  },[client,topicId])
  useEffect(() => {
    if(!remote||!queue||!overlay)return
    let current: {id:string; started:number; cardId:string|null; opened:boolean}|null=null
    const now=()=>performance.now()
    function leave(recall: boolean) {
      if(!current)return
      const c=current;current=null
      const isProcedure=data.concepts.find(v=>v.id===c.id)?.cards.some(card=>card.block?.shape==='procedure')
      const subject: SubjectRef=isProcedure?`procedure:${data.meta.topic_id}/${c.id}`:`concept:${data.meta.topic_id}/${c.id}`
      const visit=makeVisit(subject,c.started,now(),c.cardId)
      if(visit)queue!.enqueue(visit)
      const m=overlay!.mastery.find(m=>m.subject===subject)
      if(recall&&!isProcedure&&(visit||c.opened)&&((m?.level??0)<3||!!m?.due&&Date.parse(m.due)<=Date.now()))onRecall?.({subject,label:data.concepts.find(v=>v.id===c.id)?.label||c.id,topicId:data.meta.topic_id!})
      void queue!.flush()
    }
    const sync=()=>{const scene=learningSession.getSnapshot();const id=scene.topic?.id===data.meta.topic_id?scene.concept?.id:null
      setFocus(id??null)
      if(id!==current?.id){leave(true);if(id&&!document.hidden)current={id,started:now(),cardId:scene.card?.id??null,opened:!!scene.card}}
      else if(current&&scene.card){current.cardId=scene.card.id;current.opened=true}
    }
    const unsubscribe=learningSession.subscribe(sync);sync()
    const visibility=()=>{if(document.hidden){leave(false);void queue.flush(true)}else sync()}
    const pagehide=()=>{leave(false);void queue.flush(true)}
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide)
    return()=>{unsubscribe();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);leave(true)}
  },[remote,queue,overlay,data,onRecall])
  useEffect(()=>{
    if(!remote||!queue||!overlay)return
    const listener=(event: Event)=>{const d=(event as CustomEvent).detail
      if(d?.topicId!==data.meta.topic_id||typeof d.checked!=='boolean')return
      const procedure=data.concepts.find(c=>c.id===d.procedureId)
      const block=procedure?.cards.find(c=>c.block?.id===d.procedureId)?.block
      if(!block?.groups?.some((g:{items:{id:string}[]})=>g.items.some(i=>i.id===d.itemId)))return
      const subject: SubjectRef=`procitem:${d.topicId}/${d.procedureId}/${d.itemId}`
      overlay.checklist[subject]=d.checked
      block.recordChecked[d.itemId]=d.checked
      queue.enqueue({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'checklist',subject,cardId:d.procedureId,checked:d.checked});void queue.flush()
    }
    window.addEventListener('learning-checklist',listener);return()=>window.removeEventListener('learning-checklist',listener)
  },[remote,queue,overlay,data])
  return <>
    {!remote && <span className="dive-example">CS / 本地导入示例 · 不计入学习记录</span>}
    <StarDiveScene key={data.meta.topic_id || 'cs-demo'} data={data} initialFocus={remote ? initialFocus : data === DATA ? initialFocus ?? (DATA.concepts.some(c=>c.id===topicId)?topicId:null) : null} />
    {remote&&<nav className="dive-breadcrumb" aria-label="学习路径"><a href="#/panorama">全景</a> › <span>{learningSession.getSnapshot().record?.goal?.title || '未选目标'}</span> › {data.meta.title}</nav>}
    {remote&&focus&&candidates.some(r=>!r.confirmed&&(r.a===`concept:${data.meta.topic_id}/${focus}`||r.b===`concept:${data.meta.topic_id}/${focus}`))&&<aside className="dive-candidates"><h3>相关 · 候选</h3>{candidates.filter(r=>!r.confirmed&&(r.a===`concept:${data.meta.topic_id}/${focus}`||r.b===`concept:${data.meta.topic_id}/${focus}`)).map(r=><a key={r.id} href={location.hash.split('?')[0]+'?sheet=adjust'}>{r.reason} · 待确认</a>)}</aside>}
    <div className="star-dive-import">
      <label>导入笔记 <input aria-label="导入学习笔记" type="file" accept=".json,application/json" disabled={loading} onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        setLoading(true); setError('')
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB。')
          setData(adaptLearnDocument(JSON.parse(await file.text()))); setRemote(false); setOverlay(null)
        } catch (err) { setError(err instanceof Error ? err.message : '文件读取失败。') }
        finally { setLoading(false) }
      }} /></label>
      <button disabled={loading || data === DATA} onClick={() => { setData(DATA); setRemote(false); setOverlay(null); setError('') }}>CS 样例</button>
      <span>{loading ? '正在读取…' : '文件仅在本页读取'}</span>
      {error && <p role="alert">{error}</p>}
    </div>
  </>
}

function StarDiveScene({ data, initialFocus }: { data: StarDiveData; initialFocus?: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  useStarDive(rootRef, data, initialFocus)
  const meta = data.meta
  const shapes = [...new Set(data.concepts.map((c) => c.shape))]

  useEffect(() => {
    const prev = document.title
    document.title = 'Star Dive · 星图潜航'
    return () => { document.title = prev }
  }, [])

  return (
    <div className="star-dive" ref={rootRef}>
      <canvas id="sky"></canvas>
      <canvas id="links"></canvas>
      <div className="vignette"></div>
      <div id="stars"></div>
      <div id="focus"></div>
      <div id="panelWrap"></div>

      <div className="hud brand">
        <div className="eyebrow">Star Dive · 星图潜航</div>
        <h1 id="vtitle">{meta.title}</h1>
        <div className="meta" id="vmeta">
          {meta.channel} · {data.concepts.length} 颗知识星 · {meta.topic_id ? `${meta.source_count} 个来源` : <>{fmt(meta.duration_sec)} · <a href={meta.url} target="_blank" rel="noopener">在 YouTube 打开 ↗</a></>}
        </div>
      </div>
      <div className="hud legend" id="legend">
        {shapes.map((s) => (
          <span key={s}><em style={{ background: SHAPES[s].c, color: SHAPES[s].glow }}></em>{SHAPES[s].zh}</span>
        ))}
      </div>
      <div className="hud timeline" id="timeline"></div>
      <button className="hud back-btn" id="backBtn">← 返回星图</button>
    </div>
  )
}
