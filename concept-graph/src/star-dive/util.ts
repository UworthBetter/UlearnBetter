/* Shared helpers, colour tokens and icons — verbatim from the prototype's utilities section. */

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export const fmt = (t: number) => {
  t = Math.max(0, Math.round(t))
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0')
}

export const el = (tag: string, cls?: string | null, html?: string | null): HTMLElement => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

/** Seeded PRNG (mulberry32) — same seeds as the prototype so the sky and layout are identical. */
export function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ShapeStyle {
  zh: string
  c: string
  deep: string
  glow: string
  glow2: string
}

export const SHAPES: Record<string, ShapeStyle> = {
  definition: { zh: '定义', c: '#fff1d6', deep: '#d9b98a', glow: 'rgba(255,236,200,.55)', glow2: 'rgba(255,220,170,.18)' },
  process: { zh: '流程', c: '#ffc46b', deep: '#e08a2a', glow: 'rgba(255,190,100,.6)', glow2: 'rgba(255,170,70,.2)' },
  formula: { zh: '公式', c: '#ffd98f', deep: '#f0a640', glow: 'rgba(255,214,140,.6)', glow2: 'rgba(255,200,110,.2)' },
  compare: { zh: '对比', c: '#9fe0ff', deep: '#4c9fd6', glow: 'rgba(150,215,255,.55)', glow2: 'rgba(120,200,255,.18)' },
  timeline: { zh: '时间线', c: '#ffab8a', deep: '#e0714a', glow: 'rgba(255,170,140,.55)', glow2: 'rgba(255,140,100,.18)' },
  example: { zh: '示例', c: '#c9b4ff', deep: '#8a6ae0', glow: 'rgba(200,180,255,.55)', glow2: 'rgba(170,140,255,.18)' },
}

export const ICONS: Record<string, string> = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M12 4v16"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 15c3-1 5-4 6-8M7 17c4 0 8-2 12-9"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
}

/** YouTube deep link for a given second, relative to the video in data.json meta. */
export const makeYtUrl = (url: string) => (t: number) => `${url}&t=${Math.round(t)}s`
