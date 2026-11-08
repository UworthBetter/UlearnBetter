---
title: 修补提交 Amend
tags:
  - 类型/概念卡
  - 状态/待复习
aliases:
  - git commit --amend
  - amend
created: 2026-11-07
---

# 修补提交 Amend

> [!abstract] 一句话定义
> ==用 `--amend` 直接修改最近一次提交的信息或补交漏掉的文件，不必新建提交。==

## 📌 是什么

- 当你在最近一次提交信息里打错了字，不需要 reset 后重新提交——在提交命令后面加上 `--amend` 标志并附带新信息，就会直接更新最新那次提交（[1:39](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=99s)）。
- 如果忘了把某些文件加入（stage）最近一次提交，也可以先用 `git add` 暂存这些文件，再用 amend 标志把它们补进上一次提交（[1:39](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=99s)）。
- 补文件时若想保留原来的提交信息，再加上 `--no-edit` 标志即可（[2:00](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=120s)）。
- ==关键前提==：amend 只适合在代码**尚未推送到远程仓库**时使用（[2:00](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=120s)）。
- 如果已经推送了还想 amend，视频警告除非你“喜欢活得危险”，否则别用 `git push --force` 强推：它会用本地状态覆盖远程提交，且若远程分支上有你没有的提交，那些提交会**永久丢失**，同事也不会高兴（[2:00](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=120s)）。

## 🧩 在视频/系统中的角色

属于“撤销与修复”工具组，出现在 [[ch07 修补与撤销提交]]（[1:39](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=99s) 起）。视频中它承担“修正小失误”的职责：提交信息打错、漏 stage 文件这类刚发生的小问题，用 amend 就地修好、保持历史干净；而对于已推送到远程、需要撤销的错误代码，则换用 [[撤销提交 Revert]] 更安全。

## 📌 执行顺序

1. 发现最近一次提交有 typo 或漏了文件。
2. （补文件时）用 `git add` 把遗漏的文件加入暂存区。
3. 执行 `git commit --amend` 并附上新提交信息；若想沿用原信息，加 `--no-edit`。
4. 确认代码**尚未推送**到远程仓库。
5. 若已推送且坚持修改，只能 `git push --force` 强推——先确认远程没有你缺少的提交，否则会永久丢失（不推荐，以视频为准）。

## ⚖️ 优点与局限

| ✅ 优点 | ⚠️ 局限 |
| --- | --- |
| 直接更新最新提交，不必 reset 后新建提交，历史保持干净 | 只能修改**最近一次**提交，对更早的提交无能为力 |
| 既能改提交信息，也能补交漏掉/漏 stage 的文件，加 `--no-edit` 还可沿用原信息 | 已推送到远程后再 amend 需要 force push，会覆盖远程提交；远程上你没有的提交会永久丢失，影响协作（[2:00](https://www.youtube.com/watch?v=ecK3EnyGD8o&t=120s)） |

## 🔗 相关链接

- 章节：[[ch07 修补与撤销提交]]
- 相关：[[提交 Commit]] · [[暂存区]] · [[撤销提交 Revert]] · [[Git 提效与自救清单]]

## 💭 我的思考

-
