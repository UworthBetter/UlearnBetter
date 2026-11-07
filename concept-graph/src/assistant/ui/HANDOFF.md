# 全局助手界面交接

`GlobalAssistant` 从 `concept-graph/src/assistant/ui/GlobalAssistant.tsx` 默认导出。组件自己建立 CopilotKit 运行时。集成时挂一次即可，不要再包官方 `CopilotKitProvider`。

不要引入 `@copilotkit/react-core/v2` 或 `@copilotkit/react-core/v2/styles.css`。这两个入口会加载 Tailwind preflight，改掉星图已有样式。本组件只用 `v2/context` 和 `v2/headless`。

## 挂载

挂在 `Root` 的路由分支外侧，让概念图和星图共用同一段对话。不要替换 `Root`，也不要改 `StarDive`。

```tsx
import GlobalAssistant from './assistant/ui/GlobalAssistant.tsx'

// Root 的 return 里，与路由分支并列
<>
  {route}
  <GlobalAssistant />
</>
```

可选属性：

| 属性 | 默认 | 作用 |
| --- | --- | --- |
| `runtimeUrl` | `/api/copilotkit` | 同源运行时 |
| `agentId` | `default` | 必须和后端 `/info` 里的 agent id 一致 |
| `initialDemoMode` | `false` | 测试时可直接打开演示 |
| `initialOpen` | `false` | 测试时可直接展开对话面板 |
| `record` | 不传 | `{ client, navigate, openAdjust }`，与视图用同一个客户端 |

`record` 不传时，面板仍能提问。归类提示、记想法、加入视频都不会写决定层，只提示「学习记录还没接上」。集成时请把 `Root` 里已经创建的 `client`、`navigate`、`openAdjust` 传进来，不要再 new 一个客户端。

页面上只有一个常驻入口：右下角的学习伙伴。点角色才在它上方弹出对话面板，里面是场景、历史、输入栏和状态提示；再点角色、点面板外或按 `Esc` 收起。按 `/` 也会打开面板并聚焦输入框。面板关闭时，回答卡和提示卡浮在角色上方。手机上点角色后面板全屏，角色暂时隐藏。

提交问题后面板保持打开，不再自动收起。面板打开时角色停在默认位置，拖动只在面板关闭时可用。

面板不占页面布局，也不写 `--ub-agent-bar-height`。`shell.css` 把这个变量固定为 `84px`，作为潜航时间轴等浮层的底部安全区；视图不要再依赖助手栏的实时高度。全景页仍在文档根上设置 `--ub-rail-width`（摘要栏宽度，原型 332px），外壳接手后可以去掉那段。

## Vite 代理

由集成人写入 `concept-graph/vite.config.ts`。目标端口以 `server/README.md` 为准，路径保持 `/api/copilotkit`。

```ts
server: {
  proxy: {
    '/api/copilotkit': {
      target: 'http://127.0.0.1:<backend port>',
      changeOrigin: true,
    },
  },
},
```

后端 `/info` 要暴露 agent id `default`。如果使用别的 id，挂载时传入 `agentId`。

## 不需要扩展桥

`focus_concept`、`open_card`、`close_card`、`navigate`、`open_adjust` 直接调用 `learningSession.execute`。后两个只打开页面，不接受、不拒绝、不改归属。不要读 `window.__starDive`，不要用选择器点页面。不要再给模型加写决定层的工具。

## 行为约定

- 演示模式默认关闭。面板里的「演示模式」开关打开后，回答在本地生成，并带有「演示回复 · 未调用真实模型」。
- 没有服务时显示「无法连接 /api/copilotkit，助手不会编造回答」。不要把连接失败改成演示回答。
- 运行时连上只表示服务可达。模型是否可用由服务端决定，不能据此声称已经完成真实模型联调。
- 每次发送调用 `learningSession.capture()`。当前场景和「回答属于」分开显示。切换节点不会改写已经发出的问题。

## 依赖版本

记录于 2026-11-07，安装在 `concept-graph/package.json`。

| 包 | 版本 |
| --- | --- |
| `@copilotkit/react-core` | 1.85.0 |
| `@copilotkit/core` | 1.85.0 |
| `zod` | 3.25.76 |
| `katex` | 0.16.25 |
| `@ag-ui/core` | 1.0.2 |
| `@ag-ui/client` | 1.0.2 |

使用的接口：`CopilotKitCoreReact`、`useAgent`、`useCopilotKit`、`useFrontendTool`、`useAgentContext`、`useSyncExternalStore`。
