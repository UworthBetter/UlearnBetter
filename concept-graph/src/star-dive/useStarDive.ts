import { useEffect, useRef, type RefObject } from 'react'
import { createStarDive, type SceneHandle } from './scene'
import type { StarDiveData } from './types'

/** Mounts the Star Dive scene engine on `rootRef` for the component's lifetime. */
export function useStarDive(rootRef: RefObject<HTMLElement | null>, data: StarDiveData, initialFocus?: string | null) {
  const handle = useRef<SceneHandle | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const scene = createStarDive(root, data, { initialFocus })
    handle.current = scene
    return () => {
      scene.destroy()
      if (handle.current === scene) handle.current = null
    }
  }, [rootRef, data, initialFocus])
  return handle
}
