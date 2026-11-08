# UlearnBetter · 学习留下的星光

[![Checks](https://github.com/UworthBetter/UlearnBetter/actions/workflows/checks.yml/badge.svg)](https://github.com/UworthBetter/UlearnBetter/actions/workflows/checks.yml)

> **把看过的学习视频变成一片可以“走进去学”的星图。**
> 丢进一个视频链接，智能体整理出概念、关系和实操清单，归入你的学习目标；
> 你在星图里逐颗点亮知识，每张卡都能回到原视频的那一秒；
> 第二天打开，它告诉你今天该学哪 5 件事，以及**为什么**。

![公式与参数卡：拖动胜率和盈亏比，凯利仓位曲线实时变化](docs/assets/screenshots/05-param-card.webp)

<sub>上图是应用实拍：在「凯利公式」这颗星上打开“公式与参数”卡，拖动滑块，全凯利和分数凯利两条曲线实时重算。卡片内容由模型从 Financial Wisdom 的视频生成，公式由应用实际计算，没有写死。</sub>

---

## 30 秒看懂

| | |
| --- | --- |
| **为谁做** | 靠 B 站 / YouTube 视频自学、同时推进好几条学习线的大学生和自学者（课业 + 量化 + AI 前沿）。我们自己就是第一批用户 |
| **解决什么** | 视频看完、笔记记完，两周后忘光；笔记越堆越多，却说不清**今天该学什么**、学到哪了 |
| **怎么解决** | 丢进来 → 智能体整理 → 星图里学 → 学习痕迹自动沉淀 → 每天给出有理由的学习计划 |
| **和笔记工具的区别** | 笔记工具管“记下来”，UlearnBetter 管“学进去”：按知识的形状生成可交互的卡片，离开每颗星时做一次回忆，掌握程度会亮在星图上 |
| **能不能跑** | 一条命令启动完整演示：3 个学习目标、31 颗知识星。笔记、星图和归类由真实流水线和真实模型从 6 个公开视频生成，另附 17 天学习记录（脚本模拟，经真实接口写入）。261 个自动化测试，CI 三条流水线全绿 |

👉 **评委导读（按评分维度列出证据和文件位置）：[docs/pitch/README.md](docs/pitch/README.md)**

---

## 一条命令启动

```bash
# 首次安装（Node ≥ 20）
cd server && npm ci && cd ../concept-graph && npm ci && cd ..

# 启动预置演示：后端 + 前端 + 数据，一步完成
cd server && npm run demo
# 打开 http://localhost:5173/#/today
```

- **不需要任何 API Key** 就能完整体验今天、全景、星图潜航、资料和笔记五个视图。学习记录、掌握度、今日计划、统计全部由确定性规则在本地算出，不调用模型，也不花一分钱。
- 想体验 AI 助手和“贴链接自动生成星图”，打开 `http://127.0.0.1:4000/settings`，选一家模型并填入密钥，保存后立即生效，不用重启。支持 Anthropic、OpenAI、Google、Groq 和任意 OpenAI 兼容端点（如 DeepSeek、智谱）。
- 每次启动，演示数据的日期都会自动平移到“昨天”，所以任何一天打开，到期复习、连续天数、今日计划都是活的。

3 分钟演示路线见 **[docs/pitch/DEMO_SCRIPT.md](docs/pitch/DEMO_SCRIPT.md)**。

---

## 体验一圈

### ① 今天：打开就知道学什么

![今天视图](docs/assets/screenshots/01-today.webp)

今天最多给 **5 件事**：到期复习 → 每个目标路线上的下一颗星 → 没做完的实操清单。每条都附“为什么”，理由完全由你的学习记录拼出来，例如：

> 为什么：昨天离星回忆选了「忘了」，按 1 天间隔今天到期

规则公开（`today-v0`），不靠模型拍脑袋，所以不会编造理由。

### ② 全景：我学的东西长什么样

![学习全景图](docs/assets/screenshots/02-panorama.webp)

所有目标、主题、概念在一张图上。星越亮代表掌握得越好；珊瑚色虚线圈标出**缺口**（一整组还没开始学），金色数字标出**下一步**。画布可以拖动、缩放，星星也能拖。

### ③ 星图潜航：走进一个主题

| 一个主题就是一片星空 | 聚焦一颗星：主卡 + 环绕卡 |
| --- | --- |
| ![星图](docs/assets/screenshots/03-star-dive.webp) | ![聚焦](docs/assets/screenshots/04-focus-card.webp) |

点一颗星，它飞到中央，周围环绕着按**知识形状**生成的卡片：

| 知识形状 | 卡片怎么学 |
| --- | --- |
| 定义 | 读核心定义，看相关概念哪些已点亮 |
| 对比 | 对照表看优点和局限 |
| 流程 | 一步步往前推，看清执行顺序 |
| 结构 | 主题全景图（mermaid） |
| 实操 | 可勾选的清单，进度写进学习记录 |
| 公式与参数 | **拖滑块，曲线实时重算**（见顶部大图） |

每张卡的出处都能跳回**原视频的具体秒数**或笔记的具体段落。编译器规定：没有证据的内容不能编一个出处。

### ④ 离星回忆：学习动作藏在探索里

![离星回忆](docs/assets/screenshots/06-recall.webp)

离开一颗星时只问一句「还记得吗？」，点“记得 / 忘了 / 跳过”就行，不用出题、不用打卡。这一下决定了星的亮度和下次复习的日期（1 / 3 / 7 / 14 / 30 天间隔）。

### ⑤ 资料：智能体把你丢进来的东西整理成了什么

![资料视图](docs/assets/screenshots/07-library.webp)

视频、课程笔记、随手想法都能丢进来。每一份都摊开展示：识别成了什么、讲什么、学习路线、抽出了哪些概念、归到了哪个目标、**置信度多少、理由是什么**。高置信的结果自动接受，低置信的放进“待确认”。任何一次整理都能一键撤销，你改过的归属下次重新整理也不会被冲掉。

### ⑥ 笔记：Obsidian 风格的原文阅读器

![笔记阅读器](docs/assets/screenshots/08-notes.webp)

星图背后的 Markdown 笔记随时可读：双链、反向链接、大纲、callout、KaTeX 公式、mermaid 图、视频时间戳链接。点「在星图中潜航」可以回到星图。

### ⑦ 常驻学习助手

右下角的小人是全局 AI 助手，可以拖到屏幕任意位置。它能看到你**此刻**在看哪颗星、哪张卡，以及滑块停在哪个数值（读数由应用上报，不让模型去猜），还能帮你聚焦星星、打开卡片。它不会替你确认整理结果，确认必须由你本人点按钮。

---

## 换一个输入也能跑

整条流水线是通用的，不只服务这三个演示主题：

```text
视频链接（YouTube / B 站）
  └─ tools/video_ingest.py      抓元数据、官方章节、字幕；无字幕时用本地语音识别；章节与字幕互相印证
      └─ 模型                    按 schema 生成结构化学习笔记（概念卡、学习路线、实操清单、公式标注）
          └─ notes_compile.py    确定性编译成 learn.json：稳定 ID、证据链、六种知识形状
              └─ 记录层后端       识别、归类到目标、派生掌握度和今日计划
                  └─ 星图 / 全景 / 今天 / 资料
```

- **在应用里**：配置模型后，把视频链接贴进助手输入框（也可以拖进输入框），确认加入资料，后端会自动走完整条流水线，新主题直接出现在星图里（`server/src/record/video.mjs`）。
- **在命令行里**：

  ```bash
  python tools/video_ingest.py "https://www.bilibili.com/video/BVxxxx" --cookies-from-browser edge
  python tools/learning/notes_compile.py <你的 Obsidian 主题目录> --out out/
  ```

  已有的 Obsidian 笔记目录也能直接编译成星图，不一定要从视频开始。

预置数据就是用这条流水线从 6 个公开视频真实跑出来的：81 次模型调用，每次的 request id 和 token 数都记录在 `samples/demo/notes/*/*.generation.json`。

---

## 架构

```text
┌──────────── 前端 concept-graph/（React 19 + Vite + d3-force）────────────┐
│  今天 · 全景 · 星图潜航 · 资料 · 笔记        常驻学习助手（CopilotKit）      │
│  场景桥接：当前星 / 卡片 / 滑块读数 → 助手上下文（只读快照）                  │
└───────────────┬───────────────────────────────────────────┬─────────────┘
                │ /api/record（JSON Schema 校验）            │ /api/copilotkit
┌───────────────▼────────────── 后端 server/（Node + Express）▼─────────────┐
│ 记录层：目标 · 资料 · 归属提议 · 用户修正 · 学习痕迹（文件存储，只追加）       │
│ 派生：掌握度 · 今日计划 · 统计 · 全景 · 缺口（确定性规则，零模型调用）          │
│ 整理器：null / folder / llm（可替换）   视频流水线   模型设置（热切换）        │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ 只读编译产物
┌───────────────▼──────── 工具 tools/（Python）─────────────────────────────┐
│ video_ingest.py 视频解析      learning/notes_compile.py 笔记 → learn.json  │
└─────────────────────────────────────────────────────────────────────────┘
```

三条设计原则：

1. **材料、派生、决定三层分开。** 笔记和字幕是材料，概念和归类提议是派生，你的确认、修正和学习痕迹是决定。派生层随时可以重算，换整理器、换模型都不会丢掉你的东西。
2. **模型只做该做的事。** 生成笔记、识别资料、提议归类交给模型；掌握度、复习排期、今日计划用公开规则计算。日常使用不消耗 token，结果也能解释。
3. **数据是你的。** 全部存成本地 JSON / JSONL 文件，目录结构按 Obsidian vault 设计，没有云端锁定。密钥只在后端读取，笔记和字幕一律当作数据，不当作指令。

---

## 工程质量

| 项目 | 现状 |
| --- | --- |
| 自动化测试 | **261 个**：Python 117（编译器、ID 稳定性、整理器、视频解析、演示数据可复现）· 后端 91（记录层 API、派生规则、存储、路径安全、协议）· 前端 53（助手上下文、全景布局物理、交互、契约） |
| 持续集成 | GitHub Actions 三条流水线：前端构建 + lint + 测试 / Python 测试 + 编译校验 + 整理器一致性 / 后端测试 |
| 契约 | 17 份 JSON Schema（`schemas/`），前后端和 Python 共用同一份定义 |
| 可复现 | 预置数据的编译产物可以逐字复现（`tests/test_demo_data.py`），并扫描是否误提交凭据 |
| 安全 | 只监听本机、限制 CORS 来源、限制请求大小；笔记路径做 realpath 校验，防止越界；Markdown 渲染时禁用 HTML，mermaid 运行在 strict 级别 |

```bash
python -m unittest discover -s tests                     # Python
node --experimental-strip-types --test tests/*.test.mjs  # 前端逻辑
cd server && npm test                                    # 后端
cd concept-graph && npm run build && npm run lint        # 前端构建
```

---

## 目录

| 路径 | 内容 |
| --- | --- |
| `concept-graph/` | 前端应用：五个视图、星图引擎、学习助手 |
| `server/` | 后端：助手运行时、学习记录层、视频流水线、模型设置页 |
| `tools/video_ingest.py` | 视频 → 结构化 ingest JSON（元数据、章节、字幕、章节互证） |
| `tools/learning/` | 笔记编译器：Obsidian 主题目录 → `learn.json` |
| `tools/demo/` | 预置数据的生成与一键启动脚本 |
| `schemas/` | 数据契约（JSON Schema） |
| `samples/demo/` | 预置演示数据（真实流水线产出，说明见其 README） |
| `docs/pitch/` | **参赛材料**：评委导读、演示脚本、需求与用户验证、价值与成本 |
| `docs/development/` | 迭代计划、接口契约、集成记录 |
| `docs/reference/` | 产品定位、UI 方案、可点击原型 |

## 文档

- [评委导读](docs/pitch/README.md)：四个评分维度各自对应的证据
- [3 分钟演示脚本](docs/pitch/DEMO_SCRIPT.md)
- [需求洞察与用户验证](docs/pitch/USER_INSIGHT.md)
- [价值、付费与成本](docs/pitch/VALUE_AND_COST.md)
- [产品蓝图](docs/学习Agent产品蓝图%20v1.1.md) · [产品定位](docs/reference/POSITIONING_v2.md) · [UI 方案](docs/reference/UI_PLAN_v2.md)
- [接口契约](docs/development/CONTRACTS.md) · [后端说明](server/README.md) · [笔记编译器](tools/learning/README.md) · [预置数据说明](samples/demo/README.md)
