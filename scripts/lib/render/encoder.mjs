import os from 'node:os'
import { probeNvenc } from '../../preflight.mjs'

export function selectEncoder(requested = 'auto', options = {}) {
  if (!['auto', 'h264_nvenc', 'libx264'].includes(requested)) throw new Error(`Unknown video encoder: ${requested}`)
  if (requested === 'libx264') return { encoder: requested, reason: 'Explicit libx264 selection', probe: null }
  const probe = (options.probe ?? probeNvenc)()
  if (probe.available) return { encoder: 'h264_nvenc', reason: 'NVENC passed a real encode probe', probe }
  const reason = `NVENC unavailable: ${probe.detail || probe.error || 'probe failed'}`
  if (requested === 'h264_nvenc') throw new Error(`${reason}. Check GPU access and the DSH GPU runner.`)
  return { encoder: 'libx264', reason: `${reason}; using libx264`, probe }
}

export function encoderArgs(encoder, options = {}) {
  const name = typeof encoder === 'string' ? encoder : encoder.encoder
  if (name === 'h264_nvenc') return ['-c:v', name, '-preset', 'p5', '-rc', 'vbr', '-cq', '28', '-b:v', '0', '-pix_fmt', 'yuv420p']
  if (name !== 'libx264') throw new Error(`Unknown video encoder: ${name}`)
  const threads = options.threads ?? Math.max(1, Math.floor((typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) / 2))
  if (!Number.isInteger(threads) || threads < 1) throw new Error('threads must be a positive integer')
  return ['-c:v', name, '-preset', 'medium', '-crf', '23', '-threads', String(threads), '-pix_fmt', 'yuv420p']
}
