# samples/organize-eval · 归类评测集（全合成）

全部内容为虚构合成，不对应任何真实笔记或负责人目标。只放标注和合成
摘要（标题、一句话、概念名、目录名提示），不含笔记全文。

## 覆盖场景

- `item:ev-ai-quant` 应**同时属于两个目标**（量化交易 + AI 前沿）——多归属；
- `item:ev-cooking` 应进「**未归属**」（目录名「生活」不对应任何目标，
  检验目录硬配会不会乱抓）；
- `item:ev-idea-slippage` 是一条**想法**：不应得到任何目标归属
  （想法只允许挂到已有概念，第一轮裁决 7）。

## 文件格式

| 文件 | 内容 |
| --- | --- |
| `goals.json` | 目标数组：`{id, title, intent|null, folders[]}`，与 organize 请求的 `goals` 同构 |
| `items.json` | 资料数组：`{subject, kind, title, about, folderHint, conceptLabels}`，与请求的 `items` 同构 |
| `labels.json` | 人工标注：`{subject, goalIds[], note|null}`。`goalIds: []` 表示应进未归属；kind 为 `idea` 的条目也要求空归属 |
| `request.json` | 由上面三者组装好的完整 `learning.organize/0.1` 请求，可直接喂给 `tools/learning/organize.py` |

标注中的 `note` 字段只是给人看的说明，评测工具忽略它。

## 用法

```bash
# 1. 用任意 Organizer 生成响应（folder 基线 / 后端 llm / 注入实现）
python tools/learning/organize.py \
  --request samples/organize-eval/request.json \
  --organizer folder --out "$TEMP/folder-response.json"

# 2. 打分（json + md 两种报告）
python tools/learning/organize_eval.py \
  --eval samples/organize-eval \
  --response "$TEMP/folder-response.json" \
  --out "$TEMP/folder-eval"
```

指标见 `tools/learning/README.md`：准确率、宏平均查准 / 查全、多归属
召回、未归属判断、待确认比例、被拒组合违规数；若响应带 `usage`
（`calls` / `tokens` / `latencyMs`）则一并转出。每更换一次组件或提示词
跑一遍并记录（POSITIONING §4.1）。
