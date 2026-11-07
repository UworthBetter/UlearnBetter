/**
 * Persistent model-API settings behind the /settings page.
 *
 * The file lives under the gitignored server/.data/ directory, so keys saved
 * from the UI never reach the repository, the frontend or logs. Only the four
 * model-facing fields are managed here; everything else stays env-driven.
 *
 * Precedence: a non-empty field saved in the file overrides the matching
 * ASSISTANT_* environment variable; an empty field falls back to env/default.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.data/settings.json',
)

const MASK_CHAR = '•'

/** Redact an API key for display. Never returns the raw key. */
export function maskKey(key) {
  if (typeof key !== 'string' || key.length === 0) return null
  if (key.length <= 8) return MASK_CHAR.repeat(8)
  return `${key.slice(0, 3)}${MASK_CHAR.repeat(4)}${key.slice(-4)}`
}

/** True for values produced by maskKey() — form round-trips them unchanged. */
export function isMaskedKey(value) {
  return typeof value === 'string' && value.includes(MASK_CHAR)
}

/** Drop unknown keys and empty strings; keep only the four managed fields. */
export function normalizeSettings(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const key of ['provider', 'apiKey', 'model', 'baseURL']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim()
  }
  return out
}

/**
 * Overlay saved settings onto an env map. Non-empty file fields win over env;
 * empty file fields leave the env value (or its absence) in place.
 */
export function mergeEnvWithSettings(env, settings) {
  const merged = { ...env }
  const file = normalizeSettings(settings)
  if (file.provider) merged.ASSISTANT_PROVIDER = file.provider
  if (file.apiKey) merged.ASSISTANT_API_KEY = file.apiKey
  if (file.model) merged.ASSISTANT_MODEL = file.model
  if (file.baseURL) merged.ASSISTANT_BASE_URL = file.baseURL
  return merged
}

/**
 * @param {string} [filePath] override for tests
 */
export function createSettingsStore(filePath = DEFAULT_FILE) {
  async function load() {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      return normalizeSettings(JSON.parse(raw))
    } catch (err) {
      if (err?.code === 'ENOENT') return {}
      // Corrupt file: treat as unset rather than refusing to boot. Saving from
      // the UI rewrites it.
      // eslint-disable-next-line no-console
      console.warn(`[settings] could not read ${filePath}, ignoring: ${err?.message || err}`)
      return {}
    }
  }

  async function save(settings) {
    const clean = normalizeSettings(settings)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
    return clean
  }

  async function clear() {
    await fs.rm(filePath, { force: true })
  }

  return { file: filePath, load, save, clear }
}
