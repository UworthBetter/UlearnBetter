/**
 * Obsidian-flavoured markdown → HTML for the notes reader.
 *
 * Safety: markdown-it runs with html:false, so raw HTML in a note is shown as
 * text, never executed. Every token we add renders through escapeHtml, links
 * are limited to http(s)/mailto, and mermaid runs later with securityLevel
 * "strict". Notes (often model-written) are data, not markup we trust.
 *
 * Supported on top of CommonMark + tables: YAML frontmatter (shown as
 * properties), [[wikilinks|alias]] / [[note#heading]], ![[embeds]] (as links),
 * > [!callout] blocks, - [ ] task lists, ==highlight==, #tags, $inline$ and
 * $$block$$ math (KaTeX), ```mermaid diagrams, heading anchors for the outline.
 */
import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import katex from 'katex'

export interface FrontProp { key: string; value: string | string[] }
export interface Heading { level: number; text: string; id: string }
export interface WikiRef { target: string; heading: string | null; alias: string | null; embed: boolean }
export interface Rendered { html: string; props: FrontProp[]; headings: Heading[]; links: WikiRef[]; tags: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Tiny YAML subset: `key: value`, `key:` followed by `- item` lines, quoted scalars. */
export function splitFrontmatter(text: string): { props: FrontProp[]; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (!m) return { props: [], body: src }
  const props: FrontProp[] = []
  let current: FrontProp | null = null
  for (const line of m[1].split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && current) {
      current.value = [...(Array.isArray(current.value) ? current.value : current.value ? [current.value] : []), unquote(item[1])]
      continue
    }
    const kv = /^([^:#\s][^:]*):\s*(.*)$/.exec(line)
    if (kv) {
      current = { key: kv[1].trim(), value: inlineList(kv[2].trim()) }
      props.push(current)
    }
  }
  return { props, body: src.slice(m[0].length) }
}
const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2')
function inlineList(s: string): string | string[] {
  const l = /^\[(.*)\]$/.exec(s)
  return l ? l[1].split(',').map(unquote).filter(Boolean) : unquote(s)
}

export function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') || 'h'
}

function mathHtml(tex: string, display: boolean): string {
  try {
    const html = katex.renderToString(tex, { throwOnError: false, trust: false, strict: 'ignore', displayMode: display })
    if (/<script|javascript:|on[a-z]+\s*=/i.test(html)) return `<code>${esc(tex)}</code>`
    return html
  } catch {
    return `<code>${esc(tex)}</code>`
  }
}

// ------------------------------------------------------------------ inline rules

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  let pos = state.pos
  const embed = src.charCodeAt(pos) === 0x21 /* ! */
  if (embed) pos++
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0) return false
  const inner = src.slice(pos + 2, end)
  if (!inner.trim() || inner.includes('\n') || inner.includes('[[')) return false
  if (!silent) {
    const [left, alias = null] = inner.split('|')
    const [target, heading = null] = left.split('#')
    const t = state.push('wikilink', '', 0)
    t.meta = { target: target.trim(), heading: heading?.trim() || null, alias: alias?.trim() || null, embed } satisfies WikiRef
  }
  state.pos = end + 2
  return true
}

function markRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x3d || src.charCodeAt(start + 1) !== 0x3d) return false
  const end = src.indexOf('==', start + 2)
  if (end < 0 || end === start + 2) return false
  const inner = src.slice(start + 2, end)
  if (/^\s|\s$/.test(inner) || inner.includes('\n')) return false
  if (!silent) {
    state.push('mark_open', 'mark', 1)
    const oldMax = state.posMax
    state.pos = start + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.posMax = oldMax
    state.push('mark_close', 'mark', -1)
  }
  state.pos = end + 2
  return true
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false
  const double = src.charCodeAt(start + 1) === 0x24
  const open = double ? 2 : 1
  const close = src.indexOf(double ? '$$' : '$', start + open)
  if (close < 0) return false
  const tex = src.slice(start + open, close)
  if (!tex.trim() || (!double && (/^\s|\s$/.test(tex) || /^\d/.test(src.slice(close + 1, close + 2))))) return false
  if (!silent) {
    const t = state.push('math_inline', '', 0)
    t.content = tex
    t.meta = { display: double }
  }
  state.pos = close + open
  return true
}

function tagRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x23 /* # */) return false
  const prev = start > 0 ? src[start - 1] : ' '
  if (!/\s|[（(，,、]/.test(prev)) return false
  const m = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u.exec(src.slice(start))
  if (!m) return false
  if (!silent) {
    const t = state.push('tag', '', 0)
    t.content = m[1]
  }
  state.pos = start + m[0].length
  return true
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (state.src.slice(pos, pos + 2) !== '$$') return false
  const firstRest = state.src.slice(pos + 2, max)
  if (firstRest.trim().endsWith('$$') && firstRest.trim().length > 2) {
    if (silent) return true
    const t = state.push('math_block', '', 0)
    t.content = firstRest.trim().slice(0, -2)
    state.line = startLine + 1
    return true
  }
  let line = startLine
  const body: string[] = [firstRest]
  let found = false
  while (++line < endLine) {
    const p = state.bMarks[line] + state.tShift[line]
    const text = state.src.slice(p, state.eMarks[line])
    if (text.trim().endsWith('$$')) { body.push(text.trim().slice(0, -2)); found = true; break }
    body.push(text)
  }
  if (!found) return false
  if (silent) return true
  const t = state.push('math_block', '', 0)
  t.content = body.join('\n').trim()
  state.line = line + 1
  return true
}

// ------------------------------------------------------------------ core rules

const CALLOUT_ICON: Record<string, string> = {
  note: '✎', info: 'ℹ', tip: '💡', hint: '💡', important: '❗', abstract: '≡', summary: '≡', tldr: '≡',
  todo: '☐', success: '✓', check: '✓', done: '✓', question: '?', help: '?', faq: '?',
  warning: '⚠', caution: '⚠', attention: '⚠', failure: '✗', fail: '✗', missing: '✗', danger: '⚡', error: '⚡',
  bug: '🐞', example: '◆', quote: '❝', cite: '❝',
}

function calloutRule(state: StateCore) {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue
    const pOpen = tokens[i + 1]
    const inline = tokens[i + 2]
    if (pOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
    const m = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)/.exec(inline.content)
    if (!m) continue
    const type = m[1].toLowerCase()
    tokens[i].attrJoin('class', `callout callout-${type}`)
    tokens[i].attrSet('data-callout', type)
    // children: drop the marker, split title (first line) from body
    const children = inline.children ?? []
    const brk = children.findIndex((c) => c.type === 'softbreak' || c.type === 'hardbreak')
    const titleKids = brk >= 0 ? children.slice(0, brk) : children
    const bodyKids = brk >= 0 ? children.slice(brk + 1) : []
    if (titleKids[0]?.type === 'text') titleKids[0].content = titleKids[0].content.replace(/^\[![\w-]+\][+-]?[ \t]*/, '')
    const hasTitle = titleKids.some((c) => c.type !== 'text' || c.content.trim())
    const tOpen = new state.Token('callout_title_open', 'div', 1)
    tOpen.meta = { type, icon: CALLOUT_ICON[type] ?? '✎', fallback: hasTitle ? '' : type.charAt(0).toUpperCase() + type.slice(1) }
    const tInline = new state.Token('inline', '', 0)
    tInline.children = titleKids
    tInline.content = ''
    const tClose = new state.Token('callout_title_close', 'div', -1)
    if (bodyKids.length) {
      inline.children = bodyKids
      tokens.splice(i + 1, 0, tOpen, tInline, tClose)
    } else {
      // whole first paragraph was the title line
      tokens.splice(i + 1, 3, tOpen, tInline, tClose)
    }
  }
}

function taskRule(state: StateCore) {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue
    const m = /^\[([ xX])\]\s/.exec(t.content)
    if (!m) continue
    const first = t.children?.[0]
    if (!first || first.type !== 'text') continue
    first.content = first.content.replace(/^\[[ xX]\]\s/, '')
    const box = new state.Token('task_box', 'input', 0)
    box.meta = { checked: m[1] !== ' ' }
    t.children!.unshift(box)
    tokens[i - 2].attrJoin('class', 'task' + (m[1] !== ' ' ? ' done' : ''))
  }
}

// ------------------------------------------------------------------ renderer

export function createNoteRenderer() {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false })
  md.validateLink = (url: string) => /^(https?:|mailto:|#)/i.test(url.trim())
  md.inline.ruler.before('link', 'wikilink', wikilinkRule)
  md.inline.ruler.before('emphasis', 'mark', markRule)
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule)
  md.inline.ruler.push('tag', tagRule)
  md.block.ruler.before('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
  md.core.ruler.push('callout', calloutRule)
  md.core.ruler.push('task', taskRule)

  const r = md.renderer.rules
  r.wikilink = (tokens, idx) => {
    const w = tokens[idx].meta as WikiRef
    const label = w.alias ?? (w.heading ? `${w.target} › ${w.heading}` : w.target)
    return `<a class="nr-wikilink${w.embed ? ' embed' : ''}" href="#" data-target="${esc(w.target)}" data-heading="${esc(w.heading ?? '')}">${w.embed ? '↳ ' : ''}${esc(label)}</a>`
  }
  r.mark_open = () => '<mark>'
  r.mark_close = () => '</mark>'
  r.math_inline = (tokens, idx) => mathHtml(tokens[idx].content, Boolean(tokens[idx].meta?.display))
  r.math_block = (tokens, idx) => `<div class="nr-math">${mathHtml(tokens[idx].content, true)}</div>`
  r.tag = (tokens, idx) => `<span class="nr-tag">#${esc(tokens[idx].content)}</span>`
  r.task_box = (tokens, idx) => `<input type="checkbox" disabled${tokens[idx].meta?.checked ? ' checked' : ''}> `
  r.callout_title_open = (tokens, idx) => {
    const m = tokens[idx].meta as { icon: string; fallback: string }
    return `<div class="callout-title"><span class="callout-icon">${esc(m.icon)}</span>${esc(m.fallback)}`
  }
  r.callout_title_close = () => '</div>\n'
  const fence = r.fence!
  r.fence = (tokens, idx, opts, env, self) => {
    const t = tokens[idx]
    if (t.info.trim().toLowerCase() === 'mermaid') return `<div class="nr-mermaid" data-src="${esc(t.content)}"><pre><code>${esc(t.content)}</code></pre></div>\n`
    return fence(tokens, idx, opts, env, self)
  }
  const linkOpen = r.link_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts))
  r.link_open = (tokens, idx, opts, env, self) => {
    const href = tokens[idx].attrGet('href') ?? ''
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
      if (/[?&]t=\d+s?\b/.test(href)) tokens[idx].attrJoin('class', 'nr-ts')
    }
    return linkOpen(tokens, idx, opts, env, self)
  }
  const headingOpen = r.heading_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts))
  r.heading_open = (tokens, idx, opts, env, self) => headingOpen(tokens, idx, opts, env, self)

  return function render(text: string): Rendered {
    const { props, body } = splitFrontmatter(text)
    const env = {}
    const tokens = md.parse(body, env)
    const headings: Heading[] = []
    const links: WikiRef[] = []
    const tags: string[] = []
    const used = new Map<string, number>()
    tokens.forEach((t, i) => {
      if (t.type === 'heading_open') {
        const text = (tokens[i + 1]?.children ?? []).map((c) => (c.type === 'wikilink' ? (c.meta as WikiRef).alias ?? (c.meta as WikiRef).target : c.content)).join('').trim()
        let id = slug(text)
        const n = used.get(id) ?? 0
        used.set(id, n + 1)
        if (n) id = `${id}-${n}`
        t.attrSet('id', id)
        headings.push({ level: Number(t.tag.slice(1)), text, id })
      }
      if (t.type === 'inline') {
        const walk = (kids: Token[] | null) => kids?.forEach((c) => {
          if (c.type === 'wikilink') links.push(c.meta as WikiRef)
          if (c.type === 'tag') tags.push(c.content)
        })
        walk(t.children)
      }
    })
    const html = md.renderer.render(tokens, md.options, env)
    return { html, props, headings, links, tags }
  }
}
