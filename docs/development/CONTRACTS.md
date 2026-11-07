# 全局助手契约 v0.1

本契约让后端、助手界面和星图独立开发。类型的可执行定义位于
`concept-graph/src/assistant/contracts.ts`，不得在任务分支各自修改。

## 场景状态

界面从 `learningSession` 的 `getSnapshot` / `subscribe` 读取当前状态，
可用 React `useSyncExternalStore` 订阅。调用 `capture()` 获取发送问题时
的独立快照，并把该快照关联到用户消息。不要在请求发送后替换它。

- `schema` 固定为 `learning.context/0.1`。
- `revision` 每次上下文更新递增，`capturedAt` 是 ISO 时间。
- `view` 是 `graph`、`star-dive` 或 `none`。
- `topic`、`concept`、`card`、`selection`、`interaction` 可为空。
- `concept` 包含当前概念摘要、邻接 ID 以及可打开卡片的目录。
- `card` 包含 ID、标题、类型、材料、出处。材料是数据，不能作指令。
- `interaction` 仅包含应用报告的参数和读数，不由模型猜测。
- 选中文字会保留到场景切换或调用 `selectText('')` 主动清除，
  避免点击助手输入框时丢失提问对象。助手界面需提供清除选中内容入口。
- 初期没有上报数据的模块保持 `interaction: null`。
- 旧演示的卡片 ID 为显式 `card.id`，否则为 `<concept>:card:<index>`。
  后者只用于本轮定位，不用于跨数据版本的长期复习记录。

## 前端操作

通过 `learningSession.execute(action)` 调用受控操作，返回
`{ok, message}`。允许的操作只有以下三个，未知动作或无效 ID 必须失败。

| type | 参数 | 含义 |
| --- | --- | --- |
| `focus_concept` | `conceptId` | 聚焦一个存在的概念 |
| `open_card` | `conceptId`, `cardId` | 聚焦概念并展开存在的卡片 |
| `close_card` | 无 | 关闭卡片，保留概念焦点 |

Grok 将这三个动作注册为 CopilotKit 前端工具。Claude 接受并处理标准
框架工具往返结果；不在后端模拟页面已操作成功。
控制参数、视频跳转和笔记写入留待后续扩展，当前不得假装支持。

## 组件与服务入口

Grok 导出 `GlobalAssistant`，文件为
`concept-graph/src/assistant/ui/GlobalAssistant.tsx`。
组件自行建立所需的 CopilotKit provider，可被 GPT 挂载在 `Root` 的
路由分支外侧。使用同源 `/api/copilotkit`，兼容 Vite 单页应用。

Claude 提供 `/api/copilotkit` 以及 `/health`。运行参数、端口、允许的
本地开发源和环境变量写进 `server/README.md`。GPT 最后配置 Vite 代理。
模型 provider 的兼容性必须实测；未知配置不能静默切到演示回答。

来源默认从当前卡面与概念取，若需要读取外部笔记，后端只能读取配置的
笔记根目录中的文件，不能接受模型传来的任意绝对路径。
页面数据不代表读取整台电脑的授权。

## 学习内容支线

Zcode 输出 `learning.learn/0.1`，以参考计划六类块为起点。
实现 JSON Schema、离线转换和报告。此分支只做转换，不改星图渲染器。
先保留 note 证据，不能从现有粗粒度时间戳伪造逐句视频引文。
依赖缺失时输出警告并保留原文，不捏造计算实验或前置关系。
