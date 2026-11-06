import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { newVoice } from '../scripts/new-voice.mjs'
import { applyVoicePackage, loadVoicePackage, resolveVoicePackage } from '../scripts/lib/voice.mjs'
import { runAudioPreflight } from '../scripts/audio-preflight.mjs'

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

function workspace(t) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-voice-'))
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }))
  const episode = path.join(dataRoot, 'projects', 'series', 'episodes', 'ep-001')
  fs.mkdirSync(episode, { recursive: true })
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'narrated' }))
  return { dataRoot, episode }
}

function tone(dir, name, filter = 'sine=frequency=220:duration=2,volume=-12dB') {
  const file = path.join(dir, name)
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', filter, '-ar', '24000', '-y', file]).status, 0)
  return file
}

/** A package written by hand, so selection tests need no ffmpeg. */
function writePackage(dataRoot, id, { text = 'Câu mẫu.', bytes = 'RIFF-a', rights = 'own voice' } = {}) {
  const dir = path.join(dataRoot, 'library', 'voices', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'reference.wav'), bytes)
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ schemaVersion: 1, id, name: id, provider: 'omnivoice', language: 'vi', reference: { file: 'reference.wav', text }, rights }))
  return dir
}

test('new-voice copies a suitable reference into a package and never overwrites it', { skip: !hasFfmpeg }, (t) => {
  const { dataRoot } = workspace(t)
  const reference = tone(dataRoot, 'take.wav')
  const created = newVoice('narrator', { reference, refText: 'Xin chào các bạn.', rights: 'Recorded by the author for this channel', dataRoot })
  const pkg = loadVoicePackage('narrator', dataRoot)
  assert.equal(created.sha256, pkg.sha256)
  assert.equal(pkg.reference.text, 'Xin chào các bạn.')
  assert.deepEqual(fs.readFileSync(pkg.reference.path), fs.readFileSync(reference))
  assert.throws(() => newVoice('narrator', { reference, refText: 'Khác.', rights: 'x', dataRoot }), /already exists/)
  assert.equal(loadVoicePackage('narrator', dataRoot).reference.text, 'Xin chào các bạn.')
})

test('new-voice refuses silent references, missing transcripts and missing rights without leaving a package', { skip: !hasFfmpeg }, (t) => {
  const { dataRoot } = workspace(t)
  const silent = tone(dataRoot, 'silent.wav', 'anullsrc=r=24000:cl=mono:d=3')
  assert.throws(() => newVoice('quiet', { reference: silent, refText: 'Im lặng.', rights: 'own', dataRoot }), /not suitable/)
  const good = tone(dataRoot, 'good.wav')
  assert.throws(() => newVoice('quiet', { reference: good, rights: 'own', dataRoot }), /--ref-text/)
  assert.throws(() => newVoice('quiet', { reference: good, refText: 'Câu.', dataRoot }), /--rights/)
  assert.equal(fs.existsSync(path.join(dataRoot, 'library', 'voices', 'quiet')), false)
})

test('the episode selection overrides the series selection and nothing selected resolves to no voice', (t) => {
  const { dataRoot, episode } = workspace(t)
  writePackage(dataRoot, 'series-voice')
  writePackage(dataRoot, 'guest-voice', { bytes: 'RIFF-b' })
  assert.equal(resolveVoicePackage({ episodeRoot: episode }), null)
  fs.writeFileSync(path.join(dataRoot, 'projects', 'series', 'project.json'), JSON.stringify({ voicePackage: 'series-voice' }))
  assert.equal(resolveVoicePackage({ episodeRoot: episode }).id, 'series-voice')
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'narrated', voicePackage: 'guest-voice' }))
  const selected = resolveVoicePackage({ episodeRoot: episode })
  assert.equal(selected.id, 'guest-voice')
  assert.equal(selected.source, 'production.json')
  assert.equal(resolveVoicePackage({ episodeRoot: episode, id: 'series-voice' }).id, 'series-voice')
})

test('the package hash follows the sound, not the label or notes', (t) => {
  const { dataRoot } = workspace(t)
  const dir = writePackage(dataRoot, 'narrator')
  const before = loadVoicePackage('narrator', dataRoot).sha256
  const voice = JSON.parse(fs.readFileSync(path.join(dir, 'voice.json')))
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ ...voice, name: 'Renamed', rights: 'reworded' }))
  fs.writeFileSync(path.join(dir, 'notes.md'), 'new notes')
  assert.equal(loadVoicePackage('narrator', dataRoot).sha256, before)
  fs.writeFileSync(path.join(dir, 'reference.wav'), 'RIFF-other')
  const rerecorded = loadVoicePackage('narrator', dataRoot).sha256
  assert.notEqual(rerecorded, before)
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ ...voice, reference: { ...voice.reference, text: 'Câu khác.' } }))
  assert.notEqual(loadVoicePackage('narrator', dataRoot).sha256, rerecorded)
})

test('invalid packages are rejected: missing rights, mismatched id, traversal ids and escaping references', (t) => {
  const { dataRoot } = workspace(t)
  writePackage(dataRoot, 'no-rights', { rights: '' })
  assert.throws(() => loadVoicePackage('no-rights', dataRoot), /rights is required/)
  const dir = writePackage(dataRoot, 'renamed')
  fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(dir, 'voice.json'))), id: 'other' }))
  assert.throws(() => loadVoicePackage('renamed', dataRoot), /does not match/)
  assert.throws(() => loadVoicePackage('../escape', dataRoot), /lowercase slug/)
  const outside = path.join(dataRoot, 'outside.wav')
  fs.writeFileSync(outside, 'RIFF-outside')
  const linked = writePackage(dataRoot, 'linked')
  fs.rmSync(path.join(linked, 'reference.wav'))
  fs.symlinkSync(outside, path.join(linked, 'reference.wav'))
  assert.throws(() => loadVoicePackage('linked', dataRoot), /escapes the voice package/)
  assert.throws(() => loadVoicePackage('missing', dataRoot), /not found/)
})

test('a package cannot be combined with an explicit reference or another provider', (t) => {
  const { dataRoot } = workspace(t)
  writePackage(dataRoot, 'narrator')
  const pkg = loadVoicePackage('narrator', dataRoot)
  assert.throws(() => applyVoicePackage({ voiceReference: '/x.wav' }, pkg), /either a voice package/)
  assert.throws(() => applyVoicePackage({ provider: 'piper' }, pkg), /provider omnivoice, not piper/)
  const merged = applyVoicePackage({ language: 'en' }, pkg)
  assert.equal(merged.voiceReference, pkg.reference.path)
  assert.equal(merged.refText, 'Câu mẫu.')
  assert.equal(merged.language, 'en')
  assert.throws(() => runAudioPreflight({ voicePackage: 'narrator', dataRoot, voiceReference: '/x.wav' }), /either a voice package/)
  const report = runAudioPreflight({ voicePackage: 'narrator', dataRoot }, { probe: () => ({ available: false }), probeCommand: () => ({ available: false }) })
  assert.equal(report.provider.id, 'omnivoice')
  assert.deepEqual(report.voicePackage, { id: 'narrator', sha256: pkg.sha256 })
})
