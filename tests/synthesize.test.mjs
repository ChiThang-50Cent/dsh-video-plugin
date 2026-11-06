import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { synthesize } from '../scripts/synthesize-narration.mjs'

const sha = (value) => createHash('sha256').update(value).digest('hex')

// A stand-in for scripts/lib/tts/omnivoice_batch.py speaking the same JSON-lines protocol.
const FAKE_HELPER = `
const fs = require('node:fs')
const args = process.argv.slice(2)
const device = args[args.indexOf('--device') + 1]
const mode = process.env.FAKE_TTS_MODE ?? 'ok'
fs.appendFileSync(process.env.FAKE_TTS_LOG, 'spawn\\n')
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
send({ type: 'ready', device: mode === 'cpu' ? 'cpu' : device, version: 'fake-1' })
let buffer = ''
process.stdin.on('data', (data) => {
  buffer += data
  let index
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const request = JSON.parse(buffer.slice(0, index))
    buffer = buffer.slice(index + 1)
    fs.appendFileSync(process.env.FAKE_TTS_LOG, 'say ' + request.id + '\\n')
    if (mode === 'hang') continue
    if (mode === 'fail-once' && !fs.existsSync(process.env.FAKE_TTS_LOG + '.failed')) {
      fs.writeFileSync(process.env.FAKE_TTS_LOG + '.failed', '')
      send({ type: 'result', id: request.id, ok: false, error: 'transient' })
      process.exit(0)
    }
    fs.writeFileSync(request.output, 'RIFF' + request.text)
    send({ type: 'result', id: request.id, ok: true, durationSec: 1.5 })
  }
})
`

function setup(t, { mode = 'ok', texts = ['Một.', 'Hai.', 'Ba.'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-synth-'))
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.FAKE_TTS_MODE
    delete process.env.FAKE_TTS_LOG
  })
  const episode = path.join(dir, 'ep')
  fs.mkdirSync(path.join(episode, 'audio'), { recursive: true })
  const narration = texts.join('\n\n')
  fs.writeFileSync(path.join(episode, 'narration.md'), narration)
  const writeSegments = (list) => fs.writeFileSync(path.join(episode, 'audio', 'segments.json'), JSON.stringify({
    schemaVersion: 2,
    narrationSha256: sha(fs.readFileSync(path.join(episode, 'narration.md'))),
    segments: list.map((text, index) => ({ id: `seg-00${index + 1}`, text, audio: `audio/narration/seg-00${index + 1}.wav` })),
  }))
  writeSegments(texts)
  const helper = path.join(dir, 'helper.cjs')
  fs.writeFileSync(helper, FAKE_HELPER)
  const voiceReference = path.join(dir, 'ref.wav')
  fs.writeFileSync(voiceReference, 'reference')
  const log = path.join(dir, 'helper.log')
  process.env.FAKE_TTS_MODE = mode
  process.env.FAKE_TTS_LOG = log
  const options = { episode, python: process.execPath, helper, model: '/models/omnivoice', device: 'cuda', voiceReference, refText: 'Câu tham chiếu.', language: 'vi', timeoutMs: 5000, overallTimeoutMs: 30000, retries: 1, segments: 'audio/segments.json', requireGpu: true }
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [])
  return { episode, options, calls, writeSegments, manifest: () => JSON.parse(fs.readFileSync(path.join(episode, 'audio', 'manifest.json'), 'utf8')) }
}

test('one helper process synthesizes every segment and binds the manifest to the narration', async (t) => {
  const { episode, options, calls, manifest } = setup(t)
  const result = await synthesize(options)
  assert.deepEqual([result.synthesized, result.reused, result.device], [3, 0, 'cuda'])
  assert.deepEqual(calls(), ['spawn', 'say seg-001', 'say seg-002', 'say seg-003'])
  const record = manifest()
  assert.equal(record.narrationSha256, sha(fs.readFileSync(path.join(episode, 'narration.md'))))
  assert.equal(record.engine.device, 'cuda')
  assert.equal(record.engine.model, '/models/omnivoice')
  assert.deepEqual(record.chunks.map((chunk) => [chunk.segmentId, chunk.path, chunk.durationSec]), [
    ['seg-001', 'audio/narration/seg-001.wav', 1.5],
    ['seg-002', 'audio/narration/seg-002.wav', 1.5],
    ['seg-003', 'audio/narration/seg-003.wav', 1.5],
  ])
})

test('a rerun reuses unchanged segments without loading the model and redoes only edited text', async (t) => {
  const { options, calls, writeSegments, manifest } = setup(t)
  await synthesize(options)
  const reuse = await synthesize(options)
  assert.deepEqual([reuse.synthesized, reuse.reused], [0, 3])
  assert.equal(calls().filter((line) => line === 'spawn').length, 1)

  writeSegments(['Một.', 'Hai, đã sửa.', 'Ba.'])
  const edited = await synthesize(options)
  assert.deepEqual([edited.synthesized, edited.reused], [1, 2])
  assert.deepEqual(calls().slice(-2), ['spawn', 'say seg-002'])
  assert.equal(manifest().chunks.length, 3)
})

test('a deleted or altered wav is resynthesized even when its fingerprint matches', async (t) => {
  const { episode, options, calls } = setup(t)
  await synthesize(options)
  fs.writeFileSync(path.join(episode, 'audio', 'narration', 'seg-003.wav'), 'tampered')
  const result = await synthesize(options)
  assert.deepEqual([result.synthesized, result.reused], [1, 2])
  assert.equal(calls().at(-1), 'say seg-003')
})

test('a helper that loads on CPU when CUDA was requested is refused', async (t) => {
  const { options } = setup(t, { mode: 'cpu' })
  await assert.rejects(synthesize({ ...options, retries: 0 }), /refusing CPU fallback/)
})

test('a transient helper failure restarts the helper within the retry budget', async (t) => {
  const { options, calls, manifest } = setup(t, { mode: 'fail-once' })
  const result = await synthesize(options)
  assert.equal(result.synthesized, 3)
  assert.equal(calls().filter((line) => line === 'spawn').length, 2)
  assert.equal(manifest().chunks[0].attempts, 2)
})

test('without retries a failure stops the run and names the segment', async (t) => {
  const { options } = setup(t, { mode: 'fail-once' })
  await assert.rejects(synthesize({ ...options, retries: 0 }), /seg-001: transient/)
})

test('a hung helper is killed at the per-segment timeout', async (t) => {
  const { options } = setup(t, { mode: 'hang' })
  const started = Date.now()
  await assert.rejects(synthesize({ ...options, retries: 0, timeoutMs: 300 }), /seg-001: helper timeout/)
  assert.ok(Date.now() - started < 5000)
})

test('segments built from an older narration are rejected before any synthesis', async (t) => {
  const { episode, options, calls } = setup(t)
  fs.appendFileSync(path.join(episode, 'narration.md'), '\n\nBốn.')
  await assert.rejects(synthesize(options), /stale/)
  assert.deepEqual(calls(), [])
})

test('the CLI refuses a CPU device when a GPU is required', () => {
  const script = new URL('../scripts/synthesize-narration.mjs', import.meta.url).pathname
  const result = spawnSync(process.execPath, [script, '/tmp/none', '--voice-reference', 'r.wav', '--ref-text', 'x', '--device', 'cpu', '--require-gpu'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /refusing CPU fallback/)
})
