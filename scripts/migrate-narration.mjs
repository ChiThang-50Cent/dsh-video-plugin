#!/usr/bin/env node
/**
 * Safely scaffold schema-v2 narration artifacts for a legacy episode.
 *
 * It never edits narration.md, the old review or the old claim check. It writes
 * `*.migrating.json` files with the current hash and a blocked review; a reviewer
 * fills the through-line/claim/evidence, then renames the three files after a
 * real review. Legacy v1 `status: "pass"` is not re-certified by this tool.
 *
 * Usage:
 *   node scripts/migrate-narration.mjs <episode-dir> [--force] [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NARRATED_MODES, parseNarration, readProductionMode, sha256File } from './lib/narration-model.mjs'

function parseArgs(argv) {
  const args = { episode: undefined, force: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--force') args.force = true
    else if (value === '--json') args.json = true
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  return args
}

function writeJson(file, value, force) {
  if (fs.existsSync(file) && !force) throw new Error(`refusing to overwrite ${path.basename(file)} without --force`)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * @param {{ episodeDir: string, force?: boolean }} options
 */
export function migrateNarration(options) {
  const root = path.resolve(options.episodeDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`episode directory not found: ${root}`)
  const mode = readProductionMode(root)
  if (!NARRATED_MODES.has(mode.mode)) throw new Error(`mode "${mode.mode}" has no narration to migrate`)
  const narrationPath = path.join(root, 'narration.md')
  if (!fs.existsSync(narrationPath)) throw new Error(`narration.md not found in ${root}`)
  const narration = fs.readFileSync(narrationPath, 'utf8')
  const parsed = parseNarration(narration)
  if (parsed.normalizedSpoken.length === 0) throw new Error('narration has no spoken prose')
  const hash = sha256File(narrationPath)
  const production = fs.existsSync(path.join(root, 'production.json'))
    ? JSON.parse(fs.readFileSync(path.join(root, 'production.json'), 'utf8'))
    : {}
  const highRisk = production.narrationRisk === 'high' || production.qualitySensitive === true

  const throughlinePath = path.join(root, 'throughline-map.migrating.json')
  const claimPath = path.join(root, 'claim-check.migrating.json')
  const reviewPath = path.join(root, 'narration-review.migrating.json')
  writeJson(throughlinePath, {
    schemaVersion: 1,
    centralQuestion: '',
    promise: '',
    audience: '',
    sections: parsed.sections.map((section) => ({
      sectionId: section.sectionId,
      heading: section.heading,
      purpose: '',
      connectionToCentralQuestion: '',
      whyHere: '',
      audienceTakeaway: '',
      claimRefs: [],
    })),
  }, options.force)
  writeJson(claimPath, {
    schemaVersion: 2,
    status: 'PENDING',
    reviewedAt: null,
    coverage: { claimsExpected: null, justification: null },
    claims: [],
    conditions: [],
  }, options.force)
  writeJson(reviewPath, {
    schemaVersion: 2,
    narrationFile: 'narration.md',
    narrationSha256: hash,
    status: 'blocked',
    reviewedAt: null,
    reviewer: { kind: 'author', id: 'main-agent', method: 'draft', readFullScript: false },
    criteria: {
      accuracy: 'needs-work', audienceFit: 'needs-work', narrativeArc: 'needs-work', reasoning: 'needs-work',
      continuity: 'needs-work', spokenLanguage: 'needs-work', pacing: 'needs-work', styleAndOriginality: 'needs-work',
    },
    criteriaEvidence: {},
    blockers: ['Migrated from legacy v1 artifacts. Fill the through-line, claim evidence and cited review before renaming; this is not a PASS.'],
    actionableFindings: [],
    throughlineMap: 'throughline-map.json',
    claimCheckFile: 'claim-check.json',
    reviewPasses: 0,
    independentReview: { required: highRisk, status: 'missing' },
    revision: 1,
  }, options.force)
  return {
    episodeDir: root,
    narrationSha256: hash,
    mode: mode.mode,
    created: [path.basename(throughlinePath), path.basename(claimPath), path.basename(reviewPath)],
    next: 'Review the narration, fill the through-line and claims, rename the three files to their canonical names, then run validate-narration.mjs --gate.',
    note: 'The old narration.md, narration-review.json and claim-check.json were not modified.',
  }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/migrate-narration.mjs <episode-dir> [--force] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  try {
    const result = migrateNarration({ ...args, episodeDir: args.episode })
    if (args.json) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`Migration scaffolding written: ${result.created.join(', ')}`)
      console.log(`  hash: ${result.narrationSha256}`)
      console.log(`  ${result.next}`)
      console.log(`  ${result.note}`)
    }
  } catch (error) {
    console.error(`migrate-narration: ${error.message}`)
    process.exitCode = 2
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
