/**
 * HTTP surface for the assistant backend.
 *
 * Public entry points (fixed by CONTRACTS.md):
 *   GET  /health          — liveness + redacted config / readiness.
 *   ALL  /api/copilotkit   — CopilotKit runtime endpoint (the protocol the
 *                            frontend @copilotkit/react-core talks to).
 *
 * Additional self-hosted admin surface:
 *   GET  /settings         — model-API settings page (single HTML file).
 *   *    /api/settings*    — get/test/save/clear model config at runtime.
 *
 * Model configuration is hot-swappable: it resolves env vars overlaid with the
 * settings file (server/.data/settings.json, gitignored; see settings/store.mjs
 * for precedence). Saving from the settings page rebuilds the CopilotKit
 * runtime in place — no restart needed. When no model provider is configured
 * the backend does NOT invent answers: /health reports not-ready with the
 * explicit reason, and /api/copilotkit returns HTTP 503 with that reason.
 */

import express from 'express'
import { copilotRuntimeNodeHttpEndpoint } from '@copilotkit/runtime'
import { loadConfig, describeConfig, ConfigError, parseOrigins } from './config.mjs'
import { buildRuntime } from './runtime.mjs'
import { buildServiceAdapter } from './providers.mjs'
import { loadRecordConfig } from './record/config.mjs'
import { createRecordService } from './record/service.mjs'
import { createRecordRouter } from './record/routes.mjs'
import { createSettingsStore, mergeEnvWithSettings } from './settings/store.mjs'
import { createSettingsRouter } from './settings/routes.mjs'
import { testProviderConnection } from './settings/test-provider.mjs'
import { SETTINGS_PAGE_HTML } from './settings/page.mjs'

function applyCors(res, origin, allowed) {
  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && Array.isArray(allowed) && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CopilotKit-Runtime-Client-GQL-Version')
  res.setHeader('Access-Control-Max-Age', '600')
}

/**
 * Build the Express app.
 *
 * The record layer (/api/record/*) is independent of the model
 * configuration: it works when no provider is configured.
 *
 * @param {Record<string,string|undefined>} env
 * @param {{record?: {now?: () => Date, organizer?: object, llm?: object}, settingsStore?: object, testProvider?: Function}} [options] test hooks
 * @returns {Promise<{ app: import('express').Express, ready: boolean, reason: string|null, config: object|null, record: object }>}
 */
export async function createApp(env = {}, options = {}) {
  const settingsStore = options.settingsStore ?? createSettingsStore(env.ASSISTANT_SETTINGS_FILE)
  const endpoint = '/api/copilotkit'

  // --- mutable model state; swapped atomically by applySettings() ------------
  let model = { ready: false, reason: null, config: null, adapter: null, runtime: null, handler: null }

  /**
   * Rebuild config → adapter → runtime → CopilotKit handler from env overlaid
   * with `settings`, then swap the live state in one assignment. Construction
   * is offline, so this never waits on the provider; a failure leaves the
   * previous state untouched.
   */
  const applySettings = async (settings) => {
    const effEnv = mergeEnvWithSettings(env, settings)
    const config = loadConfig(effEnv) // throws ConfigError with a key-free message
    const adapter = await buildServiceAdapter(config)
    const runtime = buildRuntime(config, adapter, { record })
    const handler = copilotRuntimeNodeHttpEndpoint({
      endpoint,
      runtime,
      serviceAdapter: adapter,
      logLevel: config.logLevel,
      cors: { origin: config.allowedOrigins === '*' ? '*' : config.allowedOrigins },
    })
    model = { ready: true, reason: null, config, adapter, runtime, handler }
    return { ok: true, config: describeConfig(config) }
  }

  /**
   * After the saved file is dropped the effective config is env-only; the live
   * state must match that reality even when it means becoming not-ready —
   * unlike a rejected PUT, there is nothing saved to keep serving.
   */
  const resetToEnv = async () => {
    try {
      return await applySettings({})
    } catch (err) {
      const message = err instanceof ConfigError
        ? err.message
        : `Provider initialization failed: ${err?.message || 'unknown error'}`
      model = { ready: false, reason: message, config: null, adapter: null, runtime: null, handler: null }
      return { ok: false, error: message }
    }
  }

  // --- initial boot: env + saved settings file --------------------------------
  const initialSettings = await settingsStore.load()

  let bootAdapter = null
  let bootConfig = null
  let reason = null
  try {
    bootConfig = loadConfig(mergeEnvWithSettings(env, initialSettings))
    bootAdapter = await buildServiceAdapter(bootConfig)
  } catch (err) {
    if (err instanceof ConfigError) reason = err.message
    else throw err
  }

  // Record layer: built before the runtime so the assistant can read it, but
  // never dependent on the model being configured.
  const recordConfig = loadRecordConfig(env)
  let llm = { model: null, modelName: null, reason: reason || 'Model provider is not configured (ASSISTANT_PROVIDER).' }
  if (recordConfig.organizer === 'llm' && bootAdapter && typeof bootAdapter.getLanguageModel === 'function') {
    try {
      llm = { model: bootAdapter.getLanguageModel(), modelName: bootConfig.model, reason: null }
    } catch (err) {
      llm = { model: null, modelName: bootConfig.model, reason: `Model initialization failed: ${err?.message || 'unknown error'}` }
    }
  }
  const record = createRecordService(recordConfig, { llm, ...(options.record || {}) })
  await record.init()

  // Complete the runtime wiring with the record service in place.
  if (bootConfig && bootAdapter) {
    try {
      await applySettings(initialSettings)
    } catch (err) {
      reason = `Provider initialization failed: ${err?.message || 'unknown error'}`
    }
  }
  if (!model.ready && reason) model.reason = reason

  const ready = model.ready
  const allowedOrigins = model.config?.allowedOrigins ?? parseOrigins(env.ASSISTANT_ALLOWED_ORIGINS)

  const app = express()
  app.disable('x-powered-by')

  // CORS (applied before body handling; the copilotkit handler reads the body itself).
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && allowedOrigins !== '*' && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'origin_not_allowed' })
    }
    applyCors(res, req.headers.origin, allowedOrigins)
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })

  // The runtime can reconstruct its request from req.body. Bound JSON before
  // protocol schema validation rather than accepting arbitrarily large arrays.
  app.use(endpoint, express.json({ limit: '256kb' }))
  app.use((err, _req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' })
    if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'invalid_json' })
    next(err)
  })

  app.get('/health', async (_req, res) => {
    try { await record.refresh() } catch { /* reported through record.reason */ }
    res.json({
      status: 'ok',
      ready: model.ready,
      ...(model.ready
        ? { config: describeConfig(model.config) }
        : { reason: model.reason }),
      record: record.health(),
    })
  })

  app.use('/api/record', createRecordRouter(record))

  // Self-hosted settings page (same origin as the API it calls).
  app.get('/settings', (_req, res) => res.type('html').send(SETTINGS_PAGE_HTML))
  app.get('/', (_req, res) => res.redirect('/settings'))
  app.use('/api/settings', createSettingsRouter({
    store: settingsStore,
    getModel: () => model,
    applySettings: async (settings) => {
      try {
        return await applySettings(settings)
      } catch (err) {
        if (err instanceof ConfigError) return { ok: false, error: err.message }
        return { ok: false, error: `Provider initialization failed: ${err?.message || 'unknown error'}` }
      }
    },
    resetSettings: () => resetToEnv(),
    ...(options.testProvider ? { testProvider: options.testProvider } : { testProvider: testProviderConnection }),
  }))

  // CopilotKit endpoint: consult the CURRENT handler on every request so a
  // settings save takes effect immediately; 503 with the reason when not ready.
  app.use((req, res, next) => {
    if (req.path !== endpoint && !req.path.startsWith(endpoint + '/')) return next()
    const current = model
    if (!current.ready) {
      return res.status(503).json({
        error: 'model_provider_not_configured',
        message:
          current.reason ||
          'The assistant backend has no model provider configured. See server/README.md.',
      })
    }
    Promise.resolve(current.handler(req, res)).catch((err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'runtime_error', message: err?.message || 'unknown error' })
      }
    })
  })

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  return {
    app,
    ready,
    reason,
    config: model.config ? describeConfig(model.config) : null,
    record,
  }
}
