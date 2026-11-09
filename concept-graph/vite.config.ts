import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const assistantTarget = process.env.ASSISTANT_BACKEND_URL || 'http://127.0.0.1:4000'

// 仅当需要通过 uumit 隧道访问 dev server 时设置，例如：
//   $env:UUMIT_HOST="app-5173--guangyuan.uua2a.com"; npm run dev
// 不设置时保持本地开发默认行为（HMR 直连本机端口）。
const tunnelHost = process.env.UUMIT_HOST?.trim() || undefined

// uumit 的端口映射是按端口号写死的：当前隧道只映射 5173（app-5173--guangyuan），
// 所以隧道端口固定给 preview（产物请求数少，才压得住隧道的并发上限）；
// 本地 dev 让到 5199，两者可以同时在跑。要换端口时显式给 PORT / PREVIEW_PORT，
// 否则 strictPort 会直接报错，而不是悄悄换端口导致隧道又打开空白页。
const devPort = Number(process.env.PORT) || 5199
const previewPort = Number(process.env.PREVIEW_PORT) || 5173

const proxy: Record<string, string | ProxyOptions> = {
  '/api/copilotkit': assistantTarget,
  '/api/record': assistantTarget,
  '/api/settings': assistantTarget,
  '/health': assistantTarget,
}

// ── 关于 uumit 隧道 ───────────────────────────────────────────────────
// 隧道边缘对同一时刻的并行请求有硬上限（实测：16 个全部成功，17 个起就有
// 请求被随机回 502）。Vite dev 一次首屏会并发拉取几十个 /src 与 /@fs 模块，
// 必然超限：随便哪个模块 502，模块图就断裂 → React 不挂载 → 页面「200 + 白屏」。
// 因此：
//   · 本地开发用 `npm run dev`（直连，没有并发上限），保留 HMR；
//   · 要通过 uumit 给人看，用 `npm run build && npm run preview`，
//     产物只有几个 chunk，请求数远低于 16，隧道下可以正常渲染。
export default defineConfig({
  plugins: [react()],
  server: {
port: devPort,
    // 端口被占用时直接失败：一旦 Vite 悄悄换到 5200，隧道就会再次打开空白页。
    strictPort: true,
    // 监听 0.0.0.0：本地回环与隧道转发共用同一个端口。
    host: true,
    // Vite 默认只放行 localhost 与纯 IP 形式的 Host 头；uumit 转发时会保留
    // 原始域名（app-5173--guangyuan.uua2a.com），因此需要显式放行。
    // 前缀 "." 表示后缀匹配，uumit 子域变化时无需再改配置。
    allowedHosts: ['.uua2a.com'],
    // 隧道是 https 入口，HMR 必须走 wss:443，否则浏览器会拦 mixed content。
    // 只在设置了 UUMIT_HOST 时启用，保证本地热更新仍直连本机端口。
    ...(tunnelHost
      ? {
          hmr: {
            protocol: 'wss' as const,
            host: tunnelHost,
            clientPort: 443,
          },
        }
      : {}),
    proxy,
  },
  preview: {
    port: previewPort,
    strictPort: true,
    host: true,
    allowedHosts: ['.uua2a.com'],
    proxy,
  },
})