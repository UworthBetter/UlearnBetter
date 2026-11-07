---
title: 贮藏 Stash
tags:
  - 类型/概念卡
  - 状态/待复习
aliases:
  - git stash
  - stash pop
  - stash apply
created: 2026-11-07
---

# 贮藏 Stash

> [!abstract] 一句话定义
> ==把未完成的改动临时收起而不提交，之后用 pop 或 apply 取回继续干活。==

## 📌 是什么

- **贮藏（Stash）** 是 Git 提供的临时存取机制：把当前工作目录的改动“收起来”，工作区立即回到干净状态，之后想继续时再取回（[6:18](https://www.youtube.com/watch?v=HkdAHXoRtos&t=378s)）。
- 它是**“暂不提交”的替代方案**：当改动还不能提交（比如功能没写完、代码很乱、会把项目弄坏）时，用 stash 而不是硬着头皮 commit（[6:38](https://www.youtube.com/watch?v=HkdAHXoRtos&t=398s)）。
- 典型场景：改动“差不多能跑但还差点意思”，或代码太粗糙还不想让同事看到（[3:09](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=189s)）。
- 取回时既可以用 `git stash pop`（取出并删除贮藏记录），也可以用 `git stash apply`（应用但保留记录），二者都把改动还原到当前工作目录（[6:18](https://www.youtube.com/watch?v=HkdAHXoRtos&t=378s)）。
- 常用变体：`git stash save <名字>` 给贮藏命名，`git stash list` 列出所有贮藏，再用 `git stash apply <索引>` 取回指定那一份（[3:30](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=210s)）。

## 🧩 在视频/系统中的角色

Stash 在两处登场：

- **ch04 Stash 与合并策略**：作为基础命令介绍，说明它是“不提交代码的另一种选择”，先收起改动、清理工作区，再去处理分支合并等操作。
- **ch08 云端开发与 Stash 进阶**：作为作者“最喜欢的 Git 命令”之一，讲进阶用法（命名保存、list + apply 按索引取回），并提到一个限制——本地 stash 只存在本机，想在别处（如“奶奶家”的电脑）用，需要借助 GitHub Codespace，贮藏才会保存在云端（[3:52](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=232s)）。

它在整个 Git 工作流中的职责：充当工作区与提交之间的“临时停车场”，让你能随时切换任务而不弄丢半成品改动。

## 📌 执行顺序

1. 改动写到一半但不能提交时，运行 `git stash`，改动被收起、工作区变干净。
2. 去干别的事（切换分支、处理紧急任务等）。
3. 回来想继续时，简单场景直接 `git stash pop` 取回改动。
4. 多份贮藏时，先 `git stash save <名字>` 命名保存，之后 `git stash list` 查看列表。
5. 用 `git stash apply <索引>` 取回对应那份改动继续干活。

## ⚖️ 优点与局限

| ✅ 优点 | ⚠️ 局限 |
| --- | --- |
| 不必为了切任务而制造一个不成熟的提交，改动依然保留 | 贮藏只存在本地仓库，换台电脑（如没有带笔记本出门）就取不到 |
| 操作极简：`git stash` 收起、`git stash pop` 取回，两步搞定 | 贮藏多了容易忘记每一份是什么内容，需要 `stash save` 命名 + `stash list` 来管理 |
| 可通过 Codespace 让贮藏保存在云端，跨设备继续工作 | apply 与 pop 行为不同（是否删除记录），用错可能造成重复或遗漏，以视频为准 |

## 🔗 相关链接

- 章节：[[ch04 Stash 与合并策略]] · [[ch08 云端开发与 Stash 进阶]]
- 相关：[[提交 Commit]] · [[暂存区]] · [[分支 Branch]]
- 清单：[[Git 提效与自救清单]]

## 💭 我的思考

-
