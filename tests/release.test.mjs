import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { validateEpisode } from '../scripts/validate-episode.mjs'
import { qaMedia } from '../scripts/qa-media.mjs'
import { createEpisode } from '../scripts/new-episode.mjs'
import { makeEpisode, makeSegments, writeSegmentManifest } from './helpers/episode-fixtures.mjs'
import { resolveVisualStyle } from '../scripts/lib/render/theme.mjs'

const DEFAULT_STYLE_SHA = resolveVisualStyle().sha256

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-release-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function makeSilentMaster(dir) {
  if (spawnSync('ffprobe', ['-version']).status !== 0) return false
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1',
    '-r', '30', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p',
    path.join(dir, 'master.mp4'),
  ], { encoding: 'utf8' })
  return result.status === 0 && fs.existsSync(path.join(dir, 'master.mp4'))
}

function writeSilentRelease(root, { masterFile, media } = {}) {
  fs.mkdirSync(path.join(root, 'exports'), { recursive: true })
  fs.mkdirSync(path.join(root, 'qa', 'scene'), { recursive: true })
  fs.mkdirSync(path.join(root, 'audio'), { recursive: true })
  if (masterFile !== undefined) fs.copyFileSync(masterFile, path.join(root, 'exports', 'master.mp4'))
  fs.writeFileSync(path.join(root, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'silent', voiceOver: false }))
  fs.writeFileSync(path.join(root, 'storyboard.json'), JSON.stringify({
    schemaVersion: 1,
    scenes: [{ id: 's01-title', reuseClass: 'A', templateId: 'title-v1', durationSec: 1, assets: [] }],
  }))
  fs.writeFileSync(path.join(root, 'timeline.json'), JSON.stringify({
    schemaVersion: 1, durationSec: 1, scenes: [{ id: 's01-title', startSec: 0, durationSec: 1, keyframes: [0, 0.5, 0.9] }],
  }))
  fs.writeFileSync(path.join(root, 'audio', 'manifest.json'), JSON.stringify({ schemaVersion: 1, engine: null, chunks: [] }))
  fs.writeFileSync(path.join(root, 'qa', 'scene', 's01-title.json'), JSON.stringify({ status: 'PASS', sceneId: 's01-title', checks: ['bounds'], styleSha256: DEFAULT_STYLE_SHA }))
  fs.writeFileSync(path.join(root, 'qa', 'final.json'), JSON.stringify({ status: 'PASS', blockers: [], sceneChecks: { 's01-title': { status: 'PASS' } } }))
  const report = media ?? qaMedia(path.join(root, 'exports', 'master.mp4'), { width: 320, height: 180, fps: 30, allowNoAudio: true })
  fs.writeFileSync(path.join(root, 'qa', 'media.json'), JSON.stringify(report, null, 2))
}

test('a fresh episode is lint-clean but release INCOMPLETE, never PASS', async (t) => {
  const root = tempRoot(t)
  const created = createEpisode({ series: 'fresh-series', episode: 'ep-001', dataRoot: root, codeRoot: path.resolve(import.meta.dirname, '..') })
  const lint = await validateEpisode(created.episodeDir)
  assert.equal(lint.lint.ok, true, lint.lint.errors.join('\n'))
  assert.equal(lint.release.checked, false)
  assert.equal(lint.release.status, 'NOT_CHECKED')

  const release = await validateEpisode(created.episodeDir, { release: true })
  assert.equal(release.release.status, 'INCOMPLETE')
  assert.equal(release.ok, false)
  assert.notEqual(release.release.status, 'PASS')
  assert.ok(release.release.missing.some((item) => /master/.test(item)))
  assert.ok(release.release.missing.some((item) => /no scenes/.test(item)))
})

test('silent and text-only productions pass the non-narration release gate with real QA', async (t) => {
  const root = tempRoot(t)
  const master = path.join(root, 'tiny-master.mp4')
  if (!makeSilentMaster(root)) {
    t.skip('ffmpeg is not available to produce a tiny verification clip')
    return
  }
  fs.renameSync(path.join(root, 'master.mp4'), master)
  for (const mode of ['silent', 'text-only']) {
    const episode = path.join(root, `episode-${mode}`)
    fs.mkdirSync(episode, { recursive: true })
    writeSilentRelease(episode, { masterFile: master })
    fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode, voiceOver: false }))
    const result = await validateEpisode(episode, { release: true })
    assert.equal(result.release.status, 'PASS', `${mode}: ${result.errors.join(' | ')}`)
    assert.equal(result.ok, true)
    assert.equal(result.mode, mode)
  }
})

test('a fabricated master or missing QA cannot pass release', async (t) => {
  const root = tempRoot(t)
  const episode = path.join(root, 'fake-episode')
  fs.mkdirSync(path.join(episode, 'exports'), { recursive: true })
  fs.writeFileSync(path.join(episode, 'exports', 'master.mp4'), 'not really a video file '.repeat(200))
  const hash = createHash('sha256').update(fs.readFileSync(path.join(episode, 'exports', 'master.mp4'))).digest('hex')
  writeSilentRelease(episode, { media: { ok: true, durationSec: 1, sha256: hash, video: { width: 320, height: 180 }, audio: null } })
  const result = await validateEpisode(episode, { release: true })
  assert.notEqual(result.release.status, 'PASS')
  assert.equal(result.ok, false)
  assert.match(`${result.errors.join('\n')}\n${(result.release.missing ?? []).join('\n')}`, /cannot verify the final master|no video stream|ffprobe/i)
})

test('a released narration mode cannot skip G0 at release time', async (t) => {
  const root = tempRoot(t)
  const master = path.join(root, 'tiny-master.mp4')
  if (!makeSilentMaster(root)) {
    t.skip('ffmpeg is not available')
    return
  }
  fs.renameSync(path.join(root, 'master.mp4'), master)
  const episode = path.join(root, 'episode-narrated')
  fs.mkdirSync(episode, { recursive: true })
  writeSilentRelease(episode, { masterFile: master })
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'narrated', voiceOver: true }))
  // The silent QA says there is no audio stream, and there is no narration G0.
  const result = await validateEpisode(episode, { release: true })
  assert.notEqual(result.release.status, 'PASS')
  assert.match(result.errors.join('\n'), /narration G0|requires a final master with an audio stream|no narration artifacts/)
})

test('a master marked stale by a narration revision cannot release', async (t) => {
  const root = tempRoot(t)
  const master = path.join(root, 'tiny-master.mp4')
  if (!makeSilentMaster(root)) {
    t.skip('ffmpeg is not available')
    return
  }
  fs.renameSync(path.join(root, 'master.mp4'), master)
  const episode = path.join(root, 'episode-stale')
  fs.mkdirSync(episode, { recursive: true })
  writeSilentRelease(episode, { masterFile: master })
  fs.writeFileSync(path.join(episode, 'exports', 'master.stale.json'), JSON.stringify({ stale: true, reason: 'narration revised' }))
  const result = await validateEpisode(episode, { release: true })
  assert.equal(result.release.status, 'FAIL')
  assert.match(result.release.errors.join('\n'), /master\.stale\.json|superseded narration/)
})

test('release rejects stale artifacts and conflicting mode overrides while lint warns', async (t) => {
  const root = tempRoot(t)
  assert.equal(makeSilentMaster(root), true)
  const master = path.join(root, 'master.mp4')
  const episode = path.join(root, 'episode')
  fs.mkdirSync(episode)
  writeSilentRelease(episode, { masterFile: master })
  const timelineFile = path.join(episode, 'timeline.json')
  const timeline = JSON.parse(fs.readFileSync(timelineFile))
  timeline.stale = true
  fs.writeFileSync(timelineFile, JSON.stringify(timeline))
  assert.equal((await validateEpisode(episode)).ok, true)
  assert.equal((await validateEpisode(episode, { release: true })).release.status, 'FAIL')
  const override = await validateEpisode(episode, { release: true, mode: 'narrated' })
  assert.ok(override.release.errors.some((error) => /conflicts/.test(error)))
  assert.equal(override.release.narration.ok, false)
})

test('a configured missing master never falls back to an older default master', async (t) => {
  const root = tempRoot(t)
  assert.equal(makeSilentMaster(root), true)
  const episode = path.join(root, 'episode')
  fs.mkdirSync(episode)
  writeSilentRelease(episode, { masterFile: path.join(root, 'master.mp4') })
  for (const source of ['production.json', 'timeline.json']) {
    const file = path.join(episode, source)
    const original = JSON.parse(fs.readFileSync(file, 'utf8'))
    fs.writeFileSync(file, JSON.stringify({ ...original, finalOutput: 'exports/new-master.mp4' }))
    const result = await validateEpisode(episode, { release: true })
    assert.equal(result.release.status, 'INCOMPLETE')
    assert.ok(result.release.missing.some((message) => message.includes('exports/new-master.mp4')))
    assert.equal(result.release.master, null)
    fs.writeFileSync(file, JSON.stringify(original))
  }
})

test('release reconciles segments and probes hashed chunks', async (t) => {
  const root = tempRoot(t)
  assert.equal(makeSilentMaster(root), true)
  const episode = path.join(root, 'episode')
  fs.mkdirSync(episode)
  writeSilentRelease(episode, { masterFile: path.join(root, 'master.mp4') })
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ mode: 'narrated' }))
  fs.writeFileSync(path.join(episode, 'audio', 'segments.json'), JSON.stringify({ segments: [{ id: 'one', text: 'Hello' }, { id: 'two', text: 'World' }] }))
  const wav = path.join(episode, 'audio', 'chunk.wav')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=2', '-y', wav]).status, 0)
  const sha256 = createHash('sha256').update(fs.readFileSync(wav)).digest('hex')
  fs.writeFileSync(path.join(episode, 'audio', 'manifest.json'), JSON.stringify({ chunks: [
    { id: 'one', path: 'audio/chunk.wav', durationSec: 1, sha256 },
    { id: 'one', path: 'audio/chunk.wav', durationSec: 2 },
    { id: 'other', path: 'audio/chunk.wav', durationSec: 2, sha256 },
  ] }))
  const result = await validateEpisode(episode, { release: true })
  const errors = result.release.errors.join('\n')
  assert.match(errors, /repeats segment/)
  assert.match(errors, /unknown segment/)
  assert.match(errors, /no audio chunk/)
  assert.match(errors, /requires a sha256/)
  assert.match(errors, /declared duration/)
  assert.match(errors, /exceed timeline/)
  fs.writeFileSync(wav, 'not audio'.repeat(50))
  const corrupt = await validateEpisode(episode, { release: true })
  assert.ok(corrupt.release.missing.some((item) => /ffprobe/.test(item)))
})

test('fully verified narrated episode passes release', async (t) => {
  const narration = '# Buổi sáng\n\nÁnh sáng tràn qua khung cửa và đọng lại trên mặt bàn gỗ. Người nghe có thể hình dung một căn phòng yên tĩnh, nơi mọi vật còn đang ngủ. Không có con số nào cần kiểm chứng, không có tuyên bố khoa học nào được đưa ra. Đây chỉ là một đoạn mở đầu quan sát, để người xem chậm lại trước khi bước vào câu chuyện.\n\nRồi tiếng chim ngoài hiên cất lên, rất khẽ, như một dấu phẩy trong câu văn dài của buổi sớm. Không có gì phải chứng minh; chỉ có một trạng thái cần được nghe thấy.\n'
  const episode = makeEpisode(t, { narration })
  const segments = makeSegments(episode.parsed, episode.hash, 1)
  writeSegmentManifest(episode.dir, segments)
  const audio = path.join(episode.dir, 'audio', 'voice.wav')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=1', '-af', 'volume=6dB', '-y', audio]).status, 0)
  const master = path.join(episode.dir, 'exports', 'master.mp4')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=320x180:d=2:r=30', '-i', audio, '-c:v', 'mpeg4', '-c:a', 'aac', '-y', master]).status, 0)
  fs.writeFileSync(path.join(episode.dir, 'storyboard.json'), JSON.stringify({ scenes: [{ id: 's01-title', reuseClass: 'A', templateId: 'title', narrationSegments: [segments.segments[0].id] }] }))
  fs.writeFileSync(path.join(episode.dir, 'timeline.json'), JSON.stringify({ durationSec: 2, scenes: [{ id: 's01-title', startSec: 0, durationSec: 2 }] }))
  fs.writeFileSync(path.join(episode.dir, 'audio', 'manifest.json'), JSON.stringify({ narrationSha256: episode.hash, chunks: [{ id: segments.segments[0].id, path: 'audio/voice.wav', durationSec: 1, sha256: createHash('sha256').update(fs.readFileSync(audio)).digest('hex') }] }))
  fs.writeFileSync(path.join(episode.dir, 'qa', 'scene', 's01-title.json'), JSON.stringify({ status: 'PASS', narrationSha256: episode.hash, styleSha256: DEFAULT_STYLE_SHA }))
  fs.writeFileSync(path.join(episode.dir, 'qa', 'final.json'), JSON.stringify({ status: 'PASS', blockers: [] }))
  fs.writeFileSync(path.join(episode.dir, 'qa', 'media.json'), JSON.stringify(qaMedia(master)))
  const result = await validateEpisode(episode.dir, { release: true })
  assert.equal(result.release.status, 'PASS', result.errors.join('\n'))
  const scenePath = path.join(episode.dir, 'qa', 'scene', 's01-title.json')
  for (const hash of [undefined, '0'.repeat(64)]) {
    fs.writeFileSync(scenePath, JSON.stringify({ status: 'PASS', narrationSha256: hash, styleSha256: DEFAULT_STYLE_SHA }))
    const invalid = await validateEpisode(episode.dir, { release: true })
    assert.match(invalid.release.errors.join('\n'), /s01-title.*narrationSha256/)
  }
  fs.writeFileSync(scenePath, JSON.stringify({ status: 'PASS', narrationSha256: episode.hash, styleSha256: '0'.repeat(64) }))
  const restyled = await validateEpisode(episode.dir, { release: true })
  assert.match(restyled.release.errors.join('\n'), /s01-title.*styleSha256.*"default"/)
  fs.writeFileSync(scenePath, JSON.stringify({ status: 'PASS', narrationSha256: episode.hash, styleSha256: DEFAULT_STYLE_SHA }))
  const mediaPath = path.join(episode.dir, 'qa', 'media.json')
  const media = JSON.parse(fs.readFileSync(mediaPath))
  media.checks.loudness.status = 'FAIL'
  fs.writeFileSync(mediaPath, JSON.stringify(media))
  const failedLoudness = await validateEpisode(episode.dir, { release: true })
  assert.match(failedLoudness.release.errors.join('\n'), /loudness check did not pass/)
})
