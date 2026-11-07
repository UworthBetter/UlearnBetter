import { useCallback, useMemo, useState } from 'react'
import { createMockRecordClient, type RecordClient } from '../../record/client.ts'
import type { AdjustOptions, RecordRoute } from '../../record/view-props.ts'
import TodayView from '../today/TodayView.tsx'
import LibraryView from '../library/LibraryView.tsx'
import PanoramaView from '../panorama/PanoramaView.tsx'
import AdjustLayer from '../layers/AdjustLayer.tsx'
import RecallPrompt from '../recall/RecallPrompt.tsx'
import MasteryBar from '../recall/MasteryBar.tsx'
import '../views.css'

type Screen = 'today' | 'stats' | 'library' | 'panorama' | 'adjust' | 'recall' | 'empty' | 'nogoal'

export default function ViewsPreview() {
  const base = useMemo(() => createMockRecordClient(), [])
  const [screen, setScreen] = useState<Screen>('today')
  const [route, setRoute] = useState<RecordRoute>({ view: 'today' })
  const [adjust, setAdjust] = useState<AdjustOptions | null>(null)
  const [recall, setRecall] = useState<'remembered' | 'forgot' | 'skipped' | null>(null)
  const client = useMemo(() => maskClient(base, screen), [base, screen])
  const navigate = useCallback((next: RecordRoute) => {
    setAdjust(null)
    setRoute(next)
    if (next.view === 'today' && next.layer === 'stats') setScreen('stats')
    else if (next.view === 'today') setScreen('today')
    else if (next.view === 'library') setScreen('library')
    else if (next.view === 'panorama') setScreen('panorama')
  }, [])
  const openAdjust = useCallback((opts?: AdjustOptions) => {
    setAdjust(opts ?? {})
    setScreen('adjust')
  }, [])
  const reportScene = useCallback(() => {}, [])

  function jump(next: Screen) {
    setScreen(next)
    setAdjust(next === 'adjust' ? {} : null)
    if (next === 'stats') setRoute({ view: 'today', layer: 'stats' })
    else if (next === 'library') setRoute({ view: 'library' })
    else if (next === 'panorama') setRoute({ view: 'panorama' })
    else setRoute({ view: 'today' })
  }

  const showToday = screen === 'today' || screen === 'stats' || screen === 'empty' || screen === 'nogoal'

  return (
    <div>
      <div className="ub-preview-nav">
        <span className="ub-tag mock">示例数据</span>
        {([
          ['today', '今天'],
          ['stats', '统计'],
          ['library', '资料'],
          ['panorama', '全景'],
          ['adjust', '调整'],
          ['recall', '回忆'],
          ['empty', '无资料'],
          ['nogoal', '无目标'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className="ub-btn sm" onClick={() => jump(id)}>{label}</button>
        ))}
      </div>
      {showToday && <TodayView client={client} route={route.view === 'today' ? route : { view: 'today' }} navigate={navigate} openAdjust={openAdjust} reportScene={reportScene} />}
      {screen === 'library' && <LibraryView client={client} route={route.view === 'library' ? route : { view: 'library' }} navigate={navigate} openAdjust={openAdjust} reportScene={reportScene} />}
      {screen === 'panorama' && <PanoramaView client={client} route={route.view === 'panorama' ? route : { view: 'panorama' }} navigate={navigate} openAdjust={openAdjust} reportScene={reportScene} />}
      {(screen === 'adjust' || adjust) && screen !== 'today' && screen !== 'library' && screen !== 'panorama' && screen !== 'stats' && (
        <AdjustLayer client={base} changeLogId={adjust?.changeLogId} itemId={adjust?.itemId} navigate={navigate} onClose={() => { setAdjust(null); setScreen('today'); setRoute({ view: 'today' }) }} />
      )}
      {adjust && (screen === 'library' || screen === 'panorama' || screen === 'today') && (
        <AdjustLayer client={base} changeLogId={adjust.changeLogId} itemId={adjust.itemId} navigate={navigate} onClose={() => setAdjust(null)} />
      )}
      {screen === 'recall' && (
        <section className="ub">
          <div style={{ position: 'absolute', left: '30%', top: '28%' }}>
            <RecallPrompt subject="concept:t-0/c-0" label="观察" onResult={setRecall} />
            <div style={{ marginTop: 12 }}><MasteryBar level={1} due="2026-11-08T00:00:00Z" /></div>
            {recall && <p className="ub-note">这次选择：{recall}。预览不写学习事件。</p>}
          </div>
        </section>
      )}
    </div>
  )
}

function maskClient(base: RecordClient, screen: Screen): RecordClient {
  if (screen === 'empty') {
    return { ...base, listItems: async () => ({ ...(await base.listItems()), data: [] }) }
  }
  if (screen === 'nogoal') {
    return {
      ...base,
      listGoals: async () => ({ ...(await base.listGoals()), data: [] }),
    }
  }
  return base
}
