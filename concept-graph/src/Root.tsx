import { lazy, Suspense, useEffect, useState } from 'react'
import App from './App'
import { learningSession } from './assistant/context-store'

// The star-dive view (and its data) is code-split so the concept graph stays light.
const StarDive = lazy(() => import('./star-dive/StarDive'))
const GlobalAssistant = lazy(() => import('./assistant/ui/GlobalAssistant'))

/** Hash routes: `#/star-dive` (optionally `#/star-dive/<conceptId>` to dive straight into a star); anything else → concept graph. */
function parseRoute(hash: string) {
  const m = /^#\/star-dive(?:\/([^/?#]*))?/.exec(hash)
  if (!m) return { view: 'graph' as const, focus: null }
  return { view: 'star-dive' as const, focus: m[1] ? decodeURIComponent(m[1]) : null }
}

export default function Root() {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (route.view === 'graph') learningSession.updateScene({
      view: 'graph', topic: null, concept: null, card: null, interaction: null,
    })
  }, [route.view])

  return (
    <>
      {route.view === 'star-dive' ? (
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#040919' }} />}>
        {/* key: re-mount on deep-link change so the new star is focused on load */}
        <StarDive key={route.focus ?? ''} initialFocus={route.focus} />
      </Suspense>
      ) : <App />}
      <Suspense fallback={null}><GlobalAssistant /></Suspense>
    </>
  )
}
