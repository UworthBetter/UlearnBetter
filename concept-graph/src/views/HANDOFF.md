# 视图交接

这三个视图、调整层、回忆条和 `#/dev/views` 预览只消费 `props.client`。跳转只调用 `navigate` / `openAdjust`。场景只通过 `reportScene` 上报。

## 需要外壳做的

- 顶栏「今天 / 全景 / 资料」和待确认紫点不在视图里。视图靠内容点击进入统计、潜航、资料和全景。请外壳画这根顶栏，紫点用场景里的 `pendingCount`。
- 全景摘要栏宽度是 `--ub-rail-width`。现在由 `PanoramaView` 在挂载时写到 `documentElement`（332px），卸载时清掉。外壳接手后，请改由外壳在全景路由上设置，并删掉视图里的这段写入。
- `Root` 已经挂了 `GlobalAssistant`，但没有传入 `record`。请传同一个 `client`、`navigate`、`openAdjust`。不传时，归类卡、想法和视频链接都不会写入。
- 潜航时间轴请读取 `--ub-agent-bar-height`。这个变量由助手栏写入。

## 数据是现算的

- 今天卡片上的时长和时间戳，只有对得上同主题的 `visit` 事件才显示。`TodayEntry` 本身没有这两项。
- 统计里「按主题的回忆正确率」不在 `Stats` 上。视图用 `listEvents` 里的 `recall` 现算。后端以后若给出字段，再改成读字段。
- `getPanorama(goalId)` 的 mock 仍返回整张图。全景视图会再按 `goalId` 收窄，所以只有一个目标时不画星云分区。

## 本轮不做

- 文章和 PDF 只占筛选里的 0，没有真实导入。
- 「打开原笔记」只显示相对路径，不打开本机文件。
- 拖入文件夹不解析。助手栏会提示走命令行编译。
- 预览页自己 `createMockRecordClient()`，不改地址栏，也不再挂第二个助手。回忆预览只显示选择，不写学习事件。
