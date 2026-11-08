import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import 'katex/dist/katex.min.css'
import type { ViewProps } from '../../record/view-props'
import type { NoteFile, TopicNotes, TopicSummary } from '../../record/types'
import { createNoteRenderer, splitFrontmatter, type Rendered } from './obsidian-md'
import './notes.css'

const render = createNoteRenderer()
const MAX_PRELOAD = 300
/** Machine fields the compiler reads; shown in the file, not in the reader's properties. */
const HIDDEN_PROPS = new Set(['learn_blocks', 'topic_id', 'id'])
/** Compare headings ignoring emoji, punctuation and spacing (evidence links carry "📌 执行顺序"). */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const short = (v: string) => (v.length > 120 ? v.slice(0, 117) + '…' : v)

type NotesRoute = Extract<ViewProps['route'], { view: 'notes' }>

/** Pick the note a topic opens on: its 学习主页 / Home / README, else the first root note. */
function homeOf(files: NoteFile[]): string | null {
  const pick = (re: RegExp) => files.find((f) => re.test(f.title))?.path
  return pick(/学习主页|^00-?Home|Home$/i) ?? pick(/^README$/i) ?? files.find((f) => !f.folder)?.path ?? files[0]?.path ?? null
}

function folderLabel(folder: string) {
  return folder.replace(/^\d+-/, '') || '根目录'
}

function snippet(text: string, needle: string, width = 36) {
  const body = splitFrontmatter(text).body
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/\[![\w-]+\][+-]?/g, ' ').replace(/==/g, '').replace(/\|\s*-{3,}\s*/g, ' ').replace(/[|>#*`]+/g, ' ').replace(/\s+/g, ' ')
  const i = body.toLowerCase().indexOf(needle.toLowerCase())
  if (i < 0) return ''
  return (i > width ? '…' : '') + body.slice(Math.max(0, i - width), i + needle.length + width) + '…'
}

/** Scroll only the note pane (scrollIntoView would also move the fixed .ub layer). */
function scrollPageTo(el: Element | null, smooth = false) {
  const page = document.querySelector<HTMLElement>('.ub-notes .nr-page')
  if (!page) return
  const top = el ? el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - 64 : 0
  page.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}

export default function NotesView({ client, route, navigate }: ViewProps) {
  const r = route as NotesRoute
  const [topics, setTopics] = useState<TopicSummary[] | null>(null)
  const [loaded, setLoaded] = useState<{ topicId: string; index: TopicNotes | null; texts: Record<string, string>; error: string } | null>(null)
  const [listError, setListError] = useState('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [missing, setMissing] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const topicId = r.topicId ?? null

  // topics list; land on the first topic when none is chosen
  useEffect(() => {
    let live = true
    client.listTopics().then((res) => {
      if (!live) return
      setTopics(res.data)
      if (!topicId && res.data[0]) navigate({ view: 'notes', topicId: res.data[0].topicId })
    }).catch((e) => live && setListError(e instanceof Error ? e.message : '主题列表读取失败'))
    return () => { live = false }
  }, [client, topicId, navigate])

  // the topic's note index + all note texts (topics are small; enables links, backlinks, search)
  useEffect(() => {
    if (!topicId) return
    let live = true
    client.listTopicNotes(topicId).then(async (res) => {
      if (!live) return
      setLoaded({ topicId, index: res.data, texts: {}, error: '' })
      const texts: Record<string, string> = {}
      await Promise.all(res.data.files.slice(0, MAX_PRELOAD).map(async (f) => {
        try { texts[f.path] = (await client.readTopicNote(topicId, f.path)).data.text } catch { /* left unread; the page shows 正在读取 */ }
      }))
      if (live) setLoaded({ topicId, index: res.data, texts, error: '' })
    }).catch((e) => live && setLoaded({ topicId, index: null, texts: {}, error: e instanceof Error ? e.message : '笔记读取失败' }))
    return () => { live = false }
  }, [client, topicId])

  const mine = loaded && loaded.topicId === topicId ? loaded : null
  const index = mine?.index ?? null
  const texts = useMemo(() => mine?.texts ?? {}, [mine])
  const error = listError || mine?.error || ''
  const files = useMemo(() => index?.files ?? [], [index])
  const current = r.file && files.some((f) => f.path === r.file) ? r.file : homeOf(files)
  const text = current ? texts[current] : undefined

  // wikilink target → path (file title, frontmatter title, aliases)
  const resolver = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of files) {
      map.set(f.title.toLowerCase(), f.path)
      map.set(f.path.toLowerCase().replace(/\.md$/, ''), f.path)
    }
    for (const f of files) {
      const t = texts[f.path]
      if (!t) continue
      for (const p of splitFrontmatter(t).props) {
        if (p.key === 'aliases' || p.key === 'alias') for (const a of [p.value].flat()) if (a && !map.has(a.toLowerCase())) map.set(a.toLowerCase(), f.path)
      }
    }
    return (target: string) => map.get(target.trim().toLowerCase()) ?? map.get(target.trim().toLowerCase().replace(/（.*?）$/, '')) ?? null
  }, [files, texts])

  const doc: Rendered | null = useMemo(() => (text === undefined ? null : render(text)), [text])

  // backlinks: notes whose [[links]] resolve to the current note
  const backlinks = useMemo(() => {
    if (!current) return []
    const title = files.find((f) => f.path === current)?.title ?? ''
    return files.filter((f) => f.path !== current && texts[f.path]).flatMap((f) => {
      const refs = render(texts[f.path]).links.filter((l) => resolver(l.target) === current)
      return refs.length ? [{ file: f, count: refs.length, hint: snippet(texts[f.path], refs[0].alias ?? refs[0].target) || snippet(texts[f.path], title) }] : []
    })
  }, [current, files, texts, resolver])

  // search over titles and text
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return files.flatMap((f) => {
      const inTitle = f.title.toLowerCase().includes(q)
      const hint = texts[f.path] ? snippet(texts[f.path], query.trim()) : ''
      return inTitle || hint ? [{ file: f, hint }] : []
    })
  }, [query, files, texts])

  // mark unresolved links, render mermaid, honour ?h= heading
  useEffect(() => {
    const root = bodyRef.current
    if (!root || !doc) return
    root.querySelectorAll<HTMLAnchorElement>('a.nr-wikilink').forEach((a) => {
      if (!resolver(a.dataset.target ?? '')) a.classList.add('unresolved')
    })
    const diagrams = [...root.querySelectorAll<HTMLElement>('.nr-mermaid')]
    let live = true
    if (diagrams.length) {
      import('mermaid').then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit',
          themeVariables: { darkMode: true, background: 'transparent', primaryColor: '#1d2c63', primaryTextColor: '#f3f5ff', primaryBorderColor: '#ffb547', lineColor: '#ffd48a', secondaryColor: '#2a1f55', tertiaryColor: '#0f1a40', clusterBkg: '#0f1a40', clusterBorder: '#5a6aa8', fontSize: '14px' },
        })
        for (const [i, el] of diagrams.entries()) {
          try {
            const { svg } = await mermaid.render(`nr-mmd-${Date.now()}-${i}`, el.dataset.src ?? '')
            if (live) { el.innerHTML = svg; el.classList.add('ok') }
          } catch { el.classList.add('bad') }
        }
      }).catch(() => { /* code block stays visible */ })
    }
    const want = r.heading ? norm(r.heading) : ''
    const hit = want ? doc.headings.find((h) => norm(h.text) === want) ?? doc.headings.find((h) => norm(h.text).includes(want)) : null
    const target = hit ? root.querySelector(`#${CSS.escape(hit.id)}`) : null
    scrollPageTo(target)
    return () => { live = false }
  }, [doc, resolver, r.heading])

  function open(path: string, heading?: string | null) {
    setMissing('')
    navigate({ view: 'notes', topicId, file: path, heading: heading || null })
  }

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a.nr-wikilink')
    if (!a) return
    e.preventDefault()
    const path = resolver(a.dataset.target ?? '')
    if (path) open(path, a.dataset.heading)
    else setMissing(a.dataset.target ?? '')
  }

  // folder tree
  const tree = useMemo(() => {
    const groups = new Map<string, NoteFile[]>()
    for (const f of files) groups.set(f.folder, [...(groups.get(f.folder) ?? []), f])
    return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'zh-Hans-CN')))
  }, [files])

  const currentFile = files.find((f) => f.path === current)
  const topicTitle = index?.title ?? topics?.find((t) => t.topicId === topicId)?.title ?? topicId ?? ''

  return (
    <section className="ub ub-notes">
      <aside className="nr-side">
        <p className="ub-eyebrow">笔记库</p>
        <select className="nr-topic" value={topicId ?? ''} onChange={(e) => navigate({ view: 'notes', topicId: e.target.value })} aria-label="选择主题">
          {!topicId && <option value="">选择主题…</option>}
          {(topics ?? []).map((t) => <option key={t.topicId} value={t.topicId}>{t.title}</option>)}
        </select>
        <input className="nr-search" type="search" placeholder="搜索标题或正文" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="搜索笔记" />
        {results ? (
          <div className="nr-results">
            <p className="ub-muted">{results.length} 条结果</p>
            {results.map(({ file, hint }) => (
              <button key={file.path} type="button" className={'nr-file' + (file.path === current ? ' on' : '')} onClick={() => open(file.path)}>
                <b>{file.title}</b>{hint && <small>{hint}</small>}
              </button>
            ))}
          </div>
        ) : (
          <nav className="nr-tree" aria-label="笔记目录">
            {tree.map(([folder, list]) => (
              <div key={folder || '/'} className="nr-folder">
                {folder && (
                  <button type="button" className="nr-fold" aria-expanded={!collapsed[folder]} onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}>
                    <i>{collapsed[folder] ? '▸' : '▾'}</i>{folderLabel(folder)}<span className="ub-mono">{list.length}</span>
                  </button>
                )}
                {!collapsed[folder] && list.map((f) => (
                  <button key={f.path} type="button" className={'nr-file' + (f.path === current ? ' on' : '') + (folder ? ' nested' : '')} onClick={() => open(f.path)} title={f.path}>
                    {f.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>

      <article className="nr-page">
        <header className="nr-head">
          <p className="nr-crumb">
            <span>{topicTitle}</span>
            {currentFile?.folder && <> › <span>{folderLabel(currentFile.folder)}</span></>}
          </p>
          <div className="nr-actions">
            {topicId && <button type="button" className="ub-btn" onClick={() => navigate({ view: 'star-dive', topicId })}>在星图中潜航</button>}
          </div>
        </header>
        {error && <p className="ub-note nr-error" role="alert">{error}</p>}
        {index && !index.available && <div className="nr-empty"><h2>这个主题还没有笔记原文</h2><p className="ub-muted">{index.reason}</p></div>}
        {missing && <p className="ub-note nr-missing" role="status">笔记库里没有「{missing}」这篇笔记。<button type="button" className="ub-btn txt" onClick={() => setMissing('')}>知道了</button></p>}
        {index?.available && current && !doc && <p className="ub-muted">正在读取笔记…</p>}
        {doc && currentFile && (
          <>
            {!(doc.headings[0]?.level === 1) && <h1 className="nr-title">{currentFile.title}</h1>}
            {doc.props.some((p) => !HIDDEN_PROPS.has(p.key)) && (
              <dl className="nr-props">
                {doc.props.filter((p) => !HIDDEN_PROPS.has(p.key)).map((p) => (
                  <div key={p.key}><dt>{p.key}</dt><dd>{[p.value].flat().map((v, i) => <span key={i} className={p.key === 'tags' ? 'nr-tag' : undefined}>{p.key === 'tags' ? '#' : ''}{short(v)}</span>)}</dd></div>
                ))}
              </dl>
            )}
            <div ref={bodyRef} className="nr-body" onClick={onBodyClick} dangerouslySetInnerHTML={{ __html: doc.html }} />
          </>
        )}
      </article>

      <aside className="nr-aside">
        {doc && doc.headings.length > 0 && (
          <section>
            <p className="ub-eyebrow">大纲</p>
            {doc.headings.map((h) => (
              <button key={h.id} type="button" className="nr-outline" style={{ paddingLeft: 8 + (h.level - 1) * 12 }} onClick={() => scrollPageTo(bodyRef.current?.querySelector(`#${CSS.escape(h.id)}`) ?? null, true)}>
                {h.text}
              </button>
            ))}
          </section>
        )}
        <section>
          <p className="ub-eyebrow">反向链接 · {backlinks.length}</p>
          {backlinks.length === 0 && <p className="ub-muted nr-small">没有其他笔记链接到这里</p>}
          {backlinks.map(({ file, count, hint }) => (
            <button key={file.path} type="button" className="nr-file nr-back" onClick={() => open(file.path)}>
              <b>{file.title}</b><span className="ub-mono">{count}</span>{hint && <small>{hint}</small>}
            </button>
          ))}
        </section>
      </aside>
    </section>
  )
}
