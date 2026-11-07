# UlearnBetter 助手后端

自托管的 CopilotKit 兼容后端，为概念图谱 / 星图潜航中的全局学习助手提供
真实模型流式问答与前端工具往返。公共入口固定为 `/api/copilotkit`，附带
`/health`。本目录只属于后端任务（`server/**`、`tests/server/**`），不改前端
与公共契约。

## 技术栈与协议

- Node ≥ 20，ESM。
- `@copilotkit/runtime@1.85.0` 的运行时端点
  `copilotRuntimeNodeHttpEndpoint`，即当前 `@copilotkit/react-core` 前端
  （`<CopilotKit runtimeUrl="/api/copilotkit">` + `useCopilotAction`）所对接的
  协议。前后端需使用同一兼容的 CopilotKit 版本线。
- `express@5` 提供 HTTP 外壳、CORS 与 `/health`。
- 模型适配器：Anthropic / OpenAI / OpenAI 兼容端点 / Google / Groq。

> 说明：1.85 中 v1 运行时入口在内部委托给 v2（AG-UI / Hono）核心，但对外
> 仍提供 react-core 所讲的协议，因此这是与现有前端兼容的正确入口。详见
> `HANDOFF.md` 的版本说明。

## 安装

```bash
cd server
npm install
```

可选依赖：`provider=groq` 需额外安装 `groq-sdk`（`npm install groq-sdk`）。

## 配置（仅服务端环境变量）

复制 `.env.example` 为 `.env` 并填写。密钥只在后端读取，不进入前端、样例、
日志或提交。进程本身用 `process.env`；如需加载 `.env` 文件，可用
`node --env-file=.env src/index.mjs`（Node ≥ 20.6）。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ASSISTANT_PROVIDER` | 是 | `anthropic` \| `openai` \| `openai-compatible` \| `google` \| `groq` |
| `ASSISTANT_API_KEY` | 是* | 通用密钥；也接受 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `GROQ_API_KEY` |
| `ASSISTANT_MODEL` | 视情况 | 模型 id；多数 provider 有默认值，`openai-compatible` 必填 |
| `ASSISTANT_BASE_URL` | 视情况 | `openai-compatible` 必填（如 `https://api.deepseek.com/v1`）；也可为其它 provider 指向代理 |
| `ASSISTANT_NOTES_ROOT` | 否 | 开启只读本地笔记检索，并限定在该目录内 |
| `PORT` | 否 | 默认 `4000` |
| `ASSISTANT_ALLOWED_ORIGINS` | 否 | 逗号分隔的 CORS 源或 `*`；默认 Vite 开发源 `http://localhost:5173` |
| `ASSISTANT_MAX_TOOL_CALLS` | 否 | 每请求服务端工具调用上限，默认 `8` |
| `ASSISTANT_LOG_LEVEL` | 否 | `debug`\|`info`\|`warn`\|`error`，默认 `warn` |

\* 缺少 provider 或密钥时，后端**不会**用 mock 回答：`/health` 返回
`ready:false` 和明确原因，`/api/copilotkit` 返回 HTTP 503。

### 默认模型

| provider | 默认模型 |
| --- | --- |
| anthropic | `claude-3-7-sonnet-latest` |
| openai | `gpt-4o-mini` |
| openai-compatible | 无（必须显式指定） |
| google | `gemini-1.5-flash` |
| groq | `llama-3.3-70b-versatile` |

## 启动

```bash
cd server
npm start           # node src/index.mjs
npm run dev         # node --watch src/index.mjs
```

启动后：

- `GET /health` → `{ status, ready, config? , reason? }`（配置已脱敏，不含密钥）。
- `ALL /api/copilotkit` → CopilotKit 运行时端点。

未配置时服务仍会启动，便于 `/health` 可达；但助手入口返回明确的 503。

## 行为与安全

- 每次提问的场景上下文由前端随请求附带（CopilotKit readable / forwardedProps），
  后端据此回答；切换节点不改变已发送问题的上下文由前端保证。
- 笔记 / 字幕 / 页面内容一律作为**不可信数据**，不作为系统指令。系统提示已
  明确这一点。
- 本地笔记检索（`search_notes` / `read_note`）只读、且严格限定在
  `ASSISTANT_NOTES_ROOT` 内，拒绝任意绝对路径与 `..` 越界；首版不含向量库。
- 每请求有工具调用预算（`ASSISTANT_MAX_TOOL_CALLS`），超出即返回错误结果，
  避免错误请求驱动无限工具调用循环。
- 契约中的三个前端操作（`focus_concept` / `open_card` / `close_card`）由前端
  注册为 CopilotKit 前端工具，经运行时原生往返；后端不重复实现，也不假装
  页面已操作成功。
- 取消：客户端断开连接即中止该请求的流式响应。
- 日志不记录密钥或整份私有笔记。

## 测试

无需真实 API key 的协议 / 错误处理 / 路径安全测试：

```bash
cd server
npm test
# 等价于： node --test ../tests/server/*.test.mjs
```

真实模型联调需显式提供对应 provider 的 key，并单独报告（见 `HANDOFF.md`）。
