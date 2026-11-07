/**
 * Environment-driven configuration for the assistant backend.
 *
 * Everything here is a pure function of an `env` object so it can be unit
 * tested without a live process environment. Missing or contradictory
 * configuration raises `ConfigError` with an explicit, key-free message; the
 * backend never silently falls back to a demo/mock answer when a model
 * provider is not configured (see docs/development/CONTRACTS.md).
 */

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

/**
 * Supported providers. All are marked untested against live models until a
 * real key is supplied and reported separately (see server/README.md).
 */
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    adapter: 'anthropic',
    defaultModel: 'claude-3-7-sonnet-latest',
    keyEnv: ['ASSISTANT_API_KEY', 'ANTHROPIC_API_KEY'],
    tested: false,
  },
  openai: {
    label: 'OpenAI',
    adapter: 'openai',
    defaultModel: 'gpt-4o-mini',
    keyEnv: ['ASSISTANT_API_KEY', 'OPENAI_API_KEY'],
    tested: false,
  },
  'openai-compatible': {
    // DeepSeek, Moonshot/Kimi, ModelScope, local vLLM, etc. Requires a base URL.
    label: 'OpenAI-compatible endpoint',
    adapter: 'openai',
    defaultModel: '',
    keyEnv: ['ASSISTANT_API_KEY'],
    requiresBaseUrl: true,
    tested: false,
  },
  google: {
    label: 'Google Generative AI',
    adapter: 'google',
    defaultModel: 'gemini-1.5-flash',
    keyEnv: ['ASSISTANT_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    tested: false,
  },
  groq: {
    label: 'Groq',
    adapter: 'groq',
    defaultModel: 'llama-3.3-70b-versatile',
    keyEnv: ['ASSISTANT_API_KEY', 'GROQ_API_KEY'],
    tested: false,
  },
}

function firstEnv(env, keys) {
  for (const k of keys) {
    const v = env[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return undefined
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return fallback
  return n
}

function parseOrigins(value) {
  if (!value || value.trim() === '') {
    // Vite dev defaults for the concept-graph single-page app.
    return ['http://localhost:5173', 'http://127.0.0.1:5173']
  }
  if (value.trim() === '*') return '*'
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Resolve the full runtime configuration from an environment map.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {{
 *   provider: string, providerLabel: string, adapter: string, tested: boolean,
 *   model: string, apiKey: string, baseURL: string|undefined,
 *   notesRoot: string|undefined, port: number, allowedOrigins: string|string[],
 *   maxToolCalls: number, logLevel: string, endpoint: string
 * }}
 * @throws {ConfigError} when required values are missing or invalid.
 */
export function loadConfig(env = {}) {
  const providerName = (env.ASSISTANT_PROVIDER || '').trim()
  if (!providerName) {
    throw new ConfigError(
      'ASSISTANT_PROVIDER is not set. Set it to one of: ' +
        Object.keys(PROVIDERS).join(', ') +
        '. See server/README.md and server/.env.example.',
    )
  }
  const spec = PROVIDERS[providerName]
  if (!spec) {
    throw new ConfigError(
      `Unknown ASSISTANT_PROVIDER "${providerName}". Supported values: ` +
        Object.keys(PROVIDERS).join(', ') +
        '.',
    )
  }

  const apiKey = firstEnv(env, spec.keyEnv)
  if (!apiKey) {
    throw new ConfigError(
      `No API key found for provider "${providerName}". Set one of: ` +
        spec.keyEnv.join(', ') +
        '. The backend will not answer with a mock when the model is unconfigured.',
    )
  }

  const baseURL = firstEnv(env, ['ASSISTANT_BASE_URL'])
  if (spec.requiresBaseUrl && !baseURL) {
    throw new ConfigError(
      `Provider "${providerName}" requires ASSISTANT_BASE_URL (the OpenAI-compatible endpoint, e.g. https://api.deepseek.com/v1).`,
    )
  }

  const model = (env.ASSISTANT_MODEL || '').trim() || spec.defaultModel
  if (!model) {
    throw new ConfigError(
      `ASSISTANT_MODEL is required for provider "${providerName}" (no safe default is assumed for this provider).`,
    )
  }

  const notesRoot = firstEnv(env, ['ASSISTANT_NOTES_ROOT'])

  return {
    provider: providerName,
    providerLabel: spec.label,
    adapter: spec.adapter,
    tested: spec.tested,
    model,
    apiKey,
    baseURL,
    notesRoot,
    port: parsePositiveInt(env.PORT, 4000),
    allowedOrigins: parseOrigins(env.ASSISTANT_ALLOWED_ORIGINS),
    maxToolCalls: parsePositiveInt(env.ASSISTANT_MAX_TOOL_CALLS, 8),
    logLevel: (env.ASSISTANT_LOG_LEVEL || 'warn').trim(),
    endpoint: '/api/copilotkit',
  }
}

/** Build a redacted view of the config safe to log or return from /health. */
export function describeConfig(config) {
  return {
    provider: config.provider,
    providerLabel: config.providerLabel,
    model: config.model,
    tested: config.tested,
    baseURL: config.baseURL ?? null,
    notesRetrieval: Boolean(config.notesRoot),
    maxToolCalls: config.maxToolCalls,
  }
}
