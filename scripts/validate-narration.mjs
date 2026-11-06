#!/usr/bin/env node
/**
 * Deterministic G0 gate for a video episode's narration.
 *
 * Two gates exist and mean different things:
 *
 *   --integrity   Mechanical integrity: schemas, hashes, references, required
 *                 fields, claim structure/locations, through-line coverage,
 *                 review evidence locations and exact TTS segment coverage.
 *   --editorial   Content/editorial trust: the review is evidence-based, cites
 *                 the whole script, resolves its findings, covers high-risk
 *                 claims, and addresses high-confidence editorial issues.
 *   --gate        Both (default). A PASS requires both.
 *
 * Neither deterministic mode proves that a factual or mathematical statement is
 * true. `narration-review.json` records the semantic review and its evidence;
 * high-risk work must use an independent reviewer.
 *
 * Usage:
 *   node scripts/validate-narration.mjs <episode-dir> [--integrity|--editorial|--gate]
 *        [--segments <file>] [--require-segments] [--json]
 *
 * Exit codes: 0 pass, 1 gate/content failure, 2 usage or unreadable input.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CRITERIA,
  NARRATED_MODES,
  extractSpokenProse,
  normalizeText,
  sha256File,
} from './lib/narration-model.mjs'
import {
  loadNarrationEpisode,
  validateNarrationIntegrity,
} from './lib/narration-integrity.mjs'
import { validateNarrationEditorial } from './lib/narration-editorial.mjs'
import { resolveProductionMode } from './lib/episode-artifacts.mjs'
export { CRITERIA, extractSpokenProse, sha256File }
export { loadNarrationEpisode, validateNarrationIntegrity, validateNarrationEditorial }

/** @param {string} text */
export function normalizeSpoken(text) {
  return normalizeText(text)
}

function dedupe(list) {
  return [...new Set(list)]
}

/**
 * Validate one episode's narration gate.
 * @param {string} episodeDir
 * @param {{
 *   segments?: string,
 *   requireSegments?: boolean,
 *   mode?: 'gate'|'integrity'|'editorial'
 * }} [options]
 */
export function validateNarration(episodeDir, options = {}) {
  const mode = options.mode ?? 'gate'
  if (!['gate', 'integrity', 'editorial'].includes(mode)) {
    throw new Error(`unknown narration gate mode: ${mode}`)
  }
  const context = loadNarrationEpisode(episodeDir)
  context.mode = resolveProductionMode(context.root, options.productionMode).mode
  const integrity = mode === 'editorial'
    ? undefined
    : validateNarrationIntegrity(context, { segments: options.segments, requireSegments: options.requireSegments })
  const editorial = mode === 'integrity'
    ? undefined
    : validateNarrationEditorial(context, { segments: options.segments, requireSegments: options.requireSegments })

  const errors = dedupe([...(integrity?.errors ?? []), ...(editorial?.errors ?? [])])
  const warnings = dedupe([...(integrity?.warnings ?? []), ...(editorial?.warnings ?? [])])
  const integrityData = integrity?.data ?? {}
  const data = {
    episodeDir: context.root,
    mode: context.mode,
    narrationFile: integrityData.narrationFile ?? (context.narrationExists ? path.relative(context.root, context.narrationPath) : context.narrationName),
    sha256: context.sha256,
    spokenChars: integrityData.spokenChars,
    spokenWords: integrityData.spokenWords,
    sections: integrityData.sections,
    reviewStatus: context.review?.status,
    reviewSchemaVersion: context.review?.schemaVersion,
    claimStatus: context.claims?.status,
    claimCount: integrityData.claimCount,
    segments: integrityData.segments,
    integrity: integrity === undefined ? undefined : { ok: integrity.ok, errors: integrity.errors, warnings: integrity.warnings, data: integrity.data },
    editorial: editorial === undefined ? undefined : { ok: editorial.ok, errors: editorial.errors, warnings: editorial.warnings, data: editorial.data },
    gate: mode,
    caveat: 'Deterministic checks enforce structure, identity and evidence presence. They do not prove prose quality or mathematical truth.',
  }
  return {
    ok: (integrity?.ok ?? true) && (editorial?.ok ?? true),
    errors,
    warnings,
    data,
  }
}

function parseArgs(argv) {
  const args = { json: false, segments: undefined, requireSegments: false, episode: undefined, mode: 'gate' }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--require-segments') args.requireSegments = true
    else if (value === '--integrity') args.mode = 'integrity'
    else if (value === '--editorial') args.mode = 'editorial'
    else if (value === '--gate') args.mode = 'gate'
    else if (value === '--segments') {
      index += 1
      if (argv[index] === undefined) throw new Error('--segments needs a file path')
      args.segments = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/validate-narration.mjs <episode-dir> [--gate|--integrity|--editorial] [--segments <file>] [--require-segments] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = validateNarration(args.episode, { segments: args.segments, requireSegments: args.requireSegments, mode: args.mode })
  } catch (error) {
    console.error(`validate-narration: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const { data } = result
    console.log(`Narration gate (${args.mode}): ${data.episodeDir ?? args.episode}`)
    if (data.mode !== undefined) console.log(`  production mode: ${data.mode}${NARRATED_MODES.has(data.mode) ? '' : ' (no narration gate)'}`)
    if (data.spokenChars !== undefined) console.log(`  narration: ${data.spokenChars} spoken characters, ${data.sections ?? 0} section(s), sha256 ${data.sha256 ?? 'unknown'}`)
    console.log(`  review: ${data.reviewStatus ?? 'missing'} (schema ${data.reviewSchemaVersion ?? 'missing'})`)
    console.log(`  claims: ${data.claimStatus ?? 'missing'} (${data.claimCount ?? 0})`)
    console.log(`  segments: ${data.segments === undefined ? 'not checked' : `${data.segments.count} in ${data.segments.path}, ${data.segments.overrides} override(s)`}`)
    if (data.integrity !== undefined) console.log(`  mechanical integrity: ${data.integrity.ok ? 'PASS' : 'FAIL'}`)
    if (data.editorial !== undefined) console.log(`  editorial evidence: ${data.editorial.ok ? 'PASS' : 'FAIL'}`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    console.log(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`)
    if (data.caveat !== undefined) console.log(`NOTE: ${data.caveat}`)
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
