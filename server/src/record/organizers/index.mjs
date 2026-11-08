/** Organizer selection: RECORD_ORGANIZER=null|folder|llm|mock (default folder). */

import { createFolderOrganizer } from './folder.mjs'
import { createMockOrganizer, createNullOrganizer } from './basic.mjs'
import { createLlmOrganizer } from './llm.mjs'

export const ORGANIZER_NAMES = ['null', 'folder', 'llm', 'mock']

/**
 * @param {string} name
 * @param {{model?: object|null, modelName?: string|null, reason?: string|null}} llm
 */
export function createOrganizer(name, llm = {}) {
  switch (name) {
    case 'null': return createNullOrganizer()
    case 'folder': return createFolderOrganizer()
    case 'mock': return createMockOrganizer()
    case 'llm': return createLlmOrganizer({ model: llm.model ?? null, modelName: llm.modelName ?? null, reason: llm.reason ?? null })
    default: throw new Error(`unknown organizer "${name}"`)
  }
}
