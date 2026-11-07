import { z } from 'zod'
import { useFrontendTool } from '@copilotkit/react-core/v2/headless'
import { learningSession } from '../context-store.ts'

function outcome(ok: boolean, message: string): string {
  return `${ok ? '成功' : '失败'}：${message}`
}

/** 把契约里的三个操作注册成 CopilotKit 前端工具。页面动作只走 learningSession.execute。 */
export function useLearningTools(): void {
  useFrontendTool({
    name: 'focus_concept',
    description: '聚焦一个已经存在的概念。conceptId 必须来自这一问的场景快照。无效 id 会失败，不要假装已经定位。',
    parameters: z.object({
      conceptId: z.string().describe('要聚焦的概念 id'),
    }),
    handler: async ({ conceptId }) => {
      const result = await learningSession.execute({ type: 'focus_concept', conceptId })
      return outcome(result.ok, result.message)
    },
  }, [])

  useFrontendTool({
    name: 'open_card',
    description: '聚焦概念并打开一张已经存在的卡片。id 必须来自这一问的场景快照。无效 id 会失败，不要假装卡片已经打开。',
    parameters: z.object({
      conceptId: z.string().describe('卡片所属概念 id'),
      cardId: z.string().describe('要打开的卡片 id'),
    }),
    handler: async ({ conceptId, cardId }) => {
      const result = await learningSession.execute({ type: 'open_card', conceptId, cardId })
      return outcome(result.ok, result.message)
    },
  }, [])

  useFrontendTool({
    name: 'close_card',
    description: '关闭当前展开的卡片，并保留概念焦点。没有参数。不要用它切换到另一个概念。',
    parameters: z.object({}),
    handler: async () => {
      const result = await learningSession.execute({ type: 'close_card' })
      return outcome(result.ok, result.message)
    },
  }, [])
}
