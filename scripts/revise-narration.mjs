#!/usr/bin/env node
/**
 * Make one intentional narration revision and invalidate everything downstream.
 *
 * This is the only supported way to change a frozen script. It is deliberately
 * not silent:
 *   - the previous bytes are archived under `narration-revisions/`;
 *   - the review becomes `blocked` with the new hash and a reason;
 *   - the old TTS segment manifest is moved aside (never deleted);
 *   - storyboard, timeline and audio manifest are marked stale;
 *   - a released master is protected unless `--allow-released` is explicit.
 *
 * Usage:
 *   node scripts/revise-narration.mjs <episode-dir> --from <new-narration.md> --reason "<why>" [--allow-released] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NARRATED_MODES, isPlainObject, readProductionMode, sha256File, sha256Text } from './lib/narration-model.mjs'
import { findMaster } from './lib/episode-artifacts.mjs'

function parseArgs(argv) {
  const args = { episode: undefined, from: undefined, reason: undefined, allowReleased: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--from') {
      index += 1
      if (argv[index] === undefined) throw new Error('--from needs a file')
      args.from = argv[index]
    } else if (value === '--reason') {
      index += 1
      if (argv[index] === undefined) throw new Error('--reason needs text')
      args.reason = argv[index]
    } else if (value === '--allow-released') args.allowReleased = true
    else if (value === '--json') args.json = true
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  if (args.from === undefined) throw new Error('missing --from <new-narration.md>')
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) throw new Error('missing --reason "<why the approved script changes>"')
  return args
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temp, file)
}

function atomicCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const temp = `${destination}.tmp-${process.pid}-${Date.now()}`
  fs.copyFileSync(source, temp)
  fs.renameSync(temp, destination)
}

function markStale(file, fields) {
  if (!fs.existsSync(file)) return false
  let value
  try {
    value = readJson(file)
  } catch {
    return false
  }
  if (!isPlainObject(value)) return false
  writeJson(file, { ...value, stale: true, staleAt: new Date().toISOString(), ...fields })
  return true
}

/**
 * @param {{ episodeDir: string, from: string, reason: string, allowReleased?: boolean }} options
 */
export function reviseNarration(options) {
  const root = path.resolve(options.episodeDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`episode directory not found: ${root}`)
  const modeInfo = readProductionMode(root)
  if (!NARRATED_MODES.has(modeInfo.mode)) throw new Error(`episode mode "${modeInfo.mode}" has no narration to revise`)
  const narrationPath = path.join(root, 'narration.md')
  const reviewPath = path.join(root, 'narration-review.json')
  if (!fs.existsSync(narrationPath)) throw new Error(`narration.md not found in ${root}`)
  if (!fs.existsSync(options.from)) throw new Error(`replacement file not found: ${options.from}`)

  const newRaw = fs.readFileSync(options.from)
  if (newRaw.length === 0) throw new Error('replacement narration is empty')
  const oldSha = sha256File(narrationPath)
  const newSha = sha256Text(newRaw.toString('utf8'))
  if (oldSha === newSha) throw new Error('replacement narration is byte-identical; no revision was made')

  const production = fs.existsSync(path.join(root, 'production.json')) ? readJson(path.join(root, 'production.json')) : {}
  const timeline = fs.existsSync(path.join(root, 'timeline.json')) ? readJson(path.join(root, 'timeline.json')) : {}
  const released = findMaster(root, production, timeline)?.path
  if (released !== undefined && options.allowReleased !== true) {
    throw new Error(`a released master exists (${path.relative(root, released)}); pass --allow-released and version the master before changing the approved narration`)
  }

  const review = fs.existsSync(reviewPath) ? readJson(reviewPath) : {}
  const revision = (Number.isInteger(review.revision) ? review.revision : 1) + 1
  const now = new Date().toISOString()
  const revisionsDir = path.join(root, 'narration-revisions')
  fs.mkdirSync(revisionsDir, { recursive: true })
  const archive = path.join(revisionsDir, `rev-${String(review.revision ?? 1).padStart(3, '0')}-${oldSha.slice(0, 12)}.md`)
  if (!fs.existsSync(archive)) atomicCopy(narrationPath, archive)
  const reviewArchive = path.join(revisionsDir, `rev-${String(review.revision ?? 1).padStart(3, '0')}-review-${oldSha.slice(0, 12)}.json`)
  if (fs.existsSync(reviewPath) && !fs.existsSync(reviewArchive)) atomicCopy(reviewPath, reviewArchive)

  const tempNarration = `${narrationPath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tempNarration, newRaw)
  fs.renameSync(tempNarration, narrationPath)

  const invalidated = []
  const segmentsPath = path.join(root, 'audio', 'segments.json')
  if (fs.existsSync(segmentsPath)) {
    const destination = path.join(root, 'audio', `segments.superseded-rev${String(review.revision ?? 1).padStart(3, '0')}-${oldSha.slice(0, 12)}.json`)
    if (!fs.existsSync(destination)) fs.renameSync(segmentsPath, destination)
    invalidated.push(path.relative(root, destination))
  }
  for (const [relative, fields] of [
    ['throughline-map.json', { staleReason: 'narration revised intentionally; re-check each section purpose/connection against the new text' }],
    ['claim-check.json', { status: 'PENDING', staleReason: 'narration revised intentionally; re-audit every claim against the new text' }],
    ['storyboard.json', { staleReason: 'narration revised intentionally; re-check segment spans and beat mapping' }],
    ['timeline.json', { staleReason: 'narration revised intentionally; rebuild after new measured audio' }],
    [path.join('audio', 'manifest.json'), { staleReason: 'narration revised intentionally; reuse only chunks whose fingerprint matches' }],
  ]) {
    if (markStale(path.join(root, relative), { narrationSha256: oldSha, revision, ...fields })) invalidated.push(relative)
  }
  if (released !== undefined) {
    const marker = path.join(root, 'exports', 'master.stale.json')
    fs.mkdirSync(path.dirname(marker), { recursive: true })
    writeJson(marker, {
      stale: true,
      reason: 'narration revised intentionally; the existing master was built from the previous approved script',
      master: path.relative(root, released),
      previousNarrationSha256: oldSha,
      newNarrationSha256: newSha,
      revision,
      revisedAt: now,
      next: 'Render a new master, run release QA, then remove this marker. The old master is preserved.',
    })
    invalidated.push(path.relative(root, marker))
  }

  const newReview = {
    ...(isPlainObject(review) ? review : {}),
    schemaVersion: 2,
    narrationFile: 'narration.md',
    narrationSha256: newSha,
    status: 'blocked',
    reviewedAt: null,
    reviewer: {
      ...(isPlainObject(review.reviewer) ? review.reviewer : {}),
      kind: 'author',
      id: 'main-agent',
      method: 'draft',
      readFullScript: false,
    },
    criteria: {
      accuracy: 'needs-work',
      audienceFit: 'needs-work',
      narrativeArc: 'needs-work',
      reasoning: 'needs-work',
      continuity: 'needs-work',
      spokenLanguage: 'needs-work',
      pacing: 'needs-work',
      styleAndOriginality: 'needs-work',
    },
    criteriaEvidence: {},
    blockers: [`Narration was revised intentionally (${options.reason.trim()}); claims, through-line and editorial review must be redone.`],
    actionableFindings: [],
    reviewPasses: 0,
    independentReview: { required: review.independentReview?.required === true, status: 'missing' },
    revision,
    revisionReason: options.reason.trim(),
    previousRevisionSha256: oldSha,
    revisedAt: now,
    revisions: [
      ...(Array.isArray(review.revisions) ? review.revisions : []),
      ...(review.status === undefined ? [] : [{
        revision: review.revision ?? 1,
        narrationSha256: oldSha,
        status: review.status,
        archivedNarration: path.relative(root, archive),
        archivedReview: fs.existsSync(reviewArchive) ? path.relative(root, reviewArchive) : null,
        reason: options.reason.trim(),
        revisedAt: now,
      }]),
    ],
  }
  writeJson(reviewPath, newReview)

  return {
    episodeDir: root,
    previousSha256: oldSha,
    narrationSha256: newSha,
    revision,
    archivedNarration: path.relative(root, archive),
    invalidated,
    releasedMaster: released === undefined ? null : path.relative(root, released),
    reviewStatus: newReview.status,
  }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/revise-narration.mjs <episode-dir> --from <new-narration.md> --reason "<why>" [--allow-released] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  try {
    const result = reviseNarration({ ...args, episodeDir: args.episode })
    if (args.json) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`Revised narration: revision ${result.revision}`)
      console.log(`  old sha256: ${result.previousSha256}`)
      console.log(`  new sha256: ${result.narrationSha256}`)
      console.log(`  archived: ${result.archivedNarration}`)
      console.log(`  review: ${result.reviewStatus} (G0 must be redone)`)
      if (result.invalidated.length > 0) console.log(`  invalidated: ${result.invalidated.join(', ')}`)
    }
  } catch (error) {
    console.error(`revise-narration: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
