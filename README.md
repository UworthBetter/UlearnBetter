# haikesong · 个人学习 Agent 系统

多领域个性化学习陪伴系统：管理多条学习线（课业 / 量化 / AI 前沿），把内容加工成知识、把知识护养成能力，长期沉淀为个人资产。

> 产品蓝图见 [docs/学习Agent产品蓝图 v1.1.md](docs/学习Agent产品蓝图%20v1.1.md)

## 当前开发入口

本轮开发是星图内学习与全局 AI 助手，执行范围、分工和验收见
[第一轮开发计划](docs/development/SPRINT_01.md)，前后端接口见
[助手契约](docs/development/CONTRACTS.md)。
Claude Code、Grok Build 和 Zcode 的可执行任务包位于
[任务目录](docs/development/tasks/)。每个工具在独立工作目录开发，
由 GPT / Codex 集成。当前助手仅有场景桥接，UI 和模型服务尚待接入。

## 架构（三层 + 一条原则）

```
陪伴入口层   桌宠（壳薄、人格在 Agent 侧）│ 控制台 │ 系统通知
    ↓ 数据契约（文件即 API）
Agent 核心   内容加工 │ 复习与掌握度(FSRS) │ 任务规划 │ 关联发现
    ↓ vault 是唯一事实源
知识资产层   Obsidian Vault（笔记 / 概念卡 / 图谱 / 复习记录）
```

**贯穿原则**：所有入口只通过约定文件读写通信，不建 vault 之外的第二数据源。

## 当前状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 数据契约 + 解析层 + 收集箱 + FSRS 复习引擎 + 全局图谱 | 🚧 解析层已完成 |
| M2 | 控制台接真实 vault 数据 | ⬜ |
| M3 | 桌宠真壳（PyQt6，L0/L1 本地、L2 路由） | ⬜ |
| M4 | 定时任务与通知（早队列 / 晚汇总） | ⬜ |

## 已完成：解析层

`tools/video_ingest.py` —— URL → 结构化 ingest JSON（确定性编排，零 LLM）：

- 元数据 / 官方章节：yt-dlp；章节缺失时从简介回退解析
- 字幕：手创 > 自动 > 原语言兜底（翻译字幕限流时自动降级 android 客户端）
- 无字幕：`--asr` 回退 faster-whisper（需安装）
- 章节真伪互证：标题 4-gram 与对应时间窗转写比对，产出 `trusted` 标记
- 滚动字幕增量去重；vtt / srt / json3 / B站 JSON 归一化

```bash
# 解析一个视频（输出 ingest/<platform>_<id>.json）
python tools/video_ingest.py "https://www.youtube.com/watch?v=XXXX"

# B站 AI 字幕需要登录态
python tools/video_ingest.py "https://www.bilibili.com/video/BVxxxx" --cookies-from-browser edge

# 无字幕视频走本地语音识别
python tools/video_ingest.py "<URL>" --asr
```

契约样例见 [samples/ingest/](samples/ingest/)。建库 Agent 只消费这份 JSON，不自行上网抓取。

## 目录

| 路径 | 用途 |
| --- | --- |
| `tools/` | 确定性工具（解析层等），Agent 通过 Bash 调用 |
| `docs/` | 产品蓝图与设计文档 |
| `samples/` | 数据契约样例 |
| `tests/` | 单元测试：`python -m unittest discover -s tests` |
| `ingest/` | 解析产出（不入库，gitignore） |

> Obsidian vault（笔记库）与 `_Inbox/收集箱.md`、`_系统/用户画像.md` 属用户数据，路径在 M1 配置化，不放本仓库。

## 测试

```bash
python -m unittest discover -s tests
```

## 依赖

```bash
pip install -r requirements.txt
```
