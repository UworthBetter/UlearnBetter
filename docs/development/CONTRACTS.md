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
- 已支持 `param_demo`、`steps` 和四个内置交互 widget。曲线参数使用当前
  已显示值，动画过渡中的滑块目标不能冒充图上的实际读数。
- 曲线读数按 `series_<index>_label/value/visible` 提供；二进制演示额外
  提供 `bit_pattern`。步骤提供当前步、播放状态、步骤标签和说明。
- 模块通过 `ModuleContext.reportInteraction` 上报，关闭后上报自动失效。
  没有有限数值的曲线返回明确文字提示，不把 NaN 或 Infinity 当成数字。
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


# 全局助手与记录契约 v0.2

本节覆盖上文同名规则；v0.1 全文保留供兼容参考。



- **标识引用 `SubjectRef`**（字符串）：
  `goal:<goalId>`、`item:<itemId>`、`topic:<topicId>`、
  `concept:<topicId>/<conceptId>`、`procedure:<topicId>/<procId>`、
  `procitem:<topicId>/<procId>/<itemId>`、`relation:<topicId>/<a>~<b>`。
  ID 只允许 `[A-Za-z0-9._\-\u4e00-\u9fff]`，长度 ≤ 120。
- **来源 `By`**：`{kind: 'component'|'compiler'|'user', name, version,
  model: string|null, promptVersion: string|null, mock: boolean}`。
- **证据** 沿用 `EvidenceRef` 和 learn.json 的 `ev`。
- **时间** 一律 ISO-8601 带时区；按天聚合的接口带 `tz`（IANA 名）。
- **响应信封**：`{schema: 'learning.record-api/0.1', data, meta:
  {source: 'record'|'mock', generatedAt, warnings: string[]}}`。
  错误：HTTP 4xx/5xx + `{error: <code>, message}`。

### 实体

```text
Goal         id  title  intent|null  status: active|paused|done
             origin: user|proposed  confirmedAt|null  colorKey: amber|cyan|violet
             folders: string[]      # folder 归类用的目录名映射，用户可改

Item         id  kind: notes|video|idea|article|pdf  title  addedAt
             ref: {topicId?} | {url?} | {text?}      # 不接受本机路径
             contentHash|null  topicId|null
             pipeline: {state: queued|running|done|failed|unsupported,
                        steps: [{key: read|identify|extract|classify|compile,
                                 state: done|running|pending|skipped|failed, note}],
                        reason|null}
             status: organizing|pending|done|failed   # 派生，给列表用
             identity: {what, about|null, route|null, relation|null, by}
             goalIds: string[]                        # 叠加后的有效归属
             conceptCount

Assignment   id  subject  goalId|null  confidence(0–1)  reason  evidence[]
             by  state: proposed|accepted|rejected  autoAccepted  changeLogId  createdAt

Override     id  at  target: SubjectRef  op  value  reason|null
             op ∈ accept_assignment{assignmentId} | reject_assignment{assignmentId}
                | reassign{goalIds[]} | rename{label} | hide{hidden}
                | pin_importance{level: 1|2|3|null} | attach_idea{conceptRef}
                | confirm_relation{a,b,kind} | reject_relation{a,b}
                | revert{overrideId}
             只追加。撤销 = 追加 revert。目标不存在时标 orphaned，不丢弃。

LearningEvent id(客户端生成 uuid，幂等)  at  kind  subject  cardId|null
             kind = visit{durationSec}             # 离开一颗星时上报一次
                  | recall{result: remembered|forgot|skipped}
                  | checklist{checked: boolean}    # subject 为 procitem
                  | reflection{text≤1000}  | question{text≤500}
             只追加。visit 单次上限 1800 秒，小于 3 秒不上报。

ChangeLog    id  at  trigger: SubjectRef  organizer: By
             changes: [{assignmentId, summary, state}]  undone: boolean
```

### 派生规则（后端实现，不调用模型）

- **掌握度 level**：0 未学；1 看过（累计 visit ≥ 20 秒，或打开过卡片）；
  2 回忆过（最近一次 recall 为 remembered）；3 稳定（至少两次
  remembered 落在不同日期，且最近一次为 remembered）。forgot 回到 1。
- **到期 due**（`simple-v0`）：连续 remembered 次数对应间隔
  1 / 3 / 7 / 14 / 30 天；forgot 后 1 天。
- **今日计划**（`today-v0`，最多 5 条，每条带 `why`）：
  1. 到期复习，按逾期天数降序，最多 3 条；
  2. 每个 active 目标按建议路线取下一颗 level 0 的星（跳过隐藏，
     置顶优先），按目标顺序轮流取；
  3. 一份已开始未完成的实操清单。
  `why` 只由事实拼成（例如「3 天前离星回忆选了『忘了』，今天到期」），
  不写不存在的依据。建议路线来自编译产物的顺序，不是前置关系。
- **统计**：分钟数只来自 visit；连续天数从今天往回数，今天为 0 时从
  昨天数并标 `todayDone: false`；第一天之前的日子标 `beforeStart`；
  回忆正确率 = remembered / (remembered + forgot)，skipped 不计；
  不足 3 天时 `trend: null`。共享主题同时计入多个目标并在响应里注明。
- **缺口**：一个分组至少 3 颗可见星且全部 level 0。
- **下一步**：今日计划的前 3 条。
- **全景关联**：只来自编译产物（笔记明写）或用户确认过的提议；
  同名候选（跨主题标签规范化后相同）只作待确认虚线。

### 后端 HTTP 接口（`/api/record`，Claude 实现）

| 方法 路径 | 说明 |
| --- | --- |
| `GET /health` | 原有字段 + `record: {ready, topics, organizer, reason}`；记录层不依赖模型配置 |
| `GET /topics` | 已编译主题列表 `{topicId, title, conceptCount, generatedAt, compilerVersion}` |
| `GET /topics/:topicId/learn` | `{learn, overlay: {renames, hidden, pins, mastery, checklist}}`，learn 为编译原文 |
| `GET /goals` · `POST /goals` · `PATCH /goals/:id` | 目标；`POST` 可带 `fromProposalId` 确认提议 |
| `GET /proposals` | `{goalProposals, assignments(proposed), ideaAttachments, relationCandidates, autoAccepted}` |
| `GET /items?status=&kind=` · `GET /items/:id` | 列表与详情（详情含 pipeline、identity、归属、按分组的概念及修正标记、changeLog id） |
| `POST /items` | `{kind:'idea', text}` / `{kind:'notes', topicId}` / `{kind:'video', url}`；article、pdf 返回 422 `unsupported_kind` |
| `POST /items/:id/organize` | 重新整理，返回新 ChangeLog |
| `GET /changelog?itemId=` · `POST /changelog/:id/undo` | 整理日志；撤销 = 追加 revert / reject |
| `GET /overrides?target=` · `POST /overrides` | 修正；响应带 `effective`、`orphaned` |
| `GET /events?since=&limit=` · `POST /events` | 单条或批量（≤ 50），按 id 幂等 |
| `GET /mastery?topicId=` | MasteryState 列表 |
| `GET /today?date=&tz=` | TodayPlan |
| `GET /stats?range=week\|month\|all&tz=` | 统计层全部读数 |
| `GET /panorama?goalId=` | 目标 → 主题 → 分组 → 概念，含缺口、下一步、待确认关联、摘要栏计数 |

启动时扫描 `RECORD_LEARN_DIR/<topicId>/{learn.json,manifest.json}`；
没有对应 Item 的主题自动登记为 `notes` 资料并整理一次。

### 编译产物 `manifest.json`（Zcode 产出，`learning.manifest/0.1`）

与 `learn.json` 同目录。字段：`topic {id, title, idOrigin}`、`contentHash`、
`compilerVersion`、`generatedAt`、`folderHint`（主题目录的上级目录名，
不含绝对路径）、`identity {what, about, route}`（取自学习主页的一句话
总结和路线，没有就是 null）、`counts {chapters, concepts, procedures}`、
`source {title, author, duration, url}`、`concepts [{id, label, aliases,
group, order, importanceHint, importanceFactors, blockCount}]`、
`groups [{name, conceptIds}]`、`procedures [{id, title, items:[{id, text}]}]`、
`route [conceptId]`。`learn.json` 保持 `learning.learn/0.1` 可读，
只允许追加可选字段。

### Organizer 契约（`learning.organize/0.1`）

```text
请求  items: [{subject: item:<id>, kind, title, about|null, folderHint|null,
               conceptLabels: string[≤30]}]
      goals: [{id, title, intent|null, folders[]}]
      decisions: {accepted: [{subject, goalIds}], rejected: [{subject, goalId}]}
      options: {allowGoalProposals: boolean}
响应  organizer: By
      assignments: [{subject, goalId|null, confidence, reason, evidence[]}]
      goalProposals: [{title, intent|null, reason, fromSubjects[]}]
      ideaAttachments: [{subject, conceptRef, confidence, reason}]
      warnings: string[]
```

- 只给必要内容：标题、一句话、目录名、概念名。笔记和字幕是数据，
  提示里写明不能当指令执行。
- `null`：什么都不产出。`folder`：`folderHint` 与某目标的 `title` 或
  `folders` 规范化后相同 → confidence 0.9，理由「目录名『X』与目标
  『Y』对应」；否则不产出。想法不处理。`llm`：结构化输出（后端）。
  `mock`：只给界面开发用，`by.mock = true`，不得作默认值。
- 已被拒绝的 (subject, goalId) 组合不得出现在输出里；实现方必须过滤。

### 前端：场景上下文 0.2 与动作

`LearningContext` 升级为 `learning.context/0.2`（后端两版都接受）：

```ts
view: 'none' | 'graph' | 'star-dive' | 'today' | 'panorama' | 'library'
layer: 'stats' | 'adjust' | null
record: {
  source: 'record' | 'mock'
  goal: { id: string; title: string } | null
  todayPlan: { date: string; entries: { kind: 'review'|'new'|'practice'; subject: string; title: string; why: string }[] } | null
  pendingCount: number
  selectedItem: { id: string; kind: string; title: string; status: string; identity: { what: string; about: string | null } } | null
  mastery: { subject: string; level: 0|1|2|3; due: string | null } | null
  stats: { weekMinutes: number; streakDays: number; recallRate: number | null; learned: number; total: number } | null
} | null
```

新增两个受控动作，由外壳绑定（星图的三个动作仍由潜航页绑定）：

| type | 参数 | 含义 |
| --- | --- | --- |
| `navigate` | `to: 'today'\|'stats'\|'panorama'\|'library'`、可选 `goalId`、`itemId` | 切换视图或打开统计层；无效 ID 失败 |
| `open_adjust` | 可选 `changeLogId`、`itemId` | 打开调整归类层，不做任何确认 |

### 视图契约（`record/view-props.ts`，C0 放占位实现）

```ts
type RecordRoute =
  | { view: 'today'; layer?: 'stats' | null }
  | { view: 'panorama'; goalId?: string | null }
  | { view: 'library'; itemId?: string | null }
  | { view: 'star-dive'; topicId: string; conceptId?: string | null }

interface ViewProps {
  client: RecordClient
  route: RecordRoute
  navigate(to: RecordRoute): void
  openAdjust(opts?: { changeLogId?: string; itemId?: string }): void
  reportScene(scene: Pick<LearningContext, 'record' | 'layer'>): void
}
```

| 文件（占位 → Grok） | 默认导出 | props |
| --- | --- | --- |
| `views/today/TodayView.tsx` | `TodayView` | `ViewProps`；`route.layer === 'stats'` 时显示统计层 |
| `views/library/LibraryView.tsx` | `LibraryView` | `ViewProps` |
| `views/panorama/PanoramaView.tsx` | `PanoramaView` | `ViewProps` |
| `views/layers/AdjustLayer.tsx` | `AdjustLayer` | `{client, changeLogId?, itemId?, onClose, navigate}` |
| `views/recall/RecallPrompt.tsx` | `RecallPrompt` | `{subject, label, onResult(r: 'remembered'\|'forgot'\|'skipped')}`，只呈现，不写事件 |
| `views/recall/MasteryBar.tsx` | `MasteryBar` | `{level, due}` |
| `views/dev/ViewsPreview.tsx` | `ViewsPreview` | 无；用 mock 客户端展示全部视图，挂在 `#/dev/views` |

`GlobalAssistant`（Grok）保持默认导出，新增可选 props
`{record?: {client, navigate, openAdjust}}`。布局协作用 CSS 变量：
外壳在全景页设置 `--ub-rail-width`（摘要栏宽度），Agent 栏据此在左侧
居中；Agent 栏把自身高度写到 `--ub-agent-bar-height`，潜航时间轴据此上移。
视觉 token 沿用 `star-dive.css` 的 `--bg*`、`--amber*`、`--cyan`、`--ink*`、
`--glass`，新增色值见 `UI_PLAN_v2.md` §5，由各自组件样式定义，不改全局样式。


## C0 executable wire shapes

`record/types.ts` fixes all response field names; `schemas/record/` validates
entities and compiler/organizer documents. Entity samples carry `sample: true`.
Event payload fields are top-level discriminated by `kind`; override payloads
are in `value`. Overlay maps use local concept IDs; checklist keys use SubjectRef.
Mastery uses `visitSeconds`, `rememberedCount`, and `lastRecall`. Stats and panorama
use the exact nested structures in `types.ts` (no additional inferred fields).
Folder matching normalizes both operands using NFKC, trim, and Unicode lowercase.
The reason preserves the original folder name. Accepted decisions stay authoritative;
rejected subject/goal pairs are filtered. Folder organizer name/version: folder/0.1.
Mock fixtures are loaded by `createMockRecordClient()`; explicit `?record=mock`
selects them. HTTP errors never silently switch to mock. `getTopicLearn` returns
`{learn, overlay}`; listOverrides returns OverrideResult[]; addEvents returns the
submitted events (idempotent by id). IDs in route segments are percent encoded.

C0 stays on codex/s2-integration until the owner approves merging main.

## C0.1 integration clarification

Manifest importanceHint accepts null when no evidence supports a score. This
matches the notes task: lack of evidence must not create invented importance.

## C0.2 additive integration fields

TopicOverlay optionally includes ideas keyed by local concept ID. Each entry
has itemId (null for reflection events), text, and at. Only effective user
attachments and submitted reflection events appear; raw learn remains intact.
Panorama optionally includes relations with full a/b SubjectRefs and kind,
read only from compiled learn relations. Confirmed relations render solid;
candidates render dashed. Rejected candidates must not reappear from labels.
Clients send the browser IANA timezone for all time-sensitive reads.
