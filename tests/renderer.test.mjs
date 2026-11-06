import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createEngine, guardMemory } from '../scripts/lib/render/engine.mjs'
import { selectEncoder, encoderArgs } from '../scripts/lib/render/encoder.mjs'

const require = createRequire(import.meta.url)
function installed(name) {
  try { require.resolve(name); return true } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') return false
    throw error
  }
}
const hasSkia = installed('skia-canvas')
const hasMathJax = installed('@mathjax/src/js/mathjax.js')

function pixels(ctx, width, height) {
  return Buffer.from(ctx.getImageData(0, 0, width, height).data)
}

test('RAM guard accepts the threshold and rejects insufficient or invalid limits', () => {
  assert.deepEqual(guardMemory(64, 64 * 1048576), { availableMiB: 64, minFreeMiB: 64 })
  assert.throws(() => guardMemory(64, 63 * 1048576), /insufficient.*RAM/i)
  assert.throws(() => guardMemory(-1, 1048576), /non-negative/i)
})

test('engine selection defaults to CPU and rejects unknown engines', { skip: !hasSkia && 'skia-canvas is not installed' }, () => {
  for (const requested of ['auto', 'cpu']) {
    const result = createEngine(64, 48, requested)
    try {
      assert.equal(result.requested, requested)
      assert.ok(requested === 'cpu' ? result.details.renderer === 'CPU' : ['CPU', 'GPU'].includes(result.details.renderer))
      assert.ok(result.reason)
    } finally { result.canvas.dispose() }
  }
  const defaultEngine = createEngine(64, 48)
  try { assert.equal(defaultEngine.details.renderer, 'CPU') } finally { defaultEngine.canvas.dispose() }
  assert.throws(() => createEngine(64, 48, 'bogus'), /unknown.*engine/i)
})

test('explicit GPU requires an actual GPU renderer rather than silently falling back', { skip: !hasSkia && 'skia-canvas is not installed' }, () => {
  let result
  try { result = createEngine(64, 48, 'gpu') } catch (error) {
    assert.match(error.message, /GPU.*(?:requested|renderer)/i)
    return
  }
  try { assert.equal(result.details.renderer, 'GPU') } finally { result.canvas.dispose() }
})

test('GPU fallback is detected and auto records CPU fallback details', () => {
  class CpuFallbackCanvas {
    engine = { renderer: 'CPU', error: 'Vulkan unavailable' }
    getContext() { return { fillRect() {}, getImageData() {} } }
    dispose() {}
  }
  const options = { Canvas: CpuFallbackCanvas }
  assert.throws(() => createEngine(64, 48, 'gpu', options), /GPU.*CPU/i)
  const auto = createEngine(64, 48, 'auto', options)
  try {
    assert.equal(auto.details.renderer, 'CPU')
    assert.match(auto.reason, /GPU.*(?:unavailable|CPU)/i)
    assert.match(JSON.stringify(auto.gpuDetails ?? auto.details), /Vulkan unavailable/)
  } finally { auto.canvas.dispose() }
})

test('GPU initialization errors fail explicitly and auto records the error', () => {
  class FailingGpuCanvas {
    set gpu(value) { this.useGpu = value }
    get engine() { return { renderer: 'CPU' } }
    getContext() {
      if (this.useGpu) throw new Error('Vulkan initialization failed')
      return { fillRect() {}, getImageData() {} }
    }
    dispose() {}
  }
  const options = { Canvas: FailingGpuCanvas }
  assert.throws(() => createEngine(64, 48, 'gpu', options), /GPU.*Vulkan initialization failed/i)
  const auto = createEngine(64, 48, 'auto', options)
  try {
    assert.equal(auto.details.renderer, 'CPU')
    assert.match(auto.reason, /Vulkan initialization failed/)
    assert.match(String(auto.gpuError), /Vulkan initialization failed/)
  } finally { auto.canvas.dispose() }
})

test('encoder selection uses the real probe result and reports fallback', () => {
  const success = () => ({ available: true })
  const failure = () => ({ available: false, detail: 'GPU unavailable' })
  assert.equal(selectEncoder('auto', { probe: success }).encoder, 'h264_nvenc')
  const fallback = selectEncoder('auto', { probe: failure })
  assert.equal(fallback.encoder, 'libx264')
  assert.match(fallback.reason, /GPU unavailable/)
  assert.throws(() => selectEncoder('h264_nvenc', { probe: failure }), /NVENC unavailable/)
  assert.equal(selectEncoder('libx264', { probe: () => { throw new Error('must not probe') } }).encoder, 'libx264')
  assert.throws(() => selectEncoder('other'), /unknown.*encoder/i)
  const cpuArgs = encoderArgs('libx264', { threads: 2 })
  assert.equal(cpuArgs[cpuArgs.indexOf('-threads') + 1], '2')
  assert.ok(cpuArgs.includes('yuv420p'))
  assert.ok(encoderArgs('h264_nvenc').includes('h264_nvenc'))
  assert.throws(() => encoderArgs('libx264', { threads: 0 }), /threads/)
})

test('canvas and formula render deterministic pixels with a meaningful bounding box', { skip: !(hasSkia && hasMathJax) && 'skia-canvas or MathJax is not installed' }, async () => {
  const { createComponents } = await import('../scripts/lib/render/components.mjs')
  const render = () => {
    const { canvas, ctx } = createEngine(320, 120, 'cpu')
    try {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 320, 120)
      const api = createComponents(ctx)
      const box = api.formula('x^2 + y^2 = z^2', 20, 60, { size: 24, color: '#000' })
      for (const key of ['x', 'y', 'width', 'height', 'baseline']) assert.ok(Number.isFinite(box[key]), `${key}: ${box[key]}`)
      assert.ok(box.width > 0 && box.height > 0)
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 120)
      const data = pixels(ctx, 320, 120)
      let ink = false
      for (let y = Math.floor(box.y); y < Math.ceil(box.y + box.height); y++) {
        for (let x = Math.floor(box.x); x < Math.ceil(box.x + box.width); x++) {
          const index = (y * 320 + x) * 4
          if (data[index] < 200 || data[index + 1] < 200 || data[index + 2] < 200) ink = true
        }
      }
      assert.ok(ink, 'formula bounding box should contain visible pixels')
      return { box, hash: createHash('sha256').update(data).digest('hex') }
    } finally { canvas.dispose() }
  }
  assert.deepEqual(render(), render())
})
