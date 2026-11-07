/**
 * JSON Schema validation against the C0 contract files in schemas/record/.
 * The schemas are read (never written) from the repository; the backend does
 * not keep its own copies so it cannot drift from the contract.
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const SCHEMA_DIR = fileURLToPath(new URL('../../../schemas/record/', import.meta.url))

let ajv = null

function instance() {
  if (ajv) return ajv
  ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const name of fs.readdirSync(SCHEMA_DIR)) {
    if (!name.endsWith('.schema.json')) continue
    const schema = JSON.parse(fs.readFileSync(SCHEMA_DIR + name, 'utf8'))
    ajv.addSchema(schema, name)
  }
  return ajv
}

/**
 * Validate `value` against schemas/record/<name>.schema.json.
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function validate(name, value) {
  const fn = instance().getSchema(`${name}.schema.json`)
  if (!fn) throw new Error(`Unknown record schema "${name}"`)
  if (fn(value)) return { ok: true }
  return { ok: false, message: describeErrors(fn.errors) }
}

/** Compile an arbitrary (internal) schema with the same Ajv instance. */
export function compile(schema) {
  return instance().compile(schema)
}

export function describeErrors(errors) {
  return (errors || []).slice(0, 5)
    .map((e) => `${e.instancePath || '/'} ${e.message}`)
    .join('; ')
}
