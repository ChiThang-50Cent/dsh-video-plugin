import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
function installed(name) {
  try { require.resolve(name); return true } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') return false
    throw error
  }
}
const dependencies = installed('skia-canvas') && installed('@mathjax/src/js/mathjax.js')

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-render-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function mediaAvailable(t) {
  if (!dependencies) { t.skip('skia-canvas or MathJax is not installed'); return false }
  const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
  const ffprobe = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' })
  if (ffmpeg.error?.code === 'ENOENT' || ffprobe.error?.code === 'ENOENT') { t.skip('ffmpeg or ffprobe is not installed'); return false }
  assert.equal(ffmpeg.status, 0, ffmpeg.stderr)
  assert.equal(ffprobe.status, 0, ffprobe.stderr)
  if (!/\blibx264\b/.test(ffmpeg.stdout)) { t.skip('ffmpeg libx264 encoder is unavailable'); return false }
  return true
}

function scene(file, id, durationSec) {
  fs.writeFileSync(file, `export const meta = ${JSON.stringify({ id, durationSec, width: 320, height: 180, fps: 10 })}\nexport function draw(ctx, t) { ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#fff'; ctx.fillRect(10 + Math.floor(t * 20), 20, 30, 20) }\n`)
}

function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,nb_frames,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('renderScene encodes one second and emits deterministic snapshots', async (t) => {
  if (!mediaAvailable(t)) return
  const { renderScene } = await import('../scripts/render-scene.mjs')
  const dir = temp(t)
  const source = path.join(dir, 'scene.mjs')
  const out = path.join(dir, 'scene.mp4')
  scene(source, 'scene', 1)
  const report = await renderScene(source, { out, engine: 'cpu', encoder: 'libx264', threads: 1, minFreeMemMiB: 0, frames: [0.5, 0.5], framesDir: path.join(dir, 'frames'), contactSheet: path.join(dir, 'sheet.png') })
  assert.equal(report.encoder.encoder, 'libx264')
  assert.equal(report.engine.details.renderer, 'CPU')
  assert.equal(report.frames.length, 2)
  assert.deepEqual(fs.readFileSync(report.frames[0].path), fs.readFileSync(report.frames[1].path))
  const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  assert.equal(report.outputSha256, sha256(out))
  for (const frame of report.frames) assert.equal(frame.sha256, sha256(frame.path))
  assert.equal(report.frames[0].sha256, report.frames[1].sha256)
  assert.ok(fs.statSync(report.contactSheet).size > 0)
  const info = probe(out)
  assert.equal(info.streams[0].codec_name, 'h264')
  assert.equal(info.streams[0].width, 320)
  assert.equal(info.streams[0].height, 180)
  assert.equal(info.streams[0].r_frame_rate, '10/1')
  assert.equal(Number(info.streams[0].nb_frames), 10)
  assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.11)
})

test('episode renders contiguous scene fixture into one master', async (t) => {
  if (!mediaAvailable(t)) return
  const { renderEpisode } = await import('../scripts/render-episode.mjs')
  const dir = temp(t)
  fs.mkdirSync(path.join(dir, 'audio'))
  fs.writeFileSync(path.join(dir, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'silent', voiceOver: false }))
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ chunks: [] }))
  scene(path.join(dir, 'one.mjs'), 'one', 0.5)
  scene(path.join(dir, 'two.mjs'), 'two', 0.5)
  const timeline = { durationSec: 1, scenes: [{ id: 'one', source: 'one.mjs', startSec: 0, durationSec: 0.5 }, { id: 'two', source: 'two.mjs', startSec: 0.5, durationSec: 0.5 }] }
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline))
  const report = await renderEpisode(dir, { engine: 'cpu', encoder: 'libx264', threads: 1, minFreeMemMiB: 0 })
  assert.equal(report.scenes.length, 2)
  assert.equal(report.audioChunks, 0)
  const info = probe(report.output)
  assert.equal(info.streams[0].codec_name, 'h264')
  assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.11)
  for (const id of ['one', 'two']) {
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'reports', 'render-scenes', `${id}.render.json`), 'utf8'))
    assert.equal(persisted.meta.id, id)
    assert.equal(persisted.episodeOutput, report.output)
  }
  await assert.rejects(renderEpisode(dir, { engine: 'cpu', encoder: 'libx264', minFreeMemMiB: 0 }), /output already exists/i)
  timeline.scenes[1].startSec = 0.6
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline))
  await assert.rejects(renderEpisode(dir, { engine: 'cpu', encoder: 'libx264', minFreeMemMiB: 0 }), /contiguous/i)
})

test('compact imports invalidate the scene cache when a dependency changes', async (t) => {
  if (!mediaAvailable(t)) return
  const { renderEpisode } = await import('../scripts/render-episode.mjs')
  const dir = temp(t)
  fs.mkdirSync(path.join(dir, 'audio'))
  fs.writeFileSync(path.join(dir, 'production.json'), JSON.stringify({ mode: 'silent', voiceOver: false }))
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ chunks: [] }))
  fs.writeFileSync(path.join(dir, 'lib.mjs'), "export const color = '#123456'\n")
  fs.writeFileSync(path.join(dir, 'one.mjs'), "import{color}from'./lib.mjs'\nexport const meta={id:'one',durationSec:0.5,width:320,height:180,fps:10}\nexport function draw(ctx){ctx.fillStyle=color;ctx.fillRect(0,0,320,180)}\n")
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ durationSec: 0.5, scenes: [{ id: 'one', source: 'one.mjs', startSec: 0, durationSec: 0.5 }] }))
  const options = { engine: 'cpu', encoder: 'libx264', threads: 1, minFreeMemMiB: 0, overwrite: true }
  await renderEpisode(dir, options)
  const hit = await renderEpisode(dir, options)
  assert.equal(hit.scenes[0].cache, 'hit')
  const cached = path.join(dir, '.cache', 'render', `${hit.scenes[0].cacheKey}.mp4`)
  fs.unlinkSync(cached)
  fs.symlinkSync(hit.output, cached)
  assert.equal((await renderEpisode(dir, options)).scenes[0].cache, 'miss')
  fs.appendFileSync(path.join(dir, 'lib.mjs'), '// changed\n')
  assert.equal((await renderEpisode(dir, options)).scenes[0].cache, 'miss')
  fs.appendFileSync(path.join(dir, 'one.mjs'), "\nconst load = name => import('./' + name)\n")
  assert.equal((await renderEpisode(dir, options)).scenes[0].cache, 'miss')
  assert.equal((await renderEpisode(dir, options)).scenes[0].cache, 'miss')
})

test('parallel episode cache tracks imported modules and normalizes narration', async (t) => {
  if (!mediaAvailable(t)) return
  const { renderEpisode } = await import('../scripts/render-episode.mjs')
  const project = temp(t), dir = path.join(project, 'episodes', 'ep')
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true })
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ audio: { loudness: { integratedLufs: -16, truePeakDbtp: -1.5 } } }))
  fs.writeFileSync(path.join(dir, 'production.json'), JSON.stringify({ mode: 'narrated', voiceOver: true }))
  const tone = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4', '-ar', '48000', path.join(dir, 'audio', 'tone.wav')])
  assert.equal(tone.status, 0, String(tone.stderr))
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ chunks: [{ path: 'audio/tone.wav', durationSec: 4 }] }))
  fs.writeFileSync(path.join(dir, 'lib.mjs'), "export const color = '#123456'\n")
  fs.writeFileSync(path.join(dir, 'one.mjs'), "import{color}from'./lib.mjs'\nexport const meta = { id:'one', durationSec:2, width:320, height:180, fps:10 }\nexport function draw(ctx) { ctx.fillStyle=color; ctx.fillRect(0,0,320,180) }\n")
  scene(path.join(dir, 'two.mjs'), 'two', 2)
  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({ durationSec: 4, scenes: [{ id: 'one', source: 'one.mjs', startSec: 0, durationSec: 2 }, { id: 'two', source: 'two.mjs', startSec: 2, durationSec: 2 }] }))
  const options = { engine: 'cpu', encoder: 'libx264', threads: 1, concurrency: 2, minFreeMemMiB: 0, overwrite: true }
  const first = await renderEpisode(dir, options)
  assert.deepEqual(first.scenes.map(item => [item.meta.id, item.cache]), [['one', 'miss'], ['two', 'miss']])
  assert.ok(Math.abs(first.audio.loudness.measuredIntegratedLufs + 16) < 1)
  assert.equal(first.audio.loudness.targetTruePeakDbtp, -1.5)
  assert.ok(Number.isFinite(first.audio.loudness.measuredTruePeakDbtp))
  assert.ok(Number.isFinite(first.audio.loudness.measuredLra))
  const second = await renderEpisode(dir, options)
  assert.deepEqual(second.scenes.map(item => item.cache), ['hit', 'hit'])
  assert.deepEqual([first.audio.loudness.cache, second.audio.loudness.cache], ['miss', 'hit'])
  assert.equal(second.audio.loudness.measuredIntegratedLufs, first.audio.loudness.measuredIntegratedLufs)
  const outside = path.join(project, 'outside')
  fs.writeFileSync(outside, 'untouched')
  const cache = path.join(dir, '.cache', 'render')
  const video = path.join(cache, `${first.scenes[0].cacheKey}.mp4`)
  const audio = fs.readdirSync(cache).find(name => name.startsWith('audio-') && name.endsWith('.wav'))
  const targets = [video, `${video}.json`, path.join(cache, audio), path.join(cache, `${audio}.json`), path.join(dir, 'reports', 'render-scenes', 'one.render.json'), second.output]
  for (const target of targets) { fs.unlinkSync(target); fs.symlinkSync(outside, target) }
  await assert.rejects(renderEpisode(dir, { ...options, overwrite: false }), /output already exists/i)
  const replaced = await renderEpisode(dir, { ...options, noCache: true })
  assert.equal(replaced.scenes[0].cache, 'miss')
  assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched')
  for (const target of targets) assert.ok(fs.lstatSync(target).isFile())
  fs.appendFileSync(path.join(dir, 'lib.mjs'), '// changed\n')
  const louder = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-ar', '48000', path.join(dir, 'audio', 'tone.wav')])
  assert.equal(louder.status, 0, String(louder.stderr))
  const third = await renderEpisode(dir, options)
  assert.deepEqual(third.scenes.map(item => item.cache), ['miss', 'hit'])
  assert.equal(third.audio.loudness.cache, 'miss')
})
