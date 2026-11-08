# 产品定位讨论 · 学习记录整理 + 笔记学习新体验

> **仓库副本说明**：本文件复制自负责人确认的 `POSITIONING.md` v2。执行范围以 `docs/development/SPRINT_02.md` 为准。

> 讨论稿，不是执行文档。依据：负责人原话和修正（`POSITIONING_TASK.md`），以及 `main @ 4d5d9c8` 的代码。
> 标「⚠️ 未核实」的说法没有找到可靠来源。
>
> **v2 修订**（负责人 2026-11-07 修正）：「就是做一个学习记录整理 + 笔记学习新体验，自动归类不稀缺的话我们直接拿来用啊。」
> 本版据此调整：自动归类改为**复用的现成组件**，不再当作差异点，也不再按「和竞品争夺归类能力」来写；差异集中在学习体验，以及整理后的学习记录如何呈现。新增 §4，列出可复用方案和接入接口。

---

## 0. 结论先行

1. **产品 = 学习记录整理 + 笔记学习新体验。** 归类、聚类、打标签直接用现成方案：LLM 结构化输出、embedding 聚类、开源分类库。我们只定义接口、做评测，不自研算法。
2. **差异在体验和呈现：**
   - 星图里按知识形状生成的交互卡；
   - 卡面证据能跳回视频的具体时间点；
   - 助手理解当前卡面和交互读数；
   - 把整理好的学习记录（目标、进度、学过什么、今天学什么）呈现出来。
3. **组件可以拿来用，但「接得住」要自己做。** 现成组件只负责给出归类提议。用户改过的结果必须在下一次重新整理时保留，这需要稳定 ID 和一层单独存放的「用户决定」。这层是产品自己的数据，换哪个组件都要有。
4. **「今日该学什么」需要学习信号，这条不变。** 学习记录不能只包括丢进来的材料，还要包括学习痕迹：回忆结果、勾选、我的思考。否则只能呈现阅读清单。
5. **下一轮建议：**
   - 体验侧：星图和总控台呈现整理后的学习记录；
   - 数据侧：稳定 ID 和决定层；
   - 归类：通过接口接入一个现成方案，并做评测。
   
   暂不扩大输入面。

---

## 1. 定位

### 1.1 一句话

> **把你的学习材料和学习过程自动整理成一份学习记录，再用星图和交互卡把它变成可以直接学的东西：每张卡都能追溯到原视频的那一秒，每处整理你都能改。**

内部短版：**整理用现成的，学习体验和记录呈现是我们自己的。**

### 1.2 对原表述的补充

负责人的方向不变。下表只补充让它落地需要的条件。

| 原表述 | 补充 |
| --- | --- |
| 识别它是什么 / 判断属于哪个学习目标 | 归类由复用组件完成。**目标本身由组件提议、用户确认一次**：目标是用户的意图，从材料里推不出来。 |
| 归类、排序、标记重要性 | 重要性相对于目标计算，并写出依据，例如目标说明、跨来源出现次数、用户置顶。不要只给一个说不清来由的分数。 |
| 结果可干预（但不是必须） | 修正必须**有粘性**：重新整理或更换组件都不能冲掉用户的修正。§3 的决定层就是为此设计的。 |
| 用户看到整理好的结果 | 默认展示整理结果，**原文和证据随时一键可达**。现有的 `ev` 证据和「完整补充笔记」保留。 |
| 整理即资产 | 资产 = 目标 + 用户决定 + 学习痕迹 + 证据链，以 Obsidian 兼容的文件保存。派生结果随时可以重算，不算资产。 |
| （补）学习记录包括什么 | 不止是材料，还有学习过程：离星回忆、实操勾选、向助手的提问、「💭 我的思考」。今日计划和进度都从这些痕迹算出来。 |

需要和现有裁决对齐，不能悄悄推翻：

- 蓝图：vault 是唯一事实源，文件即 API。整理层也要落在 vault 里。
- `SPRINT_01` 裁决 10：浏览和问答默认不修改原笔记。整理结果写在独立的整理层，不改写用户笔记。
- 裁决 5 和 7 原样保留：出现顺序不升级成前置知识，同名只产生候选、不自动合并。复用的组件也要遵守，组件输出一律当作**提议**。

### 1.3 差异放在哪里

| 层 | 做法 | 现状 |
| --- | --- | --- |
| 归类 / 聚类 / 打标签 | **复用**（§4） | 已接入：`null` / `folder` / `llm` 三种整理器（`server/src/record/organizers/`），配评测集 |
| 知识形状交互卡（调参并上报实际读数、步骤、实操、对比、结构） | **自己做，核心差异** | 已实现：`star-dive/modules/*`、`learn-adapter.ts` |
| 证据跳回视频时间点，明确拒绝伪造 | **自己做，核心差异** | 已实现：编译器的 `ev` 规则、`learn.schema.json` |
| 助手理解场景和交互状态，提问时固定快照 | **自己做** | 已实现：`CONTRACTS.md`、`context-store.ts` |
| 整理后的学习记录呈现（星图上的目标和掌握度、总控台、今日计划） | **自己做，核心差异** | 已实现：今天、全景、资料视图（§5） |
| 用户修正层（决定层、笔记菜单） | **自己做**，所有组件都需要 | 已实现：`overrides.jsonl` 决定层、资料详情与调整归类层 |

市面上的同类产品（NotebookLM、Notion AI、Mem、Obsidian 插件）主要用作**参考和可借鉴的交互**。例如 Mem 的做法：AI 建议归到哪个集合，用户一键确认，一条内容可以属于多个集合（[Mem 博客](https://get.mem.ai/blog/automatic-organization-with-collections)）。这正好可以当我们提议卡的交互参照，不必当作要正面竞争的功能。

---

## 2. 关键难点与对策

以下难点已在第二轮按对策落地：稳定 ID、决定层、离星回忆、目标提议加用户确认、多对多归属、可撤销的整理日志。

### 2.1 「今日该学什么」需要学习信号

- 只有「丢进来」这一个动作，最多能做到「沿阶段顺序推荐下一颗没看过的星」。
- 「打开过卡片」不能当作学会。
- 需要补一个**最小但不为零**的学习动作：离开一颗星时答一题，或者按「记得 / 忘了」两键。

### 2.2 稳定 ID：让修正和学习痕迹挂得住

| 对象 | 现在的 ID 来源 | 会在什么情况下变 |
| --- | --- | --- |
| 卡片 | 序号回退 `<concept>:card:<index>`（`scene.ts:60`）；`CONTRACTS.md` 已注明它不能用于长期复习记录 | 卡片顺序变化 |
| 块 | 序号 `<cid>.cmp<i>`、`<cid>.proc<i>`（`compiler.py:379,387`） | 笔记里表格或列表的顺序变化 |
| 概念 | 没有 frontmatter `id` 时取标题 slug（`compiler.py:240`） | 改标题 |
| 主题 | 目录名（`topic.py:136`） | 改目录名 |

不修这一项，复用什么组件都没用：修正和学习痕迹在下一次编译后就会对不上号。

### 2.3 复用组件的质量和适配

| 风险 | 对策 |
| --- | --- |
| 中文效果：很多开源默认模型以英文为主 | 选多语言模型（§4.2），用自己的真实笔记做评测，不信默认值 |
| 数据量：三个主题、几十个概念时，聚类基本没有意义（BERTopic 这类方法面向大量文档） | v0 用 LLM 结构化输出做主题级归类；数据积累后再引入聚类 |
| 依赖重量：本地 embedding 和聚类通常会拉进 PyTorch 等大依赖；`tools/learning` 核心坚持零第三方依赖 | 做成可选扩展，不进核心 |
| 隐私：走 LLM API 意味着笔记摘要要发给模型服务 | 提供本地 embedding 选项；发送什么内容要在界面上说明，这和现有助手的提示一致 |
| 归错：错误归类会带偏今日计划 | 组件输出只当作提议并附置信度；低置信度进「待确认」；记录用户改正率作为选型指标 |

### 2.4 冷启动：还没有目标

- 组件根据前一到三份材料提议目标，用户确认或改名一次。
- 设「未归属」桶，导入永远不因为缺目标被阻塞。
- 只有一个目标时，归类没有意义。负责人自己的三条线（课业、量化、AI 前沿）正好适合用来测试。

### 2.5 多目标归属

现有真实笔记按单层目录存放（`策略学习/`、`系统与工具/`），但「AI 量化交易系统」同时属于量化和 AI 两条线。归属必须是多对多。

### 2.6 信任与透明

- 每份材料处理完给一条汇总，例如「这次整理了 4 处」，每处都能撤销。
- 派生内容标明来源：组件名、版本、模型、提示词版本。`topic.generated` 已有 `model` 和 `extractor` 字段，可以沿用。

---

## 3. 核心数据模型

### 3.1 三层结构

| 层 | 内容 | 谁写 | 能否重建 |
| --- | --- | --- | --- |
| **材料层** | 原始材料（ingest JSON、字幕）、用户笔记 markdown | 用户、解析工具 | 不改写。改用户笔记必须经用户确认（裁决 10） |
| **派生层** | 概念、关系、块（即现在的 `learn.json`）、**归类组件的提议**、重要性、今日计划 | 编译器、复用组件 | **随时可以重算；更换组件也只影响这一层** |
| **决定层** | 目标、用户修正、学习痕迹（掌握事件、勾选、我的思考） | 用户（和用户确认过的提议） | **永不重算，只追加** |

不变式：**派生层 = 编译(材料层, 决定层)**。复用组件只往派生层写提议，决定层原样作为输入，所以更换组件不会丢失用户的东西。

### 3.2 实体

```text
Goal        目标
  id (稳定)  title  intent(为什么学 / 范围 / 截止时间，可选)
  status: active | paused | done
  origin: user | proposed(confirmed_at)

Item        一份输入材料
  id  kind: video | article | pdf | note | idea
  ref  title  added_at  content_hash
  pipeline: queued | ingested | classified | compiled | failed(reason)

Assignment  归属（多对多）
  subject: item:<id> | concept:<id>
  goal_id  confidence(0–1)  reason  evidence[]
  by: component(name, version, model?) | user
  state: proposed | accepted | rejected

Concept     概念（沿用 learn.json concept，补稳定 ID 规则）
  id (稳定)  label  aliases[]  items[](出自哪些材料)  blocks[]  ev[]

Relation    关系
  a  b  kind: related | uses | contrast | part_of | prereq
  by: compiler | component | user   confidence  ev[]
  约束: prereq 只能来自用户或原文明说

Tag         标签（复用组件产出，派生层）
  subject  label  by  confidence

Importance  重要性（派生，相对于目标）
  (concept_id, goal_id) → score  factors[](列出依据)   用户置顶可覆盖

LearningEvent  学习痕迹（决定层，只追加）
  at  concept_id  card_id?
  kind: recall | self_rate | checklist | reflection | question
  result: again | hard | good | easy | done | (文本引用)
MasteryState   掌握状态（派生）：FSRS 的 stability、difficulty、due 等由事件重算

Evidence    出处（沿用现有 ev）
  {note} | {src, t} | {src, page}
  派生内容额外记录: compiler_version, component, model, prompt_version

Override    用户修正（决定层）
  id  at  target(稳定 ID)
  op: reassign | reject | rename | hide | pin_importance
      | add_relation | remove_relation | merge | split
  value  reason?
  目标消失时: 标记为 orphaned 并在报告里列出，不能静默丢弃

ChangeLog   整理日志（派生层每次重算的差异）
  at  trigger(item_id)  changes[]  undo_ref
  助手说「我整理了 X，要改吗」靠的就是这份日志

TodayPlan   今日计划（派生，可存快照）
  date  entries[]: {concept_id | item_id, why, kind: review | new | practice}
```

### 3.3 要点

- **稳定 ID 是第一优先级**（§2.2）：
  - 主题 ID 不再取目录名；
  - 概念 ID 写回 frontmatter（需要用户确认），或者由编译器维护一份「路径 → ID」映射；
  - 块 ID 改为基于内容锚点生成，不用序号。
- **存储位置**：建议放在 vault 的 `_系统/` 下（例如 `goals.json`、`decisions.jsonl`、`events.jsonl`），只由本地后端写入。这样既符合「文件即 API」和裁决 10，也符合 `CONTRACTS.md` 中「前端不直接写文件」的约定。
- **和蓝图的冲突**：蓝图 §3.1 计划把 FSRS 状态写进概念卡 frontmatter，会和裁决 10 冲突。建议改为事件日志加派生状态，由负责人拍板（§7）。
- **用户修正能反过来训练组件**：Override 里的 reassign 和 reject 天然就是带标签的训练数据。数据积累后，可以直接喂给少样本分类器（§4.2 的 SetFit）。这是「复用」路线的额外收益。

---

## 4. 可复用的归类、聚类、打标签方案

### 4.1 选型原则

- **只复用，不自研算法。** 我们负责接口、评测集和决定层。
- **按数据量分阶段：**
  - 现在只有几个主题、几十个概念：用 LLM 结构化输出；
  - 材料增加到几十上百份：用 embedding 做相似度和候选关联；
  - 修正记录积累后：用少样本分类器。
- **优先贴合现有栈。** 后端已经依赖 `@ai-sdk/openai`（`server/package.json`），编译器是 Python，并且已经有可注入的抽取器接口。

### 4.2 候选清单

「核实」列说明本轮是否检索确认过。

| 用途 | 方案 | 说明 | 核实 |
| --- | --- | --- | --- |
| **主题级归类、提议目标（v0 首选）** | Vercel AI SDK 结构化输出：`generateObject`，新版文档倾向 `generateText` + `Output.object`，配 Zod 或 JSON Schema | 输出按 schema 校验，失败时抛出明确错误；和后端现有的 `@ai-sdk/openai` 一致，可以走 OpenAI 兼容端点。需要在 `server/package.json` 显式声明 `ai` 包，具体用哪个 API 按已装版本确认。[文档](https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data) | ✅ 已检索 |
| 同上（Python 侧） | [Instructor](https://github.com/567-labs/instructor) | 基于 Pydantic 的结构化输出，负责校验和重试，支持多家模型，MIT 许可。适合放进编译器的注入接口 | ✅ 已检索 |
| 多语言 embedding | [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) | MIT 许可，1024 维，最长 8192 token，可以用 sentence-transformers 加载。约 5.7 亿参数，本地运行偏重 | ✅ 已检索 |
| embedding 运行库（Python） | [sentence-transformers](https://github.com/UKPLab/sentence-transformers) | 业界常用；bge-m3 的模型卡给出了用法 | ⚠️ 仓库组织名可能已迁移，未重新核实 |
| embedding 运行库（Node） | Transformers.js（npm 包 `@huggingface/transformers`，旧名 `@xenova/transformers`） | 在 Node 本地跑 `feature-extraction` 管线，默认加载 8 位量化模型。[示例模型卡](https://huggingface.co/Xenova/gte-small) | ✅ 已检索（只看了模型卡，没看仓库） |
| 聚类和主题发现（数据多了以后） | [BERTopic](https://github.com/MaartenGr/BERTopic) | 默认流程：embedding → UMAP → HDBSCAN → c-TF-IDF，各步骤都能替换；支持 guided、zero-shot 等变体。0.17 起有不含 UMAP/HDBSCAN 的轻量安装 | ✅ 已检索 |
| 轻量聚类 | scikit-learn 的 `HDBSCAN`、`AgglomerativeClustering` | 不需要 BERTopic 整套流程时直接对 embedding 聚类 | ⚠️ 凭已有知识（`sklearn.cluster.HDBSCAN` 自 1.3 起提供），未重新检索 |
| 少样本分类（修正积累后） | [SetFit](https://github.com/huggingface/setfit) | 基于 Sentence Transformers 的少样本微调，不需要写提示词；可以用多语言模型。用户的 Override 可以直接当训练数据 | ✅ 已检索（Hub 文档） |
| 关键词和标签 | [KeyBERT](https://github.com/MaartenGr/KeyBERT) | 用 embedding 提取关键词，也能作为 BERTopic 的表示层 | ⚠️ 凭已有知识；BERTopic 文档提到它 |
| 中文分词和关键词 | [jieba](https://github.com/fxsjy/jieba) | TF-IDF 和 TextRank 关键词，零模型、离线可用 | ⚠️ 凭已有知识，未重新检索 |
| 别名和近似名候选 | [RapidFuzz](https://github.com/rapidfuzz/RapidFuzz) | 字符串相似度，用来给裁决 7 的同名候选打分 | ⚠️ 凭已有知识，未重新检索 |

以上模型和库的版本、许可证和中文效果，都要在接入前用我们的评测集实测，不以文档宣称为准。

### 4.3 接入方式：组件放在接口后面

仓库已有先例：编译器的 `ConceptExtractor` 协议（`tools/learning/extractors.py`）用 `--extractor null|annotated|pkg.module:Attr` 注入抽取器；注入结果必须带证据，校验失败就丢弃并记录。归类可以照搬这个模式。

```text
Organizer 协议（每种实现都返回提议，不直接生效）
  name, version
  classify(items[], goals[], decisions) -> AssignmentProposal[]
      AssignmentProposal = {subject, goal_id | null, confidence, reason, evidence[]}
  propose_goals(items[]) -> GoalProposal[]          # 冷启动
  related(concepts[]) -> RelationCandidate[]        # 可选，embedding 实现
  tag(item) -> Tag[]                                # 可选

内置实现
  null        不产出（无密钥时的默认行为，不阻塞导入）
  folder      按现有目录名映射到目标（等价于今天的行为，作为基线）
  llm         结构化输出（v0 首选）
  embedding   可选扩展（相似度 / 聚类）
  pkg.module:Attr  第三方实现
```

约束：

1. **输出一律是提议**，写进派生层。只有用户接受、或者置信度高于阈值且用户开启了自动接受，才变成 `accepted`。用户的 Override 永远优先。
2. **输入只给必要内容**：主题标题、一句话定义、来源标题。笔记和字幕都是数据，提示里要说明不能当指令执行（AGENTS.md）。
3. **每条提议都带来源**：`by: {component, version, model, prompt_version}`。模拟实现必须显式标记，不能冒充真实模型的结果。
4. **组件放在哪里**：
   - LLM 实现放在后端（密钥只在后端读取），由编译器或任务队列调用；
   - embedding 实现做成 `tools/learning` 的可选扩展，不进零依赖核心。
5. **评测集**：用 `_notes_input` 的三个真实主题，加负责人确认的两三个目标，人工标注期望的归属（含「AI 量化交易系统 → 量化 + AI」）。每更换一次组件或提示词就跑一遍，记录准确率、改正率、调用次数、token 数和耗时。评测集放进 `samples/`，只放标注和摘要，不提交真实笔记全文。

---

## 5. 第二轮落地情况

| 功能 | 定位要求 | 现在的实现 |
| --- | --- | --- |
| **星图** | 呈现整理后的学习记录，不由用户手搭 | 后端列出已编译主题，`#/star-dive/<topic>` 直接加载；全景图按目标分组，星的亮度来自掌握度，待确认的关联以虚线标出（`concept-graph/src/views/panorama/`） |
| **总控台** | 呈现目标、进度、今日该学什么 | 「今天」视图：今日计划（每条附理由）、目标卡、整理卡和学习统计层（`concept-graph/src/views/today/`） |
| **助手** | 答疑，同时是「我已经帮你归类好了，要调整吗？」的沟通入口 | 场景上下文包含目标、今日计划和待确认数；服务端工具 `get_learning_record`；可以打开调整归类层，由用户点按钮确认 |
| **笔记菜单** | 用户修正归类结果的那一层 | 资料视图详情和调整归类层：改归属、拒绝、隐藏、置顶、挂载想法，全部写成 Override（`concept-graph/src/views/library/`、`views/layers/`） |
| **归类组件** | 复用现成方案 | `null` / `folder` / `llm` 整理器，`llm` 用 AI SDK 结构化输出；评测集与打分工具（`samples/organize-eval/`、`tools/learning/organize_eval.py`） |
| **输入流水线** | 丢什么都行 | 视频链接在应用内走完解析、生成笔记、编译（`server/src/record/video.mjs`）；想法挂到已有的星；Obsidian 主题目录可直接编译 |

---

## 6. 下一轮建议范围

### 第二轮：学习记录呈现 + 可复用的整理底座

#### 必做

0. **完成真实模型验收**（第一轮遗留）。
1. **稳定 ID 和决定层**
   - 修正 ID 规则（§2.2）。
   - 后端提供 goals、overrides、events 的读写，存在 `_系统/`。
   - 编译器重新编译时应用修正，修正落空要报告。
   - 测试：施加修正 → 重新编译两次 → 修正仍然生效；删掉目标概念 → 报告 orphaned。
2. **Organizer 接口和第一个复用实现**
   - 按 §4.3 定义接口，先做 null 和 folder 两个基线。
   - 再做 llm 实现：AI SDK 结构化输出，只做主题级归类和目标提议。
   - 建评测集，并记录结果。
   - embedding 和聚类不在本轮。
3. **星图呈现学习记录**
   - 后端列出已编译主题，通过 `#/star-dive/<topic>` 加载，取代页面内的文件选择。
   - 总览按目标分组。
   - 星的亮度来自学习痕迹。
   - 待确认的归属有标记。
4. **最小学习信号**
   - 离开一颗星时出一道回忆题：块里有题就出题，没有题就显示「记得 / 忘了」两键，结果写成 LearningEvent。
   - 实操勾选也写成 LearningEvent（勾选持久化需经后端写入）。
   - FSRS 排期是可选项，事件字段先按 FSRS 兼容设计。
5. **总控台 v0**（独立路由）
   - 目标 → 主题 → 已学、已回忆、待确认；最近学习记录。
   - 「今天」最多 5 条，规则透明，不调用 LLM：先列到期复习，再沿阶段顺序列新内容，每条附「为什么」。
   - 建议同时取代旧的 `#/` 演示概念图。
6. **助手 v0**
   - 把目标和今日计划加入场景上下文（契约改动，由集成人做）。
   - 提供按钮式的归属提议卡，结果写成 Override。
   - 能回答「为什么今天推荐这个」，答案只引用 TodayPlan 里的 `why`。
7. **笔记菜单 v0**：在主题和概念上可以改归属（多选）、拒绝、隐藏、置顶重要性。全部写成 Override。

#### 不做（第三轮或以后）

- 应用内「粘贴 URL → 解析 → 生成笔记 → 编译」流水线。
- 文章、PDF、零散想法的输入。
- embedding 相似度、聚类、SetFit 少样本分类（等数据和修正记录积累以后）。
- 概念级跨主题合并、自动前置关系。
- 桌宠、通知、Streak。

#### 验收脚本（真实模型，真实笔记）

1. 三个真实主题，此时没有任何目标 → llm 实现提议两三个目标 → 用户确认，并改名一个。
2. 三个主题获得归属提议。「AI 量化交易系统」要么归入两个目标，要么进入「待确认」。结果和评测集对比并记录。
3. 把实现换成 folder 基线 → 已确认的归属不变（证明组件可以替换）。
4. 在笔记菜单里改一个主题的归属 → 重新编译 → 修改保持不变。
5. 在星图完成三颗星的离星回忆 → 星变亮 → 总控台的「今天」列表变化，每条都有理由。
6. 问助手「为什么今天学 X」→ 回答引用计划依据，不编造理由。

#### 分工建议（遵守 AGENTS.md 的边界，由集成人最终确定）

- 集成人：契约扩展、星图和总控台路由、接入。
- 后端：决定层 API、llm 版 Organizer、真实模型验收。
- 界面：总控台、笔记菜单、提议卡。
- 笔记编译器：稳定 ID、Organizer 注入点、编译时应用修正、评测集。

---

## 7. 需要负责人拍板

1. **决定层存在哪里？** 建议放 `_系统/` 下的独立文件；蓝图原方案是写进概念卡 frontmatter，会和裁决 10 冲突。
2. **目标只能提议，还是允许组件自动创建？** 建议只能提议，用户确认后才生效。
3. **接不接受「最小学习动作」？** 也就是离星一题或两键自评。
4. **归类允许把摘要发给 LLM API 吗，还是需要纯本地方案？** 这会决定 v0 选结构化输出还是本地 embedding。
5. **旧的 `#/` 演示概念图是否由总控台取代？**

---

### 参考来源

- Vercel AI SDK 结构化输出：[文档](https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data)、[示例](https://ai-sdk.dev/examples/next-pages/basics/generating-object)
- Instructor：[GitHub](https://github.com/567-labs/instructor)
- BAAI/bge-m3：[模型卡](https://huggingface.co/BAAI/bge-m3)
- Transformers.js：[示例模型卡](https://huggingface.co/Xenova/gte-small)、[DataStax 教程](https://datastax.com/blog/how-to-create-vector-embeddings-in-node-js)
- BERTopic：[GitHub](https://github.com/MaartenGr/BERTopic)、[发布记录](https://www.github.com/MaartenGr/BERTopic/releases)
- SetFit：[Hub 文档](https://huggingface.co/docs/hub/setfit)
- Mem Collections（交互参照）：[Mem 博客](https://get.mem.ai/blog/automatic-organization-with-collections)
