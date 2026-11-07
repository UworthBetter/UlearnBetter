import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig, describeConfig, ConfigError } from '../../server/src/config.mjs'

test('missing provider is an explicit ConfigError', () => {
  assert.throws(() => loadConfig({}), (e) => e instanceof ConfigError && /ASSISTANT_PROVIDER/.test(e.message))
})

test('unknown provider is rejected', () => {
  assert.throws(
    () => loadConfig({ ASSISTANT_PROVIDER: 'nope', ASSISTANT_API_KEY: 'k' }),
    (e) => e instanceof ConfigError && /Unknown ASSISTANT_PROVIDER/.test(e.message),
  )
})

test('missing api key is an explicit ConfigError (no silent mock)', () => {
  assert.throws(
    () => loadConfig({ ASSISTANT_PROVIDER: 'anthropic' }),
    (e) => e instanceof ConfigError && /No API key/.test(e.message),
  )
})

test('openai-compatible requires a base url', () => {
  assert.throws(
    () => loadConfig({ ASSISTANT_PROVIDER: 'openai-compatible', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'm' }),
    (e) => e instanceof ConfigError && /ASSISTANT_BASE_URL/.test(e.message),
  )
})

test('openai-compatible requires an explicit model', () => {
  assert.throws(
    () =>
      loadConfig({
        ASSISTANT_PROVIDER: 'openai-compatible',
        ASSISTANT_API_KEY: 'k',
        ASSISTANT_BASE_URL: 'https://x/v1',
      }),
    (e) => e instanceof ConfigError && /ASSISTANT_MODEL is required/.test(e.message),
  )
})

test('anthropic happy path with defaults', () => {
  const c = loadConfig({ ASSISTANT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' })
  assert.equal(c.provider, 'anthropic')
  assert.equal(c.adapter, 'anthropic')
  assert.equal(c.apiKey, 'sk-test')
  assert.ok(c.model.length > 0)
  assert.equal(c.port, 4000)
  assert.equal(c.endpoint, '/api/copilotkit')
  assert.deepEqual(c.allowedOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173'])
})

test('explicit overrides are honored and parsed', () => {
  const c = loadConfig({
    ASSISTANT_PROVIDER: 'openai-compatible',
    ASSISTANT_API_KEY: 'k',
    ASSISTANT_BASE_URL: 'https://api.deepseek.com/v1',
    ASSISTANT_MODEL: 'deepseek-chat',
    PORT: '5055',
    ASSISTANT_MAX_TOOL_CALLS: '3',
    ASSISTANT_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
    ASSISTANT_NOTES_ROOT: '/tmp/notes',
  })
  assert.equal(c.model, 'deepseek-chat')
  assert.equal(c.baseURL, 'https://api.deepseek.com/v1')
  assert.equal(c.port, 5055)
  assert.equal(c.maxToolCalls, 3)
  assert.deepEqual(c.allowedOrigins, ['https://a.example', 'https://b.example'])
  assert.equal(c.notesRoot, '/tmp/notes')
})

test('invalid numeric env falls back to defaults', () => {
  const c = loadConfig({ ASSISTANT_PROVIDER: 'anthropic', ASSISTANT_API_KEY: 'k', PORT: 'abc', ASSISTANT_MAX_TOOL_CALLS: '-2' })
  assert.equal(c.port, 4000)
  assert.equal(c.maxToolCalls, 8)
})

test('describeConfig never leaks the api key', () => {
  const c = loadConfig({ ASSISTANT_PROVIDER: 'anthropic', ASSISTANT_API_KEY: 'super-secret' })
  const d = describeConfig(c)
  assert.equal(JSON.stringify(d).includes('super-secret'), false)
  assert.equal(d.provider, 'anthropic')
})

test('wildcard origins parse to *', () => {
  const c = loadConfig({ ASSISTANT_PROVIDER: 'anthropic', ASSISTANT_API_KEY: 'k', ASSISTANT_ALLOWED_ORIGINS: '*' })
  assert.equal(c.allowedOrigins, '*')
})
