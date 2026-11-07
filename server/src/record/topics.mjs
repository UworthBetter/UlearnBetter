/**
 * Read-only index of compiled topics under RECORD_LEARN_DIR.
 *
 *   RECORD_LEARN_DIR/<topicId>/learn.json      learning.learn/0.1 (Zcode)
 *   RECORD_LEARN_DIR/<topicId>/manifest.json   learning.manifest/0.1 (Zcode)
 *
 * Clients only ever pass a topicId; it is looked up in this index, never
 * joined into a path. Directory scanning follows the notes.mjs rules: every
 * file is resolved through realpath and must stay inside the real learn root,
 * so symlinks cannot escape it.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathSafeId } from './ids.mjs'
import { validate } from './schemas.mjs'

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_LEARN_BYTES = 8 * 1024 * 1024
const MAX_TOPICS = 500

function inside(root, candidate) {
  const rel = path.relative(root, candidate)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}

async function realInside(realRoot, file) {
  try {
    const real = await fs.realpath(file)
    return inside(realRoot, real) ? real : null
  } catch {
    return null
  }
}

/** Build a lookup structure from a validated manifest. */
export function indexManifest(manifest) {
  const concepts = new Map()
  for (const c of manifest.concepts) concepts.set(c.id, c)
  const procedures = new Map()
  for (const p of manifest.procedures) procedures.set(p.id, { ...p, itemIds: new Set(p.items.map((i) => i.id)) })
  const routeOrder = new Map()
  manifest.route.forEach((id, i) => { if (!routeOrder.has(id)) routeOrder.set(id, i) })
  // Suggested route: compiled route first, then remaining concepts by order.
  const route = [
    ...manifest.route.filter((id) => concepts.has(id)),
    ...[...manifest.concepts].sort((a, b) => a.order - b.order).map((c) => c.id).filter((id) => !routeOrder.has(id)),
  ]
  return { concepts, procedures, route: [...new Set(route)] }
}

export function createTopicIndex(learnDir) {
  const root = learnDir ? path.resolve(learnDir) : null
  /** @type {Map<string, object>} topicId -> entry */
  let topics = new Map()
  let skipped = []
  let reason = root ? null : 'RECORD_LEARN_DIR 未配置：主题列表为空。把它指向编译产物目录（每个主题一个子目录，含 learn.json 与 manifest.json）。'
  const cache = new Map()
  let inflight = null

  async function scanOnce() {
    if (!root) return
    let realRoot
    try {
      realRoot = await fs.realpath(root)
      const st = await fs.stat(realRoot)
      if (!st.isDirectory()) throw new Error('not a directory')
    } catch {
      topics = new Map()
      skipped = []
      reason = 'RECORD_LEARN_DIR 不存在或不是目录。'
      return
    }
    reason = null
    let entries = []
    try {
      entries = await fs.readdir(realRoot, { withFileTypes: true })
    } catch {
      reason = 'RECORD_LEARN_DIR 无法读取。'
    }
    const next = new Map()
    const nextSkipped = []
    for (const entry of entries) {
      if (next.size >= MAX_TOPICS) break
      if (entry.name.startsWith('.')) continue
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const dirName = entry.name
      if (!isPathSafeId(dirName)) {
        nextSkipped.push({ dir: dirName, reason: '目录名不是合法主题 ID' })
        continue
      }
      const dir = await realInside(realRoot, path.join(realRoot, dirName))
      if (!dir) {
        nextSkipped.push({ dir: dirName, reason: '目录指向 RECORD_LEARN_DIR 之外，已拒绝' })
        continue
      }
      const manifestPath = await realInside(realRoot, path.join(dir, 'manifest.json'))
      const learnPath = await realInside(realRoot, path.join(dir, 'learn.json'))
      if (!manifestPath || !learnPath) {
        nextSkipped.push({ dir: dirName, reason: '缺少 learn.json 或 manifest.json（或指向目录之外）' })
        continue
      }
      let mStat, lStat
      try {
        ;[mStat, lStat] = await Promise.all([fs.stat(manifestPath), fs.stat(learnPath)])
      } catch {
        nextSkipped.push({ dir: dirName, reason: '无法读取编译产物' })
        continue
      }
      const key = `${mStat.mtimeMs}:${mStat.size}:${lStat.mtimeMs}:${lStat.size}`
      const cached = cache.get(dirName)
      if (cached && cached.key === key) {
        if (cached.entry) next.set(cached.entry.topicId, cached.entry)
        else nextSkipped.push(cached.skip)
        continue
      }
      let entryValue = null
      let skip = null
      if (mStat.size > MAX_MANIFEST_BYTES) {
        skip = { dir: dirName, reason: 'manifest.json 过大' }
      } else {
        try {
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
          const check = validate('manifest', manifest)
          if (!check.ok) skip = { dir: dirName, reason: `manifest.json 不符合 learning.manifest/0.1：${check.message}` }
          else if (manifest.topic.id !== dirName) skip = { dir: dirName, reason: `manifest.topic.id「${manifest.topic.id}」与目录名不一致` }
          else {
            entryValue = {
              topicId: dirName,
              manifest,
              learnPath,
              learnSize: lStat.size,
              ...indexManifest(manifest),
            }
          }
        } catch {
          skip = { dir: dirName, reason: 'manifest.json 不是合法 JSON' }
        }
      }
      cache.set(dirName, { key, entry: entryValue, skip })
      if (entryValue) next.set(dirName, entryValue)
      else nextSkipped.push(skip)
    }
    for (const name of [...cache.keys()]) {
      if (!entries.some((e) => e.name === name)) cache.delete(name)
    }
    topics = next
    skipped = nextSkipped
  }

  return {
    configured: Boolean(root),
    /** Rescan the directory; concurrent callers share one scan. */
    refresh() {
      if (!inflight) inflight = scanOnce().finally(() => { inflight = null })
      return inflight
    },
    get: (topicId) => topics.get(topicId) || null,
    list: () => [...topics.values()],
    health: () => ({ reason, skipped: skipped.map((s) => ({ ...s })) }),
    /** Read the compiled learn.json verbatim (re-verified inside the root). */
    async readLearn(topicId) {
      const entry = topics.get(topicId)
      if (!entry || !root) return null
      const realRoot = await fs.realpath(root)
      const safe = await realInside(realRoot, entry.learnPath)
      if (!safe) return null
      const st = await fs.stat(safe)
      if (st.size > MAX_LEARN_BYTES) throw new Error('learn.json 过大')
      try {
        return JSON.parse(await fs.readFile(safe, 'utf8'))
      } catch {
        // Never surface the parser message: V8 quotes part of the note text.
        throw new Error('learn.json 不是合法 JSON')
      }
    },
  }
}
