/**
 * Pure helpers for the in-app model-settings dialog (see ModelSettingsDialog.tsx).
 * Kept free of React so they can be unit-tested directly like classify-input.
 *
 * The dialog talks to the backend's /api/settings (proxied by Vite). The API
 * key only ever travels to the backend; GET responses carry a masked value
 * only, and the dialog never displays or logs a raw key.
 */

export interface ProviderOption {
  id: string
  label: string
  defaultModel: string
  requiresBaseUrl: boolean
}

export interface SettingsState {
  ready: boolean
  reason: string | null
  config: { provider: string; providerLabel: string; model: string; baseURL: string | null } | null
  settings: {
    source: 'file' | 'env' | null
    provider: string | null
    model: string | null
    baseURL: string | null
    apiKeySet: boolean
    apiKeyMasked: string | null
  }
  providers: ProviderOption[]
}

export interface SettingsForm {
  provider: string
  apiKey: string
  model: string
  baseURL: string
}

/** A value that still contains mask bullets means "keep the stored key". */
export function isMaskedValue(value: string): boolean {
  return value.includes('•')
}

/** Form → PUT payload. Empty or masked key means "keep the stored key". */
export function buildSettingsPayload(form: SettingsForm): SettingsForm {
  const key = form.apiKey.trim()
  return {
    provider: form.provider,
    apiKey: key !== '' && !isMaskedValue(key) ? key : '',
    model: form.model.trim(),
    baseURL: form.baseURL.trim(),
  }
}

export function findProvider(providers: ProviderOption[], id: string): ProviderOption | null {
  return providers.find((option) => option.id === id) ?? null
}

/** Placeholder for the model field, hinting the provider default. */
export function modelPlaceholder(providers: ProviderOption[], providerId: string): string {
  const option = findProvider(providers, providerId)
  if (!option) return ''
  return option.defaultModel ? `默认：${option.defaultModel}` : '必填，例如 glm-5.3-flash'
}

export function baseURLRequired(providers: ProviderOption[], providerId: string): boolean {
  return findProvider(providers, providerId)?.requiresBaseUrl ?? false
}

export function sourceLabel(source: 'file' | 'env' | null): string {
  if (source === 'file') return '设置弹窗'
  if (source === 'env') return '环境变量'
  return '未配置'
}

/** One-line status text shown at the top of the dialog. */
export function describeStatus(state: SettingsState): string {
  if (state.ready && state.config) {
    const parts = [state.config.providerLabel, state.config.model]
    if (state.config.baseURL) parts.push(state.config.baseURL)
    parts.push(`配置来源：${sourceLabel(state.settings.source)}`)
    return parts.join(' · ')
  }
  return state.reason ?? '模型未配置。'
}

/**
 * Human summary for a POST /api/settings/test result; includes the model-list
 * hint when the backend could check the model id.
 */
export function describeTestResult(
  result: { ok: boolean; detail?: string; error?: string; modelFound?: boolean | null },
  model: string,
): string {
  if (result.ok) {
    const lines = [result.detail ?? '连接成功。']
    if (result.modelFound === true && model) lines.push(`模型 ${model} 在返回列表中。`)
    if (result.modelFound === false && model) lines.push(`注意：返回的模型列表中没有「${model}」，请核对模型名。`)
    return lines.join('\n')
  }
  return result.detail ?? result.error ?? '测试失败。'
}
