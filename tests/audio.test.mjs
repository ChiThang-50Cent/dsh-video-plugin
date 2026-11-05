import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runAudioPreflight } from '../scripts/audio-preflight.mjs'
import { auditSegmentText, qaAudioEpisode } from '../scripts/qa-audio.mjs'

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-audio-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function deps(overrides = {}) {
  return {
    probeCommand: () => ({ available: true, resolved: '/fake/tts', summary: 'TTS 1.0' }),
    hardwareGpu: () => ({ present: true, summary: 'NVIDIA GeForce RTX 3060' }),
    ffprobeJson: () => ({ ok: true, codec: 'pcm_s16le', sampleRate: 24000, channels: 1, durationSec: 1 }),
    measureAudio: () => ({ ok: true, maxVolume: -3, meanVolume: -18, silences: [] }),
    synthesize: (spec) => {
      fs.mkdirSync(path.dirname(spec.output), { recursive: true })
      fs.writeFileSync(spec.output, 'fake wav data')
      return { ok: true, attempts: [{ attempt: 1, ok: true, durationMs: 10 }] }
    },
    ...overrides,
  }
}

test('nvidia-smi hardware alone never makes a provider GPU-ready', () => {
  const result = runAudioPreflight({ provider: 'piper', voice: 'model.onnx', requireGpu: true, synthesizeSample: false }, deps({
    probeCommand: () => ({ available: true, resolved: '/fake/piper', summary: 'piper 1.0' }),
  }))
  assert.equal(result.hardware.gpu.present, true)
  assert.equal(result.device.verified, false)
  assert.equal(result.readyForBatch, false)
  assert.equal(result.status, 'FAIL')
  assert.match(result.errors.join('\n'), /device could not be verified|refusing/)
})

test('a CPU-only provider is rejected when GPU is required instead of silently falling back', () => {
  const result = runAudioPreflight({ provider: 'espeak-ng', requireGpu: true, synthesizeSample: false }, deps())
  assert.equal(result.readyForBatch, false)
  assert.match(result.errors.join('\n'), /CPU-only/)
})

test('batch readiness stays false until a sample is synthesized and measured', () => {
  const result = runAudioPreflight({ provider: 'espeak-ng', synthesizeSample: false }, deps())
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.readyForBatch, false)
  assert.match(result.warnings.join('\n'), /no sample/)
})

test('a measured sample makes a verified provider ready', (t) => {
  const dir = temp(t)
  const reference = path.join(dir, 'voice.wav')
  fs.writeFileSync(reference, 'fake voice')
  const result = runAudioPreflight({
    provider: 'espeak-ng',
    voiceReference: reference,
    synthesizeSample: true,
    outputDir: dir,
  }, deps({
    ffprobeJson: (file) => ({ ok: true, codec: 'pcm_s16le', sampleRate: 24000, channels: 1, durationSec: file.includes('voice') ? 8 : 1 }),
  }))
  assert.equal(result.status, 'PASS', result.errors.join('\n'))
  assert.equal(result.readyForBatch, true)
  assert.equal(result.sample.status, 'PASS')
  assert.equal(result.voiceReference.status, 'PASS')
  assert.ok(fs.existsSync(result.sample.output))
})

test('an unsuitable voice reference blocks batch readiness', (t) => {
  const dir = temp(t)
  const reference = path.join(dir, 'voice.wav')
  fs.writeFileSync(reference, 'too short')
  const result = runAudioPreflight({ provider: 'espeak-ng', voiceReference: reference, synthesizeSample: true, outputDir: dir }, deps({
    ffprobeJson: () => ({ ok: true, codec: 'pcm_s16le', sampleRate: 24000, channels: 1, durationSec: 0.2 }),
  }))
  assert.equal(result.status, 'FAIL')
  assert.match(result.errors.join('\n'), /voice reference is not suitable/)
})

test('a missing provider fails before any sample is attempted', () => {
  const result = runAudioPreflight({ provider: 'espeak-ng', synthesizeSample: true }, deps({
    probeCommand: () => ({ available: false, resolved: null, summary: '', error: 'not-found' }),
  }))
  assert.equal(result.status, 'FAIL')
  assert.match(result.errors.join('\n'), /not installed/)
  assert.equal(result.sample.status, 'FAIL')
})

test('targeted segment audit preserves numbers and operators and catches omissions', () => {
  const good = auditSegmentText({
    segments: [{
      id: 'seg-001',
      text: 'Ta có 16 trừ 5 bằng 11.',
      spokenText: 'Ta có mười sáu trừ năm bằng mười một.',
    }],
  })
  assert.deepEqual(good.errors, [])
  assert.equal(good.rows[0].preserved, true)

  const bad = auditSegmentText({
    segments: [{ id: 'seg-001', text: 'Ta có 16 trừ 5 bằng 11.', spokenText: 'Ta có mười sáu cộng năm bằng mười một.' }],
  })
  assert.equal(bad.errors.length > 0, true)
  assert.match(bad.errors.join('\n'), /changes protected numbers\/operators/)
})

test('audio QA measures silence and clipping when audio files exist', (t) => {
  const dir = temp(t)
  fs.mkdirSync(path.join(dir, 'audio', 'narration'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'audio', 'narration', 'seg-001.wav'), 'RIFF....WAVE')
  fs.writeFileSync(path.join(dir, 'audio', 'segments.json'), JSON.stringify({
    schemaVersion: 2,
    narrationSha256: 'a'.repeat(64),
    segments: [{ id: 'seg-001', text: 'Ta có 16 trừ 5 bằng 11.', spokenText: 'Ta có mười sáu trừ năm bằng mười một.', audio: 'audio/narration/seg-001.wav' }],
  }))
  const result = qaAudioEpisode(dir, { audio: true }, {
    probeAudio: () => ({ ok: true, sampleRate: 24000, channels: 1, durationSec: 2 }),
    measureAudio: () => ({ ok: true, maxVolume: 0, meanVolume: -20, silences: [1.8] }),
  })
  assert.equal(result.data.audio.length, 1)
  assert.match(result.errors.join('\n'), /mostly silence|clipped/)
})
