# 概念图谱

Grokbot 策略笔记的概念星图。交互从 WordLink 的力导向图、进度环和三栏布局来：点节点切换中心，只显示它的邻居。

```bash
npm install
npm run dev
```

打开后默认停在「交易全亏却整体盈利」。掌握状态写在浏览器 `localStorage`（`concept-graph-status`），不改 Obsidian 笔记库。

## Star Dive · 星图潜航

视频概念的沉浸式星图，1:1 移植自 star-dive 原型（`/workspace/star-dive-proto`）。

- 入口：概念列表顶部「星图潜航 →」，或直接打开 `#/star-dive`；`#/star-dive/<概念 id>`（如 `#/star-dive/bits`）会直接潜入该星。
- 数据：`src/data/star-dive.json`（原型的 `data.json`）。
- 代码：`src/star-dive/` — `StarDive.tsx`（视图外壳）、`useStarDive.ts`（挂载引擎）、`scene.ts`（星空/布局/聚焦/面板/时间轴）、`modules/`（卡片模块系统：definition、steps、compare_table、video_clip、param_demo、interactive，契约见原型 `MODULES.md`）。
- 样式：`star-dive.css`，全部限定在 `.star-dive` 下，不影响概念图谱。
