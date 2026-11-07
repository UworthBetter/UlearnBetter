import type { Concept } from '../data/concepts'
import { statusColor } from '../lib/paint'

const STATUS_LABEL = {
  unlearned: '未掌握',
  learning: '学习中',
  mastered: '已掌握',
} as const

export default function ConceptList({
  concepts,
  centerId,
  onSelect,
}: {
  concepts: Concept[]
  centerId: string
  onSelect: (id: string) => void
}) {
  const ordered = [...concepts].sort(
    (a, b) => b.importance - a.importance || a.name.localeCompare(b.name, 'zh'),
  )

  return (
    <section className="col list-col">
      <header className="col-head">
        <div className="eyebrow">概念</div>
        <div className="head-title">按重要性</div>
      </header>
      <ul className="concept-list">
        {ordered.map((concept) => {
          const active = concept.id === centerId
          return (
            <li key={concept.id}>
              <button
                type="button"
                className={active ? 'concept-row active' : 'concept-row'}
                data-concept-id={concept.id}
                onClick={() => onSelect(concept.id)}
              >
                <span
                  className="status-dot"
                  style={{ background: statusColor(concept.status, concept.importance) }}
                />
                <span className="row-text">
                  <span className="row-name">{concept.name}</span>
                  <span className="row-meta">
                    {'●'.repeat(concept.importance)}
                    {'○'.repeat(3 - concept.importance)}
                    <span>{STATUS_LABEL[concept.status]}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
