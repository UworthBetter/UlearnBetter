---
title: ch04 Stash 与合并策略
tags:
  - 类型/课程笔记
  - 课程/Git版本控制
  - 状态/待复习
章节: 官方章节 9–11（6:17–9:05）
created: 2026-11-07
---

# ch04 Stash 与合并策略

> [!info] 视频位置
> [6:17 Stashing](https://www.youtube.com/watch?v=HkdAHXoRtos&t=377s) · [7:12 Merging](https://www.youtube.com/watch?v=HkdAHXoRtos&t=432s) · [7:51 When to merge](https://www.youtube.com/watch?v=HkdAHXoRtos&t=471s)

## 🎯 本章目标
会用 `git stash` 保存半成品改动，理解合并的完整流程、冲突的处理策略，以及双向合并与 squash 合并的节奏。

## 🫗 Stash：把半成品先藏起来

`git stash` 会把当前所有改动保存起来（但**不提交**），同时把工作区恢复到干净状态；之后想继续干活时，可以用 `pop` 或 `apply` 把贮藏的改动恢复到当前工作目录（[6:18](https://www.youtube.com/watch?v=HkdAHXoRtos&t=378s)）。

作者的原话：

> [!quote] "Stashing is just a handy thing to know and an alternative to committing your code if you're not quite ready to do so."（贮藏是提交之外的一个便利选项——当代码还没准备好提交时用它。）（[6:38](https://www.youtube.com/watch?v=HkdAHXoRtos&t=398s)）

## 🔀 合并流程与冲突处理

**步骤**（视频演示的顺序）：

1. 在功能分支上完成开发后，切换回 `master` 分支。
2. 运行 `git merge <功能分支名>`，把功能分支上的最新提交合并进 master。
3. 合并完成后，功能分支和 master 指向同一个提交 ID（简单场景下的快进式合并，[6:58](https://www.youtube.com/watch?v=HkdAHXoRtos&t=418s)）。
4. 若双方改了同一行代码，Git 无法自动决定用哪个改动，就产生**合并冲突**——编辑器/IDE 会给出选项，例如「接受当前改动（accept current change）」「接受传入改动（accept incoming change）」（[7:20](https://www.youtube.com/watch?v=HkdAHXoRtos&t=440s)）。
5. 作者的建议：遇到冲突先**审阅**一下，很多时候直接**放弃合并（abort merge）**，然后手动修文件更稳妥（[7:40](https://www.youtube.com/watch?v=HkdAHXoRtos&t=460s)）。

> [!quote] 「做很多小提交是好习惯——修复 1 个文件的冲突，总比修复 100 个文件的冲突容易。」（[7:40](https://www.youtube.com/watch?v=HkdAHXoRtos&t=460s)）

## 🔄 双向合并与 squash 合并节奏

合并不只是「功能 → master」单向的。作者指出，长时间开发功能时，也要经常把 master **反向合并**回自己的功能分支（[7:51](https://www.youtube.com/watch?v=HkdAHXoRtos&t=471s)），因为 master 上可能有别人改了同一处代码，或者有会改变功能行为的破坏性变更。节奏建议：master 每次有变化就合并进来；如果是活跃仓库，**大概一天一次**也可以（以视频为准）。

**squash 合并**：功能分支上会积累很多对 master 而言无关紧要的提交（视频例子：功能分支领先 master 3 个提交，内容都是「添加无用 emoji」之类）。此时可以：

| 普通合并 | squash 合并 |
| --- | --- |
| 功能分支的所有提交都进入 master | 用 squash 标志把多个提交压成**一个提交**再合并 |
| master 历史杂乱 | master 历史保持简洁，但功能分支上的原始提交仍保留（[8:44](https://www.youtube.com/watch?v=HkdAHXoRtos&t=524s)） |

⚠️ 注意：squash 合并**不会自动改动 master 的 head 提交**，需要你自己再补一个提交（比如写上「merged in feature branch」）来完成合并（[8:44](https://www.youtube.com/watch?v=HkdAHXoRtos&t=524s)）。

## 💭 我的思考

-

## 🔗 相关链接
- 下一章：[[ch05 推送 GitHub 与开源协作]]
- 概念卡：[[贮藏 Stash]] · [[合并冲突]] · [[快进合并]]
- 实操参考：[[Git 提效与自救清单]] · [[00-Home]]
