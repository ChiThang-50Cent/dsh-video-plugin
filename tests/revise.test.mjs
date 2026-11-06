import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseNarration } from '../scripts/lib/narration-model.mjs'
import { reviseNarration } from '../scripts/revise-narration.mjs'
import { validateNarration } from '../scripts/validate-narration.mjs'
import {
  buildClaims,
  buildReview,
  buildThroughline,
  makeEpisode,
  makeSegments,
  writeSegmentManifest,
} from './helpers/episode-fixtures.mjs'

const NARRATION = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'narration-negative.md'), 'utf8')
const CLAIMS = [
  { id: 'c01', claim: '3 + (-3) = 0', needle: 'ba cộng với âm ba bằng không', source: 'arithmetic', risk: 'low' },
  { id: 'c02', claim: '(-2)(-3)=6 follows from distributivity', needle: 'âm sáu cộng với tích của âm hai và âm ba phải bằng không', derivation: 'distributivity', risk: 'medium' },
]

function sha(value) {
  return createHash('sha256').update(value).digest('hex')
}

function setup(t) {
  const parsed = parseNarration(NARRATION)
  const claims = buildClaims(parsed, CLAIMS)
  const throughline = buildThroughline(parsed, { centralQuestion: 'Vì sao âm nhân âm lại thành dương?', claimIds: claims.claims.map((claim) => claim.id) })
  const review = buildReview(parsed, '0'.repeat(64), { claimRefs: claims.claims.map((claim) => claim.id) })
  const episode = makeEpisode(t, { narration: NARRATION, claims, throughline, review })
  const oldHash = sha(fs.readFileSync(path.join(episode.dir, 'narration.md')))
  writeSegmentManifest(episode.dir, makeSegments(parsed, oldHash, 3))
  fs.writeFileSync(path.join(episode.dir, 'storyboard.json'), JSON.stringify({ schemaVersion: 1, scenes: [] }))
  fs.writeFileSync(path.join(episode.dir, 'timeline.json'), JSON.stringify({ schemaVersion: 1, durationSec: null, scenes: [] }))
  fs.mkdirSync(path.join(episode.dir, 'audio', 'narration'), { recursive: true })
  fs.writeFileSync(path.join(episode.dir, 'audio', 'narration', 'seg-001.wav'), 'wav')
  return { episode, parsed, oldHash }
}

test('an intentional revision archives the old script and invalidates downstream artifacts', (t) => {
  const { episode, oldHash } = setup(t)
  assert.equal(validateNarration(episode.dir, { requireSegments: true }).ok, true)

  const next = path.join(episode.dir, 'next.md')
  fs.writeFileSync(next, `${NARRATION}\n\nMột câu kết mới.\n`)
  const result = reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Fix a factual nuance after review.' })
  assert.equal(result.revision, 2)
  assert.notEqual(result.narrationSha256, oldHash)
  assert.ok(fs.existsSync(path.join(episode.dir, result.archivedNarration)))
  assert.equal(fs.readFileSync(path.join(episode.dir, result.archivedNarration), 'utf8'), NARRATION)

  const reviewAfter = JSON.parse(fs.readFileSync(path.join(episode.dir, 'narration-review.json'), 'utf8'))
  assert.equal(reviewAfter.status, 'blocked')
  assert.equal(reviewAfter.narrationSha256, result.narrationSha256)
  assert.equal(reviewAfter.revision, 2)
  assert.match(reviewAfter.blockers.join('\n'), /revised intentionally/)

  assert.equal(fs.existsSync(path.join(episode.dir, 'audio', 'segments.json')), false)
  assert.ok(fs.existsSync(path.join(episode.dir, 'audio', `segments.superseded-rev001-${oldHash.slice(0, 12)}.json`)))
  assert.equal(JSON.parse(fs.readFileSync(path.join(episode.dir, 'timeline.json'), 'utf8')).stale, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(episode.dir, 'audio', 'manifest.json'), 'utf8')).stale, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(episode.dir, 'claim-check.json'), 'utf8')).status, 'PENDING')
  assert.equal(JSON.parse(fs.readFileSync(path.join(episode.dir, 'throughline-map.json'), 'utf8')).stale, true)
  assert.equal(fs.readFileSync(path.join(episode.dir, 'audio', 'narration', 'seg-001.wav'), 'utf8'), 'wav')

  const gate = validateNarration(episode.dir)
  assert.equal(gate.ok, false)
  assert.match(gate.errors.join('\n'), /status is "blocked"|review hash does not match|segment manifest is required/)
})

test('byte-identical or released revisions are refused without explicit authorization', (t) => {
  const { episode } = setup(t)
  const same = path.join(episode.dir, 'same.md')
  fs.writeFileSync(same, NARRATION)
  assert.throws(() => reviseNarration({ episodeDir: episode.dir, from: same, reason: 'No change.' }), /byte-identical/)

  fs.mkdirSync(path.join(episode.dir, 'exports'), { recursive: true })
  fs.writeFileSync(path.join(episode.dir, 'exports', 'master.mp4'), 'released master')
  const next = path.join(episode.dir, 'next.md')
  fs.writeFileSync(next, `${NARRATION}\n\nNew ending.\n`)
  assert.throws(() => reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Try without permission.' }), /released master|--allow-released/)
  const result = reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Authorized revision.', allowReleased: true })
  assert.equal(result.releasedMaster, 'exports/master.mp4')
  assert.equal(fs.readFileSync(path.join(episode.dir, 'exports', 'master.mp4'), 'utf8'), 'released master')
  const marker = JSON.parse(fs.readFileSync(path.join(episode.dir, 'exports', 'master.stale.json'), 'utf8'))
  assert.equal(marker.stale, true)
  assert.equal(marker.master, 'exports/master.mp4')
  assert.equal(marker.previousNarrationSha256.length, 64)
})

test('revise-narration accepts an episode directory', (t) => {
  const { episode } = setup(t)
  const next = path.join(episode.dir, 'next.md')
  fs.writeFileSync(next, `${NARRATION}\nNew ending.\n`)
  const revise = spawnSync(process.execPath, ['scripts/revise-narration.mjs', episode.dir, '--from', next, '--reason', 'Correction', '--json'], { encoding: 'utf8' })
  assert.equal(revise.status, 0, revise.stderr)
  assert.equal(JSON.parse(revise.stdout).reviewStatus, 'blocked')
})

test('all supported released masters require authorization and are marked stale', (t) => {
  for (const [kind, relative] of [['default', 'exports/master.mov'], ['production', 'custom/final.mov'], ['timeline', 'custom/timeline.webm']]) {
    const { episode } = setup(t)
    const file = path.join(episode.dir, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'master')
    if (kind !== 'default') {
      const config = path.join(episode.dir, `${kind}.json`)
      const data = JSON.parse(fs.readFileSync(config, 'utf8'))
      data.finalOutput = relative
      fs.writeFileSync(config, JSON.stringify(data))
    }
    const next = path.join(episode.dir, 'next.md')
    fs.writeFileSync(next, `${NARRATION}\nNew ending.\n`)
    assert.throws(() => reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction' }), /released master/)
    reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction', allowReleased: true })
    assert.equal(JSON.parse(fs.readFileSync(path.join(episode.dir, 'exports/master.stale.json'))).master, relative)
  }
})

test('revision protects all existing masters when the configured output is missing', (t) => {
  const { episode } = setup(t)
  const productionPath = path.join(episode.dir, 'production.json')
  const production = JSON.parse(fs.readFileSync(productionPath, 'utf8'))
  production.finalOutput = 'exports/master-v2.mp4'
  fs.writeFileSync(productionPath, JSON.stringify(production))
  fs.mkdirSync(path.join(episode.dir, 'exports'), { recursive: true })
  for (const name of ['master.mp4', 'master.mov', 'master.webm']) {
    fs.writeFileSync(path.join(episode.dir, 'exports', name), 'released master')
  }
  const next = path.join(episode.dir, 'next.md')
  fs.writeFileSync(next, `${NARRATION}\nNew ending.\n`)
  assert.throws(() => reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction' }), /released master/)
  const result = reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction', allowReleased: true })
  const marker = JSON.parse(fs.readFileSync(path.join(episode.dir, 'exports/master.stale.json'), 'utf8'))
  assert.equal(result.releasedMaster, 'exports/master.mp4')
  assert.equal(marker.master, 'exports/master.mp4')
  assert.deepEqual(marker.masters, ['exports/master.mp4', 'exports/master.mov', 'exports/master.webm'])
})

test('revision records the configured master alongside default masters without duplicates', (t) => {
  const { episode } = setup(t)
  const productionPath = path.join(episode.dir, 'production.json')
  const production = JSON.parse(fs.readFileSync(productionPath, 'utf8'))
  production.finalOutput = 'exports/custom.mp4'
  fs.writeFileSync(productionPath, JSON.stringify(production))
  fs.mkdirSync(path.join(episode.dir, 'exports'), { recursive: true })
  for (const name of ['custom.mp4', 'master.mp4']) {
    fs.writeFileSync(path.join(episode.dir, 'exports', name), 'released master')
  }
  const next = path.join(episode.dir, 'next.md')
  fs.writeFileSync(next, `${NARRATION}\nNew ending.\n`)
  assert.throws(() => reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction' }), /released master/)
  reviseNarration({ episodeDir: episode.dir, from: next, reason: 'Correction', allowReleased: true })
  const marker = JSON.parse(fs.readFileSync(path.join(episode.dir, 'exports/master.stale.json'), 'utf8'))
  assert.equal(marker.master, 'exports/custom.mp4')
  assert.deepEqual(marker.masters, ['exports/custom.mp4', 'exports/master.mp4'])
})
