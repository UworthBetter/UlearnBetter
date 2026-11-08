# samples/demo · 预置数据（真实流水线产出）

这一套数据用项目现有流水线，配合已配置的模型（`glm-5.3-flash`，OpenAI 兼容接口）
从 6 个公开 YouTube 视频真实跑出来，用于一键演示全部视图：

```text
video_ingest.py → notes_from_ingest.py（youtube-obsidian-notes 技能 + 模型）
  → notes_compile.py（确定性编译） → 记录层后端（llm 整理 + 学习记录） → 各视图
```

## 一键启动

```bash
cd server && npm ci && cd ../concept-graph && npm ci && cd ..   # 首次
cd server && npm run demo        # 等价于 node ../tools/demo/start_demo.mjs
# 打开 http://localhost:5173/#/today
```

- 每次启动都会把本目录复制到 `server/.data/demo/`（已 gitignore），并把记录里的
  时间按整天平移，让最后一个学习日落在**昨天**（按本机时区）。这样今日计划、到期复习、
  连续天数都能正常显示。仓库里的文件不会被修改。`--keep` 保留上次演示中的操作。
- 模型配置从 `server/.env` 读取（`ASSISTANT_PROVIDER` / `ASSISTANT_BASE_URL` /
  `ASSISTANT_MODEL` / `ASSISTANT_API_KEY`）。配了之后，底部 Agent 栏可以真实问答，
  新资料用 `llm` 整理。没配时记录层和各视图照常可用，助手入口返回 503「未配置」，
  整理器改用 `folder`（不调用模型）。
- 顶栏显示「预置数据」标记，悬停可看数据来源说明。
- 端口：`--port 4000`（后端）、`--web-port 5173`（前端）；`npm run demo:prepare`
  只准备数据目录，并打印所需的环境变量。

## 内容

| 目标（模型提议，学习者确认） | 主题 | 视频 | 笔记 |
| --- | --- | --- | --- |
| 机器学习入门：理解神经网络 | 神经网络入门 | 3Blue1Brown《But what is a neural network?》《Gradient descent, how neural networks learn》《Backpropagation, intuitively》 | 12 章 · 12 概念卡 · 2 清单 |
| 掌握 Git 版本控制 | Git版本控制 | Fireship《Git It? How to use Git and Github》《13 Advanced (but useful) Git Techniques and Shortcuts》 | 10 章 · 11 概念卡 · 2 清单 |
| 量化交易：凯利公式与仓位管理 | 凯利公式与仓位管理 | Financial Wisdom《KELLY CRITERION \| Ed Thorp》 | 4 章 · 8 概念卡 · 2 清单 |

另有一条视频链接（Mutual Information《The Kelly Criterion》）按真实流程登记为资料，状态为「排队中」。

六种卡片形状全部覆盖：定义、对比、流程、结构（主页 mermaid 全景图）、实操清单，
以及「公式与参数」变化型卡片。变化型卡片来自模型的 `learn_blocks` 标注，`grounding`
为 `illustrative`：Sigmoid 激活、平方差代价、凯利比例、仓位换算各一张。

## 目录

| 路径 | 内容 | 来源 |
| --- | --- | --- |
| `ingest/` | 视频元数据、官方章节、字幕与章节互证结果 | `tools/video_ingest.py`；**字幕正文已去掉**（AGENTS.md：不提交字幕全集；第三方版权），重新抓取即可复现 |
| `notes/<目录>/<主题>/` | Obsidian 笔记库（技能模板） | 模型按 `youtube-obsidian-notes` 技能生成；frontmatter、资源笔记、链接修复由工具确定性完成 |
| `notes/<目录>/<主题>.generation.json` | 生成日志：模型、每次调用的 request id 与 token、标注采纳情况、链接修复记录 | `tools/demo/notes_from_ingest.py` |
| `learn/<主题ID>/` | `learn.json` + `manifest.json` | `tools/demo/compile_demo.py` → `tools/learning/notes_compile.py`，可逐字复现（测试覆盖） |
| `compile/<主题ID>/` | 编译报告、稳定 ID 映射 | 同上 |
| `record/` | 决定层与学习痕迹（`goals.json` … `events.jsonl`）、`demo-meta.json`、`build-log.json` | `tools/demo/build_record.mjs`，进程内启动真实后端、经 `/api/record` 写入 |

## 哪些是模型产出，哪些是模拟的

- **模型 / 编译器真实产出**：全部笔记正文、章节分组、概念卡、实操清单、全景图、
  变化型标注；资料识别；三个目标的提议及理由；每份笔记的归属（置信度 0.9 至 0.95，
  自动接受）；5 条想法挂到哪颗星的提议。
- **学习者脚本模拟**（`tools/demo/learner-script.json`）：2026-10-14 至 11-06 期间
  17 个学习日的操作，包括加入主题、确认目标提议、在星上停留、离星回忆、勾选清单，
  以及想法、反思、提问的文字。停留时长和回忆结果用固定 seed 确定性生成。这些操作
  都通过真实记录层接口写入，掌握度、今日计划、统计、缺口由后端按确定规则派生。

## 重新生成

需要 `server/.env` 里的模型配置和可访问 YouTube 的网络；每一步都会真实调用模型。

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # yt-dlp
.venv/bin/python tools/video_ingest.py "https://www.youtube.com/watch?v=<ID>" --sub-langs en -o ingest/yt_<ID>.json
set -a; . server/.env; set +a
python3 tools/demo/notes_from_ingest.py --ingest ingest/yt_<ID>.json ... \
  --topic 神经网络入门 --topic-id nn-basics --folder 机器学习 \
  --out samples/demo/notes --skill <youtube-obsidian-notes 技能目录或 zip> --max-variation 3
python3 tools/demo/compile_demo.py          # 按 tools/demo/topics.json 编译
node tools/demo/build_record.mjs            # 约 4 分钟，重建 record/
```

主题、视频和编译时间写在 `tools/demo/topics.json`。模型输出不确定，重新生成的
文字会和本目录不同。

## 校验

```bash
python -m unittest tests.test_demo_data          # 复现编译、断链、时间戳、引用、凭据扫描
cd server && node --test ../tests/server/demo-data.test.mjs   # 加载、时间平移、各视图接口
```
