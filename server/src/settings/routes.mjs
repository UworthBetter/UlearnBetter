/**
 * REST surface behind the /settings page.
 *
 *   GET    /api/settings        — current settings (API key only ever masked)
 *   PUT    /api/settings        — validate, hot-apply and persist; 400 on error
 *   POST   /api/settings/test   — key/connectivity check against the provider's
 *                                 free model-list endpoint; saves nothing
 *   DELETE /api/settings        — drop the saved file, fall back to env config
 *
 * The router is same-origin with the page it serves; the server itself only
 * listens on 127.0.0.1.
 */

import { Router, json } from 'express'
import { PROVIDERS, describeConfig } from '../config.mjs'
import { maskKey, isMaskedKey } from './store.mjs'

/**
 * Resolve the candidate settings a PUT/POST stands for: the submitted form on
 * top of what is already stored. An empty or still-masked apiKey means "keep
 * the stored key".
 */
export function resolveCandidate(stored, body) {
  const input = body && typeof body === 'object' ? body : {}
  const str = (v) => (typeof v === 'string' ? v.trim() : undefined)

  const apiKeyInput = str(input.apiKey)
  const apiKey =
    apiKeyInput && !isMaskedKey(apiKeyInput) ? apiKeyInput : stored.apiKey

  return {
    provider: str(input.provider),
    apiKey,
    model: str(input.model) ?? '',
    baseURL: str(input.baseURL) ?? '',
  }
}

/**
 * @param {{
 *   store: {load: Function, save: Function, clear: Function},
 *   getModel: () => {ready: boolean, reason: string|null, config: object|null},
 *   applySettings: (settings: object) => Promise<{ok: boolean, config?: object, error?: string}>,
 *   resetSettings: () => Promise<{ok: boolean, config?: object, error?: string}>,
 *   testProvider?: Function,
 * }} deps
 */
export function createSettingsRouter(deps) {
  const router = Router()
  router.use(json({ limit: '64kb' }))
  const testProvider = deps.testProvider

  router.get('/', async (_req, res) => {
    const file = await deps.store.load()
    const model = deps.getModel()
    const source = Object.keys(file).length > 0 ? 'file' : model.config ? 'env' : null
    res.json({
      schema: 'assistant.settings/0.1',
      ready: model.ready,
      reason: model.reason,
      config: model.ready && model.config ? describeConfig(model.config) : null,
      settings: {
        source,
        provider: file.provider ?? model.config?.provider ?? null,
        model: file.model ?? null,
        baseURL: file.baseURL ?? null,
        apiKeySet: Boolean(file.apiKey),
        apiKeyMasked: maskKey(file.apiKey),
      },
      providers: Object.entries(PROVIDERS).map(([id, spec]) => ({
        id,
        label: spec.label,
        defaultModel: spec.defaultModel,
        requiresBaseUrl: Boolean(spec.requiresBaseUrl),
      })),
    })
  })

  router.put('/', async (req, res) => {
    try {
      const stored = await deps.store.load()
      const candidate = resolveCandidate(stored, req.body)

      if (!candidate.provider) {
        return res.status(400).json({ ok: false, error: 'provider 不能为空。' })
      }
      if (!PROVIDERS[candidate.provider]) {
        return res.status(400).json({
          ok: false,
          error: `未知的 provider "${candidate.provider}"。可选：${Object.keys(PROVIDERS).join(', ')}。`,
        })
      }
      if (!candidate.apiKey) {
        return res.status(400).json({ ok: false, error: '缺少 API Key（提交空值且没有已保存的密钥）。' })
      }

      // Build first (offline construction), swap state only on success, then
      // persist. A rejected save leaves the previous working config running.
      const applied = await deps.applySettings(candidate)
      if (!applied.ok) {
        return res.status(400).json({ ok: false, error: applied.error })
      }
      let persisted = true
      try {
        await deps.store.save(candidate)
      } catch (err) {
        persisted = false
        // eslint-disable-next-line no-console
        console.error('[settings] persist failed:', err?.message || err)
      }
      res.status(200).json({
        ok: true,
        ready: true,
        config: applied.config,
        ...(persisted ? {} : { warning: '配置已生效但写入文件失败，重启后将回退。' }),
      })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'unknown error' })
    }
  })

  router.post('/test', async (req, res) => {
    try {
      const stored = await deps.store.load()
      const candidate = resolveCandidate(stored, req.body)
      if (!candidate.provider || !PROVIDERS[candidate.provider]) {
        return res.status(400).json({ ok: false, detail: '请先选择一个有效的 provider。' })
      }
      const result = await testProvider(candidate)
      res.status(200).json({ ok: result.ok, detail: result.detail, httpStatus: result.httpStatus ?? null, modelFound: result.modelFound ?? null })
    } catch (err) {
      res.status(500).json({ ok: false, detail: err?.message || 'unknown error' })
    }
  })

  router.delete('/', async (_req, res) => {
    try {
      await deps.store.clear()
      // resetSettings (not applySettings): dropping the file must also drop a
      // running config that only existed because of it.
      const applied = await deps.resetSettings()
      res.status(200).json({ ok: true, ready: applied.ok, ...(applied.ok ? { config: applied.config } : { reason: applied.error }) })
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'unknown error' })
    }
  })

  return router
}
