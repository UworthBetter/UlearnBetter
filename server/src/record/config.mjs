/**
 * Record-layer configuration. Independent of the model configuration: the
 * record API works with no ASSISTANT_* variables at all.
 *
 *   RECORD_DATA_DIR     decision layer directory (default server/.data/record/)
 *   RECORD_LEARN_DIR    compiled topics directory (unset → empty topic list)
 *   RECORD_ORGANIZER    null | folder | llm | mock   (default folder)
 *   RECORD_AUTO_ACCEPT  auto-accept threshold in [0, 1] (default 0.85)
 *
 * Invalid values do not silently fall back: `error` is set, /health reports
 * it and /api/record/* answers 503 record_misconfigured.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORGANIZER_NAMES } from './organizers/index.mjs'

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../.data/record/', import.meta.url))
export const DEFAULT_AUTO_ACCEPT = 0.85

export function loadRecordConfig(env = {}) {
  const errors = []
  const dataDir = (env.RECORD_DATA_DIR || '').trim() || DEFAULT_DATA_DIR
  const learnDir = (env.RECORD_LEARN_DIR || '').trim() || null
  const organizer = (env.RECORD_ORGANIZER || '').trim() || 'folder'
  if (!ORGANIZER_NAMES.includes(organizer)) {
    errors.push(`RECORD_ORGANIZER「${organizer}」无效，可选：${ORGANIZER_NAMES.join(' / ')}`)
  }
  let autoAccept = DEFAULT_AUTO_ACCEPT
  const rawThreshold = (env.RECORD_AUTO_ACCEPT || '').trim()
  if (rawThreshold) {
    const n = Number(rawThreshold)
    if (!Number.isFinite(n) || n < 0 || n > 1) errors.push(`RECORD_AUTO_ACCEPT「${rawThreshold}」无效，应为 0 到 1 之间的数`)
    else autoAccept = n
  }
  return {
    dataDir: path.resolve(dataDir),
    learnDir: learnDir ? path.resolve(learnDir) : null,
    organizer,
    autoAccept,
    error: errors.length ? errors.join('；') : null,
  }
}
