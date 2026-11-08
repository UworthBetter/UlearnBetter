---
title: ch01 认识 Git 与初始化仓库
tags:
  - 类型/课程笔记
  - 课程/Git版本控制
  - 状态/待复习
章节: 官方章节 1–3（0:00–2:40）
created: 2026-11-07
---

# ch01 认识 Git 与初始化仓库

> [!info] 视频位置
> [0:00 Intro](https://www.youtube.com/watch?v=HkdAHXoRtos&t=0s) · [0:42 What is Git](https://www.youtube.com/watch?v=HkdAHXoRtos&t=42s) · [2:01 Initialize Git It](https://www.youtube.com/watch?v=HkdAHXoRtos&t=121s)

## 🎯 本章目标
明白 Git 作为版本控制系统为什么重要，会用 `git init` 初始化仓库，并认识初始化后的工作区状态。

## Git 是什么：代码的历史书

视频开篇指出，开发工具大多寿命有限、更新换代很快，但 Git 始终稳定存在，并“彻底改变了软件世界”——它本质上是==你代码的历史书==，而 GitHub 这样的服务则让开源软件对全世界开放（[0:06](https://www.youtube.com/watch?v=HkdAHXoRtos&t=6s)）。

> [!quote] 视频原话
> It's essentially a history book of your code.（它本质上就是你代码的一本历史书）（[0:28](https://www.youtube.com/watch?v=HkdAHXoRtos&t=28s)）

Git 的正式定义是**版本控制系统（version control system）**，拆开来说就是一套管理文件的系统。软件开发是一连串小里程碑——写代码、改一堆文件——项目在“混乱 ↔ 稳定”之间不断移动，Git 帮你追踪所有这些变化，并且：

- 可以创建多条**分支（branch）**，即多条可以走下去的路径，之后再把它们合并
- 这种机制促成了大型开发者群体之间的协作（[0:50](https://www.youtube.com/watch?v=HkdAHXoRtos&t=50s)）

本章中作者用一个要亲手构建的开源 Node.js 命令行小工具做演示——用来加密邮寄地址并提交到 GitHub 仓库，以便他给贡献者寄贴纸。工作目录里初始只有 `index.js` 和 `package.json` 两个文件（[1:10](https://www.youtube.com/watch?v=HkdAHXoRtos&t=110s)）。

## 步骤：初始化 Git 仓库

在 VS Code 里点击源代码管理（Source Control）图标时，提示 "no source control provider is registered"，说明需要先初始化 Git 让它开始追踪文件（[1:31](https://www.youtube.com/watch?v=HkdAHXoRtos&t=131s)）。视频给出了两条路：

| 方式 | 操作 | 作者建议 |
| --- | --- | --- |
| 命令行 | 运行 `git init` | 应该尽量把命令背下来 |
| VS Code 集成工具 | 用源代码管理面板操作 | 实际工作中往往更快，视频会两种都演示 |

具体步骤：

1. 在项目根目录运行 `git init`，会在当前工作目录初始化一个==空的 Git 仓库==（[1:51](https://www.youtube.com/watch?v=HkdAHXoRtos&t=151s)）。
2. 观察源代码管理面板：两个文件出现在 **Changes（变更）列表**里——它显示的是自上一次代码快照以来哪些文件发生了变化（[1:51](https://www.youtube.com/watch?v=HkdAHXoRtos&t=151s)）。
3. 识别文件状态图标：全新项目里这两个文件带 **U 图标**，表示 **untracked（未追踪）**，即在这个工作目录中 newly created（[2:12](https://www.youtube.com/watch?v=HkdAHXoRtos&t=132s)）。%%原文秒数对应 2:12，即 132s 处讲 U 图标%%

## 💡 两个 Pro Tips

> [!tip] Pro Tip 1：彻底卸载 Git 追踪
> `git init` 会创建一个**隐藏的 `.git` 目录**。想彻底反初始化、把 Git 从项目里移除，直接删掉这个目录即可——但==要小心操作==（[2:12](https://www.youtube.com/watch?v=HkdAHXoRtos&t=132s)）。

> [!tip] Pro Tip 2：安装 GitLens 插件
> 给 VS Code 装上 GitLens 插件，它会把各种有用的 Git 信息直接嵌入代码中，还提供一个额外面板，可以轻松浏览 Git 历史（[2:34](https://www.youtube.com/watch?v=HkdAHXoRtos&t=154s)）。

## 💭 我的思考

-

## 🔗 相关链接
- 下一章：[[ch02 忽略文件、暂存与提交]]
- 概念卡：[[提交 Commit]] · [[暂存区]] · [[分支 Branch]]
- 实操：[[新仓库上手清单]]
- 首页：[[00-Home]] · 📄 [[视频信息 · Git It How to use Git and Github]] · [[术语表]]
