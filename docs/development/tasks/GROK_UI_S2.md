# Grok Build：三个视图、两个覆盖层与底部 Agent 栏

工作目录 `D:/haikesong2-worktrees/grok-ui`。等集成人宣布 C0 提交号后，
在本目录从该提交新建分支 `codex/s2-ui`（不要在其他工具的目录切分支）。

文件范围：`concept-graph/src/views/**`、`concept-graph/src/assistant/ui/**`、
`concept-graph/package.json`、`concept-graph/package-lock.json`、`tests/ui-*.test.mjs`。
C0 在 `views/` 下放好的占位文件从此归你。

## 先读

1. 根 `AGENTS.md`
2. `docs/development/SPRINT_02.md`：本轮裁决、「视图契约」「场景上下文 0.2 与动作」
3. `docs/development/CONTRACTS.md` v0.2（C0 落地版）
4. `docs/reference/UI_PLAN_v2.md` 全文——这是本任务的设计稿
5. `docs/reference/ui-prototype-v2.html`：浏览器打开，逐屏对照
   `#home`、`#stats`、`#library`、`#adjust`、`#panorama`、`#recall`、`#ask`、`#first`
6. C0 代码：`concept-graph/src/record/{types,client,view-props}.ts`、
   `samples/record/demo/`、`views/**` 占位
7. 现有界面：`assistant/ui/*`（第一轮的 GlobalAssistant、learning-tools、
   safe-markdown、turns、runtime）、`star-dive/star-dive.css`（视觉 token）

## 编码依据

- 数据只通过 `props.client: RecordClient` 读写，开发时用
  `createMockRecordClient()`，集成人换成 HTTP 客户端。不要 `fetch` 其他地址，
  不读 `window.__starDive`，不直接操作别的组件的 DOM。
- 跳转只调 `props.navigate(route)` / `props.openAdjust(...)`；
  场景只通过 `props.reportScene(...)` 上报。
- `meta.source === 'mock'` 或 `by.mock === true` 时显示模拟橙标记（`#ffd0b0`）。
- 颜色与规则按 UI_PLAN §5：虚线 = 未定，实线 = 已定；待确认紫 `#c9b6ff`；
  缺口珊瑚、下一步金只用于全景；统计图表系列色量化 `#c4801f`、AI `#3a92d6`
  （以目标 `colorKey` 映射，不写死目标名）；热力图琥珀单色 5 档。
- 样式写在自己目录的 css 里，复用 `star-dive.css` 的 CSS 变量，不改全局样式。
- 图表手写 SVG 即可；如需新依赖，先评估体积并在 README 说明。

## 范围

### 1. 今天 `views/today/`（UI_PLAN §2.1，原型 `#home`）

- 统计条：近 9 天热力、本周时长、连续天数、回忆正确率、已学/总数；
  整条可点 → `navigate({view:'today', layer:'stats'})`。
- 今日卡（≤ 5）：类型、概念、主题、时长、**为什么**（只显示 `why`）、
  证据时间戳；标题下写排序规则；点击 → 潜航。
- 目标卡：迷你星图、意图、颗星 / 已学 / 已回忆、进度条、主题列表
  （待确认主题用虚线标签）；点击 → 全景该目标。
- 智能体整理卡：最近 4 份资料，状态写成人话；点击 → 资料。
- 空状态与首次使用（UI_PLAN §4）：无资料、有资料无目标（目标提议卡 +
  未归属桶，确认走 `createGoal({fromProposalId})`）、刚开始用、今天还没学。

### 2. 学习统计层 `views/today/stats/`（UI_PLAN §2.2，原型 `#stats`）

5 个读数；每天分钟热力图（开始前虚线格）；各目标累计回忆折线
（单一 y 轴，终点直接标数字，悬停用十字线 + 浮层，不用原生 title）；
「数据表」切换显示同一份数据；按主题回忆正确率横条 + n/总数；
最容易忘的；最近学习痕迹。`本周|本月|全部` 真的切换 `getStats({range})`。
共享主题在图注写明计入两个目标。不足 3 天时显示「学满 3 天后才有趋势」。

### 3. 资料 `views/library/`（UI_PLAN §2.3，原型 `#library`）

- 列表：图标、标题、状态（整理中转圈 / 待确认紫虚线 / 已整理灰 / 失败）、
  「识别为…」、目标色点、概念数、时间；状态和类型两组筛选真的过滤；
  文章 / PDF 显示 0 并占位。
- 详情按流水线顺序：识别（视频未解析时显示「还在读字幕…不先猜」或
  「排队中，本轮不自动解析」）、整理过程五步、归属（目标 chip 多选、
  置信度、理由、组件名，`folder` 时显示「按文件夹归类（没调用模型）」；
  待确认时「按这样保存」写 `reassign`/`accept_assignment`，
  「看这次整理的全部 N 处」→ `openAdjust({changeLogId})`；
  已自动接受写明阈值）、抽出的概念（按分组、带掌握点；菜单：改名、隐藏、
  改归属、置顶重要性，全部写 Override，标「你改过 / 你置顶」，orphaned 单独列出）、
  底部操作（在全景中看、潜航、重新整理 `organizeItem`、撤销 `undoChangeLog`）。
  「打开原笔记」本轮只显示笔记相对路径，不打开本机文件。
- 想法详情：「挂上去」写 `attach_idea`，选择目标星。

### 4. 调整归类层 `views/layers/AdjustLayer.tsx`（UI_PLAN §2.7，原型 `#adjust`）

按钮卡组：待确认 → 合并 / 同名候选 → 已自动接受。每张卡：接受、
改归属、拒绝，均写 Override。底部「在资料里细调」→ 资料对应项。
只有用户点击才写入。

### 5. 学习全景图 `views/panorama/`（UI_PLAN §2.4，原型 `#panorama`）

- 星图区：目标星云分区与大号淡色名字；主题星座 + 底部「已学/总数」；
  星座内按分组聚团；亮度 = level，大小 = 重要性；到期琥珀脉冲环；
  待确认紫虚线（多归属系绳、同名候选、提议关联）；缺口珊瑚虚线圈 +
  「缺口 · 分组 0/n」；下一步金色点线 + ①②③。点击主题 → 潜航。
- 布局确定性（同一数据每次相同），只有一个目标时不画分区。
- 缩放：全景 → 目标（`#/panorama/<goalId>`）；主题和概念级就是潜航。
- 右侧摘要栏（宽度与外壳的 `--ub-rail-width` 一致）：总数、各目标分段条、
  缺口及理由、待确认的关联（→ 调整层）、下一步（→ 潜航）、图例；
  没有缺口时写「没有整块没学的部分」。
- 键盘可达：主题和摘要栏条目可 Tab 聚焦、Enter 打开。

### 6. 回忆与掌握 `views/recall/`

`RecallPrompt`（原型 `#recall`：「记得 / 忘了」+ 跳过，`Esc` = 跳过）和
`MasteryBar`，只呈现并回调，事件由集成人写。

### 7. 底部 Agent 栏 `assistant/ui/**`（UI_PLAN §2.8，原型 `#ask`）

- `GlobalAssistant` 改为每个视图底部常驻的一根栏，栏上方一次只出一张卡：
  **提示卡**（来自 `getProposals()`：「我已经帮你归类好了…要调整吗？
  [没问题] [看看]」——「没问题」逐条写 `accept_assignment`，「看看」→
  `openAdjust`）和**回答卡**（流式回答，引用来源）。原侧面板降级为
  可展开的历史。
- 栏的位置：`right: var(--ub-rail-width, 0)` 内居中；把自身高度写入
  `--ub-agent-bar-height`。`/` 聚焦，`Esc` 先关卡片再失焦。
- 场景 chip：由场景 0.2 生成「资料 · <标题>」「全景 · 全部目标」等。
- 输入：普通文字是提问；以「想法：」开头或点 [＋] 选「记一句想法」时
  调 `addItem({kind:'idea'})`；粘贴 http(s) 链接时询问「作为视频资料加入？」
  再调 `addItem({kind:'video'})`。拖入文件夹本轮不支持，提示走命令行编译。
- 前端工具：保留三项星图工具，新增 `navigate`、`open_adjust`，一律经
  `learningSession.execute`。不提供任何写决定层的模型工具。
- 保持第一轮的约束：每次提问固定 `capture()` 快照；模型内容不执行 HTML；
  演示模式明确开关；无服务时显示连接错误；停止、重试、手机布局、焦点管理。

### 8. 预览 `views/dev/ViewsPreview.tsx`

用 mock 客户端串起全部视图和覆盖层（集成人已挂在 `#/dev/views`），
页面顶部固定「示例数据」标记。

## 测试与检查

- `tests/ui-*.test.mjs`：纯函数（热力分档、连续天数显示、状态文案、
  全景布局确定性、Agent 栏输入分类）用
  `node --experimental-strip-types --test tests/ui-*.test.mjs` 运行。
- `cd concept-graph && npm run build && npm run lint`，不新增警告；
  记录助手 / 视图包体积。
- 人工检查（1440×900 和 390×844）：每屏对照原型；空状态；mock 标记；
  键盘（Tab、Enter、`/`、`Esc`）；长标题；只有一个目标；无缺口。

## 交接

不改 `Root.tsx`、`shell/**`、`record/**`、`star-dive/**`、`contracts.ts`、
`context-store.ts`、全局样式、`vite.config.ts`。需要外壳、路由、契约或潜航配合的点
写进 `concept-graph/src/views/HANDOFF.md` 或 `assistant/ui/HANDOFF.md`。

## 交付报告格式

```text
分支 / 提交：codex/s2-ui @ <hash>
起点：<C0 提交号>
改动文件：<列出>
检查：build <结果>；lint <错误/警告数，是否新增>；ui 测试 <通过/失败数>
依赖：<新增包与版本、体积变化>
人工 UI 检查：<每屏结论；桌面 / 手机>
模拟：<哪些画面只在 mock 下验证过>
未完成与已知限制：<列表>
需集成人处理：<HANDOFF 条目>
```

完成后只在本分支提交。不自行合并或推送。
