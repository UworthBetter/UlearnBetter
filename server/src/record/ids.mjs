/**
 * Identifier and SubjectRef helpers (CONTRACTS.md v0.2 「通用约定」).
 *
 * IDs allow only [A-Za-z0-9._\-一-鿿], length 1–120. The path-like
 * IDs "." and ".." match that alphabet, so they are rejected separately
 * wherever an ID could reach the filesystem.
 */

import { createHash, randomUUID } from 'node:crypto'

export const ID_RE = /^[A-Za-z0-9._\-一-鿿]{1,120}$/

export function isId(value) {
  return typeof value === 'string' && ID_RE.test(value)
}

/** An ID that is also safe as a single directory name. */
export function isPathSafeId(value) {
  return isId(value) && value !== '.' && value !== '..'
}

export function newId(prefix) {
  return `${prefix}-${randomUUID()}`
}

export function shortHash(text, length = 16) {
  return createHash('sha1').update(text).digest('hex').slice(0, length)
}

const SEGMENTS = {
  goal: 1, item: 1, topic: 1, concept: 2, procedure: 2, procitem: 3,
}

/**
 * Parse a SubjectRef. Returns null when malformed.
 * relation:<topicId>/<a>~<b> → {kind:'relation', topicId, a, b}
 */
export function parseRef(ref) {
  if (typeof ref !== 'string' || ref.length > 400) return null
  const colon = ref.indexOf(':')
  if (colon <= 0) return null
  const kind = ref.slice(0, colon)
  const rest = ref.slice(colon + 1)
  if (kind === 'relation') {
    const slash = rest.indexOf('/')
    if (slash <= 0) return null
    const topicId = rest.slice(0, slash)
    const pair = rest.slice(slash + 1).split('~')
    if (pair.length !== 2 || !isId(topicId) || !isId(pair[0]) || !isId(pair[1])) return null
    return { kind, topicId, a: pair[0], b: pair[1] }
  }
  const count = SEGMENTS[kind]
  if (!count) return null
  const parts = rest.split('/')
  if (parts.length !== count || !parts.every(isId)) return null
  if (kind === 'goal') return { kind, goalId: parts[0] }
  if (kind === 'item') return { kind, itemId: parts[0] }
  if (kind === 'topic') return { kind, topicId: parts[0] }
  if (kind === 'concept') return { kind, topicId: parts[0], conceptId: parts[1] }
  if (kind === 'procedure') return { kind, topicId: parts[0], procId: parts[1] }
  return { kind, topicId: parts[0], procId: parts[1], itemId: parts[2] }
}

export const ref = {
  goal: (id) => `goal:${id}`,
  item: (id) => `item:${id}`,
  topic: (id) => `topic:${id}`,
  concept: (t, c) => `concept:${t}/${c}`,
  procedure: (t, p) => `procedure:${t}/${p}`,
  procitem: (t, p, i) => `procitem:${t}/${p}/${i}`,
}

/**
 * Normalize a concept label for same-name candidates: NFKC (full/half
 * width), lowercase, drop bracketed annotations (半角/全角括号), and remove
 * all whitespace. Candidates are only proposed, never merged.
 */
export function normalizeLabel(label) {
  let s = String(label ?? '').normalize('NFKC').toLowerCase()
  // NFKC maps full-width brackets to ASCII ones; strip repeatedly for nesting.
  let prev
  do {
    prev = s
    s = s.replace(/\([^()]*\)|\[[^[\]]*\]|【[^【】]*】|〔[^〔〕]*〕/g, '')
  } while (s !== prev)
  return s.replace(/\s+/gu, '')
}

/** Folder normalization shared with the Python organizer: NFKC, trim, lowercase. */
export function normalizeFolder(text) {
  return String(text ?? '').normalize('NFKC').trim().toLowerCase()
}

/** Stable JSON with sorted keys, for idempotency comparison. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
