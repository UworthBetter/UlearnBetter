---
title: ch05 推送 GitHub 与开源协作
tags:
  - 类型/课程笔记
  - 课程/Git版本控制
  - 状态/待复习
章节: 官方章节 12–15（9:05–12:19）
created: 2026-11-07
---

# ch05 推送 GitHub 与开源协作

> [!info] 视频位置
> [9:05 Push to Github](https://www.youtube.com/watch?v=HkdAHXoRtos&t=545s) · [9:30 Fork](https://www.youtube.com/watch?v=HkdAHXoRtos&t=570s) · [10:26 Mailing Address](https://www.youtube.com/watch?v=HkdAHXoRtos&t=626s) · [11:15 Pull Requests](https://www.youtube.com/watch?v=HkdAHXoRtos&t=675s)

## 🎯 本章目标

走通从 remote、push，到 fork、clone 再发起 Pull Request 的完整开源贡献流程，学会把自己的代码推上 GitHub、并参与别人的开源项目。

## 把本地仓库推上 GitHub

前面学的都是本地操作，现在把代码放到远程。流程很简单：先在 GitHub 上创建一个仓库，GitHub 会给出需要执行的命令（[9:06](https://www.youtube.com/watch?v=HkdAHXoRtos&t=546s)）：

```bash
git remote add origin <远程仓库地址>   # 把本地代码连接到远程仓库
git push                              # 真正把文件推送到远程仓库
```

执行后刷新页面，代码就已经出现在 GitHub 上了。作者原话："That was super easy."（[9:26](https://www.youtube.com/watch?v=HkdAHXoRtos&t=566s)）

- `git remote`：连接本地代码与远程仓库
- `git push`：把文件实际推送到远程仓库

## 开源贡献流程（步骤）

作者以"提交地址换免费贴纸"为例，演示了向任何开源项目贡献代码的典型模式（[9:46](https://www.youtube.com/watch?v=HkdAHXoRtos&t=586s)）：

1. **Fork**：把原项目复制一份到你自己的 GitHub 账号下（[9:46](https://www.youtube.com/watch?v=HkdAHXoRtos&t=586s)）
2. **Clone**：用 `git clone` 把你的 fork 复制到本地电脑，以便开始修改（[10:07](https://www.youtube.com/watch?v=HkdAHXoRtos&t=607s)）
3. **安装依赖并建分支**：在 VS Code 中打开项目，运行 `npm install` 安装依赖；然后 `git checkout -b <分支名>` 创建并切换到新分支（本例分支名为 my-sticker）（[10:07](https://www.youtube.com/watch?v=HkdAHXoRtos&t=607s)）
4. **做出修改**：运行项目提供的 `npm run address` 命令，输入邮寄信息，得到一个加密的 base64 字符串；在 stickers 目录下新建 `<你的GitHub用户名>.txt`，把字符串粘贴进去（[10:28](https://www.youtube.com/watch?v=HkdAHXoRtos&t=628s)）
5. **提交**：保存文件后 `git add` + `git commit`（提交信息自定）（[11:09](https://www.youtube.com/watch?v=HkdAHXoRtos&t=669s)）
6. **推送分支**：`git push origin <分支名>`，把分支推到你自己的 fork（[11:31](https://www.youtube.com/watch?v=HkdAHXoRtos&t=691s)）
7. **发起 Pull Request**：在 GitHub 页面上会出现创建新 Pull Request 的选项，用它把你的改动请求合并进原项目（[11:31](https://www.youtube.com/watch?v=HkdAHXoRtos&t=691s)）

> [!quote] Pull Request 的本质
> "A pull request is just like a merge, but it has the additional step of needing to pull the remote changes"——即"拉取我的远程改动，然后合并进 master 分支"。（[11:31](https://www.youtube.com/watch?v=HkdAHXoRtos&t=691s)）

## 隐私与安全：公开仓库里的加密地址

本章示例要把邮寄地址放进公开仓库，作者专门给出了安全说明（[10:49](https://www.youtube.com/watch?v=HkdAHXoRtos&t=649s)）：

- 地址用 **RSA 算法**加密：任何人可用公钥加密数据，但只有作者持有私钥能解密
- 私钥存在一个 U 盘上，活动结束后会销毁；暴力破解私钥"基本不可能"
- 作者仍提醒：除非有人物理窃取私钥，地址在公开仓库里才是安全的——先免责，再操作

> [!warning] 注意
> 这是作者 2018 年活动示例的做法（视频当时情形），涉及个人信息的场景请勿照搬到自己的公开仓库；以视频为准。

## 💭 我的思考

-

## 🔗 相关链接
- 下一章：[[ch06 快速提交与命令别名]]
- 概念卡：[[提交 Commit]] · [[分支 Branch]] · [[00-Home]]
- 实操清单：[[新仓库上手清单]]
