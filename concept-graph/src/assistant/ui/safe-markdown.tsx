import { useMemo, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

type Block =
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string }

function mathHtml(tex: string, display: boolean): string | null {
  try {
    const html = katex.renderToString(tex, {
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      displayMode: display,
    })
    if (/<script|javascript:|on[a-z]+\s*=/i.test(html)) return null
    return html
  } catch {
    return null
  }
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch {
    return null
  }
  return null
}

function splitPattern<T extends Block>(source: string, pattern: RegExp, onMatch: (match: RegExpExecArray) => T): Array<T | { kind: 'text'; text: string }> {
  const parts: Array<T | { kind: 'text'; text: string }> = []
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const expression = new RegExp(pattern.source, flags)
  let last = 0
  for (const match of source.matchAll(expression)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', text: source.slice(last, index) })
    parts.push(onMatch(match))
    last = index + match[0].length
  }
  if (last < source.length) parts.push({ kind: 'text', text: source.slice(last) })
  if (parts.length === 0) parts.push({ kind: 'text', text: source })
  return parts
}

function blocksFromText(source: string): Block[] {
  const blocks: Block[] = []
  const fenced = splitPattern(source, /```[^\n]*\n?([\s\S]*?)```/g, (match) => ({ kind: 'code' as const, text: match[1] ?? '' }))
  for (const part of fenced) {
    if (part.kind === 'code') {
      blocks.push(part)
      continue
    }
    const mathParts = splitPattern(part.text, /\$\$([\s\S]+?)\$\$/g, (match) => ({ kind: 'math' as const, tex: (match[1] ?? '').trim() }))
    for (const mathPart of mathParts) {
      if (mathPart.kind === 'math') blocks.push(mathPart)
      else blocks.push(...plainBlocks(mathPart.text))
    }
  }
  return blocks
}

function plainBlocks(source: string): Block[] {
  const blocks: Block[] = []
  const chunks = source.replace(/\r\n/g, '\n').split(/\n{2,}/)
  for (const chunk of chunks) {
    const text = chunk.trim()
    if (!text) continue
    const lines = text.split('\n')
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '')
    if (lines.length === 1 && heading?.[1] && heading[2]) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    if (lines.every((line) => line.startsWith('> '))) {
      blocks.push({ kind: 'quote', text: lines.map((line) => line.slice(2)).join('\n') })
      continue
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      blocks.push({ kind: 'list', items: lines.map((line) => line.replace(/^[-*]\s+/, '')) })
      continue
    }
    blocks.push({ kind: 'paragraph', text: lines.join('\n') })
  }
  return blocks
}

function InlineText({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`]+`)|(\$[^$\n]+\$)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g
  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    if (match[1]) {
      nodes.push(<code key={key}>{match[1].slice(1, -1)}</code>)
    } else if (match[2]) {
      nodes.push(<MathSpan key={key} tex={match[2].slice(1, -1)} display={false} />)
    } else if (match[3] && match[4]) {
      const href = safeUrl(match[5] ?? '')
      nodes.push(href
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{match[4]}</a>
        : <span key={key}>{match[4]}</span>)
    } else if (match[6] && match[7]) {
      nodes.push(<strong key={key}>{match[7]}</strong>)
    } else if (match[8] && match[9]) {
      nodes.push(<em key={key}>{match[9]}</em>)
    }
    key += 1
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

function MathSpan({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => mathHtml(tex, display), [tex, display])
  if (!html) return <code>{tex}</code>
  return <span className={display ? 'ula-math-block' : 'ula-math'} dangerouslySetInnerHTML={{ __html: html }} />
}

export function SafeMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => blocksFromText(text), [text])
  return (
    <div className="ula-md">
      {blocks.map((block, index) => {
        if (block.kind === 'code') return <pre key={index} className="ula-code"><code>{block.text.replace(/\n$/, '')}</code></pre>
        if (block.kind === 'math') return <MathSpan key={index} tex={block.tex} display />
        if (block.kind === 'heading') {
          if (block.level === 1) return <h3 key={index}><InlineText text={block.text} /></h3>
          return <h4 key={index}><InlineText text={block.text} /></h4>
        }
        if (block.kind === 'quote') return <blockquote key={index}><InlineText text={block.text} /></blockquote>
        if (block.kind === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} /></li>)}
            </ul>
          )
        }
        return <p key={index}><InlineText text={block.text} /></p>
      })}
    </div>
  )
}
