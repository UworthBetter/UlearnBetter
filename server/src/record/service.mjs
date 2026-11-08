/**
 * Record-layer service: everything behind /api/record/*. Routes only parse
 * HTTP and call into here; derived data is computed from the store and the
 * topic index on each call through the single overlay implementation.
 */

import { createStore } from './store.mjs'
import { createTopicIndex } from './topics.mjs'
import { createTopicNotes, NotesError } from './topic-notes.mjs'
import { buildOverlay } from './derive/overlay.mjs'
import { buildView } from './derive/view.mjs'
import { computeToday, todayIn } from './derive/today.mjs'
import { computeStats } from './derive/stats.mjs'
import { computePanorama, relationCandidates, topicGroups } from './derive/panorama.mjs'
import { masteryFromFacts, collectFacts } from './derive/mastery.mjs'
import { checklistState } from './derive/view.mjs'
import { createOrganizer } from './organizers/index.mjs'
import { filterRejected } from './organizers/common.mjs'
import { createVideoPipeline, queuedPipeline, runningPipeline, failedPipeline } from './video.mjs'
import { validate } from './schemas.mjs'
import { canonicalJson, isId, newId, parseRef, ref } from './ids.mjs'

export class RecordError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'RecordError'
    this.status = status
    this.code = code
  }
}

const COLOR_KEYS = ['amber', 'cyan', 'violet']
const SYSTEM_BY = { kind: 'component', name: 'record', version: '0.1', model: null, promptVersion: null, mock: false }
const MAX_IDEA = 1000
const MAX_URL = 2000

const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')))

/**
 * @param {object} cfg       loadRecordConfig result
 * @param {object} [opts]
 * @param {() => Date} [opts.now]
 * @param {object} [opts.llm] {model, modelName, reason} for the llm organizer
 * @param {object} [opts.organizer] inject an organizer instance (tests)
 */
export function createRecordService(cfg, opts = {}) {
  const now = opts.now || (() => new Date())
  const nowIso = () => now().toISOString()
  const store = createStore(cfg.dataDir)
  const topics = createTopicIndex(cfg.learnDir)
  const topicNotes = createTopicNotes({ notesDir: cfg.notesDir })
  let organizer = null
  let organizerError = null
  if (!cfg.error) {
    try {
      organizer = opts.organizer || createOrganizer(cfg.organizer, opts.llm)
    } catch (err) {
      organizerError = err.message
    }
  }
  const video = createVideoPipeline({ llm: opts.llm || null, learnDir: cfg.learnDir, dataDir: cfg.dataDir })
  let loaded = false
  let loadError = null
  const st = store.state

  // ---------------------------------------------------------------- helpers

  function overlay() {
    return buildOverlay({
      overrides: st.overrides,
      topics,
      goals: st.goals,
      items: st.items,
      assignments: st.derived.assignments,
    })
  }

  function view(tz, until) {
    return buildView({ state: st, topics: topics.list(), overlay: overlay(), tz, until })
  }

  function requireReady() {
    if (cfg.error || organizerError) throw new RecordError(503, 'record_misconfigured', cfg.error || organizerError)
    if (!loaded) throw new RecordError(503, 'record_not_ready', loadError || '记录层尚未加载')
  }

  function findItem(id) {
    if (!isId(id)) throw new RecordError(400, 'invalid_id', '资料 ID 不合法')
    const item = st.items.find((i) => i.id === id)
    if (!item) throw new RecordError(404, 'not_found', '资料不存在')
    return item
  }

  function goalTitle(id) {
    return st.goals.find((g) => g.id === id)?.title ?? id
  }

  function pendingAssignments(ov) {
    return st.derived.assignments.filter((a) => !a._superseded && a.goalId
      && ov.assignmentState(a) === 'proposed'
      && st.goals.some((g) => g.id === a.goalId)
      && !ov.hasReassign(parseRef(a.subject)?.itemId)
      && st.items.some((i) => `item:${i.id}` === a.subject))
  }

  function pendingGoalProposals() {
    return st.derived.goalProposals.filter((p) => !p._superseded && !p._dismissed && !p._confirmedGoalId)
  }

  function pendingIdeaAttachments(ov) {
    return st.derived.ideaAttachments.filter((x) => !x._superseded && !x._dismissed
      && !ov.attachment(parseRef(x.subject)?.itemId)
      && st.items.some((i) => `item:${i.id}` === x.subject))
  }

  function outAssignment(a, ov) {
    return { ...strip(a), state: ov.assignmentState(a) }
  }

  function outLog(log, ov) {
    const byId = new Map(st.derived.assignments.map((a) => [a.id, a]))
    return {
      ...strip(log),
      changes: log.changes.map((c) => ({ ...c, state: byId.has(c.assignmentId) ? ov.assignmentState(byId.get(c.assignmentId)) : c.state })),
    }
  }

  // ------------------------------------------------------------- item view

  function notesPipeline(item, entry) {
    if (!entry) {
      return {
        state: 'failed',
        steps: [
          { key: 'read', state: 'failed', note: `RECORD_LEARN_DIR 中找不到主题「${item.topicId}」的编译产物` },
          { key: 'identify', state: 'pending', note: '' },
          { key: 'extract', state: 'pending', note: '' },
          { key: 'classify', state: item.classify?.state || 'pending', note: item.classify?.note || '' },
          { key: 'compile', state: 'failed', note: '编译产物缺失' },
        ],
        reason: '编译产物不在 RECORD_LEARN_DIR 中',
      }
    }
    const m = entry.manifest
    const classify = item.classify || { state: 'pending', note: '尚未整理' }
    return {
      state: classify.state === 'failed' ? 'failed' : classify.state === 'running' ? 'running' : 'done',
      steps: [
        { key: 'read', state: 'done', note: '读取编译产物 learn.json / manifest.json' },
        { key: 'identify', state: 'done', note: m.identity.about ? '取自学习主页的一句话总结' : '学习主页没有一句话总结' },
        { key: 'extract', state: 'done', note: `${m.counts.concepts} 个概念 · ${m.counts.procedures} 份实操清单` },
        { key: 'classify', state: classify.state, note: classify.note },
        { key: 'compile', state: 'done', note: item.compileNote || `编译器 ${m.compilerVersion}，生成于 ${m.generatedAt}` },
      ],
      reason: classify.state === 'failed' ? `归类失败：${classify.note}` : null,
    }
  }

  function itemView(item, ov, pending) {
    const base = {
      id: item.id, kind: item.kind, title: item.title, addedAt: item.addedAt, ref: { ...item.ref },
      contentHash: item.contentHash ?? null, topicId: item.topicId ?? null,
    }
    const subject = ref.item(item.id)
    const goalIds = ov.itemGoalIds(item.id)
    if (item.kind === 'notes') {
      const entry = topics.get(item.topicId)
      const pipeline = notesPipeline(item, entry)
      const hasPending = pending.assignments.some((a) => a.subject === subject)
        || pending.goalProposals.some((p) => p.fromSubjects.includes(subject))
      const m = entry?.manifest
      const visibleConcepts = entry ? m.concepts.filter((c) => !ov.hidden(ref.concept(item.topicId, c.id))).length : 0
      return {
        ...base,
        title: entry ? ov.label(ref.topic(item.topicId), m.topic.title) : item.title,
        pipeline,
        status: pipeline.state === 'failed' ? 'failed' : pipeline.state === 'running' ? 'organizing' : hasPending ? 'pending' : 'done',
        identity: {
          what: m?.identity.what || '课程笔记',
          about: m?.identity.about ?? null,
          route: m?.identity.route ?? null,
          relation: null,
          by: m ? { kind: 'compiler', name: 'learning-notes-compiler', version: m.compilerVersion, model: null, promptVersion: null, mock: false } : { ...SYSTEM_BY },
        },
        goalIds,
        conceptCount: visibleConcepts,
      }
    }
    if (item.kind === 'idea') {
      const attached = ov.attachment(item.id)
      let relation = null
      if (attached) {
        const r = parseRef(attached)
        const concept = topics.get(r.topicId)?.concepts.get(r.conceptId)
        relation = `挂到「${ov.label(attached, concept?.label ?? r.conceptId)}」`
      }
      const classify = item.classify || { state: 'pending', note: '尚未整理' }
      const pipeline = {
        state: classify.state === 'failed' ? 'failed' : 'done',
        steps: [
          { key: 'read', state: 'done', note: '保存想法原文' },
          { key: 'identify', state: 'done', note: '想法' },
          { key: 'extract', state: 'skipped', note: '想法不拆成新概念' },
          { key: 'classify', state: classify.state, note: classify.note },
          { key: 'compile', state: 'skipped', note: '不适用' },
        ],
        reason: classify.state === 'failed' ? `整理失败：${classify.note}` : null,
      }
      return {
        ...base,
        pipeline,
        status: pipeline.state === 'failed' ? 'failed' : attached ? 'done' : 'pending',
        identity: { what: '想法', about: null, route: null, relation, by: { ...SYSTEM_BY } },
        goalIds,
        conceptCount: 0,
      }
    }
    // video: pipeline state is real once organize has run; before that it sits queued.
    const pipeline = item.pipeline || queuedPipeline()
    const entry = item.topicId ? topics.get(item.topicId) : null
    const m = entry?.manifest
    const visibleConcepts = entry ? m.concepts.filter((c) => !ov.hidden(ref.concept(item.topicId, c.id))).length : 0
    return {
      ...base,
      pipeline: { ...pipeline, steps: (pipeline.steps || []).map((s) => ({ ...s })) },
      status: pipeline.state === 'failed' ? 'failed' : pipeline.state === 'done' ? 'done' : 'organizing',
      identity: {
        what: entry ? '视频课程' : '视频链接',
        about: item.about ?? m?.identity.about ?? null,
        route: m?.identity.route ?? null,
        relation: null,
        by: pipeline.state === 'done' ? { ...item.videoMeta?.by, mock: false } : { ...SYSTEM_BY },
      },
      goalIds,
      conceptCount: visibleConcepts,
    }
  }

  function pendingSets(ov) {
    return { assignments: pendingAssignments(ov), goalProposals: pendingGoalProposals(), ideaAttachments: pendingIdeaAttachments(ov) }
  }

  // ------------------------------------------------------------- organize

  function conceptCatalog(ov) {
    const out = []
    for (const entry of topics.list()) {
      const title = ov.label(ref.topic(entry.topicId), entry.manifest.topic.title)
      for (const c of entry.manifest.concepts) {
        const subject = ref.concept(entry.topicId, c.id)
        if (ov.hidden(subject)) continue
        out.push({ ref: subject, label: ov.label(subject, c.label), topicTitle: title })
      }
    }
    return out
  }

  function requestItem(item, ov) {
    const subject = ref.item(item.id)
    if (item.kind === 'notes') {
      const entry = topics.get(item.topicId)
      if (!entry) return null
      const m = entry.manifest
      return {
        subject,
        kind: 'notes',
        title: ov.label(ref.topic(item.topicId), m.topic.title),
        about: m.identity.about ?? null,
        folderHint: m.folderHint ?? null,
        conceptLabels: m.concepts.filter((c) => !ov.hidden(ref.concept(item.topicId, c.id)))
          .slice(0, 30).map((c) => ov.label(ref.concept(item.topicId, c.id), c.label)),
      }
    }
    if (item.kind === 'idea') {
      return { subject, kind: 'idea', title: item.ref.text, about: null, folderHint: null, conceptLabels: [] }
    }
    // A video item whose pipeline compiled a topic behaves like notes input
    // for assignment purposes: the organizer classifies it into goals.
    if (item.kind === 'video' && item.topicId && topics.get(item.topicId)) {
      const m = topics.get(item.topicId).manifest
      return {
        subject,
        kind: 'notes',
        title: item.title,
        about: item.about ?? m.identity.about ?? null,
        folderHint: null,
        conceptLabels: m.concepts.slice(0, 30).map((c) => ov.label(ref.concept(item.topicId, c.id), c.label)),
      }
    }
    return null
  }

  /** Must be called inside store.exclusive. */
  async function organizeLocked(itemIds, trigger) {
    const ov = overlay()
    const targets = itemIds.map((id) => st.items.find((i) => i.id === id)).filter(Boolean)
    const reqItems = targets.map((i) => requestItem(i, ov)).filter(Boolean)
    const subjects = new Set(reqItems.map((i) => i.subject))
    const request = {
      schema: 'learning.organize/0.1',
      items: reqItems,
      goals: st.goals.filter((g) => g.status === 'active').map((g) => ({ id: g.id, title: g.title, intent: g.intent, folders: [...g.folders] })),
      decisions: ov.decisionsFor([...subjects]),
      options: { allowGoalProposals: true },
    }
    const at = nowIso()
    const logId = newId('log')
    const warnings = []
    let response = null
    let failure = null
    try {
      const raw = await organizer.organize(request, { conceptCatalog: conceptCatalog(ov) })
      const { usage, ...rest } = raw || {}
      const check = validate('organize-response', rest)
      if (!check.ok) failure = `组件输出不符合 learning.organize/0.1：${check.message}`
      else response = rest
    } catch (err) {
      failure = err?.message || '组件调用失败'
    }

    const items = st.items.map((i) => ({ ...i }))
    const derived = {
      assignments: st.derived.assignments.map((a) => ({ ...a })),
      goalProposals: st.derived.goalProposals.map((p) => ({ ...p })),
      ideaAttachments: st.derived.ideaAttachments.map((x) => ({ ...x })),
    }
    const changes = []
    if (failure) {
      warnings.push(failure)
      for (const item of items) {
        if (subjects.has(ref.item(item.id))) item.classify = { state: 'failed', note: failure }
      }
    } else {
      warnings.push(...response.warnings)
      const filtered = filterRejected(response, request.decisions)
      if (filtered.dropped) warnings.push(`已过滤 ${filtered.dropped} 条用户拒绝过的归属`)
      const res = filtered.response
      // Supersede undecided proposals for these subjects; decisions stay.
      for (const a of derived.assignments) {
        if (subjects.has(a.subject) && !a._superseded && ov.assignmentState(a) === 'proposed') a._superseded = logId
      }
      for (const p of derived.goalProposals) {
        if (!p._superseded && !p._confirmedGoalId && p.fromSubjects.some((s) => subjects.has(s))) p._superseded = logId
      }
      for (const x of derived.ideaAttachments) {
        if (subjects.has(x.subject) && !x._superseded) x._superseded = logId
      }
      const accepted = new Map(request.decisions.accepted.map((d) => [d.subject, d.goalIds]))
      const seen = new Set()
      let autoCount = 0
      let proposedCount = 0
      for (const a of res.assignments) {
        if (!subjects.has(a.subject)) { warnings.push(`丢弃：${a.subject} 不在本次整理范围`); continue }
        const itemId = parseRef(a.subject).itemId
        if (ov.hasReassign(itemId)) continue
        if (a.goalId && (accepted.get(a.subject) || []).includes(a.goalId)) continue
        if (a.goalId && !request.goals.some((g) => g.id === a.goalId)) { warnings.push(`丢弃：未知目标 ${a.goalId}`); continue }
        const key = `${a.subject}|${a.goalId}`
        if (seen.has(key)) continue
        seen.add(key)
        const auto = Boolean(a.goalId) && a.confidence >= cfg.autoAccept
        const row = {
          id: newId('a'), subject: a.subject, goalId: a.goalId, confidence: a.confidence, reason: a.reason,
          evidence: a.evidence, by: { ...res.organizer }, state: auto ? 'accepted' : 'proposed', autoAccepted: auto,
          changeLogId: logId, createdAt: at,
        }
        derived.assignments.push(row)
        if (auto) autoCount++
        else if (a.goalId) proposedCount++
        const conf = a.confidence.toFixed(2)
        changes.push({
          assignmentId: row.id,
          state: row.state,
          summary: !a.goalId ? `没有合适的目标（置信度 ${conf}）`
            : auto ? `已自动接受：归入「${goalTitle(a.goalId)}」（置信度 ${conf} ≥ ${cfg.autoAccept}）`
              : `建议归入「${goalTitle(a.goalId)}」（置信度 ${conf}）`,
        })
      }
      for (const p of res.goalProposals) {
        derived.goalProposals.push({ id: newId('gp'), title: p.title, intent: p.intent, reason: p.reason, fromSubjects: p.fromSubjects.filter((s) => subjects.has(s)), _changeLogId: logId, _by: { ...res.organizer } })
      }
      for (const x of res.ideaAttachments) {
        if (!subjects.has(x.subject)) continue
        derived.ideaAttachments.push({ id: newId('ia'), subject: x.subject, conceptRef: x.conceptRef, confidence: x.confidence, reason: x.reason, _changeLogId: logId })
      }
      const name = organizer.label || res.organizer.name
      const extra = [
        `${autoCount + proposedCount} 条归属提议`,
        autoCount ? `${autoCount} 条已自动接受（≥ ${cfg.autoAccept}）` : null,
        res.goalProposals.length ? `${res.goalProposals.length} 个目标提议` : null,
        res.ideaAttachments.length ? `${res.ideaAttachments.length} 条挂载提议` : null,
      ].filter(Boolean).join('，')
      for (const item of items) {
        if (!subjects.has(ref.item(item.id))) continue
        const ideaNote = res.ideaAttachments.some((x) => x.subject === ref.item(item.id))
          ? `${name}：有挂载提议，等你确认`
          : `${name}：没有挂载提议，等你选一颗星`
        item.classify = { state: 'done', note: item.kind === 'idea' ? ideaNote : `${name}：${extra}` }
      }
    }
    const log = {
      id: logId, at, trigger, organizer: { ...(response?.organizer || organizer.by) }, changes, undone: false,
      _itemIds: targets.map((t) => t.id), _warnings: warnings,
    }
    await store.replace('derived', derived)
    await store.replace('items', items)
    await store.append('changelog', [log])
    return { log, warnings }
  }

  /**
   * Kick off the video pipeline (ingest → model notes → compile → learn dir)
   * for one queued video item. The heavy work runs outside the store lock and
   * reports progress through persisted item patches; assignment proposals are
   * generated afterwards through the normal organize flow.
   */
  async function startVideoOrganize(item) {
    if (!video.ready) throw new RecordError(409, 'not_organizable', video.reason)
    if (item.pipeline?.state === 'running') throw new RecordError(409, 'already_organizing', '这条视频正在整理中')
    await store.exclusive(async () => {
      await store.replace('items', st.items.map((i) => (i.id === item.id ? { ...i, pipeline: runningPipeline() } : i)))
    })
    const run = video.run({ itemId: item.id, url: item.ref.url, prevTopicId: item.topicId ?? null }, {
      async patch(mut) {
        await store.exclusive(async () => {
          await store.replace('items', st.items.map((i) => (i.id === item.id ? mut({ ...i }) : i)))
        })
      },
      async finish(result) {
        await store.exclusive(async () => {
          await store.replace('items', st.items.map((i) => (i.id === item.id
            ? {
                ...i,
                title: result.videoTitle,
                about: result.about,
                topicId: result.topicId,
                videoMeta: {
                  by: result.by,
                  transcriptSource: result.transcriptSource,
                  segmentCount: result.segmentCount,
                  trusted: result.trusted,
                },
                pipeline: { state: 'done', steps: result.steps, reason: null },
              }
            : i)))
          await store.append('changelog', [{
            id: newId('log'), at: nowIso(), trigger: ref.item(item.id), organizer: { ...result.by },
            changes: [{ summary: `视频整理完成：《${result.videoTitle}》（${result.conceptCount} 颗概念）` }],
            undone: false, _itemIds: [item.id], _warnings: [],
          }])
        })
        await topics.refresh()
        // Assignment/goal proposals through the normal organizer; advisory only.
        try {
          await store.exclusive(() => organizeLocked([item.id], ref.item(item.id)))
        } catch { /* proposals are best-effort */ }
      },
      async fail(err) {
        const message = String(err?.message || err || '整理失败').slice(0, 200)
        await store.exclusive(async () => {
          await store.replace('items', st.items.map((i) => (i.id === item.id ? { ...i, pipeline: failedPipeline(message) } : i)))
        })
      },
    })
    // The pipeline reports its own failures through io.fail; this catch only
    // guards against an unexpected crash between fail() and the rethrow.
    run.catch((err) => console.error('[record] video pipeline crashed:', err?.message || err))
    return ['已开始整理：解析字幕 → 生成笔记（模型）→ 编译入库，进度见详情页']
  }

  /**
   * A new or edited goal re-runs the organizer once (one ChangeLog, trigger
   * goal:<id>) over all compiled notes items the user has not reassigned by
   * hand, plus `extraItemIds` (materials cited by a confirmed goal proposal).
   * Accepted assignments are kept; only undecided proposals are replaced.
   * Must be called inside store.exclusive.
   */
  async function reorganizeForGoal(goalId, extraItemIds) {
    const ov = overlay()
    const ids = st.items
      .filter((i) => (i.kind === 'notes' && topics.get(i.topicId) && !ov.hasReassign(i.id))
        || (i.kind === 'video' && i.topicId && topics.get(i.topicId) && !ov.hasReassign(i.id))
        || extraItemIds.includes(i.id))
      .map((i) => i.id)
    if (!ids.length) return []
    return (await organizeLocked(ids, ref.goal(goalId))).warnings
  }

  // ---------------------------------------------------------- topic sync

  async function syncTopics() {
    await topics.refresh()
    const entries = topics.list()
    const missing = entries.filter((e) => !st.items.some((i) => i.kind === 'notes' && i.topicId === e.topicId))
    const changed = entries.filter((e) => st.items.some((i) => i.kind === 'notes' && i.topicId === e.topicId && i.contentHash !== e.manifest.contentHash))
    if (!missing.length && !changed.length) return
    await store.exclusive(async () => {
      const toOrganize = []
      let items = st.items.map((i) => ({ ...i }))
      for (const e of entries) {
        const existing = items.find((i) => i.kind === 'notes' && i.topicId === e.topicId)
        if (!existing) {
          const item = {
            id: newId('i'), kind: 'notes', title: e.manifest.topic.title, addedAt: nowIso(), ref: { topicId: e.topicId },
            contentHash: e.manifest.contentHash, topicId: e.topicId, classify: { state: 'pending', note: '尚未整理' }, compileNote: null,
          }
          items.push(item)
          toOrganize.push(item.id)
        } else if (existing.contentHash !== e.manifest.contentHash) {
          existing.contentHash = e.manifest.contentHash
          existing.compileNote = `笔记已更新：编译器 ${e.manifest.compilerVersion} 于 ${e.manifest.generatedAt} 重新编译，已重新整理（已接受的归属保留）`
          toOrganize.push(existing.id)
        }
      }
      if (!toOrganize.length) return
      await store.replace('items', items)
      items = null
      for (const id of toOrganize) await organizeLocked([id], ref.item(id))
    })
  }

  // ------------------------------------------------------------ public API

  const api = {
    config: cfg,
    get organizer() { return organizer },

    async init() {
      if (cfg.error || organizerError) return
      try {
        await store.load()
        loaded = true
        await syncTopics()
      } catch (err) {
        loadError = `记录层加载失败：${err?.message || err}`
      }
    },

    /** Rescan compiled topics (registers new ones, reorganizes changed ones). */
    async refresh() {
      if (!loaded) return
      await syncTopics()
    },

    health() {
      const t = topics.health()
      const reasons = [cfg.error, organizerError, loadError, t.reason, organizer && !organizer.ready ? organizer.reason : null].filter(Boolean)
      const s = loaded ? store.health() : null
      if (s && (s.corruptFiles.length || Object.keys(s.corruptLines).length)) {
        reasons.push(`数据文件有损坏：${[...s.corruptFiles, ...Object.entries(s.corruptLines).map(([f, n]) => `${f}（${n} 行已跳过）`)].join('、')}`)
      }
      return {
        ready: Boolean(loaded && !cfg.error && !organizerError),
        topics: loaded ? topics.list().length : 0,
        organizer: organizer?.name ?? cfg.organizer,
        reason: reasons.length ? reasons.join('；') : null,
        organizerLabel: organizer?.label ?? null,
        organizerReady: Boolean(organizer?.ready),
        organizerMock: Boolean(organizer?.by.mock),
        autoAccept: cfg.autoAccept,
        learnDirConfigured: Boolean(cfg.learnDir),
        skippedTopics: t.skipped,
        store: s,
      }
    },

    // topics
    listTopics() {
      requireReady()
      const ov = overlay()
      return topics.list().map((e) => ({
        topicId: e.topicId,
        title: ov.label(ref.topic(e.topicId), e.manifest.topic.title),
        conceptCount: e.manifest.concepts.filter((c) => !ov.hidden(ref.concept(e.topicId, c.id))).length,
        generatedAt: e.manifest.generatedAt,
        compilerVersion: e.manifest.compilerVersion,
      }))
    },

    // notes reader (read-only markdown behind a topic)
    async listTopicNotes(topicId) {
      requireReady()
      if (!isId(topicId)) throw new RecordError(400, 'invalid_id', '主题 ID 不合法')
      const entry = topics.get(topicId)
      if (!entry) throw new RecordError(404, 'not_found', '主题不存在')
      const ov = overlay()
      const out = await topicNotes.list(entry)
      return { topicId, title: ov.label(ref.topic(topicId), entry.manifest.topic.title), ...out }
    },

    async readTopicNote(topicId, notePath) {
      requireReady()
      if (!isId(topicId)) throw new RecordError(400, 'invalid_id', '主题 ID 不合法')
      const entry = topics.get(topicId)
      if (!entry) throw new RecordError(404, 'not_found', '主题不存在')
      try {
        return { topicId, ...(await topicNotes.read(entry, notePath)) }
      } catch (err) {
        if (err instanceof NotesError) throw new RecordError(err.status, err.code, err.message)
        throw err
      }
    },

    async getTopicLearn(topicId, tz) {
      requireReady()
      if (!isId(topicId)) throw new RecordError(400, 'invalid_id', '主题 ID 不合法')
      const entry = topics.get(topicId)
      if (!entry) throw new RecordError(404, 'not_found', '主题不存在')
      let learn
      try {
        learn = await topics.readLearn(topicId)
      } catch (err) {
        throw new RecordError(502, 'learn_unreadable', `主题编译产物无法读取：${err.message}`)
      }
      if (!learn) throw new RecordError(404, 'not_found', '主题编译产物不可读')
      const ov = overlay()
      const facts = collectFacts(st.events)
      const renames = {}
      const hidden = []
      const pins = {}
      const mastery = []
      for (const c of entry.manifest.concepts) {
        const subject = ref.concept(topicId, c.id)
        if (ov.renamed(subject)) renames[c.id] = ov.label(subject, c.label)
        if (ov.hidden(subject)) hidden.push(c.id)
        const pin = ov.pin(subject)
        if (pin) pins[c.id] = pin
        mastery.push(masteryFromFacts(subject, facts.get(subject), tz))
      }
      const checks = checklistState(st.events)
      const checklist = {}
      for (const p of entry.manifest.procedures) {
        for (const it of p.items) {
          const s = ref.procitem(topicId, p.id, it.id)
          if (checks.has(s)) checklist[s] = checks.get(s).checked
        }
      }
      const ideas = {}
      const appendIdea = (subject, row) => {
        const parsed = parseRef(subject)
        if (parsed?.kind !== 'concept' || parsed.topicId !== topicId || !entry.concepts.has(parsed.conceptId)) return
        ;(ideas[parsed.conceptId] ||= []).push(row)
      }
      for (const item of st.items) if (item.kind === 'idea') {
        const attached = ov.attachment(item.id)
        if (attached) appendIdea(attached, { itemId: item.id, text: item.ref.text, at: item.addedAt })
      }
      for (const event of st.events) if (event.kind === 'reflection') appendIdea(event.subject, { itemId: null, text: event.text, at: event.at })
      return { learn, overlay: { renames, hidden, pins, mastery, checklist, ideas } }
    },

    // goals
    listGoals() {
      requireReady()
      return st.goals.map((g) => ({ ...g }))
    },

    async createGoal(input) {
      requireReady()
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecordError(422, 'validation_failed', '请求体必须是对象')
      const allowed = new Set(['title', 'intent', 'status', 'origin', 'colorKey', 'folders', 'fromProposalId'])
      for (const k of Object.keys(input)) if (!allowed.has(k)) throw new RecordError(422, 'validation_failed', `不允许的字段：${k}`)
      return store.exclusive(async () => {
        let proposal = null
        if (input.fromProposalId !== undefined) {
          if (!isId(input.fromProposalId)) throw new RecordError(400, 'invalid_id', '提议 ID 不合法')
          proposal = st.derived.goalProposals.find((p) => p.id === input.fromProposalId)
          if (!proposal) throw new RecordError(404, 'not_found', '目标提议不存在')
          if (proposal._confirmedGoalId) throw new RecordError(409, 'already_confirmed', '这个目标提议已经确认过')
          if (proposal._superseded || proposal._dismissed) throw new RecordError(409, 'proposal_closed', '这个目标提议已被新的整理取代或撤销')
        }
        const title = typeof input.title === 'string' ? input.title.trim() : proposal?.title
        if (!title || title.length > 80) throw new RecordError(422, 'validation_failed', '目标标题需要 1–80 个字')
        const goal = {
          id: newId('g'),
          title,
          intent: input.intent === undefined ? (proposal?.intent ?? null) : input.intent,
          status: input.status ?? 'active',
          origin: proposal ? 'proposed' : (input.origin ?? 'user'),
          confirmedAt: nowIso(),
          colorKey: input.colorKey ?? COLOR_KEYS[st.goals.length % COLOR_KEYS.length],
          folders: input.folders ?? [],
        }
        const check = validate('goal', goal)
        if (!check.ok) throw new RecordError(422, 'validation_failed', check.message)
        if (goal.intent && goal.intent.length > 500) throw new RecordError(422, 'validation_failed', 'intent 最多 500 字')
        if (goal.folders.length > 20 || goal.folders.some((f) => f.length > 80)) throw new RecordError(422, 'validation_failed', 'folders 最多 20 个，每个 ≤ 80 字')
        await store.replace('goals', [...st.goals, goal])
        let extra = []
        if (proposal) {
          const derived = { ...st.derived, goalProposals: st.derived.goalProposals.map((p) => (p.id === proposal.id ? { ...p, _confirmedGoalId: goal.id } : p)) }
          await store.replace('derived', derived)
          extra = proposal.fromSubjects.map((s) => parseRef(s)?.itemId).filter(Boolean)
        }
        const warnings = await reorganizeForGoal(goal.id, extra)
        return { goal: { ...goal }, warnings }
      })
    },

    async updateGoal(id, patch) {
      requireReady()
      if (!isId(id)) throw new RecordError(400, 'invalid_id', '目标 ID 不合法')
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new RecordError(422, 'validation_failed', '请求体必须是对象')
      return store.exclusive(async () => {
        const current = st.goals.find((g) => g.id === id)
        if (!current) throw new RecordError(404, 'not_found', '目标不存在')
        const editable = new Set(['title', 'intent', 'status', 'colorKey', 'folders'])
        for (const [k, v] of Object.entries(patch)) {
          if (editable.has(k)) continue
          if (k in current && canonicalJson(current[k]) === canonicalJson(v)) continue
          throw new RecordError(422, 'immutable_field', `字段 ${k} 不能修改`)
        }
        const next = { ...current }
        for (const k of editable) if (k in patch) next[k] = k === 'title' && typeof patch[k] === 'string' ? patch[k].trim() : patch[k]
        const check = validate('goal', next)
        if (!check.ok) throw new RecordError(422, 'validation_failed', check.message)
        if (!next.title || next.title.length > 80) throw new RecordError(422, 'validation_failed', '目标标题需要 1–80 个字')
        await store.replace('goals', st.goals.map((g) => (g.id === id ? next : g)))
        const changed = ['title', 'folders', 'status'].some((k) => canonicalJson(current[k]) !== canonicalJson(next[k]))
        const warnings = changed && next.status === 'active' ? await reorganizeForGoal(id, []) : []
        return { goal: { ...next }, warnings }
      })
    },

    // proposals
    getProposals() {
      requireReady()
      const ov = overlay()
      const v = buildView({ state: st, topics: topics.list(), overlay: ov, tz: 'UTC' })
      return {
        goalProposals: pendingGoalProposals().map((p) => ({ id: p.id, title: p.title, intent: p.intent, reason: p.reason, fromSubjects: [...p.fromSubjects] })),
        assignments: pendingAssignments(ov).map((a) => outAssignment(a, ov)),
        ideaAttachments: pendingIdeaAttachments(ov).map((x) => ({ subject: x.subject, conceptRef: x.conceptRef, confidence: x.confidence, reason: x.reason })),
        relationCandidates: relationCandidates(v, { includeConfirmed: false }),
        autoAccepted: st.derived.assignments
          .filter((a) => a.autoAccepted && ov.assignmentState(a) === 'accepted' && !ov.hasReassign(parseRef(a.subject)?.itemId))
          .map((a) => outAssignment(a, ov)),
      }
    },

    // items
    listItems({ status, kind } = {}) {
      requireReady()
      if (status !== undefined && !['organizing', 'pending', 'done', 'failed'].includes(status)) throw new RecordError(400, 'invalid_query', 'status 无效')
      if (kind !== undefined && !['notes', 'video', 'idea', 'article', 'pdf'].includes(kind)) throw new RecordError(400, 'invalid_query', 'kind 无效')
      const ov = overlay()
      const pending = pendingSets(ov)
      return st.items.map((i) => itemView(i, ov, pending))
        .filter((i) => (!status || i.status === status) && (!kind || i.kind === kind))
        .sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0))
    },

    getItem(id) {
      requireReady()
      const item = findItem(id)
      const ov = overlay()
      const out = itemView(item, ov, pendingSets(ov))
      const subject = ref.item(item.id)
      let groups = []
      if (item.kind === 'notes' && topics.get(item.topicId)) {
        const v = buildView({ state: st, topics: [topics.get(item.topicId)], overlay: ov, tz: 'UTC' })
        if (v.topics[0]) {
          groups = topicGroups(v.topics[0], { includeHidden: true }).map((g) => ({
            name: g.name,
            concepts: g.concepts.map((c) => ({ id: c.id, label: c.label, overridden: ov.touched(c.subject) })),
          }))
        }
      }
      const assignments = st.derived.assignments.filter((a) => a.subject === subject && !a._superseded).map((a) => outAssignment(a, ov))
      const assignmentIds = new Set(st.derived.assignments.filter((a) => a.subject === subject).map((a) => a.id))
      const changeLogIds = st.changelog.filter((l) => l.trigger === subject || (l._itemIds || []).includes(item.id)).map((l) => l.id)
      const related = (o) => {
        if (o.target === subject) return true
        if ((o.op === 'accept_assignment' || o.op === 'reject_assignment') && assignmentIds.has(o.value.assignmentId)) return true
        if (!item.topicId) return false
        const r = parseRef(o.target)
        return Boolean(r && r.topicId === item.topicId)
      }
      return { ...out, groups, assignments, changeLogIds, orphaned: ov.orphaned().filter(related).map((o) => ({ ...o })) }
    },

    async addItem(input) {
      requireReady()
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecordError(422, 'validation_failed', '请求体必须是对象')
      if (input.kind === 'article' || input.kind === 'pdf') throw new RecordError(422, 'unsupported_kind', '本轮不支持文章 / PDF 资料')
      if (!['idea', 'notes', 'video'].includes(input.kind)) throw new RecordError(422, 'validation_failed', 'kind 必须是 idea / notes / video')
      const fields = { idea: ['kind', 'text'], notes: ['kind', 'topicId'], video: ['kind', 'url'] }[input.kind]
      for (const k of Object.keys(input)) if (!fields.includes(k)) throw new RecordError(422, 'validation_failed', `不允许的字段：${k}（不接受本机路径）`)
      if (input.kind === 'notes') {
        if (!isId(input.topicId)) throw new RecordError(400, 'invalid_id', '主题 ID 不合法')
        await topics.refresh()
        const entry = topics.get(input.topicId)
        if (!entry) throw new RecordError(404, 'topic_not_found', 'RECORD_LEARN_DIR 中没有这个主题')
        const before = st.items.some((i) => i.kind === 'notes' && i.topicId === input.topicId)
        await syncTopics()
        const existing = st.items.find((i) => i.kind === 'notes' && i.topicId === input.topicId)
        const ov = overlay()
        return { item: itemView(existing, ov, pendingSets(ov)), created: !before, warnings: [] }
      }
      return store.exclusive(async () => {
        const at = nowIso()
        if (input.kind === 'idea') {
          const text = typeof input.text === 'string' ? input.text.trim() : ''
          if (!text) throw new RecordError(422, 'validation_failed', '想法不能为空')
          if ([...text].length > MAX_IDEA) throw new RecordError(422, 'text_too_long', `想法最多 ${MAX_IDEA} 字`)
          const title = [...text].slice(0, 40).join('') + ([...text].length > 40 ? '…' : '')
          const item = { id: newId('i'), kind: 'idea', title, addedAt: at, ref: { text }, contentHash: null, topicId: null, classify: { state: 'running', note: '整理中' } }
          await store.replace('items', [...st.items, item])
          const { warnings } = await organizeLocked([item.id], ref.item(item.id))
          const ov = overlay()
          return { item: itemView(st.items.find((i) => i.id === item.id), ov, pendingSets(ov)), created: true, warnings }
        }
        const url = typeof input.url === 'string' ? input.url.trim() : ''
        let parsed = null
        try { parsed = new URL(url) } catch { /* invalid */ }
        if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || url.length > MAX_URL || !/^https?:\/\//i.test(url)) {
          throw new RecordError(422, 'invalid_url', '只接受 http / https 视频链接')
        }
        const item = {
          id: newId('i'), kind: 'video', title: url, addedAt: at, ref: { url }, contentHash: null, topicId: null,
          pipeline: video.ready ? queuedPipeline() : queuedPipeline(video.reason),
        }
        await store.replace('items', [...st.items, item])
        // Auto-start the real pipeline when it is usable; otherwise the item
        // stays queued with an explicit reason and 重新整理 reports the gap.
        if (video.ready) {
          try { void startVideoOrganize(item) } catch { /* stays queued */ }
        }
        const ov = overlay()
        return { item: itemView(item, ov, pendingSets(ov)), created: true, warnings: [] }
      })
    },

    async organizeItem(id) {
      requireReady()
      const item = findItem(id)
      if (item.kind === 'video') {
        const warnings = await startVideoOrganize(item)
        return { log: null, warnings }
      }
      if (item.kind !== 'notes' && item.kind !== 'idea') throw new RecordError(409, 'not_organizable', '该类型暂不支持整理')
      if (item.kind === 'notes' && !topics.get(item.topicId)) throw new RecordError(409, 'not_organizable', '编译产物不在 RECORD_LEARN_DIR 中')
      const { log, warnings } = await store.exclusive(() => organizeLocked([item.id], ref.item(item.id)))
      return { log: outLog(log, overlay()), warnings }
    },

    // changelog
    listChangeLog(itemId) {
      requireReady()
      if (itemId !== undefined) findItem(itemId)
      const ov = overlay()
      return st.changelog
        .filter((l) => !itemId || l.trigger === ref.item(itemId) || (l._itemIds || []).includes(itemId))
        .map((l) => outLog(l, ov))
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    },

    async undoChangeLog(id) {
      requireReady()
      if (!isId(id)) throw new RecordError(400, 'invalid_id', '日志 ID 不合法')
      return store.exclusive(async () => {
        const log = st.changelog.find((l) => l.id === id)
        if (!log) throw new RecordError(404, 'not_found', '整理日志不存在')
        if (log.undone) throw new RecordError(409, 'already_undone', '这次整理已经撤销过')
        const ov = overlay()
        const at = nowIso()
        const rows = []
        for (const change of log.changes) {
          const a = st.derived.assignments.find((x) => x.id === change.assignmentId)
          if (!a || ov.assignmentState(a) === 'rejected') continue
          rows.push({ id: newId('o'), at, target: a.subject, op: 'reject_assignment', value: { assignmentId: a.id }, reason: `撤销整理 ${log.id}` })
        }
        const derived = {
          ...st.derived,
          goalProposals: st.derived.goalProposals.map((p) => (p._changeLogId === id && !p._confirmedGoalId ? { ...p, _dismissed: id } : p)),
          ideaAttachments: st.derived.ideaAttachments.map((x) => (x._changeLogId === id ? { ...x, _dismissed: id } : x)),
        }
        await store.replace('derived', derived)
        await store.append('overrides', rows)
        const next = { ...log, undone: true, _undoneAt: at }
        await store.append('changelog', [next])
        return outLog(next, overlay())
      })
    },

    // overrides
    listOverrides(target) {
      requireReady()
      if (target !== undefined && !parseRef(target)) throw new RecordError(400, 'invalid_query', 'target 不是合法的 SubjectRef')
      const ov = overlay()
      return st.overrides.filter((o) => !target || o.target === target).map((o) => {
        const s = ov.status(o.id)
        return { override: { ...o }, effective: s.effective, orphaned: s.orphaned }
      })
    },

    async addOverride(input) {
      requireReady()
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecordError(422, 'validation_failed', '请求体必须是对象')
      const check = validate('override', input)
      if (!check.ok || 'sample' in input) throw new RecordError(422, 'validation_failed', check.ok ? '不允许的字段：sample' : check.message)
      const target = parseRef(input.target)
      if (!target) throw new RecordError(422, 'invalid_target', 'target 不是合法的 SubjectRef')
      const allowedTargets = {
        accept_assignment: ['item'], reject_assignment: ['item'], reassign: ['item'],
        rename: ['concept', 'procedure', 'topic'], hide: ['concept', 'procedure', 'topic'], pin_importance: ['concept'],
        attach_idea: ['item'], confirm_relation: ['relation', 'concept'], reject_relation: ['relation', 'concept'],
        revert: ['goal', 'item', 'topic', 'concept', 'procedure', 'procitem', 'relation'],
      }[input.op]
      if (!allowedTargets.includes(target.kind)) throw new RecordError(422, 'invalid_target', `${input.op} 不能作用于 ${target.kind}`)
      if (input.op === 'rename' && (!input.value.label.trim() || input.value.label.length > 120)) throw new RecordError(422, 'validation_failed', '名称需要 1–120 个字')
      if (input.op === 'attach_idea' && !parseRef(input.value.conceptRef)?.conceptId) throw new RecordError(422, 'validation_failed', 'conceptRef 必须是 concept:<topicId>/<conceptId>')
      if ((input.op === 'confirm_relation' || input.op === 'reject_relation') && (parseRef(input.value.a)?.kind !== 'concept' || parseRef(input.value.b)?.kind !== 'concept')) {
        throw new RecordError(422, 'validation_failed', '关联的两端必须是概念')
      }
      if (input.reason && input.reason.length > 500) throw new RecordError(422, 'validation_failed', 'reason 最多 500 字')
      return store.exclusive(async () => {
        if (input.op === 'reassign') {
          const unknown = input.value.goalIds.filter((g) => !st.goals.some((x) => x.id === g))
          if (unknown.length) throw new RecordError(422, 'unknown_goal', `目标不存在：${unknown.join(', ')}`)
        }
        if (input.op === 'attach_idea') {
          const item = st.items.find((i) => `item:${i.id}` === input.target)
          if (item && item.kind !== 'idea') throw new RecordError(422, 'invalid_target', 'attach_idea 只能作用于想法')
        }
        const existing = store.getOverride(input.id)
        const row = { id: input.id, at: input.at, target: input.target, op: input.op, value: input.value, reason: input.reason }
        let created = true
        if (existing) {
          if (canonicalJson(existing) !== canonicalJson(row)) throw new RecordError(409, 'override_conflict', '同一 id 的修正内容不同')
          created = false
        } else {
          await store.append('overrides', [row])
        }
        const s = overlay().status(row.id)
        return { result: { override: { ...row }, effective: s.effective, orphaned: s.orphaned }, created }
      })
    },

    // events
    listEvents({ since, limit } = {}) {
      requireReady()
      let n = 200
      if (limit !== undefined) {
        n = Number(limit)
        if (!Number.isInteger(n) || n < 1 || n > 1000) throw new RecordError(400, 'invalid_query', 'limit 应为 1–1000 的整数')
      }
      let sinceMs = null
      if (since !== undefined) {
        sinceMs = Date.parse(since)
        if (Number.isNaN(sinceMs)) throw new RecordError(400, 'invalid_query', 'since 应为 ISO-8601 时间')
      }
      return [...st.events]
        .filter((e) => sinceMs === null || Date.parse(e.at) >= sinceMs)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .slice(0, n)
        .map((e) => ({ ...e }))
    },

    async addEvents(input) {
      requireReady()
      const batch = Array.isArray(input) ? input : [input]
      if (!batch.length) throw new RecordError(422, 'validation_failed', '至少一条事件')
      if (batch.length > 50) throw new RecordError(422, 'batch_limit', '一次最多 50 条事件')
      const rows = batch.map((e, index) => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) throw new RecordError(422, 'validation_failed', `第 ${index + 1} 条不是对象`)
        if ('sample' in e) throw new RecordError(422, 'validation_failed', `第 ${index + 1} 条：不允许的字段 sample`)
        const check = validate('event', e)
        if (!check.ok) throw new RecordError(422, 'validation_failed', `第 ${index + 1} 条：${check.message}`)
        const subject = parseRef(e.subject)
        const okSubject = {
          visit: ['concept', 'procedure', 'topic'], recall: ['concept'], checklist: ['procitem'],
          reflection: ['concept', 'topic', 'item', 'procedure'], question: ['concept', 'topic', 'item', 'procedure', 'goal'],
        }[e.kind]
        if (!subject || !okSubject.includes(subject.kind)) throw new RecordError(422, 'invalid_subject', `第 ${index + 1} 条：${e.kind} 的 subject 不能是 ${subject?.kind ?? '非法引用'}`)
        const payload = { visit: ['durationSec'], recall: ['result'], checklist: ['checked'], reflection: ['text'], question: ['text'] }[e.kind]
        const row = { id: e.id, at: e.at, kind: e.kind, subject: e.subject, cardId: e.cardId }
        for (const k of payload) row[k] = e[k]
        return row
      })
      return store.exclusive(async () => {
        const fresh = []
        const seen = new Map()
        for (const row of rows) {
          const prior = store.getEvent(row.id) || seen.get(row.id)
          if (prior) {
            if (canonicalJson(prior) !== canonicalJson(row)) throw new RecordError(409, 'event_conflict', `事件 ${row.id} 已存在且内容不同`)
            continue
          }
          seen.set(row.id, row)
          fresh.push(row)
        }
        await store.append('events', fresh)
        return rows.map((r) => ({ ...r }))
      })
    },

    // derived
    getMastery(topicId, tz) {
      requireReady()
      if (topicId !== undefined) {
        if (!isId(topicId)) throw new RecordError(400, 'invalid_id', '主题 ID 不合法')
        if (!topics.get(topicId)) throw new RecordError(404, 'not_found', '主题不存在')
      }
      const facts = collectFacts(st.events)
      const out = []
      for (const e of topics.list()) {
        if (topicId && e.topicId !== topicId) continue
        for (const c of e.manifest.concepts) {
          const subject = ref.concept(e.topicId, c.id)
          out.push(masteryFromFacts(subject, facts.get(subject), tz))
        }
      }
      return out
    },

    getToday(date, tz) {
      requireReady()
      const day = date || todayIn(tz, now())
      return computeToday(view(tz, day), day)
    },

    getStats(range, tz) {
      requireReady()
      const today = todayIn(tz, now())
      return computeStats(view(tz, today), { range, today })
    },

    getPanorama(goalId, tz) {
      requireReady()
      if (goalId !== undefined) {
        if (!isId(goalId)) throw new RecordError(400, 'invalid_id', '目标 ID 不合法')
        if (!st.goals.some((g) => g.id === goalId)) throw new RecordError(404, 'not_found', '目标不存在')
      }
      const today = todayIn(tz, now())
      const v = view(tz, today)
      return computePanorama(v, { today: computeToday(v, today), goalId })
    },

    /** Read-only summaries for the assistant tool. */
    assistantSummary(part, tz = 'UTC') {
      requireReady()
      if (part === 'today') {
        const plan = api.getToday(undefined, tz)
        return { date: plan.date, tz: plan.tz, rule: 'today-v0：到期复习 → 各目标路线下一颗 → 一份进行中的实操清单', entries: plan.entries.map((e) => ({ kind: e.kind, subject: e.subject, title: e.title, why: e.why })) }
      }
      if (part === 'stats') {
        const s = api.getStats('week', tz)
        return { tz: s.tz, weekMinutes: s.weekMinutes, streakDays: s.streakDays, todayDone: s.todayDone, learned: s.learned, total: s.total, recallRate: s.recallRate, trend: s.trend, goals: s.goals.map((g) => ({ title: g.title, learned: g.learned, total: g.total })), sharedTopicsNote: s.sharedTopicsNote }
      }
      if (part === 'panorama') {
        const p = api.getPanorama(undefined, tz)
        return {
          summary: p.summary,
          goals: p.goals.map((g) => ({ id: g.goal.id, title: g.goal.title, topics: g.topicIds.length })),
          topics: p.topics.map((t) => ({ topicId: t.topicId, title: t.title, goalIds: t.goalIds, concepts: t.groups.reduce((n, g) => n + g.concepts.length, 0) })),
          gaps: p.gaps,
          nextSteps: p.nextSteps.map((e) => ({ kind: e.kind, title: e.title, why: e.why })),
          pendingRelations: p.relationCandidates.filter((r) => !r.confirmed).length,
        }
      }
      throw new RecordError(400, 'invalid_part', 'part 必须是 today / stats / panorama')
    },
  }
  return api
}
