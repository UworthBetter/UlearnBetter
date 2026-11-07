# GPT / Codex：第二轮集成人

工作目录 `D:/haikesong2`，分支 `codex/s2-integration`，从最新 `main` 新建。
你是集成人：先落地契约（C0），再接通其他三方的交付，最后跑验收脚本。

## 先读

1. 根 `AGENTS.md`
2. `docs/development/SPRINT_02.md`（全文，尤其「契约草案」和「验收顺序」）
3. `docs/development/CONTRACTS.md`（v0.1）、`docs/development/BRANCHES.md`
4. `docs/reference/UI_PLAN_v2.md` §1.2 路由、§2.5 潜航、§2.6 离星回忆、§3 导航、§6
5. `docs/reference/ui-prototype-v2.html`（`#home`、`#dive`、`#recall`）
6. 现有代码：`concept-graph/src/Root.tsx`、`assistant/contracts.ts`、
   `assistant/context-store.ts`、`star-dive/StarDive.tsx`、`star-dive/learn-adapter.ts`、
   `star-dive/scene.ts`、`assistant/ui/learning-tools.ts`、`vite.config.ts`、
   `.github/workflows/checks.yml`

## 文件范围

`concept-graph/src/{Root.tsx,App.tsx,main.tsx,index.css,App.css}`、
`concept-graph/src/shell/**`、`concept-graph/src/record/**`、
`concept-graph/src/star-dive/**`、`concept-graph/src/assistant/contracts.ts`、
`concept-graph/src/assistant/context-store.ts`、`concept-graph/vite.config.ts`、
`concept-graph/index.html`、`schemas/record/**`、`samples/record/**`、
`tests/assistant-*.test.mjs`、`tests/learn-adapter.test.mjs`、`tests/record-*.test.mjs`、
`tests/test_record*.py`、`.github/**`、`.gitignore`、`docs/**`、根 `README.md`、`AGENTS.md`。

不改 `server/**`、`tools/learning/**`、`schemas/learning/**`、
`concept-graph/src/views/**`（C0 占位之后）、`concept-graph/src/assistant/ui/**`、
`concept-graph/package*.json`。需要时在交付说明里写给对应执行方。

## 阶段一：C0 契约（最先做，其他三方等它）

按 `SPRINT_02.md`「C0 交付清单」逐项落地，要求：

- **类型与 schema 一致**：`record/types.ts` 和 `schemas/record/*.schema.json`
  描述同一份契约；`tests/test_record_fixtures.py` 用 `jsonschema` 校验
  `samples/record/**` 全部 fixtures。
- **`RecordClient`**：每个 HTTP 接口一个方法（`listTopics`、`getTopicLearn`、
  `listGoals`、`createGoal`、`updateGoal`、`getProposals`、`listItems`、`getItem`、
  `addItem`、`organizeItem`、`listChangeLog`、`undoChangeLog`、`listOverrides`、
  `addOverride`、`listEvents`、`addEvents`、`getMastery`、`getToday`、`getStats`、
  `getPanorama`），返回带 `meta` 的信封；错误抛出带 `code` 的 `RecordError`。
- **mock 客户端**：读 `samples/record/demo/`，写操作只改内存，所有响应
  `meta.source = 'mock'`。数据量足够展示所有状态：整理中、待确认、
  已整理、失败、两目标共享主题、缺口、到期复习、想法、排队中的视频。
- **fixtures 用合成数据**：可以基于 `samples/learn/demo-topic` 编译结果
  再加两个虚构主题。不复制 `_notes_input`、用户笔记或原型里的真实笔记文字。
- **场景 0.2**：`context-store` 接受 `layer`、`record`；`updateScene` 保留
  现有选中文字清除规则；`execute` 支持 `navigate`、`open_adjust`，由外壳通过
  独立绑定处理，星图三项动作仍由潜航页绑定。未绑定或无效 ID 返回失败。
  补齐 `tests/assistant-context.test.mjs` / `assistant-interaction.test.mjs`。
- **视图占位**：按「视图契约」表创建占位组件，渲染标题和「占位」字样，
  props 类型完整，lint 通过。合入后这些文件归 Grok。
- **路由骨架**：`#/`、`#/today` → 今天；`#/today?layer=stats`；
  `#/library[/<itemId>]`；`#/panorama[/<goalId>]`；
  `#/star-dive/<topicId>[/<conceptId>]`；`?sheet=adjust` 打开调整层；
  `#/graph` 旧概念图；`#/dev/views` 预览页。旧 `#/star-dive/<conceptId>`
  链接继续能打开 CS 演示。
- **代理**：`/api/record` 与 `/api/copilotkit` 同一目标（`ASSISTANT_BACKEND_URL`）。
- `CONTRACTS.md` 升级为 v0.2；在 `SPRINT_02.md`「当前进展」写入 C0 提交号。

C0 完成标准：`npm run build`、`npm run lint`（无新增警告）、场景测试、
`python -m unittest discover -s tests`、`cd server && npm test` 全部通过。
C0 提交到 `main` 由你按 `BRANCHES.md` 流程完成，然后通知用户启动其他三方。

## 阶段二：外壳与潜航（与三方并行）

1. **外壳 `shell/**`**：顶部「今天 · 全景 · 资料」，资料右上角紫点
   = `pendingCount`；`示例数据` 标记在 `meta.source === 'mock'` 时强制显示。
   覆盖层容器：统计层、调整归类层；`Esc` 逐层后退（覆盖层 → 视图；
   潜航 → 全景）；`/` 交给 Agent 栏聚焦。全景页设置 `--ub-rail-width`。
2. **场景上报**：外壳把 `view`、`layer` 和视图 `reportScene` 的内容合并进
   `learningSession`；注册 `navigate`、`open_adjust` 的绑定。
3. **潜航按主题加载**：`#/star-dive/<topicId>` 调 `getTopicLearn`，在
   `learn-adapter.ts` 叠加 `overlay`（改名、隐藏、置顶、掌握度、勾选）。
   保留 CS 演示和本地导入作为后备入口。补 `tests/learn-adapter.test.mjs`。
4. **潜航增强**（UI_PLAN §2.5）：面包屑 `全景 › 目标 › 主题`；主卡底部
   挂 `MasteryBar`；到期星的琥珀脉冲环；「相关」里显示跨主题候选（虚线，
   标「候选」）；时间轴 bottom 用 `--ub-agent-bar-height` 上移。
5. **学习痕迹**：
   - visit：聚焦一颗星开始计时，离开 / 关页时上报一次（≥ 3 秒，上限 1800），
     页面隐藏时用 `fetch(..., {keepalive: true})`；
   - recall：离开一颗本次看过、且 level < 3 或已到期的星时显示
     `RecallPrompt`，结果写 recall 事件；可跳过，跳过也写 `skipped`；
   - checklist：实操勾选写 checklist 事件，刷新后由 overlay 还原。
   - 事件 id 用 `crypto.randomUUID()`，失败时排队重试，不丢、不重复。
6. **挂载 Grok 的视图与 `GlobalAssistant`**，传入 `record` props。

## 阶段三：集成与验收

按 `SPRINT_02.md` 顺序合入 Zcode → Claude → Grok。每合一个：

- 跑全部检查；处理对方 HANDOFF 里的接入点；记录修正。
- 不改写对方分支历史；集成修正在 `codex/s2-integration` 上提交。

全部合入后：

- 用合成样例编译出临时 `RECORD_LEARN_DIR`（系统临时目录，不提交），
  启动后端（无模型密钥），逐条执行验收脚本 1–7，浏览器实测，
  记录每条结果、失败项和截图位置（`.playwright-mcp/` 不提交）。
- 有密钥时执行 8–10 并单独记录；没有就写「未完成：未配置真实模型」，
  不以 mock 代替。
- 更新 CI：Python 作业加入 manifest / organize 检查，前端作业加入
  `tests/record-*.test.mjs`、`tests/ui-*.test.mjs`。
- 更新 `SPRINT_02.md`「当前进展」与 `BRANCHES.md`。

## 检查

```bash
cd concept-graph && npm run build && npm run lint
node --experimental-strip-types --test tests/assistant-context.test.mjs tests/assistant-interaction.test.mjs tests/learn-adapter.test.mjs tests/record-*.test.mjs
python -m unittest discover -s tests
cd server && npm test
```

## 交付报告格式

C0 和最终集成各交付一次：

```text
分支 / 提交：codex/s2-integration @ <hash>（C0 另列 main 上的提交号）
起点：<基于的 main 提交>
改动文件：<按目录列出>
检查：<每条命令 + 通过/失败数；lint 警告数及是否新增>
合入：<对方分支 @ 提交号、集成修正说明>
验收脚本：<1–10 逐条：通过 / 失败 / 未做 + 原因>
真实模型：<已验收（provider、模型名，不含密钥）/ 未完成>
未完成与已知限制：<列表>
```

由你合并到 `main`；推送前先得到负责人确认。不改写共享分支历史。
