import assert from 'node:assert/strict'
import test from 'node:test'
import { heatLevel, statusCopy, streakDisplay } from '../concept-graph/src/views/format.ts'

test('热力按分钟分五档', () => {
  assert.equal(heatLevel(0), 0)
  assert.equal(heatLevel(-3), 0)
  assert.equal(heatLevel(Number.NaN), 0)
  assert.equal(heatLevel(20), 1)
  assert.equal(heatLevel(20.1), 2)
  assert.equal(heatLevel(35), 2)
  assert.equal(heatLevel(45), 3)
  assert.equal(heatLevel(46), 4)
})

test('连续天数：还没学过显示破折号，有连续但今天没学时加注', () => {
  assert.deepEqual(streakDisplay(0, false, 0), { primary: '—', note: null })
  assert.deepEqual(streakDisplay(0, false, 2), { primary: '—', note: '今天还没开始' })
  assert.deepEqual(streakDisplay(3, false, 2), { primary: '3 天', note: '今天还没开始' })
  assert.deepEqual(streakDisplay(3, true, 2), { primary: '3 天', note: null })
})

test('资料状态文案', () => {
  const base = {
    status: 'done',
    kind: 'notes',
    conceptCount: 3,
    goalTitles: ['纸上实验'],
    pipelineState: 'done',
    pipelineReason: null,
    attachLabel: null,
  }
  assert.equal(statusCopy({ ...base, status: 'failed', pipelineReason: '合成失败状态' }), '失败 · 合成失败状态')
  assert.equal(statusCopy({
    ...base,
    status: 'organizing',
    kind: 'video',
    pipelineState: 'queued',
    pipelineReason: '未配置模型（ASSISTANT_*），视频笔记无法生成',
  }), '排队 · 未配置模型（ASSISTANT_*），视频笔记无法生成')
  assert.equal(statusCopy({
    ...base,
    status: 'organizing',
    kind: 'video',
    pipelineState: 'running',
  }), '整理中 · 解析字幕 → 生成笔记')
  assert.equal(statusCopy({ ...base, status: 'organizing', pipelineState: 'running' }), '整理中 · 正在抽取概念')
  assert.equal(statusCopy({
    ...base,
    status: 'pending',
    kind: 'idea',
    attachLabel: '观察',
    goalTitles: [],
  }), '待确认 · 挂到「观察」？')
  assert.equal(statusCopy({ ...base, status: 'pending', goalTitles: ['纸上实验', '手作研究'] }), '待确认 · 同时属于两个目标？')
  assert.equal(statusCopy({ ...base, status: 'pending', goalTitles: ['纸上实验'] }), '待确认 · 归到「纸上实验」？')
  assert.equal(statusCopy(base), '已整理 · 3 颗星 → 纸上实验')
})
