import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promoteScene } from '../scripts/promote-scene.mjs'

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-promote-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const episode = path.join(root, 'projects', 'demo', 'episodes', 'ep-001')
  fs.mkdirSync(path.join(episode, 'scenes'), { recursive: true })
  fs.mkdirSync(path.join(episode, 'qa'), { recursive: true })
  fs.writeFileSync(path.join(episode, 'scenes', 's01.mjs'), 'export function render() { return "ok" }\n')
  fs.writeFileSync(path.join(episode, 'preview.png'), 'PNGDATA')
  const qa = { status: 'PASS', sceneId: 'intro-template', checks: ['bounds', 'duration'], backend: 'browser', backendVersion: '1.0' }
  fs.writeFileSync(path.join(episode, 'qa', 's01.json'), JSON.stringify(qa))
  return { root, episode, files: { scene: path.join(episode, 'scenes', 's01.mjs'), preview: path.join(episode, 'preview.png'), qa: path.join(episode, 'qa', 's01.json') } }
}

test('the first scene promotes successfully into an empty library', (t) => {
  const { root, files } = setup(t)
  const result = promoteScene({
    id: 'intro-template', scene: files.scene, preview: files.preview, qa: files.qa,
    backend: 'browser', version: 2, tags: 'intro,title', purpose: 'Opening title card', dataRoot: root,
  })
  assert.equal(result.ok, true, result.errors.join('\n'))
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'library', 'catalog.json'), 'utf8'))
  assert.equal(catalog.entries.length, 1)
  const entry = catalog.entries[0]
  assert.equal(entry.id, 'intro-template')
  assert.equal(entry.templateVersion, 2)
  assert.equal(entry.backend, 'browser')
  assert.equal(entry.qaStatus, 'PASS')
  assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(entry.previewSha256, /^[a-f0-9]{64}$/)
  assert.match(entry.qaSha256, /^[a-f0-9]{64}$/)
  assert.ok(fs.existsSync(path.join(root, entry.sourcePath)))
  assert.ok(fs.existsSync(path.join(root, entry.preview)))
  assert.ok(fs.existsSync(path.join(root, entry.qaReportPath)))
  assert.equal(entry.backendCompatibility.renderer, 'browser')
})

test('invalid or contradictory QA is rejected without touching the catalog', (t) => {
  const { root, episode, files } = setup(t)
  fs.mkdirSync(path.join(root, 'library'), { recursive: true })
  const catalogPath = path.join(root, 'library', 'catalog.json')
  fs.writeFileSync(catalogPath, JSON.stringify({ schemaVersion: 1, entries: [] }, null, 2))
  const before = fs.readFileSync(catalogPath, 'utf8')
  const badQa = path.join(episode, 'qa', 'bad.json')
  fs.writeFileSync(badQa, JSON.stringify({ status: 'PASS', result: 'FAIL', blockers: ['clip'] }))
  const result = promoteScene({ id: 'bad-template', scene: files.scene, preview: files.preview, qa: badQa, dataRoot: root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /contradictory|non-empty blockers|not PASS/)
  assert.equal(fs.readFileSync(catalogPath, 'utf8'), before)
  assert.equal(fs.existsSync(path.join(root, 'library', 'scenes', 'bad-template')), false)
})

test('duplicate ids are rejected and the catalog stays byte-identical', (t) => {
  const { root, files } = setup(t)
  const first = promoteScene({ id: 'intro-template', scene: files.scene, preview: files.preview, qa: files.qa, dataRoot: root })
  assert.equal(first.ok, true, first.errors.join('\n'))
  const catalogPath = path.join(root, 'library', 'catalog.json')
  const before = fs.readFileSync(catalogPath, 'utf8')
  const second = promoteScene({ id: 'intro-template', scene: files.scene, preview: files.preview, qa: files.qa, dataRoot: root })
  assert.equal(second.ok, false)
  assert.match(second.errors.join('\n'), /already exists|refusing to overwrite/)
  assert.equal(fs.readFileSync(catalogPath, 'utf8'), before)
})

test('inputs outside projects or with the wrong shape are rejected', (t) => {
  const { root } = setup(t)
  const outside = path.join(root, 'outside.mjs')
  fs.writeFileSync(outside, 'x')
  const result = promoteScene({ id: 'outside-template', scene: outside, preview: outside, qa: outside, dataRoot: root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /inside .*projects/)
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'library', 'catalog.json'), 'utf8'))
  assert.equal(catalog.entries.length, 0)
})
