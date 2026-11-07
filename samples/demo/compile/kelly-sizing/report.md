# 学习内容编译报告 · kelly-sizing

- 编译器：`notes-compiler/0.2.0`（extractor=frontmatter-annotated）
- 笔记：18 篇（概念卡 8 / 章节 4 / 实操 2 / 资源 2 / 主页 1 / 其他 1）
- 概念：8 个（id 来源：title-slug 8）
- 块：definition 8 · structure 1 · process 6 · comparison 8 · variation 2 · procedure 2
- 实操清单：2 份 / 26 项
- 来源：1 个视频（1 个有元数据） · 保留时间戳证据 33 条
- 关系：related 22 · uses 10
- 阶段：2 个 · 保留未转换小节 4 处 · 缓存复用概念 0/8

## 问题清单（10 条）

### classified_by_fallback（1）
- `README.md`：分类依据=none（tags 缺失或损坏）

### template_note_skipped（1）
- `Templates/概念卡模板.md`：Templates 目录不参与编译

### thinking_section_skipped（8）
- `02-概念卡/交易优势.md`：「我的思考」不进模板，留给用户
- `02-概念卡/仓位与风险换算.md`：「我的思考」不进模板，留给用户
- `02-概念卡/全凯利曲线.md`：「我的思考」不进模板，留给用户
- `02-概念卡/凯利公式.md`：「我的思考」不进模板，留给用户
- `02-概念卡/分数凯利.md`：「我的思考」不进模板，留给用户
- `02-概念卡/动态调仓.md`：「我的思考」不进模板，留给用户
- `02-概念卡/最优仓位.md`：「我的思考」不进模板，留给用户
- `02-概念卡/真实概率.md`：「我的思考」不进模板，留给用户

## 已知限制
- 离线确定性编译：不调用 LLM，不产出 grounding=video 的逐句字幕核对
- 时间戳只保留笔记链接中明确给出的起点秒数，不伪造结束点与引文
- 章节笔记里的时间戳不提升为概念块级证据（避免无依据的归属），可通过 sources[].discovered_in 追溯到具体笔记
- variation 块只能经 frontmatter learn_blocks 标注或 LLM 注入接口进入，并经校验；确定性编译不生成实验数据
- 数字检查为轻量版（NFKC 归一 + 子串匹配），未做繁简与中文数字换算
- claims/implies 的计算核对与可渲染冒烟属于后续阶段，本报告不声称完成
- 章节笔记内容不直接进块；概念卡未覆盖的小节按原文保留在 preserved
