/** Calendar helpers. Day aggregation always happens in an explicit IANA tz. */

const formatters = new Map()

export function isValidTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 'YYYY-MM-DD' of an instant in `tz`. */
export function localDate(instant, tz) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    formatters.set(tz, f)
  }
  const d = instant instanceof Date ? instant : new Date(instant)
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDate(text) {
  if (typeof text !== 'string' || !DATE_RE.test(text)) return false
  const d = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text
}

/** Pure calendar arithmetic on 'YYYY-MM-DD'. */
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a) for 'YYYY-MM-DD' strings. */
export function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export function daysAgoText(n) {
  if (n <= 0) return '今天'
  if (n === 1) return '昨天'
  return `${n} 天前`
}
