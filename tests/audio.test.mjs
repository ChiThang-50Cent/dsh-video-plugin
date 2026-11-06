import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runAudioPreflight } from '../scripts/audio-preflight.mjs'
import { auditSegmentText, qaAudioEpisode } from '../scripts/qa-audio.mjs'
import { spawnSync } from 'node:child_process'
import { runBounded } from '../scripts/lib/bounded.mjs'

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

test('OmniVoice uses its selected executable, sibling CUDA probe, and real inference arguments', (t) => {
  const dir = temp(t)
  const reference = path.join(dir, 'voice.wav')
  fs.writeFileSync(reference, 'reference')
  let spec
  let pythonProbe
  const command = '/venv/bin/omnivoice-infer'
  const result = runAudioPreflight({
    provider: 'omnivoice', providerCommand: command, voiceReference: reference,
    language: 'vi', requireGpu: true, synthesizeSample: true, outputDir: dir, sampleText: 'Xin chào.',
  }, deps({
    probeCommand: (name, args) => {
      assert.equal(name, command)
      assert.deepEqual(args, ['--help'])
      return { available: true, resolved: command, summary: 'usage' }
    },
    runBounded: (name, args) => {
      pythonProbe = { name, args }
      return { ok: true, stdout: 'CUDA: NVIDIA GeForce RTX 3060\n' }
    },
    synthesize: (value) => {
      spec = value
      fs.writeFileSync(value.output, 'sample')
      return { ok: true, attempts: [] }
    },
  }))
  assert.equal(result.status, 'PASS', result.errors.join('\n'))
  assert.equal(result.device.verified, true)
  assert.equal(pythonProbe.name, '/venv/bin/python')
  assert.equal(pythonProbe.args[0], '-c')
  assert.match(pythonProbe.args[1], /torch\.cuda\.is_available/)
  assert.equal(spec.command, command)
  assert.deepEqual(spec.args, ['--text', 'Xin chào.', '--output', path.join(dir, 'sample.wav'),
    '--ref_audio', reference, '--language', 'vi', '--device', 'cuda'])
})

test('OmniVoice refuses a failed sibling CUDA probe and diagnoses hidden GPU devices', () => {
  let synthesized = false
  const result = runAudioPreflight({ provider: 'omnivoice', requireGpu: true, synthesizeSample: true }, deps({
    runBounded: () => ({ ok: false, stdout: '', stderr: 'CUDA unavailable' }),
    sandboxGpuHidden: () => true,
    synthesize: () => { synthesized = true },
  }))
  assert.equal(result.status, 'FAIL')
  assert.equal(result.device.verified, false)
  assert.equal(synthesized, false)
  assert.match(result.errors.join('\n'), /GPU is hidden by the sandbox.*docs\/dsh\.md/)
})

test('OmniVoice does not accept an empty CUDA device identity', () => {
  const result = runAudioPreflight({ provider: 'omnivoice', requireGpu: true }, deps({
    runBounded: () => ({ ok: true, stdout: 'CUDA: \n' }),
    sandboxGpuHidden: () => false,
  }))
  assert.equal(result.device.verified, false)
  assert.equal(result.status, 'FAIL')
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

test('GPU probes require affirmative identity and Piper voice is not a reference recording', () => {
  const probe = deps({ probeCommand: () => ({ available: true, summary: 'CPU backend', resolved: 'probe' }) })
  assert.equal(runAudioPreflight({ provider: 'piper', voice: 'model.onnx', requireGpu: true, deviceProbeCommand: 'probe' }, probe).device.verified, false)
  const piper = runAudioPreflight({ provider: 'piper', voice: 'model.onnx' }, probe)
  assert.equal(piper.errors.some((error) => /voice/.test(error)), false)
})

test('audio CLI rejects segments without audio', (t) => {
  const dir = temp(t)
  fs.mkdirSync(path.join(dir, 'audio'))
  fs.writeFileSync(path.join(dir, 'audio', 'segments.json'), JSON.stringify({ segments: [{ id: 'seg-001', text: 'Hello.' }] }))
  const result = spawnSync(process.execPath, [path.resolve('scripts/qa-audio.mjs'), dir, '--audio', '--json'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
})

test('bounded timeout kills a signal-ignoring process tree without retry', (t) => {
  const dir = temp(t)
  const pidFile = path.join(dir, 'child.pid')
  const childCode = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"
  const parentCode = `const {spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000)`
  const start = Date.now()
  const result = runBounded(process.execPath, ['-e', parentCode], { timeoutMs: 500, retries: 1 })
  assert.equal(result.timedOut, true)
  assert.equal(result.attempts.length, 1)
  assert.ok(Date.now() - start < 1100)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  const status = fs.existsSync(`/proc/${pid}/stat`) ? fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] : null
  assert.ok(status === null || status === 'Z', `child remains running: ${status}`)
})

test('bounded timeout returns when an escaped descendant keeps output pipes open', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX detached process groups required')
  const dir = temp(t)
  const pidFile = path.join(dir, 'escaped.pid')
  let escapedPid
  t.after(() => {
    if (escapedPid !== undefined) {
      try { process.kill(escapedPid, 'SIGKILL') } catch {}
    }
  })
  const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'inherit'});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`
  const start = Date.now()
  const result = runBounded(process.execPath, ['-e', code], { timeoutMs: 400 })
  if (fs.existsSync(pidFile)) escapedPid = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.equal(result.timedOut, true)
  assert.ok(Date.now() - start < 1700)
  assert.ok(fs.existsSync(pidFile))
})
