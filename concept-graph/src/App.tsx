import { useMemo, useState } from 'react'
import { concepts as seed, conceptById, type Concept, type Status } from './data/concepts'
import ConceptDetail from './components/ConceptDetail'
import ConceptGraph from './components/ConceptGraph'
import ConceptList from './components/ConceptList'

const STATUS_KEY = 'concept-graph-status'

function readStatus(): Record<string, Status> {
  try {
    const raw = localStorage.getItem(STATUS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, Status>
  } catch {
    return {}
  }
}

export default function App() {
  const [overrides, setOverrides] = useState<Record<string, Status>>(readStatus)
  const [history, setHistory] = useState<string[]>(['core'])
  const [index, setIndex] = useState(0)

  const concepts = useMemo<Concept[]>(
    () => seed.map((concept) => ({ ...concept, status: overrides[concept.id] ?? concept.status })),
    [overrides],
  )

  const centerId = history[index] ?? 'core'
  const center = conceptById(concepts, centerId)

  const select = (id: string) => {
    if (id === centerId) return
    const next = history.slice(0, index + 1)
    next.push(id)
    setHistory(next)
    setIndex(next.length - 1)
  }

  const setStatus = (id: string, status: Status) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: status }
      localStorage.setItem(STATUS_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <main className="app">
      <ConceptList concepts={concepts} centerId={centerId} onSelect={select} />
      <ConceptDetail concept={center} onStatus={setStatus} />
      <ConceptGraph
        concepts={concepts}
        centerId={centerId}
        canBack={index > 0}
        canForward={index < history.length - 1}
        onSelect={select}
        onBack={() => setIndex((value) => Math.max(0, value - 1))}
        onForward={() => setIndex((value) => Math.min(history.length - 1, value + 1))}
      />
    </main>
  )
}
