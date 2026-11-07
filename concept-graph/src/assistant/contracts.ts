/** Provider-independent context shared by the scene, assistant UI, and backend. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface EvidenceRef {
  sourceId: string
  url?: string
  startSec?: number
  endSec?: number
  note?: string
}

export interface CardSummary { id: string; title: string; type: string }

export interface LearningContext {
  schema: 'learning.context/0.1'
  revision: number
  capturedAt: string
  view: 'none' | 'graph' | 'star-dive'
  topic: { id: string; title: string } | null
  concept: { id: string; label: string; summary: string; relatedIds: string[]; cards: CardSummary[] } | null
  card: (CardSummary & { content: JsonValue; evidence: EvidenceRef[] }) | null
  selection: { text: string; conceptId: string | null; cardId: string | null } | null
  interaction: { parameters: Record<string, number | string | boolean>; readouts: Record<string, number | string | boolean> } | null
}

export type LearningSceneContext = Pick<LearningContext, 'view' | 'topic' | 'concept' | 'card' | 'interaction'>

export type LearningAction =
  | { type: 'focus_concept'; conceptId: string }
  | { type: 'open_card'; conceptId: string; cardId: string }
  | { type: 'close_card' }

export interface ActionResult { ok: boolean; message: string }
export type LearningActionHandler = (action: LearningAction) => Promise<ActionResult> | ActionResult
