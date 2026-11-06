#!/usr/bin/env node
/**
 * Pull reference frames, a contact sheet and a colour palette into a visual style.
 *
 * Usage:
 *   node scripts/extract-style-refs.mjs <style-id> <video-or-image...> --rights <note>
 *        [--at <sec,sec,...>] [--count <n>] [--data-root <dir>] [--json]
 *
 * Inputs are local files (download a web video yourself first, respecting its
 * terms). Videos yield frames at `--at` times or `--count` evenly spaced times
 * (default 6); images are converted as-is. Frames land in
 * `library/visual-styles/<id>/refs/`, with `contact.png` and `refs.json`
 * (sources, rights note, frame times, dominant colours). The palette is a hint
 * for editing style.json, not a design to copy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBounded } from './lib/bounded.mjs'
import { resolveDataRoot } from './studio-paths.mjs'

const IMAGE = /\.(png|jpe?g|webp|bmp|gif)$/i
const TIMEOUT_MS = 120_000

function ffmpeg(args) {
  const result = runBounded('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeoutMs: TIMEOUT_MS, retries: 0 })
  if (!result.ok) throw new Error(`ffmpeg failed: ${result.timedOut ? 'timed out' : (result.stderr || `exit ${result.status}`).trim()}`)
}

function durationOf(file) {
  const result = runBounded('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { timeoutMs: TIMEOUT_MS, retries: 0 })
  const duration = Number(JSON.parse(result.stdout || '{}').format?.duration)
  if (!result.ok || !Number.isFinite(duration) || duration <= 0) throw new Error(`cannot read duration of ${file}`)
  return duration
}

const slug = (file) => path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ref'

/** Dominant colours: 4-bit-per-channel histogram, near-duplicate bins merged into the closest pick; hex is the cluster's mean colour. */
export function dominantColors(pixelSets, limit = 8) {
  const bins = new Map()
  let total = 0
  for (const data of pixelSets) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
      const bin = bins.get(key) ?? { count: 0, sum: [0, 0, 0] }
      bin.count++
      bin.sum[0] += data[i]; bin.sum[1] += data[i + 1]; bin.sum[2] += data[i + 2]
      bins.set(key, bin)
      total++
    }
  }
  const centre = (key) => [(key >> 8) & 15, (key >> 4) & 15, key & 15].map((v) => v * 17)
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const ordered = [...bins].sort((a, b) => b[1].count - a[1].count)
  const picked = []
  for (const [key] of ordered) {
    const rgb = centre(key)
    if (picked.some((other) => distance(other.rgb, rgb) < 48)) continue
    picked.push({ rgb, count: 0, sum: [0, 0, 0] })
    if (picked.length === limit) break
  }
  for (const [key, bin] of ordered) {
    const rgb = centre(key)
    let best = null
    for (const pick of picked) if (distance(pick.rgb, rgb) < 48 && (!best || distance(pick.rgb, rgb) < distance(best.rgb, rgb))) best = pick
    if (!best) continue
    best.count += bin.count
    for (let j = 0; j < 3; j++) best.sum[j] += bin.sum[j]
  }
  return picked.sort((a, b) => b.count - a.count).map(({ count, sum }) => ({ hex: `#${sum.map((v) => Math.round(v / count).toString(16).padStart(2, '0')).join('')}`, share: Number((count / total).toFixed(4)) }))
}

export async function extractStyleRefs(id, inputs, options = {}) {
  if (typeof options.rights !== 'string' || !options.rights.trim()) throw new Error('--rights is required: who owns the reference and how it may be used')
  if (!inputs.length) throw new Error('at least one input file is required')
  const dataRoot = path.resolve(options.dataRoot ?? resolveDataRoot().dataRoot)
  const styleDir = path.join(dataRoot, 'library', 'visual-styles', id)
  if (!fs.existsSync(path.join(styleDir, 'style.json'))) throw new Error(`visual style "${id}" not found in the workspace; create it with scripts/new-visual-style.mjs first`)
  const refsDir = path.join(styleDir, 'refs')
  fs.mkdirSync(refsDir, { recursive: true })
  const indexFile = path.join(refsDir, 'refs.json')
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { schemaVersion: 1, sources: [] }
  const count = options.count ?? 6
  if (!Number.isInteger(count) || count < 1 || count > 48) throw new Error('--count must be an integer between 1 and 48')

  for (const input of inputs) {
    const file = path.resolve(input)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`input is not a local file: ${input}`)
    const base = slug(file)
    const frames = []
    if (IMAGE.test(file)) {
      const out = path.join(refsDir, `${base}.png`)
      ffmpeg(['-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", out])
      frames.push({ file: path.basename(out), timeSec: null })
    } else {
      const duration = durationOf(file)
      const times = options.at ?? Array.from({ length: count }, (_, i) => Number((((i + 0.5) / count) * duration).toFixed(3)))
      for (const [i, time] of times.entries()) {
        if (!Number.isFinite(time) || time < 0 || time >= duration) throw new Error(`frame time ${time}s is outside ${input} (${duration.toFixed(2)}s)`)
        const out = path.join(refsDir, `${base}-${String(i + 1).padStart(2, '0')}.png`)
        ffmpeg(['-ss', String(time), '-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", out])
        frames.push({ file: path.basename(out), timeSec: time })
      }
    }
    index.sources = index.sources.filter((source) => source.input !== file)
    index.sources.push({ input: file, rights: options.rights.trim(), extractedAt: new Date().toISOString(), frames })
  }

  const { Canvas, loadImage } = await import('skia-canvas')
  const files = index.sources.flatMap((source) => source.frames.map((frame) => path.join(refsDir, frame.file))).filter((file) => fs.existsSync(file))
  const cell = { width: 480, height: 270 }
  const columns = Math.min(3, files.length)
  const sheet = new Canvas(cell.width * columns, cell.height * Math.ceil(files.length / columns), { gpu: false })
  const ctx = sheet.getContext('2d')
  const pixelSets = []
  for (const [i, file] of files.entries()) {
    const image = await loadImage(file)
    const scale = Math.min(cell.width / image.width, cell.height / image.height)
    const width = image.width * scale, height = image.height * scale
    const x = (i % columns) * cell.width + (cell.width - width) / 2, y = Math.floor(i / columns) * cell.height + (cell.height - height) / 2
    ctx.drawImage(image, x, y, width, height)
    pixelSets.push(ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))).data)
  }
  await sheet.toFile(path.join(refsDir, 'contact.png'))
  index.contactSheet = 'contact.png'
  index.palette = dominantColors(pixelSets)
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`)
  return { id, refsDir, frames: files.length, palette: index.palette }
}

async function main() {
  const args = process.argv.slice(2)
  const options = {}
  const inputs = []
  let id, json = false
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      const value = () => { if (args[i + 1] === undefined) throw new Error(`${arg} needs a value`); return args[++i] }
      if (arg === '--rights') options.rights = value()
      else if (arg === '--at') options.at = value().split(',').map(Number)
      else if (arg === '--count') options.count = Number(value())
      else if (arg === '--data-root') options.dataRoot = value()
      else if (arg === '--json') json = true
      else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`)
      else if (id === undefined) id = arg
      else inputs.push(arg)
    }
    const result = await extractStyleRefs(id, inputs, options)
    console.log(json ? JSON.stringify(result, null, 2) : `${result.frames} reference frame(s) in ${result.refsDir}; palette ${result.palette.map((c) => c.hex).join(' ')}`)
  } catch (error) {
    console.error(`extract-style-refs: ${error.message}\nUsage: node scripts/extract-style-refs.mjs <style-id> <video-or-image...> --rights <note> [--at s,s] [--count n] [--data-root dir] [--json]`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
