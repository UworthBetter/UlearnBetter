# Zcode：笔记转换与通用内容结构

在 `D:/haikesong2-worktrees/zcode-notes` 开始，阅读根 AGENTS.md、
`docs/development/SPRINT_01.md` 和 `CONTRACTS.md` 后直接实现。
参考两份 `docs/reference/` 计划，但执行本轮产品裁决。

## 交付

在 `tools/learning/` 实现离线笔记导入与转换入口，输入主题目录，输出
`learning.learn/0.1` 和校验报告。六类块为 definition、structure、
process、comparison、variation、procedure。制定 schema 并放到
`schemas/learning/`；合成或最小自建示例放到 `samples/learn/`。

用 tags 与笔记结构识别概念卡、章节和实操。保留稳定 ID、别名、原文、
笔记出处、视频来源和有依据的时间戳。优先实现确定性导入，LLM 抽取
预留可注入接口，不因没有模型密钥而阻塞基本转换。

来源与推测分开；不把出现顺序当成 prerequisite，不按别名自动合并，
不为满足块数硬凑实验，不捏造逐句引文。增量缓存包含所依赖文件和
转换器版本。转换不写回输入笔记。

## 验收与交接

为多来源、同名笔记、断链、缺失定义、损坏元数据、重复运行和引用材料
变化编写有意义的测试，放到 `tests/test_learning*.py`。
用户笔记 `D:/quant/笔记` 仅只读试跑，真实笔记内容和产物不提交。

不改前端渲染器、外部 skill 或根 requirements。新增依赖放在自己目录
并在 README 写安装方法。提供双均线和 AI 工具两个主题的转换统计。
完成后在本分支提交，交付提交号、测试和限制；不自行合并或推送。
