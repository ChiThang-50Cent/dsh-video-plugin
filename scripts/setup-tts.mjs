#!/usr/bin/env node
/**
 * Verify this machine's speech engine once and save it for every later audio command.
 *
 * Usage:
 *   node scripts/setup-tts.mjs --python <venv>/bin/python --model <checkpoint-dir|repo>
 *        (--voice-package <id> | --voice-reference <wav> --ref-text <exact words>)
 *        [--provider omnivoice] [--provider-command <path>] [--env NAME=value]...
 *        [--require-gpu] [--data-root <dir>] [--json]
 *   node scripts/setup-tts.mjs --show [--data-root <dir>] [--json]
 *
 * Runs audio-preflight with a real sample synthesis using exactly the given
 * runtime (the saved config is ignored during the test). Only when it passes is
 * `<dataRoot>/tts.config.json` written, recording the runtime and what was
 * verified. A failing run leaves any existing config untouched.
 * `--provider-command` defaults to `omnivoice-infer` beside `--python`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDataRoot } from './studio-paths.mjs'
import { runAudioPreflight } from './audio-preflight.mjs'
import { readTtsConfig, ttsConfigErrors, ttsConfigPath } from './lib/tts-config.mjs'

const USAGE = 'Usage: node scripts/setup-tts.mjs --python <path> --model <checkpoint> (--voice-package <id> | --voice-reference <wav> --ref-text <text>) [--provider omnivoice] [--provider-command <path>] [--env NAME=value]... [--require-gpu] [--data-root <dir>] [--json]\n       node scripts/setup-tts.mjs --show [--data-root <dir>] [--json]'

export function setupTts(options, deps = {}) {
  const dataRoot = path.resolve(options.dataRoot ?? resolveDataRoot().dataRoot)
  const provider = options.provider ?? 'omnivoice'
  if (provider === 'omnivoice' && !options.python) throw new Error('--python (the interpreter of the OmniVoice environment) is required')
  if (options.voicePackage === undefined && options.voiceReference === undefined) throw new Error('a sample needs a voice: --voice-package <id> or --voice-reference <wav> --ref-text <text>')
  const python = options.python && (options.python.includes(path.sep) ? path.resolve(options.python) : options.python)
  let providerCommand = options.providerCommand && path.resolve(options.providerCommand)
  if (providerCommand === undefined && provider === 'omnivoice' && python?.includes(path.sep)) {
    const sibling = path.join(path.dirname(python), 'omnivoice-infer')
    if (fs.existsSync(sibling)) providerCommand = sibling
  }
  const env = { ...options.env }
  const candidate = {
    schemaVersion: 1,
    provider,
    ...(python ? { python } : {}),
    ...(options.model ? { model: options.model.includes(path.sep) ? path.resolve(options.model) : options.model } : {}),
    ...(providerCommand ? { providerCommand } : {}),
    ...(options.requireGpu ? { requireGpu: true, device: 'cuda' } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  }
  const errors = ttsConfigErrors(candidate)
  if (errors.length) throw new Error(errors.join('; '))

  const saved = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]))
  Object.assign(process.env, env)
  let report
  try {
    report = (deps.preflight ?? runAudioPreflight)({
      provider,
      providerCommand,
      model: candidate.model,
      voicePackage: options.voicePackage,
      voiceReference: options.voiceReference,
      refText: options.refText,
      requireGpu: options.requireGpu === true,
      synthesizeSample: true,
      dataRoot,
      outputDir: fs.mkdtempSync(path.join(os.tmpdir(), 'setup-tts-')),
      ttsConfig: false,
      timeoutMs: options.timeoutMs,
    }, deps.preflightDeps)
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
  const file = ttsConfigPath(dataRoot)
  if (!report.readyForBatch) return { ok: false, file, written: false, status: report.status, errors: report.errors, sample: report.sample?.output ?? null }
  const config = {
    ...candidate,
    verified: {
      at: report.checkedAt,
      device: report.device?.verified ? report.device.detail : report.device?.kind ?? null,
      voice: report.voicePackage?.id ?? report.voiceReference?.path ?? null,
      sample: report.sample.output,
      sampleDurationSec: report.sample.metadata?.durationSec ?? null,
    },
  }
  const temp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`)
  fs.renameSync(temp, file)
  return { ok: true, file, written: true, status: report.status, config, sample: report.sample.output }
}

function parseArgs(argv) {
  const options = { env: {} }
  const names = { '--provider': 'provider', '--python': 'python', '--model': 'model', '--provider-command': 'providerCommand', '--voice-package': 'voicePackage', '--voice-reference': 'voiceReference', '--ref-text': 'refText', '--data-root': 'dataRoot', '--timeout-ms': 'timeoutMs' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--require-gpu') options.requireGpu = true
    else if (arg === '--show') options.show = true
    else if (arg === '--json') options.json = true
    else if (arg === '--env') {
      const pair = argv[++i]
      const index = pair?.indexOf('=') ?? -1
      if (index <= 0) throw new Error('--env needs NAME=value')
      options.env[pair.slice(0, index)] = pair.slice(index + 1)
    } else if (names[arg]) {
      if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`)
      options[names[arg]] = argv[++i]
    } else throw new Error(`unexpected argument: ${arg}`)
  }
  if (options.timeoutMs !== undefined) options.timeoutMs = Number(options.timeoutMs)
  return options
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${USAGE}\n${error.message}`)
    process.exitCode = 2
    return
  }
  try {
    if (options.show) {
      const dataRoot = path.resolve(options.dataRoot ?? resolveDataRoot().dataRoot)
      const config = readTtsConfig(dataRoot)
      if (options.json) console.log(JSON.stringify({ file: ttsConfigPath(dataRoot), config }, null, 2))
      else console.log(config ? JSON.stringify(config, null, 2) : `No TTS runtime saved at ${ttsConfigPath(dataRoot)}; run setup-tts.mjs`)
      return
    }
    const result = setupTts(options)
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else if (result.ok) console.log(`Saved TTS runtime: ${result.file}\nListen to the sample before batch use: ${result.sample}`)
    else console.log(`Not saved (${result.status}):\n${result.errors.map((error) => `  - ${error}`).join('\n')}`)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(`setup-tts: ${error.message}\n${USAGE}`)
    process.exitCode = 2
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
