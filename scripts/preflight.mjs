#!/usr/bin/env node
/**
 * Machine capability report. It probes installed commands, not promises.
 *
 * `nvidia-smi` proves that a GPU exists; it does NOT prove that a TTS provider
 * uses it. Provider readiness is reported separately and stays false until the
 * audio preflight verifies the actual provider/device and a sample.
 *
 * Usage: node scripts/preflight.mjs [--require-media] [--require-audio] [--python [executable]] [--json|--human]
 * Exit:  0 report produced, 2 a requested prerequisite is missing.
 */
import fs from 'node:fs'
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
  { id: 'omnivoice', command: 'omnivoice-infer', args: ['--help'], device: 'unknown' },
  { id: 'say', command: 'say', args: ['--version'], device: 'cpu' },
]

const ASR_PROVIDERS = [
  { id: 'whisper', command: 'whisper', args: ['--version'] },
  { id: 'whisper-cpp', command: 'whisper-cli', args: ['--help'] },
]

function failure(result) {
  return result.timedOut ? 'timeout' : result.errorCode ?? (result.signal ? `signal-${result.signal}` : `exit-${result.status}`)
}

function probeGpu(run, env, exists, readDirectory) {
  let driverGpus = []
  try { driverGpus = readDirectory('/proc/driver/nvidia/gpus') } catch {}
  const pci = run('lspci', ['-nn'], { timeoutMs: 6000, retries: 0, env })
  const pciGpus = pci.ok ? pci.stdout.split(/\r?\n/).filter((line) => /nvidia|10de:/i.test(line) && /vga|3d controller|display controller/i.test(line)) : []
  const hostEvidence = {
    nvidiaDriver: exists('/proc/driver/nvidia/version'),
    driverGpus,
    pciGpus,
    lspciError: pci.ok ? null : failure(pci),
  }
  const visibility = {
    nvidiaDevice: exists('/dev/nvidia0'),
    nvidiaControlDevice: exists('/dev/nvidiactl'),
    wslGpuDevice: exists('/dev/dxg'),
    cudaVisibleDevices: env.CUDA_VISIBLE_DEVICES ?? null,
    nvidiaVisibleDevices: env.NVIDIA_VISIBLE_DEVICES ?? null,
  }
  const result = run('nvidia-smi', ['--query-gpu=name,memory.free,compute_cap', '--format=csv,noheader,nounits'], { timeoutMs: 6000, retries: 0, env })
  const devices = result.ok ? result.stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const [name, memoryFreeMiB, computeCapability] = line.split(',').map((part) => part.trim())
    const memory = Number(memoryFreeMiB)
    return { name, memoryFreeMiB: Number.isFinite(memory) ? memory : null, computeCapability }
  }) : []
  return {
    present: devices.length > 0, source: 'nvidia-smi', devices, hostEvidence, visibility,
    error: result.ok ? null : failure(result),
  }
}

function probeNvenc(run, env) {
  // Actually initialize the encoder and encode a frame; the encoder list alone
  // does not establish driver/device access.
  const result = run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=25:d=1',
    '-t', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-',
  ], { timeoutMs: 10000, retries: 0, env })
  return { tested: true, available: result.ok, error: result.ok ? null : failure(result), detail: result.ok ? null : (result.stderr || '').trim().slice(0, 1000) }
}

function probeCuda(run, env, python) {
  if (!python) return { tested: false, available: null, reason: 'not requested; pass --python to probe PyTorch CUDA' }
  const code = 'import json, torch; print(json.dumps({"available": torch.cuda.is_available(), "deviceCount": torch.cuda.device_count(), "torchVersion": torch.__version__, "cudaVersion": torch.version.cuda}))'
  const result = run(python, ['-c', code], { timeoutMs: 15000, retries: 0, env })
  if (!result.ok) return { tested: true, available: false, python, error: failure(result), detail: (result.stderr || '').trim().slice(0, 1000) }
  try {
    const data = JSON.parse(result.stdout.trim())
    if (typeof data.available !== 'boolean' || !Number.isInteger(data.deviceCount) || data.deviceCount < 0) throw new Error('invalid CUDA probe output')
    return { tested: true, python, ...data }
  } catch {
    return { tested: true, available: false, python, error: 'invalid-output', detail: result.stdout.trim().slice(0, 1000) }
  }
}

function gpuAssessment(gpu, nvenc) {
  const recommendedEncoder = nvenc.available ? 'h264_nvenc' : 'libx264'
  if (gpu.present || nvenc.available) return { status: 'available', remediation: nvenc.available ? 'NVENC is available; verify each audio provider separately. See docs/dsh.md.' : 'Check FFmpeg NVENC support, NVIDIA driver compatibility, device permissions and video driver capabilities. See docs/dsh.md.', recommendedEncoder }
  if (gpu.hostEvidence.nvidiaDriver || gpu.hostEvidence.driverGpus.length || gpu.hostEvidence.pciGpus.length || gpu.visibility.nvidiaDevice || gpu.visibility.nvidiaControlDevice || gpu.visibility.wslGpuDevice) {
    return { status: 'hidden-by-sandbox', remediation: 'GPU evidence exists but no NVIDIA device was reported; check drivers, device permissions and sandbox GPU passthrough. See docs/dsh.md.', recommendedEncoder }
  }
  return { status: 'absent', remediation: 'No NVIDIA GPU was detected; expose a supported GPU and driver to enable NVENC. See docs/dsh.md.', recommendedEncoder }
}

/**
 * @param {{ requireMedia?: boolean, requireAudio?: boolean, env?: NodeJS.ProcessEnv, python?: string, probes?: { runBounded?: typeof runBounded, probeCommand?: typeof probeCommand, exists?: typeof fs.existsSync, readDirectory?: typeof fs.readdirSync } }} [options]
 */
export function buildPreflight(options = {}) {
  const env = options.env ?? process.env
  const run = options.probes?.runBounded ?? runBounded
  const command = options.probes?.probeCommand ?? probeCommand
  const exists = options.probes?.exists ?? fs.existsSync
  const readDirectory = options.probes?.readDirectory ?? fs.readdirSync
  const tools = Object.fromEntries(BASE_COMMANDS.map(([cmd, args]) => [cmd, command(cmd, args, { env })]))
  const gpu = probeGpu(run, env, exists, readDirectory)
  const nvenc = probeNvenc(run, env)
  const cuda = probeCuda(run, env, options.python)
  const assessment = gpuAssessment(gpu, nvenc)
  const audioProviders = AUDIO_PROVIDERS.map((provider) => {
    const probe = command(provider.command, provider.args, { env })
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
  const asrProviders = ASR_PROVIDERS.map((provider) => ({ ...provider, ...command(provider.command, provider.args, { env }) }))
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
      nvenc,
      cuda,
      ...assessment,
      ttsReady: false,
      interpretation: 'GPU hardware and encoder verification does not verify TTS provider readiness; run audio preflight before synthesis.',
    },
    audioProviders,
    asrProviders,
    capabilities,
    errors,
  }
}

function main() {
  const args = process.argv.slice(2)
  const argv = new Set(args)
  const pythonIndex = args.indexOf('--python')
  const python = pythonIndex < 0 ? undefined : args[pythonIndex + 1] && !args[pythonIndex + 1].startsWith('--') ? args[pythonIndex + 1] : 'python3'
  const report = buildPreflight({ requireMedia: argv.has('--require-media'), requireAudio: argv.has('--require-audio'), python })
  if (argv.has('--human') && !argv.has('--json')) {
    console.log(`GPU: ${report.gpu.status}`)
    console.log(`NVIDIA devices: ${report.gpu.devices.map((device) => device.name).join(', ') || 'none reported'}`)
    console.log(`Host evidence: ${JSON.stringify(report.gpu.hostEvidence)}`)
    console.log(`Visibility: ${JSON.stringify(report.gpu.visibility)}`)
    console.log(`NVENC: ${report.gpu.nvenc.available ? 'verified' : `unavailable (${report.gpu.nvenc.error})`}`)
    console.log(`PyTorch CUDA: ${report.gpu.cuda.tested ? (report.gpu.cuda.available ? 'available' : `unavailable (${report.gpu.cuda.error ?? 'no CUDA device'})`) : 'not tested'}`)
    console.log(`Recommended encoder: ${report.gpu.recommendedEncoder} (software fallback is not verified)`)
    console.log(`Remediation: ${report.gpu.remediation}`)
    console.log(`Audio: ${report.capabilities.audioSynthesis.reason}`)
    for (const error of report.errors) console.log(`Error: ${error}`)
  } else console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) process.exitCode = 2
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
