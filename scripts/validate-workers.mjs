#!/usr/bin/env node
/**
 * Validate scene-worker scheduling and results before integration.
 *
 * `plan` distinguishes delegation NESTING DEPTH from actual CONCURRENCY. The
 * default is at most two concurrent scene workers and depth 1; a plan with
 * three workers in one wave fails even if each reports depth 1.
 *
 * `result` checks the worker's declared changed files against its assigned
 * work directory and an optional allowlist. This is a post-hoc review check,
 * NOT a filesystem sandbox: prompt instructions are not security enforcement.
 * Use the DSH child session sandbox to constrain writes when available.
 *
 * Usage:
 *   node scripts/validate-workers.mjs plan <plan.json> [--max-concurrency 2] [--max-depth 1] [--json]
 *   node scripts/validate-workers.mjs result <episode-dir> <result.json> [--work <dir>]
 *        [--allow <glob>]... [--allow-fail] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PROTECTED = new Set([
  'narration.md',
  'narration-review.json',
  'claim-check.json',
  'throughline-map.json',
  'storyboard.json',
  'timeline.json',
  'production.json',
  'audio/manifest.json',
  'audio/segments.json',
])

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function inside(root, file) {
  const resolved = path.resolve(root, file)
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : undefined
}

function realpathInside(root, file) {
  const realRoot = fs.realpathSync(root)
  let real
  try {
    real = fs.realpathSync(file)
  } catch {
    return undefined
  }
  return real === realRoot || real.startsWith(`${realRoot}${path.sep}`) ? real : undefined
}

/** Convert a small glob (`*`, `**`) to a regular expression. */
export function globToRegExp(glob) {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*'
      index += 1
      if (glob[index + 1] === '/') index += 1
    } else if (char === '*') pattern += '[^/]*'
    else if (char === '?') pattern += '[^/]'
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`)
}

function overlap(intervals) {
  const points = intervals.flatMap(([start, end]) => [[start, 1], [end, -1]])
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let active = 0
  let max = 0
  for (const [, delta] of points) {
    active += delta
    max = Math.max(max, active)
  }
  return max
}

/** @param {object} plan @param {{maxConcurrency?:number,maxDepth?:number}} [limits] */
export function validateWorkerPlan(plan, limits = {}) {
  const errors = []
  const warnings = []
  const maxConcurrency = limits.maxConcurrency ?? 2
  const maxDepth = limits.maxDepth ?? 1
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) errors.push('max concurrency must be a positive integer')
  if (!Number.isInteger(maxDepth) || maxDepth < 0) errors.push('max delegation depth must be a non-negative integer')
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: ['plan must be a JSON object'], warnings }
  }
  const workers = plan.workers
  if (!Array.isArray(workers) || workers.length === 0) {
    return { ok: false, errors: [...errors, 'plan.workers must be a non-empty array'], warnings }
  }
  const ids = new Set()
  const depths = []
  const intervals = []
  const waves = new Map()
  for (const [index, worker] of workers.entries()) {
    const label = `workers[${index}]`
    if (worker === null || typeof worker !== 'object') {
      errors.push(`${label} must be an object`)
      continue
    }
    if (typeof worker.id !== 'string' || worker.id.length === 0) errors.push(`${label}.id is required`)
    else if (ids.has(worker.id)) errors.push(`duplicate worker id: ${worker.id}`)
    else ids.add(worker.id)
    const depth = worker.delegationDepth ?? 1
    if (!Number.isInteger(depth) || depth < 0) errors.push(`${label}.delegationDepth must be a non-negative integer`)
    else depths.push(depth)
    if (Number.isFinite(worker.startedAt) && Number.isFinite(worker.finishedAt) && worker.finishedAt >= worker.startedAt) {
      intervals.push([worker.startedAt, worker.finishedAt])
    } else if (worker.wave !== undefined) {
      if (!Number.isInteger(worker.wave) || worker.wave < 0) errors.push(`${label}.wave must be a non-negative integer`)
      else waves.set(worker.wave, (waves.get(worker.wave) ?? 0) + 1)
    } else {
      intervals.push([0, 1])
      warnings.push(`${label} has no startedAt/finishedAt or wave; conservatively counted as concurrent`)
    }
  }
  const fromIntervals = overlap(intervals)
  const fromWaves = waves.size === 0 ? 0 : Math.max(...waves.values())
  const maxObservedConcurrency = Math.max(fromIntervals, fromWaves, intervals.length > 0 && waves.size === 0 ? fromIntervals : 0)
  const maxObservedDepth = depths.length === 0 ? 0 : Math.max(...depths)
  if (maxObservedConcurrency > maxConcurrency) {
    errors.push(`planned concurrency ${maxObservedConcurrency} exceeds the limit of ${maxConcurrency}; depth and concurrency are different controls`)
  }
  if (maxObservedDepth > maxDepth) {
    errors.push(`planned delegation depth ${maxObservedDepth} exceeds the limit of ${maxDepth}; nesting is not concurrency`)
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      workers: workers.length,
      concurrency: { maxObserved: maxObservedConcurrency, limit: maxConcurrency, method: intervals.length > 0 ? 'startedAt/finishedAt overlap' : 'wave grouping' },
      delegationDepth: { maxObserved: maxObservedDepth, limit: maxDepth },
      caveat: 'The plan is declared data. Verify actual child sessions with collect-metrics.mjs; this does not prove the runtime honored the plan.',
    },
  }
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(file))
}

/** @param {string} episodeDir @param {object} result @param {object} options */
export function validateWorkerResult(episodeDir, result, options = {}) {
  const errors = []
  const warnings = []
  const root = path.resolve(episodeDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`episode directory not found: ${root}`)
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return { ok: false, errors: ['result must be a JSON object'], warnings }
  const status = String(result.status ?? '').toUpperCase()
  if (status !== 'PASS' && options.allowFail !== true) errors.push(`worker status is "${result.status ?? 'missing'}"; integration requires PASS`)
  const sceneId = typeof result.sceneId === 'string' ? result.sceneId : undefined
  if (sceneId === undefined) errors.push('result.sceneId is required')
  const workRelative = options.work ?? (sceneId === undefined ? undefined : path.join('work', sceneId))
  if (workRelative === undefined) errors.push('--work is required when result.sceneId is missing')
  const workDir = workRelative === undefined ? undefined : inside(root, workRelative)
  if (workDir === undefined) errors.push(`work directory escapes the episode: ${workRelative}`)
  else if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) errors.push(`assigned work directory does not exist: ${workRelative}`)
  const allow = Array.isArray(options.allow) ? options.allow : []
  for (const pattern of allow) {
    if (typeof pattern !== 'string' || !pattern.startsWith('work/')) errors.push(`allow pattern must be relative to the episode and start with "work/": ${JSON.stringify(pattern)}`)
  }
  const changed = result.changedFiles
  if (!Array.isArray(changed)) errors.push('result.changedFiles must be an array')
  else if (changed.length === 0) warnings.push('worker reports no changed files; verify that it delivered something')
  const normalizedChanged = []
  for (const [index, file] of (Array.isArray(changed) ? changed : []).entries()) {
    if (typeof file !== 'string' || file.length === 0) {
      errors.push(`changedFiles[${index}] must be a non-empty path`)
      continue
    }
    const absolute = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file)
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    if (PROTECTED.has(relative) || relative.startsWith('library/') || relative.startsWith('scenes/') && !relative.startsWith(`work/`)) {
      errors.push(`worker changed a protected/shared artifact: ${relative}`)
      continue
    }
    if (workDir !== undefined) {
      const real = realpathInside(workDir, absolute)
      if (real === undefined) {
        errors.push(`changed file is outside the assigned work directory: ${relative}`)
        continue
      }
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      errors.push(`changed file does not exist: ${relative}`)
      continue
    }
    if (allow.length > 0 && !matchesAny(relative, allow)) {
      errors.push(`changed file is not covered by the allowlist: ${relative}`)
      continue
    }
    normalizedChanged.push(relative)
  }
  for (const field of ['codePaths', 'previewPaths']) {
    if (result[field] !== undefined && !Array.isArray(result[field])) errors.push(`result.${field} must be an array`)
    else for (const file of (result[field] ?? [])) {
      if (typeof file !== 'string') {
        errors.push(`result.${field} entries must be strings`)
        continue
      }
      const absolute = path.isAbsolute(file) ? file : path.resolve(root, file)
      if (workDir !== undefined && realpathInside(workDir, absolute) === undefined) errors.push(`result.${field} escapes the work directory: ${file}`)
    }
  }
  if (typeof result.qaReportPath === 'string' && result.qaReportPath.length > 0) {
    const absolute = path.isAbsolute(result.qaReportPath) ? result.qaReportPath : path.resolve(root, result.qaReportPath)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) errors.push(`qaReportPath does not exist: ${result.qaReportPath}`)
  } else if (status === 'PASS') {
    warnings.push('PASS result has no qaReportPath')
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      episodeDir: root,
      sceneId,
      workDir: workRelative,
      changedFiles: normalizedChanged,
      allowlist: allow,
      securityNote: 'This validates declared paths after the fact. It is not an OS sandbox; prompt text cannot enforce filesystem boundaries. Use the DSH child session sandbox when available.',
    },
  }
}

function parseArgs(argv) {
  const command = argv[0]
  const args = { command, positional: [], allow: [], json: false }
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    const need = () => {
      index += 1
      if (argv[index] === undefined) throw new Error(`${value} needs a value`)
      return argv[index]
    }
    if (value === '--json') args.json = true
    else if (value === '--allow') args.allow.push(need())
    else if (value === '--allow-fail') args.allowFail = true
    else if (value === '--work') args.work = need()
    else if (value === '--max-concurrency') args.maxConcurrency = Number(need())
    else if (value === '--max-depth') args.maxDepth = Number(need())
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else args.positional.push(value)
  }
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage:\n  node scripts/validate-workers.mjs plan <plan.json> [--max-concurrency 2] [--max-depth 1]\n  node scripts/validate-workers.mjs result <episode-dir> <result.json> [--work <dir>] [--allow <glob>]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    if (args.command === 'plan') {
      if (args.positional.length !== 1) throw new Error('plan needs one JSON file')
      result = validateWorkerPlan(readJson(args.positional[0]), { maxConcurrency: args.maxConcurrency, maxDepth: args.maxDepth })
    } else if (args.command === 'result') {
      if (args.positional.length !== 2) throw new Error('result needs <episode-dir> <result.json>')
      result = validateWorkerResult(args.positional[0], readJson(args.positional[1]), { work: args.work, allow: args.allow, allowFail: args.allowFail })
    } else {
      throw new Error('unknown command; use plan or result')
    }
  } catch (error) {
    console.error(`validate-workers: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    console.log(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`)
    if (result.data?.caveat) console.log(`NOTE: ${result.data.caveat}`)
    if (result.data?.securityNote) console.log(`NOTE: ${result.data.securityNote}`)
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
