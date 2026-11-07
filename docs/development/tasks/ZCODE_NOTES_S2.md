# Zcode：稳定 ID、manifest、修正落空报告与归类评测

工作目录 `D:/haikesong2-worktrees/zcode-notes`。等集成人宣布 C0 提交号后，
在本目录从该提交新建分支 `codex/s2-notes`（不要在其他工具的目录切分支）。

文件范围：`tools/learning/**`、`schemas/learning/**`、`samples/learn/**`、
`samples/organize-eval/**`、`tests/test_learning*.py`、`tests/test_organize*.py`。

## 先读

1. 根 `AGENTS.md`
2. `docs/development/SPRINT_02.md`：本轮裁决 3、7，「契约草案」中的
   `SubjectRef`、Override、manifest、Organizer 契约
3. `docs/development/CONTRACTS.md` v0.2（C0 落地版）
4. `schemas/record/manifest.schema.json`、`organize-request.schema.json`、
   `organize-response.schema.json`、`override.schema.json`；
   `samples/record/organize/{request,folder.expected}.json`
5. `docs/reference/POSITIONING_v2.md` §2.2（ID 不稳定的四处）、§3.3、§4.3、§4.1 评测要求
6. 现有编译器：`tools/learning/{compiler,topic,blocks,extractors,notes_compile,reporting}.py`、
   `tools/learning/README.md`、`schemas/learning/learn.schema.json`、`tests/test_learning*.py`

## 范围

### 1. 稳定 ID（第一优先级）

现状（POSITIONING §2.2）：主题 ID = 目录名（`topic.py` `scan_topic`）；
概念 ID 无 frontmatter `id` 时 = 标题 slug（`compiler.py` `_concept_registry`）；
块 ID 用序号（`<cid>.cmp<i>`、`<cid>.proc<i>`）；实操清单项没有 ID。

目标规则：

- **ID 映射文件** `<out>/learn-ids.json`（只在输出目录，绝不写回笔记）：
  记录 `topicId`、`note 相对路径 → conceptId`、标题历史、块锚点 → 块 ID。
- **主题**：学习主页 frontmatter `topic_id` > 映射文件 > 首次编译时目录名 slug，
  之后固定。改目录名后用 `--ids <旧映射>` 或同一输出目录仍保持原 ID。
- **概念**：frontmatter `id` > 映射里同一路径的 ID > 路径消失且恰好一个新
  笔记标题或别名集合相同时继承（报告 `id_inherited`）> 新 slug。
  改标题、不改路径时 ID 不变。冲突时加后缀并报告，不静默覆盖。
- **块**：基于内容锚点（块类型 + 规范化后的标题 / 表头 / 首行文本）哈希，
  形如 `<cid>.<shape>.<hash8>`；同锚点重复时按出现序加后缀。
  表格或列表重排、无关段落增删时 ID 不变。
- **实操清单项**：`procitem` ID 同样基于规范化文本锚点，
  供 checklist 事件和 `procitem:<topicId>/<procId>/<itemId>` 引用。
- `id_origin` 扩展取值（如 `id-map`、`inherited`）；schema 只追加可选字段，
  `learning.learn/0.1` 现有读取方（`concept-graph/src/star-dive/learn-adapter.ts`）不能被破坏。
  如必须破坏性变更，写 HANDOFF，本轮不做。
- 编译器版本号升级（`COMPILER_VERSION`），缓存按版本失效的现有逻辑保留。

### 2. `manifest.json`（`learning.manifest/0.1`）

与 `learn.json` 同目录输出，字段以 `schemas/record/manifest.schema.json` 为准：

- `folderHint`：主题目录的上级目录名（例如 `策略学习`），不输出绝对路径；
  顺带检查 `learn.json` 的 `generated.notes_dir` 不泄露本机绝对路径，
  有就改成目录名并在 README 写明。
- `identity`：`what` 由计数拼成（「课程笔记：N 章、M 张概念卡、K 份实操清单」）；
  `about` 取学习主页的一句话总结、`route` 取学习路线 / stages 标题，
  找不到就是 `null`，不生成。
- `groups`：沿用现有 `_groups_from_home`（`concept.group`），没有分组的概念
  归入 `null` 组；`route`：建议路线顺序（stages → 章节 → 首次出现），
  这是建议路线，不是前置关系（第一轮裁决 5）。
- `importanceHint` + `importanceFactors`：只用笔记里有依据的信号
  （例如主页明确标注、被多少章节引用），没有依据就 `null`，不编分数。
- `procedures[].items[]` 带稳定 ID 和文本。
- 每次编译都输出 manifest；`--schema-file` 同时支持校验 manifest。

### 3. 修正落空报告

`notes_compile.py` 新增 `--decisions <overrides.jsonl>`（只读）：
对每条指向本主题 `topic:`/`concept:`/`procedure:`/`procitem:`/`relation:` 的 Override
判断目标是否仍存在，在 json / md 报告里列出 `applied`（目标存在）、
`orphaned`（目标消失，附最后已知标签）、`inherited`（ID 被继承）。
**不修改 learn.json 内容**——叠加由后端完成（本轮裁决 3）。

### 4. Organizer（Python 侧）

- `tools/learning/organizers.py`：`Organizer` 协议（`name`、`version`、
  `organize(request: dict) -> dict`，输入输出为 `learning.organize/0.1`），
  内置 `null`、`folder`，`load_organizer("pkg.module:Attr")` 注入第三方实现，
  照搬 `extractors.py` 的模式。输出按 schema 校验，非法条目丢弃并写 `warnings`。
- `folder` 规则见契约；对 `samples/record/organize/request.json` 的输出必须
  等于 `folder.expected.json`（后端 JS 实现测同一文件）。
- 已被拒绝的 (subject, goalId) 组合必须过滤。
- `tools/learning/organize.py` CLI：`--request <json> --organizer null|folder|pkg.module:Attr --out <json>`。
- 同名候选辅助（可选）：如引入 RapidFuzz 等现成库，只能是可选依赖，
  放在 `tools/learning/requirements-optional.txt`，核心保持零第三方依赖。

### 5. 评测集与评测工具

- `samples/organize-eval/`：至少 3 个**合成**主题 + 2–3 个目标的标注
  （含一个应同时属于两个目标的主题、一个应进「未归属」的主题、一条想法），
  只放标注和合成摘要。格式写进该目录 README。
- `tools/learning/organize_eval.py`：输入评测集 + 任意 Organizer 的响应 JSON，
  输出准确率、多归属召回、未归属判断、待确认比例、以及（若响应里有）
  调用次数、token、耗时；json + md 两种报告。
- 负责人的三份真实主题（`D:/quant/笔记`）只读试跑：编译 + `folder` 评测，
  标注和产物存在仓库外（系统临时目录或负责人指定的私有目录），
  交付报告里只写统计和指标，不提交真实笔记内容、标注或产物。
  `llm` 实现在后端，由集成人联调时用你的评测工具打分。

## 测试

- `tests/test_learning_ids.py`：改标题 ID 不变；表格 / 列表重排块 ID 不变；
  移动笔记且标题相同 → 继承并报告；两个候选同名 → 不继承、报告冲突；
  主题目录改名后同一输出目录 ID 不变；实操项 ID 稳定。
- `tests/test_learning_manifest.py`：字段齐全并通过 schema；无主页时
  `about`/`route` 为 null；无绝对路径；分组与 `concept.group` 一致。
- `tests/test_learning_decisions.py`：applied / orphaned / inherited；
  重新编译两次结论不变；原笔记文件哈希不变。
- `tests/test_organize.py`：null 为空；folder 对 golden 文件；拒绝过滤；
  非法注入输出被丢弃；评测工具对手写响应算出预期指标。
- 现有 71 项 Python 测试保持通过。

## 检查

```bash
python -m unittest discover -s tests
python tools/learning/notes_compile.py samples/learn/demo-topic --out <临时目录> --extractor annotated --schema-file schemas/learning/learn.schema.json
python tools/learning/organize.py --request samples/record/organize/request.json --organizer folder --out <临时文件>
```

## 交接

不改前端、`server/**`、`schemas/record/**`、`samples/record/**`、根依赖和 CI。
manifest 或 organize 契约缺字段时写进 `tools/learning/HANDOFF.md`，由集成人改契约。
在 `tools/learning/README.md` 补充 ID 规则、manifest、`--decisions`、Organizer 和评测用法。

## 交付报告格式

```text
分支 / 提交：codex/s2-notes @ <hash>
起点：<C0 提交号>
改动文件：<列出>
检查：unittest <通过/失败数>；demo-topic 编译 + schema <结果>；folder golden <结果>
ID 稳定性：<对 demo-topic 做的改标题 / 重排 / 移动实验结论>
真实笔记只读试跑：<三个主题的概念数、分组数、orphaned 数、folder 评测指标；或未跑原因>
未完成与已知限制：<列表>
需集成人处理：<HANDOFF 条目>
```

完成后只在本分支提交。不自行合并或推送。
