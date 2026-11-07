import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../server/src/app.mjs'
import { SYSTEM_INSTRUCTIONS } from '../../server/src/runtime.mjs'

// A local protocol fixture, not a real model. No API key or external request.
test('AG-UI streams a compatible Chat Completions response with server instructions and frozen context', async (t) => {
  const calls = []
  const notesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ulb-protocol-'))
  t.after(() => fs.rm(notesRoot, { recursive: true, force: true }))
  await fs.writeFile(path.join(notesRoot, 'ma.md'), 'MA 是滑动平均。')
  const model = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    calls.push({ path: req.url, body })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const querying = body.messages.some((m) => m.role === 'user' && m.content === '查笔记')
    const tool = body.messages.find((m) => m.role === 'tool')
    const chunks = querying && !tool ? [
      [{ role: 'assistant', tool_calls: [{ index: 0, id: 'lookup', type: 'function', function: { name: 'search_notes', arguments: '{"query":"MA"}' } }] }, null],
      [{}, 'tool_calls'],
    ] : [
      [{ role: 'assistant', content: '本地协议测试回答' }, null], [{}, 'stop'],
    ]
    for (const [delta, finish_reason] of chunks) res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    res.end('data: [DONE]\n\n')
  })
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { model.closeAllConnections(); model.close(resolve) }))
  const { app, ready } = await createApp({
    ASSISTANT_PROVIDER: 'openai-compatible', ASSISTANT_API_KEY: 'local-fixture-not-a-real-key',
    ASSISTANT_MODEL: 'fixture-model', ASSISTANT_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
    ASSISTANT_NOTES_ROOT: notesRoot, ASSISTANT_MAX_TOOL_CALLS: '1',
  })
  assert.equal(ready, true)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/copilotkit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      method: 'agent/run', params: { agentId: 'default' }, body: {
        threadId: randomUUID(), runId: randomUUID(), state: {}, tools: [],
        messages: [{ id: randomUUID(), role: 'user', content: '解释我选中的卡片' }],
        context: [{ description: 'question snapshot', value: JSON.stringify({ concept: 'ma', n: 20 }) }],
        forwardedProps: { prompt: 'client must not replace server instructions' },
      },
    }), signal: AbortSignal.timeout(15000),
  })
  const stream = await response.text()
  assert.equal(response.status, 200, stream)
  assert.match(stream, /TEXT_MESSAGE_CONTENT/)
  assert.match(stream, /本地协议测试回答/)
  assert.match(stream, /RUN_FINISHED/)
  assert.ok(!stream.includes('RUN_ERROR'), stream)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/v1/chat/completions')
  const system = calls[0].body.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  assert.ok(system.includes(SYSTEM_INSTRUCTIONS))
  assert.match(system, /"concept":"ma"/)
  assert.ok(!system.includes('client must not replace server instructions'))

  // With a one-call allowance, two independent requests must both be able to
  // read notes. The old global/thread counter exhausted future questions.
  for (let run = 0; run < 2; run++) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/copilotkit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ method: 'agent/run', params: { agentId: 'default' }, body: {
        threadId: randomUUID(), runId: randomUUID(), state: {}, tools: [], context: [],
        messages: [{ id: randomUUID(), role: 'user', content: '查笔记' }], forwardedProps: {},
      } }), signal: AbortSignal.timeout(15000),
    })
    const text = await response.text()
    assert.match(text, /本地协议测试回答/)
    assert.ok(!text.includes('RUN_ERROR'), text)
    const providerRequest = calls.at(-1).body
    const result = providerRequest.messages.find((m) => m.role === 'tool')
    assert.ok(result, 'server tool result must be sent back to model')
    assert.ok(!result.content.includes('exhausted'), result.content)
    assert.match(result.content, /ma\.md/)
  }
})
