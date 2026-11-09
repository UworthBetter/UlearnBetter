# concept-graph · UlearnBetter 前端

React 19 + Vite 8 + d3-force。五个视图，加一个常驻的学习助手。

```bash
npm ci
npm run dev        # 开发；/api 代理到后端 4000（ASSISTANT_BACKEND_URL 可改）
npm run build      # 类型检查 + 生产构建
npm run lint
```

完整演示（后端 + 预置数据）请在仓库根目录看 [README](../README.md)，运行 `cd server && npm run demo`。

## 视图与路由

| 路由 | 视图 | 代码 |
| --- | --- | --- |
| `#/today` | 今天：今日计划（每条附理由）、目标卡、整理卡；`?layer=stats` 打开学习统计层 | `src/views/today/` |
| `#/panorama` | 全景：目标 → 主题 → 概念，掌握度亮度、缺口、下一步；可拖动、缩放的力导向星空 | `src/views/panorama/` |
| `#/star-dive/<topicId>/<conceptId?>` | 星图潜航：聚焦一颗星，主卡加环绕卡，六种知识形状，离星回忆 | `src/star-dive/` |
| `#/library/<itemId?>` | 资料：智能体的识别、归类、置信度、理由、撤销与修正 | `src/views/library/` |
| `#/notes/<topicId>?f=&h=` | 笔记：Obsidian 风格阅读器（双链、反链、大纲、KaTeX、mermaid、时间戳） | `src/views/notes/` |
| `#/graph` | 早期概念图原型（保留可达） | `src/App.tsx` |

## 关键模块

- **卡片模块系统** `src/star-dive/modules/`：`definition`、`compare_table`、`steps`、`param_demo`（滑块 + 实时曲线，表达式由安全的 DSL 计算）、`interactive` 等，由 `learn-adapter.ts` 把编译产物 `learn.json` 映射成卡片。
- **场景桥接** `src/assistant/context-store.ts`：当前视图、星、卡片和交互读数组成只读快照交给助手；提问时快照固定，切换星不会改变已发出问题的上下文。
- **学习助手** `src/assistant/ui/`：可拖动的桌宠形象加回答卡；前端工具 `focus_concept`、`open_card`、`close_card` 让助手操作星图；模型设置对话框。
- **记录客户端** `src/record/`：类型、HTTP 客户端、事件发件箱（离线重试，UUID 幂等）。

## 测试

在仓库根目录运行：

```bash
node --experimental-strip-types --test tests/*.test.mjs
```
