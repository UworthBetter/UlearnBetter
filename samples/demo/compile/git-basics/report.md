# 学习内容编译报告 · git-basics

- 编译器：`notes-compiler/0.2.0`（extractor=frontmatter-annotated）
- 笔记：28 篇（概念卡 11 / 章节 10 / 实操 2 / 资源 3 / 主页 1 / 其他 1）
- 概念：11 个（id 来源：title-slug 11）
- 块：definition 11 · structure 1 · process 11 · comparison 11 · variation 0 · procedure 2
- 实操清单：2 份 / 24 项
- 来源：2 个视频（2 个有元数据） · 保留时间戳证据 48 条
- 关系：related 26 · uses 10
- 阶段：3 个 · 保留未转换小节 5 处 · 缓存复用概念 0/11

## 问题清单（14 条）

### classified_by_fallback（1）
- `README.md`：分类依据=none（tags 缺失或损坏）

### definition_points_overflow（1）
- `02-概念卡/贮藏 Stash.md`：要点超过 6 条上限，超额部分按原文保留

### template_note_skipped（1）
- `Templates/概念卡模板.md`：Templates 目录不参与编译

### thinking_section_skipped（11）
- `02-概念卡/二分排查 Bisect.md`：「我的思考」不进模板，留给用户
- `02-概念卡/修补提交 Amend.md`：「我的思考」不进模板，留给用户
- `02-概念卡/分支 Branch.md`：「我的思考」不进模板，留给用户
- `02-概念卡/变基与压缩.md`：「我的思考」不进模板，留给用户
- `02-概念卡/合并冲突.md`：「我的思考」不进模板，留给用户
- `02-概念卡/快进合并.md`：「我的思考」不进模板，留给用户
- `02-概念卡/忽略文件.md`：「我的思考」不进模板，留给用户
- `02-概念卡/提交 Commit.md`：「我的思考」不进模板，留给用户
- `02-概念卡/撤销提交 Revert.md`：「我的思考」不进模板，留给用户
- `02-概念卡/暂存区.md`：「我的思考」不进模板，留给用户
- `02-概念卡/贮藏 Stash.md`：「我的思考」不进模板，留给用户

## 已知限制
- 离线确定性编译：不调用 LLM，不产出 grounding=video 的逐句字幕核对
- 时间戳只保留笔记链接中明确给出的起点秒数，不伪造结束点与引文
- 章节笔记里的时间戳不提升为概念块级证据（避免无依据的归属），可通过 sources[].discovered_in 追溯到具体笔记
- variation 块只能经 frontmatter learn_blocks 标注或 LLM 注入接口进入，并经校验；确定性编译不生成实验数据
- 数字检查为轻量版（NFKC 归一 + 子串匹配），未做繁简与中文数字换算
- claims/implies 的计算核对与可渲染冒烟属于后续阶段，本报告不声称完成
- 章节笔记内容不直接进块；概念卡未覆盖的小节按原文保留在 preserved
