/**
 * HTTP surface for the assistant backend.
 *
 * Public entry points (fixed by CONTRACTS.md):
 *   GET  /health          — liveness + redacted config / readiness.
 *   ALL  /api/copilotkit   — CopilotKit runtime endpoint (the protocol the
 *                            frontend @copilotkit/react-core talks to).
 *
 * When no model provider is configured the backend does NOT invent answers:
 * /health reports not-ready with the explicit reason, and /api/copilotkit
 * returns HTTP 503 with that reason.
 */

import express from 'express'
import { copilotRuntimeNodeHttpEndpoint } from '@copilotkit/runtime'
import { loadConfig, describeConfig, ConfigError } from './config.mjs'
import { buildRuntime, SYSTEM_INSTRUCTIONS } from './runtime.mjs'
import { buildServiceAdapter } from './providers.mjs'

function applyCors(res, origin, allowed) {
  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (origin && Array.isArray(allowed) && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CopilotKit-Runtime-Client-GQL-Version')
  res.setHeader('Access-Control-Max-Age', '600')
}

/**
 * Build the Express app.
 *
 * @param {Record<string,string|undefined>} env
 * @returns {Promise<{ app: import('express').Express, ready: boolean, reason: string|null, config: object|null }>}
 */
export async function createApp(env = {}) {
  let config = null
  let reason = null
  let adapter = null
  let runtime = null

  try {
    config = loadConfig(env)
  } catch (err) {
    if (err instanceof ConfigError) reason = err.message
    else throw err
  }

  if (config) {
    try {
      adapter = await buildServiceAdapter(config)
      runtime = buildRuntime(config)
    } catch (err) {
      // Adapter construction failed (e.g. a missing optional SDK). Surface it
      // as a readiness problem rather than crashing the health endpoint.
      reason = `Provider initialization failed: ${err?.message || 'unknown error'}`
      adapter = null
      runtime = null
    }
  }

  const ready = Boolean(config && adapter && runtime)
  const allowedOrigins = config?.allowedOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173']
  const endpoint = config?.endpoint ?? '/api/copilotkit'

  const app = express()
  app.disable('x-powered-by')

  // CORS (applied before body handling; the copilotkit handler reads the body itself).
  app.use((req, res, next) => {
    applyCors(res, req.headers.origin, allowedOrigins)
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ready,
      ...(ready ? { config: describeConfig(config) } : { reason }),
    })
  })

  // Build the CopilotKit handler once when ready.
  const copilotHandler = ready
    ? copilotRuntimeNodeHttpEndpoint({
        endpoint,
        runtime,
        serviceAdapter: adapter,
        properties: { instructions: SYSTEM_INSTRUCTIONS },
        logLevel: config.logLevel,
        cors: { origin: allowedOrigins === '*' ? '*' : allowedOrigins },
      })
    : null

  app.use((req, res, next) => {
    if (req.path !== endpoint && !req.path.startsWith(endpoint + '/')) return next()
    if (!ready) {
      return res.status(503).json({
        error: 'model_provider_not_configured',
        message:
          reason ||
          'The assistant backend has no model provider configured. See server/README.md.',
      })
    }
    Promise.resolve(copilotHandler(req, res)).catch((err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'runtime_error', message: err?.message || 'unknown error' })
      }
    })
  })

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  return { app, ready, reason, config: config ? describeConfig(config) : null }
}
