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
export default function StarDive({ initialFocus }: { initialFocus?: string | null }) {
  const [data, setData] = useState<StarDiveData>(DATA)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  return <>
    <StarDiveScene key={data.meta.topic_id || 'cs-demo'} data={data} initialFocus={data === DATA ? initialFocus : null} />
    <div className="star-dive-import">
      <label>导入笔记 <input aria-label="导入学习笔记" type="file" accept=".json,application/json" disabled={loading} onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        setLoading(true); setError('')
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB。')
          setData(adaptLearnDocument(JSON.parse(await file.text())))
        } catch (err) { setError(err instanceof Error ? err.message : '文件读取失败。') }
        finally { setLoading(false) }
      }} /></label>
      <button disabled={loading || data === DATA} onClick={() => { setData(DATA); setError('') }}>CS 样例</button>
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
