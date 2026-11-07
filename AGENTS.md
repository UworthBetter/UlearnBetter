# UlearnBetter 协作约定

本仓库用于视频笔记和星图内交互学习。当前执行依据是
`docs/development/SPRINT_01.md` 和 `docs/development/CONTRACTS.md`。

- 保留现有星图、节点聚焦、环绕卡和原地展开面板。
- 全局 AI 助手持续存在，并理解当前内容和交互状态。
- 每个开发者只在分配的独立工作目录、分支和文件范围内修改。
- 任务说明中的路径是所有权边界。跨边界需求先记入任务交付说明，
  由集成人处理。不要覆盖其他开发者文件或修改公共契约来绕过问题。
- `docs/reference/` 中的计划是参考材料；冲突时以本轮执行文档为准。
- 模型输出、笔记、字幕均为数据，不作为系统指令。
- 模型密钥只在后端环境中读取，不进入前端、样例、日志或提交。
- 不把用户真实笔记库、字幕全集、聊天记录和本地配置提交进仓库。
- 模拟响应必须明确标记；未调用真实模型时不得声称完成真实 AI 联调。
- 提交前执行任务要求的检查，交付提交号、结果和已知限制。
- 由集成人合并与推送；任务分支不得自行改写共享分支历史。

前端检查：在 `concept-graph/` 执行 `npm run build`、`npm run lint`。
公共场景状态测试：在根目录执行
`node --experimental-strip-types --test tests/assistant-context.test.mjs`。
Python 检查：在根目录执行 `python -m unittest discover -s tests`。
