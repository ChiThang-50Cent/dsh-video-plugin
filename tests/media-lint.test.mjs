import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseSrt, qaMedia } from '../scripts/qa-media.mjs'
import { parseNarration } from '../scripts/lib/narration-model.mjs'
import { lintParsed } from '../scripts/lint-narration.mjs'

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-media-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('SRT validation catches ordering, empty text and duration overruns', () => {
  const valid = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nXin chào\n\n2\n00:00:01,100 --> 00:00:02,000\nTạm biệt\n', 3)
  assert.equal(valid.ok, true)
  assert.equal(valid.cues.length, 2)

  const overlapping = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:00,500 --> 00:00:01,500\nB\n', 3)
  assert.equal(overlapping.ok, true)
  assert.match(overlapping.warnings.join('\n'), /overlaps/)

  const broken = parseSrt('1\n00:00:00,000 --> 00:00:01,000\n\n2\n00:00:05,000 --> 00:00:04,000\nB\n', 3)
  assert.equal(broken.ok, false)
  assert.match(broken.errors.join('\n'), /no subtitle text|ends before|after the film/)
})

test('metadata QA is separate from optional quality QA', (t) => {
  const dir = temp(t)
  const video = path.join(dir, 'tiny.mp4')
  if (spawnSync('ffprobe', ['-version']).status !== 0) {
    t.skip('ffprobe unavailable')
    return
  }
  const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1', '-r', '30', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8' })
  if (made.status !== 0) {
    t.skip('ffmpeg unavailable')
    return
  }
  const metadata = qaMedia(video, { width: 320, height: 180, fps: 30, allowNoAudio: true })
  assert.equal(metadata.ok, true, metadata.errors.join('\n'))
  assert.equal(metadata.mode, 'metadata')
  assert.equal(metadata.checks.quality.status, 'NOT_RUN')
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/)

  const quality = qaMedia(video, { width: 320, height: 180, fps: 30, allowNoAudio: true, quality: true })
  assert.equal(quality.mode, 'metadata+quality')
  assert.ok(quality.checks.quality.checks.some((check) => check.id === 'video.frozen-frames'))
  assert.ok(quality.checks.quality.checks.some((check) => check.id === 'audio.clipping'))
})

test('loudness checks integrated and true peak limits including boundaries', (t) => {
  const dir = temp(t)
  const video = path.join(dir, 'tone.mp4')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=2',
    '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'mpeg4', '-c:a', 'aac', '-y', video]).status, 0)
  const initial = qaMedia(video).checks.loudness
  assert.equal(initial.status, 'FAIL')
  const i = initial.measuredIntegratedLufs
  const p = initial.measuredTruePeakDbtp
  assert.ok(Number.isFinite(i) && Number.isFinite(p) && Number.isFinite(initial.measuredLra))
  const check = (target) => qaMedia(video, { loudness: target }).checks.loudness.status
  assert.equal(check({ integratedLufs: i + 2, truePeakDbtp: p - 0.5, toleranceLu: 2 }), 'PASS')
  assert.equal(check({ integratedLufs: i + 2.1, truePeakDbtp: p, toleranceLu: 2 }), 'FAIL')
  assert.equal(check({ integratedLufs: i - 2.1, truePeakDbtp: p, toleranceLu: 2 }), 'FAIL')
  assert.equal(check({ integratedLufs: i, truePeakDbtp: p - 0.6, toleranceLu: 2 }), 'FAIL')
})

test('narration lint flags filler, visual deixis, raw LaTeX and the algebra anti-patterns without claiming G0', () => {
  const parsed = parseNarration('# Mở\n\nNhư bạn thấy, rõ ràng đây là một điều rất đơn giản. Ta có $\\frac{1}{2}$ trong câu nói.\n')
  const result = lintParsed(parsed)
  assert.equal(result.errors.length > 0, true)
  assert.match(result.errors.join('\n'), /raw LaTeX|visual-only deixis/)
  assert.match(result.warnings.join('\n'), /filler/)
  const algebra = parseNarration(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'editorial', 'algebra-la-gi', 'narration.md'), 'utf8'))
  const algebraLint = lintParsed(algebra, { centralQuestion: 'Đại số là gì?' })
  assert.ok(algebraLint.heuristic.some((item) => item.code === 'opening.meta-greeting'))
})

test('unavailable media scans cannot pass quality or strict audio QA', (t) => {
  const dir = temp(t)
  const video = path.join(dir, 'tiny.mp4')
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=1', '-c:v', 'mpeg4', '-y', video]).status, 0)
  const ffprobe = spawnSync('which', ['ffprobe'], { encoding: 'utf8' }).stdout.trim()
  fs.symlinkSync(ffprobe, path.join(dir, 'ffprobe'))
  const run = spawnSync(process.execPath, [path.resolve('scripts/qa-media.mjs'), video, '--allow-no-audio', '--quality', '--strict-audio', '--json'], {
    encoding: 'utf8', env: { ...process.env, PATH: dir },
  })
  assert.notEqual(run.status, 0)
  const report = JSON.parse(run.stdout)
  assert.equal(report.checks.quality.status, 'UNAVAILABLE')
})
