import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadImage, Canvas } from 'skia-canvas'
import { resolveVisualStyle } from '../scripts/lib/render/theme.mjs'
import { renderScene } from '../scripts/render-scene.mjs'
import { newVisualStyle } from '../scripts/new-visual-style.mjs'
import { extractStyleRefs, dominantColors } from '../scripts/extract-style-refs.mjs'

const mediaAvailable = () => spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0

function workspace(t) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-look-'))
  t.after(() => fs.rmSync(data, { recursive: true, force: true }))
  const project = path.join(data, 'projects', 'series')
  const episode = path.join(project, 'episodes', 'ep-001')
  fs.mkdirSync(episode, { recursive: true })
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schemaVersion: 1 }))
  fs.writeFileSync(path.join(episode, 'production.json'), JSON.stringify({ schemaVersion: 1, mode: 'silent' }))
  return { data, project, episode }
}

function look(data, id, colors = {}, extra = {}) {
  const dir = path.join(data, 'library', 'visual-styles', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'style.json'), JSON.stringify({
    schemaVersion: 1, id, colors: { background: '#000000', ink: '#ffffff', muted: '#888888', line: '#444444', accent: '#ffcc00', structure: '#00ccaa', success: '#00cc66', error: '#ff4444', ...colors },
    typography: { body: { family: 'sans-serif', size: 40 } }, ...extra,
  }))
  return dir
}

const setJson = (file, patch) => fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...patch }))

test('episode choice overrides the series choice, which overrides the built-in default', (t) => {
  const { data, project, episode } = workspace(t)
  look(data, 'series-look')
  look(data, 'episode-look')
  assert.deepEqual([resolveVisualStyle({ episodeRoot: episode }).id, resolveVisualStyle({ episodeRoot: episode }).source], ['default', 'default'])
  setJson(path.join(project, 'project.json'), { visualStyle: 'series-look' })
  assert.deepEqual([resolveVisualStyle({ episodeRoot: episode }).id, resolveVisualStyle({ episodeRoot: episode }).source], ['series-look', 'project.json'])
  setJson(path.join(episode, 'production.json'), { visualStyle: 'episode-look' })
  assert.deepEqual([resolveVisualStyle({ episodeRoot: episode }).id, resolveVisualStyle({ episodeRoot: episode }).source], ['episode-look', 'production.json'])
  assert.equal(resolveVisualStyle({ episodeRoot: episode, id: 'series-look' }).id, 'series-look')
})

test('a workspace package shadows the built-in look with the same id', (t) => {
  const { data, episode } = workspace(t)
  look(data, 'default', { background: '#123456' })
  assert.equal(resolveVisualStyle({ episodeRoot: episode }).style.colors.background, '#123456')
})

test('broken packages are rejected with the reason', (t) => {
  const { data, project, episode } = workspace(t)
  setJson(path.join(project, 'project.json'), { visualStyle: 'broken' })
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode }), /"broken" not found/)
  look(data, 'broken', {}, { fonts: [{ family: 'Brand', file: 'fonts/Brand.ttf' }] })
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode }), /fonts\[0\]\.file not found/)
  look(data, 'broken', {}, { fonts: [{ family: 'Brand', file: '../../escape.ttf' }] })
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode }), /escapes the style package/)
  look(data, 'broken', {}, { id: 'other' })
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode }), /does not match its directory/)
  look(data, 'broken', {}, { colors: { background: '#000000', ink: '#ffffff' } })
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode }), /colors\.muted is required/)
  assert.throws(() => resolveVisualStyle({ episodeRoot: episode, id: '../x' }), /lowercase slug/)
})

test('the style hash covers style.json and the font files it declares', (t) => {
  const { data, episode } = workspace(t)
  const dir = look(data, 'branded', {}, { fonts: [{ family: 'Brand', file: 'fonts/Brand.ttf' }] })
  fs.mkdirSync(path.join(dir, 'fonts'))
  fs.writeFileSync(path.join(dir, 'fonts', 'Brand.ttf'), 'font v1')
  const first = resolveVisualStyle({ episodeRoot: episode, id: 'branded' }).sha256
  fs.writeFileSync(path.join(dir, 'fonts', 'Brand.ttf'), 'font v2')
  const second = resolveVisualStyle({ episodeRoot: episode, id: 'branded' }).sha256
  const styleFile = path.join(dir, 'style.json')
  setJson(styleFile, { colors: { ...JSON.parse(fs.readFileSync(styleFile, 'utf8')).colors, ink: '#eeeeee' } })
  const third = resolveVisualStyle({ episodeRoot: episode, id: 'branded' }).sha256
  assert.equal(new Set([first, second, third]).size, 3)
})

async function pixel(file) {
  const image = await loadImage(file)
  const canvas = new Canvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  return [...ctx.getImageData(1, 1, 1, 1).data.slice(0, 3)]
}

test('scenes paint with the active theme and switching the style restyles them without code changes', async (t) => {
  const { data, episode } = workspace(t)
  look(data, 'warm', { background: '#ff0000' })
  look(data, 'cool', { background: '#0000ff' })
  const scene = path.join(episode, 'scenes', 'title.mjs')
  fs.mkdirSync(path.dirname(scene), { recursive: true })
  fs.writeFileSync(scene, "export const meta = { id: 'title', durationSec: 1, width: 64, height: 36, fps: 10 }\nexport function draw(ctx, t, api) { ctx.fillStyle = api.theme.colors.background; ctx.fillRect(0, 0, 64, 36) }\n")
  setJson(path.join(episode, 'production.json'), { visualStyle: 'warm' })
  const warm = await renderScene(scene, { snapshotsOnly: true, frames: [0], framesDir: path.join(episode, 'warm'), minFreeMemMiB: 0 })
  setJson(path.join(episode, 'production.json'), { visualStyle: 'cool' })
  const cool = await renderScene(scene, { snapshotsOnly: true, frames: [0], framesDir: path.join(episode, 'cool'), minFreeMemMiB: 0 })
  assert.deepEqual(await pixel(warm.frames[0].path), [255, 0, 0])
  assert.deepEqual(await pixel(cool.frames[0].path), [0, 0, 255])
  assert.deepEqual([warm.style.id, cool.style.id], ['warm', 'cool'])
  assert.notEqual(warm.style.sha256, cool.style.sha256)
})

test('changing the episode style invalidates every cached scene', async (t) => {
  if (!mediaAvailable()) return t.skip('ffmpeg unavailable')
  const { renderEpisode } = await import('../scripts/render-episode.mjs')
  const { data, episode } = workspace(t)
  look(data, 'warm', { background: '#ff0000' })
  fs.mkdirSync(path.join(episode, 'audio'))
  fs.writeFileSync(path.join(episode, 'audio', 'manifest.json'), JSON.stringify({ chunks: [] }))
  fs.writeFileSync(path.join(episode, 'title.mjs'), "export const meta = { id: 'title', durationSec: 1, width: 64, height: 36, fps: 10 }\nexport function draw(ctx, t, api) { ctx.fillStyle = api.theme.colors.background; ctx.fillRect(0, 0, 64, 36) }\n")
  fs.writeFileSync(path.join(episode, 'timeline.json'), JSON.stringify({ durationSec: 1, scenes: [{ id: 'title', source: 'title.mjs', startSec: 0, durationSec: 1 }] }))
  const options = { engine: 'cpu', encoder: 'libx264', threads: 1, minFreeMemMiB: 0, overwrite: true }
  const first = await renderEpisode(episode, options)
  assert.deepEqual([first.style.id, first.scenes[0].cache], ['default', 'miss'])
  assert.equal((await renderEpisode(episode, options)).scenes[0].cache, 'hit')
  setJson(path.join(episode, 'production.json'), { visualStyle: 'warm' })
  const restyled = await renderEpisode(episode, options)
  assert.deepEqual([restyled.style.id, restyled.scenes[0].cache, restyled.scenes[0].style.id], ['warm', 'miss', 'warm'])
})

test('new-visual-style copies a look under a new id and never overwrites', (t) => {
  const { data } = workspace(t)
  const dir = look(data, 'base', { accent: '#abcdef' }, { fonts: [{ family: 'Brand', file: 'fonts/Brand.ttf' }] })
  fs.mkdirSync(path.join(dir, 'fonts'))
  fs.writeFileSync(path.join(dir, 'fonts', 'Brand.ttf'), 'font')
  fs.mkdirSync(path.join(dir, 'refs'))
  fs.writeFileSync(path.join(dir, 'refs', 'frame.png'), 'ref')
  const created = newVisualStyle('remix', { from: 'base', name: 'Remix', dataRoot: data })
  const resolved = resolveVisualStyle({ id: 'remix', dataRoot: data })
  assert.deepEqual([resolved.style.id, resolved.style.name, resolved.style.derivedFrom, resolved.style.colors.accent], ['remix', 'Remix', 'base', '#abcdef'])
  assert.equal(fs.existsSync(path.join(created.dir, 'refs')), false)
  assert.ok(fs.existsSync(path.join(created.dir, 'notes.md')))
  assert.throws(() => newVisualStyle('remix', { from: 'base', dataRoot: data }), /refusing to overwrite/)
  assert.equal(newVisualStyle('plain', { dataRoot: data }).from, 'default')
})

test('palette counts a noisy background as one colour and reports its real mean', () => {
  const pixels = []
  for (let i = 0; i < 900; i++) { const n = i % 3 * 6; pixels.push(8 + n, 12 + n, 23 + n, 255) }
  for (let i = 0; i < 100; i++) pixels.push(255, 200, 87, 255)
  const palette = dominantColors([Uint8ClampedArray.from(pixels)])
  assert.deepEqual(palette.map(colour => colour.share), [0.9, 0.1])
  assert.deepEqual(palette.map(colour => colour.hex), ['#0e121d', '#ffc857'])
})

test('extract-style-refs samples videos and images into frames, a contact sheet and a palette', async (t) => {
  if (!mediaAvailable()) return t.skip('ffmpeg unavailable')
  const { data } = workspace(t)
  look(data, 'target')
  const video = path.join(data, 'clip.mp4')
  const image = path.join(data, 'still.png')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0xff0000:s=160x90:d=2', '-pix_fmt', 'yuv420p', video]).status, 0)
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x0000ff:s=160x90', '-frames:v', '1', image]).status, 0)
  await assert.rejects(extractStyleRefs('target', [video], { dataRoot: data }), /--rights is required/)
  await assert.rejects(extractStyleRefs('missing', [video], { dataRoot: data, rights: 'own' }), /not found in the workspace/)
  await assert.rejects(extractStyleRefs('target', [video], { dataRoot: data, rights: 'own', at: [5] }), /outside/)
  const result = await extractStyleRefs('target', [video, image], { dataRoot: data, rights: 'Own test media', count: 3 })
  assert.equal(result.frames, 4)
  const refs = JSON.parse(fs.readFileSync(path.join(result.refsDir, 'refs.json'), 'utf8'))
  assert.deepEqual(refs.sources.map((source) => source.frames.length), [3, 1])
  assert.equal(refs.sources[0].rights, 'Own test media')
  assert.ok(fs.existsSync(path.join(result.refsDir, 'contact.png')))
  const near = (hex, [r, g, b]) => Math.hypot(parseInt(hex.slice(1, 3), 16) - r, parseInt(hex.slice(3, 5), 16) - g, parseInt(hex.slice(5, 7), 16) - b) < 40
  assert.ok(near(result.palette[0].hex, [255, 0, 0]), JSON.stringify(result.palette))
  assert.ok(result.palette.some((color) => near(color.hex, [0, 0, 255])), JSON.stringify(result.palette))
})
