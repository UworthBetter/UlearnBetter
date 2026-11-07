# 分支与工作目录

本轮集成完成后，`main` 是完整开发基线。合并包含星图、助手前后端、
离线笔记转换，以及笔记导入展示。真实模型验收和时间序列计算仍未完成，
本次合并不代表生产发布。

## 已集成的分支

以下分支均已包含在集成历史中，保留用于追溯和现有工具继续工作。

| 分支 | 工作目录 | 用途 |
| --- | --- | --- |
| `main` | `D:/haikesong2` | 完整开发基线 |
| `codex/learning-foundation` | `D:/haikesong2-worktrees/gpt-integration` | GPT 集成与修正 |
| `codex/assistant-backend` | `D:/haikesong2-worktrees/claude-backend` | Claude 后端交付 |
| `codex/assistant-ui` | `D:/haikesong2-worktrees/grok-ui` | Grok 界面交付 |
| `codex/notes-compiler` | `D:/haikesong2-worktrees/zcode-notes` | GLM 笔记转换交付 |
| `feat/star-dive-port` | 无 | 早期星图移植，已包含 |

## 下一轮开发

新任务从最新 `main` 建立 `codex/` 分支。继续使用旧任务分支时，先合入
最新 `main`，避免覆盖集成阶段修正。不要在其他工具的工作目录切换分支。
工具不再使用工作目录后，再统一移除目录与已合并分支。

本地浏览器测试记录 `.playwright-mcp/` 已忽略，不删除现有内容，也不提交。

## Sprint 2 integration

`codex/s2-integration` starts from local main `1fa4e0e`. C0 is
`98562d4b871d34e0459cb1d9ad7dee17b88a1641`. Deliveries were merged in order:

| Branch | Source | Integrated merge |
| --- | --- | --- |
| `codex/s2-notes` | `70ade72` | `8b75b07` |
| `origin/codex/s2-backend` | `2f64913` | `edceeec` |
| `codex/s2-ui` | `6157c72` | `11af2dd` |

Integration fixes are in `f3d624f`. All checks pass; acceptance 1–7 passes
with compiled synthetic notes and the real record API. Real-model acceptance
8–10 remains unverified. See [the delivery report](S2_INTEGRATION_HANDOFF.md).

The owner requested no merge to main and no push. Main stays at `1fa4e0e`;
no commits from this integration run were pushed. The fetched remote C0 and
backend branch remain unchanged. Other executors' worktrees stay intact.
