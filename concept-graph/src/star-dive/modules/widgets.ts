/* ================= built-in widgets for the `interactive` module ================= */
import type { ModuleContext } from '../types'
import { el } from '../util'

export interface Widget { update(name?: string): void }
type WidgetFactory = (root: HTMLElement, P: Record<string, number>, ctx: ModuleContext) => Widget

const bin = (v: number, w: number) => (v >>> 0).toString(2).padStart(w, '0').slice(-w)

export const WIDGETS: Record<string, WidgetFactory> = {
  radix(root, P) {
    root.innerHTML = `<div class="readout" style="margin:0 0 14px">十进制<span class="k" id="dec"></span></div>
      <div class="nib"><div class="grp"><div class="cells" id="hi"></div><div class="place">${[128, 64, 32, 16].map((x) => `<span>${x}</span>`).join('')}</div><div class="hx" style="color:var(--amber)" id="hh"></div><div class="sect" style="margin:2px 0 0">高 nibble</div></div>
      <div class="grp"><div class="cells" id="lo"></div><div class="place">${[8, 4, 2, 1].map((x) => `<span>${x}</span>`).join('')}</div><div class="hx" style="color:var(--cyan)" id="lh"></div><div class="sect" style="margin:2px 0 0">低 nibble</div></div></div>
      <div class="readout" id="sum"></div>`
    const q = (s: string) => root.querySelector(s)!
    return {
      update() {
        const v = P.v, b = bin(v, 8), hx = v.toString(16).toUpperCase().padStart(2, '0')
        q('#dec').textContent = String(v)
        q('#hi').innerHTML = [...b.slice(0, 4)].map((x) => `<div class="cell ${x === '1' ? 'on' : ''}">${x}</div>`).join('')
        q('#lo').innerHTML = [...b.slice(4)].map((x) => `<div class="cell cy ${x === '1' ? 'on' : ''}">${x}</div>`).join('')
        q('#hh').textContent = hx[0]; q('#lh').textContent = hx[1]
        q('#sum').innerHTML = `<span style="font-family:var(--mono)">${b.slice(0, 4)} ${b.slice(4)}<sub>2</sub> = 0x${hx}<sub>16</sub> = ${v}<sub>10</sub></span>`
      },
    }
  },
  endian(root, P) {
    const cols = ['#ffb547', '#ffd48a', '#bfe6ff', '#86dcff']
    root.innerHTML = `<div class="readout" style="margin:0 0 12px">十六进制<span class="k" id="hx"></span></div>
      <div class="mem"><div></div>${[0, 1, 2, 3].map((a) => `<div class="addr">地址 0x0${a}</div>`).join('')}
      <div class="rowlbl">大端 Big-endian</div><div class="byte"></div><div class="byte"></div><div class="byte"></div><div class="byte"></div>
      <div class="rowlbl">小端 Little-endian</div><div class="byte"></div><div class="byte"></div><div class="byte"></div><div class="byte"></div></div>
      <div class="readout" style="font-size:12.5px;color:var(--ink3)"><span style="color:${cols[0]}">■</span> 最高有效字节 MSB &nbsp; → &nbsp; <span style="color:${cols[3]}">■</span> 最低有效字节 LSB</div>`
    const bytes = root.querySelectorAll<HTMLElement>('.byte')
    return {
      update() {
        const v = P.v >>> 0, B = [24, 16, 8, 0].map((s) => (v >>> s) & 255)
        root.querySelector('#hx')!.textContent = '0x' + B.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        const order = [0, 1, 2, 3, 3, 2, 1, 0]
        bytes.forEach((e, i) => {
          const bi = order[i], txt = B[bi].toString(16).toUpperCase().padStart(2, '0')
          if (e.textContent !== txt) { e.classList.remove('flip'); void e.offsetWidth; e.classList.add('flip') }
          e.textContent = txt; e.style.background = cols[bi]
        })
      },
    }
  },
  stack_queue(root, P) {
    let stack: string[] = [], queue: string[] = [], next = 0
    const lab = (i: number) => String.fromCharCode(65 + (i % 26))
    root.innerHTML = `<div class="split"><div class="subviz"><h5>栈 STACK · 后进先出 LIFO</h5><div class="sq col" id="st"></div><div class="sq-note">像一摞盘子：从顶部 pop</div></div>
      <div class="subviz"><h5>队列 QUEUE · 先进先出 FIFO</h5><div class="sq row" id="qu" style="align-items:center"></div><div class="sq-note">像排队：先来的先出</div></div></div>
      <div class="controls"><button class="btn" data-a="push">＋ push 新元素</button><button class="btn pri" data-a="pop">pop / dequeue</button></div>
      <div class="status" id="msg">同样的元素序列，两种结构取出的却不一样。</div>`
    const st = root.querySelector('#st')!, qu = root.querySelector('#qu')!, msg = root.querySelector('#msg')!
    const popBtn = root.querySelector<HTMLButtonElement>('[data-a=pop]')!, pushBtn = root.querySelector<HTMLButtonElement>('[data-a=push]')!
    function draw() {
      st.innerHTML = stack.map((x, i) => `<div class="item ${i === stack.length - 1 ? 'next' : ''}">${x}</div>`).join('')
      qu.innerHTML = queue.map((x, i) => `<div class="item ${i === 0 ? 'next' : ''}">${x}</div>`).join('')
      popBtn.disabled = !stack.length
      pushBtn.disabled = stack.length >= 9
    }
    function reset() { stack = []; queue = []; for (next = 0; next < P.n; next++) { stack.push(lab(next)); queue.push(lab(next)) } draw() }
    pushBtn.addEventListener('click', () => { const x = lab(next++); stack.push(x); queue.push(x); draw(); msg.className = 'status'; msg.textContent = `push ${x}：栈放在顶部，队列排在末尾。` })
    popBtn.addEventListener('click', () => {
      if (!stack.length) return
      const so = st.lastElementChild!, qo = qu.firstElementChild!; so.classList.add('out'); qo.classList.add('out')
      const a = stack[stack.length - 1], b = queue[0]
      setTimeout(() => { stack.pop(); queue.shift(); draw() }, 330)
      msg.className = 'status good'; msg.innerHTML = `栈取出 <b>${a}</b>（最后放入的） · 队列取出 <b>${b}</b>（最先进入的）`
    })
    return { update() { reset() } }
  },
  recursion(root, P, ctx) {
    const CAP = 12
    let base = true, timer: ReturnType<typeof setTimeout> | undefined
    root.innerHTML = `<div class="split"><div><div class="code" id="code"></div>
      <div class="controls" style="justify-content:flex-start"><button class="btn on" data-a="base">基准条件：开</button><button class="btn pri" data-a="run">▶ 运行 f(n)</button></div>
      <div class="status" id="msg"></div></div>
      <div class="subviz"><h5>调用栈 CALL STACK</h5><div class="frames" id="fr"><div class="cap-line">容量上限 ${CAP}</div></div></div></div>`
    const fr = root.querySelector('#fr')!, msg = root.querySelector('#msg')!, bb = root.querySelector('[data-a=base]')!
    function code() {
      root.querySelector('#code')!.innerHTML = `<span class="kw">function</span> f(n) {\n  <span class="${base ? '' : 'off'}"><span class="kw">if</span> (n === 0) <span class="kw">return</span></span>  <span class="cm">// 基准条件</span>\n  f(n - 1)            <span class="cm">// 调用自己</span>\n}\nf(${P.n})`
    }
    function stop() { clearTimeout(timer) }
    function run() {
      stop(); code()
      fr.querySelectorAll('.frame').forEach((e) => e.remove())
      msg.className = 'status'; msg.textContent = '压栈中…'
      let d = 0
      const frames: HTMLElement[] = []
      const push = () => {
        const k = P.n - d
        if (base && k < 0) return unwind()
        if (frames.length >= CAP) {
          frames.forEach((f) => f.classList.add('err'))
          msg.className = 'status bad'; msg.innerHTML = '<b>Stack Overflow!</b> 没有基准条件，帧被不断压入直到栈满。'
          return
        }
        const f = el('div', 'frame' + (base && k === 0 ? ' base' : ''), `f(${k})${base && k === 0 ? ' → 命中基准条件，return' : ''}`)
        fr.appendChild(f); frames.push(f); d++
        timer = setTimeout(push, 230)
      }
      const unwind = () => {
        msg.className = 'status good'; msg.textContent = `命中基准条件：${frames.length} 个帧依次弹出，递归安全结束。`
        const pop = () => {
          const f = frames.pop(); if (!f) return
          f.style.transition = 'opacity .2s'; f.style.opacity = '0'
          setTimeout(() => f.remove(), 200); timer = setTimeout(pop, 170)
        }
        timer = setTimeout(pop, 500)
      }
      push()
    }
    bb.addEventListener('click', () => { base = !base; bb.textContent = '基准条件：' + (base ? '开' : '关'); bb.classList.toggle('on', base); run() })
    root.querySelector('[data-a=run]')!.addEventListener('click', run)
    ctx.onCleanup(stop)
    return { update() { run() } }
  },
}
