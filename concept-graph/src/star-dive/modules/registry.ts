/* =====================================================================
   MODULE SYSTEM — see the prototype's MODULES.md for the full contract.
   registerModule({ type, title, label, icon, appliesTo, schema, render, destroy })
   ===================================================================== */
import type { CardSpec, ModuleContext, ModuleDef, RegisteredModule, StarDiveConcept, StarDiveMeta } from '../types'
import { el, esc, fmt, ICONS } from '../util'
import { DSL } from './dsl'

export const MODULES = new Map<string, RegisteredModule>()
export const ALL_SHAPES = ['definition', 'process', 'formula', 'compare', 'timeline', 'example']

export function registerModule(def: ModuleDef) {
  if (!def || typeof def.type !== 'string' || !/^[a-z][a-z0-9_]*$/.test(def.type)) throw new Error('registerModule: invalid type')
  if (typeof def.render !== 'function') throw new Error(`registerModule(${def.type}): render() is required`)
  if (def.schema != null && typeof def.schema !== 'function') throw new Error(`registerModule(${def.type}): schema must be a function`)
  MODULES.set(def.type, Object.freeze({
    title: def.type, label: def.title || def.type, icon: 'book', appliesTo: ALL_SHAPES,
    schema: () => [], destroy: null, ...def,
  }) as RegisteredModule)
}

export const cardTs = (spec: CardSpec): number[] =>
  (Array.isArray(spec.timestamps) ? spec.timestamps : Array.isArray(spec.source_timestamps) ? spec.source_timestamps : [])
    .filter((t) => typeof t === 'number' && isFinite(t) && t >= 0)

export function runSchema(mod: RegisteredModule, spec: CardSpec, concept: StarDiveConcept): string[] {
  try {
    const res: any = mod.schema(spec, { concept })
    if (res === true || res == null) return []
    if (res === false) return ['schema() returned false']
    if (Array.isArray(res)) return res.map(String)
    if (typeof res === 'object' && 'ok' in res) return res.ok ? [] : (res.errors || ['invalid']).map(String)
    return ['schema() returned an unexpected value']
  } catch (err: any) { return ['schema() threw: ' + ((err && err.message) || err)] }
}

export interface Resolved { mod: RegisteredModule; spec: CardSpec; fallback: boolean; errors: string[] }

const RESOLVED = new WeakMap<object, Resolved>()

function fallbackSpec(concept: StarDiveConcept, card: any): CardSpec {
  return {
    type: 'definition', title: (card && typeof card.title === 'string' && card.title) || concept.label, body: concept.summary, terms: [],
    timestamps: card && typeof card === 'object' ? cardTs(card) : [],
  }
}

/** Validate a card and pick the module that will render it (or the definition fallback). Never throws. */
export function resolveCard(concept: StarDiveConcept, card: any): Resolved {
  if (card && typeof card === 'object' && RESOLVED.has(card)) return RESOLVED.get(card)!
  const mod = card && typeof card === 'object' ? MODULES.get(card.type) : null
  let errors: string[]
  if (!mod) errors = [`unknown module type "${card && card.type}"`]
  else errors = runSchema(mod, card, concept)
  let r: Resolved
  if (!errors.length) {
    if (mod!.appliesTo && !mod!.appliesTo.includes(concept.shape)) console.info(`[modules] "${card.type}" is not listed for shape "${concept.shape}" (advisory) in concept "${concept.id}"`)
    r = { mod: mod!, spec: card, fallback: false, errors: [] }
  } else {
    console.warn(`[modules] concept "${concept.id}": card "${card && card.type}" is invalid → definition fallback`, errors)
    r = { mod: MODULES.get('definition')!, spec: fallbackSpec(concept, card), fallback: true, errors }
  }
  if (card && typeof card === 'object') RESOLVED.set(card, r)
  return r
}

export function moduleUi(r: Resolved) {
  const lab = typeof r.mod.label === 'function' ? r.mod.label(r.spec) : r.mod.label
  return { icon: r.mod.icon, text: String(lab) }
}

export interface ModuleHost { meta: StarDiveMeta; ytUrl: (t: number) => string }
export interface MountedModule { ctx: ModuleContext; destroy(): void }

/** Render a card into container. Returns { destroy() }. Render errors fall back to the definition card. */
export function mountModule(container: HTMLElement, concept: StarDiveConcept, card: CardSpec, host: ModuleHost): MountedModule {
  let r = resolveCard(concept, card)
  const make = (res: Resolved): MountedModule => {
    const ac = new AbortController(), cleans: (() => void)[] = []
    const ctx: ModuleContext = Object.freeze({
      concept, meta: host.meta, signal: ac.signal, onCleanup: (f: () => void) => { if (typeof f === 'function') cleans.push(f) },
      fallback: res.fallback, errors: res.errors, ytUrl: host.ytUrl, fmt, esc, el, icons: ICONS,
    })
    return {
      ctx,
      destroy() {
        try { if (res.mod.destroy) res.mod.destroy(container, ctx) } catch (e) { console.error(`[modules] ${res.mod.type}.destroy failed`, e) }
        ac.abort()
        cleans.splice(0).forEach((f) => { try { f() } catch (e) { console.error(e) } })
      },
    }
  }
  let h = make(r)
  try { r.mod.render(container, r.spec, h.ctx) } catch (err: any) {
    console.error(`[modules] ${r.mod.type}.render failed → definition fallback`, err)
    h.destroy(); container.innerHTML = ''
    r = { mod: MODULES.get('definition')!, spec: fallbackSpec(concept, card), fallback: true, errors: ['render() threw: ' + (err && err.message)] }
    h = make(r); MODULES.get('definition')!.render(container, r.spec, h.ctx)
  }
  if (r.fallback) container.insertAdjacentHTML('afterbegin', `<div class="fallback-note">此卡片规格未通过校验，已回退为定义卡</div>`)
  return h
}

/* ---------- shared validators ---------- */
export const V = {
  str: (v: unknown, n: string, errs: string[]) => { if (typeof v !== 'string' || !v.trim()) errs.push(`${n} must be a non-empty string`) },
  num: (v: unknown, n: string, errs: string[]) => { if (typeof v !== 'number' || !isFinite(v)) errs.push(`${n} must be a finite number`) },
  arr: (v: unknown, n: string, errs: string[], min = 1): boolean => {
    if (!Array.isArray(v) || v.length < min) { errs.push(`${n} must be an array with ≥${min} item(s)`); return false }
    return true
  },
  ts: (v: unknown, n: string, errs: string[]) => {
    if (v != null && (!Array.isArray(v) || v.some((t) => typeof t !== 'number' || t < 0))) errs.push(`${n} must be an array of seconds`)
  },
}

const RESERVED = new Set(['x'])
export function validateParams(params: any, errs: string[]) {
  if (!V.arr(params, 'params', errs)) return
  const seen = new Set<string>()
  params.forEach((p: any, i: number) => {
    const n = `params[${i}]`
    if (!p || typeof p !== 'object') return errs.push(`${n} must be an object`)
    if (typeof p.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(p.name)) errs.push(`${n}.name must be an identifier`)
    else if (RESERVED.has(p.name) || DSL.reserved.has(p.name)) errs.push(`${n}.name "${p.name}" is reserved`)
    else if (seen.has(p.name)) errs.push(`${n}.name "${p.name}" duplicated`)
    else seen.add(p.name)
    V.str(p.label, `${n}.label`, errs); V.num(p.min, `${n}.min`, errs); V.num(p.max, `${n}.max`, errs); V.num(p.default, `${n}.default`, errs)
    if (p.step != null && !(typeof p.step === 'number' && p.step > 0)) errs.push(`${n}.step must be > 0`)
    if (p.min >= p.max) errs.push(`${n}: min must be < max`)
    if (p.default < p.min || p.default > p.max) errs.push(`${n}.default out of range`)
  })
}
