import { useEffect, useState } from 'react'
import type { ViewProps } from '../../record/view-props.ts'
import type { Panorama } from '../../record/types.ts'
import { goalSwatch } from '../format.ts'
import { layoutPanorama, type LayoutInput, type PanoramaLayout } from './layout.ts'
import '../views.css'

export default function PanoramaView({ client, route, navigate, openAdjust, reportScene }: ViewProps) {
  const goalId = route.view === 'panorama' ? route.goalId ?? null : null
  const [data, setData] = useState<Panorama | null>(null)
  const [source, setSource] = useState<'record' | 'mock' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 1100, height: 760 })

  useEffect(() => {
    let live = true
    client.getPanorama(goalId ?? undefined).then((env) => {
      if (!live) return
      setData(focusGoal(env.data, goalId))
      setSource(env.meta.source)
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '全景没有加载出来')
    })
    return () => { live = false }
  }, [client, goalId])

  useEffect(() => {
    if (!data || !source) return
    const goal = goalId ? data.goals.find((entry) => entry.goal.id === goalId)?.goal ?? null : null
    reportScene({
      layer: null,
      record: {
        source,
        goal: goal ? { id: goal.id, title: goal.title } : null,
        todayPlan: null,
        pendingCount: data.relationCandidates.filter((row) => !row.confirmed).length,
        selectedItem: null,
        mastery: null,
        stats: null,
      },
    })
  }, [data, goalId, reportScene, source])

  useEffect(() => {
    function measure() {
      const narrow = window.innerWidth <= 900
      const rail = narrow ? 0 : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ub-rail-width')) || 332
      const bar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ub-agent-bar-height')) || 140
      setSize({
        width: Math.max(narrow ? 280 : 480, window.innerWidth - (narrow ? 24 : rail + 48)),
        height: narrow ? 720 : Math.max(420, window.innerHeight - bar - 96),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const layout = data ? layoutPanorama(toLayout(data), size.width, size.height) : null
  const oneGoal = (data?.goals.length ?? 0) <= 1
  const head = data && goalId
    ? {
        concepts: data.topics.reduce((count, topic) => count + topic.groups.reduce((inner, group) => inner + group.concepts.length, 0), 0),
        topics: data.topics.length,
        goals: data.goals.length,
      }
    : { concepts: data?.summary.concepts ?? 0, topics: data?.summary.topics ?? 0, goals: data?.summary.goals ?? 0 }

  return (
    <section className="ub ub-pano">
      {source === 'mock' && <span className="ub-sample">示例数据</span>}
      <div className="ub-zoom">
        <div className="ub-seg" aria-label="缩放">
          <button type="button" className={!goalId ? 'on' : undefined} onClick={() => navigate({ view: 'panorama' })}>全景</button>
          <button type="button" className={goalId ? 'on' : undefined} onClick={() => zoomGoal(data, goalId, navigate)}>目标</button>
          <button type="button" onClick={() => openTopic(data, navigate)}>主题</button>
          <button type="button" onClick={() => openTopic(data, navigate)}>概念</button>
        </div>
        <span className="ub-muted">点星座进入潜航</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {layout && <Sky layout={layout} onTopic={(topicId) => navigate({ view: 'star-dive', topicId })} onConcept={(topicId, conceptId) => navigate({ view: 'star-dive', topicId, conceptId })} />}
      {data && layout && (
        <aside className="ub-rail ub-glass" aria-label="全景摘要">
          <h2>{head.concepts}{'\u00A0'}颗星 · {head.topics}{'\u00A0'}个主题 · {head.goals}{'\u00A0'}个目标</h2>
          <p className="ub-meta">已学 {data.summary.learned} · 回忆 {data.summary.recalled} · 掌握 {data.summary.stable} · 未归属 {data.summary.unassigned}</p>
          {oneGoal && <p className="ub-note">只有一个目标，不画星云分区。</p>}
          {data.goals.map((entry) => {
            const topics = data.topics.filter((topic) => topic.goalIds.includes(entry.goal.id))
            const concepts = topics.flatMap((topic) => topic.groups.flatMap((group) => group.concepts))
            const total = concepts.length || 1
            const stable = concepts.filter((concept) => concept.level >= 3).length
            const recalled = concepts.filter((concept) => concept.level === 2).length
            const seen = concepts.filter((concept) => concept.level === 1).length
            return (
              <div key={entry.goal.id} style={{ marginBottom: 10 }}>
                <div className="ub-row"><i className="ub-gdot" style={{ background: goalSwatch(entry.goal.colorKey) }} /><b>{entry.goal.title}</b><span className="ub-mono ub-muted">{concepts.filter((concept) => concept.level >= 1).length}/{concepts.length}</span></div>
                <div className="ub-sbar" aria-hidden="true">
                  <i style={{ width: `${(stable / total) * 100}%`, background: '#ffb547' }} />
                  <i style={{ width: `${(recalled / total) * 100}%`, background: 'rgba(255,190,110,.55)' }} />
                  <i style={{ width: `${(seen / total) * 100}%`, background: 'rgba(255,255,255,.28)' }} />
                </div>
              </div>
            )
          })}
          <p className="ub-eyebrow">缺口</p>
          {data.gaps.length === 0 && <p>没有整块没学的部分</p>}
          {data.gaps.map((gap) => (
            <button key={`${gap.topicId}/${gap.group}`} type="button" className="ub-ritem" onClick={() => navigate({ view: 'star-dive', topicId: gap.topicId })}>
              <span><b>缺口 · {gap.group} 0/{gap.count}</b><small>{gap.why}</small></span>
            </button>
          ))}
          <p className="ub-eyebrow">待确认的关联</p>
          {data.relationCandidates.filter((row) => !row.confirmed).length === 0 && <p className="ub-note">没有待确认的关联</p>}
          {data.relationCandidates.filter((row) => !row.confirmed).map((row) => (
            <button key={row.id} type="button" className="ub-ritem" onClick={() => openAdjust()}>
              <span>{row.reason || `${row.a} ↔ ${row.b}`}</span>
            </button>
          ))}
          <p className="ub-eyebrow">下一步</p>
          {layout.next.map((step) => (
            <button key={step.key} type="button" className="ub-ritem" onClick={() => navigate({ view: 'star-dive', topicId: step.topicId, conceptId: step.conceptId })}>
              <span className="ub-num">{step.index}</span>
              <span><b>{step.title}</b></span>
            </button>
          ))}
          <div className="ub-legend">
            <span>实线星 = 已定</span>
            <span>紫虚线 = 待确认</span>
            <span>珊瑚虚线圈 = 缺口</span>
            <span>金色数字 = 下一步</span>
            <span>琥珀脉冲 = 到期</span>
            <span>亮度 = 掌握</span>
          </div>
        </aside>
      )}
    </section>
  )
}

function Sky({
  layout, onTopic, onConcept,
}: {
  layout: PanoramaLayout
  onTopic: (topicId: string) => void
  onConcept: (topicId: string, conceptId: string) => void
}) {
  return (
    <div className="ub-sky">
      <svg className="links" aria-hidden="true">
        {layout.links.map((link, index) => (
          <line
            key={`${link.kind}-${index}`}
            x1={link.x1}
            y1={link.y1}
            x2={link.x2}
            y2={link.y2}
            stroke={link.kind === 'tether' ? 'rgba(201,182,255,.7)' : 'rgba(201,182,255,.85)'}
            strokeDasharray={link.kind === 'confirmed' ? undefined : '5 5'}
            strokeWidth="1.4"
          />
        ))}
        {layout.next.length > 1 && (
          <polyline
            points={layout.next.map((step) => `${step.x},${step.y}`).join(' ')}
            fill="none"
            stroke="#ffb547"
            strokeDasharray="2 6"
            strokeWidth="1.6"
          />
        )}
        {layout.gaps.map((gap) => (
          <ellipse key={`${gap.topicId}/${gap.group}`} cx={gap.x} cy={gap.y} rx={gap.rx} ry={gap.ry} fill="none" stroke="rgba(255,150,130,.75)" strokeDasharray="6 5" />
        ))}
      </svg>
      {layout.goals.map((goal) => (
        <div key={goal.id} className={goal.colorKey === 'cyan' ? 'ub-goalname cy' : 'ub-goalname'} style={{ left: goal.x, top: goal.y }}>
          <div className="ub-eyebrow">目标</div>
          <h2>{goal.title}</h2>
        </div>
      ))}
      {layout.stars.map((star) => {
        const step = layout.next.find((item) => item.key === star.key)
        const color = star.colorKey === 'cyan' ? '#86dcff' : star.colorKey === 'violet' ? '#c9b6ff' : '#ffb547'
        return (
          <button
            key={star.key}
            type="button"
            className="ub-star"
            style={{ left: star.x, top: star.y }}
            onClick={() => onConcept(star.topicId, star.conceptId)}
            aria-label={star.label}
          >
            {star.due && <span className="due" style={{ width: star.radius * 5, height: star.radius * 5 }} />}
            <span className="core" style={{ width: star.radius * 2, height: star.radius * 2, ['--c' as string]: color, opacity: 0.35 + star.level * 0.2 }} />
            <span className="hit" />
            {star.importance >= 2 && <span className="name">{star.label}</span>}
            {step && <span className="ub-next">{step.index}</span>}
          </button>
        )
      })}
      {layout.gaps.map((gap) => (
        <button key={`label-${gap.topicId}/${gap.group}`} type="button" className="ub-gaplabel" style={{ left: gap.x, top: gap.y + gap.ry * 0.15 }} onClick={() => onTopic(gap.topicId)}>
          缺口 · {gap.group} 0/{gap.count}
        </button>
      ))}
      {layout.topics.map((topic) => (
        <button key={topic.topicId} type="button" className={topic.pending ? 'ub-const pend' : 'ub-const'} style={{ left: topic.x, top: topic.y }} onClick={() => onTopic(topic.topicId)}>
          <b>{topic.title}</b>
          <span>{topic.learned}/{topic.total}</span>
        </button>
      ))}
    </div>
  )
}

function toLayout(data: Panorama): LayoutInput {
  return {
    goals: data.goals,
    topics: data.topics,
    gaps: data.gaps,
    nextSteps: data.nextSteps,
    relationCandidates: [...data.relationCandidates,...(data.relations||[]).map((r,i)=>({...r,id:`compiled-${i}`,confirmed:true}))],
  }
}

function focusGoal(data: Panorama, goalId: string | null): Panorama {
  if (!goalId) return data
  const goal = data.goals.find((entry) => entry.goal.id === goalId)
  if (!goal) return data
  const topicIds = new Set(goal.topicIds)
  return {
    ...data,
    goals: [goal],
    topics: data.topics.filter((topic) => topicIds.has(topic.topicId) || topic.goalIds.includes(goalId)),
    gaps: data.gaps.filter((gap) => topicIds.has(gap.topicId)),
  }
}

function zoomGoal(data: Panorama | null, goalId: string | null, navigate: ViewProps['navigate']) {
  if (goalId) return
  const only = data?.goals.length === 1 ? data.goals[0].goal.id : data?.goals[0]?.goal.id
  if (only) navigate({ view: 'panorama', goalId: only })
}

function openTopic(data: Panorama | null, navigate: ViewProps['navigate']) {
  const topic = data?.topics[0]
  if (topic) navigate({ view: 'star-dive', topicId: topic.topicId })
}
