import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveWithinRoot, searchNotes, readNote } from '../../server/src/notes.mjs'

async function makeRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ulb-notes-'))
  await fs.writeFile(path.join(dir, 'algebra.md'), '# Algebra\nA group is a set with an operation.\n')
  await fs.mkdir(path.join(dir, 'sub'))
  await fs.writeFile(path.join(dir, 'sub', 'rings.md'), 'A ring has addition and multiplication.\n')
  await fs.writeFile(path.join(dir, 'secret.bin'), 'binary-not-indexed')
  return dir
}

test('resolveWithinRoot blocks traversal and absolute escape', () => {
  const root = '/srv/notes'
  assert.equal(resolveWithinRoot(root, '../etc/passwd'), null)
  assert.equal(resolveWithinRoot(root, '../../etc/passwd'), null)
  assert.equal(resolveWithinRoot(root, '/etc/passwd'), path.resolve('/srv/notes/etc/passwd'))
  assert.equal(resolveWithinRoot(root, 'sub/a.md'), path.resolve('/srv/notes/sub/a.md'))
})

test('searchNotes finds content matches confined to root', async () => {
  const root = await makeRoot()
  const res = await searchNotes(root, 'multiplication')
  assert.equal(res.ok, true)
  assert.equal(res.results.length, 1)
  assert.equal(res.results[0].path, path.join('sub', 'rings.md'))
  assert.match(res.results[0].snippet, /multiplication/)
})

test('searchNotes empty query fails cleanly', async () => {
  const root = await makeRoot()
  const res = await searchNotes(root, '   ')
  assert.equal(res.ok, false)
})

test('readNote reads within root and refuses escapes', async () => {
  const root = await makeRoot()
  const ok = await readNote(root, 'algebra.md')
  assert.equal(ok.ok, true)
  assert.match(ok.content, /group is a set/)

  const esc = await readNote(root, '../../etc/passwd')
  assert.equal(esc.ok, false)
  assert.match(esc.message, /outside the configured notes root/)

  const missing = await readNote(root, 'nope.md')
  assert.equal(missing.ok, false)

  const wrongType = await readNote(root, 'secret.bin')
  assert.equal(wrongType.ok, false)
})
