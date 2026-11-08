import { useEffect, useMemo, useState } from 'react'
import type { ViewProps } from '../../record/view-props.ts'
import type { Assignment, Goal, Item, ItemDetail, Override, Panorama, SubjectRef, TopicLearn, By } from '../../record/types.ts'
import { formatDay, goalSwatch, kindLabel, organizerPhrase, PIPELINE_STEPS, statusCopy, stepLabel } from '../format.ts'
import '../views.css'

type StatusFilter = 'all' | Item['status']
type KindFilter = 'all' | Item['kind']

interface ConceptRow {
  id: string
  label: string
  group: string
  level: 0 | 1 | 2 | 3
  hidden: boolean
  pinned: 1 | 2 | 3 | null
  renamed: boolean
}

const KIND_FILTERS: KindFilter[] = ['all', 'video', 'notes', 'idea', 'article', 'pdf']
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'organizing', label: '整理中' },
  { id: 'pending', label: '待确认' },
  { id: 'done', label: '已整理' },
  { id: 'failed', label: '失败' },
]

export default function LibraryView({ client, route, navigate, openAdjust, reportScene }: ViewProps) {
  const [items, setItems] = useState<Item[]>([])
  const [organizerBy,setOrganizerBy]=useState<By|null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [source, setSource] = useState<'record' | 'mock' | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const routeItemId = route.view === 'library' ? route.itemId ?? null : null
  const [picked, setPicked] = useState<string | null>(routeItemId)
  const [attachLabels, setAttachLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([
      client.listItems(),
      client.listGoals(),
      client.getProposals(),
      client.getPanorama(),
      client.listChangeLog(),
    ]).then(([itemEnv, goalEnv, proposalEnv, panoramaEnv,logEnv]) => {
      if (!live) return
      setItems(itemEnv.data)
      setOrganizerBy(logEnv.data.find(log=>!log.undone)?.organizer??null)
      setGoals(goalEnv.data)
      setSource(itemEnv.meta.source)
      const names = new Map<string, string>()
      for (const topic of panoramaEnv.data.topics) {
        for (const group of topic.groups) {
          for (const concept of group.concepts) names.set(`concept:${topic.topicId}/${concept.id}`, concept.label)
        }
      }
      const labels: Record<string, string> = {}
      for (const row of proposalEnv.data.ideaAttachments) {
        labels[row.subject] = names.get(row.conceptRef) ?? row.conceptRef
      }
      setAttachLabels(labels)
      setPicked((current) => current ?? itemEnv.data[0]?.id ?? null)
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '资料没有加载出来')
    })
    return () => { live = false }
  }, [client, tick])

  const counts = useMemo(() => ({
    status: Object.fromEntries(STATUS_FILTERS.map((item) => [item.id, item.id === 'all' ? items.length : items.filter((row) => row.status === item.id).length])) as Record<StatusFilter, number>,
    kind: Object.fromEntries(KIND_FILTERS.map((item) => [item, item === 'all' ? items.length : items.filter((row) => row.kind === item).length])) as Record<KindFilter, number>,
  }), [items])

  const visible = items.filter((item) => (status === 'all' || item.status === status) && (kind === 'all' || item.kind === kind))
  const selected = routeItemId ?? picked
  const current = items.find((item) => item.id === selected) ?? visible[0] ?? null

  useEffect(() => {
    if (!current || !source) return
    reportScene({
      layer: null,
      record: {
        source,
        goal: null,
        todayPlan: null,
        pendingCount: items.filter((item) => item.status === 'pending').length,
        selectedItem: {
          id: current.id,
          kind: current.kind,
          title: current.title,
          status: current.status,
          identity: { what: current.identity.what, about: current.identity.about },
        },
        mastery: null,
        stats: null,
      },
    })
  }, [current, items, reportScene, source])

  const goalTitle = new Map(goals.map((goal) => [goal.id, goal.title]))

  return (
    <section className="ub ub-lib">
      {source === 'mock' && <span className="ub-sample">示例数据</span>}
      <header className="ub-head">
        <div>
          <p className="ub-eyebrow">资料 · 智能体整理</p>
          <h1>你丢进来的 {items.length} 份资料</h1>
          <p className="ub-meta">
            已整理 {counts.status.done} · 整理中 {counts.status.organizing} · 待确认 {counts.status.pending}
            {organizerBy && <> · {organizerPhrase(organizerBy)}{organizerBy.mock && <span className="ub-tag mock">模拟</span>}</>}
          </p>
        </div>
        <div>
          <div className="ub-seg" aria-label="按状态">
            {STATUS_FILTERS.map((item) => (
              <button key={item.id} type="button" className={status === item.id ? 'on' : undefined} onClick={() => setStatus(item.id)}>
                {item.label}<em>{counts.status[item.id] ?? 0}</em>
              </button>
            ))}
          </div>
          <div className="ub-seg" aria-label="按类型" style={{ marginTop: 6 }}>
            {KIND_FILTERS.map((item) => (
              <button key={item} type="button" className={kind === item ? 'on' : undefined} onClick={() => setKind(item)}>
                {item === 'all' ? '全部类型' : kindLabel(item)}<em>{counts.kind[item] ?? 0}</em>
              </button>
            ))}
          </div>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && !error && (
        <div className="ub-empty">
          <h1>还没有资料</h1>
          <p>可以贴视频链接、丢一段想法。笔记文件夹本轮走命令行编译。文章和 PDF 还不能收。</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="ub-lib-body">
          <div className="ub-listbox">
            {visible.length === 0 && <p className="ub-note">这个筛选下是 0 份。文章和 PDF 入口先占着，本轮不能新增。</p>}
            {visible.map((item) => {
              const titles = item.goalIds.map((id) => goalTitle.get(id)).filter((title): title is string => Boolean(title))
              const copy = statusCopy({
                status: item.status,
                kind: item.kind,
                conceptCount: item.conceptCount,
                goalTitles: titles,
                pipelineState: item.pipeline.state,
                pipelineReason: item.pipeline.reason,
                attachLabel: attachLabels[`item:${item.id}`] ?? null,
              })
              return (
                <button key={item.id} type="button" className={item.id === current?.id ? 'ub-mrow on' : 'ub-mrow'} onClick={() => { setPicked(item.id); navigate({ view: 'library', itemId: item.id }) }}>
                  <span className="ic">{kindLabel(item.kind).slice(0, 1)}</span>
                  <span className="tt ub-clip">{item.title}</span>
                  <span className={`ub-stp ${item.status === 'organizing' ? 'run' : item.status === 'pending' ? 'pend' : item.status === 'failed' ? 'bad' : 'done'}`}>
                    {item.status === 'organizing' && <i className="ub-spin" />}
                    {item.status === 'organizing' ? '整理中' : item.status === 'pending' ? '待确认' : item.status === 'failed' ? '失败' : '已整理'}
                  </span>
                  <span className="id">识别为 <b>{kindLabel(item.kind)}</b> · {item.identity.what}</span>
                  <span className="gl">
                    {titles.map((title) => {
                      const goal = goals.find((row) => row.title === title)
                      return <span key={title}><i className="ub-gdot" style={{ background: goal ? goalSwatch(goal.colorKey) : 'var(--amber)' }} />{title}</span>
                    })}
                    <span>{item.conceptCount} 个概念</span>
                    <span>{formatDay(item.addedAt.slice(0, 10))}</span>
                    <span className="ub-clip">{copy}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {current && (
            <Detail
              key={current.id}
              client={client}
              itemId={current.id}
              goals={goals}
              onChanged={() => setTick((value) => value + 1)}
              onPanorama={(goalId) => navigate({ view: 'panorama', goalId })}
              onDive={(topicId, conceptId) => navigate({ view: 'star-dive', topicId, conceptId })}
              onAdjust={(changeLogId) => openAdjust({ changeLogId, itemId: current.id })}
            />
          )}
        </div>
      )}
    </section>
  )
}

function Detail({
  client, itemId, goals, onChanged, onPanorama, onDive, onAdjust,
}: {
  client: ViewProps['client']
  itemId: string
  goals: Goal[]
  onChanged: () => void
  onPanorama: (goalId?: string) => void
  onDive: (topicId: string, conceptId: string | null) => void
  onAdjust: (changeLogId?: string) => void
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [rows, setRows] = useState<ConceptRow[]>([])
  const [notePath, setNotePath] = useState<string | null>(null)
  const [panorama, setPanorama] = useState<Panorama | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [goalPick, setGoalPick] = useState<string[]>([])
  const [starPick, setStarPick] = useState<string>('')
  const [poll, setPoll] = useState(0)
  // 视频整理在后台异步推进：进行中每 4 秒刷新详情，读真实进度。
  const videoBusy = detail?.kind === 'video' && (detail.pipeline.state === 'queued' || detail.pipeline.state === 'running')
  useEffect(() => {
    if (!videoBusy) return
    const timer = setInterval(() => setPoll((v) => v + 1), 4000)
    return () => clearInterval(timer)
  }, [videoBusy])

  useEffect(() => {
    let live = true
    client.getItem(itemId).then(async (env) => {
      if (!live) return
      setDetail(env.data)
      setGoalPick(env.data.goalIds)
      const topicId = env.data.topicId
      const [topic, map] = await Promise.all([
        topicId ? client.getTopicLearn(topicId).catch(() => null) : Promise.resolve(null),
        client.getPanorama().catch(() => null),
      ])
      if (!live) return
      if (map) setPanorama(map.data)
      const learned = conceptsOf(env.data, topic?.data ?? null)
      setRows(learned.rows)
      setNotePath(learned.notePath)
    }, (reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : '这份资料没有打开')
    })
    return () => { live = false }
  }, [client, itemId, poll])

  if (error) return <p role="alert">{error}</p>
  if (!detail) return <p className="ub-note">正在打开这份资料…</p>
  const assignment = detail.assignments[0]
  const pending = detail.status === 'pending'
  const membershipChanged = goalPick.length !== detail.goalIds.length || goalPick.some(id=>!detail.goalIds.includes(id))
  const groups = groupRows(rows)
  const stars = panorama?.topics.flatMap((topic) => topic.groups.flatMap((group) => group.concepts.map((concept) => ({
    ref: `concept:${topic.topicId}/${concept.id}` as SubjectRef,
    label: `${topic.title} · ${concept.label}`,
  })))) ?? []

  async function write(override: Override) {
    try {
      await client.addOverride(override)
      onChanged()
      const next = await client.getItem(itemId)
      setDetail(next.data)
      setGoalPick(next.data.goalIds)
    } catch (reason) {setError(reason instanceof Error?reason.message:'修正没有保存')}
  }

  function base(op: Override['op'], value: Override['value'], target: SubjectRef = `item:${detail!.id}`): Override {
    return { id: crypto.randomUUID(), at: new Date().toISOString(), target, op, value, reason: null } as Override
  }

  const about = describeAbout(detail)

  return (
    <article className="ub-detail ub-glass">
      <p className="ub-row">
        <span className="ub-tag">{kindLabel(detail.kind)}</span>
        <span className={`ub-stp ${detail.status === 'pending' ? 'pend' : detail.status === 'failed' ? 'bad' : detail.status === 'organizing' ? 'run' : 'done'}`}>{({organizing:'整理中',pending:'待确认',done:'已整理',failed:'失败'})[detail.status]}</span>
        {detail.identity.by.mock && <span className="ub-tag mock">模拟</span>}
        <span className="ub-muted">{formatDay(detail.addedAt.slice(0, 10))} 丢进来</span>
      </p>
      <h2>{detail.title}</h2>
      <p className="ub-meta">{detail.ref.url ?? detail.ref.text ?? ''}</p>
      <section className="ub-blk">
        <p className="ub-eyebrow">智能体识别</p>
        <dl className="ub-kv">
          <dt>是什么</dt><dd>{detail.identity.what}</dd>
          <dt>讲什么</dt><dd>{about}</dd>
          <dt>学习路线</dt><dd>{detail.identity.route ?? '笔记里没有路线'}</dd>
          <dt>和已有的</dt><dd>{detail.identity.relation ?? '还没有写出和别的资料的关系'}</dd>
        </dl>
      </section>
      <section>
        <p className="ub-eyebrow">整理过程</p>
        <div className="ub-flow">
          {PIPELINE_STEPS.map((key) => {
            const step = detail.pipeline.steps.find((item) => item.key === key)
            const skipped = detail.kind === 'idea' && key === 'extract'
            const state = skipped ? 'x' : step?.state ?? 'pending'
            const mark = state === 'done' ? 'd' : state === 'running' ? 'w' : state === 'failed' ? 'p' : 'p'
            return (
              <div key={key} className={`s ${mark}`}>
                <i />
                <b>{stepLabel(key)}</b>
                <span>{skipped ? '不适用' : step?.note || ({pending:'尚未开始',running:'处理中',done:'完成',skipped:'不适用',failed:'失败'} as Record<string,string>)[state] || state}</span>
              </div>
            )
          })}
        </div>
      </section>
      {detail.kind === 'idea'
        ? (
          <section>
            <p className="ub-eyebrow">挂接</p>
            <p className="ub-note">想法不拆成新概念，只挂到已有的星。</p>
            <label className="ub-meta">
              挂到
              <select aria-label="挂到" value={starPick} onChange={(event) => setStarPick(event.target.value)}>
                <option value="">选一颗星</option>
                {stars.map((star) => <option key={star.ref} value={star.ref}>{star.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="ub-btn pri"
              disabled={!starPick}
              onClick={() => void write(base('attach_idea', { conceptRef: starPick as SubjectRef }))}
            >挂上去</button>
          </section>
        )
        : (
          <section>
            <p className="ub-eyebrow">归属</p>
            <div className="ub-row" style={{ flexWrap: 'wrap' }}>
              {goals.map((goal) => {
                const on = goalPick.includes(goal.id)
                return (
                  <button
                    key={goal.id}
                    type="button"
                    className={on ? `ub-chip on ${goal.colorKey === 'cyan' ? 'cy' : ''}` : 'ub-chip'}
                    onClick={() => setGoalPick((current) => on ? current.filter((id) => id !== goal.id) : [...current, goal.id])}
                  >
                    <i className="ub-gdot" style={{ background: goalSwatch(goal.colorKey) }} />{goal.title}
                  </button>
                )
              })}
            </div>
            {assignment && (
              <p className="ub-note">
                置信度 {assignment.confidence.toFixed(2)} · {assignment.reason}
                {' · '}{organizerPhrase(assignment.by)}
                {assignment.by.mock && <span className="ub-tag mock">模拟</span>}
                {assignment.autoAccepted && ' · 高于阈值 0.85，已自动接受；随时可以改'}
              </p>
            )}
            {(pending || membershipChanged) && (
              <div className="ub-row">
                <button type="button" className="ub-btn pri" onClick={() => void saveAssignment(assignment, goalPick, write, base)}>按这样保存</button>
                <button type="button" className="ub-btn" onClick={() => onAdjust(assignment?.changeLogId)}>看这次整理的全部 {detail.assignments.length} 处</button>
              </div>
            )}
          </section>
        )}
      <section>
        <p className="ub-eyebrow">抽出的概念 · {rows.length}</p>
        {groups.map((group) => (
          <div key={group.name} className="ub-cgrp">
            <small>{group.name}</small>
            {group.rows.map((row) => (
              <span key={row.id}>
                <button type="button" className={row.hidden ? 'ub-cchip hide' : 'ub-cchip'} onClick={() => setMenu(menu === row.id ? null : row.id)}>
                  <i className="ub-gdot" style={{ background: masteryColor(row.level) }} />
                  {row.label}
                  {row.renamed && <span className="ub-tag user">你改过</span>}
                  {row.pinned && <span className="ub-tag user">你置顶</span>}
                </button>
                {menu === row.id && detail.topicId && (
                  <span className="ub-menu">
                    <button type="button" className="ub-btn sm" onClick={() => {
                      const label = window.prompt('改成什么名字', row.label)
                      if (!label || !detail.topicId) return
                      void write(base('rename', { label }, `concept:${detail.topicId}/${row.id}`))
                    }}>改名</button>
                    <button type="button" className="ub-btn sm" onClick={() => void write(base('hide', { hidden: !row.hidden }, `concept:${detail.topicId}/${row.id}`))}>{row.hidden ? '取消隐藏' : '隐藏'}</button>
                    <button type="button" className="ub-btn sm" onClick={() => void write(base('reassign', { goalIds: goalPick }))}>改所属资料归属</button>
                    <button type="button" className="ub-btn sm" onClick={() => {
                      const next = row.pinned === 3 ? null : ((row.pinned ?? 0) + 1) as 1 | 2 | 3
                      void write(base('pin_importance', { level: next }, `concept:${detail.topicId}/${row.id}`))
                    }}>置顶重要性</button>
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}
        {detail.orphaned.length > 0 && (
          <div>
            <p className="ub-eyebrow">落空的修正</p>
            {detail.orphaned.map((override) => (
              <p key={override.id} className="ub-note">{override.op} · {override.target} · 原笔记里已经没有这个对象</p>
            ))}
          </div>
        )}
      </section>
      {detail.status === 'failed' && (
        <p className="ub-note">失败：{detail.pipeline.reason ?? '没有写出原因'}</p>
      )}
      <div className="ub-foot">
        <button type="button" className="ub-btn" onClick={() => onPanorama(detail.goalIds[0])}>在全景中看</button>
        {detail.topicId && <button type="button" className="ub-btn" onClick={() => onDive(detail.topicId!, null)}>潜航</button>}
        {detail.topicId
          ? <a className="ub-btn" href={`#/notes/${encodeURIComponent(detail.topicId)}`}>打开笔记</a>
          : <span className="ub-note">打开原笔记：{notePath ?? '这份资料还没有生成笔记'}</span>}
        <button type="button" className="ub-btn" disabled={detail.kind === 'video' ? detail.pipeline.state === 'running' : !['notes','idea'].includes(detail.kind)} onClick={() => void client.organizeItem(detail.id).then(onChanged).catch(reason=>setError(reason instanceof Error?reason.message:'重新整理失败'))}>重新整理</button>
        {detail.changeLogIds[0] && (
          <button type="button" className="ub-btn" onClick={() => void client.undoChangeLog(detail.changeLogIds[0]).then(onChanged).catch(reason=>setError(reason instanceof Error?reason.message:'撤销失败'))}>撤销这次整理</button>
        )}
        {detail.status === 'failed' && (
          <button type="button" className="ub-btn" onClick={() => void write(base('reassign', { goalIds: [] }))}>先放未归属</button>
        )}
      </div>
    </article>
  )
}

async function saveAssignment(
  assignment: Assignment | undefined,
  goalIds: string[],
  write: (override: Override) => Promise<void>,
  base: (op: Override['op'], value: Override['value']) => Override,
) {
  if (assignment?.state === 'proposed' && goalIds.length === 1 && goalIds[0] === assignment.goalId && !assignment.autoAccepted) {
    await write(base('accept_assignment', { assignmentId: assignment.id }))
    return
  }
  await write(base('reassign', { goalIds }))
}

function describeAbout(detail: ItemDetail): string {
  if (detail.kind === 'video' && (detail.pipeline.state === 'queued' || detail.pipeline.state === 'running')) {
    if (detail.pipeline.state === 'queued') return detail.pipeline.reason || '排队中：整理开始后自动解析'
    return '正在读字幕、生成笔记，读完后写，不先猜'
  }
  return detail.identity.about ?? '还没有一句话总结'
}

function conceptsOf(detail: ItemDetail, topic: TopicLearn | null): { rows: ConceptRow[]; notePath: string | null } {
  const overlay = topic?.overlay
  const learn = topic?.learn
  const notePath = readNote(learn) ?? (detail.ref.topicId ? `${detail.ref.topicId}/` : null)
  if (detail.groups.length > 0) {
    return {
      notePath,
      rows: detail.groups.flatMap((group) => group.concepts.map((concept) => ({
        id: concept.id,
        label: overlay?.renames[concept.id] ?? concept.label,
        group: group.name,
        level: overlay?.mastery.find((row) => row.subject.endsWith(`/${concept.id}`))?.level ?? 0,
        hidden: overlay?.hidden.includes(concept.id) ?? false,
        pinned: overlay?.pins[concept.id] ?? null,
        renamed: concept.overridden || Boolean(overlay?.renames[concept.id]),
      }))),
    }
  }
  const concepts = readConcepts(learn)
  return {
    notePath,
    rows: concepts.map((concept) => ({
      id: concept.id,
      label: overlay?.renames[concept.id] ?? concept.label,
      group: concept.group ?? '未分组',
      level: overlay?.mastery.find((row) => row.subject.endsWith(`/${concept.id}`))?.level ?? 0,
      hidden: overlay?.hidden.includes(concept.id) ?? false,
      pinned: overlay?.pins[concept.id] ?? null,
      renamed: Boolean(overlay?.renames[concept.id]),
    })),
  }
}

function readConcepts(learn: TopicLearn['learn'] | undefined): { id: string; label: string; group: string | null }[] {
  if (!learn || typeof learn !== 'object' || Array.isArray(learn)) return []
  const concepts = learn.concepts
  if (!Array.isArray(concepts)) return []
  return concepts.flatMap((concept) => {
    if (!concept || typeof concept !== 'object' || Array.isArray(concept)) return []
    const id = concept.id
    const label = concept.label
    if (typeof id !== 'string' || typeof label !== 'string') return []
    const group = typeof concept.group === 'string' ? concept.group : null
    return [{ id, label, group }]
  })
}

function readNote(learn: TopicLearn['learn'] | undefined): string | null {
  if (!learn || typeof learn !== 'object' || Array.isArray(learn)) return null
  const concepts = learn.concepts
  if (!Array.isArray(concepts)) return null
  const first = concepts.find((concept) => concept && typeof concept === 'object' && !Array.isArray(concept) && typeof concept.note === 'string')
  if (!first || typeof first !== 'object' || Array.isArray(first) || typeof first.note !== 'string') return null
  return first.note
}

function groupRows(rows: ConceptRow[]): { name: string; rows: ConceptRow[] }[] {
  const map = new Map<string, ConceptRow[]>()
  for (const row of rows) {
    const list = map.get(row.group) ?? []
    list.push(row)
    map.set(row.group, list)
  }
  return [...map.entries()].map(([name, grouped]) => ({ name, rows: grouped }))
}

function masteryColor(level: 0 | 1 | 2 | 3): string {
  if (level >= 3) return '#ffb547'
  if (level === 2) return 'rgba(255,181,71,.7)'
  if (level === 1) return 'rgba(255,255,255,.55)'
  return 'rgba(255,255,255,.25)'
}
