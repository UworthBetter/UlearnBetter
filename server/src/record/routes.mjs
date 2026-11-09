/**
 * /api/record/* — HTTP surface of the record layer (CONTRACTS.md v0.2).
 *
 * Every success is an envelope {schema:'learning.record-api/0.1', data, meta}
 * with meta.source === 'record' (items produced by the mock organizer carry
 * by.mock instead). Errors are HTTP 4xx/5xx + {error, message}. Request
 * bodies are capped at 64 kB. Request bodies, note text and idea text are
 * never logged.
 */

import express from 'express'
import { RecordError } from './service.mjs'
import { StoreError } from './store.mjs'
import { isValidDate, isValidTz } from './derive/time.mjs'

export const API_SCHEMA = 'learning.record-api/0.1'

function envelope(data, warnings = []) {
  return { schema: API_SCHEMA, data, meta: { source: 'record', generatedAt: new Date().toISOString(), warnings } }
}

function single(value, name) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new RecordError(400, 'invalid_query', `${name} 只能给一个值`)
  return value
}

function tzOf(req, warnings) {
  const tz = single(req.query.tz, 'tz')
  if (tz === undefined || tz === '') {
    warnings.push('未提供 tz，按 UTC 聚合')
    return 'UTC'
  }
  if (!isValidTz(tz)) throw new RecordError(400, 'invalid_tz', 'tz 必须是 IANA 时区名，例如 Asia/Shanghai')
  return tz
}

export function createRecordRouter(service) {
  const router = express.Router()
  router.use(express.json({ limit: '64kb' }))

  const handle = (fn) => async (req, res, next) => {
    try {
      const warnings = []
      try {
        await service.refresh()
      } catch (err) {
        warnings.push(`主题扫描失败：${err?.message || err}`)
      }
      const out = await fn(req, warnings)
      res.status(out.status || 200).json(envelope(out.data, [...warnings, ...(out.warnings || [])]))
    } catch (err) {
      next(err)
    }
  }

  router.get('/health', handle(async () => ({ data: service.health() })))

  router.get('/topics', handle(async () => ({ data: service.listTopics() })))
  router.get('/topics/:topicId/notes', handle(async (req) => ({ data: await service.listTopicNotes(req.params.topicId) })))
  router.get('/topics/:topicId/notes/file', handle(async (req) => {
    const p = single(req.query.path, 'path')
    if (!p) throw new RecordError(400, 'invalid_query', '缺少 path')
    return { data: await service.readTopicNote(req.params.topicId, p) }
  }))
  router.get('/topics/:topicId/learn', handle(async (req, w) => ({ data: await service.getTopicLearn(req.params.topicId, tzOf(req, w)) })))

  router.get('/goals', handle(async () => ({ data: service.listGoals() })))
  router.post('/goals', handle(async (req) => {
    const { goal, warnings } = await service.createGoal(req.body)
    return { status: 201, data: goal, warnings }
  }))
  router.patch('/goals/:id', handle(async (req) => {
    const { goal, warnings } = await service.updateGoal(req.params.id, req.body)
    return { data: goal, warnings }
  }))

  router.get('/proposals', handle(async () => ({ data: service.getProposals() })))

  router.get('/items', handle(async (req) => ({
    data: service.listItems({ status: single(req.query.status, 'status'), kind: single(req.query.kind, 'kind') }),
  })))
  router.get('/items/:id', handle(async (req) => ({ data: service.getItem(req.params.id) })))
  router.post('/items', handle(async (req) => {
    const { item, created, warnings } = await service.addItem(req.body)
    return { status: created ? 201 : 200, data: item, warnings }
  }))
  router.post('/items/:id/organize', handle(async (req) => {
    const { log, warnings } = await service.organizeItem(req.params.id)
    return { status: 201, data: log, warnings }
  }))

  router.get('/changelog', handle(async (req) => ({ data: service.listChangeLog(single(req.query.itemId, 'itemId')) })))
  router.post('/changelog/:id/undo', handle(async (req) => ({ data: await service.undoChangeLog(req.params.id) })))

  router.get('/overrides', handle(async (req) => ({ data: service.listOverrides(single(req.query.target, 'target')) })))
  router.post('/overrides', handle(async (req) => {
    const { result, created } = await service.addOverride(req.body)
    return { status: created ? 201 : 200, data: result }
  }))

  router.get('/events', handle(async (req) => ({
    data: service.listEvents({ since: single(req.query.since, 'since'), limit: single(req.query.limit, 'limit') }),
  })))
  router.post('/events', handle(async (req) => ({ data: await service.addEvents(req.body) })))

  router.get('/mastery', handle(async (req, w) => ({ data: service.getMastery(single(req.query.topicId, 'topicId'), tzOf(req, w)) })))
  router.get('/today', handle(async (req, w) => {
    const date = single(req.query.date, 'date')
    if (date !== undefined && !isValidDate(date)) throw new RecordError(400, 'invalid_query', 'date 应为 YYYY-MM-DD')
    return { data: service.getToday(date, tzOf(req, w)) }
  }))
  router.get('/stats', handle(async (req, w) => {
    const range = single(req.query.range, 'range') ?? 'week'
    if (!['week', 'month', 'all'].includes(range)) throw new RecordError(400, 'invalid_query', 'range 必须是 week / month / all')
    return { data: service.getStats(range, tzOf(req, w)) }
  }))
  router.get('/panorama', handle(async (req, w) => ({ data: service.getPanorama(single(req.query.goalId, 'goalId'), tzOf(req, w)) })))

  router.use((_req, res) => res.status(404).json({ error: 'not_found', message: '记录接口不存在' }))

  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large', message: '请求体超过 64 kB' })
    if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'invalid_json', message: '请求体不是合法 JSON' })
    if (err instanceof RecordError) return res.status(err.status).json({ error: err.code, message: err.message })
    if (err instanceof StoreError) return res.status(503).json({ error: err.code, message: err.message })
    // eslint-disable-next-line no-console
    // Only the error class is logged: messages may quote request or note text.
    console.error('[record] internal error:', err?.name || 'Error', err?.code || '')
    return res.status(500).json({ error: 'internal_error', message: '记录层内部错误' })
  })

  return router
}
