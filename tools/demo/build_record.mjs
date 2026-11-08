#!/usr/bin/env node
/**
 * 演示数据流水线的「整理 / 记录」一步。
 *
 * 在本进程内启动真实的记录层后端（server/src/app.mjs，RECORD_ORGANIZER=llm，
 * 模型取自 ASSISTANT_*），按演示学习者脚本逐日推进后端时钟（createApp 的
 * record.now 钩子），全部写入都经由 /api/record HTTP 接口完成：
 *
 *   - 主题按日期加入 RECORD_LEARN_DIR → 后端自动登记资料并调用模型整理；
 *   - 模型提议的目标由「学习者」确认（POST /goals fromProposalId）；
 *   - 学习痕迹（visit / recall / checklist / reflection / question）按脚本上报；
 *   - 想法提交后由模型提议挂载到哪颗星，「学习者」确认（attach_idea）；
 *   - 视频链接按真实流程登记为「排队中」。
 *
 * 学习者的行为（看了哪颗星、停留多久、回忆结果、写的想法）来自
 * tools/demo/learner-script.json，是**脚本模拟的用户操作**；
 * 笔记内容、资料识别、归类与挂载提议来自真实模型与编译器。
 *
 * 用法：
 *   node tools/demo/build_record.mjs [--env server/.env] [--learn samples/demo/learn]
 *        [--script tools/demo/learner-script.json] [--out samples/demo/record]
 *
 * 没有模型配置时直接失败，不会改用 mock / folder 整理器。
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

export function parseArgs(argv) {
  const out = { env: 'server/.env', learn: 'samples/demo/learn', script: 'tools/demo/learner-script.json', out: 'samples/demo/record' }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '')
    if (!(k in out)) throw new Error(`未知参数 ${argv[i]}`)
    out[k] = argv[++i]
  }
  return out
}

/** 极简 .env 解析：KEY=VALUE，忽略注释与空行，不做变量展开。 */
export function parseEnvFile(text) {
  const env = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}

/** 本地日期 + 时刻（固定 +08:00，演示脚本时区 Asia/Shanghai）。 */
export function at(day, minutes, offset = '+08:00') {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return new Date(`${day}T${h}:${m}:00${offset}`)
}

/** 确定性伪随机（mulberry32），保证同一脚本得到同样的停留时长与回忆结果。 */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 与 uuid 格式兼容的确定性 id（事件幂等键）。 */
export function stableUuid(...parts) {
  const h = createHash('sha1').update(parts.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envPath = path.resolve(ROOT, args.env)
  const fileEnv = existsSync(envPath) ? parseEnvFile(await readFile(envPath, 'utf8')) : {}
  const modelEnv = { ...fileEnv, ...pick(process.env, /^ASSISTANT_|_API_KEY$/) }
  if (!modelEnv.ASSISTANT_PROVIDER || !(modelEnv.ASSISTANT_API_KEY || Object.keys(modelEnv).some((k) => k.endsWith('_API_KEY')))) {
    throw new Error(`模型未配置：需要 ASSISTANT_PROVIDER、ASSISTANT_API_KEY（openai-compatible 还需 ASSISTANT_BASE_URL、ASSISTANT_MODEL），可写在 ${args.env}`)
  }
  const script = JSON.parse(await readFile(path.resolve(ROOT, args.script), 'utf8'))
  const learnSrc = path.resolve(ROOT, args.learn)
  const outDir = path.resolve(ROOT, args.out)

  const work = await mkdtemp(path.join(tmpdir(), 'ub-demo-build-'))
  const stageLearn = path.join(work, 'learn')
  const dataDir = path.join(work, 'record')
  await mkdir(stageLearn, { recursive: true })

  let clock = at(script.days[0].date, 8 * 60)
  const env = {
    ...modelEnv,
    RECORD_LEARN_DIR: stageLearn,
    RECORD_DATA_DIR: dataDir,
    RECORD_ORGANIZER: 'llm',
    RECORD_AUTO_ACCEPT: String(script.autoAccept ?? 0.85),
    ASSISTANT_LOG_LEVEL: 'error',
  }
  // CopilotKit 运行时默认开启遥测；构建演示数据时不向第三方发送使用数据
  process.env.COPILOTKIT_TELEMETRY_DISABLED ??= 'true'
  const { createApp } = await import(path.join(ROOT, 'server/src/app.mjs'))
  const { app, ready, reason, config } = await createApp(env, { record: { now: () => new Date(clock) } })
  if (!ready) throw new Error(`模型配置无效：${reason}`)
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const base = `http://127.0.0.1:${server.address().port}/api/record`
  const tz = script.tz || 'Asia/Shanghai'
  const log = { model: config.model, provider: config.provider, steps: [], warnings: [] }

  async function api(method, url, body) {
    const res = await fetch(base + url + (url.includes('?') ? '&' : '?') + `tz=${encodeURIComponent(tz)}`, {
      method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${json.error || ''} ${json.message || ''}`)
    for (const w of json.meta?.warnings || []) if (!/未提供 tz/.test(w)) log.warnings.push(`${clock.toISOString()} ${method} ${url}: ${w}`)
    return json.data
  }

  const manifests = {}
  for (const id of await readdir(learnSrc)) {
    manifests[id] = JSON.parse(await readFile(path.join(learnSrc, id, 'manifest.json'), 'utf8'))
  }
  const learnDocs = {}
  for (const id of Object.keys(manifests)) learnDocs[id] = JSON.parse(await readFile(path.join(learnSrc, id, 'learn.json'), 'utf8'))

  const routeOf = (topicId) => {
    const m = manifests[topicId]
    const seen = new Set(m.route)
    return [...m.route, ...m.concepts.slice().sort((a, b) => a.order - b.order).map((c) => c.id).filter((id) => !seen.has(id))]
  }
  /** 脚本里的概念引用：{topic, match}（按标签或别名包含匹配）或 {topic, route}（路线序号）。 */
  const conceptOf = (spec) => {
    if (spec.match) {
      const needle = spec.match.toLowerCase()
      const hit = manifests[spec.topic].concepts.find((c) => [c.label, ...(c.aliases || [])].some((l) => String(l).toLowerCase().includes(needle)))
      if (!hit) throw new Error(`主题 ${spec.topic} 里没有匹配「${spec.match}」的概念`)
      return hit.id
    }
    const id = routeOf(spec.topic)[spec.route ?? 0]
    if (!id) throw new Error(`主题 ${spec.topic} 的路线没有第 ${spec.route} 颗`)
    return id
  }
  const cardOf = (topicId, conceptId) => learnDocs[topicId].concepts.find((c) => c.id === conceptId)?.blocks?.[0]?.id ?? null
  const progress = {} // topicId → 已学到路线第几颗
  const random = rng(script.seed ?? 7)

  try {
    for (const day of script.days) {
      let minute = day.start ?? 20 * 60
      const tick = (n) => { minute += n; clock = at(day.date, minute) }
      tick(0)
      const step = (what, detail) => log.steps.push({ at: clock.toISOString(), what, ...detail })

      for (const topicId of day.addTopics || []) {
        if (!manifests[topicId]) throw new Error(`脚本引用了不存在的主题 ${topicId}`)
        await cp(path.join(learnSrc, topicId), path.join(stageLearn, topicId), { recursive: true })
        const items = await api('GET', '/items')
        const item = items.find((i) => i.topicId === topicId)
        step('add_topic', { topicId, itemId: item?.id, status: item?.status, goalIds: item?.goalIds })
        tick(2)
      }

      if (day.confirmGoalProposals) {
        const props = await api('GET', '/proposals')
        for (const p of props.goalProposals) {
          const goal = await api('POST', '/goals', { fromProposalId: p.id })
          step('confirm_goal_proposal', { proposal: p.title, reason: p.reason, goalId: goal.id })
          tick(1)
        }
      }
      for (const g of day.createGoals || []) {
        const goal = await api('POST', '/goals', g)
        step('create_goal', { goalId: goal.id, title: goal.title })
        tick(1)
      }
      if (day.acceptAssignments) {
        const props = await api('GET', '/proposals')
        for (const a of props.assignments) {
          await api('POST', '/overrides', { id: randomUUID(), at: clock.toISOString(), target: a.subject, op: 'accept_assignment', value: { assignmentId: a.id }, reason: null })
          step('accept_assignment', { subject: a.subject, goalId: a.goalId, confidence: a.confidence })
          tick(1)
        }
      }

      // 到期复习：按后端派生的掌握度找出今天到期的星
      if (day.review) {
        const due = []
        for (const topicId of Object.keys(progress)) {
          for (const m of await api('GET', `/mastery?topicId=${encodeURIComponent(topicId)}`)) {
            if (m.due && new Date(m.due) <= at(day.date, 23 * 60 + 59)) due.push(m)
          }
        }
        for (const m of due.slice(0, day.review.max ?? 99)) {
          const [topicId, conceptId] = m.subject.slice('concept:'.length).split('/')
          const dur = 40 + Math.floor(random() * 90)
          tick(Math.ceil(dur / 60))
          await events([{ kind: 'visit', subject: m.subject, cardId: cardOf(topicId, conceptId), durationSec: dur }])
          const result = random() < (day.review.forgetRate ?? 0.2) ? 'forgot' : 'remembered'
          await events([{ kind: 'recall', subject: m.subject, cardId: null, result }])
          step('review', { subject: m.subject, result })
          tick(1)
        }
      }

      for (const [topicId, n] of Object.entries(day.learn || {})) {
        const route = routeOf(topicId)
        progress[topicId] ??= 0
        for (let k = 0; k < n && progress[topicId] < route.length; k++) {
          const conceptId = route[progress[topicId]++]
          const subject = `concept:${topicId}/${conceptId}`
          const dur = 150 + Math.floor(random() * 420)
          tick(Math.ceil(dur / 60))
          await events([{ kind: 'visit', subject, cardId: cardOf(topicId, conceptId), durationSec: dur }])
          const r = random()
          const result = r < (day.forgetRate ?? 0.15) ? 'forgot' : r < 0.9 ? 'remembered' : 'skipped'
          await events([{ kind: 'recall', subject, cardId: null, result }])
          step('learn', { subject, durationSec: dur, result })
          tick(1)
        }
      }

      for (const c of day.checklists || []) {
        const proc = manifests[c.topic].procedures[c.procedure ?? 0]
        for (const item of proc.items.slice(0, c.items)) {
          tick(2)
          await events([{ kind: 'checklist', subject: `procitem:${c.topic}/${proc.id}/${item.id}`, cardId: proc.id, checked: true }])
        }
        step('checklist', { topicId: c.topic, procedure: proc.title, checked: Math.min(c.items, proc.items.length), of: proc.items.length })
      }

      for (const r of day.reflections || []) {
        const conceptId = conceptOf(r)
        tick(2)
        await events([{ kind: 'reflection', subject: `concept:${r.topic}/${conceptId}`, cardId: null, text: r.text }])
        step('reflection', { subject: `concept:${r.topic}/${conceptId}` })
      }

      for (const q of day.questions || []) {
        const conceptId = conceptOf(q)
        tick(1)
        await events([{ kind: 'question', subject: `concept:${q.topic}/${conceptId}`, cardId: null, text: q.text }])
        step('question', { subject: `concept:${q.topic}/${conceptId}` })
      }

      for (const text of day.ideas || []) {
        tick(2)
        const item = await api('POST', '/items', { kind: 'idea', text })
        const props = await api('GET', '/proposals')
        const att = props.ideaAttachments.find((a) => a.subject === `item:${item.id}`)
        step('idea', { itemId: item.id, proposed: att?.conceptRef ?? null, confidence: att?.confidence ?? null, reason: att?.reason ?? null })
        if (att && day.acceptIdeas !== false) {
          tick(1)
          await api('POST', '/overrides', { id: randomUUID(), at: clock.toISOString(), target: `item:${item.id}`, op: 'attach_idea', value: { conceptRef: att.conceptRef }, reason: null })
          step('attach_idea', { itemId: item.id, conceptRef: att.conceptRef })
        }
      }

      for (const url of day.videos || []) {
        tick(1)
        const item = await api('POST', '/items', { kind: 'video', url })
        step('video_link', { itemId: item.id, url, state: item.pipeline?.state, reason: item.pipeline?.reason })
      }
    }

    // 快照：派生结果，便于在报告与测试里核对
    const lastDay = script.days[script.days.length - 1].date
    clock = at(lastDay, 23 * 60)
    const snapshot = {
      goals: await api('GET', '/goals'),
      items: (await api('GET', '/items')).map((i) => ({ id: i.id, kind: i.kind, title: i.title, status: i.status, goalIds: i.goalIds, about: i.identity?.about ?? null })),
      stats: await api('GET', '/stats?range=month'),
      health: await api('GET', '/health'),
    }

    await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })
    for (const f of await readdir(dataDir)) await cp(path.join(dataDir, f), path.join(outDir, f))
    const meta = {
      schema: 'ulearnbetter.demo-record/0.1',
      builtAt: new Date().toISOString(),
      anchorDate: lastDay,
      tz,
      organizer: snapshot.health.organizer,
      organizerLabel: snapshot.health.organizerLabel,
      model: config.model,
      provider: config.provider,
      learnerScript: path.relative(ROOT, path.resolve(ROOT, args.script)),
      note: '学习者行为（停留、回忆、勾选、想法文字）由演示脚本模拟；资料识别、归类、目标与想法挂载提议由真实模型产生，经真实记录层接口写入。',
      topics: Object.keys(progress),
      summary: {
        goals: snapshot.goals.map((g) => g.title),
        items: snapshot.items.length,
        weekMinutes: snapshot.stats.weekMinutes, streakDays: snapshot.stats.streakDays,
        recallRate: snapshot.stats.recallRate, learned: snapshot.stats.learned, total: snapshot.stats.total,
      },
    }
    await writeFile(path.join(outDir, 'demo-meta.json'), JSON.stringify(meta, null, 2) + '\n')
    await writeFile(path.join(outDir, 'build-log.json'), JSON.stringify({ ...log, snapshot: { goals: snapshot.goals, items: snapshot.items } }, null, 2) + '\n')
    console.log(`完成：${snapshot.goals.length} 个目标、${snapshot.items.length} 份资料；近 7 天 ${snapshot.stats.weekMinutes} 分钟，连续 ${snapshot.stats.streakDays} 天，回忆正确率 ${snapshot.stats.recallRate}`)
    console.log(`输出：${path.relative(ROOT, outDir)}；警告 ${log.warnings.length} 条`)
  } finally {
    server.close()
    await rm(work, { recursive: true, force: true })
  }

  async function events(list) {
    const body = list.map((e) => ({ id: stableUuid(e.kind, e.subject, clock.toISOString(), String(e.result ?? e.checked ?? e.text ?? '')), at: clock.toISOString(), ...e }))
    return api('POST', '/events', body.length === 1 ? body[0] : body)
  }
}

function pick(obj, re) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => re.test(k)))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`失败：${err.message}`); process.exitCode = 1 })
}
