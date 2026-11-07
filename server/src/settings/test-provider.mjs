/**
 * Connectivity check for model-API settings, used by the /settings page's
 * "测试连接" button. It calls each provider's free model-list endpoint, so it
 * validates the key and base URL without spending tokens. Nothing is saved and
 * the key never appears in the result or in logs.
 */

const DEFAULT_TIMEOUT_MS = 10000

function joinUrl(base, pathname) {
  return `${String(base).replace(/\/+$/, '')}${pathname}`
}

function requestFor(settings) {
  const bearer = { Authorization: `Bearer ${settings.apiKey}` }
  switch (settings.provider) {
    case 'anthropic':
      return {
        url: joinUrl(settings.baseURL || 'https://api.anthropic.com', '/v1/models'),
        headers: { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
      }
    case 'openai':
      return {
        url: joinUrl(settings.baseURL || 'https://api.openai.com/v1', '/models'),
        headers: bearer,
      }
    case 'openai-compatible':
      // baseURL is required for this provider; no sensible default exists.
      return {
        url: joinUrl(settings.baseURL, '/models'),
        headers: bearer,
      }
    case 'google':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models',
        headers: { 'x-goog-api-key': settings.apiKey },
      }
    case 'groq':
      return {
        url: joinUrl(settings.baseURL || 'https://api.groq.com', '/openai/v1/models'),
        headers: bearer,
      }
    default:
      return null
  }
}

/** Collect model ids from the two common list shapes (id / models[].name). */
function extractModelIds(json) {
  const ids = []
  if (Array.isArray(json?.data)) {
    for (const row of json.data) if (typeof row?.id === 'string') ids.push(row.id)
  }
  if (Array.isArray(json?.models)) {
    for (const row of json.models) if (typeof row?.name === 'string') ids.push(row.name)
  }
  return ids
}

/** Best-effort check that the configured model appears in the listed ids. */
function findModel(ids, model) {
  if (!model || ids.length === 0) return null
  const lower = ids.map((id) => id.toLowerCase())
  const target = model.toLowerCase()
  if (lower.includes(target)) return true
  // Google lists names like "models/gemini-1.5-flash".
  if (lower.some((id) => id.endsWith(`/${target}`))) return true
  return false
}

function redact(text, secret) {
  if (typeof text !== 'string' || !secret) return text
  return text.split(secret).join('***')
}

function clip(text, max = 300) {
  if (typeof text !== 'string' || text.length <= max) return text
  return `${text.slice(0, max)}…`
}

/**
 * @param {{provider: string, apiKey: string, model?: string, baseURL?: string}} settings
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, detail: string, httpStatus?: number, modelFound?: boolean|null}>}
 *   Never throws; never includes the raw key in `detail`.
 */
export async function testProviderConnection(settings, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const spec = requestFor(settings)
  if (!spec) {
    return { ok: false, detail: `不支持的 provider "${settings.provider}"。` }
  }
  if (!settings.apiKey) {
    return { ok: false, detail: '缺少 API Key，无法测试。' }
  }
  if (settings.provider === 'openai-compatible' && !settings.baseURL) {
    return { ok: false, detail: 'openai-compatible 必须填写 Base URL 才能测试。' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(spec.url, {
      method: 'GET',
      headers: spec.headers,
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON body is fine */
    }
    const secret = settings.apiKey
    if (res.ok) {
      const ids = extractModelIds(json)
      return {
        ok: true,
        httpStatus: res.status,
        modelFound: findModel(ids, settings.model),
        detail:
          ids.length > 0
            ? `连接成功，密钥有效（返回 ${ids.length} 个模型）。`
            : '连接成功（接口可达且接受了密钥，但未返回模型列表）。',
      }
    }
    const message =
      (typeof json?.error?.message === 'string' && json.error.message) ||
      (typeof json?.message === 'string' && json.message) ||
      clip(text, 200) ||
      '无响应内容'
    return {
      ok: false,
      httpStatus: res.status,
      detail: `HTTP ${res.status}：${clip(redact(message, secret))}`,
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, detail: `请求超时（${timeoutMs}ms）：${spec.url}` }
    }
    return { ok: false, detail: clip(redact(String(err?.message || err), settings.apiKey)) }
  } finally {
    clearTimeout(timer)
  }
}
