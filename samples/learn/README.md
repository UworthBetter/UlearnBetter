# samples/learn · 合成示例主题

`demo-topic/` 是**完全虚构**的最小示例笔记库，用于测试与回归：
不对应任何真实课程，视频 ID（`demo000001` / `demo000002`）与全部内容均为编造。

刻意覆盖的边界情况：

- 多来源：两个视频 ID 混在概念卡与清单中
- 同名笔记：`01-课程笔记/双生.md` 与 `02-概念卡/双生.md`
- 断链：`[[断链目标]]`
- 缺失定义：`02-概念卡/无定义.md`（无 abstract，回退正文首段）
- 损坏元数据：`02-概念卡/损坏卡片.md`（frontmatter 非法行）
- 六类内容：定义（所有卡）、对比（优劣表）、流程（有序步骤 / ①②③ 围栏）、
  操作（实操清单）、结构（主页 mermaid）、变化（`概念B.md` 的
  `learn_blocks` 标注，需 `--extractor annotated`）
- 非法标注：`概念C.md` 的 `learn_blocks` 应被丢弃并记录

运行：

```bash
python tools/learning/notes_compile.py samples/learn/demo-topic \
  --out <输出目录> --extractor annotated
```
