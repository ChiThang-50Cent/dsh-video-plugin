/**
 * Bounded subprocess execution with an explicit retry policy.
 *
 * Adapters must pass a timeout; a hung TTS/ASR/render job is a failure, not an
 * invitation to retry forever. The default retries only transport-ish failures
 * (timeout, spawn error, signal); deterministic non-zero exits are not retried
 * unless the caller opts in.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_TIMEOUT_MS = 120_000
export const MAX_TIMEOUT_MS = 30 * 60_000
const GRACE_MS = 200
const SUPERVISOR_MARGIN_MS = 1000
const supervisor = `
const { spawn } = require('node:child_process')
const spec = JSON.parse(process.argv[1])
let stdout = '', stderr = '', timedOut = false, errorCode
const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, detached: process.platform !== 'win32', windowsHide: true })
const kill = (signal) => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal) } catch {} }
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
child.stdout.on('data', data => { stdout += data; if (stdout.length > spec.maxBuffer) { errorCode = 'ENOBUFS'; kill('SIGKILL') } })
child.stderr.on('data', data => { stderr += data; if (stderr.length > spec.maxBuffer) { errorCode = 'ENOBUFS'; kill('SIGKILL') } })
child.on('error', error => { errorCode = error.code })
child.stdin.on('error', () => {})
if (spec.input !== undefined) child.stdin.end(spec.input); else child.stdin.end()
let status = null, signal = null, closed = false, graceDone = false, finished = false
const finish = () => {
  if (finished || !(closed && !timedOut) && !(timedOut && graceDone)) return
  finished = true
  if (timedOut) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy() }
  process.stdout.write(JSON.stringify({ status, signal, timedOut, errorCode, stdout, stderr }), () => process.exit(0))
}
const timer = setTimeout(() => {
  timedOut = true
  kill('SIGTERM')
  setTimeout(() => { kill('SIGKILL'); graceDone = true; finish() }, spec.grace)
}, spec.timeout)
child.on('close', (code, sig) => { status = code; signal = sig; closed = true; if (!timedOut) clearTimeout(timer); finish() })
`

/**
 * Find an executable on PATH without invoking a shell.
 * @param {string} command
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function findCommand(command, options = {}) {
  if (typeof command !== 'string' || command.length === 0) return undefined
  if (path.isAbsolute(command)) {
    try {
      fs.accessSync(command, fs.constants.X_OK)
      return command
    } catch {
      return undefined
    }
  }
  const env = options.env ?? process.env
  const pathValue = env.PATH ?? env.Path ?? ''
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']
  for (const directory of pathValue.split(path.delimiter)) {
    if (directory.length === 0) continue
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        // continue searching
      }
    }
  }
  return undefined
}

function classify(result) {
  return {
    ok: result.status === 0 && result.error === undefined && result.signal === null,
    status: result.status,
    signal: result.signal ?? null,
    timedOut: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    errorCode: result.error?.code,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   timeoutMs?: number,
 *   retries?: number,
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   input?: string,
 *   maxBuffer?: number,
 *   retryOn?: (result: {ok:boolean,status:number|null,signal:string|null,timedOut:boolean,errorCode?:string}) => boolean
 * }} [options]
 */
export function runBounded(command, args = [], options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}`)
  }
  const retries = options.retries ?? 0
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new Error('retries must be an integer 0..10')
  const retryOn = options.retryOn ?? ((result) => !result.timedOut && (result.errorCode !== undefined || result.signal !== null))
  const attempts = []
  let last
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const started = Date.now()
    const result = spawnSync(process.execPath, ['-e', supervisor, JSON.stringify({
      command, args, cwd: options.cwd, env: options.env, input: options.input,
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024, timeout: timeoutMs, grace: GRACE_MS,
    })], {
      encoding: 'utf8', maxBuffer: (options.maxBuffer ?? 10 * 1024 * 1024) * 3, windowsHide: true,
      timeout: timeoutMs + GRACE_MS + SUPERVISOR_MARGIN_MS, killSignal: 'SIGKILL',
    })
    let classified
    if (result.status === 0) {
      try {
        classified = JSON.parse(result.stdout)
        if (classified === null || typeof classified !== 'object') throw new Error('invalid supervisor result')
      } catch {
        classified = { ...classify(result), errorCode: 'ERR_SUPERVISOR_OUTPUT' }
      }
    } else classified = classify(result)
    classified.ok = classified.status === 0 && !classified.timedOut && classified.errorCode === undefined && classified.signal === null
    const record = {
      attempt,
      durationMs: Date.now() - started,
      ...classified,
    }
    attempts.push(record)
    last = record
    if (record.ok) break
    if (attempt > retries || !retryOn(record)) break
  }
  return {
    ...last,
    attempts,
    retried: attempts.length > 1,
    command,
    args,
    timeoutMs,
    retries,
  }
}

/**
 * Probe a command with a short version call.
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, env?: NodeJS.ProcessEnv }} [options]
 */
export function probeCommand(command, args = ['--version'], options = {}) {
  const resolved = findCommand(command, { env: options.env })
  if (resolved === undefined) {
    return { available: false, command, resolved: null, summary: '', error: 'not-found' }
  }
  const result = runBounded(resolved, args, { timeoutMs: options.timeoutMs ?? 6000, env: options.env, retries: 0 })
  const summary = (result.stdout || result.stderr || '').split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? ''
  return {
    available: result.ok,
    command,
    resolved,
    summary: summary.slice(0, 240),
    error: result.ok ? null : result.timedOut ? 'timeout' : result.errorCode ?? `exit-${result.status}`,
  }
}
