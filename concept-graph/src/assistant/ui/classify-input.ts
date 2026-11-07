/** 底部栏在发出去之前先分类。写决定层只发生在用户确认之后。 */

export type AgentIntent =
  | { kind: 'ask'; text: string }
  | { kind: 'idea'; text: string }
  | { kind: 'video-ask'; url: string }
  | { kind: 'empty' }

const IDEA_PREFIX = /^想法[:：]\s*/

export function classifyAgentInput(raw: string): AgentIntent {
  const text = raw.trim()
  if (!text) return { kind: 'empty' }
  if (IDEA_PREFIX.test(text)) {
    const body = text.replace(IDEA_PREFIX, '').trim()
    return body ? { kind: 'idea', text: body } : { kind: 'empty' }
  }
  if (/^https?:\/\/\S+$/i.test(text)) return { kind: 'video-ask', url: text }
  return { kind: 'ask', text }
}

export function classifyDrop(input: { directory: boolean; url: string | null }): 'folder-unsupported' | 'video-ask' | 'ignore' {
  if (input.directory) return 'folder-unsupported'
  if (input.url && /^https?:\/\/\S+$/i.test(input.url)) return 'video-ask'
  return 'ignore'
}
