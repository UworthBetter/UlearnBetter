# Grok Build：全局助手界面

在 `D:/haikesong2-worktrees/grok-ui` 开始，阅读根 AGENTS.md、
`docs/development/SPRINT_01.md` 和 `CONTRACTS.md` 后直接实现。
任务边界为 `concept-graph/src/assistant/ui/**` 和前端 package 文件。

## 交付

导出 `GlobalAssistant.tsx` 中的默认组件。采用 CopilotKit，使用同源
`/api/copilotkit`，组件内部提供 provider。界面与现有暗色星图协调：
一个全局入口、可折叠对话面板、连续消息、停止生成、重试和错误状态。
桌面和手机均可使用，支持键盘、焦点管理和关闭后回到触发入口。

用 `useSyncExternalStore` 订阅 `learningSession`，把上下文交给助手。
每次发送固定 `capture()` 快照并保留讨论对象。当前场景变化与已发送
问题的来源分别呈现，不能让回答错误地归到新节点。

注册契约中三个前端工具，通过 `learningSession.execute` 执行。
不复制场景引擎逻辑，不读 `window.__starDive`，不通过选择器点击页面。
框架版本和 hooks 以当前官方文档为准，记录依赖版本。

## 验收与交接

提供可明确开关的演示模式，无服务时默认显示连接错误而不是编造回答。
验证长回答、公式、来源、空状态和取消；确保模型内容不执行任意 HTML。
执行 `npm run build` 与 `npm run lint`，记录结果和人工 UI 检查。

不改 Root、StarDive、scene、公共 store 或已有样式。需要挂载位置、
Vite 代理或扩展桥接时记入 `ui/HANDOFF.md`，由 GPT 集成。
完成后在本分支提交，交付提交号；不自行合并或推送。
