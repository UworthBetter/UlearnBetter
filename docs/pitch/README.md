# 评委导读

本页按评分维度列出每一项结论在仓库里的证据，所有结论都能顺着路径找到代码或数据核对。

**一句话**：UlearnBetter 把学习视频变成可以走进去学的星图，并把每天的学习痕迹整理成“今天该学什么 + 为什么”。

**最快的验证方式**：`cd server && npm run demo`，打开 `http://localhost:5173/#/today`，不需要任何 API Key。演示路线见 [DEMO_SCRIPT.md](DEMO_SCRIPT.md)。

---

## 评分维度一览

| 维度 | 一句话证据 | 详细材料 |
| --- | --- | --- |
| 需求洞察 | 服务对象是靠视频自学、同时推进多条学习线的学生。痛点不是“记不下来”，而是“学不进去、不知道今天学什么” | [USER_INSIGHT.md §1–2](USER_INSIGHT.md) |
| 原型完成度 / 完成度与可用性 | 一条命令跑起 5 个视图、常驻助手和真实数据；换一个视频链接或一份 Obsidian 笔记也能生成新星图；261 个测试，CI 全绿 | 本页 §原型完成度 |
| 用户验证 | 负责人本人是目标用户，每一轮都按负责人的原话反馈迭代（定位 → UI v1 → v2 → 实现）；外部试用者遇到的问题当天修复 | [USER_INSIGHT.md §3](USER_INSIGHT.md) |
| 价值与可持续 | 日常学习零 token 成本（全部用规则计算）；只有加工新视频时调用模型，每分钟视频约 7.8k 输入 + 1.6k 输出 token（实测）；支持自带密钥 | [VALUE_AND_COST.md](VALUE_AND_COST.md) |
| 创意 | 按知识形状生成可交互卡片；离星回忆把复习藏进探索；助手能看到滑块的实时读数；每张卡都能追溯到视频的那一秒 | 本页 §创意 |
| 场景价值 | 具体的人（多线自学的大学生）、具体的场景（看完 3Blue1Brown 后两周忘光），开发者自己就是用户 | [USER_INSIGHT.md](USER_INSIGHT.md) |
| 展示 | 一打开就是“今天学 5 件事”；拖动凯利公式滑块的瞬间让人想上手试 | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) |

---

## 原型完成度

### 能跑：一条命令，打开就能用

| 功能 | 入口 | 实现 |
| --- | --- | --- |
| 今天：最多 5 条计划，每条附理由 | `#/today` | `concept-graph/src/views/today/`，规则在 `server/src/record/derive/today.mjs` |
| 学习统计层：时长、热力、连续天数、回忆正确率、各目标曲线 | `#/today?layer=stats` | `views/today/stats/StatsLayer.tsx` |
| 全景：目标 → 主题 → 概念，缺口和下一步，可拖拽的力导向星图 | `#/panorama` | `views/panorama/`（`physics.ts`、`labels.ts` 防止标签重叠） |
| 星图潜航：聚焦一颗星，主卡加环绕卡，六种知识形状 | `#/star-dive/<主题>` | `concept-graph/src/star-dive/` |
| 公式与参数卡：拖动滑块，曲线实时重算 | 任意带公式的星 | `star-dive/modules/paramDemo.ts`、`dsl.ts` |
| 离星回忆：记得 / 忘了 / 跳过 | 离开任意概念星 | `views/recall/RecallPrompt.tsx` |
| 资料：识别、归类、置信度、理由、撤销、修正 | `#/library` | `views/library/LibraryView.tsx` |
| 调整归类层：提议卡组，接受、拒绝、改归属 | 资料详情 / 助手提示卡 | `views/layers/AdjustLayer.tsx` |
| 笔记阅读器：双链、反链、大纲、公式、mermaid、时间戳 | `#/notes/<主题>` | `views/notes/` |
| 常驻学习助手：理解当前场景，能操作星图 | 右下角小人 | `assistant/ui/`，后端 `server/src/runtime.mjs` |
| 模型设置页：5 家模型，保存即生效，测试连接 | `127.0.0.1:4000/settings` | `server/src/settings/` |

### 换个输入也能跑

- **新视频**：`tools/video_ingest.py` 支持 YouTube 和 B 站，字幕按“人工 > 自动 > 原语言”的顺序降级，没有字幕时用 faster-whisper 本地识别，章节标题和对应时间窗的字幕互相印证（`tests/test_video_ingest.py`）。应用内的串联在 `server/src/record/video.mjs`。
- **已有笔记**：任意 Obsidian 主题目录都能用 `tools/learning/notes_compile.py` 编译成星图，CI 每次都会编译一份样例主题来验证（`.github/workflows/checks.yml`）。
- **没有模型**：记录层、派生规则和全部视图照常工作。助手入口会明确返回“未配置”，不会拿假回答糊弄。

### 真实数据，不是摆拍

`samples/demo/` 里的全部笔记、概念卡、实操清单、全景图、目标提议和归类结果，都是用真实流水线和模型（`glm-5.3-flash`）从 6 个公开视频跑出来的：

- 81 次模型调用，每次的 request id、token 数和耗时都在 `samples/demo/notes/*/*.generation.json`；
- 归类和目标提议的模型理由保存在 `samples/demo/record/build-log.json`；
- 学习者 17 天的操作由脚本按固定 seed 模拟（`tools/demo/learner-script.json`），通过真实后端接口写入，掌握度和计划由后端按规则算出。哪些数据由模型产出、哪些由脚本模拟，`samples/demo/README.md` 和界面顶部的「预置数据」标记都写得清清楚楚。

### 工程质量

- **261 个自动化测试全部通过**：Python 117 / 后端 91 / 前端 53；
- GitHub Actions 三条流水线（`.github/workflows/checks.yml`）；
- 17 份 JSON Schema 作为前端、后端和 Python 共用的契约（`schemas/`）；
- 预置数据可逐字复现，并扫描是否误提交凭据（`tests/test_demo_data.py`）；
- 契约先行的并行开发：每个模块有明确的文件归属和交接记录（`docs/development/`）。

---

## 创意

1. **按知识形状生成卡片，而不是千篇一律的闪卡。** 编译器识别每个概念属于定义、对比、流程、结构、实操还是公式，分别生成能读、能对照、能步进、能勾选、能调参的卡片（`tools/learning/blocks.py`、`star-dive/modules/`）。“凯利公式”不是一段文字，而是两根滑块加两条实时曲线。
2. **复习藏在探索里。** 不用另开复习模式：离开一颗星时问一句「还记得吗」，答案就是复习记录，直接决定星的亮度和下次到期日。
3. **学习记录长成一片星空。** 掌握度是亮度，缺口是珊瑚色虚线圈，下一步是金色数字。打开全景图，一眼就能看出自己学到了哪。
4. **证据回到那一秒。** 每张卡的出处是 `{视频, 秒数}` 或 `{笔记, 段落}`，编译器拒绝没有证据的出处（`schemas/learning/learn.schema.json`）。
5. **助手看见你在看什么。** 当前星、当前卡片和滑块的实际读数都实时进入助手上下文，读数由应用上报，模型不需要猜（`concept-graph/src/assistant/context-store.ts`、`docs/development/CONTRACTS.md`）。问“为什么现在仓位是 0.16”，它知道你的滑块停在哪里。
6. **整理是提议，你说了算。** 智能体的每次归类都带置信度和理由，可撤销；你的修正存在独立的决定层，换模型、重新整理都不会把它冲掉（`server/src/record/derive/overlay.mjs`）。

---

## 场景价值

见 [USER_INSIGHT.md](USER_INSIGHT.md)。简要来说：

- **具体的人**：负责人是同时学大学课业、量化交易和 AI 前沿的学生，三条线的真实笔记就是本项目的起点。
- **具体的场景**：看完 3Blue1Brown 的神经网络三部曲、记下 12 章笔记，两周后只记得“好像有个梯度下降”。
- **已经有人在用**：开发者用自己三条学习线的真实笔记推动每一轮开发；外部试用者已经能从仓库独立拉起完整演示。

---

## 展示

- 打开第一屏就是结论：「今天学 5 件事，约 10 分」，每件事都附理由；
- 让人想试的瞬间：在「凯利公式」上拖动胜率滑块，看仓位曲线实时变化；离开时点一下「记得」，回到全景看到那颗星亮起来；
- 3 分钟演示脚本：[DEMO_SCRIPT.md](DEMO_SCRIPT.md)；截图在 `docs/assets/screenshots/`。

## 下一步

| 方向 | 内容 |
| --- | --- |
| 复习引擎 | 把 `simple-v0` 间隔升级为 FSRS，事件字段已按兼容设计 |
| 输入面 | 文章和 PDF 接入同一条流水线（schema 已经预留 `pdf` 来源） |
| 陪伴入口 | 桌宠从网页走向桌面常驻，到点提醒今日计划 |
| 整理能力 | 用户修正累积成标注数据，训练少样本分类器，越用越准 |
