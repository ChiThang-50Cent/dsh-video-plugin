import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectMetrics } from '../scripts/collect-metrics.mjs'

function writeSession(dir, id, header, events) {
  const sessionDir = path.join(dir, id)
  fs.mkdirSync(sessionDir, { recursive: true })
  const lines = [{ type: 'session', version: 4, id, ...header }, ...events].map((event) => JSON.stringify(event))
  fs.writeFileSync(path.join(sessionDir, 'session.v4.jsonl'), `${lines.join('\n')}\n`)
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-metrics-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const mainEvents = [
    { type: 'user/message', time: 1000, data: { content: [{ type: 'text', text: 'episode: /virtual/ep-001' }] } },
    { type: 'turn/start', time: 1000, data: { turn: 1 } },
    { type: 'step/start', time: 1001, data: { turn: 1, step: 1 } },
    { type: 'tool/call', time: 1100, data: { turn: 1, step: 1, callId: 'c-a', name: 'bash', arguments: '{"command":"a"}' } },
    { type: 'tool/result', time: 1300, data: { turn: 1, step: 1, toolCallId: 'c-a', message: { isError: false } } },
    { type: 'tool/call', time: 1200, data: { turn: 1, step: 1, callId: 'c-b', name: 'bash', arguments: '{"command":"b"}' } },
    { type: 'tool/result', time: 1400, data: { turn: 1, step: 1, toolCallId: 'c-b', message: { isError: false } } },
    { type: 'tool/call', time: 1500, data: { turn: 1, step: 1, callId: 'c-c', name: 'bash', arguments: '{"command":"c"}' } },
    { type: 'tool/result', time: 1550, data: { turn: 1, step: 1, toolCallId: 'c-c', message: { isError: true } } },
    { type: 'tool/call', time: 1600, data: { turn: 1, step: 1, callId: 'c-d', name: 'bash', arguments: '{"command":"c"}' } },
    { type: 'tool/result', time: 1650, data: { turn: 1, step: 1, toolCallId: 'c-d', message: { isError: false } } },
    { type: 'tool/call', time: 1700, data: { turn: 1, step: 1, callId: 'c-e', name: 'read_image', arguments: '{"path":"frame.png"}' } },
    { type: 'tool/result', time: 1750, data: { turn: 1, step: 1, toolCallId: 'c-e', message: { isError: false } } },
    { type: 'assistant/message', time: 1800, data: { turn: 1, step: 1, message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 50 } } },
    { type: 'job/registered', time: 1900, data: { jobId: 'j1', kind: 'bash', label: 'slow' } },
    { type: 'job/settled', time: 1950, data: { jobId: 'j1', status: 'failed' } },
    { type: 'assistant/attempt', time: 2000, data: { turn: 1, step: 2, stream: [] } },
    { type: 'turn/end', time: 2100, data: { turn: 1 } },
  ]
  writeSession(dir, 'session-main', { createdAt: 1000, cwd: '/studio', delegationDepth: 0, agentPreset: 'video-producer' }, mainEvents)
  const workerEvents = [
    { type: 'turn/start', time: 1250, data: { turn: 1 } },
    { type: 'step/start', time: 1251, data: { turn: 1, step: 1 } },
    { type: 'tool/call', time: 1300, data: { turn: 1, step: 1, callId: 'w-a', name: 'bash', arguments: '{"command":"worker"}' } },
    { type: 'tool/result', time: 1400, data: { turn: 1, step: 1, toolCallId: 'w-a', message: { isError: false } } },
    { type: 'assistant/message', time: 1450, data: { turn: 1, step: 1, message: { source: { provider: 'p', model: 'm' } }, usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, cacheReadTokens: 20 } } },
    { type: 'turn/end', time: 1500, data: { turn: 1 } },
  ]
  writeSession(dir, 'session-worker-1', { createdAt: 1250, cwd: '/studio', parentSession: 'session-main', delegationDepth: 1, agentPreset: 'video-scene-worker' }, workerEvents)
  return dir
}

test('metrics aggregate main and worker events with measured separation', (t) => {
  const sessionsDir = setup(t)
  const metrics = collectMetrics({ sessionsDir })
  assert.equal(metrics.sessions.length, 2)
  assert.equal(metrics.aggregate.sessionCount, 2)
  assert.equal(metrics.aggregate.mainSessions, 1)
  assert.equal(metrics.aggregate.workerSessions, 1)
  assert.equal(metrics.aggregate.toolCalls, 6)
  assert.equal(metrics.aggregate.toolExecutionMs, 650)
  assert.equal(metrics.aggregate.toolUnionMs, 450)
  assert.equal(metrics.aggregate.toolOverlapMs, 200)
  assert.equal(metrics.aggregate.multiAgentOverlapMs, 250)
  assert.equal(metrics.aggregate.modelCalls, 2)
  assert.equal(metrics.aggregate.inputTokens, 150)
  assert.equal(metrics.aggregate.outputTokens, 30)
  assert.equal(metrics.aggregate.totalTokens, 180)
  assert.equal(metrics.aggregate.cachedReadTokens, 70)
  assert.equal(metrics.aggregate.imageReads, 1)
  assert.equal(metrics.aggregate.failedToolCalls, 1)
  assert.equal(metrics.aggregate.failedJobs, 1)
  assert.equal(metrics.aggregate.retries, 2)
  assert.equal(metrics.aggregate.delegationDepthMax, 1)
  assert.equal(metrics.aggregate.concurrency.maxConcurrentWorkers, 1)
  assert.equal(metrics.aggregate.wallClockMs, 1100)
  assert.equal(metrics.sessions.find((session) => session.sessionId === 'worker-1').role, 'worker')
  assert.equal(metrics.measured, true)
  assert.equal(metrics.aggregate.cachedReadTokens !== null, true)
})

test('metrics selection follows parent sessions and is reproducible', (t) => {
  const sessionsDir = setup(t)
  const first = collectMetrics({ sessionsDir, sessionIds: ['main'] })
  const second = collectMetrics({ sessionsDir, sessionIds: ['main'] })
  assert.equal(first.sessions.length, 2)
  const strip = (value) => {
    const copy = JSON.parse(JSON.stringify(value))
    delete copy.generatedAt
    return copy
  }
  assert.deepEqual(strip(first), strip(second))
  const missing = collectMetrics({ sessionsDir, sessionIds: ['does-not-exist'] })
  assert.deepEqual(missing.selection.missingSessions, ['does-not-exist'])
  const byEpisode = collectMetrics({ sessionsDir, episode: '/virtual/ep-001' })
  assert.equal(byEpisode.sessions.length, 2)
  assert.equal(byEpisode.aggregate.workerSessions, 1)
})

test('missing usage and independent cache counters remain unavailable', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-missing-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  writeSession(dir, 'session-main', {}, [
    { type: 'assistant/message', time: 1, data: { usage: { cacheReadTokens: 5 } } },
    { type: 'assistant/message', time: 2, data: {} },
  ])
  const result = collectMetrics({ sessionsDir: dir })
  assert.equal(result.aggregate.modelCalls, 2)
  assert.equal(result.aggregate.inputTokens, null)
  assert.equal(result.aggregate.cachedReadTokens, null)
  assert.equal(result.aggregate.cachedWriteTokens, null)
  const dir2 = path.join(dir, 'other')
  writeSession(dir2, 'session-other', {}, [{ type: 'assistant/message', time: 1, data: { usage: { cacheReadTokens: 5 } } }])
  const separate = collectMetrics({ sessionsDir: dir2 })
  assert.equal(separate.aggregate.cachedReadTokens, 5)
  assert.equal(separate.aggregate.cachedWriteTokens, null)
})
