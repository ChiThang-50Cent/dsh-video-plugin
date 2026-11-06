import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { generateWorkerBrief } from '../scripts/worker-brief.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-brief-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const project = path.join(root, 'projects', 'series')
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
  write(path.join(project, 'project.json'), { visualStyle: 'brand', styleRefs: [] })
  write(path.join(root, 'library', 'visual-styles', 'brand', 'style.json'), { schemaVersion: 1, id: 'brand', colors: { ink: 'blue' }, typography: { body: { family: 'test-font' } } })
  function episode(name) {
    const dir = path.join(project, 'episodes', name)
    write(path.join(dir, 'production.json'), { mode: 'narrated' })
    write(path.join(dir, 'storyboard.json'), { scenes: [{ id: 'one', reuseClass: 'C', narrationSegments: ['a'], assets: ['assets/logo.png'], visualGoal: 'first' }, { id: 'two', reuseClass: 'C', narrationSegments: ['b'], visualGoal: 'second' }] })
    write(path.join(dir, 'timeline.json'), { scenes: [{ id: 'one', startSec: 0, durationSec: 2 }, { id: 'two', startSec: 2, durationSec: 3 }] })
    write(path.join(dir, 'audio/segments.json'), { segments: [{ id: 'a', text: 'first narration' }, { id: 'b', text: 'second narration' }] })
    write(path.join(dir, 'worker-plan.json'), { workers: [{ id: 'task-one', sceneId: 'one', wave: 0 }, { id: 'task-two', sceneId: 'two', wave: 0 }] })
    return dir
  }
  return { root, first: episode('first'), second: episode('second'), write }
}
const options = (root, scene, task) => ({ dataRoot: root, scene, task, wave: 'wave-one' })

test('brief blocks are stable across scenes and episodes and deterministic', t => {
  const f = fixture(t)
  const a = generateWorkerBrief(f.first, options(f.root, 'one', 'task-one'))
  const b = generateWorkerBrief(f.first, options(f.root, 'two', 'task-two'))
  const c = generateWorkerBrief(f.second, options(f.root, 'one', 'task-one'))
  assert.equal(a.blocks.studio, b.blocks.studio)
  assert.equal(a.blocks.studio, c.blocks.studio)
  assert.equal(a.blocks.episode, b.blocks.episode)
  assert.notEqual(a.blocks.scene, b.blocks.scene)
  assert.equal(a.brief, generateWorkerBrief(f.first, options(f.root, 'one', 'task-one')).brief)
  assert.equal(a.brief, a.blocks.studio + a.blocks.episode + a.blocks.scene)
  assert.equal(a.hashes.studio.sha256, c.hashes.studio.sha256)
})

test('brief supplies scene inputs, constraints, artifacts and completion contract', t => {
  const f = fixture(t)
  const result = generateWorkerBrief(f.first, options(f.root, 'one', 'task-one'))
  for (const text of ['first narration', 'test-font', 'assets/logo.png', 'work/task-one/**', 'work/task-one/scene-result.json', 'sceneId', 'changedFiles', 'backendVersion', 'qaReportPath', 'draw(ctx, t, api)', 'durationSec']) assert.ok(result.brief.includes(text), text)
  assert.ok(!result.brief.includes('second narration'))
  const cli = spawnSync(process.execPath, ['scripts/worker-brief.mjs', f.first, '--scene', 'one', '--task', 'task-one', '--wave', 'wave-one', '--data-root', f.root, '--json'], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  const output = JSON.parse(cli.stdout)
  assert.equal(output.brief, result.brief)
  assert.deepEqual(output.blocks, result.hashes)
})

test('missing inputs and non-custom scenes fail clearly', t => {
  const f = fixture(t)
  assert.throws(() => generateWorkerBrief(f.first, { scene: 'one' }), /task/)
  fs.rmSync(path.join(f.first, 'audio/segments.json'))
  assert.throws(() => generateWorkerBrief(f.first, options(f.root, 'one', 'task-one')), /audio\/segments.json/)
  f.write(path.join(f.first, 'storyboard.json'), { scenes: [{ id: 'one', reuseClass: 'A' }] })
  assert.throws(() => generateWorkerBrief(f.first, options(f.root, 'one', 'task-one')), /only custom C/)
})
