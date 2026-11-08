/**
 * Self-contained settings page served at /settings (no build step, no CDN).
 * Talks only to same-origin /api/settings and /health. The API key typed here
 * is POSTed once to the backend and afterwards only ever shown masked.
 */
export const SETTINGS_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UlearnBetter · 模型设置</title>
<style>
  :root {
    --bg: #f5f6f8; --card: #ffffff; --line: #e3e6ea; --text: #1f2430;
    --muted: #6b7280; --accent: #4f46e5; --accent-dark: #4338ca;
    --ok: #047857; --ok-bg: #ecfdf5; --bad: #b91c1c; --bad-bg: #fef2f2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.6 system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .wrap { max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 24px; font-size: 13px; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 20px; margin-bottom: 16px;
  }
  .card h2 { font-size: 15px; margin: 0 0 12px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .field { margin-bottom: 14px; }
  .field:last-child { margin-bottom: 0; }
  label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 13px; }
  label .opt { color: var(--muted); font-weight: 400; }
  input, select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--line);
    border-radius: 8px; font: inherit; background: #fff; color: var(--text);
  }
  input:focus, select:focus { outline: 2px solid #c7d2fe; border-color: var(--accent); }
  .hint { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .btn {
    padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line);
    background: #fff; font: inherit; cursor: pointer;
  }
  .btn:hover { background: #f3f4f6; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.primary:hover { background: var(--accent-dark); }
  .btn.danger { color: var(--bad); border-color: #fecaca; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .badge {
    display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-size: 12px; font-weight: 600;
  }
  .badge.ok { background: var(--ok-bg); color: var(--ok); }
  .badge.bad { background: var(--bad-bg); color: var(--bad); }
  .kv { font-size: 13px; color: var(--muted); }
  .kv b { color: var(--text); font-weight: 600; }
  .msg { border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-top: 12px; white-space: pre-wrap; }
  .msg.ok { background: var(--ok-bg); color: var(--ok); display: none; }
  .msg.bad { background: var(--bad-bg); color: var(--bad); display: none; }
  code {
    background: #eef0f3; border-radius: 4px; padding: 1px 5px;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>UlearnBetter 助手 · 模型设置</h1>
  <p class="sub">配置仅保存在本机 <code>server/.data/settings.json</code>（已 gitignore），保存后立即生效，无需重启。密钥不会进入前端、仓库或日志。</p>

  <div class="card">
    <h2>服务状态</h2>
    <div class="row">
      <span id="status-badge" class="badge bad">加载中…</span>
      <span class="kv" id="status-detail"></span>
    </div>
    <div class="kv" id="record-detail" style="margin-top:8px"></div>
  </div>

  <div class="card">
    <h2>模型 API</h2>
    <form id="form" autocomplete="off">
      <div class="field">
        <label for="provider">Provider</label>
        <select id="provider"></select>
      </div>
      <div class="field">
        <label for="apiKey">API Key</label>
        <input id="apiKey" type="password" placeholder="未设置" spellcheck="false">
        <div class="hint" id="apiKey-hint"></div>
      </div>
      <div class="field">
        <label for="model">模型 <span class="opt">（留空用默认）</span></label>
        <input id="model" type="text" placeholder="" spellcheck="false">
      </div>
      <div class="field">
        <label for="baseURL">Base URL <span class="opt" id="baseURL-req"></span></label>
        <input id="baseURL" type="text" placeholder="仅 openai-compatible 必填，例如 https://api.deepseek.com/v1" spellcheck="false">
        <div class="hint">也可用于把原生 provider 指向代理。</div>
      </div>
    </form>
    <div class="row" style="margin-top:16px">
      <button class="btn" id="test-btn" type="button">测试连接</button>
      <button class="btn primary" id="save-btn" type="button">保存并生效</button>
      <span style="flex:1"></span>
      <button class="btn danger" id="clear-btn" type="button">清除已保存配置</button>
    </div>
    <div class="msg ok" id="ok-msg"></div>
    <div class="msg bad" id="bad-msg"></div>
    <div class="hint" style="margin-top:12px">「测试连接」调用各家的免费模型列表接口验证密钥，不消耗额度、不保存任何内容。</div>
  </div>
</div>

<script>
(function () {
  'use strict'
  var $ = function (id) { return document.getElementById(id) }
  var providers = []
  var maskedKey = null

  function show(el, text) { el.textContent = text; el.style.display = 'block' }
  function hideAll() { $('ok-msg').style.display = 'none'; $('bad-msg').style.display = 'none' }
  function ok(text) { hideAll(); show($('ok-msg'), text) }
  function bad(text) { hideAll(); show($('bad-msg'), text) }
  function busy(on) {
    $('test-btn').disabled = on; $('save-btn').disabled = on; $('clear-btn').disabled = on
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (json) {
        return { status: res.status, json: json }
      })
    })
  }

  function renderStatus(get) {
    var badge = $('status-badge'), detail = $('status-detail')
    if (get.ready) {
      badge.textContent = '已就绪'
      badge.className = 'badge ok'
      var c = get.config || {}
      detail.innerHTML = ''
      detail.appendChild(document.createTextNode(
        (c.providerLabel || c.provider || '?') + ' · ' + (c.model || '?') +
        (c.baseURL ? ' · ' + c.baseURL : '') + ' · 配置来源：' + sourceLabel(get.settings && get.settings.source)
      ))
    } else {
      badge.textContent = '未就绪'
      badge.className = 'badge bad'
      detail.textContent = get.reason || '模型未配置。'
    }
  }

  function sourceLabel(source) {
    if (source === 'file') return '设置页'
    if (source === 'env') return '环境变量'
    return '未配置'
  }

  function fillForm(get) {
    var s = (get.settings || {})
    var sel = $('provider')
    sel.innerHTML = ''
    providers.forEach(function (p) {
      var opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.label + (p.requiresBaseUrl ? '（需 Base URL）' : '')
      sel.appendChild(opt)
    })
    if (s.provider) sel.value = s.provider
    $('model').value = s.model || ''
    $('baseURL').value = s.baseURL || ''
    maskedKey = s.apiKeyMasked || null
    $('apiKey').value = ''
    $('apiKey-hint').textContent = maskedKey
      ? '已保存：' + maskedKey + '（留空保持不变）'
      : '未设置。'
    onProviderChange()
  }

  function onProviderChange() {
    var p = providers.filter(function (x) { return x.id === $('provider').value })[0] || {}
    $('model').placeholder = p.defaultModel ? '默认：' + p.defaultModel : '必填，例如 deepseek-chat'
    $('baseURL-req').textContent = p.requiresBaseUrl ? '（openai-compatible 必填）' : '（可选）'
  }

  function payload() {
    var key = $('apiKey').value.trim()
    return {
      provider: $('provider').value,
      // 留空或原样粘贴打码值都表示「沿用已保存的密钥」。
      apiKey: key && key.indexOf('\\u2022') === -1 ? key : '',
      model: $('model').value.trim(),
      baseURL: $('baseURL').value.trim(),
    }
  }

  function refresh() {
    return api('GET', '/api/settings').then(function (r) {
      providers = r.json.providers || []
      renderStatus(r.json)
      fillForm(r.json)
      return r.json
    })
  }

  $('provider').addEventListener('change', onProviderChange)

  $('test-btn').addEventListener('click', function () {
    hideAll(); busy(true)
    api('POST', '/api/settings/test', payload()).then(function (r) {
      var j = r.json || {}
      if (j.ok) {
        ok('✓ ' + (j.detail || '连接成功') +
          (j.modelFound === true ? '\\n模型 ' + payload().model + ' 在返回列表中。' : '') +
          (j.modelFound === false ? '\\n注意：返回的模型列表中没有 "' + payload().model + '"，请核对模型名。' : ''))
      } else {
        bad('✗ ' + (j.detail || j.error || ('HTTP ' + r.status)))
      }
    }).catch(function (e) { bad('请求失败：' + e) }).finally(function () { busy(false) })
  })

  $('save-btn').addEventListener('click', function () {
    hideAll(); busy(true)
    api('PUT', '/api/settings', payload()).then(function (r) {
      var j = r.json || {}
      if (r.status === 200 && j.ok) {
        ok('✓ 已保存并生效：' + (j.config ? j.config.providerLabel + ' · ' + j.config.model : ''))
      } else {
        bad('✗ 保存失败：' + (j.error || ('HTTP ' + r.status)))
      }
      return refresh()
    }).catch(function (e) { bad('请求失败：' + e) }).finally(function () { busy(false) })
  })

  $('clear-btn').addEventListener('click', function () {
    if (!window.confirm('清除设置页保存的配置，回到环境变量状态？')) return
    hideAll(); busy(true)
    api('DELETE', '/api/settings').then(function (r) {
      var j = r.json || {}
      if (r.status === 200 && j.ok) {
        ok(j.ready ? '已清除，当前使用环境变量配置。' : '已清除。当前无可用模型配置，/api/copilotkit 将返回 503。')
      } else {
        bad('✗ ' + (j.error || ('HTTP ' + r.status)))
      }
      return refresh()
    }).catch(function (e) { bad('请求失败：' + e) }).finally(function () { busy(false) })
  })

  refresh()
  api('GET', '/health').then(function (r) {
    var rec = r.json && r.json.record
    if (rec) {
      $('record-detail').textContent =
        '学习记录层：' + (rec.ready ? '可用' : '不可用') + ' · 主题 ' + (rec.topics || 0) + ' 个' +
        (rec.learnDirConfigured ? '' : '（RECORD_LEARN_DIR 未配置）')
    }
  })
})()
</script>
</body>
</html>
`
