# 通用学习模板 · 设计

> 前提（产品负责人 2026-11-07 澄清）：应用里配置好 LLM API，用同一套笔记工作流（youtube-obsidian-notes 技能）**自己生成笔记**；然后只用**一个通用模板**，就能给任何一套笔记生成可视化和交互学习。所有内容都由生成得到，不手写卡片。
> 本文回答：模板要有多"通用"，以及不同内容怎样塞进同一个模板而不失真。
> 只做规划：不改代码、不提交。实施阶段见 `PLAN_NOTES_VIZ.md` §5。

---

## 0. 结论先行

起点方案是"按知识形状设计 → 每个概念标一个形状 → 每个形状一个渲染器 → 失败回退为定义卡加原片"。方向是对的，但有 5 处需要改：

1. **一个概念不止一个形状。** "MA"既是定义，又是推导，又能调参。把整个概念标成一个形状会丢信息。改为**形状挂在"块"上**：一个概念 = 1 个核心定义 + 0–3 个其他形状的块。概念的"主形状"只用来决定星的颜色。
2. **recall 不是形状，是一层。** 每种形状都能**确定性地**生成自测题：定义挖空、流程排序、对比表遮一格、调参预测方向、清单问下一步。这样自测题不用 LLM 另写，内容一定来自已有素材，复习对所有主题都通用。
3. **原片不是卡片类型，是证据。** 每个块都带 `ev`（出处），原片片段从 `ev` 自动汇总。"看"这一步对所有主题都免费可得。
4. **少了"结构"形状。** 系统架构、组成部分、状态机在 AI 工具和大学课程里都很多，塞进流程或定义都会变形。
5. **"例子"不是形状，是角色。** 案例、故事、例题都是某个形状的一个实例（`role: example`），不需要单独的渲染器。

最终方案：**6 个形状 × 6 个渲染器**（定义 definition、结构 structure、流程 process、对比 comparison、变化 variation、操作 procedure），加上 3 层通用能力：**证据**（ev + 原片）、**自测**（由块派生）、**主题层**（星图、关系、航线，全部由数据计算得出）。渲染器**永远不按学科分支**。

压力测试结论（§4）：金融和 AI 工具两套真实笔记能完整落地，并暴露出两类需要加进模板的东西："**声明值核对**"（Kelly 公式算出的数和视频说的数对不上）和"**可验证规则**"。假设的线性代数课在"几何 / 平面变换"处断开，模板只为它预留**一个**扩展位（`variation.domain = "plane"`），在扩展做出来之前走回退路径。

---

## 1. 形状清单

### 1.1 六个形状：每个回答一个问题

用"这一段在回答什么问题"来区分形状，而不是看学科：

| 形状 | 回答的问题 | 判别特征 | 渲染器和交互 | 自动自测 | 规模上限 |
| --- | --- | --- | --- | --- | --- |
| `definition` 定义 | 它**是什么**？ | 一个对象的身份、要点、术语、公式（不调参）、代码或文件样例 | 一句话定义，关键短语可点开（挖空）；要点逐条出现，每条带 ▶；术语翻卡；`math` 用 KaTeX；`artifact` 用代码框加复制按钮 | 关键短语挖空 | 要点 ≤6，术语 ≤8 |
| `structure` 结构 | 由**哪些部分**组成，部分之间**怎么连**？ | 多个部分**同时存在**：架构、组成、层级、状态机、分类树 | 小型节点图（布局：flow / hub / cycle / layers / tree），节点依次点亮，点节点看说明，边上可以有流动动画 | 遮掉一个节点或一条边，问"缺的是什么" | 节点 3–9 |
| `process` 流程 | **怎么发生**、怎么**推出来**？ | 有序阶段，**顺序本身就是知识**；推动者是世界、系统或逻辑。模式：因果 causal / 时间 time / 推导 derivation / 叙事 story | 步进器（自动播放、上一步、下一步）；推导模式有"约去项"动画；时间模式用时间轴 | 把步骤打乱，让学习者排序 | 2–8 步 |
| `comparison` 对比 | 几样东西**哪里不同**，**什么条件下**用哪个？ | ≥2 个对象 × ≥2 个维度；或"条件 → 结论"的规则表 | 矩阵，逐行出现；相同的格自动合并（现有逻辑）；✅⚠️❌ 状态标记；可以切换列 | 遮掉一格，四选一 | 对象 2–4 × 维度 2–6 |
| `variation` 变化 | 随**什么变**，**怎么变**？ | 输入和输出之间的关系**可以计算**（公式，或对一条序列做指标运算） | 滑块、可拖动的光标、曲线；实时读数；状态文字跟着光标变；关键点可以跳转；每处都能 ▶ 回原片 | "如果……，X 会怎样？"（从 `states` 里抽题） | 输入 1–3，曲线 1–6 |
| `procedure` 操作 | **我该怎么做**？ | 学习者自己动手，每步都有可检查的结果；可以有分支 | 可勾选的清单，分组；`cmd` 一键复制；`verify` 写预期现象；`warn` 标风险；`branch` 做分支 | "完成 A 之后下一步是什么？" | 每组 ≤8 项，总共 ≤20 |

和现有原型 shape 的对应：`formula` → definition 的 `math`（不调参时）或 variation（可调参时）；`timeline` → process 的 `mode: time`；`example` → 角色 `role: example`；`compare` → comparison。

### 1.2 三个和形状正交的维度

- **角色** `role`：`principle`（原理，默认）、`example`（例子 / 例题）、`case`（真实案例或故事）、`pitfall`（坑）。只影响徽标和排序，不影响渲染器。
- **证据** `ev`：每个块、每个要点都可以带出处。原片片段、▶ 时间戳、"笔记出处"链接都从 `ev` 生成。
- **自测**：由形状确定性派生（见上表），P3 接入 FSRS。

### 1.3 完备性检查：常见内容各归哪个形状

| 笔记里的内容 | 归到 | 说明 |
| --- | --- | --- |
| 一句话定义、要点、金句 | definition | 金句 = 带 quote 证据的要点 |
| 静态公式（只展示，不调参） | definition.`math` | 只有讲到"改变量会怎样"时才用 variation |
| 代码、配置文件、Prompt 样例 | definition.`artifact` | 太长时折叠 |
| 统计数字表（胜率、回撤…） | definition.`facts` 或 comparison | 只有一个对象 → facts；多个对象 → comparison |
| 数学推导、证明 | process（`derivation`） | 超过 8 步就拆成两块 |
| 历史和时间线 | process（`time`） | |
| 故事、现场演示 | process（`story`）+ `role: case` | 演示本身只能靠原片 |
| 架构图、mermaid 全景图 | structure | 主题首页的全景图同时用作关系的来源（§3） |
| 状态机、转移关系 | structure（`cycle`），边可以带权重 | 歧义见 §1.5 |
| 分类（五种趋势…） | comparison（有共同维度时）/ structure（`tree`，纯层级时） | |
| 规则（如果……就……） | comparison（`rules`：条件 \| 结论） | |
| 决策树（学习者按条件去做） | procedure（`branch`） | |
| 公式调参、指标随时间变化 | variation | |
| 安装、SOP、观察清单 | procedure | |
| 优点与局限表 | comparison（两列 ✅ / ⚠️） | 几乎每张概念卡都有，是兜底的第二块 |
| 💭 我的思考 | 不进模板 | 留给用户 |

覆盖不了的内容（明确不在本模板范围内）：几何 / 空间变换（§4.3 断点）、音频（比如语言课的发音）、需要真实运行环境的操作结果（只能让学习者自己确认）。

### 1.4 LLM 选形状的规则（按顺序问，**针对一段素材**，不是针对整个概念）

```
对概念的每一段素材（笔记里的一节 / 一张表 / 一个列表）：
Q1 学习者要亲手执行、而且结果能检查吗？                → procedure
Q2 讲的是"改变某个输入，输出怎么变"，而且能写成公式或指标吗？ → variation
   （讲了"变化"但写不成公式 → 继续往下问）
Q3 是 ≥2 个对象在 ≥2 个维度上的对照，或者"条件→结论"吗？  → comparison
Q4 有顺序，而且换了顺序就不对了吗？                    → process
Q5 是同时存在的部分和它们之间的连接吗？                 → structure
否则                                                → 归入核心 definition 的要点
```

- 一个概念**一定有**一个核心 definition 块（来自一句话定义）。它是星的正面，也是兜底。
- 另外最多选 3 个块，按 **variation > process > comparison > structure > procedure** 的优先级保留（越靠前越能体现"交互的价值"；procedure 往往属于整个主题，可以挂到主题末尾，§3.4）。
- **概念主形状** = 保留下来的块里优先级最高的那个；只有 definition 时就是 definition。主形状决定星的颜色和图例。
- 素材本身不支持时**不硬凑**：宁可只有一个定义块加原片，也不要编一个 variation。

### 1.5 歧义情况和裁决

| 情况 | 候选 | 裁决 |
| --- | --- | --- |
| 状态机（Regime：牛 / 熊 / 震荡和转移概率） | structure 或 process | 状态同时存在 → **structure（cycle）**；如果讲的是"一次具体的状态演变" → process（time） |
| 推导（抵扣价约去项） | process 或 variation | 推导本身 → **process（derivation）**；推导的结论可以拿数据演示 → **另加**一个 variation 块 |
| MA 和 EMA | comparison 或 variation | **两块都要**：对比表讲清差异，同图双线让学习者"看见"差异 |
| 决策清单（趋势识别：先分类再按类型操作） | procedure 或 comparison | 学习者照着做 → **procedure（branch）**；只是列出各类型的策略 → comparison（rules） |
| 观察清单（双均线：每天收盘后看什么） | procedure 或 process | 学习者在执行 → **procedure** |
| 规则包（风险引擎 6 条规则 + 实测结果） | comparison 或 structure | 规则 × 维度（作用 / 实测）→ **comparison**；各规则之间的串联裁决 → structure（flow） |
| 讲变化，但没有可计算的关系（"大幅乖离要回归"） | variation 或 definition | 写不成公式 → **definition 的要点**（Q2 的硬条件） |
| 故事（Archie Karas $50 → $4000 万 → 归零） | process 或 definition | 有情节顺序 → **process（story）+ case** |
| 一个概念同时讲公式和一份数据 | variation（函数）或 variation（序列） | 有序列（价格、时间）→ series；只有变量关系 → function |

---

## 2. 中间格式（learn.json）

### 2.1 分层

```
topic（主题层：来源、阶段、关系 —— §3）
 └─ concepts[]（一个概念 = 一张概念卡 = 一颗星）
     └─ blocks[]（1 个核心 definition + ≤3 个其他形状）
         └─ 字段里的条目（要点 / 步骤 / 格子 / 状态…）各自可以带 ev
```

文件位置：`<主题>/90-资源/<主题> · learn.json`（在应用管理的笔记库里）。**markdown 是事实源，learn.json 由它派生**。用户只改笔记；改了以后，只重新抽取 `note_hash` 变了的概念。

### 2.2 顶层和概念

```jsonc
{
  "schema": "learning.learn/0.1",
  "topic": {
    "id": "双均线交易系统", "title": "双均线交易系统",
    "flags": { "disclaimer": "仅作学习整理，非投资建议", "asof": null },  // 只有"旗标"，渲染器不按学科分支
    "generated": { "at": "2026-11-07T10:00:00", "model": "<配置的模型>", "prompt": "extract/0.1", "notes_dir": "策略学习/双均线交易系统" }
  },
  "sources": [
    { "id": "v1", "kind": "video", "platform": "youtube", "ref": "Pe04VShLE1g", "title": "移動平均線原理｜雙均線交易系統",
      "duration_sec": 641, "transcript": "90-资源/双均线交易系统 · ingest.json", "trusted": true,
      "chapters": [{ "t": [0, 45], "title": "市場規律", "note": "01-课程笔记/ch01 市场规律.md" }] }
    // 也可以是 { "kind": "pdf", "ref": "<文件>", "pages": 320 }
  ],
  "stages": [{ "title": "打基础：均线在算什么", "chapters": ["ch01", "ch02"] }],   // 来自学习主页；没有主页时按章节自动分组
  "relations": [{ "a": "ema", "b": "ma", "kind": "contrast", "ev": [{ "note": "01-课程笔记/ch04 EMA指数移动平均线.md" }] }],
  "concepts": [ /* §2.4 */ ]
}
```

```jsonc
// 概念
{
  "id": "deduction",                       // 稳定的 slug（建议写进概念卡 frontmatter 的 id 字段）
  "label": "抵扣价", "aliases": ["抵扣价原理"],
  "note": "02-概念卡/抵扣价.md", "note_hash": "sha1:…",
  "one_liner": "决定 N 日均线明天方向的那个「N 天前的收盘价」；今天收盘价高于它，均线今天就向上。",
  "key": "N 天前的收盘价",                  // 挖空用；默认取笔记里 ==高亮== 的那段
  "group": "核心机制",                      // 学习主页「核心概念卡」表里的分类
  "blocks": [ /* 第一个必须是 definition */ ]
}
```

`primary`（主形状）、`importance`（重要度）、`chapters`、`first_t`、星的位置这些**由程序计算，不由 LLM 填**（§3）。

### 2.3 块：共有字段和六个形状的字段

共有字段：

```jsonc
{
  "id": "deduction.lab",        // <concept>.<短名>，全局唯一；自测、进度、复习都靠它
  "shape": "variation",
  "title": "拖动日期：抵扣价怎样决定 MA 方向",
  "role": "principle",          // principle | example | case | pitfall
  "grounding": "illustrative",  // 见 §2.5
  "ev": [{ "src": "v1", "t": [269, 289] }]
}
```

`ev` 有三种写法：`{src, t:[s,e], quote?}`（视频；quote 在抽取时从字幕截取）、`{src, page}`（PDF）、`{note: "<路径>#<标题>"}`（笔记中的位置）。

各形状的专属字段（schema 定稿时用 JSON Schema 写，这里先用示意写法）：

| 形状 | 字段 |
| --- | --- |
| definition | `points[{text, ev?}]`、`terms[{term, gloss}]`、`math?`、`artifact?{lang, code}`、`facts?[{k, v, ev}]` |
| structure | `layout: flow\|hub\|cycle\|layers\|tree`、`nodes[{id, label, gloss?, concept?}]`、`edges[{from, to, label?, kind: part\|flow\|transition\|depends, w?}]` |
| process | `mode: causal\|time\|derivation\|story`、`steps[{label, detail?, math?, cancel?[], t?, ev?}]`、`loop?` |
| comparison | `mode: matrix\|rules\|pros_cons`、`items[{label, concept?}]`、`dims[]`、`cells[dim][item]{text, mark?: good\|warn\|bad}`、`verdict?` |
| variation | `domain: function\|series`、`inputs[{name, label, min, max, step, default, presets?}]`、`x?`（function 用）、`data?`（series 用）、`series[{id, label, expr, mark?}]`、`readouts[{label, expr, fmt?}]`、`states[{when, text, implies?}]`、`notables[{find\|at, text, ev}]`、`claims[{text, ev, check}]` |
| procedure | `groups[{title, items[{id, text, cmd?, verify?, warn?, branch?, ev?}]}]`、`warnings[]` |

**variation 用的表达式**只有一套白名单 DSL（扩展现有 `dsl.ts`，不用 eval）：

- function 域：变量是 `x` 和各个 input；函数和常量照旧。
- series 域：序列变量有 `close`（以后加 `open/high/low/volume`）；序列运算只有 `sma(s,N)`、`ema(s,N)`、`shift(s,N)`、`diff(s)`、`slope(s)`；谓词只有 `cross_up(a,b)`、`cross_down(a,b)`、`turn_up(s)`、`turn_down(s)`；在光标那一天求值。
- 找点：`first <谓词>`、`last <谓词>`、`intersect(a, b)`（供需曲线这类交点）。
- 数据：`{gen: trend_up|trend_down|range|reversal_up|reversal_down|accel_up|cycle, n, seed}` 用种子生成**和学科无关的信号形态**；或者 `{inline: [...], label, asof}` 在生成时内嵌真实数据，运行时不联网。

### 2.4 让规则"可验证"：`implies` 和 `claims`

只靠"有出处"还不够，这是压力测试（§4）暴露的问题。模板加两种由机器检查的断言：

- `states[].implies`：这条规则在数据上必须恒成立。比如"今收 > 抵扣价 → MA 向上"写成 `when: "close > shift(close,N)", implies: "slope(sma(close,N)) > 0"`，校验器在整条序列、所有预设 N 上逐点检查。LLM 把抵扣价写成 N−1 天前这种错，会被当场抓出来。
- `claims[].check`：视频或笔记里的**具体数字**，如果能用块里的公式算出来，就附上一个检查（表达式、参数取值、期望值、允许误差）。校验器算出来不一致时，**不改数字**，把这条声明标成 `conflict`，界面上同时显示"视频说 X / 按公式算是 Y，以视频为准"。

### 2.5 grounding 五档

| 档 | 含义 | 要求 | 徽标 |
| --- | --- | --- | --- |
| `video` | 视频原意 | 至少一条带 `t` 的视频 ev；有 quote 时必须能在字幕里匹配上 | 视频原意 |
| `note` | 笔记整理或推断 | 至少一条 note ev | 笔记整理 |
| `derived` | 由已有出处的公式算出来 | 公式本身要有 ev；计算结果不算"声明" | 公式推算 |
| `illustrative` | 规则来自出处，数据是示意 | 规则（states、notables）要有 ev；数据是生成的 | 示意数据 · 规则见 ▶ |
| `supplementary` | 出处里没讲 | 每个概念最多 1 块；不能带 claims | 补充（视频未讲） |

**数字检查**：块的文字字段里出现的每个数字（不算 math、expr 和输入范围），都必须能在它的证据文本里找到（笔记那一节，或字幕时间窗；先统一繁简和中文数字，比如"二十" = 20）。这一步很便宜，能拦住大部分编造的数字。

### 2.6 校验和回退（保证任何内容都能渲染）

校验分四层，都是确定性的，在生成流水线里跑，前端加载时再跑一遍轻量版：

1. **结构**：JSON Schema（字段、类型、长度上限）。
2. **语义**：id 唯一；ev 引用的 src 或 note 存在；第一个块是 definition；形状规模在上限内；DSL 能编译。
3. **出处**：quote 和字幕能匹配；数字检查；`implies` 恒成立；`notables` 在数据里真的找得到；`claims` 计算核对。
4. **可渲染**：variation 冒烟测试（不出现 NaN 或无穷）；文字长度不溢出卡片。

失败时逐级降级，**永远不会崩**：

```
块不合格 ─► 把错误反馈给 LLM，重写一次（最多 2 次）─► 还不行就丢掉这个块（记日志，概念页角落显示"1 块未通过校验"）
概念里一个合格的非 definition 块都没有 ─► 核心 definition（一句话定义 + 笔记要点）+ ev 汇总出的原片
核心 definition 也不合格 ─► 直接用概念卡的「一句话定义」原文 + 概念卡里所有时间戳的片段
概念卡没有一句话定义 ─► 取正文第一段，显示"笔记缺少一句话定义"
```

### 2.7 笔记技能和 prompt 要怎么改

**方案：两遍。** 先生成 markdown（沿用技能），再**按概念**抽取 JSON。不在写笔记的同一次调用里顺带输出 JSON，原因有三：

- 笔记是经过真伪校验、给人读的那一层，JSON 从它派生，出处天然有保障；
- 一次一个概念，上下文小，失败只重试这一个，可以并行，成本可控（30 张卡 ≈ 30 次小调用）；
- 用户改了某张卡，只需要重新抽取它（按 `note_hash` 判断）。

技能的改动（SKILL.md）：

| 步骤 | 现在 | 改为 |
| --- | --- | --- |
| 1–2 元数据和字幕 | oEmbed、第三方字幕站 | 读 `video_ingest.py` 的输出；`trusted=false` 时停下来 |
| 3–4 建库、写笔记 | 不变 | 另加三条小约束：① 概念卡 frontmatter 加稳定的 `id`；② 事实性要点尽量就地带时间戳链接；③ 一句话定义里必须有一段 `==高亮==`（作为挖空的 key） |
| **4.5 结构化抽取**（新增） | — | 每张概念卡调用一次 LLM，输出它的 blocks；然后调用一次主题层（§3），输出 relations 和 stages |
| 5 校验交付 | 只检查断链 | 断链为 0，**加上** learn.json 四层校验报告（合格块数 / 降级数 / 冲突声明列表） |

抽取 prompt 的骨架（每个概念一次；要求按 JSON Schema 输出，配置的 API 支持结构化输出就用它，不支持就解析后再校验）：

```text
你是学习内容结构化器。只根据下面给出的【素材】输出这个概念的 blocks，不允许引入素材以外的事实或数字。

【素材】
- 概念卡全文：<02-概念卡/xxx.md>
- 引用了本概念的课程笔记段落：<各 chNN 中链到本卡的小节>
- 这些段落里时间戳附近的字幕：<ingest 字幕 [t-15s, t+30s]>
- 本主题其他概念的 id 和标签：<列表>（只用于 concept 字段引用）

【规则】
1. 第一个块必须是 definition：one_liner 用概念卡「一句话定义」，key 取其中 ==高亮== 的那段。
2. 对每一段素材按 Q1–Q5 选形状（附形状判别表）；另外最多 3 块，按 variation > process > comparison > structure > procedure 保留。
3. 素材不支持就不输出。variation 只在关系能写成白名单 DSL 时才输出（附 DSL 说明）。
4. 每个要点、步骤、状态都要带 ev；数字必须原样出自素材。
5. 素材里有具体数字、又能用你写的公式算出来时，写进 claims.check。
6. grounding 按五档如实填写；示意数据用 data.gen，不许编造"真实行情"。
【输出】只输出符合 schema 的 JSON。
```

校验失败时，把错误列表原样贴回给 LLM 再试（最多 2 次）。仍然失败就按 §2.6 降级。

---

## 3. 主题层也通用

主题层**不读学科**，只读笔记结构和 learn.json，全部由程序计算。只有关系类型和阶段名需要一次很小的 LLM 调用。

### 3.1 星

- 星 = 概念卡；颜色 = 主形状（6 种颜色）；大小 = `importance`（1–3）。
- `importance` 由程序计算：被几章笔记引用 + 关系度数 + 是否出现在主页「核心概念卡」表里。归一化后分 3 档。
- `first_t` = 这个概念所有 ev 里最早的时间。

### 3.2 关系（固定 5 类，前两类有方向）

| kind | 含义 | 从哪来（按可信度排序） |
| --- | --- | --- |
| `prereq` | 学 B 之前要先懂 A（A → B） | 主题层 LLM 判断（只能在已有关联的概念对之间选）；没有判断时，按"同一章出现、首次出现更早"推断 |
| `part_of` | A 是 B 的组成部分 | structure 块里引用了概念的节点；主页 mermaid 的子图 |
| `contrast` | A、B 互为对照 | comparison 块里 items 引用的概念 |
| `uses` | B 用到 A | mermaid 的边；structure 的 flow 边 |
| `related` | 其他关联 | 概念卡之间的 wikilink（基线；已经有更具体的类型时不重复画） |

约束：`prereq` 必须是有向无环图，出现环时保留首次出现更早的那个方向，其余降为 related。单个概念的关系线最多显示 6 条，多出来的只在聚焦时显示。

### 3.3 布局（确定性、种子固定、和学科无关）

- 初始位置：按航线顺序排在一条平缓的弧线上（"航线"从左下到右上），同一阶段的概念聚在一起。
- 再跑力导布局：关系是弹簧，`prereq` 稍长一些（体现先后），`contrast` 两端互相吸引（对照的概念并排），同组的概念轻微相吸。
- 概念超过 24 个时分两层：总览只显示**星座**（阶段或分组），点进星座才展开里面的星。总览里星座之间的连线 = 组间关系数。
- 跨课的前置知识（比如"微积分"）显示成**幽灵星**：没有卡片，只有名字和"外部前置"标记。

### 3.4 航线（学习路径）

```
stages = 学习主页「📚 学习路线」各阶段（没有就按章节顺序每 2–3 章一组）
每个概念归到它首次被链接的那一章所在的阶段
阶段内部：按 prereq 拓扑排序，同序时按 first_t
主题级 procedure（实操清单）挂在最后一颗星之后，作为"练"的终点
```

### 3.5 时间轴和原片

- 每个 source 一条轨道（多视频时分轨；PDF 显示页码条）；章节分段来自 `sources[].chapters`。
- 聚焦一颗星时，只显示它的 ev 刻度；"连播本星片段"按 ev 时间顺序串起来播放。

### 3.6 环绕卡（每颗星最多 4 张）

固定按 **看 → 懂 → 玩 → 练** 排序：

- 看 = 原片（由 ev 汇总成一张卡）
- 懂 = definition / structure / process / comparison
- 玩 = variation
- 练 = procedure 和自测

不同主题之间唯一的差别是"有哪些块"，排序规则本身不变。

---

## 4. 压力测试

三套内容：两套真实笔记，一套虚构的大学课程。每套写 2–3 个概念的 learn.json，然后列出断点。JSON 只保留关键字段，省略号表示同类字段从略。

### 4.1 金融 · 双均线交易系统（真实笔记）

**抵扣价**（主形状 variation）

```json
{
  "id": "deduction", "label": "抵扣价", "aliases": ["抵扣价原理"], "group": "核心机制",
  "one_liner": "决定 N 日均线明天方向的那个「N 天前的收盘价」；今天收盘价高于它，均线今天就向上。",
  "key": "N 天前的收盘价",
  "blocks": [
    { "id": "deduction.def", "shape": "definition", "grounding": "video",
      "points": [
        { "text": "今天 MA5 > 昨天 MA5 ⟺ 今天收盘价 > 5 天前收盘价", "ev": [{ "src": "v1", "t": [269, 289] }] },
        { "text": "收盘价低于 20 天前的价格时，MA20 不会拐头", "ev": [{ "src": "v1", "t": [466, 500] }] }
      ],
      "terms": [{ "term": "抵扣", "gloss": "今天的收盘价把窗口里最旧的那个价「抵扣」掉" }],
      "ev": [{ "note": "02-概念卡/抵扣价.md#📌 是什么" }] },

    { "id": "deduction.derive", "shape": "process", "mode": "derivation", "grounding": "note",
      "title": "相同项约掉，只剩两个价",
      "steps": [
        { "label": "今天的 MA5", "math": "\\tfrac{1}{5}(T+T_{-1}+T_{-2}+T_{-3}+T_{-4})" },
        { "label": "昨天的 MA5", "math": "\\tfrac{1}{5}(T_{-1}+T_{-2}+T_{-3}+T_{-4}+T_{-5})" },
        { "label": "相减：4 个共同项约掉", "math": "\\tfrac{1}{5}(T-T_{-5})", "cancel": ["T_{-1}", "T_{-2}", "T_{-3}", "T_{-4}"] },
        { "label": "方向只看首尾两个价", "detail": "今天收盘 > 5 天前收盘 → MA5 向上", "ev": [{ "src": "v1", "t": [269, 289] }] }
      ],
      "ev": [{ "src": "v1", "t": [216, 309] }, { "note": "01-课程笔记/ch03 抵扣价原理.md#推导：相同项约掉，只剩两个价" }] },

    { "id": "deduction.lab", "shape": "variation", "domain": "series", "grounding": "illustrative",
      "title": "拖动日期：抵扣价怎样决定 MA 方向",
      "data": { "gen": "reversal_up", "n": 140, "seed": 7 },
      "inputs": [{ "name": "N", "label": "周期 N", "min": 5, "max": 60, "step": 1, "default": 20, "presets": [5, 20] }],
      "series": [
        { "id": "ma", "label": "MA(N)", "expr": "sma(close, N)" },
        { "id": "deduct", "label": "抵扣价", "expr": "shift(close, N)", "mark": "point" }
      ],
      "readouts": [{ "label": "今收", "expr": "close" }, { "label": "抵扣价", "expr": "shift(close, N)" }],
      "states": [
        { "when": "close > shift(close, N)", "text": "今收 > 抵扣价 → MA 向上", "implies": "slope(sma(close, N)) > 0" },
        { "when": "close < shift(close, N)", "text": "今收 < 抵扣价 → MA 向下", "implies": "slope(sma(close, N)) < 0" }
      ],
      "notables": [{ "find": "first cross_up(close, shift(close, N))", "text": "收盘价越过抵扣价，MA 随之拐头",
                     "ev": [{ "src": "v1", "t": [466, 500] }] }],
      "ev": [{ "src": "v1", "t": [269, 289] }, { "src": "v1", "t": [466, 500] }] }
  ]
}
```

自动自测：挖空"N 天前的收盘价"；把推导 4 步打乱排序；"今收 < 抵扣价时，MA 向上还是向下？"（从 states 里抽）。`implies` 在数学上恒成立（MA 今天减昨天 = (今收 − N 天前收) / N），校验器会通过。如果 LLM 写成 `shift(close, N-1)`，校验会失败。

**EMA 指数移动平均线**（主形状 variation；同时有 comparison）

```json
{
  "id": "ema", "label": "EMA 指数移动平均线", "aliases": ["EMA", "指数移动平均"], "group": "两种算法",
  "one_liner": "当前价权重最大的加权指数平均；价在线上，线向上；价在线下，线向下——所见即所得。",
  "key": "价在线上，线向上；价在线下，线向下",
  "blocks": [
    { "id": "ema.def", "shape": "definition", "grounding": "video",
      "points": [{ "text": "当前价的权重最大", "ev": [{ "src": "v1", "t": [313, 340] }] }], "ev": [{ "src": "v1", "t": [326, 340] }] },
    { "id": "ema.vs_ma", "shape": "comparison", "mode": "matrix", "grounding": "note",
      "items": [{ "label": "MA", "concept": "ma" }, { "label": "EMA", "concept": "ema" }],
      "dims": ["算法", "对当前价的反应", "方向判断", "作者形容"],
      "cells": [
        [{ "text": "最近 N 日收盘价算术平均" }, { "text": "加权指数平均，当前价权重最大" }],
        [{ "text": "迟钝、滞后", "mark": "warn" }, { "text": "敏感、即时", "mark": "good" }],
        [{ "text": "当前收盘 vs N 天前抵扣价" }, { "text": "收盘价在线上即向上" }],
        [{ "text": "迟钝" }, { "text": "所见即所得" }]
      ],
      "ev": [{ "note": "01-课程笔记/ch04 EMA指数移动平均线.md#MA vs EMA 一张表对比" }] },
    { "id": "ema.lab", "shape": "variation", "domain": "series", "grounding": "illustrative",
      "title": "同周期双线：谁先拐头", "data": { "gen": "reversal_up", "n": 140, "seed": 7 },
      "inputs": [{ "name": "N", "label": "周期 N", "min": 5, "max": 60, "default": 20 }],
      "series": [{ "id": "ema", "label": "EMA", "expr": "ema(close, N)" }, { "id": "ma", "label": "MA", "expr": "sma(close, N)" }],
      "states": [{ "when": "close > ema(close, N)", "text": "价在线上 → EMA 向上", "implies": "slope(ema(close, N)) > 0" }],
      "notables": [
        { "find": "first turn_up(ema(close, N))", "text": "底部先拐头的是 EMA", "ev": [{ "src": "v1", "t": [453, 466] }] },
        { "find": "first turn_up(sma(close, N))", "text": "MA 后拐头", "ev": [{ "src": "v1", "t": [500, 514] }] }
      ] }
  ]
}
```

**双均线系统**（主形状 process；它的 procedure 是主题终点）——节选：

```json
{ "id": "dual.turn", "shape": "process", "mode": "causal", "grounding": "video", "title": "底部转折两步走",
  "steps": [
    { "label": "收盘价先站上 EMA", "detail": "EMA 立即拐头向上", "t": 466 },
    { "label": "MA 还没拐", "detail": "收盘价仍低于 20 天前的抵扣价", "t": 466 },
    { "label": "EMA 稳定上行，引导收盘价越过抵扣价", "detail": "MA 随之拐头", "t": 500 },
    { "label": "两线同向向上", "detail": "作者口径的牛市", "t": 514 }
  ] }
```

```json
{ "id": "dual.checklist", "shape": "procedure", "grounding": "note", "title": "双均线系统观察清单",
  "groups": [{ "title": "每日收盘后检查", "items": [
    { "id": "c1", "text": "收盘价是否站上 / 跌破 EMA", "verify": "趋势转折的第一步信号" },
    { "id": "c3", "text": "比较当前收盘价和抵扣价（20 天前收盘）", "verify": "决定 MA 会不会拐头" },
    { "id": "c4", "text": "两根均线是否同向", "branch": [{ "if": "EMA 拐了、MA 没拐", "then": "转折进行中" }, { "if": "两线不协调", "then": "警惕" }] }
  ] }],
  "warnings": ["别混用周期的抵扣价", "20/60/120 是作者的习惯参数，不是标准答案"] }
```

**金融的断点**

| # | 断点 | 处理 |
| --- | --- | --- |
| F1 | 示意数据必须**真的**出现声明的事件（EMA 先拐、MA 后拐） | 模板内解决：`notables.find` 找不到就换种子重新生成（生成器最多试 50 个种子） |
| F2 | 多周期传导（20 → 60 → 120 双线 = 6 条线） | 模板内解决：曲线上限设为 6；用预设按钮分组显示 |
| F3 | 趋势交易笔记里的"时钟方向"（对数坐标下的斜率角度）、"密集成交区 < 2%"（区间带）、"持续放量" | 部分解决：加 `slope_angle`、`band(hi, lo)` 两个运算和 `volume` 通道；K 线形态（顶部构造）**不做**，只用 definition + 原片 |
| F4 | 视频里的真实图表无法复现 | 接受：原片就是证据；示意数据带"示意"徽标 |
| F5 | 合成数据可能被误认为真实行情 | 模板内解决：`illustrative` 徽标常驻 + `topic.flags.disclaimer` |

### 4.2 AI 工具 · AI量化交易系统（真实笔记）

**Kelly 公式**（主形状 variation）：这次暴露的最重要断点在这里

```json
{
  "id": "kelly", "label": "Kelly 公式", "aliases": ["凯利公式", "Quarter Kelly", "Ramp Rule"], "group": "风险引擎",
  "one_liner": "用胜率与盈亏比算单笔最优下注比例；本课程算完三档取四分之一，再加爬坡限制——Kelly is a trap。",
  "blocks": [
    { "id": "kelly.def", "shape": "definition", "grounding": "note",
      "math": "f^* = \\frac{bp - q}{b},\\; q = 1 - p",
      "points": [
        { "text": "Kelly 的输入来自回测估计，估计错了，仓位会错得更快", "ev": [{ "note": "02-概念卡/Kelly 公式.md#⚠️ 为什么\"Kelly 是个陷阱\"" }] },
        { "text": "Ramp Rule：新策略零实盘记录，只允许上限的 20% 起步", "ev": [{ "src": "v1", "t": [4096, 4415] }] }
      ] },
    { "id": "kelly.lab", "shape": "variation", "domain": "function", "grounding": "derived",
      "title": "胜率和盈亏比 → 最优下注比例",
      "inputs": [
        { "name": "b", "label": "盈亏比 b", "min": 0.5, "max": 10, "step": 0.1, "default": 6.4 },
        { "name": "k", "label": "Kelly 档位", "min": 0.25, "max": 1, "step": 0.25, "default": 0.25, "presets": [1, 0.5, 0.25] }
      ],
      "x": { "label": "胜率 p", "range": [0.3, 0.95], "cursor": 0.8 },
      "series": [
        { "id": "full", "label": "Full Kelly", "expr": "max(0, (b*x - (1-x)) / b)" },
        { "id": "pick", "label": "所选档位", "expr": "k * max(0, (b*x - (1-x)) / b)" }
      ],
      "readouts": [{ "label": "$100K 账户单笔上限", "expr": "100000 * k * max(0, (b*x - (1-x)) / b)", "fmt": "$" }],
      "notables": [{ "at": { "x": 0.8, "b": 6.4 }, "text": "课程回测统计：胜率 80%、盈亏比 6.4", "ev": [{ "src": "v1", "t": [4096, 4415] }] }],
      "claims": [{
        "text": "作者选 quarter Kelly，单笔上限 $25,000",
        "ev": [{ "note": "01-课程笔记/ch12 Kelly 仓位与风险引擎实测.md#二、Kelly 阶梯与\"Kelly 是个陷阱\"" }],
        "check": { "expr": "100000 * 0.25 * (b*x - (1-x)) / b", "at": { "x": 0.8, "b": 6.4 }, "expect": 25000, "tol": 0.05 }
      }],
      "ev": [{ "src": "v1", "t": [4096, 4415] }] },
    { "id": "kelly.tiers", "shape": "comparison", "mode": "matrix", "grounding": "note",
      "items": [{ "label": "Full" }, { "label": "Half" }, { "label": "Quarter ✅" }],
      "dims": ["含义", "$100K 账户"],
      "cells": [[{ "text": "理论最优（假设估计永远准）" }, { "text": "减半" }, { "text": "作者选择" }],
                [{ "text": "远超承受力", "mark": "bad" }, { "text": "仍然激进", "mark": "warn" }, { "text": "单笔上限 $25,000", "mark": "good" }]] }
  ]
}
```

校验结果：按 p=0.8、b=6.4 计算，f* = 0.769，quarter = 19.2%，即 **$19,219**；笔记写的是 **$25,000**（"25% × $100K"），误差 23%，超过允许的 5%。这条声明会被标成 `conflict`，界面显示"⚠ 视频说 $25,000，按公式算是 $19,219：可能另有上限规则，以视频为准"。同理，"$5,000 被修剪成 $4,800"用笔记里的数字推不出来，只能当作事实陈述（不加 check），也不能让 LLM 编一个推导去"解释"它。**这正是需要 `claims` 的原因**：只靠"有出处"会让一个自相矛盾的数字堂而皇之地出现在可调参的图表旁边。

**Trade Intent**（主形状 process）

```json
{
  "id": "trade_intent", "label": "Trade Intent", "aliases": ["交易意图"], "group": "心智模型",
  "one_liner": "策略发出的「我想交易」的正式请求——先由策略产生，再交系统裁决；在本系统中落成一份可审查的 Markdown 规格文件。",
  "blocks": [
    { "id": "trade_intent.def", "shape": "definition", "grounding": "note",
      "artifact": { "lang": "yaml", "code": "标的: SPY\n数据源: Alpha Vantage（日线）\n指标: SMA 50 / SMA 200\n入场: 金叉做多；出场: 死叉离场\n状态: draft\n模式: paper only" },
      "points": [{ "text": "为什么是 MD 而不是代码：人能读、能审、能手改", "ev": [{ "src": "v1", "t": [3006, 3265] }] }] },
    { "id": "trade_intent.flow", "shape": "process", "mode": "causal", "grounding": "note", "title": "执行顺序（多数人想反了）",
      "steps": [
        { "label": "策略判定条件满足", "detail": "如 50SMA 上穿 200SMA" },
        { "label": "产生 Trade Intent" },
        { "label": "系统按规则裁决", "detail": "风险上限、回撤状态、新闻窗口……" },
        { "label": "放行下单 / 拦截" }
      ],
      "ev": [{ "src": "v1", "t": [335, 681] }, { "note": "02-概念卡/Trade Intent.md#📌 执行顺序（多数人想反了）" }] }
  ]
}
```

**MCP**（comparison + 主题末尾的 procedure）

```json
{ "id": "mcp.vs", "shape": "comparison", "mode": "matrix", "grounding": "video",
  "items": [{ "label": "截图法（市面常见）" }, { "label": "本课程的 MCP" }],
  "dims": ["原理", "问题 / 优势"],
  "cells": [[{ "text": "截图 → 发给 AI 看图识别" }, { "text": "读网页底层实时代码，取每根 K 线的精确数值" }],
            [{ "text": "识别完价格早变了", "mark": "bad" }, { "text": "家用设备上接近最快的数据通道", "mark": "good" }]],
  "ev": [{ "src": "v1", "t": [866, 1154] }] }
```

```json
{ "id": "setup.mcp", "shape": "procedure", "grounding": "note", "title": "MCP 与数据",
  "groups": [{ "title": "4️⃣ MCP 与数据", "items": [
    { "id": "m1", "text": "安装 TradingView MCP（资源站一键 Prompt 或 GitHub 源）", "ev": [{ "src": "v1", "t": [1414, 1581] }] },
    { "id": "m2", "text": "确认 tradingview 已连接", "cmd": "/mcp", "verify": "能看到 81 个工具" },
    { "id": "m3", "text": "用 --dangerously-skip-permissions 启动", "cmd": "claude --dangerously-skip-permissions", "warn": "省事但有风险：敏感阶段建议保留确认门" }
  ] }] }
```

**AI 工具的断点**

| # | 断点 | 处理 |
| --- | --- | --- |
| A1 | 数字自相矛盾（Kelly $25K 和 $19.2K） | 模板内解决：`claims.check` → conflict 徽标；绝不自动"修正" |
| A2 | 操作结果在外部环境里，应用没法验证（`/mcp` 是否真的看到 81 个工具） | 接受：`verify` 只是提示，由学习者自己确认 |
| A3 | 有风险的命令 | 模板内解决：`warn` 字段，红色标记，复制前提醒一次 |
| A4 | 内容很快过时（工具版本、界面、价格） | 模板内解决：`topic.flags.asof`，超过 6 个月显示"可能已过时" |
| A5 | 大量是现场演示（AI 操控实时图表、首单成交） | 接受：只有 definition + 原片，这是合理的回退，不算失败 |
| A6 | Regime 转移矩阵：笔记里只有"68%"一个数 | structure（cycle）不带权重；68% 作为 facts。不拿缺失的转移概率去凑图 |
| A7 | One-Shot Prompt 这种长文本 | definition.artifact 折叠显示 + 复制；不解析成步骤（笔记里本来就没拆） |

### 4.3 大学课程 · 线性代数（**虚构样例**）

> ⚠️ 以下全部为**虚构的假设样例**，用来检验模板，不对应任何真实课程。时间戳、页码和措辞都是编的。设定：一讲 49 分钟的课堂录像 + 一本教材 PDF，笔记由同一个技能生成，共 34 张概念卡。

```jsonc
"sources": [
  { "id": "L3", "kind": "video", "platform": "local", "ref": "<假设> lecture03.mp4", "title": "（虚构）线性代数 第 3 讲：消元与矩阵", "duration_sec": 2940 },
  { "id": "tb", "kind": "pdf", "ref": "<假设> textbook.pdf", "title": "（虚构）教材 第 2 章" }
]
```

**高斯消元**（主形状 process：能用）

```json
{ "id": "elimination", "label": "高斯消元", "group": "解方程组",
  "one_liner": "用行变换把系数矩阵化成上三角，再回代求解。",
  "blocks": [
    { "id": "elimination.def", "shape": "definition", "grounding": "video", "points": [{ "text": "主元不能为 0；为 0 时先换行", "ev": [{ "src": "L3", "t": [610, 655] }] }] },
    { "id": "elimination.steps", "shape": "process", "mode": "derivation", "role": "example", "grounding": "video", "title": "一个 3×3 例题",
      "steps": [
        { "label": "写出增广矩阵", "math": "\\left[\\begin{smallmatrix}1&2&1&2\\\\3&8&1&12\\\\0&4&1&2\\end{smallmatrix}\\right]" },
        { "label": "R2 − 3·R1", "math": "\\left[\\begin{smallmatrix}1&2&1&2\\\\0&2&-2&6\\\\0&4&1&2\\end{smallmatrix}\\right]" },
        { "label": "R3 − 2·R2", "math": "\\left[\\begin{smallmatrix}1&2&1&2\\\\0&2&-2&6\\\\0&0&5&-10\\end{smallmatrix}\\right]" },
        { "label": "回代", "math": "z=-2,\\; y=1,\\; x=2" }
      ],
      "ev": [{ "src": "L3", "t": [655, 980] }, { "src": "tb", "page": 47 }] }
  ] }
```

**可逆和奇异**（comparison：能用）

```json
{ "id": "invertible.vs", "shape": "comparison", "mode": "matrix", "grounding": "note",
  "items": [{ "label": "可逆" }, { "label": "奇异", "concept": "singular" }],
  "dims": ["行列式", "秩（n×n）", "Ax=b 的解", "零空间"],
  "cells": [[{ "text": "≠ 0" }, { "text": "= 0" }], [{ "text": "n" }, { "text": "< n" }],
            [{ "text": "唯一" }, { "text": "无解或无穷多" }], [{ "text": "只有零向量" }, { "text": "非平凡" }]],
  "ev": [{ "src": "tb", "page": 52 }] }
```

**矩阵 = 线性变换**（**断点**）：真正需要的交互是"拖动矩阵的 4 个元素，看网格怎么变形、基向量去了哪里、面积缩放了多少（行列式）"。这不是 x–y 曲线，现有的 function 域只能退而求其次，画"det 随 a 的变化"，没什么意义。所以只预留**一个**扩展位，在它实现之前，校验器把它当作未知 domain 处理，走回退：

```json
{ "id": "linear_map.plane", "shape": "variation", "domain": "plane", "grounding": "video",
  "inputs": [{ "name": "a", "label": "a", "min": -2, "max": 2, "step": 0.1, "default": 1 }, { "name": "b", "label": "b", "min": -2, "max": 2, "step": 0.1, "default": 0 }],
  "plane": { "matrix": ["a", "b", "c", "d"], "show": ["grid", "basis", "unit_square"] },
  "readouts": [{ "label": "det", "expr": "a*d - b*c" }],
  "states": [{ "when": "abs(a*d - b*c) < 0.01", "text": "面积被压成 0 → 奇异" }],
  "ev": [{ "src": "L3", "t": [1520, 1800] }] }
```

在 `plane` 实现之前，这个概念的回退结果是：definition（math 写出 2×2 矩阵和 det 公式）+ comparison（可逆 / 奇异）+ 原片。仍然可学，只是少了"玩"这一步。

> 如果换成**微观经济学**：供需曲线 = function 域里两条曲线 + `intersect(supply, demand)` 求均衡点 + 滑块平移曲线（比如加税）。模板不用改就能完整覆盖。所以 `intersect` 应该进 DSL。

**大学课程的断点**

| # | 断点 | 处理 |
| --- | --- | --- |
| U1 | 几何 / 平面变换（线性变换、向量、特征向量） | 唯一的扩展位：`variation.domain = "plane"`（P4）；在那之前走回退 |
| U2 | 34 个概念，一张星图太挤 | 模板内解决：超过 24 个就分星座两层（§3.3） |
| U3 | 跨课的前置知识（"会解二元一次方程"、微积分） | 模板内解决：幽灵星（§3.3） |
| U4 | 证明超过 8 步 | 模板内解决：拆成多个 process 块（规则写进 prompt） |
| U5 | 习题需要学习者输入数字答案 | 部分解决：`role: example` 的 process 自动出"下一步填什么"题（数值或矩阵输入，答案取自 steps）；开放题不做 |
| U6 | 来源是 PDF（没有时间戳） | 模板内解决：`ev.page`；"看"这一步改为显示教材页的截图或摘录 |
| U7 | 符号要统一（课程用 A，教材用 M） | 接受：抽取时以笔记为准；prompt 要求不改写符号 |

### 4.4 汇总：断点要不要改模板

| 改进 | 来源 | 纳入 |
| --- | --- | --- |
| `claims.check` 声明值核对 | A1 | ✅ v0.1 必须有 |
| `states.implies` 可验证规则 | F1 / 抵扣价 | ✅ v0.1 必须有 |
| `notables.find` 必须能找到 + 自动换种子 | F1 | ✅ v0.1 |
| `intersect`、`slope_angle`、`band`、`volume` | 微观经济学、F3 | ✅ v0.1 加 `intersect`；其余 v0.2 |
| procedure 的 `warn`、`branch` | A3、决策清单 | ✅ v0.1 |
| `topic.flags.asof`、`disclaimer` | A4、F5 | ✅ v0.1 |
| `ev.page`、PDF 来源 | U6 | v0.2 |
| 星座分层、幽灵星 | U2、U3 | v0.2 |
| `variation.domain = plane` | U1 | v0.3（唯一的扩展位） |
| K 线形态、音频、真实环境验证 | F3、A2 | ❌ 不在范围内，靠回退 |

**设计底线**：遇到新学科时，先看能不能放进 6 个形状和现有的 DSL；放不进就走回退。只有当某类内容**反复**出现、而且回退明显损失学习价值时，才往 DSL 或 domain 里加东西，而且一律加成和学科无关的原语（`intersect` 而不是"供需"，`plane` 而不是"线性代数"）。
