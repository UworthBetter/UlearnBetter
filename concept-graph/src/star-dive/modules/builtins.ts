/* =====================================================================
   other first-party modules: definition, steps, compare_table, video_clip, interactive
   ===================================================================== */
import { el, esc, fmt, ICONS } from '../util'
import { ALL_SHAPES, registerModule, V, validateParams } from './registry'
import { WIDGETS } from './widgets'

registerModule({
  type: 'definition', title: '定义', label: '读定义', icon: 'book', appliesTo: ALL_SHAPES,
  schema(spec) {
    const e: string[] = []; V.str(spec.title, 'title', e)
    if (typeof spec.body !== 'string' && !Array.isArray(spec.terms)) e.push('body or terms required')
    if (spec.terms != null && (!Array.isArray(spec.terms) || spec.terms.some((t: any) => !t || typeof t.term !== 'string'))) e.push('terms[] must be {term,note}')
    V.ts(spec.timestamps, 'timestamps', e); return e
  },
  render(root, card) {
    root.innerHTML = `${card.body ? `<blockquote class="def-quote">${esc(card.body)}</blockquote>` : ''}
      <div class="terms">${(card.terms || []).map((t: any, i: number) => `<div class="term" style="animation-delay:${i * 70}ms"><b>${esc(t.term)}</b><span>${esc(t.note || '')}</span></div>`).join('')}</div>`
  },
})

registerModule({
  type: 'steps', title: '步骤动画', label: '看动画', icon: 'play', appliesTo: ['process', 'timeline', 'example'],
  schema(spec) {
    const e: string[] = []; V.str(spec.title, 'title', e)
    if (V.arr(spec.steps, 'steps', e, 2)) spec.steps.forEach((s: any, i: number) => { if (!s || typeof s.label !== 'string') e.push(`steps[${i}].label required`) })
    V.ts(spec.timestamps, 'timestamps', e); return e
  },
  render(root, card, ctx) {
    const S = card.steps, n = S.length
    root.innerHTML = `<div class="steps"><div class="track"><div class="rail"><div class="fill"></div></div><div class="packet"></div>
      ${S.map((s: any, i: number) => `<button class="node" data-i="${i}" style="left:${i / (n - 1) * 100}%" aria-label="${esc(s.label)}"></button><div class="nlabel" data-i="${i}" style="left:${i / (n - 1) * 100}%">${esc(s.label)}</div>`).join('')}
      </div><div class="step-view"></div>
      <div class="controls"><button class="btn" data-a="prev">◀ 上一步</button><button class="btn pri" data-a="play">❚❚ 暂停</button><button class="btn" data-a="next">下一步 ▶</button></div></div>`
    let cur = 0, playing = true, timer: ReturnType<typeof setInterval> | undefined
    const view = root.querySelector<HTMLElement>('.step-view')!, playBtn = root.querySelector<HTMLButtonElement>('[data-a=play]')!
    const prevBtn = root.querySelector<HTMLButtonElement>('[data-a=prev]')!, nextBtn = root.querySelector<HTMLButtonElement>('[data-a=next]')!
    function show(i: number) {
      cur = Math.max(0, Math.min(n - 1, i))
      const pct = cur / (n - 1) * 100
      root.querySelector<HTMLElement>('.fill')!.style.width = pct + '%'
      root.querySelector<HTMLElement>('.packet')!.style.left = pct + '%'
      root.querySelectorAll('.node').forEach((b, j) => { b.classList.toggle('done', j < cur); b.classList.toggle('cur', j === cur) })
      root.querySelectorAll('.nlabel').forEach((b, j) => b.classList.toggle('cur', j === cur))
      const s = S[cur]
      view.classList.remove('anim'); void view.offsetWidth; view.classList.add('anim')
      view.innerHTML = `<div class="big">${String(cur + 1).padStart(2, '0')}</div><div><div class="sect" style="margin:0 0 4px">STEP ${cur + 1} / ${n}</div>
        <h4>${esc(s.label)}</h4><p>${esc(s.detail || '')}</p>${s.ts != null ? `<a class="chip ts" href="${esc(ctx.ytUrl(s.ts))}" target="_blank" rel="noopener">${fmt(s.ts)}</a>` : ''}</div>`
      prevBtn.disabled = cur === 0
      nextBtn.disabled = cur === n - 1
      if (cur === n - 1 && playing) setPlay(false, true)
    }
    function setPlay(on: boolean, ended?: boolean) {
      playing = on; clearInterval(timer)
      playBtn.textContent = on ? '❚❚ 暂停' : (ended || cur === n - 1 ? '↻ 重播' : '▶ 播放')
      if (on) timer = setInterval(() => show(cur + 1), 2400)
    }
    root.querySelectorAll<HTMLElement>('.node,.nlabel').forEach((b) => b.addEventListener('click', () => { setPlay(false); show(+b.dataset.i!) }))
    prevBtn.addEventListener('click', () => { setPlay(false); show(cur - 1) })
    nextBtn.addEventListener('click', () => { setPlay(false); show(cur + 1) })
    playBtn.addEventListener('click', () => { if (playing) setPlay(false); else { if (cur === n - 1) show(0); setPlay(true) } })
    show(0); setPlay(true)
    ctx.onCleanup(() => clearInterval(timer))
  },
})

registerModule({
  type: 'compare_table', title: '对比表', label: '看对比', icon: 'table', appliesTo: ['compare', 'definition', 'example'],
  schema(spec) {
    const e: string[] = []; V.str(spec.title, 'title', e)
    if (V.arr(spec.columns, 'columns', e, 2) && V.arr(spec.rows, 'rows', e)) spec.rows.forEach((r: any, i: number) => { if (!Array.isArray(r) || r.length !== spec.columns.length) e.push(`rows[${i}] must have ${spec.columns.length} cells`) })
    V.ts(spec.timestamps, 'timestamps', e); return e
  },
  render(root, card) {
    root.innerHTML = `<table class="cmp"><thead><tr>${card.columns.map((c: any) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${card.rows.map((r: any[], i: number) => {
      const rest = r.slice(1), same = rest.length > 1 && rest.every((x) => x === rest[0])
      return `<tr style="animation-delay:${i * 70}ms"><td>${esc(r[0])}</td>${same ? `<td class="merged" colspan="${rest.length}">${esc(rest[0])}</td>` : rest.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`
    }).join('')}</tbody></table>`
  },
})

registerModule({
  type: 'video_clip', title: '视频片段', label: (spec) => `视频 ${fmt(spec.start)}`, icon: 'video', appliesTo: ALL_SHAPES,
  schema(spec) {
    const e: string[] = []; V.num(spec.start, 'start', e)
    if (spec.start < 0) e.push('start must be ≥ 0')
    if (spec.end != null && !(spec.end > spec.start)) e.push('end must be > start')
    V.ts(spec.timestamps, 'timestamps', e); return e
  },
  render(root, card, ctx) {
    const s = Math.round(card.start)
    const e = Math.round(card.end > s ? Math.min(card.end, s + 60) : s + 30)
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ctx.meta.video_id)}?start=${s}&end=${e}&autoplay=1&rel=0&modestbranding=1`
    root.innerHTML = `${card.quote ? `<blockquote class="vq">“${esc(card.quote)}”</blockquote>` : ''}
      <div class="vframe"><div class="vph"><span class="pl">${ICONS.play}</span>正在载入片段…</div></div>
      <div class="vbar"><span class="vcap">片段<b>${fmt(s)} – ${fmt(e)}</b></span><span class="vdur">${e - s}s</span>
        <button class="btn pri" data-a="replay">↻ 重播</button>
        <a class="vlink" href="${esc(ctx.ytUrl(s))}" target="_blank" rel="noopener">在 YouTube 打开 ↗</a></div>`
    const frame = root.querySelector('.vframe')!
    const mount = () => {
      const old = frame.querySelector('iframe'); if (old) { old.src = 'about:blank'; old.remove() }
      const f = document.createElement('iframe')
      f.src = src; f.title = card.title || 'video clip'
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true
      f.referrerPolicy = 'strict-origin-when-cross-origin'
      frame.appendChild(f)
    }
    root.querySelector('[data-a=replay]')!.addEventListener('click', mount)
    mount()
    ctx.onCleanup(() => { const f = frame.querySelector('iframe'); if (f) { f.src = 'about:blank'; f.remove() } })
  },
})

/* ---------- interactive: bespoke first-party widgets (stack/queue, endian, …) ---------- */
registerModule({
  type: 'interactive', title: '交互小部件', label: '动手', icon: 'hand', appliesTo: ALL_SHAPES,
  schema(spec) {
    const e: string[] = []; V.str(spec.title, 'title', e)
    if (!Object.prototype.hasOwnProperty.call(WIDGETS, spec.widget)) e.push(`widget "${spec.widget}" is not a built-in widget`)
    validateParams(spec.params, e); V.ts(spec.timestamps, 'timestamps', e); return e
  },
  render(root, card, ctx) {
    const P: Record<string, number> = {}; card.params.forEach((p: any) => P[p.name] = p.default)
    root.innerHTML = `<div class="params"></div><div class="viz"></div><div class="caption">${esc(card.caption || '')}</div>`
    const widget = WIDGETS[card.widget](root.querySelector<HTMLElement>('.viz')!, P, ctx)
    const box = root.querySelector('.params')!
    card.params.forEach((p: any) => {
      const row = el('label', 'param')
      row.innerHTML = `<span>${esc(p.label)}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${p.default}"><output></output>`
      const inp = row.querySelector('input')!, out = row.querySelector('output')!
      const sync = () => { out.textContent = (+inp.value).toLocaleString('en-US'); inp.style.setProperty('--p', ((+inp.value - p.min) / (p.max - p.min) * 100) + '%') }
      inp.addEventListener('input', () => { P[p.name] = +inp.value; sync(); widget.update(p.name) })
      sync(); box.appendChild(row)
    })
    widget.update()
  },
})
