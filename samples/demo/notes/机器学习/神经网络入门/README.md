---
title: 使用说明
tags:
  - MOC/说明
created: 2026-11-07
---

# 📓 神经网络入门 · 学习笔记库

基于 YouTube 视频 **《But what is a neural network? | Deep learning chapter 1》《Gradient descent, how neural networks learn》《Backpropagation, intuitively》**（3Blue1Brown，共 3 集，总时长约 52 分钟）整理的 Obsidian 笔记库。

> [!important] 数据来源声明
> 本库基于 YouTube 官方元数据与官方章节 + 平台自动字幕（video_ingest.py 抓取，2026-11-07 核对）整理；笔记已整理为中文。
> 笔记由模型 glm-5.3-flash 按本技能模板生成，细节以视频为准。

> [!tip] 如何打开本库
> 1. 打开 Obsidian → 左下角 **管理仓库（Manage vaults）**
> 2. **打开文件夹作为仓库（Open folder as vault）** → 选择本文件夹
> 3. 从 [[00-Home]] 开始

## 目录结构

| 文件夹 | 用途 |
| --- | --- |
| 根目录（本页与 [[00-Home]]） | 使用说明与学习主页（MOC） |
| `01-课程笔记` | 按官方章节整理的 12 篇章节笔记（ch01–ch12），带时间戳跳转 |
| `02-概念卡` | 原子概念卡：神经元、梯度下降、反向传播、MNIST 等，一页一卡，互相 wikilink |
| `03-实操清单` | 可打勾的动手练习：[[手算一个神经元的前向传播]]、[[清点网络参数并做结构实验]] |
| `90-资源` | 视频信息与时间戳、[[术语表]] |
| `Templates` | 概念卡模板，供日后自己添加卡片 |

## 三集内容总览

| # | 视频 | 主题 | 信息页 |
| --- | --- | --- | --- |
| 1 | But what is a neural network?（18:40） | 神经元、分层结构、权重与偏置的直觉 | [[视频信息 · But what is a neural network]] |
| 2 | Gradient descent, how neural networks learn（20:33） | 训练数据、代价函数、梯度下降 | [[视频信息 · Gradient descent, how neural networks le]] |
| 3 | Backpropagation, intuitively（12:47） | 反向传播直觉与随机梯度下降 | [[视频信息 · Backpropagation, intuitively]] |

## 使用建议

- 第一遍：按 [[00-Home]] 学习路线读章节笔记（ch01 → ch12），配合时间戳看视频
- 第二遍：脱离视频，用概念卡自测（如 [[梯度下降]]、[[反向传播]]）
- 动手：跟 [[手算一个神经元的前向传播]] 与 [[清点网络参数并做结构实验]] 执行

## 相关链接

- 🎬 [第 1 集](https://www.youtube.com/watch?v=aircAruvnKk) · [第 2 集](https://www.youtube.com/watch?v=IHZwWFHWa-w) · [第 3 集](https://www.youtube.com/watch?v=Ilg3gGewQ5U)
- 📄 [[视频信息 · But what is a neural network]] · [[视频信息 · Gradient descent, how neural networks le]] · [[视频信息 · Backpropagation, intuitively]] · [[术语表]]
