/**
 * null/0.1 — produces nothing (imports never block on organizing).
 * mock/0.1 — FOR UI DEVELOPMENT ONLY. Deterministic fake proposals marked
 * `by.mock = true`; never the default and never a fallback for llm.
 */

import { emptyResponse, rejectedSet } from './common.mjs'

export const NULL_BY = { kind: 'component', name: 'null', version: '0.1', model: null, promptVersion: null, mock: false }
export const MOCK_BY = { kind: 'component', name: 'mock', version: '0.1', model: null, promptVersion: null, mock: true }

export function createNullOrganizer() {
  return {
    name: 'null', by: NULL_BY, ready: true, reason: null, label: '不自动归类',
    async organize() { return emptyResponse(NULL_BY) },
  }
}

export function createMockOrganizer() {
  return {
    name: 'mock', by: MOCK_BY, ready: true, reason: null, label: '模拟整理（只供界面开发，未调用模型）',
    async organize(request, ctx = {}) {
      const res = emptyResponse(MOCK_BY)
      res.warnings.push('模拟整理：结果为示例，未调用模型')
      const rejected = rejectedSet(request.decisions)
      const catalog = ctx.conceptCatalog || []
      for (const item of request.items) {
        if (item.kind === 'idea') {
          if (catalog[0]) res.ideaAttachments.push({ subject: item.subject, conceptRef: catalog[0].ref, confidence: 0.5, reason: '模拟：挂到第一颗星' })
          continue
        }
        const goal = request.goals.find((g) => !rejected.has(`${item.subject}|${g.id}`))
        if (goal) res.assignments.push({ subject: item.subject, goalId: goal.id, confidence: 0.6, reason: '模拟：归入第一个目标', evidence: [] })
        else if (request.options.allowGoalProposals && !request.goals.length) {
          res.goalProposals.push({ title: `模拟目标：${item.title}`.slice(0, 40), intent: null, reason: '模拟：没有目标时提议一个', fromSubjects: [item.subject] })
        }
      }
      return res
    },
  }
}
