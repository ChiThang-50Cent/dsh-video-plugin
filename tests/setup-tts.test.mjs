import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setupTts } from '../scripts/setup-tts.mjs'
import { runAudioPreflight } from '../scripts/audio-preflight.mjs'
import { readTtsConfig } from '../scripts/lib/tts-config.mjs'
import { studioStatus } from '../scripts/studio-status.mjs'

function workspace(t) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-tts-'))
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }))
  const venv = path.join(dataRoot, 'venv', 'bin')
  fs.mkdirSync(venv, { recursive: true })
  for (const name of ['python', 'omnivoice-infer']) fs.writeFileSync(path.join(venv, name), '#!/bin/sh\n', { mode: 0o755 })
  return { dataRoot, python: path.join(venv, 'python'), infer: path.join(venv, 'omnivoice-infer') }
}

const passing = (seen) => (options) => {
  seen.push({ options, env: process.env.SETUP_TTS_PROBE })
  return { readyForBatch: true, status: 'PASS', checkedAt: '2026-11-06T00:00:00.000Z', device: { kind: 'cuda', verified: true, detail: 'CUDA: RTX' }, voiceReference: { path: options.voiceReference }, sample: { output: '/tmp/sample.wav', metadata: { durationSec: 3 } }, errors: [] }
}

test('setup-tts tests the candidate runtime and saves it only after a passing sample', (t) => {
  const { dataRoot, python, infer } = workspace(t)
  const seen = []
  const result = setupTts({ dataRoot, python, model: '/models/omnivoice', voiceReference: '/ref.wav', refText: 'Câu.', requireGpu: true, env: { SETUP_TTS_PROBE: 'on' } }, { preflight: passing(seen) })
  assert.equal(result.written, true)
  assert.equal(seen[0].options.ttsConfig, false, 'the saved config must not leak into the test')
  assert.equal(seen[0].options.providerCommand, infer, 'omnivoice-infer beside the interpreter is the default')
  assert.equal(seen[0].env, 'on')
  assert.equal(process.env.SETUP_TTS_PROBE, undefined, 'environment is restored after the test')
  const saved = readTtsConfig(dataRoot)
  assert.deepEqual([saved.python, saved.model, saved.providerCommand, saved.requireGpu, saved.device, saved.env.SETUP_TTS_PROBE, saved.verified.device], [python, '/models/omnivoice', infer, true, 'cuda', 'on', 'CUDA: RTX'])

  const failing = setupTts({ dataRoot, python, model: '/models/other', voiceReference: '/ref.wav', refText: 'Câu.' }, { preflight: () => ({ readyForBatch: false, status: 'FAIL', errors: ['no GPU'], sample: {} }) })
  assert.deepEqual([failing.written, failing.errors], [false, ['no GPU']])
  assert.equal(readTtsConfig(dataRoot).model, '/models/omnivoice', 'a failed run keeps the previous runtime')
  assert.throws(() => setupTts({ dataRoot, python, model: '/m' }, { preflight: passing([]) }), /needs a voice/)
})

test('audio preflight fills only unset options from a runtime saved for the same provider', (t) => {
  const { dataRoot, infer } = workspace(t)
  fs.writeFileSync(path.join(dataRoot, 'tts.config.json'), JSON.stringify({ schemaVersion: 1, provider: 'omnivoice', providerCommand: infer, model: '/models/saved', requireGpu: true }))
  const probed = []
  const deps = { probeCommand: (command) => { probed.push(command); return { available: false } }, hardwareGpu: () => ({ available: false }) }
  const report = runAudioPreflight({ provider: 'omnivoice', dataRoot }, deps)
  assert.deepEqual([probed[0], report.model, report.ttsConfig], [infer, '/models/saved', path.join(dataRoot, 'tts.config.json')])
  assert.ok(report.errors.some((error) => /require-gpu|GPU/.test(error)), 'the saved GPU requirement applies')
  assert.equal(runAudioPreflight({ provider: 'omnivoice', dataRoot, model: '/models/explicit' }, deps).model, '/models/explicit')
  const other = runAudioPreflight({ provider: 'espeak-ng', dataRoot }, deps)
  assert.deepEqual([probed.at(-1), other.model, other.ttsConfig], ['espeak-ng', null, null])
})

test('studio status lists missing setup in order and flags narrated episodes without a voice', (t) => {
  const { dataRoot } = workspace(t)
  const fresh = studioStatus({ dataRoot })
  assert.equal(fresh.initialized, false)
  assert.equal(fresh.nextSteps.length, 4)
  assert.match(fresh.nextSteps[0], /init-workspace/)
  fs.mkdirSync(path.join(dataRoot, 'library', 'voices', 'narrator'), { recursive: true })
  fs.writeFileSync(path.join(dataRoot, 'library', 'catalog.json'), '{"schemaVersion":1,"entries":[]}')
  fs.writeFileSync(path.join(dataRoot, 'library', 'voices', 'narrator', 'reference.wav'), 'RIFF')
  fs.writeFileSync(path.join(dataRoot, 'library', 'voices', 'narrator', 'voice.json'), JSON.stringify({ schemaVersion: 1, id: 'narrator', provider: 'omnivoice', language: 'vi', reference: { file: 'reference.wav', text: 'Câu.' }, rights: 'own' }))
  fs.writeFileSync(path.join(dataRoot, 'tts.config.json'), JSON.stringify({ schemaVersion: 1, provider: 'omnivoice' }))
  const episode = path.join(dataRoot, 'projects', 'series', 'episodes', 'ep-001')
  fs.mkdirSync(episode, { recursive: true })
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'narrated' }))
  const ready = studioStatus({ dataRoot })
  assert.deepEqual(ready.voices.map((voice) => voice.id), ['narrator'])
  assert.equal(ready.nextSteps.length, 1)
  assert.match(ready.nextSteps[0], /voicePackage.*series\/ep-001/)
  fs.writeFileSync(path.join(dataRoot, 'projects', 'series', 'project.json'), JSON.stringify({ voicePackage: 'narrator' }))
  assert.deepEqual(studioStatus({ dataRoot }).nextSteps, [])
})
