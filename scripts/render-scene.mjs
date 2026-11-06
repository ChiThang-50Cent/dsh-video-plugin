#!/usr/bin/env node
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { Canvas } from 'skia-canvas'
import { createEngine, guardMemory } from './lib/render/engine.mjs'
import { selectEncoder, encoderArgs } from './lib/render/encoder.mjs'
import { createComponents } from './lib/render/components.mjs'
import { writeReport } from './lib/render/report.mjs'

function validateMeta(meta) {
  if (!meta || typeof meta.id !== 'string' || !meta.id.trim()) throw new Error('scene meta.id must be a non-empty string')
  for (const key of ['width', 'height', 'fps', 'durationSec']) {
    if (!Number.isFinite(meta[key]) || meta[key] <= 0) throw new Error(`scene meta.${key} must be positive and finite`)
  }
  if (!Number.isSafeInteger(meta.width) || !Number.isSafeInteger(meta.height)) throw new Error('scene width and height must be positive integers')
}

function startEncoder(args, encoder, timeoutMs) {
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] })
  let priorityError = null
  if (encoder === 'libx264' && child.pid) {
    try { os.setPriority(child.pid, 10) } catch (error) { priorityError = error.message }
  }
  let stderr = '', spawnError, timedOut = false
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536) })
  child.stdin.on('error', () => {})
  child.on('error', error => { spawnError = error })
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
  const done = new Promise(resolve => child.on('close', (code, signal) => {
    clearTimeout(timer)
    resolve({ code, signal, stderr, spawnError, timedOut })
  }))
  return { child, done, priorityError }
}

function encoderError(result) {
  return new Error(`FFmpeg ${result.timedOut ? 'timed out' : result.spawnError?.message || `failed (${result.signal || result.code})`}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`)
}

async function hashFile(filename) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}

export async function renderScene(scenePath, options = {}) {
  const started = Date.now()
  const stageStarted = performance.now()
  const timings = { setupMs: 0, snapshotsMs: 0, drawMs: 0, pixelReadMs: 0, pipeMs: 0, encodeMs: 0, hashMs: 0 }
  const memory = guardMemory(options.minFreeMemMiB ?? 1024)
  const sceneFile = path.resolve(scenePath)
  const { meta, draw } = await import(pathToFileURL(sceneFile).href)
  validateMeta(meta)
  if (typeof draw !== 'function') throw new Error('scene must export draw(ctx, t, api)')
  const snapshotsOnly = options.snapshotsOnly === true
  if (!snapshotsOnly && !options.out) throw new Error('--out is required unless --snapshots-only is set')
  const times = options.frames ?? []
  if (!Array.isArray(times) || times.some(t => !Number.isFinite(t) || t < 0 || t >= meta.durationSec)) throw new Error('frame times must be finite and within the scene duration')
  if (snapshotsOnly && times.length === 0) throw new Error('--snapshots-only requires --frames')
  if (times.length && !options.framesDir) throw new Error('--frames-dir is required with --frames')
  if (options.contactSheet && !times.length) throw new Error('--contact-sheet requires --frames')
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer')
  const engine = createEngine(meta.width, meta.height, options.engine ?? 'cpu')
  let sheet, proc
  try {
    const { canvas, ctx } = engine
    const api = createComponents(ctx, { ...options.components, ...(options.bodyFont === undefined ? {} : { bodyFont: options.bodyFont }) })
    timings.setupMs = performance.now() - stageStarted
    const paint = t => {
      const start = performance.now()
      ctx.reset()
      const result = draw(ctx, t, api)
      timings.drawMs += performance.now() - start
      if (result && typeof result.then === 'function') throw new Error('scene draw must be synchronous')
    }
    const frames = []
    const snapshotsStarted = performance.now()
    if (times.length) {
      await fs.mkdir(options.framesDir, { recursive: true })
      const columns = Math.min(3, times.length), rows = Math.ceil(times.length / columns)
      const cellWidth = Math.min(meta.width, 480), cellHeight = Math.max(1, Math.round(cellWidth * meta.height / meta.width))
      if (options.contactSheet) {
        sheet = new Canvas(cellWidth * columns, cellHeight * rows, { gpu: false })
      }
      for (let i = 0; i < times.length; i++) {
        paint(times[i])
        const filename = path.resolve(options.framesDir, `frame-${String(i + 1).padStart(3, '0')}.png`)
        const png = await canvas.toBuffer('png')
        await fs.writeFile(filename, png)
        frames.push({ time: times[i], path: filename, sha256: createHash('sha256').update(png).digest('hex') })
        if (sheet) sheet.getContext('2d').drawImage(canvas, (i % columns) * cellWidth, Math.floor(i / columns) * cellHeight, cellWidth, cellHeight)
      }
      if (sheet) {
        await fs.mkdir(path.dirname(path.resolve(options.contactSheet)), { recursive: true })
        await sheet.toFile(path.resolve(options.contactSheet))
      }
    }
    timings.snapshotsMs = performance.now() - snapshotsStarted
    let encoder = null
    let output = null
    let outputSha256 = null
    let priorityError = null
    if (!snapshotsOnly) {
      if (meta.width % 2 || meta.height % 2) throw new Error('H.264 yuv420p output requires even width and height')
      encoder = selectEncoder(options.encoder ?? 'auto')
      output = path.resolve(options.out)
      await fs.mkdir(path.dirname(output), { recursive: true })
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${meta.width}x${meta.height}`, '-framerate', String(meta.fps), '-i', 'pipe:0', '-an', ...encoderArgs(encoder.encoder, { threads: options.threads }), output]
      const encodeStarted = performance.now()
      proc = startEncoder(args, encoder.encoder, timeoutMs)
      priorityError = proc.priorityError
      let writeError
      try {
        const count = Math.ceil(meta.durationSec * meta.fps)
        for (let i = 0; i < count; i++) {
          paint(i / meta.fps)
          const readStarted = performance.now()
          const pixels = ctx.getImageData(0, 0, meta.width, meta.height).data
          timings.pixelReadMs += performance.now() - readStarted
          const pipeStarted = performance.now()
          await new Promise((resolve, reject) => proc.child.stdin.write(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), error => error ? reject(error) : resolve()))
          timings.pipeMs += performance.now() - pipeStarted
        }
        proc.child.stdin.end()
      } catch (error) {
        writeError = error
        proc.child.stdin.destroy()
        if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') proc.child.kill('SIGKILL')
      }
      const result = await proc.done
      proc = null
      if (writeError && writeError.code !== 'EPIPE' && writeError.code !== 'ERR_STREAM_DESTROYED') throw writeError
      if (result.code !== 0 || result.spawnError || result.timedOut) throw encoderError(result)
      if (writeError) throw writeError
      timings.encodeMs = performance.now() - encodeStarted
      const hashStarted = performance.now()
      outputSha256 = await hashFile(output)
      timings.hashMs = performance.now() - hashStarted
    }
    const report = { schemaVersion: 1, scene: sceneFile, meta, output, outputSha256, engine: { requested: engine.requested, details: engine.details, gpuDetails: engine.gpuDetails, gpuError: engine.gpuError, reason: engine.reason }, encoder, priorityError, memory, frames, contactSheet: options.contactSheet ? path.resolve(options.contactSheet) : null, snapshotsOnly, timings, elapsedMs: Date.now() - started }
    if (output) await writeReport(`${output}.render.json`, report)
    return report
  } finally {
    if (proc) { proc.child.stdin.destroy(); proc.child.kill('SIGKILL'); await proc.done }
    sheet?.dispose()
    engine.canvas.dispose()
  }
}

function parseArgs(args) {
  const scene = args.shift()
  if (!scene || scene.startsWith('--')) throw new Error('Usage: render-scene.mjs <scene.mjs> --out <mp4> [--engine cpu|gpu|auto] [--encoder auto|h264_nvenc|libx264] [--threads n] [--body-font family] [--frames seconds,... --frames-dir dir] [--contact-sheet png] [--min-free-mem-mib n] [--snapshots-only] [--json]')
  const options = {}
  const names = { '--out': 'out', '--engine': 'engine', '--encoder': 'encoder', '--threads': 'threads', '--body-font': 'bodyFont', '--frames': 'frames', '--frames-dir': 'framesDir', '--contact-sheet': 'contactSheet', '--min-free-mem-mib': 'minFreeMemMiB' }
  while (args.length) {
    const flag = args.shift()
    if (flag === '--json') { options.json = true; continue }
    if (flag === '--snapshots-only') { options.snapshotsOnly = true; continue }
    const key = names[flag]
    if (!key || !args.length || args[0].startsWith('--')) throw new Error(`Unknown option or missing value: ${flag}`)
    const value = args.shift()
    options[key] = key === 'frames' ? value.split(',').map(item => item.trim() === '' ? NaN : Number(item)) : ['threads', 'minFreeMemMiB'].includes(key) ? Number(value) : value
  }
  return { scene, options }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { scene, options } = parseArgs(process.argv.slice(2))
    const report = await renderScene(scene, options)
    console.log(options.json ? JSON.stringify(report, null, 2) : `Rendered ${report.meta.id}: ${report.output ?? `${report.frames.length} snapshots`}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
