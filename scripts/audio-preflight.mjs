#!/usr/bin/env node
/**
 * Audio preflight: verify the actual provider/device, the voice reference and a
 * short synthesis sample before batch production.
 *
 * Hardware detection is not provider verification. A machine with `nvidia-smi`
 * can still have no GPU-capable TTS provider, and a provider can silently run
 * on CPU. If the project requires GPU, this tool refuses to continue unless the
 * configured device probe and the sample both pass; it never falls back
 * silently.
 *
 * No batch synthesis or GPU inference happens during this repository's tests.
 *
 * Usage:
 *   node scripts/audio-preflight.mjs --provider <id|espeak-ng|piper|edge-tts|say|omnivoice>
 *        [--voice <id/model>] [--voice-reference <wav>] [--sample-text <text>|--sample-file <txt>]
 *        [--synthesize-sample] [--out <dir>] [--require-gpu] [--device-probe-command <cmd>]
 *        [--timeout-ms <n>] [--retries <n>] [--json]
 *
 * Exit: 0 ready for batch, 1 not ready/unverified, 2 usage.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { probeCommand, runBounded } from './lib/bounded.mjs'

export const PROVIDER_DEFINITIONS = {
  'espeak-ng': {
    command: 'espeak-ng',
    versionArgs: ['--version'],
    device: 'cpu',
    outputExtension: '.wav',
    synthesize: ({ output, text }) => ({ args: ['-w', output, '--', text] }),
  },
  espeak: {
    command: 'espeak',
    versionArgs: ['--version'],
    device: 'cpu',
    outputExtension: '.wav',
    synthesize: ({ output, text }) => ({ args: ['-w', output, '--', text] }),
  },
  piper: {
    command: 'piper',
    versionArgs: ['--version'],
    device: 'unknown',
    outputExtension: '.wav',
    requiresVoice: true,
    synthesize: ({ output, text, voice }) => ({ args: ['--model', voice, '--output_file', output], input: text }),
  },
  'edge-tts': {
    command: 'edge-tts',
    versionArgs: ['--version'],
    device: 'network',
    outputExtension: '.mp3',
    network: true,
    synthesize: ({ output, text, voice }) => ({ args: ['--text', text, '--write-media', output, ...(voice ? ['--voice', voice] : [])] }),
  },
  say: {
    command: 'say',
    versionArgs: ['--version'],
    device: 'cpu',
    outputExtension: '.aiff',
    synthesize: ({ output, text, voice }) => ({ args: ['-o', output, ...(voice ? ['-v', voice] : []), '--', text] }),
  },
  omnivoice: {
    command: 'omnivoice',
    versionArgs: ['--version'],
    device: 'unknown',
    outputExtension: '.wav',
    synthesize: ({ output, text, voice }) => ({ args: ['--text', text, '--output', output, ...(voice ? ['--voice', voice] : [])] }),
  },
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function ffprobeAudio(file, deps) {
  if (deps.ffprobeJson !== undefined) return deps.ffprobeJson(file)
  const result = runBounded('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,codec_name,duration:format=duration',
    '-of', 'json', file,
  ], { timeoutMs: 30_000 })
  if (!result.ok) return { available: true, ok: false, error: result.stderr.trim() || result.errorCode || `exit-${result.status}` }
  try {
    const parsed = JSON.parse(result.stdout)
    const stream = parsed.streams?.[0]
    if (stream === undefined) return { available: true, ok: false, error: 'no audio stream' }
    const durationSec = safeNumber(stream.duration) ?? safeNumber(parsed.format?.duration)
    return {
      available: true,
      ok: true,
      codec: stream.codec_name,
      sampleRate: safeNumber(stream.sample_rate),
      channels: safeNumber(stream.channels),
      durationSec,
    }
  } catch (error) {
    return { available: true, ok: false, error: `ffprobe JSON: ${error.message}` }
  }
}

function measureLoudness(file, deps) {
  if (deps.measureAudio !== undefined) return deps.measureAudio(file)
  const result = runBounded('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'silencedetect=noise=-50dB:d=0.5,volumedetect',
    '-f', 'null', '-',
  ], { timeoutMs: 30_000 })
  const text = `${result.stderr}\n${result.stdout}`
  const maxVolume = safeNumber(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(text)?.[1])
  const meanVolume = safeNumber(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(text)?.[1])
  const silences = [...text.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]))
  if (deps.measureAudio === undefined && !result.ok) {
    return { available: false, ok: false, error: result.stderr.trim().slice(0, 400) || result.errorCode || `exit-${result.status}` }
  }
  return { available: true, ok: true, maxVolume, meanVolume, silences }
}

function analyzeAudioFile(file, deps) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { ok: false, error: 'file not found' }
  if (fs.statSync(file).size === 0) return { ok: false, error: 'file is empty' }
  const metadata = ffprobeAudio(file, deps)
  if (!metadata.ok) return { ok: false, ...metadata }
  const loudness = measureLoudness(file, deps)
  return { ok: true, metadata, loudness }
}

function resolveSampleText(options) {
  if (typeof options.sampleText === 'string' && options.sampleText.trim().length > 0) return options.sampleText.trim()
  if (typeof options.sampleFile === 'string' && options.sampleFile.length > 0) {
    if (!fs.existsSync(options.sampleFile)) throw new Error(`sample file not found: ${options.sampleFile}`)
    const text = fs.readFileSync(options.sampleFile, 'utf8').trim()
    if (text.length === 0) throw new Error('sample file is empty')
    return text
  }
  return 'Xin chào. Đây là một phép thử: mười sáu cộng năm bằng hai mươi mốt. Nếu bạn nghe rõ con số và phép tính này, giọng đọc đã sẵn sàng.'
}

/**
 * @param {object} options
 * @param {object} [deps]
 */
export function runAudioPreflight(options = {}, deps = {}) {
  const providerId = options.provider
  const errors = []
  const warnings = []
  const checks = []
  const limitations = [
    'Voice-reference suitability is measured (duration, silence, clipping, format); language, timbre and emotional fit cannot be verified without listening or a reference model.',
    'Provider and device readiness is verified only by the configured probe and sample; `nvidia-smi` alone is never accepted.',
  ]
  const providerDefinition = PROVIDER_DEFINITIONS[providerId]
  if (providerDefinition === undefined) {
    return {
      ok: false,
      status: 'FAIL',
      errors: [`unknown provider ${JSON.stringify(providerId)}; choose ${Object.keys(PROVIDER_DEFINITIONS).join(', ')}`],
      warnings,
      checks,
      limitations,
      readyForBatch: false,
    }
  }

  const probe = (deps.probeCommand ?? probeCommand)(providerDefinition.command, providerDefinition.versionArgs)
  checks.push({ id: 'provider.installed', status: probe.available ? 'PASS' : 'FAIL', detail: probe.available ? `${probe.resolved} — ${probe.summary}` : `command not found: ${providerDefinition.command}` })
  if (!probe.available) errors.push(`TTS provider "${providerId}" is not installed or not executable (${providerDefinition.command})`)

  const hardware = (deps.hardwareGpu ?? (() => {
    const result = runBounded('nvidia-smi', ['--query-gpu=name,memory.free', '--format=csv,noheader,nounits'], { timeoutMs: 6000 })
    return { present: result.ok && result.stdout.trim().length > 0, summary: result.stdout.split(/\r?\n/)[0] ?? '', error: result.ok ? null : result.errorCode ?? `exit-${result.status}` }
  }))()

  let device
  if (providerDefinition.device === 'cpu' || providerDefinition.device === 'network') {
    device = { kind: providerDefinition.device, verified: true, source: 'provider-definition', detail: `${providerId} runs on ${providerDefinition.device}` }
  } else if (typeof options.deviceProbeCommand === 'string' && options.deviceProbeCommand.length > 0) {
    const deviceProbe = (deps.probeCommand ?? probeCommand)(options.deviceProbeCommand, [], { timeoutMs: options.timeoutMs ?? 30_000 })
    const expected = typeof options.deviceProbeExpect === 'string' && options.deviceProbeExpect.length > 0 ? options.deviceProbeExpect : undefined
    const matched = deviceProbe.available && (expected === undefined || deviceProbe.summary.includes(expected))
    device = { kind: 'probe', verified: matched, source: options.deviceProbeCommand, detail: deviceProbe.summary || deviceProbe.error }
  } else {
    device = {
      kind: 'unknown',
      verified: false,
      source: 'none',
      detail: `${providerId} does not declare its compute device; configure --device-probe-command or accept CPU/unknown explicitly`,
    }
  }
  checks.push({ id: 'device.verified', status: device.verified ? 'PASS' : 'UNVERIFIED', detail: device.detail })
  if (device.kind === 'cpu' && options.requireGpu === true) {
    errors.push(`provider "${providerId}" is CPU-only and --require-gpu was set; refusing a silent CPU fallback`)
  } else if (!device.verified && options.requireGpu === true) {
    errors.push('--require-gpu was set but the provider device could not be verified; refusing to synthesize on an unknown backend')
  } else if (!device.verified) {
    warnings.push(`device verification is ${device.kind}; pass --require-gpu only when it can be verified`)
  }

  let voiceReference
  if (typeof options.voiceReference === 'string' && options.voiceReference.length > 0) {
    const analysis = analyzeAudioFile(options.voiceReference, deps)
    const loudnessVerified = analysis.loudness?.ok === true && Number.isFinite(analysis.loudness.maxVolume)
    const pass = analysis.ok
      && loudnessVerified
      && Number.isFinite(analysis.metadata.durationSec)
      && analysis.metadata.durationSec >= 1
      && analysis.metadata.durationSec <= 120
      && analysis.loudness.maxVolume <= -0.1
      && !(analysis.loudness.silences ?? []).some((duration) => duration >= Math.max(1, (analysis.metadata.durationSec ?? 0) * 0.5))
    voiceReference = {
      path: options.voiceReference,
      status: pass ? 'PASS' : 'FAIL',
      metadata: analysis.metadata,
      loudness: analysis.loudness,
      error: analysis.error,
    }
    checks.push({ id: 'voice-reference.suitability', status: pass ? 'PASS' : 'FAIL', detail: pass ? 'duration, format, silence and clipping are within bounds' : analysis.error ?? 'voice reference is too short/long, silent or clipped' })
    if (!pass) errors.push(`voice reference is not suitable: ${analysis.error ?? 'duration/silence/clipping check failed'}`)
  } else if (providerDefinition.requiresVoice) {
    errors.push(`provider "${providerId}" needs --voice <model/voice id>`)
  } else {
    warnings.push('no voice reference supplied; speaker similarity and timbre cannot be checked')
  }
  if (providerDefinition.requiresVoice && !(typeof options.voice === 'string' && options.voice.length > 0)) {
    errors.push(`provider "${providerId}" requires --voice`)
  }

  let sample
  if (options.synthesizeSample === true) {
    if (!probe.available) {
      sample = { status: 'FAIL', error: 'provider is not available' }
    } else if (options.requireGpu === true && !device.verified) {
      sample = { status: 'FAIL', error: 'GPU verification failed; sample not attempted to avoid a silent CPU run' }
    } else {
      const text = resolveSampleText(options)
      const outputDir = options.outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'audio-preflight-'))
      fs.mkdirSync(outputDir, { recursive: true })
      const output = path.join(outputDir, `sample${providerDefinition.outputExtension}`)
      const command = providerDefinition.synthesize({ output, text, voice: options.voice })
      const result = (deps.synthesize ?? ((spec) => ({
        provider: providerId,
        ...runBounded(spec.command, spec.args, {
          timeoutMs: options.timeoutMs ?? 120_000,
          retries: options.retries ?? 1,
          input: spec.input,
          retryOn: (attempt) => attempt.timedOut || attempt.errorCode !== undefined,
        }),
      })))({ command: providerDefinition.command, args: command.args, input: command.input, output, text, voice: options.voice })
      const analysis = analyzeAudioFile(output, deps)
      const loudnessVerified = analysis.loudness?.ok === true && Number.isFinite(analysis.loudness.maxVolume)
      const pass = result.ok !== false && analysis.ok && loudnessVerified
        && Number.isFinite(analysis.metadata.durationSec) && analysis.metadata.durationSec >= 0.5
        && analysis.loudness.maxVolume <= -0.1
        && !(analysis.loudness.silences ?? []).some((duration) => duration >= Math.max(0.5, (analysis.metadata.durationSec ?? 0) * 0.8))
      sample = {
        status: pass ? 'PASS' : 'FAIL',
        output,
        attempts: result.attempts,
        metadata: analysis.metadata,
        loudness: analysis.loudness,
        error: analysis.error ?? (result.ok === false ? `synthesis failed: ${result.errorCode ?? result.status}` : undefined),
      }
      checks.push({ id: 'sample.synthesis', status: pass ? 'PASS' : 'FAIL', detail: pass ? `sample ${analysis.metadata.durationSec.toFixed(2)}s produced and measured` : sample.error })
      if (!pass) errors.push(`synthesis sample failed: ${sample.error}`)
    }
  } else {
    sample = { status: 'UNVERIFIED', error: 'no sample was requested; batch production must not start' }
    checks.push({ id: 'sample.synthesis', status: 'UNVERIFIED', detail: 'run with --synthesize-sample before batch production' })
    warnings.push('no sample was synthesized; readyForBatch stays false')
  }

  const status = errors.length > 0 ? 'FAIL' : sample.status === 'PASS' ? 'PASS' : 'UNVERIFIED'
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    provider: { id: providerId, command: providerDefinition.command, probe },
    hardware: { gpu: hardware },
    device,
    voice: options.voice ?? null,
    voiceReference: voiceReference ?? null,
    sample,
    checks,
    status,
    readyForBatch: status === 'PASS',
    errors,
    warnings,
    limitations,
  }
}

function parseArgs(argv) {
  const args = { json: false, synthesizeSample: false, requireGpu: false }
  const take = () => {
    const value = argv[++args.index]
    if (value === undefined) throw new Error(`${argv[args.index - 1]} needs a value`)
    return value
  }
  args.index = 0
  for (; args.index < argv.length; args.index += 1) {
    const value = argv[args.index]
    if (value === '--json') args.json = true
    else if (value === '--synthesize-sample') args.synthesizeSample = true
    else if (value === '--require-gpu') args.requireGpu = true
    else if (value === '--provider') args.provider = take()
    else if (value === '--voice') args.voice = take()
    else if (value === '--voice-reference') args.voiceReference = take()
    else if (value === '--sample-text') args.sampleText = take()
    else if (value === '--sample-file') args.sampleFile = take()
    else if (value === '--out') args.outputDir = take()
    else if (value === '--device-probe-command') args.deviceProbeCommand = take()
    else if (value === '--device-probe-expect') args.deviceProbeExpect = take()
    else if (value === '--timeout-ms') args.timeoutMs = Number(take())
    else if (value === '--retries') args.retries = Number(take())
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else throw new Error(`unexpected argument: ${value}`)
  }
  delete args.index
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/audio-preflight.mjs --provider <id> [--voice <id>] [--voice-reference <wav>] [--synthesize-sample] [--require-gpu] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = runAudioPreflight(args)
  } catch (error) {
    console.error(`audio-preflight: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Audio preflight: ${result.provider?.id ?? args.provider}`)
    console.log(`  status: ${result.status}, readyForBatch: ${result.readyForBatch}`)
    for (const check of result.checks) console.log(`  [${check.status}] ${check.id}: ${check.detail}`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    for (const limitation of result.limitations) console.log(`LIMIT: ${limitation}`)
  }
  process.exitCode = result.readyForBatch ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
