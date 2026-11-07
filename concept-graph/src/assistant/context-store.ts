import type { ActionResult, LearningAction, LearningActionHandler, LearningContext, LearningSceneContext } from './contracts.ts'

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

const emptyScene: LearningSceneContext = { view: 'none', topic: null, concept: null, card: null, interaction: null }

/** A small external store: no model calls and no DOM dependencies. */
export function createLearningSession() {
  let snapshot: LearningContext = freeze({
    ...emptyScene, schema: 'learning.context/0.1', revision: 0,
    capturedAt: new Date().toISOString(), selection: null,
  })
  const listeners = new Set<() => void>()
  let binding: { handler: LearningActionHandler } | null = null

  function publish(patch: Partial<LearningContext>) {
    snapshot = freeze(structuredClone({ ...snapshot, ...patch, revision: snapshot.revision + 1, capturedAt: new Date().toISOString() }))
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    capture: () => structuredClone(snapshot),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    updateScene(scene: LearningSceneContext) {
      const changed = snapshot.view !== scene.view || snapshot.topic?.id !== scene.topic?.id
        || snapshot.concept?.id !== scene.concept?.id || snapshot.card?.id !== scene.card?.id
      publish({ ...scene, ...(changed ? { selection: null } : {}) })
    },
    selectText(text: string) {
      const trimmed = text.trim().slice(0, 4000)
      if (trimmed === snapshot.selection?.text || (!trimmed && !snapshot.selection)) return
      publish({ selection: trimmed ? { text: trimmed, conceptId: snapshot.concept?.id ?? null, cardId: snapshot.card?.id ?? null } : null })
    },
    bindActions(handler: LearningActionHandler) {
      const owner = { handler }
      binding = owner
      // A stale scene's cleanup must not disconnect its replacement.
      return () => { if (binding === owner) binding = null }
    },
    async execute(action: LearningAction): Promise<ActionResult> {
      if (!action || !['focus_concept', 'open_card', 'close_card'].includes(action.type)) {
        return { ok: false, message: '不支持的学习操作' }
      }
      if (!binding) return { ok: false, message: '当前没有可操作的星图' }
      try { return await binding.handler(action) }
      catch { return { ok: false, message: '页面操作失败，请重试' } }
    },
    reset() { publish({ ...emptyScene, selection: null }) },
  }
}

export const learningSession = createLearningSession()
