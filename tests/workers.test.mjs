import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { validateWorkerPlan, validateWorkerResult, globToRegExp } from '../scripts/validate-workers.mjs'

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-workers-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('depth and concurrency are separate limits', () => {
  const sequential = validateWorkerPlan({ workers: [
    { id: 'w1', sceneId: 's01', delegationDepth: 1, startedAt: 0, finishedAt: 10 },
    { id: 'w2', sceneId: 's02', delegationDepth: 1, startedAt: 10, finishedAt: 20 },
    { id: 'w3', sceneId: 's03', delegationDepth: 1, startedAt: 20, finishedAt: 30 },
  ] })
  assert.equal(sequential.ok, true, sequential.errors.join('\n'))
  assert.equal(sequential.data.concurrency.maxObserved, 1)
  assert.equal(sequential.data.delegationDepth.maxObserved, 1)

  const concurrent = validateWorkerPlan({ workers: [
    { id: 'w1', startedAt: 0, finishedAt: 10 },
    { id: 'w2', startedAt: 1, finishedAt: 9 },
    { id: 'w3', startedAt: 2, finishedAt: 8 },
  ] })
  assert.equal(concurrent.ok, false)
  assert.match(concurrent.errors.join('\n'), /concurrency 3 exceeds the limit of 2/)

  const nested = validateWorkerPlan({ workers: [{ id: 'w1', delegationDepth: 2, startedAt: 0, finishedAt: 1 }] })
  assert.equal(nested.ok, false)
  assert.match(nested.errors.join('\n'), /delegation depth 2/)
})

test('two concurrent workers at depth one are allowed', () => {
  const plan = validateWorkerPlan({ workers: [
    { id: 'w1', delegationDepth: 1, startedAt: 0, finishedAt: 10 },
    { id: 'w2', delegationDepth: 1, startedAt: 2, finishedAt: 9 },
  ] })
  assert.equal(plan.ok, true, plan.errors.join('\n'))
  assert.equal(plan.data.concurrency.maxObserved, 2)
})

test('worker results must stay inside the assigned work directory and allowlist', (t) => {
  const root = temp(t)
  const episode = path.join(root, 'episode')
  const work = path.join(episode, 'work', 's01')
  fs.mkdirSync(work, { recursive: true })
  fs.writeFileSync(path.join(work, 'scene.mjs'), 'export const scene = 1\n')
  fs.writeFileSync(path.join(work, 'qa.json'), JSON.stringify({ status: 'PASS' }))
  const result = {
    sceneId: 's01',
    status: 'PASS',
    changedFiles: ['work/s01/scene.mjs'],
    codePaths: ['work/s01/scene.mjs'],
    previewPaths: [],
    qaReportPath: 'work/s01/qa.json',
    reuse: 'C',
  }
  const ok = validateWorkerResult(episode, result, { allow: ['work/s01/**'], skipBaseline: true })
  assert.equal(ok.ok, true, ok.errors.join('\n'))
  assert.deepEqual(ok.data.changedFiles, ['work/s01/scene.mjs'])

  const wrongAllow = validateWorkerResult(episode, result, { allow: ['work/s01/preview/**'], skipBaseline: true })
  assert.equal(wrongAllow.ok, false)
  assert.match(wrongAllow.errors.join('\n'), /allowlist/)

  fs.writeFileSync(path.join(episode, 'narration.md'), 'do not touch')
  const protectedResult = { ...result, changedFiles: ['work/s01/scene.mjs', 'narration.md'] }
  const protectedCheck = validateWorkerResult(episode, protectedResult, {})
  assert.equal(protectedCheck.ok, false)
  assert.match(protectedCheck.errors.join('\n'), /protected\/shared artifact/)
})

test('symlink escapes are rejected even when the declared path is inside work/', (t) => {
  const root = temp(t)
  const episode = path.join(root, 'episode')
  const work = path.join(episode, 'work', 's01')
  fs.mkdirSync(work, { recursive: true })
  const outside = path.join(root, 'outside.mjs')
  fs.writeFileSync(outside, 'outside')
  fs.symlinkSync(outside, path.join(work, 'link.mjs'))
  const result = { sceneId: 's01', status: 'PASS', changedFiles: ['work/s01/link.mjs'] }
  const check = validateWorkerResult(episode, result, {})
  assert.equal(check.ok, false)
  assert.match(check.errors.join('\n'), /outside the assigned work directory/)
})

test('glob conversion is anchored and does not treat dots as wildcards', () => {
  assert.equal(globToRegExp('work/s01/**').test('work/s01/a/b.mjs'), true)
  assert.equal(globToRegExp('work/s01/*').test('work/s01/a.mjs'), true)
  assert.equal(globToRegExp('work/s01/*').test('work/s01/a/b.mjs'), false)
  assert.equal(globToRegExp('work/s01/scene.mjs').test('work/s01/sceneXmjs'), false)
})

test('baseline CLI detects unreported changes inside and outside the allowlist', (t) => {
  const episode = temp(t)
  const work = path.join(episode, 'work', 's01')
  fs.mkdirSync(work, { recursive: true })
  const cli = path.resolve('scripts/validate-workers.mjs')
  const snapshot = spawnSync(process.execPath, [cli, 'snapshot', episode, '--task', 's01', '--json'], { encoding: 'utf8' })
  assert.equal(snapshot.status, 0, snapshot.stderr)
  const hash = JSON.parse(snapshot.stdout).data.baselineSha256
  const baseline = path.join(episode, 'qa', 'worker-baselines', 's01.json')
  const resultFile = path.join(work, 'result.json')
  fs.writeFileSync(path.join(work, 'scene.mjs'), 'scene')
  fs.writeFileSync(resultFile, JSON.stringify({ sceneId: 's01', status: 'PASS', changedFiles: ['work/s01/scene.mjs', 'work/s01/result.json'] }))
  const run = () => spawnSync(process.execPath, [cli, 'result', episode, resultFile, '--baseline', baseline, '--baseline-sha256', hash, '--allow', 'work/s01/**'], { encoding: 'utf8' })
  assert.equal(run().status, 0)
  fs.writeFileSync(path.join(episode, 'narration.md'), 'unexpected')
  assert.notEqual(run().status, 0)
  fs.rmSync(path.join(episode, 'narration.md'))
  fs.writeFileSync(path.join(work, 'hidden.txt'), 'unexpected')
  assert.notEqual(run().status, 0)
  const restrictive = spawnSync(process.execPath, [cli, 'result', episode, resultFile, '--baseline', baseline, '--baseline-sha256', hash, '--allow', 'work/s01/*.mjs'], { encoding: 'utf8' })
  assert.notEqual(restrictive.status, 0)
  const forged = JSON.parse(fs.readFileSync(baseline))
  const hidden = path.join(work, 'hidden.txt')
  const stat = fs.statSync(hidden)
  forged.files['work/s01/hidden.txt'] = { type: 'file', size: stat.size, mtimeMs: stat.mtimeMs, sha256: createHash('sha256').update(fs.readFileSync(hidden)).digest('hex') }
  fs.writeFileSync(baseline, JSON.stringify(forged))
  const tampered = run()
  assert.notEqual(tampered.status, 0)
  assert.match(tampered.stdout, /SHA-256 mismatch/)
})

test('rejects escaped work roots and unsafe scene identifiers', (t) => {
  const root = temp(t)
  const episode = path.join(root, 'episode')
  fs.mkdirSync(path.join(episode, 'work'), { recursive: true })
  const outside = path.join(root, 'outside')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'scene.mjs'), 'x')
  fs.symlinkSync(outside, path.join(episode, 'work', 's01'))
  assert.equal(validateWorkerResult(episode, { sceneId: 's01', status: 'PASS', changedFiles: ['work/s01/scene.mjs'] }, { skipBaseline: true }).ok, false)
  assert.equal(validateWorkerResult(episode, { sceneId: '..', status: 'PASS', changedFiles: [] }, { skipBaseline: true }).ok, false)
  assert.equal(validateWorkerResult(episode, { sceneId: 's01', status: 'PASS', changedFiles: [] }).ok, false)
})

test('globstar slash matches whole path components only', () => {
  const glob = globToRegExp('work/s01/**/safe.mjs')
  assert.equal(glob.test('work/s01/safe.mjs'), true)
  assert.equal(glob.test('work/s01/a/safe.mjs'), true)
  assert.equal(glob.test('work/s01/unsafe.mjs'), false)
})

test('wave CLI attributes concurrent changes to exactly one assigned worker', (t) => {
  const episode = temp(t)
  for (const id of ['s01', 's02']) fs.mkdirSync(path.join(episode, 'work', id), { recursive: true })
  const cli = path.resolve('scripts/validate-workers.mjs')
  const call = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  const snapshot = call('snapshot', episode, '--task', 'wave-1', '--json')
  assert.equal(snapshot.status, 0)
  const hash = JSON.parse(snapshot.stdout).data.baselineSha256
  const baseline = path.join(episode, 'qa', 'worker-baselines', 'wave-1.json')
  const results = []
  for (const id of ['s01', 's02']) {
    const dir = path.join(episode, 'work', id)
    fs.writeFileSync(path.join(dir, 'scene.mjs'), id)
    const file = path.join(dir, 'result.json')
    fs.writeFileSync(file, JSON.stringify({ sceneId: id, status: 'PASS', changedFiles: [`work/${id}/scene.mjs`, `work/${id}/result.json`] }))
    results.push(file)
  }
  const run = () => call('wave', episode, '--baseline', baseline, '--baseline-sha256', hash, '--result', results[0], '--result', results[1], '--allow', 'work/s01/**', '--allow', 'work/s02/**')
  assert.equal(run().status, 0)
  fs.writeFileSync(path.join(episode, 'work', 's02', 'hidden'), 'x')
  assert.notEqual(run().status, 0)
  fs.rmSync(path.join(episode, 'work', 's02', 'hidden'))
  const bad = JSON.parse(fs.readFileSync(results[0]))
  bad.changedFiles.push('work/s02/scene.mjs')
  fs.writeFileSync(results[0], JSON.stringify(bad))
  assert.notEqual(run().status, 0)
})
