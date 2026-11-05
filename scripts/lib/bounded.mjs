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
  const retryOn = options.retryOn ?? ((result) => result.timedOut || result.errorCode !== undefined || result.signal !== null)
  const attempts = []
  let last
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const started = Date.now()
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      cwd: options.cwd,
      env: options.env,
      input: options.input,
      maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
      windowsHide: true,
    })
    const classified = classify(result)
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
