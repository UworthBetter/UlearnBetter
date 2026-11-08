# 笔记 → 强交互可视化学习 · 规划

> 范围：只做规划，不改代码、不提交。
> 依据：`tools/video_ingest.py`、`samples/ingest/_test_yt_cs.json`、`concept-graph/src/star-dive/**`、原型 `/workspace/star-dive-proto/MODULES.md`、`_notes_input/skill.zip`（youtube-obsidian-notes：SKILL.md、templates.md、check_wikilinks.py）、`_notes_input/notes/`（3 个主题，共 36 张概念卡：5 + 12 + 19）、`docs/学习Agent产品蓝图 v1.1.md`。
> 日期：2026-11-07（v2 同日修订：应用内生成 + 通用模板，见 [GENERIC_TEMPLATE.md](GENERIC_TEMPLATE.md)）

---

## 0. 结论先行

> **v2 修订（2026-11-07）**：产品负责人澄清了两件事：应用里配置好 LLM API，**自己生成笔记**（工作流和 youtube-obsidian-notes 技能相同）；然后用**一个通用模板**覆盖所有笔记。因此本版删掉了"Windows 笔记库同步"和"试点卡片人工手写"两个待决问题，所有卡片都由生成得到。通用模板的完整设计见 **[GENERIC_TEMPLATE.md](GENERIC_TEMPLATE.md)**；本文的 §0、§1.3、§2.2–2.3、§3.3–3.4、§4.4、§5、§6 已经按它改写；其余分析部分保留原样。

1. **现在是两条不相连的流水线。** A 线：`video_ingest.py` → ingest JSON → （LLM 直接读字幕）→ star-dive `data.json`，原型就是这么做的。B 线：笔记技能自己抓 oEmbed 和第三方字幕 → Obsidian 笔记。技能没有调用 `video_ingest.py`，笔记也没有流到星图。
2. **应用内一条流水线**：ingest → 用配置的 LLM 生成笔记（技能）→ **按概念把笔记抽取成 learn.json** → 确定性校验和组装 → 星图。星图从笔记派生，不再直接从字幕生成。
3. **一个通用模板**：6 个形状（定义、结构、流程、对比、变化、操作）× 6 个渲染器，形状挂在"块"上，不挂在整个概念上。另外三层通用能力：证据（ev + 原片）、自测（由块确定性派生）、主题层（关系、航线、布局都由程序计算）。渲染器**不按学科分支**。
4. **"不失真"靠机器校验，不靠信任 LLM**：引文要能和字幕匹配；数字必须出自证据；规则 `implies` 在数据上必须恒成立；具体数字用 `claims` 核算，对不上就标冲突，绝不修改。任何内容都能通过逐级降级渲染出来。
5. **试点仍是双均线交易系统**，但验证的对象变了：要证明**同一套生成流水线**，不加人工，就能为它产出合格的星图；然后不改模板，直接推广到 AI 量化，最后用虚构的大学课程样例做压力测试。

---

## 1. 现有视频解析工具如何接上笔记技能

### 1.1 仓库里实际有什么

**`tools/video_ingest.py`**（解析层，确定性，不调用 LLM）

```
URL ─► yt-dlp -J（元数据 + 官方章节；没有章节时从简介里解析，origin=description）
    ─► 选字幕轨：手动字幕 > 自动字幕 > 原语言兜底（被限流时降级用 android 客户端）> --asr faster-whisper
    ─► 统一格式：vtt / srt / json3 / B站 JSON → segments[{start,end,text}]（滚动字幕增量去重）
    ─► 章节互证：章节标题 4-gram 和对应时间窗的字幕比对 → quality_flags.trusted
    ─► 输出 ingest/<platform>_<id>.json（schema: learning.vault.ingest/0.1）
```

- 支持的平台：youtube、bilibili、douyin、tiktok、vimeo、twitter/x。
- 契约样例 `samples/ingest/_test_yt_cs.json` 和原型的 `source.json` 键完全一致，是同一个 Fireship 视频。也就是说 **star-dive 原型吃的就是 ingest JSON**，LLM 直接从字幕里抽出了 15 个概念。

**`youtube-obsidian-notes` 技能**（只在 `_notes_input/skill.zip` 里，仓库中还没有）

- 第 1 步，元数据：用 webReader 抓 YouTube **oEmbed**，以为能拿到时长、description 和官方 CHAPTERS。
  ⚠️ oEmbed 的标准返回只有 title、author_name、thumbnail、html 这几项，**没有 description、章节和时长**。这一步其实靠不住，实际起作用的是后面的兜底抓取。
- 第 2 步，字幕：先抓 watch 页，再找第三方字幕站，然后由 LLM 人工比对"至少三处对得上"。
- 第 3–5 步：建库（README、学习主页、01 课程笔记、02 概念卡、03 实操清单、90 资源、Templates），最后跑 `check_wikilinks.py` 要求断链为 0。
- 实际笔记里的痕迹：双均线笔记的 README 写着"oEmbed + **yt-dlp** 抓取官方繁体自动字幕"。笔记是 10-30、10-31 写的，`video_ingest.py` 是 11-06 才有，当时 yt-dlp 是临时手动调用的。

### 1.2 两边的差异

| 环节 | 技能现状 | 解析层已有能力 | 差距 |
| --- | --- | --- | --- |
| 元数据和章节 | oEmbed（字段不全） | yt-dlp 官方章节，没有时从简介回退 | 技能应改用 ingest |
| 字幕来源 | watch 页 / 第三方站，"错课"风险靠人眼防 | 按同一个视频 id 选轨，不会拿到别的视频的字幕 | 技能规则 2–4 大多会自然消失 |
| 真伪校验 | LLM 人工找三处印证 | `quality_flags.trusted` + `chapters_matched` | 保留 LLM 抽查，但以 flags 作为门槛 |
| 平台 | 只支持 YouTube（时间戳格式写死） | 6 个平台 | 时间戳链接需要按平台生成 |
| 数据来源声明 | 手写 | `generated_at`、`transcript.source/lang`、`tool` | README 可以自动填 |
| 留存 | 字幕不进 vault | `ingest/` 被 gitignore | 编译星图时需要字幕来核对引文 → 应存进 vault |

### 1.3 打通后的流水线（应用内，目标）

```
① tools/video_ingest.py URL                       L0 确定性
      └─► <笔记库>/<分类>/<主题>/90-资源/<主题> · ingest.json
② 笔记生成（技能工作流，调用配置的 LLM API）            L2
      · 第 1–2 步改为读 ingest.json；trusted=false 时停下来问用户 / 走 --asr
      · 第 3–5 步照旧；另加：概念卡 frontmatter 带 id，一句话定义里必须有 ==key==
      · check_wikilinks 必须为 0
③ 结构化抽取：每张概念卡调用一次 LLM → blocks          L2，可并行，按 note_hash 增量
   主题层调用一次 LLM → relations 的类型、stages 名称
④ 校验和组装（确定性，零 LLM）                         L0
      · 四层校验：结构 / 语义 / 出处（quote 匹配、数字检查、implies、claims）/ 可渲染
      · 失败的块把错误反馈给 LLM 重试 ≤2 次 → 仍失败就降级
      · 计算 importance、主形状、航线、布局种子
      └─► 90-资源/<主题> · learn.json
⑤ 星图前端只读 learn.json
```

要点：

- **LLM 只在 ② 和 ③ 出现，且都被 ④ 把关。** ④ 是确定性的，同样的输入一定得到同样的结果，它是"不失真"的保证。
- **API key 不能放进浏览器。** concept-graph 是静态 Vite 应用，所以 ①–④ 放在一个本地服务里（Python，和 `video_ingest.py` 同一个仓库，只监听 localhost），前端只负责发起任务、读结果。
- ingest.json 存进笔记库，是为了让 ④ 能用字幕核对每条引文。这样就把技能里"不虚构"的规则变成了机器检查。

---

## 2. 笔记结构 → 星图和卡片

### 2.1 笔记里有哪些结构（实测）

- 页面类型用 **tag 判断最稳**：`类型/概念卡`、`类型/课程笔记`、`类型/实操`、`类型/资源`、`MOC`。文件名不可靠：模板里写的是 `00-Home.md`，实际文件叫 `<主题> · 学习主页.md`。
- 36 张概念卡全部有 `> [!abstract] 一句话定义`，结构很规整。
- 时间戳链接 124 处，有两种格式：`watch?v=ID&t=Ns`（122 处）和 `youtu.be/ID?si=…&t=N`（2 处）。
- **一个主题会引用多个视频**：趋势交易笔记引用了 LEI 系列的 7 个以上其他视频（比如抵扣价专集 `K2OiWFYyP7Y`）→ 数据必须支持多来源。
- 内容元素：callout（quote / lesson / warning / important）、`==高亮==`、表格（公式表、对比表、优劣表、六段回测成绩表）、LaTeX（3 个文件里有，比如 Kelly）、代码块（18 个文件里有，命令 / 推导示例）、`- [ ]` 清单。
- **跨主题撞名**：双均线的 `抵扣价` 有别名 `抵扣价原理`，趋势交易的 `抵扣价原理` 有别名 `抵扣价`；另有 `双均线系统` 和 `双均线系统（MA+EMA）`。放在同一个 vault 里 wikilink 会有歧义，全局星图也需要做"同一概念"合并。

### 2.2 映射规则（作为抽取提示，形状以 GENERIC_TEMPLATE.md 为准）

| 笔记元素 | 星图元素 | 规则 |
| --- | --- | --- |
| 主题（一个主题文件夹） | 一张星图 | `topic.id` = 文件夹名 |
| `02-概念卡/*.md` | **星** | label = 标题；aliases 照搬；`one_liner` = 一句话定义；`key` = 其中 `==高亮==` 的那段；`note` = 相对路径 |
| 概念卡之间的 wikilink | `related` 关系（基线） | 更具体的类型（prereq / part_of / contrast / uses）由块和主题层推出（GENERIC_TEMPLATE §3.2） |
| 学习主页的 mermaid 全景图 | `uses` / `part_of` 关系 | 节点对应到概念 id |
| `01-课程笔记/chNN` | 时间轴分段 + 航线的阶段 + 抽取素材 | 章节不做成星 |
| 学习主页「📚 学习路线」 | `stages` | 没有主页时按章节自动分组 |
| 学习主页「🧩 核心概念卡」分类 | 概念的 `group`（星座） | |
| 时间戳链接 / `> [!quote] [m:ss]` | 块和要点的 `ev` | 原片片段从 ev 自动汇总，不再是一种卡片 |
| 一句话定义、📌 是什么 | 核心 `definition` 块 | 每个概念必有，也是兜底 |
| 「⚖️ 优点与局限」等表格 | `comparison` | 优劣表用 `mode: pros_cons` |
| 有序列表、推导、①②③ | `process` | 推导用 `mode: derivation` |
| 架构、组成、状态机 | `structure` | |
| 可调参的公式、指标序列 | `variation` | 只有能写成白名单 DSL 时才生成 |
| `03-实操清单` | `procedure` | 挂到链接最多的概念上，或作为航线终点 |
| 自测 | 由块确定性派生 | 不再由 LLM 单独写 |

### 2.3 要不要从笔记生成图谱：要

- **真伪**：笔记经过技能的校验流程，直接读字幕等于跳过了这一关（原型就是这样）。
- **同一事实源**：markdown 是事实源，learn.json 是它的派生物；用户改笔记，只重新抽取变了的概念。
- **关系现成**：wikilink 和 mermaid 是作者整理过的关系，比 LLM 从字幕里猜的更可信。
- **出处可查**：每个块都必须指回笔记的某一节或字幕的某个时间窗，校验器逐条核对。
- 代价：笔记会丢一些细节（片段的精确结束时间、原话），由 ingest.json 补齐和校验。

---

## 3. 通用模块系统评审

### 3.1 现有设计的歧义

| # | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| 1 | 只有单个 `meta.video_id`；`ytUrl` 和 `video_clip` 的 embed 写死 YouTube | `types.ts` StarDiveMeta、`builtins.ts` video_clip | 改成 `sources[]`，卡片用 `refs[{src,t}]` 指向来源；B站 embed 用 `player.bilibili.com?bvid&t=`（不支持 end，要靠前端计时停止） |
| 2 | `timestamps` 和 `source_timestamps` 两个字段并存 | `registry.ts` cardTs | 统一成 `refs`，加载器兼容旧字段 |
| 3 | `supplementary` 只在 param_demo 里有，而且只有"是 / 否"两档 | paramDemo | 所有卡统一加 `grounding`，分四档（§3.4）。比如 series_lab "规则出自视频、数据是示意"，两档放不下 |
| 4 | `formula` 一个字段三种含义（kind 名 / DSL 表达式 / 数组），另外还有一个 `kind` | paramDemo `compileParamDemo` | `kind` 改为必填，`formula` 只表示表达式 |
| 5 | `shape` 只决定颜色，`appliesTo` 只是建议；`timeline` 和 `example` 没有清晰定义 | registry、util SHAPES | 写清 6 个 shape 的含义（只影响颜色、图例和默认卡序），`appliesTo` 只给生成方参考 |
| 6 | 卡片没有 `id`，进度、回忆、增补都没法定位到卡 | 全局 | 卡片 `id` 必填（`<concept>/<type>-<n>`） |
| 7 | 文本只能是纯文本（esc），笔记里大量 `==高亮==`、`**粗体**`、`$公式$`、代码 | definition / steps | 加精简 markdown 子集，按白名单安全渲染（§3.4） |
| 8 | `interactive` 的 4 个 widget（radix / endian / stack_queue / recursion）全是 CS 专用、手写的，其实是"按主题开后门" | `widgets.ts` | **冻结**，只为 CS 演示数据保留，新内容一律用通用模板 |
| 9 | 没有学习顺序；时间轴上的点取各卡最小时间戳 | scene.ts `renderHUD` | 加 `path[]`；多来源时时间轴按 source 分轨，或只显示当前星所在的视频 |
| 10 | 环绕卡的数量没有上限（原型约定 2–4 张，代码没限制） | scene.ts `orbitBase` | 上限 4 张；多出来的进主卡的"更多"里，或者由编译器排优先级 |
| 11 | 数据是构建时静态 import 的，只能有一个主题 | `StarDive.tsx` | 改成 `#/star-dive/<topic>/<concept>`，运行时 fetch `topics/<topic>.json` |
| 12 | video_clip 里的 `url` 字段被忽略；`end` 超过 60s 被悄悄截断 | builtins video_clip | 删掉 `url`；截断时在 schema 里给 warn |

### 3.2 按领域看缺口

> v2 注：下面的需求已经并入 GENERIC_TEMPLATE.md：series_lab → variation 的 series 域，checklist → procedure，recall → 自测层；grounding 由四档改为五档（加了 `derived`）。

**金融（时间序列 / 价格叠加）是这次试点的主要缺口**

- 现在的 `param_demo` 画的是"x 的函数"，没有"价格序列 + 指标 + 时间光标"这种东西，而 DSL 里也没有窗口函数。均线、抵扣价、EMA 拐头、交叉、多头排列、关键性波动这些，本质上都是对**一条价格序列**的观察。
- 需要新模块 **`series_lab`**：
  - 价格序列：用种子生成的合成数据，按场景生成；或者内嵌真实快照。
  - 白名单指标：`sma`、`ema`（以后再加 `wma`、`boll`、`vol`）。
  - 可拖动的日期光标；周期参数用滑块，或者 20/60/120 预设按钮。
  - 自动标注：**抵扣价那根 K 线**、窗口阴影、线的斜率箭头。
  - 事件识别：白名单规则，比如 `close_cross_up:ema`、`turn_up:ma`、`both_up`、`diverge`，在图上标成 ①②③。
  - explain：用一组**封闭的谓词**（`close>deduct`、`ema_up`、`ma_up`、`both_up`、`diverge`…）匹配说明文字。不把 DSL 扩成"任意逻辑"。
- 数据来源分两档：
  - `synthetic`：场景库 `range`（横向密集）、`steady_up`（稳定上涨）、`accel_up`（加速）、`bottom_reversal`（底部转折）、`top_reversal`（顶部转折）。和趋势交易笔记的五类趋势对得上，LEI 两套笔记可以复用。编译时**断言场景里确实出现了声明的事件**（比如 EMA 先于 MA 拐头），不满足就换种子。
  - `inline`：Agent 在编译时用工具拉真实行情，标上 ticker 和 asof 日期，内嵌进 JSON。**前端运行时不联网**。
- 还需要的：状态单元格（六段回测 ✅⚠️❌）→ 由 compare_table 扩展；Kelly → `param_demo` 现在就能做（`f=(b*p-(1-p))/b`）；所有金融主题统一显示免责条（"非投资建议"，`topic.disclaimer`）。

**大学课程**

- 数学：KaTeX 渲染（行内 `$…$` 和块级）；`steps` 每步加 `math`，并支持"约去项"高亮（抵扣价推导、代数和微积分推导都用得上）。
- 规模：一门课 1–2 小时、30 个以上概念 → 星图要按星座（章节或分类）聚类布局，总览只显示星座名，点进去再展开。
- 来源不只是视频：PDF / 课件页码 → `sources[].kind = "pdf"`，`refs[{src,page}]`。蓝图 §4.3 已经把它列为同一条流水线的扩展输入源。
- 练习：例题和答案揭晓 → 放进 `recall`（加 `kind: worked`），不另开模块。

**AI 前沿工具**

- 命令和配置：代码块带复制按钮；checklist 每项可以带 `cmd` 和 `verify`（比如 `/mcp` → 应该看到 81 个工具）。
- 时效：工具类内容过期很快 → `topic.asof`，卡片上显示"截至 2026-10 的版本"；超过 N 个月提示"可能已过时"。
- 架构流程（Trade Intent → 风控引擎 → 券商）→ `steps` 已经够用（加 `layout: "flow"` 横向箭头即可），不新增模块。

### 3.3 通用模板（v2：替代原来的"8 个模块"方案）

完整设计见 [GENERIC_TEMPLATE.md](GENERIC_TEMPLATE.md)，这里只列出对现有代码的影响：

| 现有模块 | 去向 |
| --- | --- |
| `definition` | → definition 渲染器（加 math、artifact、facts、挖空） |
| `steps` | → process 渲染器（加 mode、math、约去项动画） |
| `compare_table` | → comparison 渲染器（加状态标记、rules、pros_cons） |
| `param_demo` + DSL | → variation 渲染器的 function 域；DSL 扩展出 series 域的运算、谓词和 `intersect` |
| `video_clip` | → 不再是卡片类型，变成"证据"层：每个块的 ▶，加一张汇总的原片环绕卡 |
| `interactive` | 冻结，只为 CS 演示数据保留 |
| 新增 | structure 渲染器、procedure 渲染器、自测引擎（由块派生） |

原来设计的 `series_lab`、`checklist`、`recall` 三个新模块并入：series_lab → variation（series 域），checklist → procedure，recall → 自测层。

### 3.4 数据格式

用 `learning.learn/0.1`（GENERIC_TEMPLATE §2）取代原来规划的 stardive 0.2。加载器把旧的 `data.json`（0.1）规范化成新格式：`cards` → `blocks`，`video_clip` → `ev`，`param_demo` → `variation`，`interactive` → 原样保留。CS 演示数据作为回归样例。

---

## 4. 交互和沉浸式学习流程

### 4.1 极简原则（硬约束）

- 屏幕上只有：星空、星、四角各最多一个 HUD（品牌、图例、时间轴、单入口）。没有侧栏，没有聊天记录，没有设置页。
- 一颗星最多 4 张环绕卡；卡面最多两行字；其余内容一律进展开面板。
- 一次只做一件事：展开面板时星图退后（现有的 receded），星图上只高亮"下一步"。

### 4.2 单入口：Agent 指令条

原型 TASK 明确要求"No chat box"。这里的做法是**一行指令条**，不是聊天：

- 平时隐藏，只在底部中央显示一个细光标；按 `/` 或点击时展开。输入一行，回车后指令条收起。
- Agent 的回应**变成星图上的动作**，不变成对话气泡；只有一行几秒后自动消失的提示（toast）。

| 输入 | 动作 |
| --- | --- |
| 粘贴视频链接 | 启动 §1.3 流水线；星图上出现"星云凝聚"进度（解析 → 校验 → 笔记 → 编译），完成后新星域点亮 |
| 概念名、别名（"抵扣价"） | 飞到那颗星（本地完成，零延迟，L0） |
| "考我" / "复习" | 进入回忆模式：依次飞到到期的星，打开 recall |
| "下一步" | 沿航线去下一颗星 / 下一张推荐卡 |
| "这段没看懂"（在片段或卡片里） | L1/L2：Agent 生成一张 `grounding: note` 或 `supplementary` 的补充卡，挂到当前星上 |
| 其他问题 | L1 单次回答，以一张临时卡出现在当前星旁；用户可以"留下"（写回概念卡，然后重新抽取） |

分层和蓝图 §3.2 一致：导航和搜索在本地做（L0），解释和问答用单次 LLM（L1），重新建库走完整 Agent（L2）。

### 4.3 一个主题的学习流程

1. **抵达**：总览星图，航线（`path`）用一条淡金色细线把各阶段的星串起来。没学的星暗，当前推荐的星有呼吸光。时间轴显示章节。
2. **潜入**：点星（或说"下一步"），主卡显示一句话定义。环绕卡**固定按「看 → 懂 → 玩 → 练」排序**：原片（由 ev 汇总）→ definition / structure / process / comparison → variation → procedure / 自测。下一张推荐卡发光。
3. **看**：片段在卡内播放，只播那一段；"连播本星片段"把这颗星的所有 refs 串成一段混剪。
4. **玩**：variation 块是这颗星的"啊哈"时刻。说明文字跟着光标实时变化，▶ 时间戳能跳回原片印证。
5. **离开时一题**：关闭星时弹出一道 recall（可以跳过），答对星就更亮。亮度 = 掌握度，P3 接 FSRS 后变成真实的稳定度。
6. **航线推进**：自动给出下一颗星的箭头；一个阶段完成时，航线那一段点亮。
7. **收束**：主题最后一颗星接实操清单（练），再加一个"写一句我的思考"。写回笔记的「💭 我的思考」必须**经 Agent 并让用户确认**，追加，不覆盖。

键盘：`←/→` 沿航线移动，`空格` 播放 / 暂停，`Esc` 返回，`/` 打开指令条。

### 4.4 状态写在哪

- 笔记库由应用管理（路径可配置），仍然是 Obsidian 兼容的 markdown，用户也可以用 Obsidian 打开。
- P1：勾选和掌握度存 localStorage，明确标注"只存在本机"。
- P3：按蓝图的"文件即 API"，掌握度和 FSRS 写进概念卡 frontmatter，清单状态写进清单笔记的 `- [x]`，由本地服务写入，前端不直接写文件。
- 用户在指令条里"留下"的 Agent 补充内容，**写回概念卡**（追加一节"补充"，用户确认），然后重新抽取。learn.json 不接受直接修改。

---

## 5. 分阶段实施计划（v2）

### P0 · 格式和渲染器地基（约 2 天）

- 定 `learning.learn/0.1` 的 JSON Schema；写旧 `data.json` → 新格式的规范化加载器，CS 演示数据作为回归样例。
- 把现有模块按 §3.3 重组成 6 个形状渲染器 + 证据层；新写 structure 和 procedure；加 KaTeX。
- 校验器（Node，零依赖）：结构 + 语义两层；把 registry 的 schema 和 DOM 拆开。
- 路由改成 `#/star-dive/<topic>/<concept>`，运行时 fetch。
- 验收：CS 演示和现有截图一致；手写的 6 个形状测试样例（只用于测试，不是产品内容）都能渲染，不合格的样例能正确降级。

### P1 · 生成流水线 + 双均线试点（约 4–5 天）

- **本地服务**（Python，只监听 localhost）：读取 LLM 配置（key 只在服务端）；串起 ① ingest → ② 笔记 → ③ 抽取 → ④ 校验组装（§1.3）。
- 技能改版：读 ingest.json；概念卡带 id 和 `==key==`；新增 4.5 结构化抽取；校验报告。
- 抽取 prompt v0.1（GENERIC_TEMPLATE §2.7），按 JSON Schema 结构化输出；失败把错误反馈回去重试 ≤2 次。
- 校验器补上出处层：quote 匹配（统一繁简和中文数字）、数字检查、`implies`、`notables.find` 加自动换种子、`claims.check`。
- variation 的 series 域：数据生成器（7 种信号形态）+ sma / ema / shift / slope / cross / turn。
- 试点：在应用里输入 `https://www.youtube.com/watch?v=Pe04VShLE1g`，**全程不人工干预**，生成双均线主题。

**试点验收**

- 5 颗星全部生成；每颗星除了核心 definition 外 ≥1 个块；降级块 ≤10%，每次降级都有日志说明原因。
- 抵扣价、EMA、双均线系统三颗星都生成了合格的 variation，并且 `implies` 全部通过（GENERIC_TEMPLATE §4.1 的样例作为对照基准，**不作为输入**）。
- 所有 quote 都能匹配字幕；所有数字都出自证据。
- 同样的笔记连续生成两次，结构差异只出现在措辞上（形状选择一致率 ≥80%）。
- 1440×900 和手机宽度截图没有重叠；控制台无报错。
- 成本记录：调用次数、token 数、耗时（作为后续预算的依据）。

### P2 · 不改模板，推广到别的主题（约 3 天）

- **AI量化交易系统**（19 张概念卡，1:20:04 视频）：检验 structure、procedure（cmd / warn）、`claims` 冲突（Kelly 必须被标出 conflict）、`asof`。
- **趋势交易全攻略**：检验多视频 sources（LEI 系列的外链）、`band` / `slope_angle` / `volume`（GENERIC_TEMPLATE §4.4 v0.2）。
- 规则：推广过程中**不许为主题加渲染器**；遇到放不进的内容，记进"断点登记表"，按 GENERIC_TEMPLATE §4.4 的原则决定扩展原语还是接受回退。
- 用一套虚构的大学课程笔记（线性代数或微观经济学）跑一遍，验证分星座布局、幽灵星、PDF 页码证据。

### P3 · 单入口和复习闭环（约 4–5 天）

- 指令条（§4.2）：本地意图 + 通过本地服务触发 L1 / L2。
- 自测 → FSRS（py-fsrs），状态写进概念卡 frontmatter；星的亮度 = 稳定度。
- 全局星图：按 aliases 合并跨主题的同一概念（抵扣价 ⟷ 抵扣价原理），显示主题之间的"虫洞"连线。

### P4 · 扩展位（按需）

- `variation.domain = "plane"`（几何 / 线性变换）——唯一预留的渲染扩展。
- 关键帧、PDF 截图摘录；第三方模块沙箱（MODULES.md §9）。

---

## 6. 关键问题与对策

1. **抽取质量不稳定**：同一份笔记，不同次生成可能选出不同的形状。对策：判别规则写死在 prompt 里；校验器把关；P1 验收设一致率指标。
2. **成本和延迟**：一个 80 分钟的视频大约 30–40 次抽取调用。对策：按概念并行，按 note_hash 增量；P1 实测后再定预算上限。
3. **API key 安全**：key 只放在本地服务，绝不进前端打包、localStorage 或日志。
4. **"可验证"有边界**：`implies` 和 `claims` 只能检查能计算的内容，叙述性的错误仍然要靠笔记阶段的真伪校验和"抽查数字最密集章节"的建议。
5. **示意数据被当成真实行情**：`illustrative` 徽标常驻，加上主题免责条。
6. **跨主题撞名**（抵扣价 / 抵扣价原理）：笔记生成时检查 aliases 是否和别的主题冲突并提示；全局图谱阶段再做合并。
