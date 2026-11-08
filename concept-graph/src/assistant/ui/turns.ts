import { contentToText, type Message } from '@ag-ui/core'
import type { LearningContext } from '../contracts.ts'

export interface ToolView {
  id: string
  name: string
  result: string | null
}

export interface TurnView {
  id: string
  question: string
  snapshot: LearningContext | null
  answers: string[]
  tools: ToolView[]
  error: string | null
  stopped: boolean
}

export interface TurnMeta {
  snapshot: LearningContext
  error: string | null
  stopped: boolean
}

export interface OutgoingQuestion {
  id: string
  content: string
}

function blankTurn(id: string, question: string, meta: TurnMeta | undefined): TurnView {
  return {
    id,
    question,
    snapshot: meta?.snapshot ?? null,
    answers: [],
    tools: [],
    error: meta?.error ?? null,
    stopped: meta?.stopped ?? false,
  }
}

/** 把代理消息按用户问题分组。工具结果跟在对应的调用后面，不另起一问。 */
export function groupAgentTurns(
  messages: readonly Message[],
  meta: Readonly<Record<string, TurnMeta>>,
  outgoing: readonly OutgoingQuestion[],
): TurnView[] {
  const views: TurnView[] = []
  let current: TurnView | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      if (current) views.push(current)
      current = blankTurn(message.id, contentToText(message.content), meta[message.id])
      continue
    }
    if (!current) continue
    if (message.role === 'assistant') {
      const text = contentToText(message.content)
      if (text) current.answers.push(text)
      for (const call of message.toolCalls ?? []) {
        current.tools.push({ id: call.id, name: call.function.name, result: null })
      }
      continue
    }
    if (message.role === 'tool') {
      const text = contentToText(message.content)
      const tool = current.tools.find((item) => item.id === message.toolCallId)
      if (tool) tool.result = text
      else current.tools.push({ id: message.toolCallId, name: 'tool', result: text })
    }
  }
  if (current) views.push(current)

  for (const item of outgoing) {
    if (views.some((view) => view.id === item.id)) continue
    views.push(blankTurn(item.id, item.content, meta[item.id]))
  }
  return views
}
