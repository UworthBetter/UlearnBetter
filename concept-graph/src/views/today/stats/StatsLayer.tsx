import { useEffect, useId, useState } from 'react'
import type { RecordClient } from '../../../record/client.ts'
import type { Goal, LearningEvent, Panorama, Stats } from '../../../record/types.ts'
import {
  formatDay,
  formatHoursCompact,
  formatMinutes,
  formatRate,
  heatCalendar,
  seriesColor,
  streakDisplay,
  trendReady,
} from '../../format.ts'

type Range = Stats['range']

interface Tip {
  x: number
  y: number
  text: string
}

export default function StatsLayer({ client, onClose }: { client: RecordClient; onClose: () => void }) {
  const [range, setRange] = useState<Range>('week')
  const [table, setTable] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [source, setSource] = useState<'record' | 'mock' | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [panorama, setPanorama] = useState<Panorama | null>(null)
  const [events, setEvents] = useState<LearningEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const chartId = useId()

  useEffect(() => {
    let live = true
    Promise.all([
      client.getStats(range),
      client.listGoals(),
      client.getPanorama(),
      client.listEvents({ limit: 50 }),
    ]).then(([statsEnv, goalEnv, panoramaEnv, eventEnv]) => {
      if (!live) return
      setStats(statsEnv.data)
      setSource(statsEnv.meta.source)
      setGoals(goalEnv.data)
      setPanorama(panoramaEnv.data)
      setEvents(eventEnv.data)
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '统计没有加载出来')
    })
    return () => { live = false }
  }, [client, range])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const colorOf = (goalId: string, index: number) => seriesColor(goals.find((goal) => goal.id === goalId)?.colorKey, index)
  const totalMinutes = (stats?.days ?? []).reduce((sum, day) => sum + (day.beforeStart ? 0 : day.minutes), 0)
  const stable = panorama?.summary.stable ?? 0
  const streak = stats ? streakDisplay(stats.streakDays, stats.todayDone, stats.learned) : { primary: '—', note: null }
  const ready = stats ? trendReady(stats.days) : false
  const weeks = stats ? heatCalendar(stats.days) : []
  const topicBars = topicRecall(panorama, events)

  return (
    <section className="ub">
      <div className="ub-scrim" onClick={onClose} />
      <div className="ub-sheet ub-glass" role="dialog" aria-label="学习统计">
        <div className="hx">
          <div>
            <p className="ub-eyebrow">学习统计 {source === 'mock' && <span className="ub-tag mock">示例数据</span>}</p>
            <h2>学得怎么样</h2>
            <p className="ub-meta">全部从学习痕迹算出：离星回忆、实操勾选、在星上停留的时长。不调用模型。</p>
          </div>
          <div className="ub-seg" role="tablist" aria-label="时间范围">
            {(['week', 'month', 'all'] as const).map((item) => (
              <button key={item} type="button" className={item === range ? 'on' : undefined} onClick={() => setRange(item)}>
                {item === 'week' ? '本周' : item === 'month' ? '本月' : '全部'}
              </button>
            ))}
          </div>
          <button type="button" className="ub-btn sm" aria-pressed={table} onClick={() => setTable((value) => !value)}>数据表</button>
          <button type="button" className="ub-x" aria-label="关闭统计" onClick={onClose}>×</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {stats && (
          <>
            <div className="ub-kpis">
              <div className="ub-kpi"><div className="l">学习时长</div><b>{formatHoursCompact(totalMinutes)}</b><div className="d">本周 {formatMinutes(stats.weekMinutes)}</div></div>
              <div className="ub-kpi"><div className="l">已学概念</div><b>{stats.learned}<small> / {stats.total}</small></b><div className="d">回忆过 {panorama?.summary.recalled ?? 0}</div></div>
              <div className="ub-kpi"><div className="l">已掌握</div><b>{stable}</b><div className="d">掌握度 3</div></div>
              <div className="ub-kpi"><div className="l">回忆正确率</div><b>{formatRate(stats.recallRate)}</b><div className="d">离星回忆</div></div>
              <div className="ub-kpi"><div className="l">连续学习</div><b>{streak.primary}</b><div className="d">{streak.note ?? '只呈现，不提醒'}</div></div>
            </div>
            <div className="ub-srow">
              <section className="ub-pnl">
                <div className="ub-ph"><h3>每天学习分钟</h3><span>虚线格是开始之前</span></div>
                <div className="ub-heatgrid" aria-label="五周热力图">
                  <span />
                  {weeks.map((column, index) => <span key={column[0]?.date ?? index}>{index + 1}</span>)}
                  {['一', '二', '三', '四', '五', '六', '日'].flatMap((label, weekday) => [
                    <span key={label}>{label}</span>,
                    ...weeks.map((column) => {
                      const cell = column[weekday]
                      if (!cell) return null
                      const className = cell.beforeStart ? 'ub-hc pre' : cell.future ? 'ub-hc' : `ub-hc l${cell.level}`
                      return <i key={cell.date} className={className} aria-label={`${cell.date} ${cell.beforeStart ? '还没开始' : `${Math.round(cell.minutes)} 分`}`} />
                    }),
                  ])}
                </div>
              </section>
              <section className="ub-pnl" style={{ position: 'relative' }}>
                <div className="ub-ph">
                  <h3>各目标累计回忆过的概念</h3>
                  <span className="ub-legend" style={{ display: 'flex', gap: 12 }}>
                    {stats.goals.map((goal, index) => (
                      <span key={goal.goalId}><i style={{ display: 'inline-block', width: 12, height: 2, background: colorOf(goal.goalId, index), marginRight: 4 }} />{goal.title}</span>
                    ))}
                  </span>
                </div>
                {!ready && <p>学满 3 天后才有趋势</p>}
                {table
                  ? <DataTable stats={stats} />
                  : <TrendChart chartId={chartId} stats={stats} colorOf={colorOf} onTip={setTip} />}
                {tip && <div className="ub-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
                {stats.sharedTopicsNote && <p className="ub-note">{stats.sharedTopicsNote}</p>}
              </section>
            </div>
            <div className="ub-srow three">
              <section className="ub-pnl">
                <div className="ub-ph"><h3>回忆正确率 · 按主题</h3></div>
                {topicBars.length === 0 && <p className="ub-note">还没有按主题的回忆记录。</p>}
                {topicBars.map((bar) => (
                  <div key={bar.topicId} className="ub-hbar">
                    <span className="ub-clip">{bar.title}</span>
                    <span className="t"><i style={{ width: `${bar.total ? (bar.remembered / bar.total) * 100 : 0}%`, background: seriesColor(undefined, 0) }} /></span>
                    <span className="ub-mono">{bar.remembered}/{bar.total}</span>
                  </div>
                ))}
              </section>
              <section className="ub-pnl">
                <div className="ub-ph"><h3>最容易忘的</h3></div>
                <ul className="ub-list">
                  {forgotten(panorama, events).map((row) => (
                    <li key={row.key}>{row.label}<small>{row.note}</small></li>
                  ))}
                  {forgotten(panorama, events).length === 0 && <li>还没有忘了的星</li>}
                </ul>
              </section>
              <section className="ub-pnl">
                <div className="ub-ph"><h3>最近的学习痕迹</h3></div>
                <ul className="ub-list">
                  {events.slice(0, 8).map((event) => (
                    <li key={event.id}>{eventLabel(event)}<small>{event.at.slice(0, 16).replace('T', ' ')}</small></li>
                  ))}
                  {events.length === 0 && <li>还没有痕迹</li>}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function TrendChart({
  chartId, stats, colorOf, onTip,
}: {
  chartId: string
  stats: Stats
  colorOf: (goalId: string, index: number) => string
  onTip: (tip: Tip | null) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 180
  const pad = 28
  const dates = uniqueDates(stats)
  const max = Math.max(1, ...stats.goals.flatMap((goal) => goal.history.map((point) => point.recalled)))
  const x = (index: number) => pad + (dates.length <= 1 ? (width - pad * 2) / 2 : (index * (width - pad * 2)) / (dates.length - 1))
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2)
  return (
    <svg className="ub-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="各目标累计回忆" id={chartId}
      onMouseLeave={() => { setHover(null); onTip(null) }}>
      {[0, Math.round(max / 2), max].map((mark) => (
        <g key={mark}>
          <line x1={pad} x2={width - 8} y1={y(mark)} y2={y(mark)} stroke="rgba(255,255,255,.12)" />
          <text x={pad - 6} y={y(mark) + 3} textAnchor="end" fontSize="10" fill="rgba(200,212,250,.52)">{mark}</text>
        </g>
      ))}
      {stats.goals.map((goal, goalIndex) => {
        const points = dates.map((date, index) => {
          const found = [...goal.history].reverse().find((point) => point.date <= date)
          return { date, index, value: found?.recalled ?? 0 }
        })
        const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.index)} ${y(point.value)}`).join(' ')
        const last = points[points.length - 1]
        return (
          <g key={goal.goalId}>
            <path d={d} fill="none" stroke={colorOf(goal.goalId, goalIndex)} strokeWidth="2" />
            {last && (
              <text x={x(last.index) + 6} y={y(last.value) + 4} fontSize="11" fill="#f3f5ff">{goal.title} {last.value}</text>
            )}
          </g>
        )
      })}
      {dates.map((date, index) => (
        <rect
          key={date}
          className="hov"
          x={x(index) - 12}
          y={8}
          width={24}
          height={height - 16}
          fill="transparent"
          onMouseMove={(event) => {
            setHover(index)
            const lines = stats.goals.map((goal) => {
              const found = [...goal.history].reverse().find((point) => point.date <= date)
              return `${goal.title} ${found?.recalled ?? 0}`
            })
            const day = stats.days.find((item) => item.date === date)
            const box = (event.currentTarget.ownerSVGElement?.getBoundingClientRect())
            onTip({
              x: box ? event.clientX - box.left : x(index),
              y: 8,
              text: `${formatDay(date)} · ${lines.join(' · ')} · ${Math.round(day?.minutes ?? 0)} 分`,
            })
          }}
        />
      ))}
      {hover !== null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={16} y2={y(0)} stroke="rgba(255,222,170,.7)" />
          {stats.goals.map((goal) => {
            const date = dates[hover]
            if (!date) return null
            const found = [...goal.history].reverse().find((point) => point.date <= date)
            const value = found?.recalled ?? 0
            return <line key={goal.goalId} x1={pad} x2={x(hover)} y1={y(value)} y2={y(value)} stroke="rgba(255,222,170,.35)" />
          })}
        </g>
      )}
    </svg>
  )
}

function DataTable({ stats }: { stats: Stats }) {
  const dates = uniqueDates(stats)
  return (
    <table className="ub-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>分钟</th>
          {stats.goals.map((goal) => <th key={goal.goalId}>{goal.title}</th>)}
        </tr>
      </thead>
      <tbody>
        {dates.map((date) => (
          <tr key={date}>
            <td>{date}</td>
            <td>{Math.round(stats.days.find((day) => day.date === date)?.minutes ?? 0)}</td>
            {stats.goals.map((goal) => {
              const found = [...goal.history].reverse().find((point) => point.date <= date)
              return <td key={goal.goalId}>{found?.recalled ?? 0}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function uniqueDates(stats: Stats): string[] {
  const set = new Set<string>(stats.days.filter((day) => !day.beforeStart).map((day) => day.date))
  for (const goal of stats.goals) for (const point of goal.history) set.add(point.date)
  return [...set].sort()
}

function topicRecall(panorama: Panorama | null, events: LearningEvent[]) {
  if (!panorama) return []
  return panorama.topics.map((topic) => {
    const recalls = events.filter((event) => event.kind === 'recall' && event.subject.startsWith(`concept:${topic.topicId}/`))
    const remembered = new Set(recalls.filter((event) => event.kind === 'recall' && event.result === 'remembered').map((event) => event.subject)).size
    const attempts = new Set(recalls.map((event) => event.subject)).size
    return { topicId: topic.topicId, title: topic.title, remembered, total: Math.max(attempts, remembered) }
  }).filter((row) => row.total > 0)
}

function forgotten(panorama: Panorama | null, events: LearningEvent[]) {
  const rows = events.filter((event) => event.kind === 'recall' && event.result === 'forgot').map((event) => ({
    key: event.id,
    label: event.subject,
    note: '忘了',
  }))
  if (rows.length > 0 || !panorama) return rows.slice(0, 5)
  return panorama.topics.flatMap((topic) => topic.groups.flatMap((group) => group.concepts
    .filter((concept) => concept.level === 0 && concept.due)
    .map((concept) => ({ key: `${topic.topicId}/${concept.id}`, label: concept.label, note: '到期还没学' })))).slice(0, 5)
}

function eventLabel(event: LearningEvent): string {
  if (event.kind === 'recall') return `回忆 · ${event.result === 'remembered' ? '记得' : event.result === 'forgot' ? '忘了' : '跳过'}`
  if (event.kind === 'checklist') return event.checked ? '勾选实操' : '取消勾选'
  if (event.kind === 'visit') return `停留 ${event.durationSec} 秒`
  if (event.kind === 'question') return '提问'
  return '记下'
}
