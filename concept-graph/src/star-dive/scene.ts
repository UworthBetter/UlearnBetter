/*
 * Star Dive scene engine — the prototype's canvas/DOM runtime (sky, constellation layout, links,
 * focus + orbit cards, expanded panel, timeline HUD, main loop), ported 1:1 but scoped to a root
 * element and fully tear-down-able so it can live inside a React component.
 */
import { cardTs, MODULES, moduleUi, mountModule, registerModule, resolveCard, runSchema, type MountedModule } from './modules'
import type { CardSpec, StarDiveConcept, StarDiveData } from './types'
import { el, esc, fmt, ICONS, makeYtUrl, rng, SHAPES } from './util'
import type { ActionResult, JsonValue, LearningSceneContext } from '../assistant/contracts'
import type { InteractionState } from './modules/interaction'

export interface SceneOptions {
  /** Concept id to dive into right after load (the prototype read this from location.hash). */
  initialFocus?: string | null
  onContextChange?: (context: LearningSceneContext) => void
}

export interface SceneHandle {
  focusStar(id: string): void
  back(): void
  openCard(conceptId: string, cardId: string): ActionResult
  closeCard(): void
  destroy(): void
}

interface StarNode {
  c: StarDiveConcept
  i: number
  el: HTMLButtonElement
  r: number
  x: number
  y: number
  vx: number
  vy: number
  ph: number
  ph2: number
  lw: number
  lh: number
  top: number
}

interface OrbitEl { i: number; wrap: HTMLElement; b: HTMLButtonElement; card: CardSpec; sx: number; sy: number; bx: number | null; by: number | null }

type Pt = { x: number; y: number }

export function createStarDive(root: HTMLElement, DATA: StarDiveData, opts: SceneOptions = {}): SceneHandle {
  /* ================= utilities ================= */
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T
  let W = innerWidth, H = innerHeight
  const DPR = Math.min(2, devicePixelRatio || 1)
  const META = DATA.meta
  let nodes: StarNode[] = []
  const byId: Record<string, StarNode> = {}
  let edges: [StarNode, StarNode][] = []
  const cam = { x: 0, y: 0, k: 1 }, camT = { x: 0, y: 0, k: 1 }
  const state: { focus: string | null; panel: CardSpec | null; hover: string | null } = { focus: null, panel: null, hover: null }
  let interaction: InteractionState | null = null
  const ytUrl = makeYtUrl(META.url)
  const cardId = (c: StarDiveConcept, card: CardSpec) =>
    typeof card.id === 'string' && card.id ? card.id : `${c.id}:card:${c.cards.indexOf(card)}`
  function publishContext() {
    const c = DATA.concepts.find((item) => item.id === state.focus)
    const card = state.panel
    opts.onContextChange?.({
      view: 'star-dive',
      topic: { id: META.video_id, title: META.title },
      concept: c ? {
        id: c.id, label: c.label, summary: c.summary, relatedIds: [...c.relations],
        cards: c.cards.map((item) => ({ id: cardId(c, item), title: item.title || c.label, type: item.type })),
      } : null,
      card: c && card ? {
        id: cardId(c, card), title: card.title || c.label, type: card.type,
        content: card as JsonValue,
        evidence: cardTs(card).map((t) => ({ sourceId: META.video_id, startSec: t, url: ytUrl(t) })),
      } : null,
      interaction,
    })
  }

  // lifecycle bookkeeping (not in the prototype, which lived for the whole page)
  let destroyed = false, rafId = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn() }, ms); timers.add(id); return id }
  const life = new AbortController()

  /* ================= sky (background canvas) ================= */
  const sky = (() => {
    const cv = $<HTMLCanvasElement>('#sky'), ctx = cv.getContext('2d')!
    let stars: { x: number; y: number; z: number; r: number; tw: number; ts: number; col: string; px: number | null; py: number | null }[] = []
    let neb: HTMLCanvasElement | null = null, shoots: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [], nextShoot = 2500
    const R = rng(7)
    function resize() {
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px'
      const n = Math.round(W * H / 2600)
      stars = Array.from({ length: n }, () => {
        const z = Math.pow(R(), 1.8) * .9 + .1
        const warm = R()
        return {
          x: (R() - .5) * W * 1.7, y: (R() - .5) * H * 1.7, z, r: .3 + z * 1.3 * R() + .2, tw: R() * 6.28, ts: .5 + R() * 1.6,
          col: warm < .12 ? '255,206,150' : warm < .2 ? '170,210,255' : '225,232,255', px: null, py: null,
        }
      })
      neb = document.createElement('canvas'); neb.width = Math.round(W * 1.5); neb.height = Math.round(H * 1.5)
      const g = neb.getContext('2d')!, nw = neb.width, nh = neb.height
      const base = g.createLinearGradient(0, 0, 0, nh); base.addColorStop(0, '#050b20'); base.addColorStop(.55, '#0a1638'); base.addColorStop(1, '#071029')
      g.fillStyle = base; g.fillRect(0, 0, nw, nh)
      const blob = (x: number, y: number, r: number, c: string) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, nw, nh) }
      blob(nw * .28, nh * .35, nw * .32, 'rgba(48,72,170,.30)')
      blob(nw * .74, nh * .62, nw * .30, 'rgba(84,46,140,.20)')
      blob(nw * .62, nh * .28, nw * .22, 'rgba(255,150,60,.07)')
      blob(nw * .40, nh * .72, nw * .26, 'rgba(30,110,150,.13)')
      blob(nw * .5, nh * .5, nw * .5, 'rgba(26,40,96,.22)')
      // milky band
      g.save(); g.translate(nw / 2, nh / 2); g.rotate(-.42)
      const band = g.createLinearGradient(0, -nh * .18, 0, nh * .18)
      band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(.5, 'rgba(150,170,255,.06)'); band.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = band; g.fillRect(-nw, -nh * .18, nw * 2, nh * .36); g.restore()
      const R2 = rng(99)
      for (let i = 0; i < 1400; i++) {
        const x = nw / 2 + (R2() - .5) * nw * 1.2, y = nh / 2 + (x - nw / 2) * -.45 + (R2() + R2() + R2() - 1.5) * nh * .14
        g.fillStyle = `rgba(210,220,255,${R2() * .25})`; g.fillRect(x, y, .8, .8)
      }
    }
    function draw(t: number, dt: number) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const kk = 1 + (cam.k - 1) * .12
      const nx = -cam.x * .06, ny = -cam.y * .06
      if (neb) ctx.drawImage(neb, (W - neb.width * kk) / 2 + nx, (H - neb.height * kk) / 2 + ny, neb.width * kk, neb.height * kk)
      const vk = Math.abs(camT.k - cam.k) + (Math.abs(camT.x - cam.x) + Math.abs(camT.y - cam.y)) / 600
      for (const s of stars) {
        const sc = 1 + (cam.k - 1) * s.z * .9
        const sx = W / 2 + (s.x - cam.x * s.z * .35) * sc, sy = H / 2 + (s.y - cam.y * s.z * .35) * sc
        const a = (.35 + .65 * (.5 + .5 * Math.sin(t * .001 * s.ts + s.tw))) * (.35 + s.z * .65)
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) { s.px = null; continue }
        if (vk > .01 && s.px != null && s.py != null && (Math.abs(sx - s.px) + Math.abs(sy - s.py)) > 1.2) {
          ctx.strokeStyle = `rgba(${s.col},${a * .9})`; ctx.lineWidth = s.r * 1.2; ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(s.px + (s.px - sx) * 2, s.py + (s.py - sy) * 2); ctx.lineTo(sx, sy); ctx.stroke()
        } else {
          ctx.fillStyle = `rgba(${s.col},${a})`; ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, 6.283); ctx.fill()
        }
        s.px = sx; s.py = sy
      }
      // shooting stars
      nextShoot -= dt
      if (nextShoot < 0) { nextShoot = 5000 + R() * 7000; const ang = .35 + R() * .3; shoots.push({ x: R() * W * .8, y: R() * H * .4, vx: Math.cos(ang) * .9, vy: Math.sin(ang) * .9, life: 0, max: 900 }) }
      shoots = shoots.filter((s) => (s.life += dt) < s.max)
      for (const s of shoots) {
        const p = s.life / s.max, x = s.x + s.vx * s.life, y = s.y + s.vy * s.life, a = Math.sin(p * Math.PI) * .8
        const gr = ctx.createLinearGradient(x, y, x - s.vx * 140, y - s.vy * 140)
        gr.addColorStop(0, `rgba(255,236,200,${a})`); gr.addColorStop(1, 'rgba(255,236,200,0)')
        ctx.strokeStyle = gr; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx * 140, y - s.vy * 140); ctx.stroke()
      }
    }
    return { resize, draw }
  })()

  /* ================= constellation / stars ================= */
  function buildStars() {
    const layer = $('#stars')
    layer.innerHTML = ''
    nodes = DATA.concepts.map((c, i) => {
      const sh = SHAPES[c.shape] || SHAPES.definition
      const r = 3.6 + c.cards.length * .9 + c.relations.length * .35
      const b = el('button', 'star') as HTMLButtonElement
      b.type = 'button'; b.dataset.id = c.id; b.setAttribute('aria-label', c.label + ' ' + (c.en || ''))
      b.style.cssText = `--c:${sh.c};--c-deep:${sh.deep};--c-glow:${sh.glow};--c-glow2:${sh.glow2};--d:${(-i * .73).toFixed(2)}s`
      b.innerHTML = `<span class="hit"></span><span class="ring"></span>
      <span class="halo" style="left:${-r * 4}px;top:${-r * 4}px;width:${r * 8}px;height:${r * 8}px"></span>
      <span class="spike"></span><span class="spike v"></span>
      <span class="core" style="left:${-r}px;top:${-r}px;width:${r * 2}px;height:${r * 2}px"></span>
      <span class="label" style="top:${r + 10}px"><b>${esc(c.label)}</b><i>${esc(c.en || '')}</i></span>`
      b.addEventListener('click', (e) => { e.stopPropagation(); focusStar(c.id) })
      b.addEventListener('mouseenter', () => { state.hover = c.id; markTimeline() })
      b.addEventListener('mouseleave', () => { if (state.hover === c.id) state.hover = null; markTimeline() })
      b.addEventListener('focus', () => { state.hover = c.id })
      b.addEventListener('blur', () => { if (state.hover === c.id) state.hover = null })
      layer.appendChild(b)
      const n: StarNode = { c, i, el: b, r, x: 0, y: 0, vx: 0, vy: 0, ph: i * 1.7, ph2: i * 2.3 + 1, lw: 0, lh: 0, top: 0 }
      byId[c.id] = n
      return n
    })
    const seen = new Set<string>(); edges = []
    for (const n of nodes) for (const r of n.c.relations) {
      if (!byId[r]) continue
      const key = [n.c.id, r].sort().join('|')
      if (!seen.has(key)) { seen.add(key); edges.push([n, byId[r]]) }
    }
  }

  function layout() {
    // measure label boxes
    for (const n of nodes) {
      const lb = n.el.querySelector('.label')!.getBoundingClientRect()
      n.lw = Math.max(lb.width, 60); n.lh = lb.height; n.top = n.r + 10
    }
    const mx = Math.min(130, W * .08), top = 118, bot = 150
    const box = { x0: -W / 2 + mx, x1: W / 2 - mx, y0: -H / 2 + top, y1: H / 2 - bot }
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0, cxb = (box.x0 + box.x1) / 2, cyb = (box.y0 + box.y1) / 2
    const R = rng(42), N = nodes.length
    nodes.forEach((n, i) => { const a = i / N * Math.PI * 2 - Math.PI / 2; n.x = cxb + Math.cos(a) * bw * .36 + (R() - .5) * 40; n.y = cyb + Math.sin(a) * bh * .36 + (R() - .5) * 40 })
    const sx = bw / Math.max(bw, bh), sy = bh / Math.max(bw, bh)
    // force simulation in a normalised (aspect-corrected) space
    for (let it = 0; it < 700; it++) {
      const cool = 1 - it / 700
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
        const A = nodes[a], B = nodes[b]
        let dx = (B.x - A.x) / sx, dy = (B.y - A.y) / sy
        const d2 = dx * dx + dy * dy + .01, d = Math.sqrt(d2)
        const f = Math.min(30, 52000 / d2)
        dx /= d; dy /= d; A.vx -= dx * f * sx; A.vy -= dy * f * sy; B.vx += dx * f * sx; B.vy += dy * f * sy
      }
      for (const [A, B] of edges) {
        const dx = (B.x - A.x) / sx, dy = (B.y - A.y) / sy, d = Math.hypot(dx, dy) + .01
        const f = (d - 230) * .012
        A.vx += dx / d * f * sx; A.vy += dy / d * f * sy; B.vx -= dx / d * f * sx; B.vy -= dy / d * f * sy
      }
      for (const n of nodes) {
        n.vx += (cxb - n.x) * .004; n.vy += (cyb - n.y) * .006
        n.vx *= .82; n.vy *= .82
        n.x += n.vx * cool; n.y += n.vy * cool
        n.x = Math.max(box.x0, Math.min(box.x1, n.x)); n.y = Math.max(box.y0, Math.min(box.y1, n.y))
      }
    }
    // stretch to fill the box
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const n of nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y) }
    for (const n of nodes) {
      n.x = box.x0 + (n.x - x0) / Math.max(1, x1 - x0) * bw
      n.y = box.y0 + (n.y - y0) / Math.max(1, y1 - y0) * bh
    }
    // resolve rectangle overlaps (star + label), with drift margin
    const pad = 16
    const rect = (n: StarNode) => ({ l: n.x - Math.max(n.lw / 2, n.r * 3) - pad, r: n.x + Math.max(n.lw / 2, n.r * 3) + pad, t: n.y - n.r * 3 - pad, b: n.y + n.top + n.lh + pad })
    for (let it = 0; it < 1500; it++) {
      let moved = false
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
        const A = nodes[a], B = nodes[b], ra = rect(A), rb = rect(B)
        const ox = Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l), oy = Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t)
        if (ox > 0 && oy > 0) {
          moved = true
          if (ox / bw < oy / bh) { const s = (A.x < B.x ? -1 : 1) * ox / 2 + .5; A.x += s; B.x -= s }
          else { const s = (A.y < B.y ? -1 : 1) * oy / 2 + .5; A.y += s; B.y -= s }
        }
      }
      for (const n of nodes) {
        const hw = Math.max(n.lw / 2, n.r * 3)
        n.x = Math.max(-W / 2 + hw + 18, Math.min(W / 2 - hw - 18, n.x))
        n.y = Math.max(-H / 2 + top - 10, Math.min(H / 2 - bot - n.top - n.lh + 20, n.y))
      }
      if (!moved) break
    }
  }

  function project(n: StarNode, t: number): Pt {
    const dx = Math.sin(t * .00021 + n.ph) * 5, dy = Math.cos(t * .00017 + n.ph2) * 4
    return { x: W / 2 + (n.x + dx - cam.x) * cam.k, y: H / 2 + (n.y + dy - cam.y) * cam.k }
  }

  /* ================= links canvas ================= */
  const lcv = $<HTMLCanvasElement>('#links'), lctx = lcv.getContext('2d')!
  function resizeLinks() { lcv.width = W * DPR; lcv.height = H * DPR; lcv.style.width = W + 'px'; lcv.style.height = H + 'px' }
  function drawLinks(t: number, P: Record<string, Pt>) {
    lctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    lctx.clearRect(0, 0, W, H)
    const hot = state.focus || state.hover
    for (const [A, B] of edges) {
      const pa = P[A.c.id], pb = P[B.c.id]
      const on = hot && (A.c.id === hot || B.c.id === hot)
      if (state.focus && !on) { lctx.strokeStyle = 'rgba(180,200,255,.04)'; lctx.lineWidth = 1; lctx.setLineDash([]) }
      else if (on) {
        const g = lctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y)
        g.addColorStop(0, 'rgba(255,190,100,.75)'); g.addColorStop(1, 'rgba(255,214,150,.35)')
        lctx.strokeStyle = g; lctx.lineWidth = 1.4; lctx.setLineDash([6, 7]); lctx.lineDashOffset = -t * .02
      } else { lctx.strokeStyle = 'rgba(200,215,255,.12)'; lctx.lineWidth = 1; lctx.setLineDash([]) }
      lctx.beginPath(); lctx.moveTo(pa.x, pa.y); lctx.lineTo(pb.x, pb.y); lctx.stroke()
    }
    lctx.setLineDash([])
    // keep lines from crossing label text
    const sk = Math.sqrt(cam.k)
    for (const n of nodes) {
      const p = P[n.c.id]
      lctx.clearRect(p.x - n.lw / 2 * sk - 4, p.y + (n.top - 2) * sk, n.lw * sk + 8, (n.lh + 4) * sk)
    }
    // tethers to orbit cards
    if (state.focus && orbitEls.length) {
      for (const o of orbitEls) {
        const g = lctx.createLinearGradient(W / 2, H / 2, o.sx, o.sy)
        g.addColorStop(0, 'rgba(255,190,100,0)'); g.addColorStop(.45, 'rgba(255,190,100,.35)'); g.addColorStop(1, 'rgba(255,214,150,.1)')
        lctx.strokeStyle = g; lctx.lineWidth = 1.2; lctx.beginPath(); lctx.moveTo(W / 2, H / 2); lctx.lineTo(o.sx, o.sy); lctx.stroke()
        const p = ((t * .00035 + o.i * .27) % 1), qx = W / 2 + (o.sx - W / 2) * (.3 + p * .6), qy = H / 2 + (o.sy - H / 2) * (.3 + p * .6)
        lctx.fillStyle = `rgba(255,210,140,${.8 * Math.sin(p * Math.PI)})`; lctx.beginPath(); lctx.arc(qx, qy, 2, 0, 6.283); lctx.fill()
      }
    }
  }

  /* ================= focus: main card + orbit ================= */
  const focusLayer = $('#focus')
  let orbitEls: OrbitEl[] = []
  function orbitAngles(n: number): number[] {
    return ({ 1: [0], 2: [-12, 192], 3: [-24, 204, 90], 4: [-32, 212, 32, 148] } as Record<number, number[]>)[n] || Array.from({ length: n }, (_, i) => i / n * 360 - 90)
  }
  function focusStar(id: string) {
    const n = byId[id]; if (!n) return
    if (state.panel) closePanel(true)
    if (state.focus === id) return
    const switching = !!state.focus
    state.focus = id
    publishContext()
    root.classList.add('focused')
    camT.x = n.x; camT.y = n.y; camT.k = 1.42
    for (const m of nodes) {
      m.el.classList.toggle('self', m === n)
      m.el.classList.toggle('related', n.c.relations.includes(m.c.id) || m.c.relations.includes(id))
      m.el.classList.toggle('dim', m !== n && !(n.c.relations.includes(m.c.id) || m.c.relations.includes(id)))
    }
    const build = () => {
      if (state.focus !== id || state.panel) return
      renderFocus(n); markTimeline()
    }
    if (switching) { focusLayer.querySelectorAll('.main-card,.orbit').forEach((e) => e.classList.add('leaving')); orbitEls = []; later(build, 260) }
    else later(build, 380)
  }
  function renderFocus(n: StarNode) {
    const c = n.c, sh = SHAPES[c.shape] || SHAPES.definition
    focusLayer.innerHTML = ''; focusLayer.classList.remove('receded')
    const rel = [...new Set([...c.relations, ...nodes.filter((m) => m.c.relations.includes(c.id)).map((m) => m.c.id)])].filter((r) => byId[r])
    const ts = [...new Set(c.cards.flatMap((k) => cardTs(k)))].sort((a, b) => a - b).slice(0, 6)
    const mc = el('div', 'main-card')
    mc.innerHTML = `<div class="bloom-flash"></div><div class="inner glass">
    <div class="tagrow"><span class="tag">${esc(sh.zh)} · ${esc(c.shape)}</span><span class="tag ghost">${c.cards.length} 张卡片</span></div>
    <h2>${esc(c.label)}</h2><div class="en">${esc(c.en || '')}</div>
    <p class="sum">${esc(c.summary)}</p>
    <div class="sect">相关概念 · 已点亮</div>
    <div class="chips">${rel.map((r) => `<button class="chip" data-go="${esc(r)}">${esc(byId[r].c.label)}</button>`).join('')}</div>
    <div class="sect">视频出处</div>
    <div class="chips">${ts.map((t) => `<a class="chip ts" href="${esc(ytUrl(t))}" target="_blank" rel="noopener">${fmt(t)}</a>`).join('')}</div>
  </div>`
    mc.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); focusStar(b.dataset.go!) }))
    mc.addEventListener('click', (e) => e.stopPropagation())
    focusLayer.appendChild(mc)
    orbitEls = c.cards.map((card, i) => {
      const r = resolveCard(c, card), ui = moduleUi(r)
      const wrap = el('div', 'orbit')
      const b = el('button', 'orbit-card glass') as HTMLButtonElement
      b.type = 'button'
      b.innerHTML = `<div class="oc-top"><span class="oc-ic">${ICONS[ui.icon] || ICONS.book}</span><span class="oc-act">${esc(ui.text).replace(/(\d\d:\d\d)/, '<span class="mono">$1</span>')}</span></div>
      <div class="oc-title">${esc(r.spec.title || '')}</div>`
      b.style.setProperty('--delay', (.25 + i * .09) + 's')
      wrap.appendChild(b); focusLayer.appendChild(wrap)
      b.addEventListener('click', (e) => { e.stopPropagation(); openPanel(c, card, b) })
      const o: OrbitEl = { i, wrap, b, card, sx: W / 2, sy: H / 2, bx: null, by: null }
      return o
    })
    positionOrbits(performance.now(), true)
  }
  function orbitBase() {
    const mc = focusLayer.querySelector<HTMLElement>('.main-card'); if (!mc) return
    const mw = mc.offsetWidth, mh = mc.offsetHeight, cw = 176, ch = 92, g = 26, n = orbitEls.length
    if (W < 720) {
      // stacked mobile layout: main card on top, orbit cards in a grid below
      const rows = Math.ceil(n / 2), gridH = rows * (ch + 10)
      const cwM = Math.min(cw, (W - 42) / 2)
      orbitEls.forEach((o, i) => {
        const col = n === 1 ? .5 : i % 2, row = Math.floor(i / 2)
        o.bx = W / 2 + (col - .5) * (cwM + 10); o.by = H - 24 - gridH + row * (ch + 10) + ch / 2
        o.b.style.width = cwM + 'px'; o.b.style.left = (-cwM / 2) + 'px'
      })
      mc.style.top = '64px'; mc.style.transform = 'translateX(-50%)'
      mc.style.maxHeight = (H - 64 - gridH - 40) + 'px'; mc.style.overflow = 'auto'; mc.style.borderRadius = '20px'
      return
    }
    mc.style.cssText = ''
    const main = { l: W / 2 - mw / 2 - g, r: W / 2 + mw / 2 + g, t: H / 2 - mh / 2 - g, b: H / 2 + mh / 2 + g }
    const place = (angs: number[]) => angs.map((deg) => {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
      const tx = Math.abs(c) > .01 ? (mw / 2 + cw / 2 + g) / Math.abs(c) : 1e9, ty = Math.abs(s) > .01 ? (mh / 2 + ch / 2 + g) / Math.abs(s) : 1e9
      const t = Math.min(tx, ty) + 8
      let x = W / 2 + c * t, y = H / 2 + s * t
      x = Math.max(cw / 2 + 24, Math.min(W - cw / 2 - 24, x)); y = Math.max(130 + ch / 2, Math.min(H - 118 - ch / 2, y))
      const clash = x - cw / 2 < main.r && main.l < x + cw / 2 && y - ch / 2 < main.b && main.t < y + ch / 2
      return { x, y, clash }
    })
    let pos = place(orbitAngles(n))
    if (pos.some((p) => p.clash)) pos = place(({ 3: [180, -26, 26], 4: [-26, 206, 26, 154] } as Record<number, number[]>)[n] || orbitAngles(n))
    orbitEls.forEach((o, i) => { o.bx = pos[i].x; o.by = pos[i].y; o.b.style.width = ''; o.b.style.left = '' })
  }
  function positionOrbits(t: number, init?: boolean) {
    if (init || orbitEls.some((o) => o.bx == null)) orbitBase()
    const still = W < 720
    for (const o of orbitEls) {
      const dx = still ? 0 : Math.sin(t * .00032 + o.i * 1.9) * 6, dy = still ? 0 : Math.sin(t * .0009 + o.i) * 4
      o.sx = (o.bx ?? W / 2) + dx; o.sy = (o.by ?? H / 2) + dy
      o.wrap.style.transform = `translate(${o.sx}px,${o.sy}px)`
      if (init) { o.b.style.setProperty('--fx', (W / 2 - o.sx) + 'px'); o.b.style.setProperty('--fy', (H / 2 - o.sy) + 'px') }
    }
  }
  function unfocus() {
    closePanel(true)
    if (!state.focus) return
    state.focus = null; root.classList.remove('focused')
    publishContext()
    camT.x = 0; camT.y = 0; camT.k = 1
    const old = [...focusLayer.children]; old.forEach((e) => e.classList.add('leaving'))
    orbitEls.forEach((o) => { o.b.style.transition = 'opacity .3s, transform .4s'; o.b.style.opacity = '0' })
    later(() => old.forEach((e) => e.remove()), 320)
    orbitEls = []
    for (const m of nodes) m.el.classList.remove('self', 'related', 'dim')
    markTimeline()
  }

  /* ================= expanded panel ================= */
  const panelWrap = $('#panelWrap')
  let activeModule: MountedModule | null = null // handle returned by mountModule() for the open panel
  const host = { meta: META, ytUrl, onInteractionChange: (next: InteractionState | null) => {
    if (!state.panel || destroyed) return
    interaction = next
    publishContext()
  } }
  function openPanel(c: StarDiveConcept, card: CardSpec, fromEl: HTMLElement) {
    closePanel(true)
    const r = resolveCard(c, card), ui = moduleUi(r)
    state.panel = card
    focusLayer.classList.add('receded')
    panelWrap.innerHTML = ''
    const p = el('div', 'panel glass')
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', r.spec.title || ui.text)
    const ts = cardTs(r.spec)
    p.innerHTML = `<div class="p-head"><span class="oc-ic">${ICONS[ui.icon] || ICONS.book}</span>
      <div><div class="crumb">${esc(c.label)} · ${esc(ui.text)}</div><h3>${esc(r.spec.title || '')}</h3></div>
      <button class="p-close" aria-label="关闭">×</button></div>
    <div class="p-body"></div>
    ${ts.length ? `<div class="p-foot"><span class="lbl">出处</span>${ts.map((t) => `<a class="chip ts" href="${esc(ytUrl(t))}" target="_blank" rel="noopener">${fmt(t)}</a>`).join('')}</div>` : ''}`
    p.addEventListener('click', (e) => e.stopPropagation())
    p.querySelector('.p-close')!.addEventListener('click', () => closePanel())
    panelWrap.appendChild(p); panelWrap.classList.add('on')
    activeModule = mountModule(p.querySelector<HTMLElement>('.p-body')!, c, card, host)
    publishContext()
    // FLIP from orbit card
    const a = fromEl.getBoundingClientRect(), b = p.getBoundingClientRect()
    p.style.transition = 'none'
    p.style.transform = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px,${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(.15, a.width / b.width)})`
    p.style.opacity = '0'
    p.getBoundingClientRect()
    p.style.transition = ''; p.style.transform = ''; p.style.opacity = '1'
  }
  function closePanel(instant?: boolean) {
    if (activeModule) { activeModule.destroy(); activeModule = null }
    interaction = null
    if (!state.panel) return
    state.panel = null; focusLayer.classList.remove('receded')
    publishContext()
    const p = panelWrap.querySelector<HTMLElement>('.panel')
    if (instant || !p) { panelWrap.classList.remove('on'); panelWrap.innerHTML = ''; return }
    p.style.transform = 'scale(.92)'; p.style.opacity = '0'
    later(() => { if (!state.panel) { panelWrap.classList.remove('on'); panelWrap.innerHTML = '' } }, 300)
  }
  function back() { if (state.panel) closePanel(); else unfocus() }

  /* ================= HUD (timeline; brand + legend are rendered by the React view) ================= */
  function buildHud() {
    const tl = $('#timeline'), D = META.duration_sec
    const chapters = META.chapters || []
    tl.innerHTML = `<div class="tl-cap" id="tlcap"></div><div class="tl-bar">
    ${chapters.map((ch) => `<div class="tl-seg" data-t="${esc(ch.title)} · ${fmt(ch.start)}" style="left:calc(${ch.start / D * 100}% + 1px);width:calc(${(ch.end - ch.start) / D * 100}% - 2px)"></div>`).join('')}
    <div id="ticks"></div>
    ${DATA.concepts.map((c) => { const t = Math.min(...c.cards.flatMap((k) => cardTs(k))); return `<button class="tl-dot" data-id="${esc(c.id)}" title="${esc(c.label)} · ${fmt(t)}" style="left:${t / D * 100}%"></button>` }).join('')}
  </div><div class="tl-ends"><span>00:00</span><span>${fmt(D)}</span></div>`
    tl.querySelectorAll<HTMLElement>('.tl-dot').forEach((d) => {
      d.addEventListener('click', (e) => { e.stopPropagation(); focusStar(d.dataset.id!) })
      d.addEventListener('mouseenter', () => { state.hover = d.dataset.id!; markTimeline() })
      d.addEventListener('mouseleave', () => { state.hover = null; markTimeline() })
    })
    tl.addEventListener('click', (e) => e.stopPropagation())
  }
  function markTimeline() {
    const id = state.focus || state.hover, D = META.duration_sec
    root.querySelectorAll<HTMLElement>('.tl-dot').forEach((d) => d.classList.toggle('on', d.dataset.id === id))
    const cap = $('#tlcap')
    if (cap) cap.innerHTML = state.focus ? `视频时间轴 · 琥珀刻度 = 「${esc(byId[state.focus].c.label)}」的出处` : '点击任意星星潜入 · <kbd>Esc</kbd> 或点击空白处返回 · 时间轴上的点 = 概念首次出现'
    const tk = $('#ticks'); if (!tk) return
    const c = state.focus && byId[state.focus] ? byId[state.focus].c : null
    tk.innerHTML = c ? [...new Set(c.cards.flatMap((k) => cardTs(k)))].map((t) => `<div class="tl-tick" style="left:${t / D * 100}%;opacity:.85"></div>`).join('') : ''
  }

  /* ================= main loop ================= */
  let lastT = performance.now(), lastHide = 0
  function hideCoveredLabels(P: Record<string, Pt>, sk: number) {
    const blocks = [...root.querySelectorAll('.brand,.legend,.timeline,.back-btn' + (state.focus ? ',.main-card .inner,.orbit-card' : ''))]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
    for (const n of nodes) {
      const p = P[n.c.id], l = p.x - n.lw / 2 * sk - 6, r = p.x + n.lw / 2 * sk + 6, tp = p.y - n.r * 2 * sk, b = p.y + (n.top + n.lh) * sk + 4
      const off = (state.focus && blocks.some((q) => l < q.right && q.left < r && tp < q.bottom && q.top < b)) || l < 0 || r > W || b > H
      n.el.classList.toggle('lab-off', !!off)
    }
  }
  function loop(t: number) {
    if (destroyed) return
    const dt = Math.min(64, t - lastT); lastT = t
    const e = 1 - Math.pow(1 - .075, dt / 16.7)
    cam.x += (camT.x - cam.x) * e; cam.y += (camT.y - cam.y) * e; cam.k += (camT.k - cam.k) * e
    sky.draw(t, dt)
    const P: Record<string, Pt> = {}
    const sk = Math.sqrt(cam.k)
    for (const n of nodes) {
      const p = project(n, t); P[n.c.id] = p
      n.el.style.transform = `translate(${p.x}px,${p.y}px) scale(${sk.toFixed(3)})`
    }
    if (state.focus) positionOrbits(t)
    if (t - lastHide > 120) { lastHide = t; hideCoveredLabels(P, sk) }
    drawLinks(t, P)
    rafId = requestAnimationFrame(loop)
  }

  function onResize() {
    W = innerWidth; H = innerHeight
    sky.resize(); resizeLinks()
    for (const n of nodes) n.el.style.transform = 'none'
    layout()
    if (state.focus) { const n = byId[state.focus]; camT.x = n.x; camT.y = n.y; cam.x = n.x; cam.y = n.y; positionOrbits(performance.now(), true) }
  }

  const sig = { signal: life.signal }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') back() }, sig)
  document.addEventListener('click', (e) => {
    const t = e.target as Element | null
    if (t && root.contains(t) && !t.closest('.star,.main-card,.orbit-card,.panel,.timeline,a,button')) back()
  }, sig)
  $('#backBtn').addEventListener('click', (e) => { e.stopPropagation(); closePanel(true); unfocus() }, sig)
  let rz: ReturnType<typeof setTimeout> | undefined
  addEventListener('resize', () => { if (rz) { clearTimeout(rz); timers.delete(rz) } rz = later(onResize, 150) }, sig)

  const w = window as any
  function init() {
    if (destroyed) return
    sky.resize(); resizeLinks()
    buildStars(); buildHud(); layout(); markTimeline(); publishContext()
    rafId = requestAnimationFrame(loop)
    const first = opts.initialFocus
    if (first && byId[first]) later(() => focusStar(first), 300)
    w.__starDive = { focusStar, back, state, nodes, data: DATA }
    // public surface for future module authors (see MODULES.md)
    w.StarDive = Object.freeze({
      registerModule, modules: () => [...MODULES.keys()],
      validateCard: (card: any, concept: any = { id: '?', shape: 'definition' }) => {
        const m = card && MODULES.get(card.type)
        return m ? runSchema(m, card, concept) : [`unknown module type "${card && card.type}"`]
      },
    })
    // validate every card up front so authoring mistakes surface in the console immediately
    DATA.concepts.forEach((c) => c.cards.forEach((k) => resolveCard(c, k)))
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init)
  else init()

  return {
    focusStar,
    back,
    closeCard: () => closePanel(),
    openCard(conceptId, requestedCardId) {
      const n = Object.hasOwn(byId, conceptId) ? byId[conceptId] : null
      if (!n) return { ok: false, message: '概念不存在或星图尚未就绪' }
      const index = n.c.cards.findIndex((card) => cardId(n.c, card) === requestedCardId)
      if (index < 0) return { ok: false, message: '卡片不存在' }
      focusStar(conceptId)
      renderFocus(n)
      openPanel(n.c, n.c.cards[index], orbitEls[index].b)
      return { ok: true, message: '已打开卡片' }
    },
    destroy() {
      if (destroyed) return
      closePanel(true)
      destroyed = true
      cancelAnimationFrame(rafId)
      timers.forEach((id) => clearTimeout(id)); timers.clear()
      life.abort()
      for (const id of ['#stars', '#focus', '#panelWrap', '#timeline']) { const e = root.querySelector(id); if (e) e.innerHTML = '' }
      panelWrap.classList.remove('on'); focusLayer.classList.remove('receded'); root.classList.remove('focused')
      if (w.__starDive && w.__starDive.data === DATA) delete w.__starDive
      delete w.StarDive
    },
  }
}
