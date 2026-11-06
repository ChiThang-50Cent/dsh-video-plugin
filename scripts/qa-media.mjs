#!/usr/bin/env node
/**
 * Media QA with a deliberate cost boundary.
 *
 * Default: FFprobe metadata only (streams, resolution, fps, duration, hashes).
 * `--quality`: targeted frozen-frame, silence/clipping and A/V-start checks.
 * `--subtitles <srt>`: deterministic subtitle structure/ordering checks.
 * `--duplicates`: an explicitly requested mpdecimate pass (expensive).
 *
 * Metadata QA is not proof of visual or editorial quality. Quality checks are
 * optional so editing code or narration does not trigger a full-media pass.
 *
 * Usage:
 *   node scripts/qa-media.mjs <video> [width] [height] [fps] [--allow-no-audio]
 *        [--quality] [--subtitles <srt>] [--duplicates] [--strict-audio] [--json]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256FileStream } from './lib/narration-model.mjs'

const TIMEOUT_MS = 120_000

function run(command, args, timeoutMs = TIMEOUT_MS) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 })
  return {
    ok: result.status === 0,
    status: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  }
}

function parseRate(value) {
  if (typeof value !== 'string') return undefined
  const [numerator, denominator] = value.split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined
  return numerator / denominator
}

function secondsToClock(seconds) {
  const whole = Math.floor(seconds)
  const ms = Math.round((seconds - whole) * 1000)
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor(whole % 3600 / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function parseTimestamp(value) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value.trim())
  if (match === null) return undefined
  const [, hours, minutes, seconds, millis] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0')) / 1000
}

/**
 * Parse and structurally validate SRT without rendering it.
 * @param {string} text
 * @param {number} [durationSec]
 */
export function parseSrt(text, durationSec) {
  const errors = []
  const warnings = []
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0) return { ok: false, errors: ['subtitle file is empty'], warnings, cues: [] }
  const blocks = normalized.split(/\n{2,}/)
  const cues = []
  let previousEnd = -1
  let expectedIndex = 1
  for (const [blockIndex, block] of blocks.entries()) {
    const lines = block.split('\n').map((line) => line.trim())
    if (lines.length === 0) continue
    const label = `subtitle block ${blockIndex + 1}`
    let cursor = 0
    if (/^\d+$/.test(lines[0])) {
      const index = Number(lines[0])
      if (index !== expectedIndex) errors.push(`${label} index is ${index}; expected ${expectedIndex}`)
      expectedIndex += 1
      cursor = 1
    } else {
      errors.push(`${label} has no numeric cue index`)
    }
    const timing = /^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/.exec(lines[cursor] ?? '')
    if (timing === null) {
      errors.push(`${label} has no "start --> end" timing line`)
      continue
    }
    const start = parseTimestamp(timing[1])
    const end = parseTimestamp(timing[2])
    if (start === undefined || end === undefined) {
      errors.push(`${label} has an invalid timestamp`)
      continue
    }
    if (end <= start) errors.push(`${label} ends before or at its start`)
    if (start < previousEnd) warnings.push(`${label} overlaps the previous cue`)
    if (Number.isFinite(durationSec) && end > durationSec + 0.5) errors.push(`${label} ends after the film (${secondsToClock(end)} > ${secondsToClock(durationSec)})`)
    const content = lines.slice(cursor + 1).join(' ').trim()
    if (content.length === 0) errors.push(`${label} has no subtitle text`)
    cues.push({ index: expectedIndex - 1, start, end, text: content })
    previousEnd = Math.max(previousEnd, end)
  }
  if (cues.length === 0) errors.push('no subtitle cues parsed')
  return { ok: errors.length === 0, errors, warnings, cues }
}

function probeMetadata(file, expected = {}) {
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,start_time,sample_rate,channels', '-of', 'json', file], 30_000)
  if (!probe.ok) return { ok: false, errors: [`ffprobe failed: ${probe.stderr || probe.error || probe.status}`] }
  let parsed
  try {
    parsed = JSON.parse(probe.stdout)
  } catch (error) {
    return { ok: false, errors: [`ffprobe JSON failed: ${error.message}`] }
  }
  const streams = parsed.streams ?? []
  const visual = streams.find((stream) => stream.codec_type === 'video')
  const sound = streams.find((stream) => stream.codec_type === 'audio')
  const fps = parseRate(visual?.r_frame_rate)
  const duration = Number(parsed.format?.duration)
  const errors = []
  if (visual === undefined) errors.push('Missing video stream')
  if (sound === undefined && expected.allowNoAudio !== true) errors.push('Missing audio stream')
  if (!Number.isFinite(duration) || duration <= 0) errors.push('Missing/nonpositive duration')
  if (visual !== undefined && expected.width !== undefined && (visual.width !== Number(expected.width) || visual.height !== Number(expected.height))) {
    errors.push(`Unexpected resolution ${visual.width}x${visual.height}; expected ${expected.width}x${expected.height}`)
  }
  if (visual !== undefined && expected.fps !== undefined && (!Number.isFinite(fps) || Math.abs(fps - Number(expected.fps)) > 0.1)) {
    errors.push(`Unexpected frame rate ${fps}; expected ${expected.fps}`)
  }
  const startTimes = streams.map((stream) => Number(stream.start_time)).filter(Number.isFinite)
  const avStartDelta = startTimes.length >= 2 ? Math.max(...startTimes) - Math.min(...startTimes) : undefined
  return {
    ok: errors.length === 0,
    errors,
    durationSec: duration,
    video: visual ?? null,
    audio: sound ?? null,
    fps,
    avStartDeltaSec: avStartDelta,
    sizeBytes: fs.statSync(file).size,
  }
}

function qualityChecks(file, metadata) {
  const checks = []
  const warnings = []
  const frozen = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'freezedetect=n=0.003:d=2', '-f', 'null', '-'], 90_000)
  const frozenText = `${frozen.stderr}\n${frozen.stdout}`
  const freezeDurations = [...frozenText.matchAll(/freeze_duration:\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]))
  const frozenLong = freezeDurations.filter((duration) => duration >= 2)
  checks.push({ id: 'video.frozen-frames', status: frozen.ok ? (frozenLong.length === 0 ? 'PASS' : 'WARN') : 'UNAVAILABLE', detail: frozen.ok ? `${frozenLong.length} freeze(s) >=2s` : frozen.error ?? `ffmpeg exit ${frozen.status}` })
  if (frozenLong.length > 0) warnings.push(`frozen picture for ${frozenLong.join(', ')}s; verify whether it is intentional`)

  const audio = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=noise=-50dB:d=2,volumedetect', '-f', 'null', '-'], 90_000)
  const audioText = `${audio.stderr}\n${audio.stdout}`
  const silences = [...audioText.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]))
  const maxVolume = Number(/max_volume:\s*(-?\d+(?:\.\d+)?)/i.exec(audioText)?.[1])
  const clipped = Number.isFinite(maxVolume) && maxVolume > -0.1
  checks.push({ id: 'audio.gaps', status: audio.ok ? (silences.length === 0 ? 'PASS' : 'WARN') : 'UNAVAILABLE', detail: audio.ok ? `${silences.length} silence(s) >=2s${silences.length > 0 ? ` (${silences.join(', ')}s)` : ''}` : audio.error ?? `ffmpeg exit ${audio.status}` })
  checks.push({ id: 'audio.clipping', status: audio.ok ? (clipped ? 'FAIL' : 'PASS') : 'UNAVAILABLE', detail: audio.ok ? `max volume ${Number.isFinite(maxVolume) ? `${maxVolume} dB` : 'unknown'}` : audio.error ?? 'ffmpeg unavailable' })
  if (silences.length > 0) warnings.push(`long silence detected: ${silences.join(', ')}s; confirm it is intentional`)
  if (clipped) warnings.push(`audio peak ${maxVolume} dB indicates clipping`)

  if (Number.isFinite(metadata.avStartDeltaSec) && metadata.avStartDeltaSec > 0.1) {
    checks.push({ id: 'audio.sync', status: 'WARN', detail: `stream start-time delta ${metadata.avStartDeltaSec.toFixed(3)}s (metadata-level approximation)` })
    warnings.push('audio/video stream start times differ by more than 100ms; verify sync by listening')
  } else if (metadata.avStartDeltaSec !== undefined) {
    checks.push({ id: 'audio.sync', status: 'PASS', detail: `stream start-time delta ${metadata.avStartDeltaSec.toFixed(3)}s` })
  } else {
    checks.push({ id: 'audio.sync', status: 'UNAVAILABLE', detail: 'start_time not reported by ffprobe' })
  }
  return { ok: !checks.some((check) => check.status === 'FAIL'), checks, warnings }
}

function duplicateCheck(file) {
  const plain = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-f', 'null', '-'], 120_000)
  const decimated = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'mpdecimate', '-vsync', '0', '-f', 'null', '-'], 180_000)
  const parseFrames = (text) => {
    const matches = [...text.matchAll(/frame=\s*(\d+)/g)]
    return Number(matches.at(-1)?.[1])
  }
  const plainFrames = parseFrames(plain.stderr)
  const keptFrames = parseFrames(decimated.stderr)
  if (!plain.ok && !decimated.ok) return { status: 'UNAVAILABLE', detail: 'ffmpeg duplicate scan unavailable' }
  return {
    status: keptFrames !== undefined && plainFrames !== undefined && keptFrames < plainFrames ? 'WARN' : 'PASS',
    detail: `decoded frames ${plainFrames ?? 'unknown'}, kept after mpdecimate ${keptFrames ?? 'unknown'}`,
    droppedEstimate: Number.isFinite(plainFrames) && Number.isFinite(keptFrames) ? plainFrames - keptFrames : null,
    limitation: 'mpdecimate heuristic; cinematic holds and static graphics legitimately drop frames',
  }
}

function loudnessCheck(file, audio, options) {
  const target = { integratedLufs: -16, truePeakDbtp: -1.5, toleranceLu: 2, ...options.loudness }
  if (Object.values(target).some((value) => !Number.isFinite(value)) || target.toleranceLu < 0) {
    return { status: 'FAIL', target, detail: 'invalid loudness target' }
  }
  if (audio === null) return { status: 'NOT_APPLICABLE', target, detail: 'no audio stream' }
  const result = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], 300_000)
  const summary = result.stderr.split('Summary:').at(-1)
  const integrated = Number(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i.exec(summary)?.[1])
  const lra = Number(/LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/i.exec(summary)?.[1])
  const peak = Number(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i.exec(summary)?.[1])
  if (!result.ok || ![integrated, lra, peak].every(Number.isFinite)) {
    return { status: 'UNAVAILABLE', target, detail: result.error ?? 'ffmpeg loudness measurement failed or was incomplete' }
  }
  const pass = Math.abs(integrated - target.integratedLufs) <= target.toleranceLu + 1e-9 && peak <= target.truePeakDbtp + 0.5 + 1e-9
  return { status: pass ? 'PASS' : 'FAIL', target, measuredIntegratedLufs: integrated, measuredTruePeakDbtp: peak, measuredLra: lra }
}

function projectLoudness(video) {
  let dir = path.dirname(path.resolve(video))
  while (true) {
    const project = path.join(dir, 'project.json')
    if (fs.existsSync(project)) return JSON.parse(fs.readFileSync(project, 'utf8')).audio?.loudness
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * @param {string} video
 * @param {{width?: number, height?: number, fps?: number, allowNoAudio?: boolean, quality?: boolean,
 *   subtitles?: string, duplicates?: boolean, strictAudio?: boolean}} [options]
 */
export function qaMedia(video, options = {}) {
  if (!fs.existsSync(video) || !fs.statSync(video).isFile()) throw new Error(`video not found: ${video}`)
  const metadata = probeMetadata(video, options)
  const errors = [...metadata.errors]
  const warnings = []
  const loudness = loudnessCheck(video, metadata.audio, { loudness: options.loudness ?? projectLoudness(video) })
  if (!['PASS', 'NOT_APPLICABLE'].includes(loudness.status)) errors.push(`audio loudness ${loudness.status.toLowerCase()}`)
  const quality = { checked: options.quality === true || options.strictAudio === true || options.duplicates === true || options.subtitles !== undefined, checks: [], warnings: [] }
  if (options.quality === true || options.strictAudio === true || options.duplicates === true) {
    const result = qualityChecks(video, metadata)
    quality.checks.push(...result.checks)
    quality.warnings.push(...result.warnings)
    if (!result.ok) errors.push('audio clipping detected')
    if (options.strictAudio === true && result.checks.some((check) => /^audio\./.test(check.id) && ['WARN', 'UNAVAILABLE'].includes(check.status))) {
      errors.push('strict audio QA: a targeted audio check warned or was unavailable')
    }
  }
  if (options.duplicates === true) quality.checks.push({ id: 'video.duplicate-frames', ...duplicateCheck(video) })
  if (options.subtitles !== undefined) {
    if (!fs.existsSync(options.subtitles)) errors.push(`subtitle file not found: ${options.subtitles}`)
    else {
      const parsed = parseSrt(fs.readFileSync(options.subtitles, 'utf8'), metadata.durationSec)
      quality.checks.push({ id: 'subtitles.structure', status: parsed.ok ? (parsed.warnings.length > 0 ? 'WARN' : 'PASS') : 'FAIL' })
      quality.subtitles = { ...parsed, cues: parsed.cues.length }
      errors.push(...parsed.errors)
      quality.warnings.push(...parsed.warnings)
    }
  }
  return {
    ok: errors.length === 0,
    mode: quality.checked ? 'metadata+quality' : 'metadata',
    durationSec: metadata.durationSec,
    sizeBytes: metadata.sizeBytes,
    sha256: sha256FileStream(video),
    video: metadata.video,
    audio: metadata.audio,
    fps: metadata.fps,
    avStartDeltaSec: metadata.avStartDeltaSec,
    quality,
    checks: {
      metadata: { status: metadata.ok ? 'PASS' : 'FAIL', errors: metadata.errors },
      loudness,
      quality: quality.checked
        ? { status: quality.checks.some((check) => check.status === 'FAIL') ? 'FAIL' : quality.checks.length === 0 || quality.checks.every((check) => check.status === 'UNAVAILABLE') ? 'UNAVAILABLE' : quality.checks.some((check) => check.status === 'UNAVAILABLE') ? 'INCOMPLETE' : quality.checks.some((check) => check.status === 'WARN') ? 'WARN' : 'PASS', checks: quality.checks, warnings: quality.warnings }
        : { status: 'NOT_RUN', note: 'metadata only; pass --quality/--subtitles for targeted media checks' },
    },
    errors,
    warnings: [...warnings, ...quality.warnings, ...metadata.errors],
    caveat: 'FFprobe/FFmpeg metadata and signal checks do not prove editorial quality. A full-media quality pass is optional and must not be triggered by narration edits.',
  }
}

function parseArgs(argv) {
  const args = { json: false }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const need = () => {
      index += 1
      if (argv[index] === undefined) throw new Error(`${value} needs a value`)
      return argv[index]
    }
    if (value === '--allow-no-audio') args.allowNoAudio = true
    else if (value === '--quality') args.quality = true
    else if (value === '--duplicates') args.duplicates = true
    else if (value === '--strict-audio') args.strictAudio = true
    else if (value === '--subtitles') args.subtitles = need()
    else if (value === '--json') args.json = true
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else positional.push(value)
  }
  ;[args.video, args.width, args.height, args.fps] = positional
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/qa-media.mjs <video> [width] [height] [fps] [--allow-no-audio] [--quality] [--subtitles <srt>] [--duplicates] [--strict-audio] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  if (!args.video) {
    console.error('Usage: node scripts/qa-media.mjs <video> [width] [height] [fps] [options]')
    process.exitCode = 2
    return
  }
  let report
  try {
    report = qaMedia(args.video, {
      width: args.width,
      height: args.height,
      fps: args.fps,
      allowNoAudio: args.allowNoAudio,
      quality: args.quality,
      subtitles: args.subtitles,
      duplicates: args.duplicates,
      strictAudio: args.strictAudio,
    })
  } catch (error) {
    console.error(`qa-media: ${error.message}`)
    process.exitCode = 2
    return
  }
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
