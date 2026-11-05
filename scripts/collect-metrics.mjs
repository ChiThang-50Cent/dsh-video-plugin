#!/usr/bin/env node
/**
 * Reproducible production metrics from DSH session/event logs.
 *
 * The collector reads persisted session JSONL (plain or zstd), follows
 * `parentSession` so scene workers are included, and separates:
 *   - wall-clock active time (union of session activity),
 *   - tool execution time and overlap between tool calls,
 *   - observed model latency (from event timestamps),
 *   - multi-agent overlap (main + workers running at the same time),
 *   - worker concurrency (distinct from delegation depth),
 *   - tokens, cached tokens, retries, failed jobs and image reads.
 *
 * It never turns a missing field into an estimate: unavailable values are null
 * or named in `unavailable`.
 *
 * Usage:
 *   node scripts/collect-metrics.mjs [--sessions-dir <dir>] [--session <id>]...
 *        [--episode <episode-dir>] [--out <file>] [--no-descendants] [--json]
 *
 * Default sessions dir: $DSH_HOME/sessions or ~/.dsh/sessions.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function normalizeId(value) {
  return String(value ?? '').replace(/^session-/, '')
}

function discover(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...discover(absolute))
    else if (/session\..*\.jsonl(?:\.zstd)?$/.test(entry.name) || entry.name.endsWith('.jsonl')) files.push(absolute)
  }
  return files.sort()
}

function decompress(file, buffer) {
  if (!file.endsWith('.zstd')) return buffer
  if (typeof zlib.zstdDecompressSync === 'function') return zlib.zstdDecompressSync(buffer)
  const result = spawnSync('zstd', ['-dc', file], { maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`zstd failed for ${file}: ${result.stderr?.toString() ?? result.status}`)
  return result.stdout
}

export function readSessionFile(file) {
  const compressed = fs.readFileSync(file)
  const raw = decompress(file, compressed).toString('utf8')
  const events = []
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // A truncated final line is common after a crash; count it and continue.
    }
  }
  const header = events.find((event) => event.type === 'session')
  if (header === undefined) throw new Error(`no session header in ${file}`)
  return {
    file,
    fileSha256: sha256(compressed),
    header,
    events,
    raw,
    sessionId: normalizeId(header.id ?? path.basename(path.dirname(file))),
    parentId: header.parentSession === undefined ? undefined : normalizeId(header.parentSession),
  }
}

function intervalsFor(events) {
  const intervals = []
  let start
  for (const event of events) {
    if (event.type === 'turn/start') {
      if (start === undefined) start = event.time
    } else if (event.type === 'turn/end') {
      if (start !== undefined) {
        intervals.push([start, event.time])
        start = undefined
      }
    }
  }
  if (start !== undefined) intervals.push([start, events.at(-1)?.time ?? start])
  return intervals
}

function unionLength(intervals) {
  if (intervals.length === 0) return 0
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let [start, end] = sorted[0]
  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart > end) {
      total += end - start
      start = nextStart
      end = nextEnd
    } else {
      end = Math.max(end, nextEnd)
    }
  }
  return total + (end - start)
}

function overlapOf(intervals) {
  if (intervals.length === 0) return { max: 0, peakAt: null, union: 0, sum: 0 }
  const points = []
  for (const [start, end] of intervals) {
    points.push([start, 1])
    points.push([end, -1])
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let active = 0
  let max = 0
  let peakAt = null
  for (const [time, delta] of points) {
    active += delta
    if (active > max) {
      max = active
      peakAt = time
    }
  }
  return {
    max,
    peakAt: peakAt === null ? null : new Date(peakAt).toISOString(),
    union: unionLength(intervals),
    sum: intervals.reduce((total, [start, end]) => total + (end - start), 0),
  }
}

function assistantUsage(events) {
  const messages = events.filter((event) => event.type === 'assistant/message' && event.data?.usage !== undefined)
  const sum = (key) => messages.reduce((total, event) => total + (Number(event.data.usage[key]) || 0), 0)
  const sumAliases = (keys) => messages.reduce((total, event) => {
    for (const key of keys) {
      if (event.data.usage[key] !== undefined) return total + (Number(event.data.usage[key]) || 0)
    }
    return total
  }, 0)
  const cacheFields = ['cacheReadTokens', 'cachedInputTokens', 'cache_read_input_tokens']
  const writeFields = ['cacheWriteTokens', 'cacheCreationInputTokens', 'cache_creation_input_tokens']
  return {
    calls: messages.length,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    totalTokens: sum('totalTokens'),
    cachedReadTokens: sumAliases(cacheFields),
    cachedWriteTokens: sumAliases(writeFields),
    cacheFieldObserved: messages.some((event) => [...cacheFields, ...writeFields].some((key) => event.data.usage[key] !== undefined)),
    models: [...new Set(messages.map((event) => `${event.data?.message?.source?.provider ?? 'unknown'}/${event.data?.message?.source?.model ?? 'unknown'}`))],
  }
}

function modelLatency(events) {
  const messages = events.filter((event) => event.type === 'assistant/message')
  const durations = []
  for (const message of messages) {
    const turn = message.data?.turn
    const step = message.data?.step
    const previous = events
      .filter((event) => event.time < message.time && event.data?.turn === turn && event.data?.step === step && event.type !== 'assistant/message')
      .sort((a, b) => b.time - a.time)[0]
    if (previous !== undefined) durations.push(message.time - previous.time)
  }
  if (durations.length === 0) return { measuredMs: null, samples: 0, method: 'observed event gap; no samples' }
  return {
    measuredMs: durations.reduce((total, value) => total + value, 0),
    samples: durations.length,
    method: 'sum of gaps from the last same-step event to each assistant message completion; includes transport time',
  }
}

function toolMetrics(events) {
  const calls = events.filter((event) => event.type === 'tool/call')
  const results = new Map(events.filter((event) => event.type === 'tool/result').map((event) => [event.data?.toolCallId ?? event.data?.message?.toolCallId, event]))
  const byName = {}
  const intervals = []
  const failures = []
  let missingResults = 0
  for (const call of calls) {
    const name = call.data?.name ?? 'unknown'
    byName[name] = (byName[name] ?? 0) + 1
    const result = results.get(call.data?.callId)
    if (result === undefined) {
      missingResults += 1
      continue
    }
    const duration = Math.max(0, result.time - call.time)
    intervals.push([call.time, result.time])
    if (result.data?.message?.isError === true) {
      failures.push({ callId: call.data?.callId, name, at: new Date(call.time).toISOString(), durationMs: duration })
    }
  }
  const total = intervals.reduce((sum, [start, end]) => sum + (end - start), 0)
  const union = unionLength(intervals)

  const signature = (call) => `${call.data?.name ?? 'unknown'}:${call.data?.arguments ?? ''}`
  const seenFailure = new Set()
  let retriesAfterFailure = 0
  let repeatedCalls = 0
  const counts = new Map()
  for (const call of calls) {
    const key = signature(call)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (seenFailure.has(key)) retriesAfterFailure += 1
    if (failures.some((failure) => failure.callId === call.data?.callId)) seenFailure.add(key)
    if ((counts.get(key) ?? 0) > 1) repeatedCalls += 1
  }
  const imageNames = Object.keys(byName).filter((name) => /read_image|image|screenshot|vision/i.test(name))
  return {
    calls: calls.length,
    results: results.size,
    missingResults,
    byName,
    executionMs: total,
    unionMs: union,
    overlapMs: Math.max(0, total - union),
    intervals,
    failures,
    imageReads: byName.read_image ?? 0,
    imageTools: Object.fromEntries(imageNames.map((name) => [name, byName[name]])),
    retries: { afterFailure: retriesAfterFailure, repeatedCalls, method: 'same tool name+arguments repeated after a failed result' },
  }
}

function jobMetrics(events) {
  const registered = events.filter((event) => event.type === 'job/registered')
  const settled = new Map(events.filter((event) => event.type === 'job/settled').map((event) => [event.data?.jobId, event]))
  const statuses = {}
  let failed = 0
  for (const job of registered) {
    const result = settled.get(job.data?.jobId)
    const status = result?.data?.status ?? 'unsettled'
    statuses[status] = (statuses[status] ?? 0) + 1
    if (status !== 'completed' && status !== 'unsettled') failed += 1
  }
  return { registered: registered.length, settled: settled.size, statuses, failed }
}

function attempts(events) {
  const attemptsList = events.filter((event) => event.type === 'assistant/attempt')
  const messages = new Set(events.filter((event) => event.type === 'assistant/message').map((event) => `${event.data?.turn}:${event.data?.step}`))
  const withoutMessage = attemptsList.filter((event) => !messages.has(`${event.data?.turn}:${event.data?.step}`))
  return { attempts: attemptsList.length, attemptsWithoutMessage: withoutMessage.length }
}

function sessionMetrics(session) {
  const events = session.events
  const times = events.map((event) => event.time).filter(Number.isFinite)
  const first = times.length > 0 ? Math.min(...times) : (session.header.createdAt ?? 0)
  const last = times.length > 0 ? Math.max(...times) : first
  const turns = intervalsFor(events)
  return {
    sessionId: session.sessionId,
    parentSessionId: session.parentId ?? null,
    agentPreset: session.header.agentPreset ?? null,
    delegationDepth: Number.isInteger(session.header.delegationDepth) ? session.header.delegationDepth : 0,
    cwd: session.header.cwd ?? null,
    startedAt: new Date(session.header.createdAt ?? first).toISOString(),
    endedAt: new Date(last).toISOString(),
    wallClockMs: Math.max(0, last - (session.header.createdAt ?? first)),
    activeWallClockMs: unionLength(turns),
    turns: events.filter((event) => event.type === 'turn/start').length,
    steps: events.filter((event) => event.type === 'step/start').length,
    model: assistantUsage(events),
    modelLatency: modelLatency(events),
    modelAttempts: attempts(events),
    tools: toolMetrics(events),
    jobs: jobMetrics(events),
    source: { file: session.file, sha256: session.fileSha256 },
    intervals: turns,
  }
}

/**
 * @param {{
 *   sessionsDir?: string,
 *   sessionIds?: string[],
 *   episode?: string,
 *   includeDescendants?: boolean
 * }} [options]
 */
export function collectMetrics(options = {}) {
  const sessionsDir = path.resolve(options.sessionsDir ?? path.join(process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'), 'sessions'))
  const allFiles = discover(sessionsDir)
  if (allFiles.length === 0) throw new Error(`no DSH session logs found under ${sessionsDir}`)
  const loaded = allFiles.map((file) => readSessionFile(file))
  const byId = new Map()
  for (const session of loaded) {
    if (!byId.has(session.sessionId)) byId.set(session.sessionId, session)
  }
  const requested = new Set((options.sessionIds ?? []).map(normalizeId))
  const missingSessions = []
  for (const id of requested) if (!byId.has(id)) missingSessions.push(id)

  let selected
  if (requested.size > 0) {
    selected = loaded.filter((session) => requested.has(session.sessionId))
  } else if (typeof options.episode === 'string' && options.episode.length > 0) {
    const needle = path.resolve(options.episode)
    selected = loaded.filter((session) => session.raw.includes(needle))
  } else {
    selected = loaded
  }
  const includeDescendants = options.includeDescendants !== false
  if (includeDescendants) {
    const selectedIds = new Set(selected.map((session) => session.sessionId))
    let changed = true
    while (changed) {
      changed = false
      for (const session of loaded) {
        if (selectedIds.has(session.sessionId)) continue
        if (session.parentId !== undefined && selectedIds.has(session.parentId)) {
          selected.push(session)
          selectedIds.add(session.sessionId)
          changed = true
        }
      }
    }
  }
  selected.sort((a, b) => (a.header.createdAt ?? 0) - (b.header.createdAt ?? 0) || a.sessionId.localeCompare(b.sessionId))
  if (selected.length === 0) {
    return {
      schemaVersion: 2,
      measured: true,
      generatedAt: new Date().toISOString(),
      sessionsDir,
      selection: {
        requestedSessions: [...requested],
        missingSessions,
        episode: options.episode ?? null,
        includedDescendants: includeDescendants,
      },
      sessions: [],
      aggregate: null,
      errors: ['no session matched the selection'],
      unavailable: [],
    }
  }

  const perSession = selected.map(sessionMetrics)
  const selectedIds = new Set(perSession.map((session) => session.sessionId))
  for (const session of perSession) {
    if (session.parentSessionId !== null && selectedIds.has(session.parentSessionId)) {
      session.role = 'worker'
    } else {
      session.role = 'main'
    }
  }
  const workerIntervals = perSession.filter((session) => session.role === 'worker').map((session) => session.intervals).flat()
  const workerConcurrency = overlapOf(workerIntervals)
  const allIntervals = perSession.map((session) => session.intervals).flat()
  const union = unionLength(allIntervals)
  const sum = allIntervals.reduce((total, [start, end]) => total + (end - start), 0)
  const allToolIntervals = []
  let toolExecutionMs = 0
  for (const session of selected) {
    const tools = toolMetrics(session.events)
    toolExecutionMs += tools.executionMs
    allToolIntervals.push(...tools.intervals)
  }
  const toolUnionMs = unionLength(allToolIntervals)
  const cachedRead = perSession.reduce((total, session) => total + session.model.cachedReadTokens, 0)
  const cacheObserved = perSession.some((session) => session.model.cacheFieldObserved)
  const latencySamples = perSession.reduce((total, session) => total + session.modelLatency.samples, 0)
  const unavailable = []
  if (!cacheObserved) unavailable.push('cached token counters were not present in these sessions')
  if (latencySamples === 0) unavailable.push('model latency could not be measured from event timestamps')
  const failedJobs = perSession.reduce((total, session) => total + session.jobs.failed, 0)
  const failedTools = perSession.reduce((total, session) => total + session.tools.failures.length, 0)
  const retries = perSession.reduce((total, session) => total + session.tools.retries.afterFailure + session.modelAttempts.attemptsWithoutMessage, 0)
  const imageReads = perSession.reduce((total, session) => total + session.tools.imageReads, 0)
  const maxDepth = Math.max(...perSession.map((session) => session.delegationDepth))
  return {
    schemaVersion: 2,
    measured: true,
    generatedAt: new Date().toISOString(),
    sessionsDir,
    selection: {
      requestedSessions: [...requested],
      missingSessions,
      episode: options.episode ?? null,
      includedDescendants: includeDescendants,
    },
    sessions: perSession,
    aggregate: {
      sessionCount: perSession.length,
      mainSessions: perSession.filter((session) => session.role === 'main').length,
      workerSessions: perSession.filter((session) => session.role === 'worker').length,
      wallClockMs: union,
      sumSessionActiveMs: sum,
      multiAgentOverlapMs: Math.max(0, sum - union),
      toolExecutionMs,
      toolUnionMs,
      toolOverlapMs: Math.max(0, toolExecutionMs - toolUnionMs),
      modelLatencyMs: latencySamples === 0 ? null : perSession.reduce((total, session) => total + session.modelLatency.measuredMs, 0),
      modelCalls: perSession.reduce((total, session) => total + session.model.calls, 0),
      inputTokens: perSession.reduce((total, session) => total + session.model.inputTokens, 0),
      outputTokens: perSession.reduce((total, session) => total + session.model.outputTokens, 0),
      totalTokens: perSession.reduce((total, session) => total + session.model.totalTokens, 0),
      cachedReadTokens: cachedRead === 0 && !cacheObserved ? null : cachedRead,
      cachedWriteTokens: cacheObserved ? perSession.reduce((total, session) => total + session.model.cachedWriteTokens, 0) : null,
      turns: perSession.reduce((total, session) => total + session.turns, 0),
      steps: perSession.reduce((total, session) => total + session.steps, 0),
      toolCalls: perSession.reduce((total, session) => total + session.tools.calls, 0),
      failedToolCalls: failedTools,
      failedJobs,
      retries,
      imageReads,
      delegationDepthMax: maxDepth,
      concurrency: {
        maxConcurrentWorkers: workerConcurrency.max,
        peakAt: workerConcurrency.peakAt,
        method: 'overlap of worker session turn intervals; this is concurrency, not delegation depth',
      },
      overlapNote: 'toolOverlapMs measures overlapping tool calls; multiAgentOverlapMs measures main/worker session overlap. They are different.',
    },
    unavailable,
    provenance: {
      source: 'DSH session/event JSONL',
      files: perSession.map((session) => ({ sessionId: session.sessionId, file: session.source.file, sha256: session.source.sha256 })),
      note: 'Model latency is observed event-gap time, not provider-side compute time. Tokens are counted from persisted usage records.',
    },
  }
}

function parseArgs(argv) {
  const args = { sessionIds: [], includeDescendants: true, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const need = () => {
      index += 1
      if (argv[index] === undefined) throw new Error(`${value} needs a value`)
      return argv[index]
    }
    if (value === '--session') args.sessionIds.push(need())
    else if (value === '--sessions-dir') args.sessionsDir = need()
    else if (value === '--episode') args.episode = need()
    else if (value === '--out') args.out = need()
    else if (value === '--no-descendants') args.includeDescendants = false
    else if (value === '--json') args.json = true
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else throw new Error(`unexpected argument: ${value}`)
  }
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/collect-metrics.mjs [--sessions-dir <dir>] [--session <id>]... [--episode <dir>] [--out <file>] [--no-descendants] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let metrics
  try {
    metrics = collectMetrics(args)
  } catch (error) {
    console.error(`collect-metrics: ${error.message}`)
    process.exitCode = 2
    return
  }
  const output = `${JSON.stringify(metrics, null, 2)}\n`
  if (typeof args.out === 'string') {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true })
    fs.writeFileSync(args.out, output)
  }
  if (args.json || typeof args.out !== 'string') process.stdout.write(output)
  else {
    console.log(`Metrics written: ${args.out}`)
    console.log(`  sessions: ${metrics.aggregate.sessionCount} (${metrics.aggregate.workerSessions} worker)`)
    console.log(`  wall clock: ${(metrics.aggregate.wallClockMs / 1000).toFixed(1)}s, tool: ${(metrics.aggregate.toolExecutionMs / 1000).toFixed(1)}s, model: ${metrics.aggregate.modelLatencyMs === null ? 'unavailable' : `${(metrics.aggregate.modelLatencyMs / 1000).toFixed(1)}s`}`)
    console.log(`  tokens: ${metrics.aggregate.totalTokens} total, cached read ${metrics.aggregate.cachedReadTokens ?? 'unavailable'}`)
    console.log(`  image reads: ${metrics.aggregate.imageReads}, retries: ${metrics.aggregate.retries}, failed jobs: ${metrics.aggregate.failedJobs}`)
    console.log(`  max concurrent workers: ${metrics.aggregate.concurrency.maxConcurrentWorkers}; max delegation depth: ${metrics.aggregate.delegationDepthMax}`)
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
