import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTopicNotes, NotesError } from '../../server/src/record/topic-notes.mjs'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ub-notes-'))
  const learn = path.join(root, 'learn')
  const vault = path.join(root, 'vault')
  // topic A keeps its own notes (video pipeline layout)
  await fs.mkdir(path.join(learn, 'topic-a', 'notes', '02-概念卡'), { recursive: true })
  await fs.writeFile(path.join(learn, 'topic-a', 'learn.json'), '{}')
  await fs.writeFile(path.join(learn, 'topic-a', 'notes', '学习主页.md'), '# 主页\n[[概念一]]')
  await fs.writeFile(path.join(learn, 'topic-a', 'notes', '02-概念卡', '概念一.md'), '# 概念一')
  await fs.writeFile(path.join(learn, 'topic-a', 'notes', '02-概念卡', 'image.png'), 'x')
  await fs.writeFile(path.join(root, 'secret.md'), 'secret')
  // topic B lives in the vault under <folderHint>/<title>
  await fs.mkdir(path.join(learn, 'topic-b'), { recursive: true })
  await fs.writeFile(path.join(learn, 'topic-b', 'learn.json'), '{}')
  await fs.mkdir(path.join(vault, '量化', '凯利'), { recursive: true })
  await fs.writeFile(path.join(vault, '量化', '凯利', '00-Home.md'), '# Home')
  const entry = (id, title, folderHint) => ({ learnPath: path.join(learn, id, 'learn.json'), manifest: { topic: { id, title }, folderHint } })
  return { root, learn, vault, entry }
}

test('topic notes: own notes dir is listed (md only) and readable', async () => {
  const f = await fixture()
  const notes = createTopicNotes({ notesDir: null })
  const list = await notes.list(f.entry('topic-a', 'A', null))
  assert.equal(list.available, true)
  assert.equal(list.origin, 'topic')
  assert.deepEqual(list.files.map((x) => x.path).sort(), ['02-概念卡/概念一.md', '学习主页.md'])
  const note = await notes.read(f.entry('topic-a', 'A', null), '02-概念卡/概念一.md')
  assert.equal(note.text, '# 概念一')
  assert.equal(note.title, '概念一')
})

test('topic notes: vault fallback by folderHint/title', async () => {
  const f = await fixture()
  const notes = createTopicNotes({ notesDir: f.vault })
  const list = await notes.list(f.entry('topic-b', '凯利', '量化'))
  assert.equal(list.origin, 'vault')
  assert.deepEqual(list.files.map((x) => x.path), ['00-Home.md'])
  const none = await createTopicNotes({ notesDir: null }).list(f.entry('topic-b', '凯利', '量化'))
  assert.equal(none.available, false)
  assert.ok(none.reason)
})

test('topic notes: traversal, absolute, non-md and symlink escapes are refused', async () => {
  const f = await fixture()
  const notes = createTopicNotes({ notesDir: null })
  const a = f.entry('topic-a', 'A', null)
  for (const bad of ['../../secret.md', '/etc/passwd.md', '02-概念卡/image.png', '', 'a\0b.md', '..\\..\\secret.md']) {
    await assert.rejects(notes.read(a, bad), (err) => err instanceof NotesError && err.status >= 400 && err.status < 500, bad)
  }
  await fs.symlink(path.join(f.root, 'secret.md'), path.join(f.learn, 'topic-a', 'notes', 'leak.md'))
  await assert.rejects(notes.read(a, 'leak.md'), (err) => err instanceof NotesError && err.code === 'invalid_path')
  // a title that tries to climb out of the vault is ignored
  const sneaky = await createTopicNotes({ notesDir: f.vault }).list(f.entry('topic-b', '..', '..'))
  assert.equal(sneaky.available, false)
})
