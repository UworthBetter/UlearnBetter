/** 热力、连续天数、资料状态文案。不写决定层，也不读 DOM。 */

export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface DayMinute {
  date: string
  minutes: number
  beforeStart: boolean
}

export interface HeatCell extends DayMinute {
  future: boolean
  level: HeatLevel
}

/** 琥珀单色 5 档：无、≤20、≤35、≤45、>45 分钟。开始前的格子由调用方另画虚线。 */
export function heatLevel(minutes: number): HeatLevel {
  if (!(minutes > 0)) return 0
  if (minutes <= 20) return 1
  if (minutes <= 35) return 2
  if (minutes <= 45) return 3
  return 4
}

export function shiftDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return date.toISOString().slice(0, 10)
}

export function lastNineDays(days: DayMinute[], anchor?: string): HeatCell[] {
  const known = new Map(days.map((day) => [day.date, day]))
  const end = anchor
    ?? days.reduce((latest, day) => (day.date > latest ? day.date : latest), days[0]?.date ?? '1970-01-01')
  const firstReal = days.find((day) => !day.beforeStart)?.date ?? end
  const cells: HeatCell[] = []
  for (let index = 8; index >= 0; index -= 1) {
    const date = shiftDate(end, -index)
    const found = known.get(date)
    if (found) {
      cells.push({
        ...found,
        future: false,
        level: found.beforeStart ? 0 : heatLevel(found.minutes),
      })
      continue
    }
    const future = date > end
    cells.push({
      date,
      minutes: 0,
      beforeStart: !future && date < firstReal,
      future,
      level: 0,
    })
  }
  return cells
}

/** 5 列周 × 7 行（周一到周日），结束于 anchor 所在周。 */
export function heatCalendar(days: DayMinute[], anchor?: string): HeatCell[][] {
  const known = new Map(days.map((day) => [day.date, day]))
  const end = anchor
    ?? days.reduce((latest, day) => (day.date > latest ? day.date : latest), days[0]?.date ?? '1970-01-01')
  const firstReal = days.find((day) => !day.beforeStart)?.date ?? end
  const endDate = new Date(`${end}T00:00:00Z`)
  const mondayOffset = (endDate.getUTCDay() + 6) % 7
  const thisMonday = shiftDate(end, -mondayOffset)
  const start = shiftDate(thisMonday, -7 * 4)
  const columns: HeatCell[][] = [[], [], [], [], []]
  for (let week = 0; week < 5; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = shiftDate(start, week * 7 + weekday)
      const found = known.get(date)
      const future = date > end
      if (found) {
        columns[week].push({
          ...found,
          future,
          level: found.beforeStart || future ? 0 : heatLevel(found.minutes),
        })
      } else {
        columns[week].push({
          date,
          minutes: 0,
          beforeStart: !future && date < firstReal,
          future,
          level: 0,
        })
      }
    }
  }
  return columns
}

export function trendReady(days: DayMinute[]): boolean {
  return new Set(days.filter((day) => !day.beforeStart).map((day) => day.date)).size >= 3
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} 分`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

export function formatHoursCompact(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const hours = minutes / 60
  if (hours < 1) return `${Math.max(1, Math.round(minutes))}m`
  const digits = hours < 10 ? 1 : 0
  return `${hours.toFixed(digits)}h`
}

/** 小于等于 1 视为比率，否则视为已经是百分数。 */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—'
  const percent = rate <= 1 ? rate * 100 : rate
  return `${Math.round(percent)}%`
}

export function formatDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}月${Number(day)}日`
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

export interface StreakDisplay {
  primary: string
  note: string | null
}

/** 刚开始用时主读数是「—」。有连续天数但今天还没学，下面注「今天还没开始」。 */
export function streakDisplay(streakDays: number, todayDone: boolean, learned: number): StreakDisplay {
  if (learned <= 0 && streakDays <= 0) return { primary: '—', note: null }
  if (streakDays <= 0) return { primary: '—', note: todayDone ? null : '今天还没开始' }
  return {
    primary: `${streakDays} 天`,
    note: todayDone ? null : '今天还没开始',
  }
}

export type ItemStatus = 'organizing' | 'pending' | 'done' | 'failed'
export type ItemKind = 'notes' | 'video' | 'idea' | 'article' | 'pdf'

export function statusCopy(input: {
  status: ItemStatus
  kind: ItemKind
  conceptCount: number
  goalTitles: string[]
  pipelineState: 'queued' | 'running' | 'done' | 'failed' | 'unsupported'
  pipelineReason: string | null
  attachLabel: string | null
}): string {
  if (input.status === 'failed') return `失败 · ${input.pipelineReason || '整理没有完成'}`
  if (input.status === 'organizing') {
    if (input.kind === 'video') {
      if (input.pipelineState === 'queued') return input.pipelineReason ? `排队 · ${input.pipelineReason}` : '排队 · 等待整理'
      return '整理中 · 解析字幕 → 生成笔记'
    }
    return '整理中 · 正在抽取概念'
  }
  if (input.status === 'pending') {
    if (input.kind === 'idea' && input.attachLabel) return `待确认 · 挂到「${input.attachLabel}」？`
    if (input.goalTitles.length >= 2) return '待确认 · 同时属于两个目标？'
    if (input.goalTitles.length === 1) return `待确认 · 归到「${input.goalTitles[0]}」？`
    return '待确认'
  }
  const stars = `${input.conceptCount} 颗星`
  if (input.goalTitles.length > 0) return `已整理 · ${stars} → ${input.goalTitles.join('、')}`
  return `已整理 · ${stars}`
}

export function kindLabel(kind: ItemKind): string {
  if (kind === 'notes') return '课程笔记'
  if (kind === 'video') return '视频'
  if (kind === 'idea') return '想法'
  if (kind === 'article') return '文章'
  return 'PDF'
}

export function entryKindLabel(kind: 'review' | 'new' | 'practice'): string {
  if (kind === 'review') return '复习'
  if (kind === 'practice') return '实操'
  return '新学'
}

/** 图表系列色只按目标 colorKey，不按目标名字。 */
export function seriesColor(colorKey: 'amber' | 'cyan' | 'violet' | undefined, index: number): string {
  if (colorKey === 'amber') return '#c4801f'
  if (colorKey === 'cyan') return '#3a92d6'
  if (colorKey === 'violet') return '#8d78c9'
  return index % 2 === 0 ? '#c4801f' : '#3a92d6'
}

export function goalSwatch(colorKey: 'amber' | 'cyan' | 'violet'): string {
  if (colorKey === 'cyan') return 'var(--cyan, #86dcff)'
  if (colorKey === 'violet') return 'var(--pending, #c9b6ff)'
  return 'var(--amber, #ffb547)'
}

export function organizerPhrase(by: { name: string; mock: boolean; model: string | null }): string {
  if (by.name === 'folder') return '按文件夹归类（没调用模型）'
  if (by.mock) return `${by.name}（模拟）`
  if (!by.model) return by.name
  return by.name
}

const STEP_LABEL: Record<string, string> = {
  read: '读取',
  identify: '识别',
  extract: '抽概念',
  classify: '归类',
  compile: '编译',
}

export const PIPELINE_STEPS = ['read', 'identify', 'extract', 'classify', 'compile'] as const

export function stepLabel(key: string): string {
  return STEP_LABEL[key] ?? key
}
