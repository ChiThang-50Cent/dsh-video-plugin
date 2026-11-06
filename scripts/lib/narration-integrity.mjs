/**
 * Mechanical narration integrity gate.
 *
 * This gate checks identity, schema, references, required fields, claim
 * structure, review evidence locations, through-line coverage and segment
 * coverage. It deliberately does NOT decide whether prose is good or a
 * mathematical claim is true. Editorial judgement is a separate gate.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  CLAIM_RISKS,
  CRITERIA,
  FINDING_STATUSES,
  MODES,
  NARRATED_MODES,
  REVIEW_STATUSES,
  SEVERITIES,
  claimRisk,
  claimSignals,
  containsExcerpt,
  isPlainObject,
  isSha256,
  locateExcerpt,
  lower,
  normalizeText,
  parseNarration,
  readJson,
  readProductionMode,
  resolveSectionReference,
  sha256File,
} from './narration-model.mjs'
import { compareSemantics, reconstructSpokenText, SAFE_OVERRIDE_KINDS } from './pronunciation.mjs'

const PLACEHOLDERS = /^(?:todo|tbd|n\/?a|none|null|placeholder|unknown|chưa|chưa có|\.{3,}|—+|-+)$/iu

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlaceholder(value) {
  return isNonEmpty(value) && PLACEHOLDERS.test(value.trim())
}

function resolveInside(root, relative, label, errors) {
  const absolute = path.resolve(root, String(relative))
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    errors.push(`${label} "${relative}" resolves outside the episode directory`)
    return undefined
  }
  return absolute
}

function readJsonFile(file, label, errors) {
  try {
    return readJson(file)
  } catch (error) {
    errors.push(`${label} is not readable JSON (${path.basename(file)}): ${error.message}`)
    return undefined
  }
}

function checkDate(value, label, errors) {
  if (!isNonEmpty(value)) {
    errors.push(`${label} is missing`)
    return
  }
  if (Number.isNaN(Date.parse(value))) errors.push(`${label} is not an ISO date: ${JSON.stringify(value)}`)
}

function resolveRef(parsed, reference, label, errors) {
  const resolved = resolveSectionReference(parsed, reference)
  if (resolved.error !== undefined) errors.push(`${label}: ${resolved.error}`)
  return resolved.section
}

/**
 * Load every episode artifact once. Never throws for missing user files; the
 * integrity result reports them.
 * @param {string} episodeDir
 */
export function loadNarrationEpisode(episodeDir) {
  const errors = []
  const root = path.resolve(episodeDir)
  let stat
  try {
    stat = statSync(root)
  } catch {
    const error = new Error(`episode directory not found: ${root}`)
    error.code = 'ENOENT_EPISODE'
    throw error
  }
  if (!stat.isDirectory()) {
    const error = new Error(`not a directory: ${root}`)
    error.code = 'ENOTDIR_EPISODE'
    throw error
  }

  const modeInfo = readProductionMode(root)
  const productionPath = path.join(root, 'production.json')
  const production = existsSync(productionPath) ? readJsonFile(productionPath, 'production.json', errors) : undefined
  const reviewPath = path.join(root, 'narration-review.json')
  const review = existsSync(reviewPath) ? readJsonFile(reviewPath, 'narration-review.json', errors) : undefined

  const narrationName = isNonEmpty(review?.narrationFile) ? review.narrationFile : 'narration.md'
  const narrationPath = resolveInside(root, narrationName, 'narrationFile', errors)
  const narrationExists = narrationPath !== undefined && existsSync(narrationPath)
  const narrationRaw = narrationExists ? readFileSync(narrationPath, 'utf8') : undefined
  const parsed = narrationRaw === undefined ? undefined : parseNarration(narrationRaw)
  const sha256 = narrationExists ? sha256File(narrationPath) : undefined

  const claimName = isNonEmpty(review?.claimCheckFile) ? review.claimCheckFile : 'claim-check.json'
  const claimPath = resolveInside(root, claimName, 'claimCheckFile', errors)
  const claims = claimPath !== undefined && existsSync(claimPath) ? readJsonFile(claimPath, 'claim-check.json', errors) : undefined

  const throughlineName = isNonEmpty(review?.throughlineMap) ? review.throughlineMap : 'throughline-map.json'
  const throughlinePath = resolveInside(root, throughlineName, 'throughlineMap', errors)
  const throughline = throughlinePath !== undefined && existsSync(throughlinePath)
    ? readJsonFile(throughlinePath, 'throughline-map.json', errors)
    : undefined

  return {
    root,
    modeInfo,
    mode: modeInfo.mode,
    production,
    narrationName,
    narrationPath,
    narrationExists,
    narrationRaw,
    parsed,
    sha256,
    reviewPath,
    review,
    claimPath,
    claims,
    throughlinePath,
    throughline,
    errors,
  }
}

function checkProduction(context, errors, warnings) {
  const { production, modeInfo, mode } = context
  if (modeInfo.error !== undefined) errors.push(modeInfo.error)
  if (!MODES.includes(mode)) {
    errors.push(`production mode is ${JSON.stringify(mode)}; expected one of ${MODES.join(', ')}`)
    return
  }
  if (production === undefined) {
    if (modeInfo.source === 'legacy-inference') warnings.push('production.json is missing; legacy episode inferred as narrated')
    return
  }
  if (production.schemaVersion !== undefined && production.schemaVersion !== 1) {
    errors.push(`production.json schemaVersion is ${JSON.stringify(production.schemaVersion)}; expected 1`)
  }
  if (mode === 'silent' || mode === 'text-only') {
    if (production.voiceOver === true) errors.push(`production.json voiceOver must be false for mode "${mode}"`)
  }
  if (mode === 'narrated' || mode === 'mixed') {
    if (production.voiceOver === false) errors.push(`production.json voiceOver must be true for mode "${mode}"`)
  }
  if (production.narrationRisk !== undefined && !['standard', 'high'].includes(production.narrationRisk)) {
    errors.push('production.json narrationRisk must be "standard" or "high"')
  }
  if (production.qualitySensitive !== undefined && typeof production.qualitySensitive !== 'boolean') {
    errors.push('production.json qualitySensitive must be a boolean')
  }
  if (production.targetDurationSec !== undefined && production.targetDurationSec !== null
    && (!Number.isFinite(production.targetDurationSec) || production.targetDurationSec <= 0)) {
    errors.push('production.json targetDurationSec must be a positive number or null')
  }
}

const REVIEWER_KINDS = ['author', 'independent', 'human', 'subagent', 'external']
const REVIEWER_METHODS = ['draft', 'self-review', 'fresh-context', 'subagent', 'human', 'external']

function checkReviewer(reviewer, label, errors, { requireFresh = false } = {}) {
  if (!isPlainObject(reviewer)) {
    errors.push(`${label} is missing`)
    return
  }
  if (!REVIEWER_KINDS.includes(reviewer.kind)) {
    errors.push(`${label}.kind must be one of ${REVIEWER_KINDS.join(', ')}`)
  }
  if (!REVIEWER_METHODS.includes(reviewer.method)) {
    errors.push(`${label}.method must be one of ${REVIEWER_METHODS.join(', ')}`)
  }
  if (!isNonEmpty(reviewer.id)) errors.push(`${label}.id is required`)
  if (requireFresh) {
    if (!['independent', 'human', 'subagent', 'external'].includes(reviewer.kind)) {
      errors.push(`${label} must be independent of the author for high-risk narration`)
    }
    if (!['fresh-context', 'subagent', 'human', 'external'].includes(reviewer.method)) {
      errors.push(`${label}.method must be fresh-context, subagent, human or external for high-risk narration`)
    }
  }
}

function checkCriteria(review, errors, warnings) {
  if (!isPlainObject(review.criteria)) {
    errors.push('review criteria is missing')
    return
  }
  for (const key of CRITERIA) {
    const value = lower(review.criteria[key])
    if (review.criteria[key] === undefined) errors.push(`review criteria.${key} is missing`)
    else if (!['pass', 'needs-work', 'block'].includes(value)) {
      errors.push(`review criteria.${key} is ${JSON.stringify(review.criteria[key])}; expected pass, needs-work or block`)
    } else if (value !== 'pass') {
      if (lower(review.status) === 'pass') errors.push(`review status is "pass" but criteria.${key} is "${value}"`)
      else warnings.push(`review criteria.${key} is "${value}"`)
    }
  }
}

function checkCriteriaEvidence(context, review, errors, warnings) {
  const passing = lower(review.status) === 'pass'
  const evidence = review.criteriaEvidence
  if (!isPlainObject(evidence)) {
    const message = 'review criteriaEvidence is missing; a pass requires concrete evidence for every criterion'
    if (passing) errors.push(message)
    else warnings.push(message)
    return {}
  }
  const byCriterion = {}
  for (const criterion of CRITERIA) {
    const entries = evidence[criterion]
    if (!Array.isArray(entries)) {
      errors.push(`review criteriaEvidence.${criterion} must be an array`)
      continue
    }
    byCriterion[criterion] = entries
    if (entries.length === 0) {
      const message = `review criteriaEvidence.${criterion} is empty; a pass needs at least one cited excerpt`
      if (passing) errors.push(message)
      else warnings.push(message)
      continue
    }
    for (const [index, item] of entries.entries()) {
      const label = `review criteriaEvidence.${criterion}[${index}]`
      if (!isPlainObject(item)) {
        errors.push(`${label} must be an object`)
        continue
      }
      if (!isNonEmpty(item.excerpt)) {
        errors.push(`${label}.excerpt is required`)
        continue
      }
      if (!isNonEmpty(item.note)) errors.push(`${label}.note is required`)
      if (isPlaceholder(item.note)) errors.push(`${label}.note is a placeholder`)
      let section
      if (item.sectionRef !== undefined) section = resolveRef(context.parsed, item.sectionRef, `${label}.sectionRef`, errors)
      const paragraph = item.paragraph
      if (paragraph !== undefined && (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > context.parsed.paragraphs.length)) {
        errors.push(`${label}.paragraph is not a spoken paragraph number (1..${context.parsed.paragraphs.length})`)
        continue
      }
      if (item.sectionRef === undefined && paragraph === undefined) {
        errors.push(`${label} must reference a narration section or paragraph`)
        continue
      }
      const located = locateExcerpt(context.parsed, item.excerpt, { ...(paragraph === undefined ? {} : { paragraph }), ...(section === undefined ? {} : { section }) })
      if (!located.found) {
        errors.push(`${label}.excerpt does not occur in the referenced narration${section === undefined ? '' : ` section "${section.heading ?? 'preamble'}"`}; quote real text`)
      }
    }
  }
  return byCriterion
}

function checkFindings(context, review, errors, warnings) {
  if (!Array.isArray(review.actionableFindings)) {
    errors.push('review actionableFindings must be an array')
    return []
  }
  const ids = new Set()
  for (const [index, finding] of review.actionableFindings.entries()) {
    const label = `review actionableFindings[${index}]`
    if (!isPlainObject(finding)) {
      errors.push(`${label} must be an object`)
      continue
    }
    const id = finding.id
    if (id !== undefined) {
      if (!isNonEmpty(id)) errors.push(`${label}.id must be a non-empty string`)
      else if (ids.has(id)) errors.push(`${label}.id is duplicated: ${id}`)
      else ids.add(id)
    }
    if (!CRITERIA.includes(finding.criterion)) {
      errors.push(`${label}.criterion must be one of ${CRITERIA.join(', ')}`)
    }
    const severity = lower(finding.severity)
    if (!SEVERITIES.includes(severity)) errors.push(`${label}.severity must be block, needs-work or note`)
    const status = lower(finding.status)
    if (!FINDING_STATUSES.includes(status)) errors.push(`${label}.status must be one of ${FINDING_STATUSES.join(', ')}`)
    if (!isNonEmpty(finding.excerpt)) {
      errors.push(`${label}.excerpt is required`)
    } else {
      const located = locateExcerpt(context.parsed, finding.excerpt)
      if (!located.found) errors.push(`${label}.excerpt does not occur in narration.md; quote the reviewed text`)
      if (finding.paragraph !== undefined) {
        if (!Number.isInteger(finding.paragraph) || finding.paragraph < 1 || finding.paragraph > context.parsed.paragraphs.length) {
          errors.push(`${label}.paragraph is not a valid spoken paragraph`)
        } else if (located.found && located.paragraph.index !== finding.paragraph) {
          errors.push(`${label}.paragraph ${finding.paragraph} does not contain the excerpt (found in paragraph ${located.paragraph.index})`)
        }
      }
      if (finding.sectionRef !== undefined) {
        const section = resolveRef(context.parsed, finding.sectionRef, `${label}.sectionRef`, errors)
        if (section !== undefined && located.found && located.sectionId !== section.sectionId) {
          errors.push(`${label}.sectionRef does not contain the excerpt`)
        }
      }
      if (finding.sectionRef === undefined && finding.paragraph === undefined) {
        errors.push(`${label} needs a sectionRef or paragraph reference in addition to the excerpt`)
      }
    }
    for (const field of ['problem', 'evidence', 'proposedFix']) {
      if (!isNonEmpty(finding[field])) errors.push(`${label}.${field} is required`)
      else if (isPlaceholder(finding[field])) errors.push(`${label}.${field} is a placeholder`)
    }
    if (['resolved', 'withdrawn', 'accepted'].includes(status) && !isNonEmpty(finding.resolution)) {
      errors.push(`${label}.resolution is required when status is "${status}"`)
    }
    if (severity === 'block' && ['open', 'escalated'].includes(status) && lower(review.status) === 'pass') {
      errors.push(`${label} is an unresolved blocking finding; a passing review cannot contain it`)
    }
    if (severity === 'needs-work' && status === 'open' && lower(review.status) === 'pass') {
      errors.push(`${label} is an open needs-work finding; resolve it or mark the review needs-work`)
    }
    if (severity === 'needs-work' && status === 'open' && lower(review.status) !== 'pass') {
      warnings.push(`${label} remains open: ${String(finding.problem).slice(0, 80)}`)
    }
  }

  if (!Array.isArray(review.blockers)) {
    errors.push('review blockers must be an array')
  } else if (lower(review.status) === 'pass' && review.blockers.length > 0) {
    errors.push(`review has ${review.blockers.length} blocker(s) but status is "pass"`)
  } else if (lower(review.status) !== 'pass' && review.blockers.length === 0
    && review.actionableFindings.length === 0) {
    errors.push('review is not pass but has neither blockers nor actionable findings')
  }
  return review.actionableFindings
}

function findingRefExists(review, ref) {
  if (!isNonEmpty(ref)) return false
  return (review.actionableFindings ?? []).some((finding) => finding?.id === ref)
}

function checkReviewReferences(context, review, claimsById, evidenceByCriterion, errors) {
  for (const [criterion, entries] of Object.entries(evidenceByCriterion ?? {})) {
    for (const [index, item] of entries.entries()) {
      if (item?.claimRefs === undefined) continue
      if (!Array.isArray(item.claimRefs)) {
        errors.push(`review criteriaEvidence.${criterion}[${index}].claimRefs must be an array`)
        continue
      }
      for (const ref of item.claimRefs) {
        if (!claimsById.has(ref)) errors.push(`review criteriaEvidence.${criterion}[${index}].claimRefs references unknown claim ${JSON.stringify(ref)}`)
      }
    }
  }
  if (review.reviewedSections !== undefined) {
    if (!Array.isArray(review.reviewedSections)) errors.push('review reviewedSections must be an array of section references')
    else {
      const seen = new Set()
      for (const [index, reference] of review.reviewedSections.entries()) {
        const resolved = resolveSectionReference(context.parsed, reference)
        if (resolved.section === undefined) errors.push(`review reviewedSections[${index}] does not resolve: ${resolved.error}`)
        else if (seen.has(resolved.section.sectionId)) errors.push(`review reviewedSections repeats ${resolved.section.sectionId}`)
        else seen.add(resolved.section.sectionId)
      }
    }
  }
}

function checkIndependentReview(context, review, claims, errors) {
  const production = context.production ?? {}
  const highRiskClaims = (claims?.claims ?? []).filter((claim) => ['high', 'critical'].includes(claimRisk(claim)))
  const declaredRequired = review.independentReview?.required === true
  const required = production.narrationRisk === 'high' || production.qualitySensitive === true
    || highRiskClaims.length > 0 || declaredRequired
  const independent = review.independentReview
  if (!required) {
    if (independent !== undefined) checkIndependentShape(context, review, independent, errors, { required: false })
    return { required: false, highRiskClaims: highRiskClaims.map((claim) => claim.id ?? claim.claim) }
  }

  const primaryIsIndependent = ['independent', 'human', 'subagent', 'external'].includes(review.reviewer?.kind)
    && ['fresh-context', 'subagent', 'human', 'external'].includes(review.reviewer?.method)
  if (primaryIsIndependent) {
    // One genuinely separate review pass is enough; still validate any extra block.
    if (independent !== undefined) checkIndependentShape(context, review, independent, errors, { required: false })
    return { required: true, satisfiedByPrimary: true, highRiskClaims: highRiskClaims.map((claim) => claim.id ?? claim.claim) }
  }
  if (!isPlainObject(independent)) {
    errors.push('high-risk or quality-sensitive narration needs one independent review pass with fresh context (reviewer.kind/method or independentReview)')
    return { required: true, satisfiedByPrimary: false, highRiskClaims: highRiskClaims.map((claim) => claim.id ?? claim.claim) }
  }
  checkIndependentShape(context, review, independent, errors, { required: true })
  return { required: true, satisfiedByPrimary: false, highRiskClaims: highRiskClaims.map((claim) => claim.id ?? claim.claim) }
}

function checkIndependentShape(context, review, independent, errors, { required }) {
  if (!isPlainObject(independent)) {
    errors.push('review.independentReview must be an object')
    return
  }
  const status = lower(independent.status)
  if (required && status !== 'pass') errors.push(`independentReview.status is "${independent.status ?? 'missing'}"; expected "pass"`)
  if (required || independent.status !== undefined) {
    if (!['pass', 'blocked', 'not-required', 'missing'].includes(status)) {
      errors.push('independentReview.status must be pass, blocked, not-required or missing')
    }
    if (status === 'pass') {
      checkReviewer(independent.reviewer, 'review.independentReview.reviewer', errors, { requireFresh: true })
      if (independent.reviewer?.id === review.reviewer?.id) errors.push('the independent reviewer must not be the primary reviewer')
      if (independent.reviewer?.readFullScript !== true) errors.push('the independent reviewer must record readFullScript: true')
      checkDate(independent.reviewedAt, 'review.independentReview.reviewedAt', errors)
      if (!isSha256(independent.narrationSha256)) errors.push('independentReview.narrationSha256 must be a SHA-256 digest')
      else if (context.sha256 !== undefined && independent.narrationSha256.toLowerCase() !== context.sha256) {
        errors.push('independentReview.narrationSha256 does not match narration.md')
      }
      if (!isNonEmpty(independent.summary)) errors.push('independentReview.summary is required')
      if (!Array.isArray(independent.evidence) || independent.evidence.length === 0) {
        errors.push('independentReview.evidence must be a non-empty array of cited excerpts')
      } else {
        for (const [index, item] of independent.evidence.entries()) {
          if (!isNonEmpty(item?.excerpt)) errors.push(`independentReview.evidence[${index}].excerpt is required`)
          else if (!containsExcerpt(context.parsed.normalizedSpoken, item.excerpt)) {
            errors.push(`independentReview.evidence[${index}].excerpt does not occur in narration.md`)
          }
        }
      }
      if (independent.findingsReviewed !== undefined) {
        if (!Array.isArray(independent.findingsReviewed)) errors.push('independentReview.findingsReviewed must be an array')
        else {
          for (const ref of independent.findingsReviewed) {
            if (!findingRefExists(review, ref)) errors.push(`independentReview.findingsReviewed references unknown finding ${JSON.stringify(ref)}`)
          }
        }
      }
    }
  }
  if (independent.required === true && lower(review.status) === 'pass' && status !== 'pass') {
    errors.push('review declares an independent review but it has not passed')
  }
}

function checkClaims(context, claims, errors, warnings) {
  if (claims === undefined) {
    if (!existsSync(context.claimPath ?? '')) errors.push('claim-check.json is missing; factual and mathematical claims must be audited')
    return { claimCount: 0, byId: new Map(), signals: claimSignals(context.parsed) }
  }
  if (!isPlainObject(claims)) {
    errors.push('claim-check.json must contain an object')
    return { claimCount: 0, byId: new Map(), signals: claimSignals(context.parsed) }
  }
  if (claims.schemaVersion !== 2) {
    errors.push(`claim-check schemaVersion is ${JSON.stringify(claims.schemaVersion)}; schemaVersion 2 is required (verified claims need evidence and a narration location)`)
  }
  const status = lower(claims.status)
  if (!['pass', 'fail', 'blocked', 'pending'].includes(status)) {
    errors.push(`claim-check status is ${JSON.stringify(claims.status)}; expected PASS, FAIL, BLOCKED or PENDING`)
  }
  if (status !== 'pass') errors.push(`claim-check status is "${claims.status ?? 'missing'}"; expected "PASS"`)
  const claimList = claims.claims
  if (!Array.isArray(claimList)) {
    errors.push('claim-check claims must be an array')
    return { claimCount: 0, byId: new Map(), signals: claimSignals(context.parsed) }
  }
  const byId = new Map()
  for (const [index, claim] of claimList.entries()) {
    const label = `claim ${claim?.id ?? `#${index + 1}`}`
    if (!isPlainObject(claim)) {
      errors.push(`${label} must be an object`)
      continue
    }
    if (!isNonEmpty(claim.id)) errors.push(`${label} has no id`)
    else if (byId.has(claim.id)) errors.push(`claim id is duplicated: ${claim.id}`)
    else byId.set(claim.id, claim)
    if (!isNonEmpty(claim.claim)) errors.push(`${label} has no claim text`)
    else if (isPlaceholder(claim.claim)) errors.push(`${label} claim text is a placeholder`)
    const risk = claimRisk(claim)
    if (!CLAIM_RISKS.includes(risk)) errors.push(`${label} risk must be one of ${CLAIM_RISKS.join(', ')}`)
    if (typeof claim.verified !== 'boolean') errors.push(`${label} verified must be true or false`)

    const hasSource = isNonEmpty(claim.source)
    const hasDerivation = isNonEmpty(claim.derivation)
    const hasEvidence = isNonEmpty(claim.evidence)
      || isNonEmpty(claim.evidence?.detail)
      || isNonEmpty(claim.evidence?.source)
      || isNonEmpty(claim.evidence?.derivation)
    const highRisk = risk === 'high' || risk === 'critical'

    if (claim.verified === true && !hasSource && !hasDerivation && !hasEvidence) {
      errors.push(`${label} is marked verified but has no source, derivation or evidence detail`)
    }
    if (highRisk) {
      if (claim.verified !== true) errors.push(`${label} is high-risk and not verified; approval is blocked`)
      if (!hasSource && !hasDerivation && !hasEvidence) errors.push(`${label} is high-risk without evidence or a derivation`)
    } else if (claim.verified === false) {
      warnings.push(`${label} is not verified (risk ${risk || 'unknown'}); the review must not present it as fact`)
    }

    const location = claim.location
    if (!isPlainObject(location)) {
      errors.push(`${label} needs location {sectionRef|paragraph, excerpt} proving where the claim appears in narration.md`)
    } else {
      if (!isNonEmpty(location.excerpt)) errors.push(`${label}.location.excerpt is required`)
      let section
      if (location.sectionRef !== undefined) section = resolveRef(context.parsed, location.sectionRef, `${label}.location.sectionRef`, errors)
      const paragraph = location.paragraph
      if (paragraph !== undefined && (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > context.parsed.paragraphs.length)) {
        errors.push(`${label}.location.paragraph is not a spoken paragraph number (1..${context.parsed.paragraphs.length})`)
      } else {
        if (location.sectionRef === undefined && paragraph === undefined) {
          errors.push(`${label}.location needs sectionRef or paragraph`)
        }
        if (isNonEmpty(location.excerpt)) {
          const located = locateExcerpt(context.parsed, location.excerpt, { ...(paragraph === undefined ? {} : { paragraph }), ...(section === undefined ? {} : { section }) })
          if (!located.found) errors.push(`${label}.location.excerpt does not occur in the referenced narration`)
        }
      }
    }
  }

  const signals = claimSignals(context.parsed)
  const coverage = claims.coverage
  if (!isPlainObject(coverage)) {
    errors.push('claim-check coverage is required: declare whether factual claims were expected')
  } else {
    if (typeof coverage.claimsExpected !== 'boolean') {
      errors.push('claim-check coverage.claimsExpected must be true or false')
    } else if (coverage.claimsExpected === false) {
      if (!isNonEmpty(coverage.justification)) errors.push('claim-check coverage.justification is required when claimsExpected is false')
      else if (isPlaceholder(coverage.justification)) errors.push('claim-check coverage.justification is a placeholder')
      if (claimList.length > 0) errors.push('claim-check coverage.claimsExpected is false but claims are listed')
      if (signals.length > 0) {
        errors.push(`claim-check claims list is empty, but narration contains claim-bearing content (${signals.slice(0, 3).map((signal) => `${signal.kind} ${signal.value}`).join(', ')}); audit it or remove it`)
      }
    } else if (coverage.claimsExpected === true && claimList.length === 0) {
      errors.push('claim-check claims list is empty while coverage.claimsExpected is true')
    }
  }
  if (claimList.length === 0 && signals.length > 0 && coverage?.claimsExpected !== true) {
    errors.push(`claim list is empty but narration contains claim-bearing content (${signals.slice(0, 3).map((signal) => `${signal.kind} ${signal.value}`).join(', ')}); an empty list cannot be treated as audited`)
  } else if (claimList.length === 0 && signals.length > 0) {
    errors.push(`claim list is empty but narration contains claim-bearing content (${signals.slice(0, 3).map((signal) => `${signal.kind} ${signal.value}`).join(', ')}); audit it`)
  }

  return { claimCount: claimList.length, byId, signals }
}

function checkThroughline(context, throughline, claimsById, errors, warnings) {
  if (throughline === undefined) {
    errors.push(`throughline map is missing: ${path.basename(context.throughlinePath ?? 'throughline-map.json')}`)
    return
  }
  if (!isPlainObject(throughline)) {
    errors.push('throughline-map.json must contain an object')
    return
  }
  if (throughline.schemaVersion !== 1) errors.push(`throughline map schemaVersion is ${JSON.stringify(throughline.schemaVersion)}; expected 1`)
  for (const field of ['centralQuestion', 'promise', 'audience']) {
    if (!isNonEmpty(throughline[field])) errors.push(`throughline.${field} is required`)
    else if (isPlaceholder(throughline[field])) errors.push(`throughline.${field} is a placeholder`)
  }
  if (!Array.isArray(throughline.sections) || throughline.sections.length === 0) {
    errors.push('throughline.sections must be a non-empty array')
    return
  }
  const sections = context.parsed.sections
  const mapped = []
  const seen = new Set()
  for (const [index, entry] of throughline.sections.entries()) {
    const label = `throughline.sections[${index}]`
    if (!isPlainObject(entry)) {
      errors.push(`${label} must be an object`)
      continue
    }
    const section = resolveRef(context.parsed, entry, label, errors)
    if (section !== undefined) {
      if (seen.has(section.sectionId)) errors.push(`${label} maps section ${section.sectionId} more than once`)
      seen.add(section.sectionId)
      mapped.push(section.sectionId)
    }
    for (const field of ['purpose', 'connectionToCentralQuestion', 'whyHere', 'audienceTakeaway']) {
      if (!isNonEmpty(entry[field])) errors.push(`${label}.${field} is required`)
      else if (isPlaceholder(entry[field])) errors.push(`${label}.${field} is a placeholder`)
    }
    if (entry.claimRefs !== undefined) {
      if (!Array.isArray(entry.claimRefs)) errors.push(`${label}.claimRefs must be an array`)
      else {
        for (const ref of entry.claimRefs) {
          if (!claimsById.has(ref)) errors.push(`${label}.claimRefs references unknown claim ${JSON.stringify(ref)}`)
        }
      }
    }
  }
  const expected = sections.map((section) => section.sectionId)
  for (const id of expected) {
    if (!seen.has(id)) {
      const section = sections.find((candidate) => candidate.sectionId === id)
      errors.push(`throughline map does not cover narration section ${id}${section?.heading ? ` ("${section.heading}")` : ''}`)
    }
  }
  for (const id of mapped) {
    if (!expected.includes(id)) warnings.push(`throughline map references a section without spoken prose: ${id}`)
  }
  if (mapped.length === expected.length && mapped.some((id, index) => id !== expected[index])) {
    errors.push('throughline map sections are not in narration order')
  }
}

function rawLatexIssue(text) {
  if (/\\[A-Za-z]+/.test(text)) return 'backslash LaTeX command in spoken text'
  if (/\$\$[^$]+\$\$/.test(text)) return 'display-math $$...$$ in spoken text'
  return undefined
}

function checkSegments(context, options, review, errors, warnings) {
  const explicit = typeof options.segments === 'string' && options.segments.length > 0
  const segmentsPath = explicit
    ? path.resolve(context.root, options.segments)
    : path.join(context.root, 'audio', 'segments.json')
  if (explicit && segmentsPath !== context.root && !segmentsPath.startsWith(`${context.root}${path.sep}`)) {
    errors.push(`explicit segment manifest resolves outside the episode: ${options.segments}`)
    return undefined
  }
  if (!existsSync(segmentsPath)) {
    if (options.requireSegments === true) errors.push(`segment manifest is required but missing: ${path.relative(context.root, segmentsPath) || segmentsPath}`)
    else if (explicit) errors.push(`segment manifest not found: ${path.relative(context.root, segmentsPath)}`)
    return undefined
  }
  const manifest = readJsonFile(segmentsPath, 'audio/segments.json', errors)
  if (manifest === undefined) return undefined
  if (!isPlainObject(manifest)) {
    errors.push('segments.json must contain an object')
    return undefined
  }
  if (![1, 2].includes(manifest.schemaVersion)) warnings.push(`segments schemaVersion is ${JSON.stringify(manifest.schemaVersion)}; expected 2`)
  if (manifest.schemaVersion === 1) warnings.push('segments schemaVersion 1 has no pronunciation provenance; schemaVersion 2 is required for reviewed overrides')
  if (!isSha256(manifest.narrationSha256)) errors.push('segments narrationSha256 is missing or not a SHA-256 hex digest')
  else if (context.sha256 !== undefined && manifest.narrationSha256.toLowerCase() !== context.sha256) {
    errors.push('segments were built from a different narration hash; re-plan or use revise-narration for an intentional revision')
  }
  const segments = manifest.segments
  if (!Array.isArray(segments) || segments.length === 0) {
    errors.push('segment manifest has no segments')
    return undefined
  }
  const ids = new Set()
  const texts = []
  const segmentSummaries = []
  for (const [index, segment] of segments.entries()) {
    const fallback = `segment #${index + 1}`
    if (!isPlainObject(segment)) {
      errors.push(`${fallback} must be an object`)
      continue
    }
    const id = segment.id
    if (!isNonEmpty(id)) errors.push(`${fallback} has no id`)
    else if (ids.has(id)) errors.push(`duplicate segment id: ${id}`)
    else ids.add(id)
    const label = `segment ${id ?? fallback}`
    if (!isNonEmpty(segment.text)) {
      errors.push(`${label} has no text`)
      continue
    }
    const textLatex = rawLatexIssue(segment.text)
    if (textLatex !== undefined) errors.push(`${label}: ${textLatex}`)
    texts.push(normalizeText(segment.text))

    if (segment.displayText !== undefined) {
      if (!isNonEmpty(segment.displayText)) errors.push(`${label} displayText must be a non-empty string when present`)
      else if (normalizeText(segment.displayText) !== normalizeText(segment.text)) {
        errors.push(`${label} displayText changes the approved wording; display text must equal canonical segment text`)
      }
    }

    if (segment.paragraphStart !== undefined) {
      if (!Number.isInteger(segment.paragraphStart) || segment.paragraphStart < 1 || segment.paragraphStart > context.parsed.paragraphs.length) {
        errors.push(`${label} paragraphStart is not a valid spoken paragraph`)
      }
    }
    if (segment.audio !== undefined) {
      if (!isNonEmpty(segment.audio)) errors.push(`${label} audio must be a non-empty relative path when present`)
      else {
        const audioPath = path.resolve(context.root, segment.audio)
        if (!audioPath.startsWith(`${context.root}${path.sep}`)) errors.push(`${label} audio path resolves outside the episode`)
        else if (!existsSync(audioPath)) warnings.push(`${label} audio file is not present yet: ${segment.audio}`)
      }
    }

    const overrides = segment.pronunciation?.overrides
    if (segment.pronunciation !== undefined) {
      if (!isPlainObject(segment.pronunciation)) errors.push(`${label} pronunciation must be an object`)
      else if (segment.pronunciation.version !== undefined && segment.pronunciation.version !== 1) {
        errors.push(`${label} pronunciation.version must be 1`)
      }
    }
    if (overrides !== undefined && !Array.isArray(overrides)) errors.push(`${label} pronunciation.overrides must be an array`)

    if (segment.spokenText !== undefined) {
      if (!isNonEmpty(segment.spokenText)) {
        errors.push(`${label} spokenText must be a non-empty string when present`)
        continue
      }
      const spokenLatex = rawLatexIssue(segment.spokenText)
      if (spokenLatex !== undefined) errors.push(`${label} spokenText: ${spokenLatex}`)
      const declared = Array.isArray(overrides) ? overrides : []
      if (declared.length === 0 && normalizeText(segment.spokenText) !== normalizeText(segment.text)) {
        errors.push(`${label} spokenText differs from text without declared pronunciation.overrides; every change needs provenance and justification`)
      }
      for (const [overrideIndex, override] of declared.entries()) {
        const overrideLabel = `${label} override #${overrideIndex + 1}`
        if (!isPlainObject(override)) {
          errors.push(`${overrideLabel} must be an object`)
          continue
        }
        for (const field of ['from', 'to', 'kind', 'provenance', 'justification']) {
          if (!isNonEmpty(override[field])) errors.push(`${overrideLabel}.${field} is required`)
        }
        if (isNonEmpty(override.from) && isNonEmpty(override.to) && override.from === override.to) {
          errors.push(`${overrideLabel} does not change anything`)
        }
        if (isNonEmpty(override.kind) && !SAFE_OVERRIDE_KINDS.includes(override.kind)) {
          errors.push(`${overrideLabel}.kind must be one of ${SAFE_OVERRIDE_KINDS.join(', ')}`)
        }
        const risk = lower(override.risk ?? 'low')
        if (!CLAIM_RISKS.includes(risk)) errors.push(`${overrideLabel}.risk must be one of ${CLAIM_RISKS.join(', ')}`)
        if (isNonEmpty(override.from) && isNonEmpty(override.to)) {
          const semantics = compareSemantics(override.from, override.to)
          if (!semantics.ok) {
            errors.push(`${overrideLabel} changes protected mathematical content (missing ${semantics.missing.join(', ') || 'none'}; added ${semantics.added.join(', ') || 'none'}); fix narration.md and redo G0 instead of changing it in speech`)
          }
        }
        const needsReview = risk === 'high' || risk === 'critical' || !SAFE_OVERRIDE_KINDS.includes(lower(override.kind))
          || (isNonEmpty(override.from) && isNonEmpty(override.to) && override.from !== override.to && /[+\-*/=<>^%∞√±]|(?:^|\s)(?:cộng|trừ|nhân|chia|bằng|âm|dương|vô cực)(?:\s|$)/iu.test(`${override.from} ${override.to}`))
        if (needsReview) {
          if (override.reviewed !== true) errors.push(`${overrideLabel} is high-risk or ambiguous and must be reviewed before synthesis (set reviewed: true with a reviewRef)`)
          if (!isNonEmpty(override.reviewRef)) errors.push(`${overrideLabel}.reviewRef is required when reviewed`)
          else if (review !== undefined && !findingRefExists(review, override.reviewRef)) {
            errors.push(`${overrideLabel}.reviewRef references an unknown actionable finding`)
          }
          if (!isNonEmpty(override.reviewedBy)) errors.push(`${overrideLabel}.reviewedBy is required when reviewed`)
        }
      }
      if (declared.length > 0) {
        const reconstruction = reconstructSpokenText(segment.text, segment.spokenText, declared)
        if (!reconstruction.ok) errors.push(`${label} ${reconstruction.error}`)
      }
      const semantics = compareSemantics(segment.text, segment.spokenText)
      if (!semantics.ok) {
        errors.push(`${label} spokenText changes numbers/operators/signs from the approved text (missing ${semantics.missing.join(', ') || 'none'}; added ${semantics.added.join(', ') || 'none'})`)
      }
    } else if (Array.isArray(overrides) && overrides.length > 0) {
      errors.push(`${label} declares pronunciation.overrides but no spokenText`)
    }
    segmentSummaries.push({
      id: id ?? fallback,
      chars: normalizeText(segment.text).length,
      spokenChars: segment.spokenText === undefined ? normalizeText(segment.text).length : normalizeText(segment.spokenText).length,
      overrides: Array.isArray(overrides) ? overrides.length : 0,
    })
  }

  const joined = normalizeText(texts.join(' '))
  if (joined !== context.parsed.normalizedSpoken) {
    const expected = context.parsed.normalizedSpoken
    const limit = Math.min(expected.length, joined.length)
    let index = 0
    while (index < limit && expected[index] === joined[index]) index += 1
    const start = Math.max(0, index - 40)
    const end = Math.min(Math.max(expected.length, joined.length), index + 40)
    errors.push(`segment coverage does not match the frozen spoken prose at character ${index}; narration: "${expected.slice(start, end)}"; segments: "${joined.slice(start, end)}"`)
  }
  return {
    path: path.relative(context.root, segmentsPath) || segmentsPath,
    count: segments.length,
    overrides: segmentSummaries.reduce((sum, segment) => sum + segment.overrides, 0),
    segments: segmentSummaries,
  }
}

/**
 * Run the mechanical gate.
 * @param {ReturnType<typeof loadNarrationEpisode>} context
 * @param {{ segments?: string, requireSegments?: boolean }} [options]
 */
export function validateNarrationIntegrity(context, options = {}) {
  const errors = [...(context.errors ?? [])]
  const warnings = []
  checkProduction(context, errors, warnings)
  if (!NARRATED_MODES.has(context.mode)) {
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      data: {
        episodeDir: context.root,
        mode: context.mode,
        skipped: `mode "${context.mode}" has no voice-over narration gate`,
        mechanical: true,
        editorial: false,
      },
    }
  }
  if (!context.narrationExists) {
    errors.push(`narration file not found: ${context.narrationName}`)
    return { ok: false, errors, warnings, data: { episodeDir: context.root, mode: context.mode } }
  }
  const parsed = context.parsed
  if (normalizeText(parsed.spokenText).length === 0) {
    errors.push('narration has no spoken prose after removing headings, notes and fenced display blocks')
    return { ok: false, errors, warnings, data: { episodeDir: context.root, mode: context.mode } }
  }
  if (parsed.normalizedSpoken.length < 200) warnings.push(`spoken prose is very short (${parsed.normalizedSpoken.length} characters)`)
  const latex = rawLatexIssue(parsed.normalizedSpoken)
  if (latex !== undefined) errors.push(`${latex}; write the spoken form and keep display math in a fenced block`)

  let evidenceByCriterion = {}
  if (context.review === undefined) {
    if (!existsSync(context.reviewPath)) errors.push('narration-review.json is missing; the G0 review must exist before audio')
  } else {
    const review = context.review
    if (review.schemaVersion !== 2) {
      errors.push(`review schemaVersion is ${JSON.stringify(review.schemaVersion)}; version 2 is required because a pass must cite evidence, location and an independent review when risk is high`)
    }
    if (!REVIEW_STATUSES.includes(lower(review.status))) {
      errors.push(`review status is ${JSON.stringify(review.status)}; expected pass, needs-work, blocked or stale`)
    }
    if (lower(review.status) !== 'pass') errors.push(`review status is "${review.status ?? 'missing'}"; expected "pass"`)
    checkReviewer(review.reviewer, 'review.reviewer', errors)
    if (review.reviewer?.readFullScript !== true && lower(review.status) === 'pass') {
      errors.push('review.reviewer.readFullScript must be true for a passing review')
    }
    checkDate(review.reviewedAt, 'review.reviewedAt', errors)
    if (!isSha256(review.narrationSha256)) errors.push('review narrationSha256 is missing or not a SHA-256 hex digest')
    else if (context.sha256 !== undefined && review.narrationSha256.toLowerCase() !== context.sha256) {
      errors.push(`review hash does not match narration.md (review ${review.narrationSha256.slice(0, 12)}..., file ${context.sha256.slice(0, 12)}...); use scripts/revise-narration.mjs for an intentional revision`)
    }
    checkCriteria(review, errors, warnings)
    evidenceByCriterion = checkCriteriaEvidence(context, review, errors, warnings)
    checkFindings(context, review, errors, warnings)
    if (review.reviewPasses !== undefined) {
      if (typeof review.reviewPasses !== 'number' || review.reviewPasses < 0) errors.push('review reviewPasses must be a non-negative number')
      else if (review.reviewPasses > 2) {
        const message = `review reviewPasses is ${review.reviewPasses}; the default budget is one draft, one editorial pass and one targeted fix`
        if (lower(review.status) === 'pass') errors.push(`${message}; escalate the unresolved issue instead of self-certifying PASS`)
        else warnings.push(message)
      }
    }
    if (review.revision !== undefined && (!Number.isInteger(review.revision) || review.revision < 1)) {
      errors.push('review revision must be a positive integer when present')
    }
  }

  const claimResult = checkClaims(context, context.claims, errors, warnings)
  const review = context.review
  checkReviewReferences(context, review ?? {}, claimResult.byId, evidenceByCriterion, errors)
  checkIndependentReview(context, review ?? {}, context.claims, errors)
  checkThroughline(context, context.throughline, claimResult.byId, errors, warnings)
  const segments = checkSegments(context, options, review, errors, warnings)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      episodeDir: context.root,
      mode: context.mode,
      narrationFile: context.narrationExists ? path.relative(context.root, context.narrationPath) : context.narrationName,
      sha256: context.sha256,
      spokenChars: parsed.normalizedSpoken.length,
      spokenWords: parsed.normalizedSpoken.split(/\s+/u).filter(Boolean).length,
      sections: parsed.sections.length,
      paragraphs: parsed.paragraphs.length,
      reviewStatus: review?.status,
      reviewSchemaVersion: review?.schemaVersion,
      claimStatus: context.claims?.status,
      claimCount: claimResult.claimCount,
      claimSignals: claimResult.signals,
      throughlineSections: Array.isArray(context.throughline?.sections) ? context.throughline.sections.length : 0,
      segments,
      mechanical: true,
      editorial: false,
    },
  }
}
