/** Shared organizer helpers. */

export class OrganizerError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'OrganizerError'
    this.code = code
  }
}

export function rejectedSet(decisions) {
  return new Set((decisions?.rejected || []).map((r) => `${r.subject}|${r.goalId}`))
}

/** Remove rejected (subject, goalId) pairs. Applied again after every organizer. */
export function filterRejected(response, decisions) {
  const rejected = rejectedSet(decisions)
  const kept = []
  let dropped = 0
  for (const a of response.assignments) {
    if (a.goalId && rejected.has(`${a.subject}|${a.goalId}`)) dropped++
    else kept.push(a)
  }
  return { response: { ...response, assignments: kept }, dropped }
}

export function emptyResponse(by) {
  return { schema: 'learning.organize/0.1', organizer: { ...by }, assignments: [], goalProposals: [], ideaAttachments: [], warnings: [] }
}
