import os from 'node:os'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function availableMemory() {
  // os.freemem() excludes reclaimable caches on Linux; MemAvailable does not.
  if (typeof os.availableMemory === 'function') return os.availableMemory()
  if (process.platform === 'linux') {
    try {
      const match = fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)\s+kB/m)
      if (match) return Number(match[1]) * 1024
    } catch {}
  }
  return os.freemem()
}

export function guardMemory(minMiB = 1024, availableBytes = availableMemory()) {
  if (!Number.isFinite(minMiB) || minMiB < 0) throw new Error('min-free-mem-mib must be a non-negative number')
  const availableMiB = availableBytes / 1048576
  if (!Number.isFinite(availableMiB) || availableMiB < minMiB) throw new Error(`Insufficient available RAM: ${Math.floor(availableMiB)} MiB available, ${minMiB} MiB required`)
  return { availableMiB: Math.floor(availableMiB), minFreeMiB: minMiB }
}

export function createEngine(width, height, engine = 'cpu', options = {}) {
  if (!['auto', 'cpu', 'gpu'].includes(engine)) throw new Error(`Unknown render engine: ${engine}`)
  const Canvas = options.Canvas ?? require('skia-canvas').Canvas
  const canvas = new Canvas(width, height)
  try {
    canvas.gpu = engine !== 'cpu'
    const ctx = canvas.getContext('2d')
    // Rendering forces backend initialization before inspecting the actual renderer.
    ctx.fillRect(0, 0, 1, 1)
    ctx.getImageData(0, 0, 1, 1)
    const details = canvas.engine
    if (engine === 'gpu' && details.renderer !== 'GPU') throw new Error(`GPU render engine requested but Skia selected ${details.renderer}: ${JSON.stringify(details)}. Check GPU access and the DSH GPU runner.`)
    return { canvas, ctx, requested: engine, details, gpuDetails: engine === 'auto' ? details : null, gpuError: null, reason: engine === 'auto' ? (details.renderer === 'GPU' ? 'GPU renderer available' : 'GPU unavailable; Skia selected CPU') : `Explicit ${engine.toUpperCase()} renderer` }
  } catch (error) {
    let gpuDetails = null
    try { gpuDetails = canvas.engine } catch {}
    canvas.dispose()
    if (engine === 'auto') {
      const fallback = createEngine(width, height, 'cpu', options)
      return { ...fallback, requested: 'auto', gpuDetails, gpuError: error.message, reason: `GPU initialization failed; using CPU: ${error.message}` }
    }
    if (engine === 'gpu' && !error.message.includes('GPU render engine requested')) throw new Error(`GPU render engine requested but initialization failed: ${error.message}. Check GPU access and the DSH GPU runner.`, { cause: error })
    throw error
  }
}
