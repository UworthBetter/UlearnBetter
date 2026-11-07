/* =====================================================================
   Tiny whitelisted expression DSL (no eval / Function).
   numbers, + - * / % ^, parentheses, variables (params + x),
   functions: log2 log10 ln sqrt abs min max pow floor ceil round exp,  constants: pi e phi
   ===================================================================== */
export type Env = Record<string, number>
export type Compiled = (env: Env) => number

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

const FN: Record<string, [number, (...a: number[]) => number]> = Object.assign(Object.create(null), {
  log2: [1, Math.log2], log10: [1, Math.log10], ln: [1, Math.log], sqrt: [1, Math.sqrt], abs: [1, Math.abs],
  floor: [1, Math.floor], ceil: [1, Math.ceil], round: [1, Math.round], exp: [1, Math.exp],
  min: [2, Math.min], max: [2, Math.max], pow: [2, Math.pow],
})
const CONST: Record<string, number> = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 })
const reserved = new Set([...Object.keys(FN), ...Object.keys(CONST)])

function tokenize(src: unknown): Tok[] {
  if (typeof src !== 'string') throw new Error('expression must be a string')
  if (src.length > 200) throw new Error('expression too long')
  const out: Tok[] = [], re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/%^(),]))/y
  let i = 0
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) throw new Error(`unexpected character "${src.slice(i).trim()[0]}"`)
    out.push(m[1] ? { t: 'num', v: parseFloat(m[1]) } : m[2] ? { t: 'id', v: m[2] } : { t: 'op', v: m[3] })
    i = re.lastIndex
  }
  return out
}

/** compile(src, allowedVars) → (env) => number. Throws on syntax / unknown identifiers. */
function compile(src: unknown, vars: string[]): Compiled {
  const toks = tokenize(src), allowed = new Set(vars)
  let pos = 0, depth = 0
  const peek = () => toks[pos], isOp = (v: string) => toks[pos] && toks[pos].t === 'op' && toks[pos].v === v
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`expected "${v}"`); pos++ }
  const guard = () => { if (++depth > 40) throw new Error('expression too deep') }
  function sum(): Compiled {
    let a = prod()
    while (isOp('+') || isOp('-')) { const o = toks[pos++].v, l = a, r = prod(); a = o === '+' ? (env) => l(env) + r(env) : (env) => l(env) - r(env) }
    return a
  }
  function prod(): Compiled {
    let a = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const o = toks[pos++].v, l = a, r = unary()
      a = o === '*' ? (env) => l(env) * r(env) : o === '/' ? (env) => l(env) / r(env) : (env) => l(env) % r(env)
    }
    return a
  }
  function unary(): Compiled {
    guard()
    if (isOp('-')) { pos++; const a = unary(); depth--; return (env) => -a(env) }
    if (isOp('+')) { pos++; const a = unary(); depth--; return a }
    const a = power(); depth--; return a
  }
  function power(): Compiled {
    const b = atom()
    if (isOp('^')) { pos++; const ex = unary(); return (env) => Math.pow(b(env), ex(env)) }
    return b
  }
  function atom(): Compiled {
    const t = peek(); if (!t) throw new Error('unexpected end of expression')
    if (t.t === 'num') { pos++; const v = t.v; return () => v }
    if (t.t === 'id') {
      pos++
      if (isOp('(')) {
        const f = FN[t.v]; if (!f) throw new Error(`unknown function "${t.v}"`)
        pos++; guard()
        const args = [sum()]
        while (isOp(',')) { pos++; args.push(sum()) }
        expect(')'); depth--
        if (args.length !== f[0]) throw new Error(`${t.v}() takes ${f[0]} argument(s)`)
        const fn = f[1]
        return args.length === 1 ? (env) => fn(args[0](env)) : (env) => fn(args[0](env), args[1](env))
      }
      if (t.v in CONST) { const v = CONST[t.v]; return () => v }
      if (!allowed.has(t.v)) throw new Error(`unknown variable "${t.v}"`)
      const name = t.v
      return (env) => env[name]
    }
    if (t.v === '(') { pos++; guard(); const a = sum(); expect(')'); depth--; return a }
    throw new Error(`unexpected "${t.v}"`)
  }
  if (!toks.length) throw new Error('empty expression')
  const fn = sum()
  if (pos < toks.length) throw new Error(`unexpected "${toks[pos].v}"`)
  return (env) => { const v = fn(env); return typeof v === 'number' ? v : NaN }
}

export const DSL = { compile, reserved }
