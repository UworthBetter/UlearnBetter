/**
 * Decision-layer storage under RECORD_DATA_DIR (default server/.data/record/).
 *
 *   goals.json        Goal[]                       replaced atomically
 *   items.json        stored Item rows             replaced atomically
 *   assignments.json  {assignments, goalProposals, ideaAttachments}
 *                     organizer output (derived layer), replaced atomically
 *   changelog.jsonl   ChangeLog rows; a later row with the same id supersedes
 *                     an earlier one (undo appends, never rewrites)
 *   overrides.jsonl   Override rows, append only; undo = append `revert`
 *   events.jsonl      LearningEvent rows, append only, idempotent by id
 *
 * The directory layout is plain files so it can later point at a vault's
 * `_系统/` folder unchanged. One process owns the directory: all writes go
 * through a single in-process queue (`exclusive`). `.json` files are written
 * to a temp file and renamed over the target. Corrupt `.jsonl` lines are
 * skipped and reported; the file is never truncated. A corrupt `.json` file
 * blocks writes to that file (instead of overwriting it with an empty value)
 * and is reported by /health.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const JSON_FILES = {
  goals: { file: 'goals.json', empty: () => [] },
  items: { file: 'items.json', empty: () => [] },
  derived: { file: 'assignments.json', empty: () => ({ assignments: [], goalProposals: [], ideaAttachments: [] }) },
}
const JSONL_FILES = {
  changelog: 'changelog.jsonl',
  overrides: 'overrides.jsonl',
  events: 'events.jsonl',
}

export class StoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'StoreError'
    this.code = code
  }
}

export function createStore(dir) {
  const root = path.resolve(dir)
  const state = {
    goals: [], items: [],
    derived: JSON_FILES.derived.empty(),
    changelog: [], overrides: [], events: [],
  }
  const eventIndex = new Map()
  const overrideIndex = new Map()
  const problems = { corruptJson: [], corruptLines: {} }
  const needsNewline = {}
  let queue = Promise.resolve()
  let dirReady = false

  async function ensureDir() {
    if (dirReady) return
    await fs.mkdir(root, { recursive: true })
    dirReady = true
  }

  async function readText(file) {
    try {
      return await fs.readFile(path.join(root, file), 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  function collapseChangelog(rows) {
    const byId = new Map()
    for (const row of rows) byId.set(row.id, row)
    return [...byId.values()]
  }

  async function load() {
    for (const [name, spec] of Object.entries(JSON_FILES)) {
      const text = await readText(spec.file)
      if (text === null) { state[name] = spec.empty(); continue }
      try {
        const value = JSON.parse(text)
        const expectArray = Array.isArray(spec.empty())
        if (expectArray !== Array.isArray(value) || typeof value !== 'object' || value === null) {
          throw new Error('unexpected top-level shape')
        }
        state[name] = expectArray ? value : { ...spec.empty(), ...value }
      } catch {
        state[name] = spec.empty()
        problems.corruptJson.push(spec.file)
      }
    }
    for (const [name, file] of Object.entries(JSONL_FILES)) {
      const text = await readText(file)
      const rows = []
      const bad = []
      if (text !== null) {
        const lines = text.split('\n')
        lines.forEach((line, index) => {
          if (line.trim() === '') return
          try {
            const value = JSON.parse(line)
            if (!value || typeof value !== 'object' || typeof value.id !== 'string') throw new Error('no id')
            rows.push(value)
          } catch {
            bad.push(index + 1)
          }
        })
        needsNewline[name] = text.length > 0 && !text.endsWith('\n')
      }
      if (bad.length) problems.corruptLines[file] = bad
      state[name] = name === 'changelog' ? collapseChangelog(rows) : rows
    }
    eventIndex.clear()
    for (const e of state.events) if (!eventIndex.has(e.id)) eventIndex.set(e.id, e)
    // Duplicate ids in the event log (should not happen) keep the first row.
    state.events = [...eventIndex.values()]
    overrideIndex.clear()
    for (const o of state.overrides) if (!overrideIndex.has(o.id)) overrideIndex.set(o.id, o)
    state.overrides = [...overrideIndex.values()]
  }

  /** Serialize a read-modify-write section. */
  function exclusive(fn) {
    const run = queue.then(fn, fn)
    queue = run.catch(() => {})
    return run
  }

  async function replace(name, value) {
    const spec = JSON_FILES[name]
    if (!spec) throw new Error(`unknown json store "${name}"`)
    if (problems.corruptJson.includes(spec.file)) {
      throw new StoreError('store_corrupt', `${spec.file} 无法解析，已停止写入以免覆盖；请检查后重启。`)
    }
    await ensureDir()
    const target = path.join(root, spec.file)
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    const handle = await fs.open(tmp, 'w')
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await fs.rename(tmp, target)
    } catch (err) {
      await fs.rm(tmp, { force: true })
      throw err
    }
    state[name] = value
  }

  async function append(name, rows) {
    const file = JSONL_FILES[name]
    if (!file) throw new Error(`unknown jsonl store "${name}"`)
    if (!rows.length) return
    await ensureDir()
    const prefix = needsNewline[name] ? '\n' : ''
    await fs.appendFile(path.join(root, file), prefix + rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
    needsNewline[name] = false
    if (name === 'changelog') {
      state.changelog = collapseChangelog([...state.changelog, ...rows])
    } else {
      state[name] = [...state[name], ...rows]
      const index = name === 'events' ? eventIndex : overrideIndex
      for (const r of rows) if (!index.has(r.id)) index.set(r.id, r)
    }
  }

  return {
    root,
    state,
    load,
    exclusive,
    replace,
    append,
    getEvent: (id) => eventIndex.get(id),
    getOverride: (id) => overrideIndex.get(id),
    health() {
      return {
        dir: path.basename(root),
        corruptFiles: [...problems.corruptJson],
        corruptLines: Object.fromEntries(Object.entries(problems.corruptLines).map(([f, l]) => [f, l.length])),
      }
    },
  }
}
