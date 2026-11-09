import { useEffect, useRef, useState } from 'react'
import {
  baseURLRequired,
  buildSettingsPayload,
  describeStatus,
  describeTestResult,
  modelPlaceholder,
  type SettingsForm,
  type SettingsState,
} from './model-settings.ts'

const SETTINGS_ERROR = '设置接口不可用（/api/settings）。确认后端已启动。'

interface PutResult {
  ok: boolean
  ready?: boolean
  config?: SettingsState['config']
  error?: string
  warning?: string
}

interface TestResult {
  ok: boolean
  detail?: string
  error?: string
  modelFound?: boolean | null
}

interface DeleteResult {
  ok: boolean
  ready?: boolean
  reason?: string
  error?: string
}

function isSettingsState(json: unknown): json is SettingsState {
  return typeof json === 'object' && json !== null && 'providers' in json && 'settings' in json
}

async function settingsFetch(method: string, path = '', body?: unknown) {
  const res = await fetch(`/api/settings${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json }
}

export function ModelSettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (ready: boolean) => void }) {
  const [state, setState] = useState<SettingsState | null>(null)
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    let live = true
    void settingsFetch('GET').then(({ status, json }) => {
      if (!live) return
      if (status === 200 && isSettingsState(json)) {
        setState(json)
        setForm({
          provider: json.settings.provider ?? json.providers[0]?.id ?? 'openai',
          apiKey: '',
          model: json.settings.model ?? '',
          baseURL: json.settings.baseURL ?? '',
        })
      } else {
        setBanner({ ok: false, text: SETTINGS_ERROR })
      }
    }, () => {
      if (live) setBanner({ ok: false, text: SETTINGS_ERROR })
    })
    return () => { live = false }
  }, [])

  // ESC closes the dialog first; the assistant panel skips its own ESC while
  // this dialog is mounted (see settingsOpen in GlobalAssistant).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [state])

  const providers = state?.providers ?? []
  const canSubmit = form !== null && providers.length > 0

  function patch(part: Partial<SettingsForm>) {
    setForm((current) => (current === null ? current : { ...current, ...part }))
  }

  /** Re-read /api/settings after a mutation so the dialog shows server truth. */
  async function refreshForm() {
    const { status, json } = await settingsFetch('GET')
    if (status !== 200 || !isSettingsState(json)) return
    setState(json)
    setForm((current) => (current === null ? current : {
      provider: json.settings.provider ?? json.providers[0]?.id ?? current.provider,
      apiKey: '',
      model: json.settings.model ?? '',
      baseURL: json.settings.baseURL ?? '',
    }))
  }

  async function testConnection() {
    if (!form) return
    setBusy(true)
    setBanner(null)
    try {
      const { status, json } = await settingsFetch('POST', '/test', buildSettingsPayload(form))
      if (status === 200 && json && typeof json === 'object' && 'ok' in json) {
        const data = json as TestResult
        setBanner({ ok: data.ok === true, text: describeTestResult(data, form.model.trim()) })
      } else {
        setBanner({ ok: false, text: `测试失败：HTTP ${status}` })
      }
    } catch {
      setBanner({ ok: false, text: SETTINGS_ERROR })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!form) return
    setBusy(true)
    setBanner(null)
    try {
      const { status, json } = await settingsFetch('PUT', '', buildSettingsPayload(form))
      const data = (json ?? {}) as PutResult
      if (status === 200 && data.ok) {
        setBanner({
          ok: true,
          text: `已保存并生效${data.config ? `：${data.config.providerLabel} · ${data.config.model}` : ''}。\n${data.warning ?? '若助手仍显示未连接，刷新页面即可。'}`,
        })
        onSaved?.(data.ready ?? true)
        await refreshForm()
      } else {
        setBanner({ ok: false, text: `保存失败：${data.error ?? `HTTP ${status}`}` })
      }
    } catch {
      setBanner({ ok: false, text: SETTINGS_ERROR })
    } finally {
      setBusy(false)
    }
  }

  async function clearSaved() {
    if (!window.confirm('清除已保存的模型配置，回到环境变量状态？')) return
    setBusy(true)
    setBanner(null)
    try {
      const { status, json } = await settingsFetch('DELETE')
      const data = (json ?? {}) as DeleteResult
      if (status === 200 && data.ok) {
        setBanner({
          ok: true,
          text: data.ready ? '已清除，当前使用环境变量配置。' : '已清除。当前无模型配置，助手将无法回答。',
        })
        onSaved?.(data.ready ?? false)
        await refreshForm()
      } else {
        setBanner({ ok: false, text: `清除失败：${data.error ?? `HTTP ${status}`}` })
      }
    } catch {
      setBanner({ ok: false, text: SETTINGS_ERROR })
    } finally {
      setBusy(false)
    }
  }

  const apiKeyHint = state?.settings.apiKeyMasked
    ? `已保存：${state.settings.apiKeyMasked}（留空保持不变）`
    : '未设置。'

  return (
    <div
      className="ula-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="ula-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ula-settings-title"
        data-testid="model-settings-dialog"
      >
        <header className="ula-modal-head">
          <div>
            <p className="ula-kicker">UlearnBetter</p>
            <h2 id="ula-settings-title">模型设置</h2>
          </div>
          <button type="button" className="ula-text-button" onClick={onClose} disabled={busy}>关闭</button>
        </header>

        <p className="ula-modal-status" data-testid="model-settings-status">
          {state ? describeStatus(state) : '正在读取配置…'}
        </p>

        {form && (
          <form
            className="ula-modal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <label className="ula-field">
              <span>Provider</span>
              <select
                ref={firstFieldRef}
                value={form.provider}
                disabled={busy}
                data-testid="model-settings-provider"
                onChange={(event) => patch({ provider: event.target.value })}
              >
                {providers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}{option.requiresBaseUrl ? '（需 Base URL）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="ula-field">
              <span>API Key</span>
              <input
                type="password"
                value={form.apiKey}
                disabled={busy}
                spellCheck={false}
                placeholder="未设置"
                data-testid="model-settings-key"
                onChange={(event) => patch({ apiKey: event.target.value })}
              />
              <small>{apiKeyHint}</small>
            </label>
            <label className="ula-field">
              <span>模型（留空用默认）</span>
              <input
                type="text"
                value={form.model}
                disabled={busy}
                spellCheck={false}
                placeholder={modelPlaceholder(providers, form.provider)}
                data-testid="model-settings-model"
                onChange={(event) => patch({ model: event.target.value })}
              />
            </label>
            <label className="ula-field">
              <span>Base URL{baseURLRequired(providers, form.provider) ? '（必填）' : '（可选）'}</span>
              <input
                type="text"
                value={form.baseURL}
                disabled={busy}
                spellCheck={false}
                placeholder="例如 https://open.bigmodel.cn/api/coding/paas/v4"
                data-testid="model-settings-baseurl"
                onChange={(event) => patch({ baseURL: event.target.value })}
              />
            </label>

            <div className="ula-modal-actions">
              <button type="button" className="ula-text-button" disabled={!canSubmit || busy} onClick={() => { void testConnection() }}>
                测试连接
              </button>
              <button type="submit" className="ula-text-button ula-pri" disabled={!canSubmit || busy} data-testid="model-settings-save">
                保存并生效
              </button>
              <span className="ula-modal-gap" />
              <button
                type="button"
                className="ula-text-button ula-danger"
                disabled={busy || state?.settings.source !== 'file'}
                onClick={() => { void clearSaved() }}
              >
                清除已保存配置
              </button>
            </div>
          </form>
        )}

        {banner && (
          <p className={banner.ok ? 'ula-modal-msg ula-modal-msg-ok' : 'ula-modal-msg ula-modal-msg-bad'} data-testid="model-settings-msg">
            {banner.text}
          </p>
        )}

        <p className="ula-modal-note">
          「测试连接」调用免费模型列表接口，不消耗额度、不保存。密钥只保存在本机后端，不进入仓库或日志。
        </p>
      </div>
    </div>
  )
}
