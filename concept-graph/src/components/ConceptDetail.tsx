import type { Concept, Status } from '../data/concepts'

const STATUS_LABEL: Record<Status, string> = {
  unlearned: '未掌握',
  learning: '学习中',
  mastered: '已掌握',
}

function nextStatus(status: Status): Status {
  if (status === 'unlearned') return 'learning'
  if (status === 'learning') return 'mastered'
  return 'learning'
}

function actionLabel(status: Status): string {
  if (status === 'unlearned') return '开始学习'
  if (status === 'learning') return '标为已掌握'
  return '再学一遍'
}

export default function ConceptDetail({
  concept,
  onStatus,
}: {
  concept: Concept
  onStatus: (id: string, status: Status) => void
}) {
  return (
    <section className="col detail-col">
      <header className="col-head">
        <div className="eyebrow">当前概念</div>
        <div className="head-title">核心问题与短时任务</div>
      </header>
      <div className="detail-body">
        <p className="importance">重要性 {concept.importance} / 3 · {STATUS_LABEL[concept.status]}</p>
        <h1>{concept.name}</h1>
        <p className="summary">{concept.summary}</p>
        <h2>核心问题</h2>
        <p className="question">{concept.question}</p>
        <h2>输出任务</h2>
        <p className="task">{concept.task}</p>
        <button
          type="button"
          className="primary"
          onClick={() => onStatus(concept.id, nextStatus(concept.status))}
        >
          {actionLabel(concept.status)}
        </button>
      </div>
    </section>
  )
}
