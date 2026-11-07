import { useEffect, useRef, type RefObject } from 'react'
import { createStarDive, type SceneHandle } from './scene'
import type { StarDiveData } from './types'
import { learningSession } from '../assistant/context-store'

/** Mounts the Star Dive scene engine on `rootRef` for the component's lifetime. */
export function useStarDive(rootRef: RefObject<HTMLElement | null>, data: StarDiveData, initialFocus?: string | null) {
  const handle = useRef<SceneHandle | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const scene = createStarDive(root, data, {
      initialFocus, onContextChange: learningSession.updateScene,
    })
    handle.current = scene
    const unbind = learningSession.bindActions((action) => {
      if (action.type === 'open_card') return scene.openCard(action.conceptId, action.cardId)
      if (action.type === 'close_card') {
        scene.closeCard()
        return { ok: true, message: '已关闭卡片' }
      }
      if (!data.concepts.some((c) => c.id === action.conceptId)) return { ok: false, message: '概念不存在' }
      // The scene starts after document.fonts.ready; commands must not claim success before init.
      if (learningSession.getSnapshot().view !== 'star-dive') return { ok: false, message: '星图尚未就绪' }
      scene.focusStar(action.conceptId)
      return { ok: true, message: '已定位概念' }
    })
    const onSelection = () => {
      const selection = document.getSelection()
      const anchor = selection?.anchorNode
      const focus = selection?.focusNode
      const content = anchor?.parentElement?.closest('.p-body, .main-card .inner')
      if (content && root.contains(content) && focus && content.contains(focus)) {
        learningSession.selectText(selection?.toString() || '')
      }
    }
    document.addEventListener('selectionchange', onSelection)
    return () => {
      unbind()
      document.removeEventListener('selectionchange', onSelection)
      scene.destroy()
      learningSession.reset()
      if (handle.current === scene) handle.current = null
    }
  }, [rootRef, data, initialFocus])
  return handle
}
