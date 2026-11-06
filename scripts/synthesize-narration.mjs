#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findCommand, runBounded } from './lib/bounded.mjs'
import { applyVoicePackage, resolveVoicePackage } from './lib/voice.mjs'
import { applyTtsConfig, readTtsConfig } from './lib/tts-config.mjs'
import { episodeDataRoot } from './lib/episode-artifacts.mjs'

const DEFAULTS = { provider: 'omnivoice', python: 'python', model: 'k2-fsa/OmniVoice', device: 'cuda' }

const helper = fileURLToPath(new URL('./lib/tts/omnivoice_batch.py', import.meta.url))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

function parseArgs(argv) {
  const options = { timeoutMs: 120000, overallTimeoutMs: 3600000, retries: 1, segments: 'audio/segments.json' }
  const names = { '--python': 'python', '--helper': 'helper', '--model': 'model', '--device': 'device', '--voice-package': 'voicePackage', '--data-root': 'dataRoot', '--voice-reference': 'voiceReference', '--ref-text': 'refText', '--language': 'language', '--timeout-ms': 'timeoutMs', '--overall-timeout-ms': 'overallTimeoutMs', '--retries': 'retries', '--segments': 'segments' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--require-gpu') options.requireGpu = true
    else if (arg === '--json') options.json = true
    else if (names[arg]) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${arg} needs a value`)
      options[names[arg]] = argv[++i]
    } else if (!arg.startsWith('-') && !options.episode) options.episode = arg
    else throw new Error(`unexpected argument ${arg}`)
  }
  for (const name of ['timeoutMs', 'overallTimeoutMs', 'retries']) {
    options[name] = Number(options[name])
    if (!Number.isSafeInteger(options[name]) || options[name] < (name === 'retries' ? 0 : 1)) throw new Error(`invalid ${name}`)
  }
  if (!options.episode) throw new Error('episode is required')
  if ((options.voiceReference === undefined) !== (options.refText === undefined)) throw new Error('--voice-reference and --ref-text go together')
  return options
}

class Worker {
  constructor(options, deadline) {
    this.options = options
    this.deadline = deadline
    this.lines = []
    this.waiter = null
    this.stderr = ''
    this.child = spawn(options.python, [options.helper ?? helper, '--model', options.model, '--device', options.device, '--voice-reference', options.voiceReference, '--ref-text', options.refText], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stderr.on('data', (data) => { this.stderr = (this.stderr + data).slice(-8000) })
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      try { this.deliver(null, JSON.parse(line)) } catch { this.deliver(new Error(`invalid helper response: ${line}`)) }
    })
    this.child.on('error', (error) => this.deliver(error))
    this.child.on('exit', (code, signal) => this.deliver(new Error(`helper exited (${code ?? signal}): ${this.stderr}`)))
    this.child.stdin.on('error', (error) => this.deliver(error))
  }
  deliver(error, value) {
    if (this.waiter) { const fn = this.waiter; this.waiter = null; fn(error, value) }
    else this.lines.push([error, value])
  }
  next() {
    return new Promise((resolve, reject) => {
      const duration = Math.min(this.options.timeoutMs, this.deadline - Date.now())
      if (duration <= 0) return reject(new Error('overall timeout exceeded'))
      const timer = setTimeout(() => { this.waiter = null; reject(new Error('helper timeout')) }, duration)
      const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value) }
      if (this.lines.length) finish(...this.lines.shift())
      else this.waiter = finish
    })
  }
  stop() {
    this.child.stdin.destroy()
    if (this.child.pid) {
      try { process.kill(-this.child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
}

/**
 * Speaker selection: --voice-package <id>, else the explicit --voice-reference/--ref-text
 * pair (one-off), else the package selected by production.json/project.json.
 */
function selectVoice(episode, options) {
  const pkg = options.voicePackage !== undefined || options.voiceReference === undefined
    ? resolveVoicePackage({ episodeRoot: episode, id: options.voicePackage, dataRoot: options.dataRoot && path.resolve(options.dataRoot) })
    : null
  if (pkg === null && options.voiceReference === undefined) throw new Error('no voice selected: set voicePackage in production.json/project.json, or pass --voice-package <id> or --voice-reference/--ref-text')
  if (pkg === null) return { options, voicePackage: null }
  if (pkg.voice.provider !== 'omnivoice' || pkg.reference === null) throw new Error(`voice package "${pkg.id}" needs provider omnivoice and a reference recording`)
  const { provider: _provider, voice: _voice, ...merged } = applyVoicePackage(options, pkg)
  return { options: merged, voicePackage: { id: pkg.id, sha256: pkg.sha256, source: pkg.source } }
}

/**
 * Engine paths: explicit options > `<dataRoot>/tts.config.json` (setup-tts) > defaults.
 * Exported for tests and for callers that need the effective runtime without synthesizing.
 */
export function resolveRuntime(input) {
  const dataRoot = input.dataRoot ? path.resolve(input.dataRoot) : episodeDataRoot(path.resolve(input.episode))
  const options = applyTtsConfig({ ...input, provider: input.provider ?? 'omnivoice' }, readTtsConfig(dataRoot), DEFAULTS)
  if (options.provider !== 'omnivoice') throw new Error(`synthesize-narration drives OmniVoice; provider ${options.provider} is not supported`)
  if (options.requireGpu && !/^cuda(?::\d+)?$/.test(options.device)) throw new Error('--require-gpu requires a CUDA device; refusing CPU fallback')
  return options
}

export async function synthesize(input) {
  const runtime = resolveRuntime(input)
  const episode = fs.realpathSync(path.resolve(input.episode))
  const { options, voicePackage } = selectVoice(episode, runtime)
  const segments = readJson(path.resolve(episode, options.segments))
  const narrationSha256 = hash(fs.readFileSync(path.join(episode, 'narration.md')))
  if (segments.narrationSha256 !== narrationSha256) throw new Error('segments are stale relative to narration.md')
  if (!Array.isArray(segments.segments) || !segments.segments.length) throw new Error('segments are empty')
  const manifestPath = path.join(episode, 'audio/manifest.json')
  const prior = fs.existsSync(manifestPath) ? readJson(manifestPath) : {}
  const previous = new Map((prior.chunks ?? []).map((chunk) => [chunk.segmentId ?? chunk.id, chunk]))
  const refHash = hash(fs.readFileSync(options.voiceReference))
  const deadline = Date.now() + options.overallTimeoutMs
  const helperSha256 = hash(fs.readFileSync(options.helper ?? helper))
  const pythonPath = options.python.includes(path.sep) ? path.resolve(options.python) : findCommand(options.python) ?? options.python
  const outputs = segments.segments.map((segment) => {
    if (!segment.id || typeof segment.text !== 'string' || typeof segment.audio !== 'string') throw new Error('invalid segment')
    const output = path.resolve(episode, segment.audio)
    if (!output.startsWith(`${episode}${path.sep}`)) throw new Error(`segment path escapes episode: ${segment.audio}`)
    let realParent = episode
    for (const component of path.relative(episode, path.dirname(output)).split(path.sep).filter(Boolean)) {
      const directory = path.join(realParent, component)
      if (!fs.existsSync(directory)) fs.mkdirSync(directory)
      realParent = fs.realpathSync(directory)
      if (realParent !== episode && !realParent.startsWith(`${episode}${path.sep}`)) throw new Error(`segment path escapes episode: ${segment.audio}`)
    }
    try {
      if (fs.lstatSync(output).isSymbolicLink()) throw new Error(`segment path is a symlink: ${segment.audio}`)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    return output
  })
  const chunks = []
  let worker, ready, probedVersion, synthesized = 0, reused = 0
  const startWorker = async () => {
    worker = new Worker(options, deadline)
    const response = await worker.next()
    if (response.type !== 'ready' || (options.device.startsWith('cuda') && !String(response.device).startsWith('cuda'))) throw new Error('helper did not confirm CUDA; refusing CPU fallback')
    if (response.version !== probedVersion) throw new Error('helper version differs from probed version')
    ready = response
  }
  const save = (complete = false) => {
    const { stale: _stale, staleReason: _staleReason, generatedAt: _generatedAt, ...rest } = prior
    const processed = new Map(chunks.map((chunk) => [chunk.segmentId ?? chunk.id, chunk]))
    const savedChunks = complete ? chunks : segments.segments.map((segment) => processed.get(segment.id) ?? previous.get(segment.id)).filter(Boolean)
    const record = { ...rest, schemaVersion: 1, narrationSha256, ...(complete ? { generatedAt: new Date().toISOString() } : { stale: true, staleReason: 'synthesis in progress' }), engine: { ...prior.engine, provider: 'omnivoice', version: probedVersion ?? prior.engine?.version ?? 'unknown', command: options.python, model: options.model, device: ready?.device ?? prior.engine?.device ?? options.device, voicePackage, voiceReference: options.voiceReference, voiceReferenceSha256: refHash, referenceText: options.refText, settings: { language: options.language ?? null, device: options.device } }, chunks: savedChunks }
    const temp = `${manifestPath}.tmp-${process.pid}`
    fs.writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`)
    fs.renameSync(temp, manifestPath)
  }
  try {
    save()
    // Probe package metadata without loading the model, allowing cached runs to avoid GPU initialization.
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('overall timeout exceeded')
    const probe = runBounded(options.python, ['-c', "import importlib.metadata as m\ntry: print(m.version('omnivoice'))\nexcept m.PackageNotFoundError: print('unknown')"], { timeoutMs: Math.min(30000, remaining), retries: 0 })
    if (!probe.ok || !probe.stdout.trim()) throw new Error(`failed to probe omnivoice version: ${probe.stderr || probe.errorCode || (probe.timedOut ? 'timeout' : `exit ${probe.status}`)}`)
    probedVersion = probe.stdout.trim()
    for (const [index, segment] of segments.segments.entries()) {
      if (Date.now() >= deadline) throw new Error('overall timeout exceeded')
      const output = outputs[index]
      const text = segment.spokenText ?? segment.text
      const fingerprint = hash(JSON.stringify({ text, model: options.model, python: pythonPath, helperSha256, version: probedVersion, voiceReference: refHash, refText: options.refText, language: options.language ?? null, device: options.device }))
      const old = previous.get(segment.id)
      if (old?.fingerprint === fingerprint && old.path === segment.audio && fs.existsSync(output) && old.sha256 === hash(fs.readFileSync(output))) {
        chunks.push(old); reused++; continue
      }
      const temp = `${output}.tmp-${process.pid}`
      let failure
      for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
        try {
          if (!worker) await startWorker()
          worker.child.stdin.write(`${JSON.stringify({ id: segment.id, text, language: options.language, output: temp })}\n`)
          const result = await worker.next()
          if (result.type !== 'result' || result.id !== segment.id || !result.ok) throw new Error(result.error ?? 'invalid helper result')
          if (!Number.isFinite(result.durationSec) || result.durationSec <= 0 || !fs.existsSync(temp)) throw new Error('helper produced invalid audio')
          fs.renameSync(temp, output)
          chunks.push({ id: segment.id, segmentId: segment.id, path: segment.audio, sha256: hash(fs.readFileSync(output)), durationSec: result.durationSec, fingerprint, attempts: attempt })
          synthesized++; save(); failure = null; break
        } catch (error) {
          failure = error
          worker?.stop(); worker = null
          fs.rmSync(temp, { force: true })
          if (Date.now() >= deadline) break
        }
      }
      if (failure) throw new Error(`synthesis failed for ${segment.id}: ${failure.message}`)
    }
    save(true)
    return { synthesized, reused, device: ready?.device ?? prior.engine?.device ?? options.device, voicePackage: voicePackage?.id ?? null, chunks: chunks.length }
  } finally { worker?.stop() }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = await synthesize(options)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(`synthesize-narration: ${error.message}`); process.exitCode = 1 }
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
