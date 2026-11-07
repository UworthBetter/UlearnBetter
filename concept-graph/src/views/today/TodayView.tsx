import { useEffect, useState } from 'react'
import type { ViewProps } from '../../record/view-props.ts'
import type { Envelope, Goal, Item, LearningEvent, Panorama, Proposals, Stats, TodayPlan } from '../../record/types.ts'
import {
  entryKindLabel,
  formatClock,
  formatDay,
  formatHoursCompact,
  formatMinutes,
  formatRate,
  goalSwatch,
  kindLabel,
  lastNineDays,
  statusCopy,
  streakDisplay,
} from '../format.ts'
import { hashText } from '../panorama/layout.ts'
import StatsLayer from './stats/StatsLayer.tsx'
import '../views.css'

interface HomePack {
  today: Envelope<TodayPlan>
  stats: Envelope<Stats>
  goals: Envelope<Goal[]>
  panorama: Envelope<Panorama>
  items: Envelope<Item[]>
  proposals: Envelope<Proposals>
  events: Envelope<LearningEvent[]>
}

function Sample({ source, mock }: { source?: string; mock?: boolean }) {
  if (source !== 'mock' && !mock) return null
  return <span className="ub-tag mock">示例数据</span>
}

function conceptLabel(panorama: Panorama, ref: string): string | null {
  const match = /^concept:([^/]+)\/(.+)$/.exec(ref)
  if (!match) return null
  const topic = panorama.topics.find((row) => row.topicId === match[1])
  const concept = topic?.groups.flatMap((group) => group.concepts).find((row) => row.id === match[2])
  return concept?.label ?? match[2] ?? null
}

function visitOf(events: LearningEvent[], subject: string): { seconds: number; at: string } {
  let seconds = 0
  let at = ''
  for (const event of events) {
    if (event.subject !== subject) continue
    if (event.at > at) at = event.at
    if (event.kind === 'visit') seconds += event.durationSec
  }
  return { seconds, at }
}

export default function TodayView({ client, route, navigate, reportScene }: ViewProps) {
  const [pack, setPack] = useState<HomePack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [draftTitle, setDraftTitle] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    Promise.all([
      client.getToday(),
      client.getStats('week'),
      client.listGoals(),
      client.getPanorama(),
      client.listItems(),
      client.getProposals(),
      client.listEvents({ limit: 50 }),
    ]).then(([today, stats, goals, panorama, items, proposals, events]) => {
      if (!live) return
      setError(null)
      setPack({ today, stats, goals, panorama, items, proposals, events })
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '今天的记录没有加载出来')
    })
    return () => { live = false }
  }, [client, tick])

  useEffect(() => {
    if (!pack) return
    const stats = pack.stats.data
    const pending = pack.items.data.filter((item) => item.status === 'pending').length
    reportScene({
      layer: route.view === 'today' && route.layer === 'stats' ? 'stats' : null,
      record: {
        source: pack.today.meta.source,
        goal: null,
        todayPlan: {
          date: pack.today.data.date,
          entries: pack.today.data.entries.map((entry) => ({
            kind: entry.kind,
            subject: entry.subject,
            title: entry.title,
            why: entry.why,
          })),
        },
        pendingCount: pending,
        selectedItem: null,
        mastery: null,
        stats: {
          weekMinutes: stats.weekMinutes,
          streakDays: stats.streakDays,
          recallRate: stats.recallRate,
          learned: stats.learned,
          total: stats.total,
        },
      },
    })
  }, [pack, reportScene, route])

  if (route.view === 'today' && route.layer === 'stats') {
    return <StatsLayer client={client} onClose={() => navigate({ view: 'today' })} />
  }

  const source = pack?.today.meta.source
  const confirmed = (pack?.goals.data ?? []).filter((goal) => goal.confirmedAt)
  const items = pack?.items.data ?? []
  const quietStart = (pack?.stats.data.learned ?? 0) <= 0 && (pack?.stats.data.weekMinutes ?? 0) <= 0

  return (
    <section className="ub ub-home">
      <Sample source={source} />
      {error && <p className="ub-note" role="alert">{error}</p>}
      {!pack && !error && <p className="ub-note">正在读取今天的记录…</p>}
      {pack && items.length === 0 && (
        <div className="ub-empty">
          <div className="ub-seed" />
          <p className="ub-eyebrow">ULEARNBETTER</p>
          <h1>把在学的东西丢进来</h1>
          <p className="ub-meta">视频链接、笔记文件夹、一段想法。文章和 PDF 下一轮再收。</p>
          <div className="ub-kinds">
            <div className="ub-kind"><b>视频链接</b>贴到下面的栏里</div>
            <div className="ub-kind"><b>笔记文件夹</b>本轮走命令行编译</div>
            <div className="ub-kind"><b>一段想法</b>以「想法：」开头</div>
            <div className="ub-kind soon"><b>文章 / PDF</b>下一轮</div>
          </div>
          <p className="ub-note">整理结果先是提议。没有目标也能先放进未归属。</p>
        </div>
      )}
      {pack && items.length > 0 && confirmed.length === 0 && (
        <NoGoals
          pack={pack}
          draftTitle={draftTitle}
          setDraftTitle={setDraftTitle}
          onConfirm={async (proposalId, title, intent) => {
            await client.createGoal({
              title,
              intent,
              status: 'active',
              origin: 'user',
              colorKey: 'amber',
              folders: [],
              fromProposalId: proposalId,
            })
            setTick((value) => value + 1)
          }}
          onOpenItem={(itemId) => navigate({ view: 'library', itemId })}
        />
      )}
      {pack && items.length > 0 && confirmed.length > 0 && (
        <HomeBody
          pack={pack}
          quietStart={quietStart}
          onStats={() => navigate({ view: 'today', layer: 'stats' })}
          onDive={(topicId, conceptId) => navigate({ view: 'star-dive', topicId, conceptId })}
          onGoal={(goalId) => navigate({ view: 'panorama', goalId })}
          onItem={(itemId) => navigate({ view: 'library', itemId: itemId || null })}
        />
      )}
    </section>
  )
}

function HomeBody({
  pack, quietStart, onStats, onDive, onGoal, onItem,
}: {
  pack: HomePack
  quietStart: boolean
  onStats: () => void
  onDive: (topicId: string, conceptId: string | null) => void
  onGoal: (goalId: string) => void
  onItem: (itemId: string) => void
}) {
  const stats = pack.stats.data
  const goals = pack.goals.data
  const heat = lastNineDays(stats.days)
  const streak = streakDisplay(stats.streakDays, stats.todayDone, stats.learned)
  const entries = pack.today.data.entries.slice(0, 5)
  const topicTitle = new Map(pack.panorama.data.topics.map((topic) => [topic.topicId, topic.title]))
  const goalTitle = new Map(goals.map((goal) => [goal.id, goal.title]))
  const recent = [...pack.items.data].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 4)
  const minutes = entries.reduce((sum, entry) => sum + visitOf(pack.events.data, entry.subject).seconds, 0) / 60

  return (
    <>
      <header className="ub-head">
        <div>
          <p className="ub-eyebrow">TODAY · {formatDay(pack.today.data.date)}</p>
          <h1>今天学 {entries.length} 件事{minutes > 0 ? `，约 ${formatMinutes(minutes)}` : ''}</h1>
          <p className="ub-meta">排序：到期复习 → 路线下一颗 → 实操。规则 {pack.today.data.algorithm}，不调用模型。</p>
        </div>
        <button type="button" className="ub-kstrip ub-glass" onClick={onStats}>
          <span className="ub-heat" aria-hidden="true">
            {heat.map((cell) => (
              <i key={cell.date} className={cell.beforeStart ? 'ub-hc pre' : `ub-hc l${cell.level}`} />
            ))}
          </span>
          <span className="ub-k">本周<b>{quietStart ? '—' : formatHoursCompact(stats.weekMinutes)}</b></span>
          <span className="ub-k">连续<b>{quietStart ? '—' : streak.primary}</b>{streak.note ? <small>{streak.note}</small> : null}</span>
          <span className="ub-k">回忆<b>{quietStart ? '—' : formatRate(stats.recallRate)}</b></span>
          <span className="ub-k">已学<b>{stats.learned}<small>/{stats.total}</small></b></span>
          <span className="ub-go">统计 →</span>
        </button>
      </header>
      {entries.length === 0
        ? <p className="ub-note">今天还没有排出要学的星。统计条里的连续天数不会因此被清掉。</p>
        : (
          <div className="ub-today">
            {entries.map((entry) => {
              const visit = visitOf(pack.events.data, entry.subject)
              return (
                <button
                  key={entry.subject}
                  type="button"
                  className="ub-tcard ub-glass"
                  onClick={() => onDive(entry.topicId, entry.conceptId)}
                >
                  <span className="ub-row">
                    <span className="ub-tag">{entryKindLabel(entry.kind)}</span>
                    {visit.seconds > 0 && <span className="ub-mono ub-muted">{formatMinutes(visit.seconds / 60)}</span>}
                  </span>
                  <h3 className="ub-clip">{entry.title}</h3>
                  <p className="ub-muted">{topicTitle.get(entry.topicId) ?? entry.topicId}</p>
                  <p className="why">{entry.why}</p>
                  <span className="ub-row">
                    {visit.at && <span className="ub-tag ghost ub-mono">{formatClock(visit.at)}</span>}
                    <span className="ub-go">潜航</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      <div className="ub-goals">
        {goals.filter((goal) => goal.confirmedAt).map((goal) => {
          const topics = pack.panorama.data.topics.filter((topic) => topic.goalIds.includes(goal.id))
          const concepts = topics.flatMap((topic) => topic.groups.flatMap((group) => group.concepts))
          const learned = concepts.filter((concept) => concept.level >= 1).length
          const recalled = concepts.filter((concept) => concept.level >= 2).length
          const total = concepts.length || 1
          return (
            <button key={goal.id} type="button" className={goal.colorKey === 'cyan' ? 'ub-gcard ub-glass cy' : 'ub-gcard ub-glass'} onClick={() => onGoal(goal.id)}>
              <Mini topics={topics} color={goal.colorKey} />
              <span>
                <h3><i className="ub-gdot" style={{ background: goalSwatch(goal.colorKey) }} />{goal.title}</h3>
                <p className="ub-intent">{goal.intent ?? '还没有写下意图'}</p>
                <span className="ub-stats">
                  <div>颗星<b>{concepts.length}</b></div>
                  <div>已学<b>{learned}</b></div>
                  <div>已回忆<b>{recalled}</b></div>
                </span>
                <span className="ub-prog" aria-hidden="true">
                  <i className="rec" style={{ width: `${(recalled / total) * 100}%` }} />
                  <i className="seen" style={{ width: `${(Math.max(0, learned - recalled) / total) * 100}%` }} />
                </span>
                <span className="ub-topics">
                  {topics.map((topic) => (
                    <div key={topic.topicId} className={topic.goalIds.length > 1 ? 'pend' : undefined}>
                      {topic.title}
                      <span>{topic.groups.reduce((sum, group) => sum + group.concepts.filter((concept) => concept.level >= 1).length, 0)}/{topic.groups.reduce((sum, group) => sum + group.concepts.length, 0)}</span>
                    </div>
                  ))}
                </span>
              </span>
            </button>
          )
        })}
        <section className="ub-trail ub-glass">
          <p className="ub-eyebrow">智能体整理</p>
          {recent.map((item) => {
            const titles = item.goalIds.map((id) => goalTitle.get(id)).filter((title): title is string => Boolean(title))
            const attachment = pack.proposals.data.ideaAttachments.find((row) => row.subject === `item:${item.id}`)
            const copy = statusCopy({
              status: item.status,
              kind: item.kind,
              conceptCount: item.conceptCount,
              goalTitles: titles,
              pipelineState: item.pipeline.state,
              pipelineReason: item.pipeline.reason,
              attachLabel: attachment ? conceptLabel(pack.panorama.data, attachment.conceptRef) : null,
            })
            const tone = item.status === 'organizing' ? 'run' : item.status === 'pending' ? 'pend' : item.status === 'failed' ? 'bad' : ''
            return (
              <button key={item.id} type="button" className="ub-arow" onClick={() => onItem(item.id)}>
                <span className="ub-aic" aria-hidden="true">{kindLabel(item.kind).slice(0, 1)}</span>
                <span className="ub-an ub-clip">{item.title}<small className={tone}>{copy}</small></span>
              </button>
            )
          })}
          <button type="button" className="ub-btn txt" onClick={() => onItem('')}>全部 {pack.items.data.length} 份 →</button>
        </section>
      </div>
    </>
  )
}

function Mini({ topics, color }: { topics: Panorama['topics']; color: Goal['colorKey'] }) {
  const concepts = topics.flatMap((topic) => topic.groups.flatMap((group) => group.concepts.map((concept) => ({ ...concept, topicId: topic.topicId })))).slice(0, 16)
  const fill = color === 'cyan' ? '#86dcff' : color === 'violet' ? '#c9b6ff' : '#ffb547'
  return (
    <svg className="ub-mini" viewBox="0 0 132 132" aria-hidden="true">
      {concepts.map((concept) => {
        const turn = ((hashText(`${concept.topicId}/${concept.id}`) % 360) * Math.PI) / 180
        const dist = 18 + (hashText(concept.id) % 40)
        return (
          <circle
            key={`${concept.topicId}/${concept.id}`}
            cx={66 + Math.cos(turn) * dist}
            cy={66 + Math.sin(turn) * dist}
            r={2 + concept.importance}
            fill={fill}
            opacity={0.28 + concept.level * 0.22}
          />
        )
      })}
    </svg>
  )
}

function NoGoals({
  pack, draftTitle, setDraftTitle, onConfirm, onOpenItem,
}: {
  pack: HomePack
  draftTitle: Record<string, string>
  setDraftTitle: (value: Record<string, string>) => void
  onConfirm: (proposalId: string, title: string, intent: string | null) => Promise<void>
  onOpenItem: (itemId: string) => void
}) {
  const proposals = pack.proposals.data.goalProposals
  return (
    <div>
      <header className="ub-head">
        <div>
          <p className="ub-eyebrow">TODAY</p>
          <h1>先确认一个目标</h1>
          <p className="ub-meta">资料已经在，目标还是提议。确认之后才会出现在全景里。</p>
        </div>
        <Sample source={pack.today.meta.source} mock={pack.proposals.data.assignments.some((row) => row.by.mock)} />
      </header>
      {proposals.length === 0 && <p className="ub-note">还没有目标提议。资料先留在未归属。</p>}
      {proposals.map((proposal) => {
        const title = draftTitle[proposal.id] ?? proposal.title
        return (
          <article key={proposal.id} className="ub-prop ub-glass">
            <p className="ub-eyebrow">目标提议 <Sample mock /></p>
            <label className="ub-meta">
              名称
              <input value={title} onChange={(event) => setDraftTitle({ ...draftTitle, [proposal.id]: event.target.value })} />
            </label>
            <p>{proposal.reason}</p>
            <button type="button" className="ub-btn pri" onClick={() => void onConfirm(proposal.id, title.trim() || proposal.title, proposal.intent)}>确认这个目标</button>
          </article>
        )
      })}
      <section className="ub-bucket ub-glass ub-prop">
        <h2>未归属</h2>
        {pack.items.data.map((item) => (
          <button key={item.id} type="button" className="ub-arow" onClick={() => onOpenItem(item.id)}>
            <span className="ub-an">{item.title}<small>{kindLabel(item.kind)}</small></span>
          </button>
        ))}
      </section>
    </div>
  )
}
