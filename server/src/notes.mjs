/**
 * Optional, read-only local notes retrieval.
 *
 * Enabled only when ASSISTANT_NOTES_ROOT points at a directory. Every path the
 * model asks for is resolved and verified to stay inside that root, so a model
 * cannot read arbitrary absolute paths off the machine (see CONTRACTS.md:
 * "后端只能读取配置的笔记根目录中的文件，不能接受模型传来的任意绝对路径").
 *
 * This is deliberately simple: a filename/substring search over text files.
 * No vector database in the first version. File contents are returned as data,
 * never interpreted as instructions.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json', '.vtt', '.srt'])
const MAX_FILE_BYTES = 200 * 1024
const MAX_SNIPPET_CHARS = 2000
const MAX_RESULTS = 5

/** Resolve `requested` under `root`, or return null if it escapes the root. */
export function resolveWithinRoot(root, requested) {
  const resolvedRoot = path.resolve(root)
  if (path.isAbsolute(requested) || path.win32.isAbsolute(requested)) return null
  const candidate = path.resolve(resolvedRoot, requested.replace(/\\/g, path.sep))
  const rel = path.relative(resolvedRoot, candidate)
  if (rel === '' ) return resolvedRoot
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null
  return candidate
}

async function resolveRealNote(root, requested) {
  const candidate = resolveWithinRoot(root, requested)
  if (!candidate) return null
  try {
    const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(candidate)])
    const relative = path.relative(realRoot, realFile)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null
    return realFile
  } catch { return null }
}

async function walk(dir, root, acc) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (acc.length > 2000) break
      await walk(full, root, acc)
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Search the notes root for `query`. Returns up to MAX_RESULTS matches with a
 * short snippet each. All reads are confined to `root`.
 */
export async function searchNotes(root, query) {
  const q = String(query || '').trim()
  if (!q) return { ok: false, message: 'Empty query.', results: [] }
  const files = await walk(path.resolve(root), path.resolve(root), [])
  const needle = q.toLowerCase()
  const results = []
  for (const file of files) {
    if (results.length >= MAX_RESULTS) break
    const safeFile = await resolveRealNote(root, path.relative(path.resolve(root), file))
    if (!safeFile) continue
    let stat
    try {
      stat = await fs.stat(safeFile)
    } catch {
      continue
    }
    if (stat.size > MAX_FILE_BYTES) continue
    let text
    try {
      text = await fs.readFile(safeFile, 'utf8')
    } catch {
      continue
    }
    const idx = text.toLowerCase().indexOf(needle)
    const rel = path.relative(path.resolve(root), file)
    if (idx === -1) {
      // Also allow filename matches so titles are findable.
      if (rel.toLowerCase().includes(needle)) {
        results.push({ path: rel, snippet: text.slice(0, MAX_SNIPPET_CHARS) })
      }
      continue
    }
    const start = Math.max(0, idx - 200)
    results.push({ path: rel, snippet: text.slice(start, start + MAX_SNIPPET_CHARS) })
  }
  return {
    ok: true,
    message: results.length ? `Found ${results.length} match(es).` : 'No matching notes.',
    results,
  }
}

/** Read one named file from within the notes root. */
export async function readNote(root, requestedPath) {
  const resolved = await resolveRealNote(root, String(requestedPath || ''))
  if (!resolved) {
    return { ok: false, message: 'Note is missing or outside the configured notes root; refused.' }
  }
  let stat
  try {
    stat = await fs.stat(resolved)
  } catch {
    return { ok: false, message: 'Note not found.' }
  }
  if (!stat.isFile()) return { ok: false, message: 'Not a file.' }
  if (!TEXT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    return { ok: false, message: 'Unsupported file type.' }
  }
  if (stat.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'Note too large to return.' }
  }
  const text = await fs.readFile(resolved, 'utf8')
  return {
    ok: true,
    message: 'ok',
    path: path.relative(path.resolve(root), resolved),
    content: text.slice(0, MAX_SNIPPET_CHARS * 4),
  }
}
