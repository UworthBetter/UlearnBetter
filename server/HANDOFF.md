# 后端交付说明（给集成人 GPT）

集成人已在 `codex/learning-foundation` 合入本分支，并追加系统说明注入、
兼容端点 Chat Completions 选择、请求级工具预算、符号链接边界检查，
以及仅监听本机的修正。前端代理和后端 CI 已接入。

范围：`server/**`、`tests/server/**`。未改前端、公共契约或 CI。

## 已完成

- `/api/copilotkit`（CopilotKit 运行时）与 `/health`。
- 真实模型流式问答：Anthropic / OpenAI / OpenAI 兼容端点 / Google / Groq
  适配器，按环境变量选择。无配置时返回明确错误，绝不以 mock 冒充真实联调。
- 可选只读本地笔记检索，严格限定在配置目录内。
- 每请求工具调用预算，防止无限循环。
- 无需 key 的测试：`cd server && npm test`（20 项，协议/错误/路径安全）。

## 需要集成方处理的接入点

1. **Vite 代理**：前端同源访问 `/api/copilotkit`，请在 `concept-graph`
   的 `vite.config.ts` 增加代理到后端端口（默认 4000），例如：
   ```ts
   server: { proxy: { '/api/copilotkit': 'http://localhost:4000' } }
   ```
   （该文件属 GPT 范围，后端未改动。）

2. **版本一致**：前端 `@copilotkit/react-core` / `@copilotkit/react-ui` 应与后端
   `@copilotkit/runtime@1.85.0` 同一兼容版本线（1.85.x）。该版本包内含
   v2/headless 前端能力，后端现已明确配置 BuiltInAgent，并通过本地
   `agent/run` AG-UI 协议往返；不能仅凭 v1/v2 入口名称判断不兼容。

3. **线程列表（可选）**：运行时在未提供调用者身份时，`GET /threads` 与
   `POST /threads/clear` 返回 403（仅影响历史会话列表，不影响问答与连续对话，
   因为上下文由前端每次随请求附带）。如需跨会话列表，可在 `buildRuntime` 中
   给 `CopilotRuntime` 传 `identifyUser` 或 `threads:{access:'open'}`；当前按
   安全默认保留。

4. **CI（GPT 所有）**：可在 `.github/workflows/checks.yml` 增加后端作业：
   ```yaml
   - run: npm ci
     working-directory: server
   - run: npm test
     working-directory: server
   ```
   后端未改 CI 文件。

## 真实模型联调状态（未验证）

- 代码路径为真实集成（非 mock），但本轮**未**用真实 API key 跑过线上
  往返。按 SPRINT 验收第 7 条，记录为“真实联调尚未完成”。
- 有 key 时的验证方法：设置 `ASSISTANT_PROVIDER` 与对应 key 后 `npm start`，
  用前端或 `POST /api/copilotkit` 发起一次提问，确认 SSE 流式返回与
  前端工具往返；结果应单独报告，勿用付费 API 猜配置。

## 已知限制

- Google / Groq / OpenAI 兼容端点为已接线但未实测；Groq 需额外
  `npm install groq-sdk`。
- 笔记检索为简单文本/文件名匹配，无向量库（首版范围内）。
- 未实现控制参数写入、视频跳转、笔记写入（契约标注为后续扩展）。
