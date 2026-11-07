import assert from 'node:assert/strict'
import test from 'node:test'
import {
  baseURLRequired,
  buildSettingsPayload,
  describeStatus,
  describeTestResult,
  findProvider,
  isMaskedValue,
  modelPlaceholder,
  sourceLabel,
} from '../concept-graph/src/assistant/ui/model-settings.ts'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', requiresBaseUrl: false },
  { id: 'openai-compatible', label: 'OpenAI-compatible endpoint', defaultModel: '', requiresBaseUrl: true },
]

test('buildSettingsPayload：空密钥与打码密钥都表示沿用已保存密钥', () => {
  assert.deepEqual(
    buildSettingsPayload({ provider: 'openai', apiKey: 'sk-new', model: ' gpt-4o ', baseURL: '' }),
    { provider: 'openai', apiKey: 'sk-new', model: 'gpt-4o', baseURL: '' },
  )
  assert.equal(
    buildSettingsPayload({ provider: 'openai', apiKey: '', model: '', baseURL: '' }).apiKey,
    '',
  )
  assert.equal(
    buildSettingsPayload({ provider: 'openai', apiKey: 'sk-••••7890', model: '', baseURL: '' }).apiKey,
    '',
  )
})

test('isMaskedValue 识别打码圆点', () => {
  assert.equal(isMaskedValue('sk-••••7890'), true)
  assert.equal(isMaskedValue('sk-plain-key'), false)
  assert.equal(isMaskedValue(''), false)
})

test('provider 元信息查找与提示', () => {
  assert.equal(findProvider(PROVIDERS, 'openai-compatible')?.requiresBaseUrl, true)
  assert.equal(findProvider(PROVIDERS, 'nope'), null)
  assert.equal(modelPlaceholder(PROVIDERS, 'openai'), '默认：gpt-4o-mini')
  assert.equal(modelPlaceholder(PROVIDERS, 'openai-compatible'), '必填，例如 glm-5.3-flash')
  assert.equal(baseURLRequired(PROVIDERS, 'openai'), false)
  assert.equal(baseURLRequired(PROVIDERS, 'openai-compatible'), true)
})

test('describeStatus：就绪与未配置两种口径', () => {
  const ready = {
    ready: true,
    reason: null,
    config: { provider: 'openai-compatible', providerLabel: 'OpenAI-compatible endpoint', model: 'glm-5.3-flash', baseURL: 'https://x/v4' },
    settings: { source: 'file', provider: 'openai-compatible', model: 'glm-5.3-flash', baseURL: 'https://x/v4', apiKeySet: true, apiKeyMasked: 'sk-••••7890' },
    providers: PROVIDERS,
  }
  assert.equal(describeStatus(ready), 'OpenAI-compatible endpoint · glm-5.3-flash · https://x/v4 · 配置来源：设置弹窗')
  const notReady = { ...ready, ready: false, reason: 'ASSISTANT_PROVIDER is not set.', config: null }
  assert.equal(describeStatus(notReady), 'ASSISTANT_PROVIDER is not set.')
})

test('sourceLabel', () => {
  assert.equal(sourceLabel('file'), '设置弹窗')
  assert.equal(sourceLabel('env'), '环境变量')
  assert.equal(sourceLabel(null), '未配置')
})

test('describeTestResult：包含模型命中提示', () => {
  assert.equal(
    describeTestResult({ ok: true, detail: '连接成功。', modelFound: true }, 'glm-5.3-flash'),
    '连接成功。\n模型 glm-5.3-flash 在返回列表中。',
  )
  assert.equal(
    describeTestResult({ ok: true, detail: '连接成功。', modelFound: false }, 'glm-x'),
    '连接成功。\n注意：返回的模型列表中没有「glm-x」，请核对模型名。',
  )
  assert.equal(
    describeTestResult({ ok: false, detail: 'HTTP 401：invalid', modelFound: null }, ''),
    'HTTP 401：invalid',
  )
  assert.equal(describeTestResult({ ok: false }, ''), '测试失败。')
})
