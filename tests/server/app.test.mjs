import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../../server/src/app.mjs'

async function withServer(env, fn) {
  const { app, ready, reason, config } = await createApp(env)
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    return await fn({ base, ready, reason, config })
  } finally {
    await new Promise((r) => server.close(r))
  }
}

test('unconfigured: /health reports not ready with explicit reason', async () => {
  await withServer({}, async ({ base, ready }) => {
    assert.equal(ready, false)
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'ok')
    assert.equal(body.ready, false)
    assert.match(body.reason, /ASSISTANT_PROVIDER/)
    assert.equal('config' in body, false)
  })
})

test('unconfigured: /api/copilotkit returns explicit 503, never a mock answer', async () => {
  await withServer({}, async ({ base }) => {
    const res = await fetch(`${base}/api/copilotkit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: 'x' }),
    })
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'model_provider_not_configured')
    assert.ok(body.message.length > 0)
  })
})

test('configured (dummy key, no network): ready and /health exposes redacted config', async () => {
  await withServer({ ASSISTANT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-dummy' }, async ({ base, ready }) => {
    assert.equal(ready, true)
    const res = await fetch(`${base}/health`)
    const body = await res.json()
    assert.equal(body.ready, true)
    assert.equal(body.config.provider, 'anthropic')
    assert.equal(body.config.tested, false)
    // the key must not leak anywhere in the health payload
    assert.equal(JSON.stringify(body).includes('sk-dummy'), false)
  })
})

test('configured: /api/copilotkit is mounted (does not hit the 503 branch)', async () => {
  await withServer({ ASSISTANT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-dummy' }, async ({ base }) => {
    // A GET to the endpoint is handled by the runtime (info/route handling),
    // not by our not-configured guard. We only assert the guard didn't fire.
    const res = await fetch(`${base}/api/copilotkit`)
    const text = await res.text()
    assert.equal(res.status === 503 && text.includes('model_provider_not_configured'), false)
  })
})

test('unknown route returns 404 json', async () => {
  await withServer({}, async ({ base }) => {
    const res = await fetch(`${base}/nope`)
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.equal(body.error, 'not_found')
  })
})

test('CORS preflight is answered for the allowed dev origin', async () => {
  await withServer({ ASSISTANT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-dummy' }, async ({ base }) => {
    const res = await fetch(`${base}/api/copilotkit`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
    })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  })
})

test('requests from an unapproved browser origin are rejected before runtime execution', async () => {
  await withServer({}, async ({ base }) => {
    const res = await fetch(`${base}/api/copilotkit`, {
      method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error, 'origin_not_allowed')
  })
})

test('oversized and malformed JSON are rejected before protocol validation', async () => {
  await withServer({}, async ({ base }) => {
    const oversized = await fetch(`${base}/api/copilotkit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(300000) }),
    })
    assert.equal(oversized.status, 413)
    const malformed = await fetch(`${base}/api/copilotkit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    })
    assert.equal(malformed.status, 400)
  })
})
