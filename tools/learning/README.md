# tools/learning · 笔记转换（learning.learn/0.1）

把既有 Obsidian 笔记主题目录离线编译为 `learning.learn/0.1` 学习内容结构
和校验报告。确定性转换，零 LLM、零第三方依赖（Python 3.10+ 标准库）；
LLM 抽取通过可注入接口预留，没有模型密钥不阻塞基本转换。

## 安装

无新增依赖。可选安装 `jsonschema` 后用 `--schema-file` 做额外
schema 校验（不装则自动跳过并说明）：

```bash
pip install jsonschema   # 可选
```

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

- `<主题>.learn.json` — learning.learn/0.1 文档
- `<主题>.report.json` / `<主题>.report.md` — 校验报告（结构/语义/出处三层 + 统计 + 已知限制）
- `learn-cache.json` — 增量缓存（依赖文件哈希 + 编译器版本 + 抽取器）

参数：`--extractor null|annotated|pkg.module:Attr`、`--now`（固定
generated.at，用于回归）、`--cache-file`、`--report json|md|both`、
`--schema-file schemas/learning/learn.schema.json`。

## 映射规则（确定性，无语义猜测）

| 笔记结构 | 产物 |
| --- | --- |
| tags `类型/概念卡`（缺 tag 时按 `02-概念卡/` 目录降级） | concepts[]，frontmatter `id` 优先，否则标题 slug |
| `> [!abstract] 一句话定义`（缺失则回退正文首段并告警） | `one_liner` + `key`（`==高亮==`） |
| 📌/是什么/角色 小节顶层要点（含嵌套原文） | definition.points（≤6，超额保原文） |
| `$$…$$` / 第一个普通代码围栏 | definition.math / artifact |
| 表格（优点/局限两列 → pros_cons；其余首列=对象） | comparison 块 + contrast 关系候选 |
| 有序列表 / ①②③ 行（含围栏）≥2 步 | process 块 |
| 学习主页 mermaid 全景图 | structure 块（锚=映射节点中度数最大者）+ uses 关系 |
| tags `类型/实操` 的任务清单（`（验证：…）`→verify，`` `cmd` ``→cmd，warning callout→warnings） | 主题级 procedures[]（航线终点，不硬挂概念） |
| concept 卡 frontmatter `learn_blocks`（JSON） | 标注注入块（含 variation），逐块校验，失败丢弃并记录 |
| 未覆盖小节 / 💭 我的思考之外的一切 | `preserved[]` 按原文保留（我的思考留给用户，仅计数） |
| `[m:ss](…t=Ns…)` 链接 | ev `{src, t}`；只认链接明确给出的时间，无则不记 |

关系只有 related（概念卡 wikilink）/ uses（全景图）/ contrast（对比块）；
**不生成 prereq**（出现顺序只进 stages 建议路线）。同名/别名冲突只记录
候选，不合并。`Templates/` 目录跳过。

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
- `blocks.py` — 六类块的确定性构建 + preserved 保留
- `compiler.py` — 来源收集、概念注册、关系、阶段、增量缓存、组装
- `reporting.py` — 三层校验、数字检查、统计与 Markdown 报告
- `notes_compile.py` — CLI（输入快照保护、输出写出）
- `../schemas/learning/learn.schema.json` — JSON Schema（draft-07）

## 测试

`tests/test_learning_parse.py`、`tests/test_learning_compile.py`、
`tests/test_learning_report.py`；仓库根目录 `python -m unittest discover -s tests`。
