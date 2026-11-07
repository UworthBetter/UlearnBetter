# Zcode → 集成人 HANDOFF（codex/s2-notes）

## 1. manifest.schema.json 未允许 importanceHint 为 null

`schemas/record/manifest.schema.json` 里
`concepts[].importanceHint` 是 `enum: [1, 2, 3]`（必填、不可空），
但 `ZCODE_NOTES_S2.md` 的规则是「没有依据就 null，不编分数」。无依据的
概念（未被章节引用、不在主页全景图、frontmatter 无标注）必须输出
`null`，否则就是编造分数。

**请求**：C0.x 把 `importanceHint` 改为 `anyOf: [{enum:[1,2,3]}, {type:"null"}]`。

**过渡行为**：本分支照任务规则输出 `null`；`notes_compile.py` 对
manifest 的 schema 校验失败只**告警不阻塞**（报告字段
`manifest_schema_validation`），等补丁合入后可恢复为阻塞。已知缺口之外
的 schema 违规仍然会让校验结果为 `valid: false`（`tests/test_learning_manifest.py`
只豁免这一类错误）。

## 2. 其余契约核对结论（无需改动，仅备查）

- `organize-request/response.schema.json` 字段齐全；`folder` 实现对
  `samples/record/organize/request.json` 的输出与 `folder.expected.json`
  逐字段一致（`tests/test_organize.py`）。
- golden 文件隐含两条口径，后端 JS 实现同样要满足：
  1. 归一化 = NFKC + trim + 小写；reason 保留目录名**原文**（含空格，
     「 实验 」）。
  2. folder 对被拒绝组合是**静默**过滤（`warnings: []`），不是丢弃后
     写警告。
- `manifest.json` 由编译器每次输出到与 learn.json 同目录，文件名
  `<topicId>.manifest.json`；后端扫描 `RECORD_LEARN_DIR/<topicId>/` 时
  如需固定文件名 `manifest.json`，复制/改名即可，内容不变。
