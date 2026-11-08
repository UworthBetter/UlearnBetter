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

---

# 第二轮：学习记录层后端（`codex/s2-backend`，起点 C0 `98562d4`）

范围：`server/**`、`tests/server/**`。未改前端、契约、schemas、samples、根依赖或 CI。

## 已完成

- `server/src/record/`：存储（`store.mjs`）、主题索引（`topics.mjs`）、叠加与派生
  （`derive/*.mjs`）、Organizer（`organizers/*.mjs`：null / folder / llm / mock）、
  服务（`service.mjs`）、路由（`routes.mjs`）、配置（`config.mjs`）。挂在 `app.mjs` 的
  `/api/record`，`/health` 增加 `record` 字段，另有 `/api/record/health`（同内容，
  便于只代理 `/api/record` 的前端读取）。
- 助手：系统说明接受 context 0.1 / 0.2 并约束推荐理由与确认行为；只读工具
  `get_learning_record`，计入工具预算。
- 依赖：`ai@6.0.324`、`ajv@8.20.0`、`ajv-formats@3.0.1`（固定版本，锁文件原有）。
- 测试：`cd server && npm ci && npm test` → 66 项全部通过（原 24 项 + 记录层 42 项），
  不需要密钥。

## 需集成人处理 / 契约缺口（未改契约文件）

1. **「我的思考」数据来源**：`TopicOverlay` 没有已挂载想法和 reflection 的字段。
   目前前端只能从 `listItems({kind:'idea'})` 的 `identity.relation`（「挂到『X』」）和
   `listOverrides()` 的 `attach_idea` 拼出来；`Item` 不暴露 `conceptRef`。建议 C0.x 给
   `TopicOverlay` 加可选 `ideas: Record<conceptId, {itemId, text, at}[]>`（含 reflection 事件），
   后端可以直接补上。
2. **想法挂载的候选概念**：`learning.organize/0.1` 请求没有概念目录，组件无从知道能挂到哪些
   星。后端在调用 `llm` / `mock` 时通过内部参数附带「概念引用 + 名称 + 主题名」目录
   （仍只发名称）。Python 侧若也要做想法挂载，需要在请求里加可选 `concepts` 字段。
3. **ChangeLog 没有 warnings 字段**：组件失败原因写在该次 `POST /items/:id/organize`
   响应的 `meta.warnings` 和资料的 `pipeline.reason` 里；ChangeLog 内部另存 `_warnings`，
   对外剥离。若界面要在调整归类层里显示，建议给 ChangeLog 加可选 `warnings`。
4. **目标提议无法单独忽略**：只能确认（`POST /goals {fromProposalId}`）或撤销整条
   整理日志。如需「不要这个目标」，需要新的 Override op（例如 `dismiss_goal_proposal`）。
5. **tz 参数**：`client.ts` 的 `getMastery(topicId)`、`getPanorama(goalId)`、
   `getTopicLearn(id)` 不传 `tz`，后端按 UTC 并在 `meta.warnings` 提示；掌握度 3 级
   「不同日期」和全景的「今天」都依赖时区。建议客户端统一带 `tz`（后端已接受 `?tz=`）。
6. **同名候选的 kind**：候选 `kind` 为 `same_label`，但 `confirm_relation` 的 `kind`
   只允许 `related|uses|contrast|part_of|prereq`；界面确认时需选其中一个（建议 `related`）。
7. **全景里的编译关联**：`Panorama` 没有放 `learn.relations`（笔记明写的关联）的字段；
   后端只返回同名候选与用户确认过的关联。笔记明写的关联请前端从 `getTopicLearn` 读取，
   或在 C0.x 给 Panorama 加字段。
8. **manifest 必需**：没有 `manifest.json`（或不符合 `learning.manifest/0.1`、或
   `topic.id` 与目录名不同）的主题被跳过，原因列在 `/health` 的 `record.skippedTopics`。
   验收第 1 步的临时 `RECORD_LEARN_DIR` 需要用 Zcode 新版编译器生成。
9. **新建 / 修改目标会触发重新整理**（一条日志，trigger `goal:<id>`），否则 folder 基线在
   主题先于目标导入时永远不会产出归属。若负责人不希望这样，改成只在手动「重新整理」时运行。
10. **想法状态**：想法在挂到一颗星之前一直是 `pending`（即使组件没有提议），符合验收第 5 步。
11. **CI**：后端作业不需改动；`npm ci` 会装上新声明的三个包（锁文件已更新）。

## 实现中的取舍（写在 README「派生规则」）

- 3 级「稳定」只计算上次 forgot 之后的连续 remembered；skipped 不影响级别和到期。
- `trend` 定义为 trend-v0：与上一个等长范围比较的日均分钟变化。
- 学习日 = 有任意学习痕迹的一天；分钟数只来自 visit。
- 有进行中的实操清单时今日计划为它保留一个位置。
- 一个 `RECORD_DATA_DIR` 只能由一个后端进程写（进程内写队列，无跨进程锁）。
- 主题扫描以 mtime + 大小判断变化。

## 真实模型

- 预置数据（`samples/demo/`）构建时，`llm` Organizer 经真实模型（`glm-5.3-flash`，
  OpenAI 兼容端点）完成资料识别、目标提议、归属和想法挂载；每条提议与模型理由见
  `samples/demo/record/build-log.json`，`demo-meta.json` 记录了 organizer 与模型。
- 评测方法：`RECORD_ORGANIZER=llm` + `ASSISTANT_*`，对评测集（`samples/organize-eval/`）
  主题逐份 `POST /api/record/items/:id/organize`，对比 `/api/record/proposals` 与标注，
  记录准确率、改正率、调用次数和耗时。
