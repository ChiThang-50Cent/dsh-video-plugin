import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
  const ok = validateWorkerResult(episode, result, { allow: ['work/s01/**'] })
  assert.equal(ok.ok, true, ok.errors.join('\n'))
  assert.deepEqual(ok.data.changedFiles, ['work/s01/scene.mjs'])

  const wrongAllow = validateWorkerResult(episode, result, { allow: ['work/s01/preview/**'] })
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
