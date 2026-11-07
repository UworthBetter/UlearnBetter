/* =====================================================================
   param_demo — generic parameter-driven chart module
   ===================================================================== */
import { el, esc, fmt } from '../util'
import { DSL, type Env } from './dsl'
import { registerModule, V, validateParams } from './registry'

const PD_COLORS = ['#ffb547', '#86dcff', '#7fe0c4', '#ffd48a', '#ff8a5a', '#c9b4ff', '#ff6b7a']
const GROWTH: Record<string, { label: string; expr: string }> = Object.assign(Object.create(null), {
  '1': { label: 'O(1)', expr: '1' },
  'log n': { label: 'O(log n)', expr: 'log2(x)' },
  'n': { label: 'O(n)', expr: 'x' },
  'n log n': { label: 'O(n log n)', expr: 'x*log2(x)' },
  'n^2': { label: 'O(n²)', expr: 'x^2' },
  '2^n': { label: 'O(2ⁿ)', expr: '2^x' },
})
const PD_KINDS: Record<string, (spec: any) => any> = Object.assign(Object.create(null), { // null prototype: spec strings can't reach Object.prototype
  series: (spec: any) => ({
    series: Array.isArray(spec.formula) ? spec.formula : Array.isArray(spec.series) ? spec.series
      : typeof spec.formula === 'string' && !PD_KINDS[spec.formula] ? [{ label: spec.seriesLabel || spec.title, expr: spec.formula }] : [],
    yScale: spec.yScale || 'linear', xLabel: spec.xLabel || 'x', yLabel: spec.yLabel || 'y', mark: spec.mark || 'line',
  }),
  growth_curves: (spec: any) => ({
    series: (Array.isArray(spec.curves) ? spec.curves : Object.keys(GROWTH)).map((k: any) => GROWTH[k] ? { ...GROWTH[k], note: (spec.curveNotes || {})[k] || '' } : { label: String(k), expr: '?' }),
    yScale: spec.yScale || 'log', xLabel: spec.xLabel || '输入规模 n', yLabel: spec.yLabel || '操作次数（对数刻度）', mark: 'line',
  }),
  binary: (spec: any) => ({
    series: [{ label: spec.seriesLabel || '可表示的值 2ⁿ', expr: '2^x' }],
    yScale: spec.yScale || 'log', xLabel: spec.xLabel || 'bit 数量', yLabel: spec.yLabel || '可表示的值', mark: 'bars', bits: true, discrete: true,
  }),
})

/** Normalise + compile a param_demo spec. Throws with a readable message when invalid. */
function compileParamDemo(spec: any): { errs: string[]; cfg?: any } {
  const errs: string[] = []
  V.str(spec.title, 'title', errs)
  validateParams(spec.params, errs)
  // `formula` is either a built-in kind name, a DSL expression (one series) or an array of {label, expr}
  const f = spec.formula
  const kind = spec.kind || (typeof f === 'string' && PD_KINDS[f] ? f : (typeof f === 'string' || Array.isArray(f) || Array.isArray(spec.series)) ? 'series' : null)
  if (!PD_KINDS[kind]) errs.push(`kind must be one of ${Object.keys(PD_KINDS).join(', ')}`)
  if (errs.length) return { errs }
  const names: string[] = spec.params.map((p: any) => p.name), cfg = PD_KINDS[kind](spec)
  cfg.kind = kind; cfg.discrete = cfg.discrete || !!spec.discrete
  if (!['linear', 'log'].includes(cfg.yScale)) errs.push('yScale must be "linear" or "log"')
  if (!['line', 'bars'].includes(cfg.mark)) errs.push('mark must be "line" or "bars"')
  if (!Array.isArray(cfg.series) || !cfg.series.length || cfg.series.length > 7) errs.push('need 1–7 series')
  cfg.series = (cfg.series || []).map((s: any, i: number) => {
    try {
      return { label: String(s.label || `#${i + 1}`), note: s.note ? String(s.note) : '', color: /^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : PD_COLORS[i % PD_COLORS.length], f: DSL.compile(s.expr, [...names, 'x']) }
    } catch (e: any) { errs.push(`series[${i}].expr: ${e.message}`); return null }
  })
  const xr = spec.xRange
  if (!Array.isArray(xr) || xr.length !== 2) errs.push('xRange must be [from, to]')
  else cfg.x = xr.map((v, i) => {
    if (typeof v === 'number' && isFinite(v)) return () => v
    try { return DSL.compile(String(v), names) } catch (e: any) { errs.push(`xRange[${i}]: ${e.message}`); return null }
  })
  cfg.cursor = spec.cursor == null ? names[0] : spec.cursor
  if (!names.includes(cfg.cursor)) errs.push(`cursor "${cfg.cursor}" is not a param name`)
  if (spec.yMax != null && !(typeof spec.yMax === 'number' && spec.yMax > 0)) errs.push('yMax must be a positive number')
  cfg.yMax = spec.yMax
  if (spec.explain != null) {
    if (!Array.isArray(spec.explain)) errs.push('explain must be an array')
    else spec.explain.forEach((x: any, i: number) => {
      if (!x || typeof x.text !== 'string') errs.push(`explain[${i}].text required`)
      else {
        if (x.param != null && !names.includes(x.param)) errs.push(`explain[${i}].param unknown`)
        if (x.value != null && typeof x.value !== 'number') errs.push(`explain[${i}].value must be a number`)
        if (x.range != null && !(Array.isArray(x.range) && x.range.length === 2)) errs.push(`explain[${i}].range must be [a,b]`)
        if (x.ts != null && !(typeof x.ts === 'number' && x.ts >= 0)) errs.push(`explain[${i}].ts must be seconds`)
      }
    })
  }
  V.ts(spec.source_timestamps, 'source_timestamps', errs)
  if (spec.supplementary != null && typeof spec.supplementary !== 'boolean') errs.push('supplementary must be boolean')
  if (!spec.supplementary && !(Array.isArray(spec.source_timestamps) && spec.source_timestamps.length)) errs.push('non-supplementary demos must cite source_timestamps')
  if (!errs.length) {
    // smoke-test: evaluate every series at the default params across the x range
    const env: Env = Object.fromEntries(spec.params.map((p: any) => [p.name, p.default]))
    const a = cfg.x[0](env), b = cfg.x[1](env)
    if (!(isFinite(a) && isFinite(b) && a < b)) errs.push('xRange must evaluate to finite from < to')
    else cfg.series.forEach((s: any, i: number) => { env.x = (a + b) / 2; if (Number.isNaN(s.f(env))) errs.push(`series[${i}] evaluates to NaN`) })
  }
  return { errs, cfg }
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const fmtNum = (v: number) => {
  if (!isFinite(v)) return v > 0 ? '∞' : '—'
  const a = Math.abs(v)
  if (a >= 1e7) { const k = Math.floor(Math.log10(a)); return `${(v / 10 ** k).toFixed(1)}×10${String(k).replace(/\d/g, (d) => SUP[+d])}` }
  if (a >= 100 || Number.isInteger(v)) return Math.round(v).toLocaleString('en-US')
  return v.toFixed(a >= 10 ? 1 : 2)
}
const fmtTick = (v: number) => v >= 1e9 ? v / 1e9 + 'B' : v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(+v.toFixed(6))
function niceStep(span: number, count: number) {
  const raw = span / count, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  return (m >= 5 ? 10 : m >= 2 ? 5 : m >= 1 ? 2 : 1) * p
}
let pdUid = 0
const SVG_NS = 'http://www.w3.org/2000/svg'

registerModule({
  type: 'param_demo', title: '调参演示', label: '调参演示', icon: 'chart',
  appliesTo: ['formula', 'example', 'compare', 'process'],
  schema: (spec) => compileParamDemo(spec).errs,
  render(root, spec: any, ctx) {
    const { cfg } = compileParamDemo(spec)
    const uid = 'pd' + (++pdUid)
    const VW = 680, VH = 250, M = { l: 62, r: 20, t: 26, b: 42 }, PW = VW - M.l - M.r, PH = VH - M.t - M.b
    const target: Env = Object.fromEntries(spec.params.map((p: any) => [p.name, p.default])), shown: Env = { ...target }
    const hidden = new Set<number>()
    const cp = spec.params.find((p: any) => p.name === cfg.cursor)
    root.innerHTML = `<div class="pd">
      <div class="pd-tags"><span class="tag ghost">${esc(cfg.kind)}</span>${spec.grounding ? `<span class="tag">${esc(({ note: '笔记整理', derived: '公式推算', illustrative: '示意材料', supplementary: '补充内容', video: '视频内容' } as Record<string,string>)[spec.grounding] || '来源未标注')}</span>` : spec.supplementary ? '<span class="tag supp">补充例子（视频未讲）</span>' : '<span class="tag">视频原意</span>'}</div>
      <div class="params"></div>
      ${cfg.bits ? '<div class="pd-bits" aria-hidden="true"></div>' : ''}
      <div class="pd-legend"></div>
      <svg class="pd-chart" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${esc(spec.title)}">
        <defs>
          <clipPath id="${uid}c"><rect x="${M.l}" y="${M.t - 2}" width="${PW + 2}" height="${PH + 2}"/></clipPath>
          <linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd48a"/><stop offset="1" stop-color="#ff9a3c" stop-opacity=".55"/></linearGradient>
          <filter id="${uid}g" filterUnits="userSpaceOnUse" x="0" y="0" width="${VW}" height="${VH}"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g class="pd-grid"></g><g class="pd-xax"></g>
        <rect class="pd-hit" x="${M.l}" y="${M.t}" width="${PW}" height="${PH}"/>
        <g class="pd-plot" clip-path="url(#${uid}c)"></g>
        <g class="pd-marks"></g>
        <line class="pd-cursor" y1="${M.t}" y2="${M.t + PH}"/>
        <g class="pd-dots"></g>
        <g class="pd-ctag"><rect rx="6" height="20" y="${M.t - 20}"/><text y="${M.t - 6}"></text></g>
        <text class="pd-axl" x="${M.l + PW / 2}" y="${VH - 6}" text-anchor="middle">${esc(cfg.xLabel)}</text>
        <text class="pd-axl" transform="translate(14 ${M.t + PH / 2}) rotate(-90)" text-anchor="middle">${esc(cfg.yLabel)}</text>
      </svg>
      <div class="pd-explain"><span class="pd-ex-ic">i</span><span class="pd-ex-t"></span><span class="pd-ex-ts"></span></div>
    </div>`
    const $r = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T
    const svg = $r<SVGSVGElement>('.pd-chart'), gGrid = $r('.pd-grid'), gX = $r('.pd-xax'), gPlot = $r('.pd-plot'), gDots = $r('.pd-dots'), gMarks = $r('.pd-marks')
    const cur = $r('.pd-cursor'), ctag = $r('.pd-ctag'), legend = $r('.pd-legend')
    // ---- sliders
    const inputs: Record<string, { inp: HTMLInputElement; sync: () => void; p: any }> = {}
    spec.params.forEach((p: any) => {
      const row = el('label', 'param')
      row.innerHTML = `<span>${esc(p.label)}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${p.default}"><output></output>`
      const inp = row.querySelector('input')!, out = row.querySelector('output')!
      const sync = () => { out.textContent = fmtNum(+inp.value); inp.style.setProperty('--p', ((+inp.value - p.min) / (p.max - p.min) * 100) + '%') }
      inp.addEventListener('input', () => { target[p.name] = +inp.value; sync(); kick() }, { signal: ctx.signal })
      sync(); inputs[p.name] = { inp, sync, p }; $r('.params').appendChild(row)
    })
    const setParam = (name: string, v: number) => {
      const { inp, sync, p } = inputs[name]; const st = p.step || 1
      v = Math.min(p.max, Math.max(p.min, Math.round((v - p.min) / st) * st + p.min))
      inp.value = String(v); target[name] = v; sync(); kick()
    }
    // ---- legend (live readout); click toggles a series
    legend.innerHTML = cfg.series.map((s: any, i: number) => `<button class="pd-leg" data-i="${i}" style="--sc:${s.color}"><i></i><span class="nm">${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span><b class="vl"></b></button>`).join('')
    legend.querySelectorAll<HTMLElement>('.pd-leg').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i!
      if (hidden.has(i)) hidden.delete(i); else if (hidden.size < cfg.series.length - 1) hidden.add(i)
      b.classList.toggle('off', hidden.has(i)); kick(true)
    }, { signal: ctx.signal }))
    // ---- series elements
    const paths: SVGElement[] = cfg.series.map((s: any, i: number) => {
      const g = document.createElementNS(SVG_NS, cfg.mark === 'bars' ? 'g' : 'path')
      if (cfg.mark !== 'bars') { g.setAttribute('class', 'pd-line'); g.setAttribute('pathLength', '1'); g.style.stroke = s.color; g.style.animationDelay = (i * 90) + 'ms'; g.setAttribute('filter', `url(#${uid}g)`) }
      gPlot.appendChild(g); return g
    })
    const dots: SVGElement[] = cfg.series.map((s: any) => {
      const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('r', '4.5'); c.setAttribute('class', 'pd-dot'); c.style.fill = s.color; gDots.appendChild(c); return c
    })
    // ---- scrub on chart
    let dragging = false
    const scrub = (e: PointerEvent) => { const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * VW; setParam(cfg.cursor, X.inv(vx)) }
    svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); scrub(e) }, { signal: ctx.signal })
    svg.addEventListener('pointermove', (e) => { if (dragging) scrub(e) }, { signal: ctx.signal })
    svg.addEventListener('pointerup', () => { dragging = false }, { signal: ctx.signal })
    // ---- scales
    const X = { a: 0, b: 1, map: (v: number) => M.l + (v - X.a) / (X.b - X.a) * PW, inv: (px: number) => X.a + (px - M.l) / PW * (X.b - X.a) }
    const Y = {
      lo: 0, hi: 1, log: cfg.yScale === 'log',
      map(v: number) {
        if (this.log) { const lv = Math.log10(Math.max(v, this.lo)); return M.t + PH - (lv - Math.log10(this.lo)) / (Math.log10(this.hi) - Math.log10(this.lo)) * PH }
        return M.t + PH - (v - this.lo) / (this.hi - this.lo) * PH
      },
    }
    let axisKey = ''
    function sample(s: any, env: Env) {
      const pts: [number, number][] = []
      if (cfg.discrete) { for (let x = Math.ceil(X.a - 1e-9); x <= X.b + 1e-9; x++) { env.x = x; pts.push([x, s.f(env)]) } }
      else { const N = 140; for (let k = 0; k <= N; k++) { const x = X.a + (X.b - X.a) * k / N; env.x = x; pts.push([x, s.f(env)]) } }
      return pts
    }
    function domains(env: Env) {
      X.a = cfg.x[0](env); X.b = cfg.x[1](env); if (!(X.b > X.a)) X.b = X.a + 1
      let mx = -Infinity, mn = Infinity
      cfg.series.forEach((s: any, i: number) => {
        if (hidden.has(i)) return
        for (const [, v] of sample(s, { ...env })) if (isFinite(v)) { if (Y.log && v <= 0) continue; mx = Math.max(mx, v); mn = Math.min(mn, v) }
      })
      if (!isFinite(mx)) { mx = 1; mn = 0 }
      if (cfg.yMax) mx = Math.min(mx, cfg.yMax)
      if (Y.log) { Y.lo = 10 ** Math.floor(Math.log10(Math.max(mn, 1e-9))); Y.hi = 10 ** Math.ceil(Math.log10(Math.max(mx, Y.lo * 10))); if (Y.hi / Y.lo < 10) Y.hi = Y.lo * 10 }
      else { const st = niceStep(Math.max(mx - Math.min(0, mn), 1e-9), 5); Y.lo = Math.min(0, Math.floor(mn / st) * st); Y.hi = Math.ceil(mx * 1.04 / st) * st || 1 }
    }
    function axes() {
      const key = [X.a, X.b, Y.lo, Y.hi].map((v) => +v.toPrecision(4)).join('|'); if (key === axisKey) return; axisKey = key
      const yt: number[] = []
      if (Y.log) { const a = Math.log10(Y.lo), b = Math.log10(Y.hi), stepD = Math.max(1, Math.ceil((b - a) / 6)); for (let d = a; d <= b + 1e-9; d += stepD) yt.push(10 ** d) }
      else { const st = niceStep(Y.hi - Y.lo, 5); for (let v = Y.lo; v <= Y.hi + st * 1e-6; v += st) yt.push(+v.toPrecision(10)) }
      gGrid.innerHTML = yt.map((v) => { const y = Y.map(v).toFixed(1); return `<line x1="${M.l}" x2="${M.l + PW}" y1="${y}" y2="${y}"/><text x="${M.l - 8}" y="${+y + 4}" text-anchor="end">${fmtTick(v)}</text>` }).join('')
      const st = Math.max(cfg.discrete ? 1 : 0, niceStep(X.b - X.a, 7)), xt: number[] = []
      for (let v = Math.ceil(X.a / st) * st; v <= X.b + 1e-9; v += st) xt.push(+v.toPrecision(10))
      gX.innerHTML = `<line class="ax" x1="${M.l}" x2="${M.l + PW}" y1="${M.t + PH}" y2="${M.t + PH}"/><line class="ax" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + PH}"/>` +
        xt.map((v) => `<line class="tk" x1="${X.map(v)}" x2="${X.map(v)}" y1="${M.t + PH}" y2="${M.t + PH + 5}"/><text x="${X.map(v)}" y="${M.t + PH + 18}" text-anchor="middle">${fmtTick(v)}</text>`).join('')
      // notable values from `explain` → clickable diamonds on the x axis
      const notable = (spec.explain || []).filter((e: any) => typeof e.value === 'number' && (e.param || cfg.cursor) === cfg.cursor && e.value >= X.a && e.value <= X.b)
      gMarks.innerHTML = notable.map((e: any) => `<g class="pd-mark" data-v="${e.value}" transform="translate(${X.map(e.value)} ${M.t + PH})"><rect x="-5" y="-5" width="10" height="10" transform="rotate(45)"/></g>`).join('')
      gMarks.querySelectorAll<SVGGElement>('.pd-mark').forEach((m) => m.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); setParam(cfg.cursor, +m.dataset.v!) }, { signal: ctx.signal }))
    }
    function draw() {
      const env = { ...shown }
      const readouts: Record<string, string | number | boolean> = { cursor: cfg.cursor }
      domains(env); axes()
      const cx = shown[cfg.cursor], cxp = X.map(Math.min(X.b, Math.max(X.a, cx)))
      cfg.series.forEach((s: any, i: number) => {
        const off = hidden.has(i), pts = sample(s, { ...env })
        if (cfg.mark === 'bars') {
          const n = pts.length, bw = Math.max(3, PW / Math.max(n, 1) * .62)
          paths[i].innerHTML = pts.map(([x, v]) => {
            if (!isFinite(v)) return ''
            const y = Math.max(M.t - 4, Y.map(v)), on = x <= target[cfg.cursor] + 1e-9
            return `<rect class="pd-bar${on ? ' on' : ''}" x="${(X.map(x) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, M.t + PH - y).toFixed(1)}" rx="3"${on ? ` style="fill:url(#${uid}b)"` : ''}/>`
          }).join('')
          paths[i].style.opacity = off ? '0' : '1'
        } else {
          let d = '', pen = false
          for (const [x, v] of pts) {
            if (!isFinite(v)) { pen = false; continue }
            const px = X.map(x), py = Math.max(-2000, Math.min(4000, Y.map(v)))
            d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1); pen = true
          }
          paths[i].setAttribute('d', d || 'M0 0'); paths[i].style.opacity = off ? '.06' : '1'
        }
        env.x = cx
        const v = s.f({ ...env, x: cx })
        readouts[`series_${i}_label`] = s.label
        readouts[`series_${i}_visible`] = !off
        readouts[`series_${i}_value`] = Number.isFinite(v) ? v : '当前输入下无有限值'
        const dy = Y.map(v), vis = !off && isFinite(v) && dy >= M.t - 1
        dots[i].setAttribute('cx', cxp.toFixed(1)); dots[i].setAttribute('cy', (vis ? dy : M.t).toFixed(1)); dots[i].style.opacity = vis ? '1' : '0'
        const vl = legend.querySelector(`.pd-leg[data-i="${i}"] .vl`)
        if (vl) vl.textContent = fmtNum(cfg.discrete || cp.step >= 1 ? Math.round(v * 1000) / 1000 : v)
      })
      cur.setAttribute('x1', String(cxp)); cur.setAttribute('x2', String(cxp))
      const label = `${cfg.cursor} = ${fmtNum(Math.round(cx * 100) / 100)}`, tw = 14 + label.length * 7.2
      const tx = Math.min(M.l + PW - tw / 2, Math.max(M.l + tw / 2, cxp))
      ctag.querySelector('rect')!.setAttribute('x', String(tx - tw / 2)); ctag.querySelector('rect')!.setAttribute('width', String(tw))
      const t = ctag.querySelector('text')!; t.setAttribute('x', String(tx)); t.textContent = label
      if (cfg.bits) bitsRow(Math.round(cx))
      if (cfg.bits) readouts.bit_pattern = pattern
      // Report displayed values, not slider targets while the chart is easing.
      ctx.reportInteraction({ parameters: { ...shown }, readouts })
    }
    // ---- binary extra: a row of n switches (click to toggle)
    let pattern = 0b10110010
    function bitsRow(n: number) {
      const host = $r('.pd-bits'); if (!host || host.dataset.n == n + '|' + pattern) return; host.dataset.n = n + '|' + pattern
      pattern &= (2 ** n - 1)
      host.innerHTML = `<div class="cells">${Array.from({ length: n }, (_, k) => { const i = n - 1 - k, b = (pattern >>> i) & 1; return `<button class="cell click${b ? ' on' : ''}" data-i="${i}">${b}</button>` }).join('')}</div>
        <div class="pd-bits-r">这 ${n} 个开关当前的组合 = <b>${pattern.toLocaleString('en-US')}</b>，只是 <b>${(2 ** n).toLocaleString('en-US')}</b> 种可能之一</div>`
      host.querySelectorAll<HTMLElement>('.cell').forEach((c) => c.addEventListener('click', () => { pattern ^= 1 << +c.dataset.i!; draw() }, { signal: ctx.signal }))
    }
    // ---- explain line
    let exKey: number | null = null
    function explain() {
      const list = spec.explain || []
      const val = (name: string) => target[name]
      const hit = list.find((e: any) => typeof e.value === 'number' && Math.abs(val(e.param || cfg.cursor) - e.value) < ((inputs[e.param || cfg.cursor].p.step || 1) / 2))
        || list.find((e: any) => Array.isArray(e.range) && val(e.param || cfg.cursor) >= e.range[0] && val(e.param || cfg.cursor) <= e.range[1])
        || list.find((e: any) => e.value == null && e.range == null)
      const key = hit ? list.indexOf(hit) : -1; if (key === exKey) return; exKey = key
      const box = $r('.pd-explain')
      box.classList.toggle('hit', !!(hit && hit.value != null))
      box.classList.remove('anim'); void box.offsetWidth; box.classList.add('anim')
      box.querySelector('.pd-ex-t')!.textContent = hit ? hit.text : (spec.caption || '')
      box.querySelector('.pd-ex-ts')!.innerHTML = hit && hit.ts != null ? `<a class="chip ts" href="${esc(ctx.ytUrl(hit.ts))}" target="_blank" rel="noopener">${fmt(hit.ts)}</a>` : ''
      box.style.display = box.querySelector('.pd-ex-t')!.textContent ? '' : 'none'
    }
    // ---- animation loop (eases displayed params toward targets)
    let raf = 0
    function frame() {
      let moving = false
      for (const k in target) {
        const d = target[k] - shown[k]
        if (Math.abs(d) > 1e-4 * (Math.abs(target[k]) + 1)) { shown[k] += d * .2; moving = true } else shown[k] = target[k]
      }
      draw(); raf = moving ? requestAnimationFrame(frame) : 0
    }
    function kick(force?: boolean) { explain(); if (force) axisKey = ''; if (!raf) raf = requestAnimationFrame(frame) }
    ctx.onCleanup(() => cancelAnimationFrame(raf))
    draw(); explain()
  },
})
