// Tests for the /settings page backing: settings store, REST API, hot-apply,
// and the provider connectivity check. No live model is called; adapters are
// built offline with dummy keys and network calls are mocked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createApp } from '../../server/src/app.mjs'
import {
  createSettingsStore,
  maskKey,
  isMaskedKey,
  mergeEnvWithSettings,
  normalizeSettings,
} from '../../server/src/settings/store.mjs'
import { testProviderConnection } from '../../server/src/settings/test-provider.mjs'
import { tempDir } from './record-helpers.mjs'

const DUMMY_KEY = 'sk-test-1234567890'

async function startApp(t, { env = {}, testProvider } = {}) {
  const settingsFile = path.join(await tempDir(t, 'ulb-settings-'), 'settings.json')
  const data = await tempDir(t, 'ulb-settings-data-')
  const settingsStore = createSettingsStore(settingsFile)
  const { app } = await createApp(
    { RECORD_DATA_DIR: data, ...env },
    { settingsStore, ...(testProvider ? { testProvider } : {}) },
  )
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r) }))
  const base = `http://127.0.0.1:${server.address().port}`
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let json = null
    try { json = await res.json() } catch { /* not json */ }
    return { status: res.status, body: json }
  }
  return { call, settingsFile }
}

test('store: roundtrip drops empty fields, clear removes the file', async (t) => {
  const dir = await tempDir(t)
  const file = path.join(dir, 'settings.json')
  const store = createSettingsStore(file)

  assert.deepEqual(await store.load(), {})
  const saved = await store.save({ provider: 'openai', apiKey: DUMMY_KEY, model: '   ', baseURL: '', junk: 'x' })
  assert.deepEqual(saved, { provider: 'openai', apiKey: DUMMY_KEY })
  assert.deepEqual(await store.load(), { provider: 'openai', apiKey: DUMMY_KEY })

  await store.clear()
  assert.deepEqual(await store.load(), {})
})

test('store: corrupt settings file is ignored, not fatal', async (t) => {
  const dir = await tempDir(t)
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '{not json', 'utf8')
  assert.deepEqual(await createSettingsStore(file).load(), {})
})

test('maskKey / isMaskedKey', () => {
  assert.equal(maskKey(''), null)
  assert.equal(maskKey(undefined), null)
  assert.equal(maskKey('short'), '••••••••')
  assert.equal(maskKey(DUMMY_KEY), 'sk-••••7890')
  assert.equal(isMaskedKey(maskKey(DUMMY_KEY)), true)
  assert.equal(isMaskedKey(DUMMY_KEY), false)
  assert.equal(isMaskedKey(''), false)
})

test('normalizeSettings keeps only the four managed string fields', () => {
  assert.deepEqual(
    normalizeSettings({ provider: ' openai ', apiKey: 'k', model: '', baseURL: null, other: 1 }),
    { provider: 'openai', apiKey: 'k' },
  )
  assert.deepEqual(normalizeSettings(null), {})
})

test('mergeEnvWithSettings: non-empty file fields override env', () => {
  const env = { ASSISTANT_PROVIDER: 'openai', ASSISTANT_MODEL: 'gpt-4o-mini' }
  const merged = mergeEnvWithSettings(env, { provider: 'anthropic', apiKey: 'k', model: '', baseURL: 'https://x/v1' })
  assert.equal(merged.ASSISTANT_PROVIDER, 'anthropic')
  assert.equal(merged.ASSISTANT_API_KEY, 'k')
  assert.equal(merged.ASSISTANT_BASE_URL, 'https://x/v1')
  // empty model in file falls back to env
  assert.equal(merged.ASSISTANT_MODEL, 'gpt-4o-mini')
})

test('settings API: save hot-applies, masks the key, rejects bad input, delete falls back', async (t) => {
  const { call, settingsFile } = await startApp(t)

  // unconfigured boot
  let res = await call('GET', '/api/settings')
  assert.equal(res.status, 200)
  assert.equal(res.body.ready, false)
  assert.equal(res.body.settings.source, null)
  assert.equal(res.body.settings.apiKeySet, false)
  assert.equal(res.body.providers.length, 5)

  res = await call('POST', '/api/copilotkit', {})
  assert.equal(res.status, 503)
  assert.equal(res.body.error, 'model_provider_not_configured')

  // validation
  res = await call('PUT', '/api/settings', {})
  assert.equal(res.status, 400)
  res = await call('PUT', '/api/settings', { provider: 'nope', apiKey: 'k' })
  assert.equal(res.status, 400)
  res = await call('PUT', '/api/settings', { provider: 'openai' })
  assert.equal(res.status, 400) // no key anywhere

  // valid save → hot apply
  res = await call('PUT', '/api/settings', { provider: 'openai', apiKey: DUMMY_KEY })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.ready, true)
  assert.equal(res.body.config.model, 'gpt-4o-mini') // provider default applied

  const onDisk = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
  assert.equal(onDisk.provider, 'openai')
  assert.equal(onDisk.apiKey, DUMMY_KEY)

  // masked in GET; raw key never leaves the server
  res = await call('GET', '/api/settings')
  assert.equal(res.body.ready, true)
  assert.equal(res.body.settings.source, 'file')
  assert.equal(res.body.settings.apiKeyMasked, 'sk-••••7890')
  assert.ok(!JSON.stringify(res.body).includes(DUMMY_KEY))

  res = await call('GET', '/health')
  assert.equal(res.body.ready, true)
  assert.equal(res.body.config.provider, 'openai')

  // /api/copilotkit is no longer 503 (any other status means the runtime took over)
  res = await call('POST', '/api/copilotkit', {})
  assert.notEqual(res.status, 503)

  // failed save keeps the running config intact
  res = await call('PUT', '/api/settings', { provider: 'bogus', apiKey: 'k' })
  assert.equal(res.status, 400)
  res = await call('GET', '/api/settings')
  assert.equal(res.body.ready, true)

  // re-save without the key keeps the stored key
  res = await call('PUT', '/api/settings', { provider: 'openai', apiKey: '', model: 'gpt-4o', baseURL: '' })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.model, 'gpt-4o')
  const onDisk2 = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
  assert.equal(onDisk2.apiKey, DUMMY_KEY)

  // masked value round-trips as "keep"
  res = await call('PUT', '/api/settings', { provider: 'openai', apiKey: 'sk-••••7890' })
  assert.equal(res.status, 200)
  assert.equal(JSON.parse(await fs.readFile(settingsFile, 'utf8')).apiKey, DUMMY_KEY)

  // delete → back to unconfigured
  res = await call('DELETE', '/api/settings')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.ready, false)
  res = await call('GET', '/health')
  assert.equal(res.body.ready, false)
  await assert.rejects(fs.stat(settingsFile))
})

test('settings API: env config boots ready; file overrides; delete falls back to env', async (t) => {
  const { call, settingsFile } = await startApp(t, {
    env: { ASSISTANT_PROVIDER: 'openai', ASSISTANT_API_KEY: 'sk-env-123456789' },
  })

  let res = await call('GET', '/api/settings')
  assert.equal(res.body.ready, true)
  assert.equal(res.body.settings.source, 'env')
  assert.equal(res.body.settings.apiKeySet, false) // env keys are not exposed as saved settings

  res = await call('PUT', '/api/settings', { provider: 'anthropic', apiKey: 'sk-file-123456789', model: 'claude-3-7-sonnet-latest' })
  assert.equal(res.status, 200)
  res = await call('GET', '/api/settings')
  assert.equal(res.body.settings.source, 'file')
  assert.equal(res.body.config.provider, 'anthropic')

  res = await call('DELETE', '/api/settings')
  assert.equal(res.status, 200)
  assert.equal(res.body.ready, true) // env config takes over again
  res = await call('GET', '/health')
  assert.equal(res.body.config.provider, 'openai')
  assert.ok(settingsFile)
})

test('settings API: PUT with a persisted-but-invalid build keeps serving the old config', async (t) => {
  const { call } = await startApp(t, { env: { ASSISTANT_PROVIDER: 'openai', ASSISTANT_API_KEY: 'sk-env-123456789' } })

  // openai-compatible requires baseURL — ConfigError → 400, env config stays live
  const res = await call('PUT', '/api/settings', { provider: 'openai-compatible', apiKey: 'sk-x-123456789' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /ASSISTANT_BASE_URL/)
  const health = await call('GET', '/health')
  assert.equal(health.body.ready, true)
  assert.equal(health.body.config.provider, 'openai')
})

test('testProviderConnection: ok path reports model presence', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
  const result = await testProviderConnection(
    { provider: 'openai', apiKey: DUMMY_KEY, model: 'gpt-4o' },
    { fetchImpl },
  )
  assert.equal(result.ok, true)
  assert.equal(result.modelFound, true)
})

test('testProviderConnection: auth failure redacts the key from the detail', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ error: { message: `invalid key ${DUMMY_KEY}` } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )
  const result = await testProviderConnection({ provider: 'openai', apiKey: DUMMY_KEY }, { fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.httpStatus, 401)
  assert.ok(!result.detail.includes(DUMMY_KEY))
  assert.match(result.detail, /\*\*\*/)
})

test('testProviderConnection: google list shape and model suffix match', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ models: [{ name: 'models/gemini-1.5-flash' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
  const result = await testProviderConnection(
    { provider: 'google', apiKey: 'g-key', model: 'gemini-1.5-flash' },
    { fetchImpl },
  )
  assert.equal(result.ok, true)
  assert.equal(result.modelFound, true)
})

test('testProviderConnection: missing baseURL / key fail fast without network', async () => {
  let called = 0
  const fetchImpl = async () => { called++; throw new Error('should not be called') }
  assert.equal(
    (await testProviderConnection({ provider: 'openai-compatible', apiKey: 'k' }, { fetchImpl })).detail,
    'openai-compatible 必须填写 Base URL 才能测试。',
  )
  assert.equal(
    (await testProviderConnection({ provider: 'openai', apiKey: '' }, { fetchImpl })).detail,
    '缺少 API Key，无法测试。',
  )
  assert.equal(called, 0)
})

test('testProviderConnection: timeouts are reported, not thrown', async () => {
  const fetchImpl = (url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      reject(err)
    })
  })
  const result = await testProviderConnection(
    { provider: 'openai', apiKey: DUMMY_KEY },
    { fetchImpl, timeoutMs: 50 },
  )
  assert.equal(result.ok, false)
  assert.match(result.detail, /超时/)
})

test('settings API: POST /test merges the stored key and never persists', async (t) => {
  let seen = null
  const { call } = await startApp(t, {
    testProvider: async (settings) => { seen = settings; return { ok: true, detail: 'mock ok', httpStatus: 200, modelFound: null } },
  })

  await call('PUT', '/api/settings', { provider: 'openai', apiKey: DUMMY_KEY })
  const res = await call('POST', '/api/settings/test', { provider: 'openai', apiKey: '' })
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(seen.apiKey, DUMMY_KEY) // stored key used, not the empty form value
  assert.equal(seen.provider, 'openai')
})
