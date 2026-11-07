import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { clampPetPosition, PET_MOTIONS, type PetMotion, type PetRect } from './pet-state.ts'
import './pet.css'

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/pet/`
const POSTER = `${ASSET_ROOT}standing.png`

interface PetLauncherProps {
  open: boolean
  replyVisible?: boolean
  motion: PetMotion
  completionId: string | null
  scene: string
  demoMode: boolean
  launcherRef: RefObject<HTMLButtonElement | null>
  onToggle: () => void
  onRectChange?: (rect: PetRect) => void
}

interface Drag {
  pointerId: number
  startX: number
  startY: number
  left: number
  top: number
  moved: boolean
}

export function PetLauncher({ open, replyVisible = open, motion, completionId, scene, demoMode, launcherRef, onToggle, onRectChange }: PetLauncherProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const frameRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [temporary, setTemporary] = useState<PetMotion | null>(null)
  const [menu, setMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; right?: 'auto'; top?: number | 'auto'; bottom?: number | 'auto' } | null>(null)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [failedAssets, setFailedAssets] = useState<Set<string>>(() => new Set())
  const [settledId, setSettledId] = useState<string | null>(null)
  const [readId, setReadId] = useState<string | null>(null)
  const [greeting, setGreeting] = useState(false)
  // A completed reply visible in the history or answer card is already read.
  if (replyVisible && completionId !== null && readId !== completionId) setReadId(completionId)
  const unread = completionId !== null && completionId !== readId && !replyVisible
  const freshReply = completionId !== null && completionId !== settledId
  const replyMotion = unread ? 'new-message' : 'task-complete'
  const current = freshReply && unread ? 'new-message' : dragging ? 'drag' : temporary ?? (freshReply ? replyMotion : motion)
  const animated = !paused && !reducedMotion
  const source = animated ? `${ASSET_ROOT}integrated-v1/${current}.png` : POSTER
  const imageSource = failedAssets.has(source) ? POSTER : source
  const label = unread ? PET_MOTIONS['new-message'].label : greeting ? PET_MOTIONS.click.label : PET_MOTIONS[current].label

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!completionId || completionId === settledId) return
    const timer = window.setTimeout(() => setSettledId(completionId), PET_MOTIONS[replyMotion].duration)
    return () => window.clearTimeout(timer)
  }, [completionId, settledId, replyMotion])

  useEffect(() => {
    if (!temporary || dragging) return
    const timer = window.setTimeout(() => setTemporary(null), PET_MOTIONS[temporary].duration)
    return () => window.clearTimeout(timer)
  }, [temporary, dragging])

  useEffect(() => {
    if (!greeting) return
    const timer = window.setTimeout(() => setGreeting(false), PET_MOTIONS.click.duration)
    return () => window.clearTimeout(timer)
  }, [greeting])

  // Report the on-screen rect so the chat panel can follow the pet when it is dragged.
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const report = () => {
      const rect = node.getBoundingClientRect()
      onRectChange?.({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
    report()
    window.addEventListener('resize', report)
    return () => window.removeEventListener('resize', report)
  }, [onRectChange, position, open])

  useEffect(() => {
    function constrain() {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds) return
      // Keep the default CSS placement responsive; only constrain a manually moved pet.
      const style = getComputedStyle(containerRef.current!)
      const width = bounds.width || Number.parseFloat(style.width)
      const height = bounds.height || Number.parseFloat(style.height)
      setPosition((currentPosition) => currentPosition
        ? clampPetPosition(currentPosition.x, currentPosition.y, width, height, window.innerWidth, window.innerHeight)
        : null)
    }
    window.addEventListener('resize', constrain)
    return () => {
      window.removeEventListener('resize', constrain)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    if (!menu) return
    const first = menuRef.current?.querySelector('button')
    first?.focus()
    function dismiss(event: globalThis.PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setMenu(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setMenu(false)
      launcherRef.current?.focus()
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', escape, true)
    }
  }, [menu, launcherRef])

  function placeMenu() {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 250
    // Same rule as the chat panel: centred over the pet, clamped inside the viewport.
    const left = Math.min(
      Math.max(16, rect.x + rect.width / 2 - width / 2),
      Math.max(16, window.innerWidth - width - 16),
    )
    // Flip below the pet when there is not enough room above it.
    setMenuPos(rect.top > 320
      ? { left, right: 'auto', bottom: window.innerHeight - rect.top + 10, top: 'auto' }
      : { left, right: 'auto', top: rect.bottom + 10, bottom: 'auto' })
  }

  function toggleMenu() {
    const next = !menu
    setMenu(next)
    if (next) placeMenu()
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    setMenu(false)
    suppressClickRef.current = false
    const bounds = containerRef.current!.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.x, top: bounds.y, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 7) return
    drag.moved = true
    suppressClickRef.current = true
    setDragging(true)
    const bounds = containerRef.current!.getBoundingClientRect()
    const next = clampPetPosition(drag.left + dx, drag.top + dy, bounds.width, bounds.height, window.innerWidth, window.innerHeight)
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    frameRef.current = window.requestAnimationFrame(() => { setPosition(next); frameRef.current = null })
  }

  function endDrag() {
    const drag = dragRef.current
    if (!drag) return
    if (drag.moved) setTemporary('drag')
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div ref={containerRef} className="ula-pet" data-open={open} data-dragging={dragging} data-motion={current}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
      data-testid="assistant-pet">
      {!menu && <div className="ula-pet-bubble" aria-hidden="true">
        <span>{demoMode ? '演示 · ' : ''}{label}</span>
        <small>{scene}</small>
      </div>}
      <button ref={launcherRef} type="button" className="ula-launcher ula-pet-launcher"
        aria-label={`${open ? '关闭' : '打开'}学习助手${unread ? '，有新回答' : ''}`}
        aria-expanded={open} aria-controls="ula-panel" data-testid="assistant-launcher"
        title={open ? '点击收起学习助手；拖动调整位置；右键查看桌宠设置' : '点击打开学习助手；拖动调整位置；右键查看桌宠设置'}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag}
        onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onClick={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return }
          setTemporary('click')
          setGreeting(true)
          setMenu(false)
          onToggle()
        }}
        onContextMenu={(event) => { event.preventDefault(); toggleMenu() }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            toggleMenu()
          }
        }}>
        {!failedAssets.has(POSTER) ? <img src={imageSource} alt="" width="384" height="341" draggable={false}
          onError={() => setFailedAssets((currentAssets) => new Set(currentAssets).add(imageSource))} />
          : <span className="ula-pet-fallback">学习助手</span>}
        {unread && <span className="ula-pet-unread" aria-hidden="true" />}
      </button>
      <span className="ula-pet-announcement" role="status">{unread ? '学习助手有新回答' : ''}</span>
      {menu && <div ref={menuRef} className="ula-pet-menu" role="group" aria-label="桌宠设置" style={menuPos ?? undefined}>
        <button type="button" onClick={() => { setMenu(false); onToggle() }}>{open ? '收起学习助手' : '打开学习助手'}</button>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? '恢复动画' : '暂停动画'}</button>
        {reducedMotion && <p>已跟随系统减少动态效果</p>}
        <label>动作预览
          <select value="" onChange={(event) => { setTemporary(event.target.value as PetMotion); setMenu(false); launcherRef.current?.focus() }}>
            <option value="" disabled>选择动作（仅预览）</option>
            {Object.entries(PET_MOTIONS).map(([id, definition]) => <option key={id} value={id}>{definition.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setPosition(null); setMenu(false); launcherRef.current?.focus() }}>回到右下角</button>
        <p>点击提问 · 拖动换位置</p>
      </div>}
    </div>
  )
}
