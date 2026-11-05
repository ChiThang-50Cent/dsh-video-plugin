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
  fs.writeFileSync(path.join(root, 'qa', 'scene', 's01-title.json'), JSON.stringify({ status: 'PASS', sceneId: 's01-title', checks: ['bounds'] }))
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
