// Shared helpers for record-layer tests. Every topic here is synthetic test
// data written to a temp directory; no user notes are involved.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createApp } from '../../server/src/app.mjs'
import { createSettingsStore } from '../../server/src/settings/store.mjs'

export async function tempDir(t, prefix = 'ulb-record-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

/**
 * Build a learning.manifest/0.1 document.
 * concepts: [{id, label, group?, importanceHint?}] in route order.
 */
export function manifest({ id, title, folderHint = null, about = null, concepts, procedures = [], contentHash = 'sha1:aaa', route, groups }) {
  const cs = concepts.map((c, order) => ({
    id: c.id, label: c.label, aliases: [], group: c.group ?? null, order,
    importanceHint: c.importanceHint ?? 1, importanceFactors: [], blockCount: 1,
  }))
  const groupNames = [...new Set(cs.map((c) => c.group).filter(Boolean))]
  return {
    schema: 'learning.manifest/0.1',
    topic: { id, title, idOrigin: 'explicit' },
    contentHash,
    compilerVersion: '0.2-test',
    generatedAt: '2026-11-01T00:00:00Z',
    folderHint,
    identity: { what: '课程笔记', about, route: null },
    counts: { chapters: 0, concepts: cs.length, procedures: procedures.length },
    source: { title: `${title}（测试）`, author: null, duration: null, url: null },
    concepts: cs,
    groups: groups ?? groupNames.map((name) => ({ name, conceptIds: cs.filter((c) => c.group === name).map((c) => c.id) })),
    procedures,
    route: route ?? cs.map((c) => c.id),
  }
}

export function learnFor(m) {
  return {
    schema: 'learning.learn/0.1',
    topic: { id: m.topic.id, title: m.topic.title, generated: { at: m.generatedAt, by: 'test', compiler_version: m.compilerVersion, extractor: 'null', notes_dir: 'synthetic' } },
    sources: [], stages: [], relations: [], procedures: [],
    concepts: m.concepts.map((c) => ({
      id: c.id, label: c.label, one_liner: '测试概念', group: c.group,
      blocks: [{ id: `b-${c.id}`, shape: 'definition', title: '测试', points: [{ text: '测试', ev: [] }], ev: [], grounding: 'note' }],
      note: 'synthetic.md', note_hash: 'sha1:0000000000000000000000000000000000000000',
    })),
  }
}

export async function writeTopic(learnDir, m) {
  const dir = path.join(learnDir, m.topic.id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(m))
  await fs.writeFile(path.join(dir, 'learn.json'), JSON.stringify(learnFor(m)))
}

/** Three synthetic topics: two in folder 量化, one in folder AI. */
export function standardTopics() {
  return [
    manifest({
      id: 't-ma', title: '均线入门', folderHint: '量化', about: '均线的基本用法',
      concepts: [
        { id: 'ma', label: '移动平均', group: '基础' },
        { id: 'ema', label: '指数平均', group: '基础' },
        { id: 'cross', label: '金叉（MA）', group: '信号' },
        { id: 'dead', label: '死叉', group: '信号' },
        { id: 'slope', label: '斜率', group: '信号' },
      ],
      procedures: [{ id: 'p1', title: '画均线', items: [{ id: 's1', text: '选周期' }, { id: 's2', text: '叠加' }] }],
    }),
    manifest({
      id: 't-trend', title: '趋势跟踪', folderHint: '量化',
      concepts: [
        { id: 'trend', label: '趋势', group: '概念' },
        { id: 'cross2', label: '金叉', group: '概念' },
        { id: 'stop', label: '止损', group: '风控' },
        { id: 'size', label: '仓位', group: '风控' },
        { id: 'risk', label: '风险预算', group: '风控' },
      ],
    }),
    manifest({
      id: 't-ai', title: 'AI 工具', folderHint: 'AI',
      concepts: [{ id: 'mcp', label: 'MCP', group: '工具' }, { id: 'agent', label: 'Agent', group: '工具' }],
    }),
  ]
}

export function clock(iso) {
  let now = new Date(iso)
  const fn = () => new Date(now)
  fn.set = (v) => { now = new Date(v) }
  return fn
}

export async function startApp(t, { env = {}, record = {} } = {}) {
  // Hermetic settings: never read the real server/.data/settings.json.
  const settingsDir = await tempDir(t, 'ulb-settings-')
  const { app, record: service } = await createApp(env, {
    record,
    settingsStore: createSettingsStore(path.join(settingsDir, 'settings.json')),
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r) }))
  const base = `http://127.0.0.1:${server.address().port}`
  async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    let json = null
    try { json = await res.json() } catch { /* not json */ }
    return { status: res.status, body: json }
  }
  return { base, service, call }
}

export function event(kind, subject, at, extra = {}) {
  const base = { id: randomUUID(), at, kind, subject, cardId: null }
  if (kind === 'visit') return { ...base, durationSec: 60, ...extra }
  if (kind === 'recall') return { ...base, result: 'remembered', ...extra }
  if (kind === 'checklist') return { ...base, checked: true, ...extra }
  return { ...base, text: 'x', ...extra }
}
