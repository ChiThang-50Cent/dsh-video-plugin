#!/usr/bin/env node
/**
 * Machine capability report. It probes installed commands, not promises.
 *
 * `nvidia-smi` proves that a GPU exists; it does NOT prove that a TTS provider
 * uses it. Provider readiness is reported separately and stays false until the
 * audio preflight verifies the actual provider/device and a sample.
 *
 * Usage: node scripts/preflight.mjs [--require-media] [--require-audio] [--json]
 * Exit:  0 report produced, 2 a requested prerequisite is missing.
 */
import { pathToFileURL } from 'node:url'
import { probeCommand, runBounded } from './lib/bounded.mjs'

const BASE_COMMANDS = [
  ['node', ['--version']],
  ['ffmpeg', ['-version']],
  ['ffprobe', ['-version']],
  ['npx', ['--version']],
  ['python3', ['--version']],
  ['blender', ['--version']],
  ['google-chrome', ['--version']],
  ['chromium', ['--version']],
]

const AUDIO_PROVIDERS = [
  { id: 'espeak-ng', command: 'espeak-ng', args: ['--version'], device: 'cpu' },
  { id: 'espeak', command: 'espeak', args: ['--version'], device: 'cpu' },
  { id: 'piper', command: 'piper', args: ['--version'], device: 'cpu-or-gpu-unknown' },
  { id: 'edge-tts', command: 'edge-tts', args: ['--version'], device: 'network' },
  { id: 'omnivoice', command: 'omnivoice', args: ['--version'], device: 'unknown' },
  { id: 'say', command: 'say', args: ['--version'], device: 'cpu' },
]

const ASR_PROVIDERS = [
  { id: 'whisper', command: 'whisper', args: ['--version'] },
  { id: 'whisper-cpp', command: 'whisper-cli', args: ['--help'] },
]

function probeGpu() {
  const result = runBounded('nvidia-smi', ['--query-gpu=name,memory.free,compute_cap', '--format=csv,noheader,nounits'], { timeoutMs: 6000 })
  if (!result.ok) {
    return {
      present: false,
      source: 'nvidia-smi',
      error: result.timedOut ? 'timeout' : result.errorCode ?? `exit-${result.status}`,
      devices: [],
    }
  }
  const devices = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, memoryFreeMiB, computeCapability] = line.split(',').map((part) => part.trim())
    return { name, memoryFreeMiB: Number(memoryFreeMiB), computeCapability }
  })
  return { present: devices.length > 0, source: 'nvidia-smi', devices }
}

/**
 * @param {{ requireMedia?: boolean, requireAudio?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
export function buildPreflight(options = {}) {
  const tools = Object.fromEntries(BASE_COMMANDS.map(([cmd, args]) => [cmd, probeCommand(cmd, args, { env: options.env })]))
  const gpu = probeGpu()
  const audioProviders = AUDIO_PROVIDERS.map((provider) => {
    const probe = probeCommand(provider.command, provider.args, { env: options.env })
    return {
      ...provider,
      available: probe.available,
      resolved: probe.resolved,
      summary: probe.summary,
      error: probe.error,
      deviceVerified: false,
      note: probe.available
        ? 'command exists; GPU/device use and sample quality are NOT verified by preflight'
        : 'provider not installed',
    }
  })
  const asrProviders = ASR_PROVIDERS.map((provider) => ({ ...provider, ...probeCommand(provider.command, provider.args, { env: options.env }) }))
  const availableAudio = audioProviders.filter((provider) => provider.available)
  const capabilities = {
    media: {
      ffmpeg: tools.ffmpeg.available,
      ffprobe: tools.ffprobe.available,
      ready: tools.ffmpeg.available && tools.ffprobe.available,
    },
    gpuHardware: { present: gpu.present, source: gpu.source },
    audioSynthesis: {
      candidates: availableAudio.map((provider) => provider.id),
      // Hardware presence is not provider/device verification.
      providerVerified: false,
      readyForBatch: false,
      reason: availableAudio.length === 0
        ? 'no TTS provider command found'
        : 'run scripts/audio-preflight.mjs to verify the actual provider/device, voice reference and a sample before batch synthesis',
    },
    asr: {
      available: asrProviders.some((provider) => provider.available),
      providers: asrProviders.filter((provider) => provider.available).map((provider) => provider.id),
    },
  }
  const errors = []
  if (options.requireMedia === true && !capabilities.media.ready) errors.push('ffmpeg and ffprobe are required (--require-media)')
  if (options.requireAudio === true && availableAudio.length === 0) errors.push('a TTS provider is required (--require-audio)')
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    tools,
    gpu: {
      ...gpu,
      ttsReady: false,
      interpretation: 'GPU hardware was detected. This does not verify that a TTS provider can use it; never treat nvidia-smi as provider readiness.',
    },
    audioProviders,
    asrProviders,
    capabilities,
    errors,
  }
}

function main() {
  const argv = new Set(process.argv.slice(2))
  const report = buildPreflight({ requireMedia: argv.has('--require-media'), requireAudio: argv.has('--require-audio') })
  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) process.exitCode = 2
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
