import { useEffect, useState } from 'react'
import type { AdjustLayerProps } from '../../record/view-props.ts'
import type { Assignment, Goal, Override, Panorama, Proposals, RelationCandidate, SubjectRef } from '../../record/types.ts'
import { goalSwatch, organizerPhrase } from '../format.ts'
import '../views.css'

interface SameName {
  id: string
  label: string
  a: SubjectRef
  b: SubjectRef
}

export default function AdjustLayer({ client, changeLogId, itemId, onClose, navigate }: AdjustLayerProps) {
  const [proposals, setProposals] = useState<Proposals | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [sameName, setSameName] = useState<SameName[]>([])
  const [source, setSource] = useState<'record' | 'mock' | null>(null)
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [focusItem, setFocusItem] = useState<string | null>(itemId ?? null)

  useEffect(() => {
    let live = true
    Promise.all([
      client.getProposals(),
      client.listGoals(),
      client.getPanorama().catch(() => null),
      changeLogId ? client.listChangeLog().catch(() => null) : Promise.resolve(null),
    ]).then(([proposalEnv, goalEnv, panoramaEnv, logs]) => {
      if (!live) return
      setProposals(proposalEnv.data)
      setGoals(goalEnv.data)
      setSource(proposalEnv.meta.source)
      setSameName(panoramaEnv ? sameNames(panoramaEnv.data) : [])
      const log = logs?.data.find((entry) => entry.id === changeLogId)
      const fromLog = log?.trigger.startsWith('item:') ? log.trigger.slice(5) : null
      setFocusItem(itemId ?? fromLog)
      const next: Record<string, string[]> = {}
      for (const row of proposalEnv.data.assignments) {
        next[row.id] = row.goalId ? [row.goalId] : []
      }
      setPicks(next)
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '调整层没有打开')
    })
    return () => { live = false }
  }, [changeLogId, client, itemId, tick])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function write(override: Override) {
    await client.addOverride(override)
    setTick((value) => value + 1)
  }

  const pending = (proposals?.assignments ?? []).filter((row) => row.state === 'proposed' && !row.autoAccepted)
  const accepted = [
    ...(proposals?.autoAccepted ?? []),
    ...(proposals?.assignments ?? []).filter((row) => row.autoAccepted && !proposals?.autoAccepted.some((item) => item.id === row.id)),
  ]
  const relations = (proposals?.relationCandidates ?? []).filter((row) => !row.confirmed)

  return (
    <>
      <div className="ub-scrim" onClick={onClose} />
      <section className="ub-sheet ub-glass ub-adjust" role="dialog" aria-label="调整归类">
        <div className="hx">
          <div>
            <p className="ub-eyebrow">调整归类 {source === 'mock' && <span className="ub-tag mock">示例数据</span>}</p>
            <h2>这次整理里，想听你的只有待确认</h2>
            <p className="ub-meta">只有你点按钮才会写入。模型不能替你确认。</p>
          </div>
          <button type="button" className="ub-x" aria-label="关闭调整归类" onClick={onClose}>×</button>
        </div>
        {error && <p role="alert">{error}</p>}
        <h3 className="ub-eyebrow">待确认</h3>
        {pending.length === 0 && <p className="ub-note">没有待确认的归属。</p>}
        {pending.map((row) => (
          <Card key={row.id} row={row} goals={goals} picked={picks[row.id] ?? []} hot
            onPick={(ids) => setPicks({ ...picks, [row.id]: ids })}
            onAccept={() => void write(override(row.subject, 'accept_assignment', { assignmentId: row.id }))}
            onReject={() => void write(override(row.subject, 'reject_assignment', { assignmentId: row.id }))}
            onReassign={() => void write(override(row.subject, 'reassign', { goalIds: picks[row.id] ?? [] }))}
          />
        ))}
        <h3 className="ub-eyebrow">合并 / 同名候选</h3>
        {relations.length === 0 && sameName.length === 0 && <p className="ub-note">没有同名或待确认的关联。</p>}
        {relations.map((row) => <RelationCard key={row.id} row={row} onAccept={() => void write(relationOverride(row, 'confirm_relation'))} onReject={() => void write(relationOverride(row, 'reject_relation'))} />)}
        {sameName.map((row) => (
          <article key={row.id} className="ub-chg hot">
            <h3>同名候选 · {row.label}</h3>
            <p className="ub-note">{row.a} ↔ {row.b}</p>
            <div className="ub-side">
              <button type="button" className="ub-btn sm pri" onClick={() => void write(override(row.a, 'confirm_relation', { a: row.a, b: row.b, kind: 'related' }))}>接受</button>
              <button type="button" className="ub-btn sm" onClick={() => void write(override(row.a, 'reject_relation', { a: row.a, b: row.b }))}>拒绝</button>
            </div>
          </article>
        ))}
        <h3 className="ub-eyebrow">已自动接受</h3>
        {accepted.length === 0 && <p className="ub-note">没有高于阈值后自动接受的归属。</p>}
        {accepted.map((row) => (
          <Card key={row.id} row={row} goals={goals} picked={picks[row.id] ?? (row.goalId ? [row.goalId] : [])}
            onPick={(ids) => setPicks({ ...picks, [row.id]: ids })}
            onAccept={() => void write(override(row.subject, 'accept_assignment', { assignmentId: row.id }))}
            onReject={() => void write(override(row.subject, 'reject_assignment', { assignmentId: row.id }))}
            onReassign={() => void write(override(row.subject, 'reassign', { goalIds: picks[row.id] ?? [] }))}
          />
        ))}
        <div className="ub-foot">
          <p className="ub-note">在资料里可以改概念的名字、隐藏和重要性。</p>
          <button type="button" className="ub-btn" disabled={!focusItem} onClick={() => focusItem && navigate({ view: 'library', itemId: focusItem })}>在资料里细调</button>
        </div>
      </section>
    </>
  )
}

function Card({
  row, goals, picked, hot, onPick, onAccept, onReject, onReassign,
}: {
  row: Assignment
  goals: Goal[]
  picked: string[]
  hot?: boolean
  onPick: (ids: string[]) => void
  onAccept: () => void
  onReject: () => void
  onReassign: () => void
}) {
  const goal = goals.find((item) => item.id === row.goalId)
  return (
    <article className={hot ? 'ub-chg hot' : 'ub-chg'}>
      <h3>{row.subject}{goal ? ` → ${goal.title}` : ''}</h3>
      <p className="ub-note">{row.reason} · {organizerPhrase(row.by)}{row.by.mock ? ' · 模拟' : ''}{row.autoAccepted ? ' · 高于阈值 0.85，已自动接受' : ''}</p>
      <div className="ub-row" style={{ flexWrap: 'wrap' }}>
        {goals.map((item) => {
          const on = picked.includes(item.id)
          return (
            <button key={item.id} type="button" className={on ? 'ub-chip on' : 'ub-chip'} onClick={() => onPick(on ? picked.filter((id) => id !== item.id) : [...picked, item.id])}>
              <i className="ub-gdot" style={{ background: goalSwatch(item.colorKey) }} />{item.title}
            </button>
          )
        })}
      </div>
      <div className="ub-side">
        <span className="ub-mono ub-muted">{row.confidence.toFixed(2)}</span>
        <button type="button" className="ub-btn sm pri" onClick={onAccept}>接受</button>
        <button type="button" className="ub-btn sm" onClick={onReassign}>改归属</button>
        <button type="button" className="ub-btn sm" onClick={onReject}>拒绝</button>
      </div>
    </article>
  )
}

function RelationCard({ row, onAccept, onReject }: { row: RelationCandidate; onAccept: () => void; onReject: () => void }) {
  return (
    <article className="ub-chg hot">
      <h3>{row.a} ↔ {row.b}</h3>
      <p className="ub-note">{row.reason || row.kind}</p>
      <div className="ub-side">
        <button type="button" className="ub-btn sm pri" onClick={onAccept}>接受</button>
        <button type="button" className="ub-btn sm" onClick={onReject}>拒绝</button>
      </div>
    </article>
  )
}

function override(target: SubjectRef, op: Override['op'], value: Override['value']): Override {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), target, op, value, reason: null } as Override
}

function relationOverride(row: RelationCandidate, op: 'confirm_relation' | 'reject_relation'): Override {
  if (op === 'confirm_relation') {
    return override(row.a, op, { a: row.a, b: row.b, kind: 'related' })
  }
  return override(row.a, op, { a: row.a, b: row.b })
}

function sameNames(panorama: Panorama): SameName[] {
  const found = new Map<string, { topicId: string; id: string }[]>()
  for (const topic of panorama.topics) {
    for (const group of topic.groups) {
      for (const concept of group.concepts) {
        const list = found.get(concept.label) ?? []
        list.push({ topicId: topic.topicId, id: concept.id })
        found.set(concept.label, list)
      }
    }
  }
  const rows: SameName[] = []
  for (const [label, list] of found) {
    const topics = new Set(list.map((item) => item.topicId))
    if (topics.size < 2) continue
    const [left, right] = list
    rows.push({
      id: `${left.topicId}/${left.id}~${right.topicId}/${right.id}`,
      label,
      a: `concept:${left.topicId}/${left.id}`,
      b: `concept:${right.topicId}/${right.id}`,
    })
  }
  return rows
}
