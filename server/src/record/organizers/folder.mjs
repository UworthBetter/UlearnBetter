/**
 * folder/0.1 — map a topic's parent folder name to a goal (the baseline that
 * matches today's manual habit). No model call.
 *
 * folderHint equals a goal's title or one of its `folders` after NFKC + trim +
 * lowercase on both sides → confidence 0.9, reason
 * 「目录名『<original folderHint>』与目标『<goal title>』对应」. Ideas are not
 * handled. Rejected (subject, goalId) pairs are filtered.
 * Conformance: samples/record/organize/{request,folder.expected}.json (the
 * Python implementation in tools/learning tests the same file).
 */

import { normalizeFolder } from '../ids.mjs'
import { rejectedSet } from './common.mjs'

export const FOLDER_BY = { kind: 'component', name: 'folder', version: '0.1', model: null, promptVersion: null, mock: false }

export function createFolderOrganizer() {
  return {
    name: 'folder',
    by: FOLDER_BY,
    ready: true,
    reason: null,
    label: '按文件夹归类（没调用模型）',
    async organize(request) {
      const rejected = rejectedSet(request.decisions)
      const assignments = []
      for (const item of request.items) {
        if (item.kind === 'idea' || item.folderHint == null) continue
        const hint = normalizeFolder(item.folderHint)
        if (!hint) continue
        for (const goal of request.goals) {
          const names = [goal.title, ...goal.folders].map(normalizeFolder)
          if (!names.includes(hint)) continue
          if (rejected.has(`${item.subject}|${goal.id}`)) continue
          assignments.push({
            subject: item.subject,
            goalId: goal.id,
            confidence: 0.9,
            reason: `目录名「${item.folderHint}」与目标「${goal.title}」对应`,
            evidence: [],
          })
        }
      }
      return { schema: 'learning.organize/0.1', organizer: { ...FOLDER_BY }, assignments, goalProposals: [], ideaAttachments: [], warnings: [] }
    },
  }
}
