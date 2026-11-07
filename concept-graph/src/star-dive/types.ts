import type { InteractionState } from './modules/interaction'

/** Shape of src/data/star-dive.json (the prototype's data.json). Cards are open-ended module specs. */
export interface StarDiveChapter {
  start: number
  end: number
  title: string
}

export interface StarDiveMeta {
  title: string
  channel: string
  video_id: string
  url: string
  duration_sec: number
  lang_note?: string
  chapters?: StarDiveChapter[]
}

export type ConceptShape = 'definition' | 'process' | 'formula' | 'compare' | 'timeline' | 'example'

/** A card is `{ type: '<module type>', ...fields }` — see MODULES.md in the prototype. */
export interface CardSpec {
  type: string
  title?: string
  timestamps?: number[]
  source_timestamps?: number[]
  // module-specific fields
  [field: string]: any
}

export interface StarDiveConcept {
  id: string
  label: string
  en?: string
  summary: string
  shape: ConceptShape | string
  relations: string[]
  cards: CardSpec[]
}

export interface StarDiveData {
  meta: StarDiveMeta
  concepts: StarDiveConcept[]
}

export interface ModuleContext {
  readonly concept: StarDiveConcept
  readonly meta: StarDiveMeta
  readonly signal: AbortSignal
  readonly onCleanup: (fn: () => void) => void
  readonly reportInteraction: (state: InteractionState) => void
  readonly fallback: boolean
  readonly errors: string[]
  readonly ytUrl: (t: number) => string
  readonly fmt: (t: number) => string
  readonly esc: (s: unknown) => string
  readonly el: (tag: string, cls?: string | null, html?: string | null) => HTMLElement
  readonly icons: Record<string, string>
}

export type SchemaResult = string[] | boolean | { ok: boolean; errors?: string[] } | null | undefined

export interface ModuleDef {
  type: string
  title?: string
  label?: string | ((spec: CardSpec) => string)
  icon?: string
  appliesTo?: string[]
  schema?: (spec: CardSpec, opts: { concept: StarDiveConcept }) => SchemaResult
  render: (container: HTMLElement, spec: CardSpec, ctx: ModuleContext) => void
  destroy?: ((container: HTMLElement, ctx: ModuleContext) => void) | null
}

export type RegisteredModule = Readonly<Required<Omit<ModuleDef, 'destroy'>> & Pick<ModuleDef, 'destroy'>>
