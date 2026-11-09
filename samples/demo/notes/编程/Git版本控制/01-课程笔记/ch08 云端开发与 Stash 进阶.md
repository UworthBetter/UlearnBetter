---
title: ch08 云端开发与 Stash 进阶
tags:
  - 类型/课程笔记
  - 课程/Git版本控制
  - 状态/待复习
章节: 官方章节 7–9（2:47–4:27）
created: 2026-11-07
---

# ch08 云端开发与 Stash 进阶

> [!info] 视频位置
> [2:47 Codespaces](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=167s) · [3:21 Stash](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=201s) · [4:05 PC Master Branch](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=245s)

## 🎯 本章目标

看完这章，你应该能在没有自己电脑的情况下用浏览器或 GitHub Codespaces 开发仓库，用命名 stash 管理多份未完成的改动，并把默认分支改名为 `main`。

## 🌐 Codespaces：在浏览器里写代码

有时你需要改仓库，但手边没有自己的电脑——比如在奶奶家没带笔记本（[2:47](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=167s)）。视频给出两条路：

1. **按一下句号键**：在 GitHub 上打开目标仓库页面，直接按键盘上的 `.`（句号键），会"像魔法一样"弹出一个浏览器版 VS Code，可以编辑代码、提交 PR，几乎能做本地能做的一切（[2:47](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=167s)）
2. **需要终端时开 Codespace**：浏览器版 VS Code 唯一的限制是不能跑终端；如果确实要执行终端命令，可以在云端建一个 GitHub Codespace，获得完整版 VS Code 能力，而且"很可能比奶奶的电脑快得多"（[3:09](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=309s)）

> [!quote] 原话
> "…hit the period key on your keyboard and like magic it pulls up a browser-based version of VS Code."

## 📦 Stash 进阶：给改动起名字

**适用场景**：写了一些"差不多能用但还不能提交"的改动——它们会把其他东西弄坏，或者太糙了，还不想让朋友看见（[3:21](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=201s)）。

| 用法 | 命令 | 说明 |
| --- | --- | --- |
| 基础用法 | `git stash` → `git pop` | 把当前工作区改动存起来不提交，准备好时再放回代码（[3:30](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=330s)） |
| 命名保存 | `git stash save <名字>` | 给这份 stash 起名，方便日后引用 |
| 查看列表 | `git stash list` | 找回某份 stash 时先用这个列出所有条目 |
| 按索引恢复 | `git stash apply <索引>` | 用对应索引把那份改动应用回来（[3:52](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=392s)） |

> [!tip] 与上一章的衔接
> 本章演示了用 `git stash save` 加名字 + `git stash list` + `git stash apply <索引>` 管理多份改动，比 [[贮藏 Stash]] 基础篇的 `stash / pop` 一条龙更适合同时攒多份未完成工作。

**Stash 与 Codespace 的联动**：stash 只存在本地，所以在奶奶家基本用不了（"pretty much SOL"）；但如果在 GitHub Codespace 里工作，你的 stash 会保存在云端（[3:52](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=392s)）。

## 🌿 步骤：把默认分支改名为 main

视频借机做了一则"现代开发者公共服务通告"（[4:05](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=245s)）：Git 历史上默认分支叫 `master`，但 2020 年之后这个词已不再是首选叫法，改用 `main`（视频还开玩笑说可以用 mega 或 mucho……以免惹麻烦）。

1. 确认当前分支，执行 `git branch -m main`——用 `-m` 标志重命名分支
2. 也可以发挥创意，自己发明一个分支名

## 💭 我的思考

-

## 🔗 相关链接
- 下一章：[[ch09 日志美化与历史排查]]
- 概念卡：[[贮藏 Stash]] · [[分支 Branch]] · [[提交 Commit]]
- 基础篇：[[ch04 Stash 与合并策略]] · [[ch05 推送 GitHub 与开源协作]]
- 清单：[[Git 提效与自救清单]]
- 返回：[[00-Home]] · [[术语表]] · [[视频信息 · 13 Advanced (but useful) Git Techniques]]
