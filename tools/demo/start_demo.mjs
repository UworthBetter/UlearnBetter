#!/usr/bin/env node
/**
 * 一键加载演示数据并启动（后端 + 前端）。
 *
 *   node tools/demo/start_demo.mjs            # 重置演示数据并启动，打开 http://localhost:5173/#/today
 *   node tools/demo/start_demo.mjs --prepare  # 只准备数据目录，打印需要的环境变量
 *   node tools/demo/start_demo.mjs --keep     # 保留上次演示中的操作，不重置
 *
 * 数据来源：samples/demo/learn（编译产物）与 samples/demo/record（决定层与学习痕迹）。
 * 每次（未加 --keep）都会复制到 server/.data/demo/（已 gitignore），并把记录里的
 * 全部时间按整天平移，使最后一个演示学习日落在「昨天」，今日计划与到期复习因此可用。
 * 仓库里的预置文件不会被修改。
 *
 * 模型：读取 server/.env（或进程环境）里的 ASSISTANT_*。未配置时后端照常启动，
 * 记录层可用，助手入口 /api/copilotkit 返回明确的 503，整理器改用 folder（不调用模型）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnvFile } from './build_record.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
export const DEMO_LEARN = path.join(ROOT, 'samples/demo/learn')
export const DEMO_NOTES = path.join(ROOT, 'samples/demo/notes')
export const DEMO_RECORD = path.join(ROOT, 'samples/demo/record')
const RECORD_FILES = new Set(['goals.json', 'items.json', 'assignments.json', 'changelog.jsonl', 'overrides.jsonl', 'events.jsonl'])

const ISO_DT = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))$/

/** YYYY-MM-DD 加 n 天（纯日历运算）。 */
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 两个 YYYY-MM-DD 相差的天数（b − a）。 */
export function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** 某时区的今天（YYYY-MM-DD），默认本机时区（浏览器按本机时区上报 tz）。 */
export function todayIn(tz = Intl.DateTimeFormat().resolvedOptions().timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** 把值里所有 ISO 日期时间字符串平移 n 天，保持原有格式与时区写法。 */
export function shiftValue(value, n) {
  if (typeof value === 'string') {
    const m = value.match(ISO_DT)
    return m ? addDays(m[1], n) + m[2] : value
  }
  if (Array.isArray(value)) return value.map((v) => shiftValue(v, n))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftValue(v, n)]))
  return value
}

export function shiftText(name, text, n) {
  if (name.endsWith('.jsonl')) {
    return text.split('\n').map((line) => (line.trim() ? JSON.stringify(shiftValue(JSON.parse(line), n)) : line)).join('\n')
  }
  return JSON.stringify(shiftValue(JSON.parse(text), n), null, 2) + '\n'
}

/**
 * 准备演示数据目录。返回 {learnDir, dataDir, shiftDays, meta}。
 * today 默认取 meta.tz 的今天；最后一个演示学习日平移到 today − 1。
 */
export async function prepareDemo({ target = path.join(ROOT, 'server/.data/demo'), today, keep = false } = {}) {
  const meta = JSON.parse(await readFile(path.join(DEMO_RECORD, 'demo-meta.json'), 'utf8'))
  const learnDir = path.join(target, 'learn')
  const dataDir = path.join(target, 'record')
  const notesDir = path.join(target, 'notes')
  const day = today || todayIn()
  const shiftDays = dayDiff(meta.anchorDate, addDays(day, -1))
  if (keep && existsSync(dataDir) && existsSync(learnDir)) {
    // 旧版演示目录没有笔记原文：--keep 时补上，阅读窗口才能打开
    if (!existsSync(notesDir)) await cp(DEMO_NOTES, notesDir, { recursive: true, filter: (src) => !src.endsWith('.generation.json') })
    return { learnDir, dataDir, notesDir, shiftDays: 0, meta, kept: true }
  }
  await rm(target, { recursive: true, force: true })
  await mkdir(dataDir, { recursive: true })
  await cp(DEMO_LEARN, learnDir, { recursive: true })
  // 笔记原文给应用内阅读窗口用（只复制 .md 目录树，生成日志留在仓库里）
  await cp(DEMO_NOTES, notesDir, { recursive: true, filter: (src) => !src.endsWith('.generation.json') })
  // 编译时间随记录一起平移（只改 generated.at / generatedAt，内容不变）
  for (const topic of await readdir(learnDir)) {
    const lp = path.join(learnDir, topic, 'learn.json')
    const mp = path.join(learnDir, topic, 'manifest.json')
    const learn = JSON.parse(await readFile(lp, 'utf8'))
    learn.topic.generated.at = shiftValue(learn.topic.generated.at, shiftDays)
    await writeFile(lp, JSON.stringify(learn, null, 2) + '\n')
    const manifest = JSON.parse(await readFile(mp, 'utf8'))
    manifest.generatedAt = shiftValue(manifest.generatedAt, shiftDays)
    await writeFile(mp, JSON.stringify(manifest, null, 2) + '\n')
  }
  for (const f of await readdir(DEMO_RECORD)) {
    if (!RECORD_FILES.has(f)) continue
    await writeFile(path.join(dataDir, f), shiftText(f, await readFile(path.join(DEMO_RECORD, f), 'utf8'), shiftDays))
  }
  await writeFile(path.join(target, 'prepared.json'), JSON.stringify({ preparedAt: new Date().toISOString(), today: day, shiftDays, anchorDate: meta.anchorDate }, null, 2) + '\n')
  return { learnDir, dataDir, notesDir, shiftDays, meta, kept: false }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (f) => argv.includes(f)
  const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }
  const apiPort = opt('--port', '4000')
  const webPort = opt('--web-port', '5173')

  const prepared = await prepareDemo({ keep: flag('--keep') })
  const envFile = path.join(ROOT, 'server/.env')
  const fileEnv = existsSync(envFile) ? parseEnvFile(await readFile(envFile, 'utf8')) : {}
  const modelConfigured = Boolean((process.env.ASSISTANT_PROVIDER || fileEnv.ASSISTANT_PROVIDER))
  const origins = `http://localhost:${webPort},http://127.0.0.1:${webPort}`
  const serverEnv = {
    ...process.env, ...fileEnv,
    PORT: apiPort,
    RECORD_LEARN_DIR: prepared.learnDir,
    RECORD_DATA_DIR: prepared.dataDir,
    RECORD_NOTES_DIR: prepared.notesDir,
    RECORD_ORGANIZER: process.env.RECORD_ORGANIZER || (modelConfigured ? 'llm' : 'folder'),
    ASSISTANT_ALLOWED_ORIGINS: process.env.ASSISTANT_ALLOWED_ORIGINS || origins,
    COPILOTKIT_TELEMETRY_DISABLED: process.env.COPILOTKIT_TELEMETRY_DISABLED || 'true',
  }

  console.log(`演示数据：${prepared.meta.topics.length} 个主题，${prepared.meta.summary.items} 份资料；` +
    (prepared.kept ? '沿用上次的演示目录（--keep）' : `时间已平移 ${prepared.shiftDays} 天（最后学习日 = 昨天）`))
  console.log(`  RECORD_LEARN_DIR=${prepared.learnDir}`)
  console.log(`  RECORD_DATA_DIR=${prepared.dataDir}`)
  console.log(`  RECORD_NOTES_DIR=${prepared.notesDir}`)
  console.log(`  RECORD_ORGANIZER=${serverEnv.RECORD_ORGANIZER}`)
  console.log(modelConfigured ? '  模型：已从 server/.env 或环境变量读取（助手与 llm 整理可用）'
    : '  模型：未配置 —— 记录层与各视图可用；助手入口返回 503「未配置」，整理器用 folder')
  if (flag('--prepare')) return

  const children = []
  const run = (cmd, args, opts) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    children.push(child)
    child.on('exit', (code) => { if (code && !stopping) { console.error(`${cmd} 退出（${code}）`); stop() } })
    return child
  }
  let stopping = false
  const stop = () => { stopping = true; for (const c of children) c.kill('SIGTERM') }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  run(process.execPath, ['src/index.mjs'], { cwd: path.join(ROOT, 'server'), env: serverEnv })
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--port', webPort, '--strictPort'], {
    cwd: path.join(ROOT, 'concept-graph'),
    env: { ...process.env, ASSISTANT_BACKEND_URL: `http://127.0.0.1:${apiPort}`, VITE_UB_DEMO: '1' },
    shell: process.platform === 'win32',
  })
  console.log(`\n打开 http://localhost:${webPort}/#/today （Ctrl+C 退出）\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`失败：${err.message}`); process.exitCode = 1 })
}
