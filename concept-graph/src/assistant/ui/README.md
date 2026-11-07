# 全局助手界面

暗色星图上的可折叠学习助手。入口、连续对话、当前场景、停止和重试都在 `GlobalAssistant` 里。

运行时是 CopilotKit v2，地址为 `/api/copilotkit`。官方 v2 样式入口没有引入，避免 Tailwind preflight 覆盖星图。集成步骤见 `HANDOFF.md`。

演示模式默认关闭。没有服务时界面显示连接错误，不生成回答。打开演示模式后，回复标为「演示回复 · 未调用真实模型」。

| 包 | 版本 |
| --- | --- |
| `@copilotkit/react-core` | 1.85.0 |
| `@copilotkit/core` | 1.85.0 |
| `zod` | 3.25.76 |
| `katex` | 0.16.25 |
| `@ag-ui/core` | 1.0.2 |
| `@ag-ui/client` | 1.0.2 |
