import type { MasteryBarProps } from '../../record/view-props.ts'
import '../views.css'

const TEXT = ['还没学', '看过', '回忆过', '已掌握'] as const

export default function MasteryBar({ level, due }: MasteryBarProps) {
  return (
    <div className="ub-mastery" aria-label={`掌握 ${level}/3${due ? `，${due} 到期` : ''}`}>
      {[0, 1, 2, 3].map((step) => <i key={step} className={step < level ? 'on' : undefined} />)}
      <span className="ub-muted">{TEXT[level]}{due ? ` · ${due.slice(0, 10)} 到期` : ''}</span>
    </div>
  )
}
