# UlearnBetter 助手后端

自托管的 CopilotKit 兼容后端，为概念图谱 / 星图潜航中的全局学习助手提供
真实模型流式问答与前端工具往返。公共入口固定为 `/api/copilotkit`，附带
`/health`。第二轮新增**学习记录层** `/api/record/*`（见下文「学习记录层」），
它不依赖模型配置。本目录只属于后端任务（`server/**`、`tests/server/**`），不改前端
与公共契约。

## 技术栈与协议

- Node ≥ 20，ESM。
- `@copilotkit/runtime@1.85.0` 的运行时端点
  `copilotRuntimeNodeHttpEndpoint`，即当前 `@copilotkit/react-core` 前端
  （`<CopilotKit runtimeUrl="/api/copilotkit">` + `useCopilotAction`）所对接的
  协议。前后端需使用同一兼容的 CopilotKit 版本线。
- `express@5` 提供 HTTP 外壳、CORS 与 `/health`。
- 模型适配器：Anthropic / OpenAI / OpenAI 兼容端点 / Google / Groq。
- 记录层：`ai@6.0.324`（Vercel AI SDK，`generateText` + `Output.object` 结构化输出，
  与已装的 `@ai-sdk/openai@3.0.138` 同属 provider v3 规范，已用实际安装验证）、
  `ajv@8.20.0` + `ajv-formats@3.0.1`（按 `schemas/record/*.schema.json` 校验输入输出）。
  三者都是锁文件里原有的传递依赖，现在显式声明并固定版本。

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
| `RECORD_DATA_DIR` | 否 | 决定层目录，默认 `server/.data/record/`（已 gitignore） |
| `RECORD_LEARN_DIR` | 否 | 编译产物目录；未配置时主题列表为空，`/health` 的 `record.reason` 写明 |
| `RECORD_ORGANIZER` | 否 | `null` \| `folder` \| `llm` \| `mock`，默认 `folder` |
| `RECORD_AUTO_ACCEPT` | 否 | 自动接受阈值（0–1），默认 `0.85` |

\* 缺少 provider 或密钥时，后端**不会**用 mock 回答：`/health` 返回
`ready:false` 和明确原因，`/api/copilotkit` 返回 HTTP 503。

### 设置页（无需编辑 .env）

服务启动后打开 <http://127.0.0.1:4000/settings>（`/` 会重定向过去），可在页面里
选择 provider、填写密钥 / 模型 / Base URL，**保存即生效，无需重启**：

- 配置保存在 `server/.data/settings.json`（已 gitignore），密钥只落在本机后端，
  不进入前端、仓库或日志；`GET` 接口只返回打码密钥。
- 优先级：设置页保存的非空字段 **覆盖** 环境变量；留空字段回落到环境变量/默认值。
  清除已保存配置后回到纯环境变量状态。
- 「测试连接」调用各家 provider 的免费模型列表接口验证密钥与 Base URL
  （`/v1/models` 等），不消耗 token、不保存任何内容；openai-compatible 端点若
  不支持模型列表，会如实返回未验证。
- 后端 API（同源，页面自用）：`GET /api/settings`、`PUT /api/settings`、
  `POST /api/settings/test`、`DELETE /api/settings`。
- 可用 `ASSISTANT_SETTINGS_FILE` 改设置文件路径（默认 `server/.data/settings.json`）。
- 保存失败（校验不过、provider 初始化失败）时保留原配置继续服务，返回 400 与原因。
  已知限制：`RECORD_ORGANIZER=llm` 的归类模型在启动时确定，设置页改动不会
  重建它（重启后生效）。

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

服务只监听本机 `127.0.0.1`。启动后：

- `GET /health` → `{ status, ready, config? , reason? }`（配置已脱敏，不含密钥）。
- `ALL /api/copilotkit` → CopilotKit 运行时端点。

未配置时服务仍会启动，便于 `/health` 可达；但助手入口返回明确的 503。

记录层（无需模型密钥）：

```bash
cd server
RECORD_LEARN_DIR=/path/to/compiled-topics npm start
curl http://127.0.0.1:4000/api/record/health
curl 'http://127.0.0.1:4000/api/record/today?tz=Asia/Shanghai'
```

`RECORD_LEARN_DIR` 下每个主题一个子目录，含 `learn.json` 与 `manifest.json`
（`tools/learning` 的编译产物）。

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
- 系统说明通过显式 BuiltInAgent 的 prompt 传入，客户端不能覆盖。
  每请求重新分配笔记工具额度，并限制模型循环步数。
- 取消通过框架的 `agent/stop` 协议；仅关闭 HTTP 连接是否能停止供应商
  生成尚未验证，不能据此保证停止计费。
- 日志不记录密钥或整份私有笔记。
- 浏览器 Origin 必须在允许列表内；使用其他 Vite 端口时显式配置。
  协议 JSON 请求上限为 256 KiB。

## 学习记录层（`/api/record/*`）

记录层与模型配置无关：没有任何 `ASSISTANT_*` 变量时照常工作，`/api/copilotkit`
仍返回原有的 503。`RECORD_*` 取值无效时不回退默认：`/health` 的
`record.ready=false` 并写明原因，`/api/record/*` 返回 503 `record_misconfigured`。

### 目录结构

```text
RECORD_DATA_DIR/                  决定层（产品自己的数据，按 vault `_系统/` 设计）
  goals.json                      Goal[]                         原子替换
  items.json                      资料的存储行（派生字段读取时计算）  原子替换
  assignments.json                {assignments, goalProposals, ideaAttachments}
                                  组件输出（派生层），原子替换
  changelog.jsonl                 整理日志；同 id 的后一行取代前一行（撤销追加新行）
  overrides.jsonl                 用户修正，只追加；撤销 = 追加 revert
  events.jsonl                    学习痕迹，只追加，按客户端 id 幂等
RECORD_LEARN_DIR/<topicId>/       编译产物（Zcode），只读
  learn.json  manifest.json
```

- `.json` 先写临时文件、fsync，再 rename 覆盖；`.jsonl` 只追加。进程内单写队列，
  一个目录只由一个后端进程写。
- `.jsonl` 损坏的行跳过并在 `/health` 的 `record.store.corruptLines` 报告，文件不清空；
  末行不完整时下一次追加先换行。`.json` 无法解析时停止写入该文件（返回 503
  `store_corrupt`），不会用空值覆盖。
- 读请求不会创建目录；第一次写入时才创建 `RECORD_DATA_DIR`。

### 主题索引

- 每个请求前重新扫描 `RECORD_LEARN_DIR`（按 mtime + 大小缓存）。目录名必须是合法主题
  ID 且等于 `manifest.topic.id`；`manifest.json` 按 `learning.manifest/0.1` 校验。
  不合格的目录跳过并在 `/health` 的 `record.skippedTopics` 写明原因。
- 所有文件经 realpath 校验必须位于 `RECORD_LEARN_DIR` 内（与 `notes.mjs` 相同做法），
  符号链接逃逸被拒绝。客户端只能给 `topicId`，后端在索引里查找，不拼接路径。
- 新主题自动登记为 `notes` 资料并整理一次；`contentHash` 变化时在编译步骤注明
  「笔记已更新」并重新整理。用户的 `reassign` / 接受过的归属保留。
- 主题从目录消失时资料保留，流水线显示 `failed`，相关修正标 `orphaned`。

### 笔记原文（应用内阅读窗口）

`GET /api/record/topics/:topicId/notes` 列出主题背后的 `.md` 笔记，
`GET /api/record/topics/:topicId/notes/file?path=<相对路径>` 读取一篇（原文返回，不记日志，上限 1 MB）。
前端 `#/notes/<topicId>?f=<路径>&h=<标题>` 用它渲染 Obsidian 风格的阅读窗口。

查找顺序（取第一个存在的目录）：

1. `RECORD_LEARN_DIR/<topicId>/notes/`：视频流水线编译后把生成的笔记装在这里；
2. `RECORD_NOTES_DIR/<manifest.folderHint>/<manifest.topic.title>/`；
3. `RECORD_NOTES_DIR/<manifest.topic.title>/`。

`RECORD_NOTES_DIR` 可选，指向笔记库根目录（`npm run demo` 自动设为演示笔记副本）。
路径必须是主题内的 `.md`，经 realpath 校验，`..`、绝对路径、指向外部的软链接一律 400。
笔记是数据：前端用 markdown-it（`html: false`）渲染，链接只放行 http(s)/mailto，mermaid 以 `strict` 安全级别运行。

### 叠加（overlay）

`src/record/derive/overlay.mjs` 是唯一的叠加实现：按 `overrides.jsonl` 顺序后写的生效；
`revert` 使被引用的修正失效（可再 revert 恢复）。目标（或引用的 assignment / 概念 /
修正）不存在时标 `orphaned`，保留但不生效，目标恢复后自动重新生效。
资料的有效归属：有效的 `reassign` 优先；否则为状态 `accepted` 的 assignment
（用户接受或自动接受，且未被 `reject_assignment` 覆盖）。

### Organizer

| 名称 | 行为 | 界面文案（`/health` 的 `record.organizerLabel`） |
| --- | --- | --- |
| `null` | 什么都不产出 | 不自动归类 |
| `folder`（默认） | `folderHint` 与目标 `title` / `folders` 经 NFKC + trim + 小写后相同 → 0.9；对 `samples/record/organize/` 一致性样例逐字相同 | 按文件夹归类（没调用模型） |
| `llm` | `generateText` + `Output.object`（JSON Schema + ajv 校验），模型取自 `ASSISTANT_*`；`by.promptVersion = organize-llm/0.1` | 模型归类（模型名） |
| `mock` | 只供界面开发，`by.mock = true`，不是默认值，也不作任何回退 | 模拟整理 |

- 发给组件的只有标题、一句话总结、目录名、概念名（想法另附可挂载概念的名称与引用）。
  材料包在 `<data>` 中，提示词写明它们是数据、不能当指令。
- 输出一律按 `learning.organize/0.1` 校验。`llm` 未配置模型、调用失败或输出不合格时：
  该资料的 `classify` 步骤为 `failed`、`pipeline.reason` 写原因，整理日志照常生成
  （changes 为空），警告放在该响应的 `meta.warnings`。**不会改用 mock 或 folder。**
- 组件输出后，后端再过滤一次用户拒绝过的 (资料, 目标)，并跳过已有用户 `reassign`
  的资料和已接受的组合；未决定的旧提议被新一次整理取代，已接受的不动。
- 置信度 ≥ `RECORD_AUTO_ACCEPT` 的归属自动接受（`autoAccepted=true`），出现在
  `/proposals` 的 `autoAccepted` 里，随时可用 `reject_assignment` / `reassign` 改。
- 新建目标、或修改目标的标题 / 目录 / 状态（仍为 active）时，对所有未被手动改过归属的
  笔记资料重新整理一次（一条整理日志，trigger 为 `goal:<id>`）。由目标提议确认的目标
  还会重新整理该提议引用的资料。

### 派生规则（确定规则，不调用模型）

- **掌握度**：0 未学；1 看过（累计 visit ≥ 20 秒，或 visit 带 `cardId` 表示打开过卡片；
  也是 forgot 之后的级别）；2 最近一次非 skipped 的回忆为 remembered；3 在此基础上，
  自上次 forgot 以来的连续 remembered 落在至少两个不同的本地日期。skipped 不改变级别和
  到期，只体现在 `lastRecall`。`rememberedCount` 为累计次数。
- **到期（simple-v0）**：连续第 n 次 remembered 后 1 / 3 / 7 / 14 / 30 天（上限 30）；
  forgot 后 1 天。
- **今日计划（today-v0，≤ 5 条）**：① 到期复习（本地到期日 ≤ 当天），逾期天数降序，
  最多 3 条；② 每个 active 目标按建议路线（编译产物 `route`，其后按概念顺序）取下一颗
  level 0 的可见星，置顶（重要性高的）优先，目标轮流取；③ 一份已勾选部分、未全部完成的
  实操清单（最近勾选的那份）。有清单时为它保留一个位置。`why` 只由记录事实拼成，例如
  「6 天前离星回忆选了『忘了』，按 1 天间隔已逾期 5 天」「目标『X』的建议路线（按笔记顺序）
  里下一颗还没学的星：『主题』第 2/5 颗」「实操清单『Y』已勾选 1/3 项，还差 2 项」。
- **统计**：分钟数只来自 visit；有任意学习痕迹的日子算学习日；连续天数从今天往回数，
  今天没有痕迹则从昨天数且 `todayDone=false`；第一条痕迹之前的日子 `beforeStart=true`；
  回忆正确率 = remembered / (remembered + forgot)，只算所选范围内，skipped 不计；
  `trend`（trend-v0）= 本范围日均分钟 − 上一个等长范围日均分钟，`all` 或开始不足 3 天时
  为 `null`。`weekMinutes` 恒为最近 7 天。范围：week 7 天、month 30 天、all 从第一条痕迹起。
  目标的 `history` 为每天累计「至少 remembered 过一次」的概念数。共享主题计入每个目标，
  并写在 `sharedTopicsNote`。隐藏的概念不计入任何总数。
- **缺口**：一个分组至少 3 颗可见星且全部 level 0。**下一步**：今日计划前 3 条。
- **同名候选**：跨主题的概念标签经 NFKC（全半角）、小写、去掉括号内注释、去空白后相同
  即为候选（`kind: same_label`），只作待确认，不合并；`confirm_relation` /
  `reject_relation` 决定其去留。全景的关联只有这些候选和用户确认过的关联。
- **时区**：`today` / `stats` / `panorama` / `mastery` / `topics/:id/learn` 接受 `tz`
  （IANA 名）；缺省按 UTC 并在 `meta.warnings` 写「未提供 tz，按 UTC 聚合」。

### 接口要点

全部接口见 `docs/development/CONTRACTS.md` v0.2。实现细节：

- 成功响应一律是信封，`meta.source` 恒为 `record`；mock 组件的产出另带 `by.mock`。
  错误为 `{error, message}`：400 参数 / ID 不合法、404 不存在、409 冲突（事件或修正
  同 id 内容不同、重复撤销、视频不可整理、提议已确认）、413 请求体超过 64 kB、
  422 校验失败（含 `unsupported_kind`、`invalid_url`、`text_too_long`、`batch_limit`、
  `unknown_goal`、`invalid_target`、`immutable_field`）、502 `learn_unreadable`（编译产物损坏，不回显内容）、503 记录层配置无效或数据文件损坏。
- `POST /items`：`idea` 最多 1000 字，提交后立即整理；`video` 只存 http/https URL，
  流水线 `queued`、`identity.about = null`、原因「排队中，本轮不自动解析」；
  `notes` 只接受索引中的 `topicId`（已登记则返回原条目，200）；`article` / `pdf` → 422。
  任何本机路径字段都会被拒绝。
- `POST /overrides` / `POST /events` 按 id 幂等：同 id 同内容返回 200，内容不同 409。
  事件批量最多 50 条，整批校验通过才写入。
- `GET /events` 按时间升序，`limit` 默认 200、最大 1000。
- `GET /api/record/health` 与 `/health` 的 `record` 字段相同：
  `{ready, topics, organizer, reason, organizerLabel, organizerReady, organizerMock,
  autoAccept, learnDirConfigured, skippedTopics, store}`。

### 助手接入

- 系统说明接受 `learning.context/0.1` 和 `0.2`：可以引用场景里的目标、今日计划、待确认数、
  所选资料识别结果；解释推荐理由时只引用 `todayPlan.entries[].why`；不能声称已替用户
  确认整理结果，确认要请用户点按钮（`open_adjust`）。
- 新增只读服务端工具 `get_learning_record({part: 'today'|'stats'|'panorama', tz?})`，
  返回派生结果摘要，计入每请求工具预算。没有任何写决定层的工具。

## 测试

无需真实 API key 的协议 / 错误处理 / 路径安全测试：

```bash
cd server
npm test
# 等价于： node --test ../tests/server/*.test.mjs
```

真实模型联调需显式提供对应 provider 的 key，并单独报告（见 `HANDOFF.md`）。
本地协议测试使用临时模拟模型端点验证 AG-UI 流、Chat Completions 请求、
系统说明、问题上下文、笔记工具和 `get_learning_record` 往返，不代表真实模型验证。
记录层测试（`tests/server/record-*.test.mjs`）使用临时目录里的合成主题；`llm`
Organizer 的测试使用 AI SDK 的 `MockLanguageModelV3`（测试中标注为模拟），
不代表真实模型的归类效果。

## 依赖检查记录

当前锁文件的 `npm audit` 报告 22 项传递依赖问题（6 moderate、16 high），
兼容范围内执行 `npm audit fix` 后仍未消除，涉及 Zod 等上游依赖。
第二轮显式加入 `ai@6.0.324`、`ajv@8.20.0`、`ajv-formats@3.0.1`（锁文件中原本就有，
仅新增 3 行声明）：加入前后 `npm audit` 都是 22 项（6 moderate、16 high），
这三个包本身不在告警列表中；唯一的直接依赖告警来源仍是 `@copilotkit/runtime`。
当前版本保持本机开发用途，后续上线前需要评估升级与兼容回归。
本机监听、来源限制和请求大小上限不能替代依赖修复。
