#!/usr/bin/env node
/**
 * Deterministic G0 gate for a video episode's narration.
 *
 * It verifies the review document, the frozen hash, the claim check and, when
 * the audio step has planned segments, that the segment concatenation
 * reproduces the spoken prose exactly. It does not judge prose quality; the
 * model review in narration-review.json owns that.
 *
 * Usage:
 *   node scripts/validate-narration.mjs <episode-dir> [--segments <file>] [--require-segments] [--json]
 *
 * Exit codes: 0 pass, 1 gate/content failure, 2 usage or unreadable input.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const CRITERIA = [
  'accuracy',
  'audienceFit',
  'narrativeArc',
  'reasoning',
  'continuity',
  'spokenLanguage',
  'pacing',
  'styleAndOriginality',
]

/** @param {string} value */
const lower = (value) => String(value ?? '').trim().toLowerCase()

/** @param {string} text */
export function normalizeSpoken(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[*_`]/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

/**
 * Extract the spoken prose from narration markdown.
 * Non-spoken: frontmatter, ATX headings, blockquotes, fenced code, HTML
 * comments and horizontal rules.
 * @param {string} markdown
 * @returns {string}
 */
export function extractSpokenProse(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  const spoken = []
  let fence = null
  let inComment = false
  let index = 0

  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1)
    if (end !== -1) index = end + 1
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (inComment) {
      if (trimmed.includes('-->')) inComment = false
      continue
    }
    if (fence !== null) {
      if (trimmed.startsWith(fence)) fence = null
      continue
    }
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) inComment = true
      continue
    }
    const fenceMatch = /^(```|~~~)/.exec(trimmed)
    if (fenceMatch !== null) {
      fence = fenceMatch[1]
      continue
    }
    if (/^#{1,6}\s/.test(trimmed)) continue
    if (trimmed.startsWith('>')) continue
    if (/^([-*_])\1{2,}$/.test(trimmed)) continue

    spoken.push(line)
  }

  return spoken
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** @param {string} file */
export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
}

function resolveInside(root, relative, label, errors) {
  const absolute = path.resolve(root, String(relative))
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    errors.push(`${label} "${relative}" resolves outside the episode directory`)
    return undefined
  }
  return absolute
}

function readJson(file, label, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`${label} is not readable JSON (${file}): ${error.message}`)
    return undefined
  }
}

function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index += 1
  return index
}

function describeMismatch(expected, actual) {
  const index = firstDifference(expected, actual)
  const start = Math.max(0, index - 40)
  const end = Math.min(Math.max(expected.length, actual.length), index + 40)
  return {
    index,
    expected: expected.slice(start, end),
    actual: actual.slice(start, end),
  }
}

function rawLatexIssue(text) {
  if (/\\[A-Za-z]+/.test(text)) return 'backslash LaTeX command in spoken text'
  if (/\$\$[^$]+\$\$/.test(text)) return 'display-math $$...$$ in spoken text'
  return undefined
}

/**
 * Validate one episode's narration gate.
 * @param {string} episodeDir
 * @param {{ segments?: string, requireSegments?: boolean }} [options]
 */
export function validateNarration(episodeDir, options = {}) {
  const errors = []
  const warnings = []
  const root = path.resolve(episodeDir)
  let rootStat
  try {
    rootStat = statSync(root)
  } catch {
    throw new Error(`episode directory not found: ${root}`)
  }
  if (!rootStat.isDirectory()) throw new Error(`not a directory: ${root}`)

  const reviewPath = path.join(root, 'narration-review.json')
  let review
  if (!existsSync(reviewPath)) {
    errors.push('narration-review.json is missing; the G0 review must exist before audio')
  } else {
    review = readJson(reviewPath, 'narration-review.json', errors)
  }

  const narrationName = review?.narrationFile ?? 'narration.md'
  const narrationPath = resolveInside(root, narrationName, 'narrationFile', errors)
  if (narrationPath === undefined || !existsSync(narrationPath)) {
    errors.push(`narration file not found: ${narrationName}`)
    return { ok: false, errors, warnings, data: {} }
  }
  const narrationRaw = readFileSync(narrationPath, 'utf8')
  const sha256 = sha256File(narrationPath)
  const spokenRaw = extractSpokenProse(narrationRaw)
  const spoken = normalizeSpoken(spokenRaw)

  if (spoken.length === 0) errors.push('narration has no spoken prose after removing headings, notes and display blocks')
  if (spoken.length > 0 && spoken.length < 200) warnings.push(`spoken prose is very short (${spoken.length} characters)`)
  const latex = rawLatexIssue(spoken)
  if (latex !== undefined) errors.push(`${latex}; write the spoken form and keep display math in a fenced block`)

  if (review !== undefined) {
    if (review.schemaVersion !== 1) warnings.push(`review schemaVersion is ${JSON.stringify(review.schemaVersion)}; expected 1`)
    if (lower(review.status) !== 'pass') {
      errors.push(`review status is "${review.status ?? 'missing'}"; expected "pass"`)
    }
    if (!isSha256(review.narrationSha256)) {
      errors.push('review narrationSha256 is missing or not a SHA-256 hex digest')
    } else if (review.narrationSha256.toLowerCase() !== sha256) {
      errors.push(`review hash does not match narration.md (review ${review.narrationSha256.slice(0, 12)}..., file ${sha256.slice(0, 12)}...)`)
    }
    const criteria = review.criteria
    if (criteria === null || typeof criteria !== 'object') {
      errors.push('review criteria is missing')
    } else {
      for (const key of CRITERIA) {
        if (criteria[key] === undefined) errors.push(`review criteria.${key} is missing`)
        else if (lower(criteria[key]) !== 'pass') errors.push(`review criteria.${key} is "${criteria[key]}"; expected "pass"`)
      }
    }
    if (!Array.isArray(review.blockers)) errors.push('review blockers must be an array')
    else if (review.blockers.length > 0) {
      errors.push(`review has ${review.blockers.length} blocker(s): ${review.blockers.slice(0, 3).join(' | ')}`)
    }
    if (review.reviewPasses !== undefined && (typeof review.reviewPasses !== 'number' || review.reviewPasses < 0)) {
      errors.push('review reviewPasses must be a non-negative number')
    } else if (review.reviewPasses > 2) {
      warnings.push(`review reviewPasses is ${review.reviewPasses}; default budget is one draft, one editorial pass and one targeted fix`)
    }
  }

  let claimCount = 0
  let claimStatus
  const claimName = review?.claimCheckFile ?? 'claim-check.json'
  const claimPath = resolveInside(root, claimName, 'claimCheckFile', errors)
  if (claimPath === undefined || !existsSync(claimPath)) {
    errors.push(`claim check file not found: ${claimName}`)
  } else {
    const claim = readJson(claimPath, 'claim-check.json', errors)
    if (claim !== undefined) {
      claimStatus = claim.status ?? 'missing'
      if (lower(claim.status) !== 'pass') {
        errors.push(`claim-check status is "${claim.status ?? 'missing'}"; expected "PASS"`)
      }
      if (claim.claims !== undefined && !Array.isArray(claim.claims)) {
        errors.push('claim-check claims must be an array')
      } else {
        for (const item of claim.claims ?? []) {
          claimCount += 1
          const label = String(item?.claim ?? `claim #${claimCount}`).slice(0, 80)
          const unverified = item?.verified === false || (item?.status !== undefined && lower(item.status) !== 'pass')
          if (!unverified) continue
          const highRisk = item?.critical === true
            || ['high', 'critical'].includes(lower(item?.risk))
            || ['high', 'critical'].includes(lower(item?.severity))
          if (highRisk) errors.push(`unverified high-risk claim: "${label}"`)
          else warnings.push(`unverified low-risk claim: "${label}"`)
        }
      }
    }
  }

  let segmentData
  const explicitSegments = typeof options.segments === 'string' && options.segments.length > 0
  const segmentsPath = explicitSegments
    ? path.resolve(root, options.segments)
    : path.join(root, 'audio', 'segments.json')
  if (options.requireSegments === true && !existsSync(segmentsPath)) {
    errors.push(`segment manifest is required but missing: ${path.relative(root, segmentsPath) || segmentsPath}`)
  } else if (existsSync(segmentsPath)) {
    const manifest = readJson(segmentsPath, 'audio/segments.json', errors)
    if (manifest !== undefined) {
      if (manifest.schemaVersion !== 1) warnings.push(`segments schemaVersion is ${JSON.stringify(manifest.schemaVersion)}; expected 1`)
      if (!isSha256(manifest.narrationSha256)) {
        errors.push('segments narrationSha256 is missing or not a SHA-256 hex digest')
      } else if (manifest.narrationSha256.toLowerCase() !== sha256) {
        errors.push('segments were built from a different narration hash')
      }
      const segments = Array.isArray(manifest.segments) ? manifest.segments : undefined
      if (segments === undefined || segments.length === 0) {
        errors.push('segment manifest has no segments')
      } else {
        const ids = new Set()
        const texts = []
        for (const [index, segment] of segments.entries()) {
          const id = segment?.id
          if (typeof id !== 'string' || id.length === 0) errors.push(`segment #${index + 1} has no id`)
          else if (ids.has(id)) errors.push(`duplicate segment id: ${id}`)
          else ids.add(id)
          if (typeof segment?.text !== 'string' || segment.text.trim().length === 0) {
            errors.push(`segment ${id ?? `#${index + 1}`} has no text`)
            continue
          }
          const segmentLatex = rawLatexIssue(segment.text)
          if (segmentLatex !== undefined) errors.push(`segment ${id ?? `#${index + 1}`}: ${segmentLatex}`)
          if (segment.spokenText !== undefined && (typeof segment.spokenText !== 'string' || segment.spokenText.trim().length === 0)) {
            errors.push(`segment ${id ?? `#${index + 1}`} spokenText must be a non-empty string when present`)
          }
          texts.push(normalizeSpoken(segment.text))
        }
        const joined = normalizeSpoken(texts.join(' '))
        if (joined !== spoken) {
          const mismatch = describeMismatch(spoken, joined)
          errors.push(
            `segment coverage does not match the frozen spoken prose at character ${mismatch.index}; `
            + `narration: "${mismatch.expected}"; segments: "${mismatch.actual}"`,
          )
        }
        segmentData = { path: path.relative(root, segmentsPath) || segmentsPath, count: segments.length }
      }
    }
  } else if (explicitSegments) {
    errors.push(`segment manifest not found: ${path.relative(root, segmentsPath)}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      episodeDir: root,
      narrationFile: path.relative(root, narrationPath),
      sha256,
      spokenChars: spoken.length,
      reviewStatus: review?.status,
      claimStatus,
      claimCount,
      segments: segmentData,
    },
  }
}

function parseArgs(argv) {
  const args = { json: false, segments: undefined, requireSegments: false, episode: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--require-segments') args.requireSegments = true
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
    console.error(`Usage: node scripts/validate-narration.mjs <episode-dir> [--segments <file>] [--require-segments] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = validateNarration(args.episode, { segments: args.segments, requireSegments: args.requireSegments })
  } catch (error) {
    console.error(`validate-narration: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const { data } = result
    console.log(`Narration gate: ${data.episodeDir ?? args.episode}`)
    console.log(`  narration: ${data.spokenChars ?? 0} spoken characters, sha256 ${data.sha256 ?? 'unknown'}`)
    console.log(`  review: ${data.reviewStatus ?? 'missing'}, claims: ${data.claimStatus ?? 'missing'} (${data.claimCount ?? 0})`)
    console.log(`  segments: ${data.segments === undefined ? 'not checked' : `${data.segments.count} in ${data.segments.path}`}`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    console.log(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`)
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
