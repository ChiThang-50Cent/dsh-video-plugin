import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateStyleRefs } from '../scripts/validate-style-refs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const script = path.join(repoRoot, 'scripts', 'validate-style-refs.mjs')

function tempProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'style-refs-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const project = path.join(root, 'projects', 'demo')
  fs.mkdirSync(project, { recursive: true })
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: [] }, null, 2))
  return { root, project, library: path.join(root, 'library') }
}

function addStyle(library, id, overrides = {}) {
  const dir = path.join(library, 'styles', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'style.json'), JSON.stringify({
    schemaVersion: 1,
    id,
    language: 'vi',
    rights: 'Test fixture',
    source: 'reference.md',
    notes: 'notes.md',
    ...overrides,
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'reference.md'), '# Reference\n')
  fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes\n')
}

test('the repository style package validates', (t) => {
  const { project } = tempProject(t)
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['indeterminate-forms'] }))
  const result = validateStyleRefs(project, { library: path.join(repoRoot, 'library') })
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.data.checked, ['indeterminate-forms'])
})

test('a missing style package fails with the id', (t) => {
  const { project, library } = tempProject(t)
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['missing-style'] }))
  const result = validateStyleRefs(project, { library })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /missing-style/)
})

test('a style package needs an id, language, rights, source and existing files', (t) => {
  const { project, library } = tempProject(t)
  addStyle(library, 'broken', { id: 'other', language: '', rights: '', source: 'nope.md' })
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['broken'] }))
  const result = validateStyleRefs(project, { library })
  assert.equal(result.ok, false)
  const errors = result.errors.join('\n')
  assert.match(errors, /declares id "other"/)
  assert.match(errors, /needs a language/)
  assert.match(errors, /needs a rights note/)
  assert.match(errors, /source file is missing/)
})

test('the CLI reports a passing project with exit 0', (t) => {
  const { project, library } = tempProject(t)
  addStyle(library, 'demo')
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['demo'] }))
  const result = spawnSync(process.execPath, [script, project, '--library', library], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /RESULT: PASS/)
})

test('an installed package may exclude its source reference with an explanation', (t) => {
  const { project, library } = tempProject(t)
  addStyle(library, 'external', { source: 'reference.vi.md', sourceBundled: false, externalSource: 'The transcript stays in the user data library and is not redistributed.' })
  fs.rmSync(path.join(library, 'styles', 'external', 'reference.md'))
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['external'] }))
  const result = validateStyleRefs(project, { library })
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.match(result.warnings.join('\n'), /not bundled/)
})

test('a missing source needs sourceBundled: false and an externalSource note', (t) => {
  const { project, library } = tempProject(t)
  addStyle(library, 'broken-source', { source: 'reference.vi.md', sourceBundled: false })
  fs.rmSync(path.join(library, 'styles', 'broken-source', 'reference.md'))
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['broken-source'] }))
  const result = validateStyleRefs(project, { library })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /externalSource/)

  addStyle(library, 'source-bundled-true', { source: 'reference.vi.md', sourceBundled: true })
  fs.rmSync(path.join(library, 'styles', 'source-bundled-true', 'reference.md'))
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['source-bundled-true'] }))
  const result2 = validateStyleRefs(project, { library })
  assert.equal(result2.ok, false)
  assert.match(result2.errors.join('\n'), /source file is missing/)
})

test('duplicate style references are rejected with a clear message', (t) => {
  const { project, library } = tempProject(t)
  addStyle(library, 'demo')
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1, styleRefs: ['demo', 'demo'] }))
  const result = validateStyleRefs(project, { library })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /more than once/)
})

test('the project contract carries an empty styleRefs list', () => {
  const kit = JSON.parse(fs.readFileSync(path.join(repoRoot, 'kit', 'project.json'), 'utf8'))
  assert.ok(Array.isArray(kit.styleRefs))
  assert.equal(kit.styleRefs.length, 0)
})
