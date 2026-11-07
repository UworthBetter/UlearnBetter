# Claude Code：学习记录层后端

工作目录 `D:/haikesong2-worktrees/claude-backend`。等集成人宣布 C0 提交号后，
在本目录从该提交新建分支 `codex/s2-backend`（先 `git fetch`/确认本地 `main`
已含 C0；不要在其他工具的目录切分支）。文件范围只有 `server/**` 和
`tests/server/**`。

## 先读

1. 根 `AGENTS.md`
2. `docs/development/SPRINT_02.md`：本轮裁决、「契约草案」全文（实体、
   派生规则、HTTP 接口、manifest、Organizer 契约、场景 0.2）
3. `docs/development/CONTRACTS.md` v0.2（C0 落地版，与草案冲突时以它为准）
4. `schemas/record/*.schema.json`、`samples/record/demo/`、`samples/record/organize/`
5. `docs/reference/POSITIONING_v2.md` §3（三层数据模型）、§4（复用方案与 Organizer 接口）
6. `docs/reference/UI_PLAN_v2.md` §2.1–2.4（界面要哪些数字），§4.2（空状态）
7. 现有后端：`server/src/{app,config,runtime,providers,notes}.mjs`、
   `server/README.md`、`server/HANDOFF.md`、`tests/server/*.test.mjs`

## 范围

### 1. 记录层存储 `server/src/record/store.mjs`

- 根目录 `RECORD_DATA_DIR`（默认 `server/.data/record/`，已 gitignore）。
  文件：`goals.json`、`items.json`、`assignments.json`、`changelog.jsonl`、
  `overrides.jsonl`、`events.jsonl`。结构与 vault `_系统/` 兼容，
  之后可以直接把目录指到 vault。
- `.json` 用「写临时文件 + rename」原子替换；`.jsonl` 只追加。
  进程内单写队列，避免并发写坏文件。损坏的行跳过并在 `/health` 报告，不清空文件。
- 事件按客户端 `id` 幂等；同 id 不同内容返回 409。
- Override 只追加；撤销追加 `revert`。

### 2. 主题索引 `server/src/record/topics.mjs`

- 扫描 `RECORD_LEARN_DIR/<topicId>/{learn.json,manifest.json}`
  （Zcode 产出；未配置时 `/health` 的 `record.reason` 写明，列表为空）。
- 只读这个目录，路径越界和符号链接逃逸按现有 `notes.mjs` 的做法拒绝。
  客户端只能给 `topicId`，不能给路径。
- 新主题自动登记成 `notes` 资料并整理一次；内容哈希变化时把
  `pipeline.compile` 标为已更新并重新整理（已接受的归属保留）。

### 3. 叠加与派生 `server/src/record/derive/*.mjs`

- **overlay**：把 Override 叠加到编译产物（改名、隐藏、置顶、归属、
  想法挂载、关联确认），目标不存在的修正标 `orphaned` 并返回。
  这是唯一的叠加实现，前端只读结果。
- **mastery / today / stats / panorama / gaps / next / 同名候选**：严格按
  `SPRINT_02.md`「派生规则」实现。`today` 的 `why` 只用事实拼成；
  跨天聚合使用请求里的 `tz`，缺省 `UTC` 并在 `meta.warnings` 写明。
- 同名候选：跨主题的概念标签规范化（全半角、大小写、空白、括号内注释）
  后相同即为候选，不合并。

### 4. Organizer `server/src/record/organizers/*.mjs`

按 `learning.organize/0.1`：

- `null`、`folder`：规则见契约。`folder` 对 `samples/record/organize/request.json`
  的输出必须等于 `folder.expected.json`（Zcode 的 Python 实现对同一文件测试）。
- `llm`：复用现成的结构化输出（POSITIONING §4.2 首选 Vercel AI SDK，
  `generateObject` 或 `generateText` + `Output.object`）。在 `server/package.json`
  显式加入 `ai`（和需要的 schema 库），版本与已装的 `@ai-sdk/openai@3.0.138`
  兼容，以官方文档和实际安装结果为准，写进 README。模型配置沿用现有
  `ASSISTANT_*` 环境变量。提示词版本写进 `by.promptVersion`。
  只发标题、一句话、目录名、概念名；材料在提示里标明是数据。
  输出按 schema 校验，失败时记入 ChangeLog 警告、该步骤 `failed`，
  **不静默改用 mock 或 folder**。
- `mock`：只给界面开发用，`by.mock = true`，不能是默认值。
- 选择：`RECORD_ORGANIZER=null|folder|llm|mock`，默认 `folder`；
  `RECORD_AUTO_ACCEPT` 默认 `0.85`。被用户拒绝过的组合在输出后再过滤一次。

### 5. HTTP 接口 `server/src/record/routes.mjs`

实现契约表中 `/api/record/*` 全部接口，挂进 `app.mjs`。要求：

- 记录层与模型配置无关：没有模型时 `/api/record/*` 照常工作，
  `/api/copilotkit` 仍返回现有 503。
- 所有输入按 schema 校验（可以加 `ajv` 到 `server/package.json`），
  请求体上限 64 kB；ID 按契约正则校验。
- `POST /items`：`idea` 存文本（≤ 1000 字）并让 Organizer 提议挂载；
  `video` 只存 URL（仅 http/https），pipeline `queued`，
  `identity.about = null`，note 写「本轮不自动解析」；`article`/`pdf` → 422。
- 响应信封 `meta.source` 恒为 `record`（mock Organizer 产出的条目另有 `by.mock`）。
- 日志不记录密钥、笔记全文、想法全文。

### 6. 助手接入 `server/src/runtime.mjs`

- 接受 `learning.context/0.1` 和 `0.2`；系统说明补充：可以引用场景里的
  目标、今日计划、待确认数、所选资料识别结果；解释推荐理由时只引用
  `todayPlan.entries[].why`；不能声称已替用户确认整理结果，确认要请用户
  点按钮（`open_adjust`）。
- 增加只读服务端工具 `get_learning_record({part: 'today'|'stats'|'panorama'})`，
  返回派生结果摘要，计入现有工具预算。不提供写决定层的工具。
- 第一轮遗留真实模型验收：有密钥才做，按 `SPRINT_02.md` 验收脚本 8–9
  记录 provider、模型名、结果；不调用付费 API 来猜配置，不读其他应用的密钥。

## 测试（`tests/server/`，无需真实密钥）

- `record-store.test.mjs`：原子写、坏行跳过、事件幂等 / 409、Override 只追加与 revert。
- `record-derive.test.mjs`：每条派生规则至少一个手写用例——掌握度四级、
  forgot 回退、`simple-v0` 间隔、今日计划排序与上限、`why` 内容、
  连续天数（今天为 0）、`beforeStart`、正确率不计 skipped、缺口阈值 3、
  共享主题计入两个目标、隐藏概念不计入。
- `record-overlay.test.mjs`：改名 / 隐藏 / 置顶 / 归属生效；
  目标概念消失 → orphaned；更换 Organizer 后已接受归属不变。
- `record-organizer.test.mjs`：`folder` 对 golden 文件；`null` 为空；
  拒绝过的组合被过滤；`llm` 用 AI SDK 的测试模型（如 `MockLanguageModelV*`）
  验证 schema 校验和失败路径，测试里明确标注为模拟。
- `record-api.test.mjs`：每个路由的成功和错误码；路径越界；无模型时
  记录层可用而 copilotkit 503；`video` / `idea` / 422。
- 原有 24 项测试保持通过。

不要用 `samples/record/demo/` 里的派生结果（today、stats、panorama）当正确答案，
它们是给界面看的示例；只拿来做 schema 校验。

## 交接

- 更新 `server/README.md`：新环境变量、目录结构、Organizer 选择、派生规则、
  依赖审计结果。`.env.example` 不含密钥。
- 契约缺口、需要前端或编译器配合的点写进 `server/HANDOFF.md`，不改契约文件。
- 不改 `concept-graph/**`、`tools/**`、`schemas/**`、`samples/**`、根依赖和 CI。

## 检查

```bash
cd server && npm ci && npm test
```

## 交付报告格式

```text
分支 / 提交：codex/s2-backend @ <hash>
起点：<C0 提交号>
改动文件：<列出>
检查：npm test → <通过/失败数>
依赖：<新增包与版本、审计结果>
真实模型：<已测（provider/模型名、结果，不含密钥）/ 未测：原因>
llm Organizer 评测：<已跑：指标 / 未跑：原因>
未完成与已知限制：<列表>
需集成人处理：<见 server/HANDOFF.md 的条目>
```

完成后只在本分支提交。不自行合并或推送。
