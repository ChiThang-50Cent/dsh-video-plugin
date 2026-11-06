#!/usr/bin/env node
/**
 * Targeted audio QA for numbers, operators and omissions.
 *
 * Phase 1 is deterministic and runs before synthesis: every number/operator in
 * the canonical segment text must still be present in the spoken form. A
 * pronunciation override may say "16" as "mười sáu", but it may not drop the
 * quantity or turn subtraction into addition.
 *
 * Phase 2 (optional --audio) measures the produced files: readable audio,
 * duration, silence and clipping. Phase 3 (optional --asr-command) compares an
 * ASR transcript with the spoken form; ASR evidence is advisory, never proof.
 *
 * Usage:
 *   node scripts/qa-audio.mjs <episode-dir> [--segments audio/segments.json] [--audio]
 *        [--asr-command <exe>] [--asr-arg <arg>]... [--timeout-ms <n>] [--retries <n>] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { semanticFingerprint, compareSemantics } from './lib/pronunciation.mjs'
import { runBounded } from './lib/bounded.mjs'

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function probeAudio(file, deps) {
  if (deps.probeAudio !== undefined) return deps.probeAudio(file)
  const result = runBounded('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels,duration:format=duration', '-of', 'json', file,
  ], { timeoutMs: 20_000 })
  if (!result.ok) return { ok: false, error: result.stderr.trim() || result.errorCode || `exit-${result.status}` }
  try {
    const parsed = JSON.parse(result.stdout)
    const stream = parsed.streams?.[0]
    if (stream === undefined) return { ok: false, error: 'no audio stream' }
    return {
      ok: true,
      sampleRate: Number(stream.sample_rate),
      channels: Number(stream.channels),
      durationSec: Number(stream.duration ?? parsed.format?.duration),
    }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

function measureAudio(file, deps) {
  if (deps.measureAudio !== undefined) return deps.measureAudio(file)
  const result = runBounded('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-50dB:d=0.5,volumedetect', '-f', 'null', '-'], { timeoutMs: 30_000 })
  if (!result.ok) return { ok: false, error: result.stderr.trim().slice(0, 300) || result.errorCode || `exit-${result.status}` }
  const text = `${result.stderr}\n${result.stdout}`
  return {
    ok: true,
    maxVolume: Number(/max_volume:\s*(-?\d+(?:\.\d+)?)/i.exec(text)?.[1]),
    meanVolume: Number(/mean_volume:\s*(-?\d+(?:\.\d+)?)/i.exec(text)?.[1]),
    silences: [...text.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1])),
  }
}

/**
 * @param {object} manifest
 * @param {{aplay?: boolean}} [options]
 */
export function auditSegmentText(manifest) {
  const errors = []
  const warnings = []
  const rows = []
  for (const [index, segment] of (manifest.segments ?? []).entries()) {
    const label = `segment ${segment?.id ?? `#${index + 1}`}`
    const text = String(segment?.text ?? '')
    const spoken = String(segment?.spokenText ?? text)
    const source = semanticFingerprint(text)
    const target = semanticFingerprint(spoken)
    const compare = compareSemantics(text, spoken)
    if (!compare.ok) {
      errors.push(`${label} spoken form changes protected numbers/operators (missing ${compare.missing.join(', ') || 'none'}; added ${compare.added.join(', ') || 'none'})`)
    }
    const numbers = source.numbers.map((token) => ({
      token,
      preserved: target.numbers.includes(token),
    }))
    const operators = source.operators.map((token) => ({ token, preserved: target.operators.includes(token) }))
    if (numbers.some((number) => !number.preserved)) errors.push(`${label} drops a numeric quantity from speech`)
    if (operators.some((operator) => !operator.preserved)) errors.push(`${label} drops a mathematical operator/sign from speech`)
    const digits = /\d+(?:[.,]\d+)?/u.test(text)
    if (digits && segment?.spokenText === undefined) {
      warnings.push(`${label} passes digits directly to the engine; verify on the synthesis sample that it reads them correctly`)
    }
    if (/[+\-*/=<>^%∞√±]/u.test(text) && segment?.spokenText === undefined) {
      warnings.push(`${label} passes mathematical symbols directly to the engine; verify pronunciation on a sample`)
    }
    rows.push({
      id: segment?.id ?? `#${index + 1}`,
      numbers: numbers.map((number) => number.token),
      operators: operators.map((operator) => operator.token),
      spoken: spoken !== text,
      preserved: compare.ok,
    })
  }
  return { errors, warnings, rows }
}

function asrArgs(templateArgs, audioPath) {
  return templateArgs.map((arg) => arg.replaceAll('{audio}', audioPath))
}

/**
 * @param {string} episodeDir
 * @param {{
 *   segments?: string, audio?: boolean, asrCommand?: string, asrArgs?: string[],
 *   timeoutMs?: number, retries?: number
 * }} [options]
 */
export function qaAudioEpisode(episodeDir, options = {}, deps = {}) {
  const root = path.resolve(episodeDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`episode directory not found: ${root}`)
  const segmentsPath = path.resolve(root, options.segments ?? path.join('audio', 'segments.json'))
  if (!existsSync(segmentsPath)) throw new Error(`segment manifest not found: ${segmentsPath}`)
  const manifest = readJson(segmentsPath)
  if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) throw new Error('segment manifest has no segments')
  const guard = auditSegmentText(manifest)
  const errors = [...guard.errors]
  const warnings = [...guard.warnings]
  const audio = []
  const asr = { status: 'not-run', available: false, rows: [] }

  if (options.audio === true) {
    for (const [index, segment] of manifest.segments.entries()) {
      const label = `segment ${segment?.id ?? `#${index + 1}`}`
      const relative = segment?.audio
      if (typeof relative !== 'string' || relative.length === 0) {
        errors.push(`${label} has no audio path; Phase 2 cannot verify it`)
        continue
      }
      const file = path.resolve(root, relative)
      if (!file.startsWith(`${root}${path.sep}`)) {
        errors.push(`${label} audio path escapes the episode`)
        continue
      }
      if (!fs.existsSync(file)) {
        errors.push(`${label} audio file is missing: ${relative}`)
        continue
      }
      const metadata = probeAudio(file, deps)
      if (!metadata.ok) {
        errors.push(`${label} audio is not readable: ${metadata.error}`)
        continue
      }
      const loudness = measureAudio(file, deps)
      if (!loudness.ok) warnings.push(`${label} loudness/silence could not be measured: ${loudness.error ?? 'ffmpeg unavailable'}`)
      const silent = loudness.ok && loudness.silences.some((duration) => duration >= Math.max(0.5, metadata.durationSec * 0.8))
      const clipped = loudness.ok && Number.isFinite(loudness.maxVolume) && loudness.maxVolume > -0.1
      if (!Number.isFinite(metadata.durationSec) || metadata.durationSec <= 0) errors.push(`${label} has no positive duration`)
      if (silent) errors.push(`${label} is mostly silence`)
      if (clipped) errors.push(`${label} is clipped (max volume ${loudness.maxVolume} dB)`)
      if (!Number.isFinite(metadata.sampleRate) || metadata.sampleRate < 16000) warnings.push(`${label} sample rate is low for speech (${metadata.sampleRate} Hz)`)
      audio.push({ id: label, durationSec: metadata.durationSec, sampleRate: metadata.sampleRate, channels: metadata.channels, silent, clipped })
    }
  }

  if (options.asrCommand !== undefined) {
    const args = Array.isArray(options.asrArgs) ? options.asrArgs : []
    const rows = []
    for (const [index, segment] of manifest.segments.entries()) {
      if (typeof segment?.audio !== 'string' || !fs.existsSync(path.resolve(root, segment.audio))) continue
      const result = runBounded(options.asrCommand, asrArgs(args, path.resolve(root, segment.audio)), {
        timeoutMs: options.timeoutMs ?? 120_000,
        retries: options.retries ?? 1,
      })
      if (!result.ok) {
        warnings.push(`ASR failed for ${segment.id}: ${result.errorCode ?? result.status}`)
        continue
      }
      const transcript = result.stdout.trim()
      const expected = semanticFingerprint(segment.spokenText ?? segment.text)
      const actual = semanticFingerprint(transcript)
      rows.push({
        id: segment.id,
        transcript,
        missing: expected.tokens.filter((token) => !actual.tokens.includes(token)),
        added: actual.tokens.filter((token) => !expected.tokens.includes(token)),
      })
      if (expected.tokens.some((token) => !actual.tokens.includes(token))) {
        warnings.push(`ASR did not hear every number/operator in ${segment.id}; verify manually (ASR is not truth)`)
      }
    }
    asr.status = rows.length > 0 ? 'measured' : 'unavailable'
    asr.available = rows.length > 0
    asr.rows = rows
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      episodeDir: root,
      segments: options.segments ?? 'audio/segments.json',
      count: manifest.segments.length,
      rows: guard.rows,
      audio,
      asr,
      caveat: 'Number/operator preservation is deterministic. Audibility, pronunciation quality and ASR accuracy still require the synthesis sample and targeted listening.',
    },
  }
}

function existsSync(file) {
  return fs.existsSync(file)
}

function parseArgs(argv) {
  const args = { json: false, audio: false, asrArgs: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const need = () => {
      index += 1
      if (argv[index] === undefined) throw new Error(`${value} needs a value`)
      return argv[index]
    }
    if (value === '--json') args.json = true
    else if (value === '--audio') args.audio = true
    else if (value === '--segments') args.segments = need()
    else if (value === '--asr-command') args.asrCommand = need()
    else if (value === '--asr-arg') args.asrArgs.push(need())
    else if (value === '--timeout-ms') args.timeoutMs = Number(need())
    else if (value === '--retries') args.retries = Number(need())
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/qa-audio.mjs <episode-dir> [--segments <file>] [--audio] [--asr-command <exe>] [--asr-arg <arg>]... [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = qaAudioEpisode(args.episode, args)
  } catch (error) {
    console.error(`qa-audio: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Audio QA: ${result.data.episodeDir} (${result.data.count} segments)`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    console.log(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`)
    if (result.data.caveat !== undefined) console.log(`NOTE: ${result.data.caveat}`)
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
