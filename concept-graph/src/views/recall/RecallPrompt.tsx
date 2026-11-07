import { useEffect } from 'react'
import type { RecallPromptProps } from '../../record/view-props.ts'
import '../views.css'

export default function RecallPrompt({ label, onResult }: RecallPromptProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onResult('skipped')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResult])

  return (
    <aside className="ub-recall ub-glass" aria-label="离星回忆">
      <p className="ub-eyebrow">离星回忆</p>
      <p className="q">离开「{label}」之前，还记得吗？</p>
      <button type="button" className="ub-opt" onClick={() => onResult('remembered')}>记得</button>
      <button type="button" className="ub-opt" onClick={() => onResult('forgot')}>忘了</button>
      <button type="button" className="ub-btn txt" onClick={() => onResult('skipped')}>跳过</button>
    </aside>
  )
}
