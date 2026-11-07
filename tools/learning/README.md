# tools/learning · 笔记转换与归类底座

把既有 Obsidian 笔记主题目录离线编译为 `learning.learn/0.1` 学习内容
结构、`learning.manifest/0.1` 主题清单和校验报告；并提供 Organizer
（归类提议）接口与评测工具。确定性转换，零 LLM、零第三方依赖
（Python 3.10+ 标准库）；LLM 抽取与归类通过可注入接口预留，没有模型
密钥不阻塞基本转换。

## 安装

无新增依赖。可选安装 `jsonschema` 后用 `--schema-file` 做额外
schema 校验（不装则自动跳过并说明）：

```bash
pip install jsonschema   # 可选
```

可选扩展依赖见 `requirements-optional.txt`（核心不依赖）。

## 运行

```bash
# 合成示例（六类块全覆盖，含各种边界情况）
python tools/learning/notes_compile.py samples/learn/demo-topic \
  --out build/learn --extractor annotated

# 真实笔记（只读；输出目录必须在主题目录之外）
python tools/learning/notes_compile.py "D:/quant/笔记/策略学习/双均线交易系统" \
  --out <仓库外输出目录>
```

输出（写入 `--out`，绝不写回输入笔记，运行前后对输入做快照校验）：

- `<主题ID>.learn.json` — learning.learn/0.1 文档
- `<主题ID>.manifest.json` — learning.manifest/0.1 主题清单（记录层后端扫描用）
- `<主题ID>.report.json` / `<主题ID>.report.md` — 校验报告（结构/语义/出处三层 + 统计 + 修正评估 + 已知限制）
- `learn-ids.json` — 稳定 ID 映射（见下）
- `learn-cache.json` — 增量缓存（依赖文件哈希 + 编译器版本 + 抽取器）

文件名用**稳定主题 ID**（见下），不再跟随目录名变化。
`generated.notes_dir` 只写目录名，不泄露本机绝对路径（旧版本写绝对
路径，0.2.0 起改正）。

参数：`--extractor null|annotated|pkg.module:Attr`、`--now`（固定
generated.at，用于回归）、`--cache-file`、`--report json|md|both`、
`--schema-file schemas/learning/learn.schema.json`（同时会自动寻找
`schemas/record/manifest.schema.json` 校验 manifest，或用
`--manifest-schema-file` 显式指定）、`--ids <旧映射>`、
`--decisions <overrides.jsonl>`。

## 稳定 ID（`learn-ids.json`，learning.learn-ids/0.1）

映射文件只在输出目录维护，绝不写回笔记。规则（优先级从高到低）：

| 对象 | 规则 |
| --- | --- |
| 主题 | 学习主页 frontmatter `topic_id` > 映射文件 > 首次编译目录名 slug，之后固定。改目录名后用 `--ids <旧映射>` 或同一输出目录仍保持原 ID |
| 概念 | frontmatter `id` > 映射里同一路径的 ID > 路径消失且恰好一个新笔记标题或别名集合相同 → 继承（报告 `id_inherited`）> 新 slug。改标题、不改路径时 ID 不变（`id_origin: id-map`）。冲突加后缀并报告 |
| 块 | `<cid>.<shape>.<hash8>`，hash = 内容锚点（块类型 + 规范化标题 / 表头 / 首行文本）；同锚点按出现序加 `.2`、`.3` 后缀。definition（每概念唯一）保持 `<cid>.def`，structure 保持 `<cid>.overview`。表格行、列表步骤重排与无关段落增删不改变 ID |
| 实操清单 | 块 ID 由映射按笔记路径固定（首次 `proc.<标题slug>`） |
| 清单项 | `t<hash8>`，锚点为规范化后的条目文本；重排不变。供 checklist 事件与 `procitem:<topicId>/<procId>/<itemId>` 引用 |

继承冲突（两个新笔记同名）不继承、报告 `concept_id_inherit_conflict`。
frontmatter `topic_id` 覆盖映射里不同的 ID 时报告 `topic_id_changed`。
编译器版本升到 `notes-compiler/0.2.0`，旧缓存自动失效。

## manifest（learning.manifest/0.1）

每次编译输出，字段以 `schemas/record/manifest.schema.json` 为准。要点：

- `folderHint` = 主题目录的上级目录名（如「策略学习」），不含绝对路径；
- `identity.what` 由计数拼成；`about` 取学习主页 abstract 一句话、
  `route` 取学习路线（home-page stages）标题，找不到就是 `null`；
- `groups` 沿用主页「核心概念卡」表（`concept.group`），无分组的概念
  `group` 为 null；`route[]` 是建议路线（stages → 章节 → 概念首次
  出现），**不是前置关系**（第一轮裁决 5）；
- `importanceHint`/`importanceFactors` 只用有依据的信号：frontmatter
  `importance` 标注（1–3）、被 ≥2 个章节笔记引用、出现在主页全景图；
  没有依据就是 `null`，不编分数。已知 schema 缺口见 `HANDOFF.md`；
- `procedures[].items[]` 带稳定 ID 与文本。

## 修正落空报告（`--decisions <overrides.jsonl>`，只读）

对每条指向本主题（`topic:` / `concept:` / `procedure:` / `procitem:` /
`relation:` 且带本主题 ID）的 Override 判断：`applied`（目标存在）、
`orphaned`（目标消失，附最后已知标签）、`inherited`（ID 本轮是继承的）。
其它主题的条目计入 `skippedOtherTopic`。结果写进报告的 `decisions` 段
（json + md）。**不修改 learn.json**——用户修正在读取时由后端叠加
（本轮裁决 3）。最后已知标签先看上一版 learn.json，再看 ID 映射里的
历史条目，保证重复编译结论不变。

## Organizer（learning.organize/0.1）

`organizers.py` 定义 `Organizer` 协议（`name`、`version`、
`organize(request) -> dict`），照搬 `extractors.py` 的注入模式：

- `null` — 不产出任何提议（默认，无密钥不阻塞）；
- `folder` — `folderHint` 与某目标的 `title` 或 `folders` 规范化
  （NFKC、trim、小写）后相同 → confidence 0.9、理由「目录名『X』与
  目标『Y』对应」（X 保留原文）；想法（idea）不处理；被拒绝过的
  (subject, goalId) 组合静默过滤；
- `pkg.module:Attr` — 第三方注入。

`run_organizer()` 统一校验输出（schemas/record 的最小镜像，零依赖）：
非法条目丢弃并写 `warnings`，未知 subject/goal 的 assignment 丢弃，
被拒组合兜底过滤。请求带 `sample: true` 时响应透传该标记。

```bash
python tools/learning/organize.py \
  --request samples/record/organize/request.json \
  --organizer folder --out <响应.json>
```

folder 实现对 `samples/record/organize/request.json` 的输出与
`folder.expected.json` 完全一致（后端 JS 实现测同一文件，
`tests/test_organize.py`）。

## 评测（samples/organize-eval）

评测集全合成（≥3 主题 + 3 目标标注，含双归属主题、未归属主题、一条
想法），格式见 `samples/organize-eval/README.md`。评测任意 Organizer
的响应 JSON：

```bash
python tools/learning/organize.py \
  --request samples/organize-eval/request.json \
  --organizer folder --out "$TMP/resp.json"
python tools/learning/organize_eval.py \
  --eval samples/organize-eval --response "$TMP/resp.json" \
  --out "$TMP/report"     # 产出 report.json + report.md
```

指标：精确匹配准确率、宏查准 / 宏查全、多归属召回、未归属判断
（含错留空）、想法违规、待确认比例（confidence < 阈值，默认 0.85）、
被拒组合违规（若评测目录带 request.json）、`usage`（calls/tokens/
latencyMs，若响应携带）。每更换一次组件或提示词跑一遍并记录
（POSITIONING §4.1）。folder 基线在评测集上的已知结论：精确匹配
0.75，多归属召回 0（目录名只能给出单一目标）。

## LLM 抽取接口

`extractors.py` 定义 `ConceptExtractor` 协议（`name` + `extract(note,
ev_note) -> blocks`）。默认 `null` 不产出；`annotated` 读 frontmatter
`learn_blocks` 标注（这也是将来 LLM 结果的建议落盘形态：随笔记入库、
可审计、可增量）；`pkg.module:Attr` 动态注入自定义实现（例如真实 LLM
客户端，由集成方在自己的环境提供，本仓库不含密钥逻辑）。注入块必须
自带 ev 与 grounding，校验失败会被丢弃并记录，模拟输出以 extractor
名标记，不得冒充真实模型联调。

## 模块

- `mdparse.py` — markdown/YAML 子集/mermaid/时间戳解析（纯函数）
- `topic.py` — 目录扫描、tags 分类、wikilink 按文件名解析
- `ids.py` — 稳定 ID 规则、内容锚点哈希、learn-ids.json 读写
- `blocks.py` — 六类块的确定性构建 + preserved 保留（块带 `_anchor` 锚点）
- `compiler.py` — 来源收集、概念注册、关系、阶段、增量缓存、组装
- `manifest.py` — learning.manifest/0.1 主题清单
- `decisions.py` — 修正落空报告（applied / orphaned / inherited）
- `organizers.py` — Organizer 协议、null/folder、注入加载、输出校验
- `organize.py` — Organizer CLI（请求 → 响应）
- `organize_eval.py` — 归类评测（响应 → 指标 json + md）
- `reporting.py` — 三层校验、数字检查、统计与 Markdown 报告
- `notes_compile.py` — CLI（输入快照保护、输出写出）
- `HANDOFF.md` — 需集成人处理的契约缺口
- `../schemas/learning/learn.schema.json` — JSON Schema（draft-07）
- `../schemas/record/*.schema.json` — manifest / organize 契约（集成人所有）

## 测试

`tests/test_learning_parse.py`、`test_learning_compile.py`、
`test_learning_report.py`、`test_learning_ids.py`、
`test_learning_manifest.py`、`test_learning_decisions.py`、
`test_organize.py`；仓库根目录 `python -m unittest discover -s tests`。
