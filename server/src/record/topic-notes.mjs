/**
 * Read-only access to the markdown notes behind a compiled topic, for the
 * in-app notes reader (GET /api/record/topics/:topicId/notes[/file]).
 *
 * Where a topic's notes live, first existing directory wins:
 *   1. RECORD_LEARN_DIR/<topicId>/notes/            (video pipeline installs here)
 *   2. RECORD_NOTES_DIR/<manifest.folderHint>/<manifest.topic.title>/
 *   3. RECORD_NOTES_DIR/<manifest.topic.title>/
 *
 * Clients pass a topicId plus a relative note path. The path is normalised,
 * must end in .md, and is resolved through realpath; anything that leaves the
 * topic's notes root (.., absolute paths, symlinks pointing out) is refused.
 * Note text is data: it is returned verbatim and never logged.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_FILES = 2000
const MAX_DEPTH = 6
const MAX_NOTE_BYTES = 1024 * 1024

export class NotesError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function inside(root, candidate) {
  const rel = path.relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Child directory by name, tolerating NFC/NFD differences (macOS / zip-extracted Chinese names). */
async function childDir(parent, name) {
  const direct = await realDir(path.join(parent, name))
  if (direct) return direct
  try {
    const want = name.normalize('NFC')
    const hit = (await fs.readdir(parent, { withFileTypes: true })).find((e) => e.isDirectory() && e.name.normalize('NFC') === want)
    return hit ? realDir(path.join(parent, hit.name)) : null
  } catch {
    return null
  }
}

async function realDir(p) {
  try {
    const real = await fs.realpath(p)
    const st = await fs.stat(real)
    return st.isDirectory() ? real : null
  } catch {
    return null
  }
}

/** A single path segment taken from manifest text (title / folderHint). */
function segment(s) {
  const v = String(s || '').trim()
  if (!v || v === '.' || v === '..' || /[\\/\0]/.test(v)) return null
  return v
}

const noteTitle = (rel) => path.posix.basename(rel).replace(/\.md$/i, '')

export function createTopicNotes({ notesDir }) {
  const notesRoot = notesDir ? path.resolve(notesDir) : null

  /** Resolve the real notes root of a topic entry (from topics.get). */
  async function rootOf(entry) {
    const topicDir = path.dirname(entry.learnPath)
    const own = await realDir(path.join(topicDir, 'notes'))
    if (own && inside(topicDir, own)) return { root: own, origin: 'topic' }
    if (notesRoot) {
      const realNotesRoot = await realDir(notesRoot)
      const title = segment(entry.manifest.topic?.title)
      const folder = segment(entry.manifest.folderHint)
      if (realNotesRoot && title) {
        const folderDir = folder ? await childDir(realNotesRoot, folder) : null
        for (const real of [folderDir ? await childDir(folderDir, title) : null, await childDir(realNotesRoot, title)]) {
          if (real && inside(realNotesRoot, real)) return { root: real, origin: 'vault' }
        }
      }
    }
    return null
  }

  async function walk(root) {
    const files = []
    async function visit(dir, rel, depth) {
      if (depth > MAX_DEPTH || files.length >= MAX_FILES) return
      let entries = []
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      for (const e of entries) {
        if (files.length >= MAX_FILES) return
        if (e.name.startsWith('.')) continue
        const abs = path.join(dir, e.name)
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) await visit(abs, r, depth + 1)
        else if (e.isFile() && /\.md$/i.test(e.name)) files.push(r)
      }
    }
    await visit(root, '', 0)
    return files
  }

  async function list(entry) {
    const found = await rootOf(entry)
    if (!found) {
      const m = entry.manifest
      const tried = [`${path.join(path.dirname(entry.learnPath), 'notes')}`]
      if (notesRoot) tried.push(path.join(notesRoot, segment(m.folderHint) || '', segment(m.topic?.title) || ''))
      return {
        available: false, origin: null, files: [],
        reason: `没有找到这个主题的笔记原文。已查找：${tried.join('；')}。` +
          (notesRoot ? '' : '未设置 RECORD_NOTES_DIR。') +
          '演示数据请重新执行 npm run demo（会把笔记装进每个主题目录）；用视频生成的旧主题请在资料页点「重新整理」。',
      }
    }
    const files = await walk(found.root)
    return {
      available: true,
      origin: found.origin,
      files: files.map((p) => ({ path: p, title: noteTitle(p), folder: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '' })),
      reason: null,
    }
  }

  async function read(entry, relPath) {
    if (typeof relPath !== 'string' || !relPath || relPath.length > 512 || relPath.includes('\0')) {
      throw new NotesError(400, 'invalid_path', '笔记路径不合法')
    }
    const norm = path.posix.normalize(relPath.replace(/\\/g, '/'))
    if (norm.startsWith('../') || norm === '..' || norm.startsWith('/') || !/\.md$/i.test(norm)) {
      throw new NotesError(400, 'invalid_path', '只能读取主题内的 .md 笔记')
    }
    const found = await rootOf(entry)
    if (!found) throw new NotesError(404, 'notes_unavailable', '这个主题没有笔记原文')
    let real
    try {
      real = await fs.realpath(path.join(found.root, ...norm.split('/')))
    } catch {
      throw new NotesError(404, 'note_not_found', '笔记不存在')
    }
    if (!inside(found.root, real)) throw new NotesError(400, 'invalid_path', '笔记路径指向主题之外，已拒绝')
    const st = await fs.stat(real)
    if (!st.isFile()) throw new NotesError(404, 'note_not_found', '笔记不存在')
    if (st.size > MAX_NOTE_BYTES) throw new NotesError(413, 'note_too_large', '笔记超过 1 MB，无法在应用内打开')
    const text = await fs.readFile(real, 'utf8')
    return { path: norm, title: noteTitle(norm), text, modifiedAt: st.mtime.toISOString() }
  }

  return { list, read, configured: Boolean(notesRoot) }
}
