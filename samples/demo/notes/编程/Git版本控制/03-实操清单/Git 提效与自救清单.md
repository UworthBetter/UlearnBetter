---
title: Git 提效与自救清单
tags:
  - 类型/实操
  - 课程/Git版本控制
created: 2026-11-07
---

# 🛠️ Git 提效与自救清单

> [!info] 覆盖内容
> 主要来自视频二《13 Advanced (but useful) Git Techniques》（ch06–ch10），配合视频一的基础操作。所有命令请先在测试仓库演练。

## 1️⃣ 提效捷径：别名与快速提交
- [ ] 用 `git commit -am "消息"` 跳过单独的 `git add`，直接提交已跟踪文件的改动（验证：`git log` 中出现新提交，工作目录干净）
- [ ] 创建别名把常用命令缩短，例如把 add + commit 做成两字母命令（验证：`git config --list` 中能看到该别名，输入别名能正常提交）
- [ ] 忘了分支名时，用 `git checkout -` 直接回到上一个工作分支（验证：`git branch` 显示当前已切回原分支）

## 2️⃣ 修补与撤销
- [ ] 提交信息写错时，用 `git commit --amend -m "新消息"` 修补最近一次提交（验证：`git log` 中最新提交信息已更新）
- [ ] 漏加文件时，先 `git add <文件>` 再 `git commit --amend --no-edit` 并入上次提交（验证：`git show --stat` 中包含新文件）
- [ ] 已推送的错误提交用 `git revert <提交>` 撤销，生成反向提交而不篡改历史（验证：`git log` 出现一条 "Revert..." 提交，代码回到之前状态）

## 3️⃣ 命名 Stash 与日志排查
- [ ] 半成品改动用 `git stash save "名字"` 命名保存（验证：`git stash list` 中能看到带名字的条目）
- [ ] 恢复时用 `git stash list` 找到索引，再 `git stash apply <索引>` 取回（验证：`git status` 中改动重新出现）
- [ ] 日志难读时，用 `git log --graph --oneline --decorate` 查看分支连接关系（验证：输出为单行、带图形与装饰信息）
- [ ] 应用出 bug 时，先 `git bisect start`，标记当前坏提交（`git bisect bad`）与最后的好提交（`git bisect good <提交>`），逐个用 `git bisect good/bad` 二分定位坏提交（验证：bisect 输出指向具体提交哈希，结束用 `git bisect reset`）

## 4️⃣ 安全重置：让本地回到远程状态
- [ ] 先 `git fetch` 拉取远程最新代码但不合并（验证：`git status` 显示本地落后于远程）
- [ ] 用 `git reset --hard origin/<分支>` 把本地代码硬重置为远程状态（验证：`git diff origin/<分支>` 无差异）
- [ ] 残留的未跟踪文件/构建产物用 `git clean` 清除（验证：`git status` 中不再有 untracked 文件）

> [!warning] 避坑
> - `amend` 只适合**尚未推送**的提交；已推送后强行修改需 `git push --force`，会覆盖远程提交——若远程有你没有的提交将**永久丢失**，同事也可能受影响（作者原话提醒，慎用）
> - `git reset --hard` 会**永久丢失**本地未提交改动；`git clean` 会删掉未跟踪文件——两者执行前确认没有还想保留的东西
> - 直接删除隐藏的 `.git` 目录即可完全解除 Git 跟踪，但历史记录也随之消失，慎用
> - 改提交历史（amend/force push）之前，宁可先确认远程状态再动手

## 🔗 相关
[[ch06 快速提交与命令别名]] · [[ch07 修补与撤销提交]] · [[ch08 云端开发与 Stash 进阶]] · [[ch09 日志美化与历史排查]] · [[ch10 钩子、清理与快速切换]] · [[修补提交 Amend]] · [[撤销提交 Revert]] · [[二分排查 Bisect]] · [[贮藏 Stash]] · [[新仓库上手清单]] · [[00-Home]]
