import { useEffect, useRef } from 'react'
import rawData from '../data/star-dive.json'
import './star-dive.css'
import type { StarDiveData } from './types'
import { useStarDive } from './useStarDive'
import { fmt, SHAPES } from './util'

const DATA = rawData as unknown as StarDiveData

/**
 * Star Dive · 星图潜航 — immersive star-map view of one video's concepts.
 * React owns the static shell (layers + brand/legend HUD); the scene engine (useStarDive) drives
 * the canvases, stars, focus/orbit cards, panels and timeline exactly like the prototype.
 */
export default function StarDive({ initialFocus }: { initialFocus?: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  useStarDive(rootRef, DATA, initialFocus)
  const meta = DATA.meta
  const shapes = [...new Set(DATA.concepts.map((c) => c.shape))]

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
          {meta.channel} · {fmt(meta.duration_sec)} · {DATA.concepts.length} 颗概念星 · <a href={meta.url} target="_blank" rel="noopener">在 YouTube 打开 ↗</a>
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
