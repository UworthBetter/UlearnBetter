---
title: Sigmoid 函数
tags:
  - 类型/概念卡
  - 状态/待复习
aliases:
  - Sigmoid
  - Logistic Curve
created: 2026-11-07
---

# Sigmoid 函数

> [!abstract] 一句话定义
> ==把任意实数压缩到 0–1 之间的 S 形曲线，早期网络用它做激活函数，如今较少使用。==

## 📌 是什么

- 也叫 logistic curve（逻辑曲线），作用是把整个实数轴“挤压”进 0 与 1 之间：非常负的输入趋近 0，正的输入趋近 1，在输入 0 附近平稳递增（[10:28](https://www.youtube.com/watch?v=aircAruvnKk&t=628s)）
- 公式为 $$\sigma(x)=\frac{1}{1+e^{-x}}$$（公式为标准形式，视频中未展开写出，以视频为准）
- 在网络中的用途：加权和可能算出任意大小的数字，但这个网络的激活值要求在 0–1 之间，所以把加权和“泵入”Sigmoid 这类函数做 squishification（挤压）处理（[9:59](https://www.youtube.com/watch?v=aircAruvnKk&t=599s)）
- 神经元的激活值因此大致衡量了“相关加权和有多正”（[10:52](https://www.youtube.com/watch?v=aircAruvnKk&t=652s)）
- 早期网络采用它，部分动机是生物类比：神经元要么不激活、要么激活（[17:19](https://www.youtube.com/watch?v=aircAruvnKk&t=1039s)）

## 📌 执行顺序

1. 前一层各神经元的激活值分别乘上对应的权重，求加权和
2. 在加权和上加上偏置（bias），例如加上 -10，表示希望神经元默认不激活（[11:20](https://www.youtube.com/watch?v=aircAruvnKk&t=680s)）
3. 把结果代入 Sigmoid 函数，挤压到 0–1 之间
4. 得到的值就是该神经元的激活值，作为下一层的输入

## 🧩 在视频/系统中的角色

- 出现于 ch03 边缘检测的期望：在讲解“第二层某个神经元如何检测小区域内的边缘”时，加权和之后需要 Sigmoid 把结果压到 0–1，成为激活值（[10:28](https://www.youtube.com/watch?v=aircAruvnKk&t=628s)）
- 出现于 ch06 结语与激活函数：与嘉宾 Lisha Li 讨论其历史地位——早期网络用它配合“神经元激活/不激活”的生物类比，但现代网络很少再用 Sigmoid，普遍改用 [[ReLU]]，因为后者在实践中更容易训练，尤其在非常深的网络中（[17:19](https://www.youtube.com/watch?v=aircAruvnKk&t=1039s)、[18:15](https://www.youtube.com/watch?v=aircAruvnKk&t=1095s)）

## ⚖️ 优点与局限

| ✅ 优点 | ⚠️ 局限 |
| --- | --- |
| 把任意加权和平滑压到 0–1，与“激活值在 0–1 之间”的网络设定吻合（[9:59](https://www.youtube.com/watch?v=aircAruvnKk&t=599s)） | 使用 Sigmoid 的网络很难训练（至少某段时期如此）（[18:15](https://www.youtube.com/watch?v=aircAruvnKk&t=1095s)） |
| 有生物类比：对应神经元“不激活 / 激活”两种状态（[17:19](https://www.youtube.com/watch?v=aircAruvnKk&t=1039s)） | 现代网络很少使用，已被 ReLU 取代；ReLU 在极深网络中训练效果更好（[17:47](https://www.youtube.com/watch?v=aircAruvnKk&t=1067s)） |

## 🔗 相关链接

- 章节：[[ch03 边缘检测的期望]] · [[ch06 结语与激活函数]]
- 相关：[[ReLU]] · [[权重与偏置]] · [[神经元与激活]]

## 💭 我的思考

-
