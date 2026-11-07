# 全局助手界面

每个视图共用的学习伙伴：桌宠常驻右下角，点击后才在它上方展开对话面板。提问、场景 chip、停止、重试和历史都在 `GlobalAssistant` 的面板里；面板关闭时，回答卡和提示卡浮在桌宠上方一次只出一张。没有新增图表库。

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
