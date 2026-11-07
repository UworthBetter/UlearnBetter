---
title: 提交 Commit
tags:
  - 类型/概念卡
  - 状态/待复习
aliases:
  - commit
  - 快照
created: 2026-11-07
---

# 提交 Commit

> [!abstract] 一句话定义
> ==给整个项目拍一张带唯一 ID、不可篡改的快照，相当于代码历史书的一页。==

## 📌 是什么

- **快照本质**：每次 commit 都是对当前工作目录的一次快照，拥有自己的唯一 ID，任何篡改 Git 都会察觉，因此历史记录是可信的。[3:03](https://www.youtube.com/watch?v=HkdAHXoRtos&t=183s)
- **历史书比喻**：视频把 commit 比作"历史书中的一页"，整个 Git 历史就是由一页页 commit 组成的。[3:03](https://www.youtube.com/watch?v=HkdAHXoRtos&t=183s)
- **先暂存、再提交**：commit 只包含被暂存（staged）的文件，所以提交前需要先用 `git add` 挑选要进入这次快照的内容，见 [[暂存区]]。[3:24](https://www.youtube.com/watch?v=HkdAHXoRtos&t=204s)
- **提交信息很关键**：用 `git commit -m` 加描述性信息说明改了什么；视频还建议第一行写摘要、第二行写更详细的改动说明，甚至可用 emoji 装点提交信息。[4:06](https://www.youtube.com/watch?v=HkdAHXoRtos&t=246s)
- **小步提交原则**：作者强调"做很多小提交"，既能防止代码灾难性丢失，也让改动历史更容易阅读。[3:45](https://www.youtube.com/watch?v=HkdAHXoRtos&t=225s)

## 📌 执行顺序

1. 用 `git add` 暂存要提交的文件（可以加单个文件，也可以用 `.` 加入整个工作目录；VS Code 里点 + / - 按钮即可暂存或取消暂存）。[3:24](https://www.youtube.com/watch?v=HkdAHXoRtos&t=204s)
2. 如需反悔，用 `git reset` 取消暂存——千万别带 `--hard` 标志，否则不仅取消暂存还会永久删除文件。[3:45](https://www.youtube.com/watch?v=HkdAHXoRtos&t=225s)
3. 运行 `git commit -m "<描述信息>"`，为这次改动写上描述性消息。[4:06](https://www.youtube.com/watch?v=HkdAHXoRtos&t=246s)
4. （可选）用多行提交信息：第一行写摘要，第二行写详细说明。
5. 提交后暂存区清空、工作目录变干净，Git 会报告本次创建/修改/删除了哪些文件；可用 GitLens 插件浏览历史，逐行查看代码变化。[4:27](https://www.youtube.com/watch?v=HkdAHXoRtos&t=267s)

## 🧩 在视频/系统中的角色

出现在 **[[ch02 忽略文件、暂存与提交]]**。它承接在 [[忽略文件]]（挡住不该进版本库的文件）之后，与 [[暂存区]] 配合构成最基本的日常流程：`git add` → `git commit`。视频后续的所有高级技巧——修补、撤销、压缩、排查——都建立在 commit 这一不可篡改的快照之上。

## ⚖️ 优点与局限

| ✅ 优点 | ⚠️ 局限 |
| --- | --- |
| 带唯一 ID 且不可篡改，历史可信、可追溯 | 只记录被暂存的内容，忘记 `git add` 就会漏提交（以视频为准） |
| 频繁的小提交可防止代码灾难性丢失，也让改动更易读 | 提交写多了若无清晰的提交信息，历史反而难以阅读 |
| VS Code / GitLens 让暂存与历史浏览可视化 | `git reset --hard` 配合使用不当会永久删除文件，风险高 |

## 🔗 相关链接

- 章节：[[ch02 忽略文件、暂存与提交]]
- 相关：[[暂存区]] · [[修补提交 Amend]] · [[撤销提交 Revert]] · [[变基与压缩]]

## 💭 我的思考

-
