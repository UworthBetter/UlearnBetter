import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SafeMarkdown } from '../../assistant/ui/safe-markdown'
import { mountModule, registerModule } from './registry'
import type { ModuleContext } from '../types'

const list = (v: any): any[] => Array.isArray(v) ? v : []
const text = (v: any): string => typeof v === 'string' || typeof v === 'number' ? String(v) : ''

function FunctionDemo({ block: b, ctx }: { block: any; ctx: ModuleContext }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    let cursor = '_cursor'
    while (list(b.inputs).some((p) => p.name === cursor)) cursor += '_'
    const [min, max] = b.x.range
    const module = mountModule(ref.current, ctx.concept, {
      type: 'param_demo', title: b.title, kind: 'series', supplementary: true, grounding: b.grounding,
      params: [...b.inputs, { name: cursor, label: b.x.label || '输入 x', min, max, default: b.x.cursor ?? min, step: (max - min) / 100 }],
      cursor, xRange: [min, max], series: b.series, xLabel: b.x.label || 'x',
    }, { meta: ctx.meta, ytUrl: ctx.ytUrl, onInteractionChange: (state) => { if (state) ctx.reportInteraction({ ...state, parameters: { ...state.parameters, block_id: text(b.id) } }) } })
    return () => module.destroy()
  }, [b, ctx])
  return <div ref={ref} />
}

function LearningBlock({ block: b, ctx }: { block: any; ctx: ModuleContext }) {
  const [step, setStep] = useState(0)
  const [checked, setChecked] = useState<Record<string, boolean>>(() => b.recordChecked || {})
  const [selected, setSelected] = useState<string | null>(null)
  const md = (s: any) => <SafeMarkdown text={text(s)} />
  const steps = list(b.steps)
  const tasks = list(b.groups).flatMap((g) => list(g.items))
  useEffect(() => {
    if (b.shape !== 'collection' && b.shape !== 'variation') ctx.reportInteraction({
      parameters: { block_id: text(b.id), shape: text(b.shape) }, readouts: {},
    })
  }, [b, ctx])
  if (b.shape === 'collection') return <div>
    <label>选择内容 <select value={step} onChange={(e) => { const next = Number(e.target.value); ctx.reportInteraction({ parameters: { block_id: text(b.children[next]?.id) }, readouts: {} }); setStep(next) }}>{list(b.children).map((c, i) => <option value={i} key={i}>{text(c.title) || '补充笔记'}</option>)}</select></label>
    <LearningBlock key={step} block={b.children[step]} ctx={ctx} />
  </div>
  function changeStep(next: number) {
    setStep(next)
    ctx.reportInteraction({ parameters: { step: next + 1 }, readouts: { label: text(steps[next]?.label), total_steps: steps.length } })
  }
  return <div className="learning-block">
    <p className="tag">{({ video: '视频内容', note: '笔记整理', derived: '公式推算', illustrative: '示意材料', supplementary: '补充内容' } as Record<string,string>)[b.grounding] || '来源未标注'}</p>
    {list(b.points).map((p, i) => <div key={i}>{md(p.text)}</div>)}
    {list(b.terms).map((t, i) => <details key={i}><summary>{text(t.term)}</summary>{md(t.gloss)}</details>)}
    {b.math && md(`$$\n${text(b.math)}\n$$`)}
    {b.artifact && <pre style={{ whiteSpace: 'pre-wrap' }}><code>{text(b.artifact.code)}</code></pre>}
    {b.shape === 'process' && steps.length > 0 && <>
      <p>{step + 1} / {steps.length}</p><h4>{text(steps[step]?.label)}</h4>{md(steps[step]?.detail)}
      <div className="controls"><button className="btn" disabled={step === 0} onClick={() => changeStep(step - 1)}>上一步</button><button className="btn" disabled={step >= steps.length - 1} onClick={() => changeStep(step + 1)}>下一步</button></div>
    </>}
    {b.shape === 'comparison' && <div style={{ overflowX: 'auto' }}><table className="cmp"><thead><tr><th>比较维度</th>{list(b.items).map((it, i) => <th key={i}>{text(it.label)}</th>)}</tr></thead><tbody>{list(b.dims).map((dim, i) => <tr key={i}><th>{text(dim)}</th>{list(b.cells?.[i]).map((cell, j) => <td key={j}>{md(cell.text)}</td>)}</tr>)}</tbody></table></div>}
    {b.shape === 'structure' && <>
      <div className="controls">{list(b.nodes).map((n, i) => <button className="btn" key={i} aria-pressed={selected === n.id} onClick={() => { setSelected(n.id); ctx.reportInteraction({ parameters: { node: text(n.id) }, readouts: { label: text(n.label) } }) }}>{text(n.label)}</button>)}</div>
      {list(b.edges).map((edge, i) => <p key={i}>{text(list(b.nodes).find((n) => n.id === edge.from)?.label || edge.from)} → {text(list(b.nodes).find((n) => n.id === edge.to)?.label || edge.to)} {text(edge.label)}</p>)}
    </>}
    {b.shape === 'procedure' && list(b.groups).map((g, gi) => <section key={gi}><h4>{text(g.title)}</h4>{list(g.items).map((item, i) => {
      const id = typeof item.id === 'string' ? item.id : `${gi}:${i}`
      return <div key={id}><label><input type="checkbox" checked={!!checked[id]} onChange={(e) => { const next = { ...checked, [id]: e.target.checked }; setChecked(next); if (b.recordTopicId && item.id) window.dispatchEvent(new CustomEvent('learning-checklist', {detail:{topicId:b.recordTopicId,procedureId:b.id,itemId:String(item.id),checked:e.target.checked}})); ctx.reportInteraction({ parameters: { ...next }, readouts: { completed: Object.values(next).filter(Boolean).length, total: tasks.length } }) }} /> {text(item.text)}</label>{item.cmd && <pre style={{ whiteSpace: 'pre-wrap' }}>{text(item.cmd)}</pre>}{item.verify && <p>检查：{text(item.verify)}</p>}{item.warn && <p>注意：{text(item.warn)}</p>}{list(item.branch).map((r, j) => <p key={j}>{text(r.if)} → {text(r.then)}</p>)}</div>
    })}</section>)}
    {list(b.warnings).map((w, i) => <p key={i}>注意：{text(w)}</p>)}
    {b.shape === 'variation' && <>
      {b.domain === 'function' && Array.isArray(b.x?.range) && b.x.range.length === 2 && b.x.range.every(Number.isFinite) && b.x.range[0] < b.x.range[1]
        ? <FunctionDemo block={b} ctx={ctx} /> : <p>此实验尚未接入计算演示，以下保留公式与参数说明。</p>}
      {list(b.series).map((s, i) => <p key={i}>{text(s.label)}：<code>{text(s.expr)}</code></p>)}{list(b.inputs).map((p, i) => <p key={i}>{text(p.label)}：{text(p.min)}–{text(p.max)}，默认 {text(p.default)}</p>)}
    </>}
    {list(b.preserved).map((p, i) => <details key={i}><summary>{text(p.heading) || '补充原文'}</summary>{md(p.text)}</details>)}
  </div>
}

registerModule({
  type: 'learning_block', title: '学习笔记', icon: 'book', label: (card) => ({ definition:'读定义',process:'逐步理解',comparison:'看对比',structure:'看结构',procedure:'动手实践',variation:'公式与参数' } as Record<string,string>)[card.block?.shape] || '读笔记',
  schema: (card) => card.block && typeof card.block.shape === 'string' ? [] : ['缺少内容块'],
  render(root, card, ctx) {
    const reactRoot = createRoot(root)
    reactRoot.render(<LearningBlock block={card.block} ctx={ctx} />)
    ctx.onCleanup(() => queueMicrotask(() => reactRoot.unmount()))
  },
})
