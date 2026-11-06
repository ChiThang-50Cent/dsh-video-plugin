/**
 * Editorial / content review gate.
 *
 * This gate decides whether the *review itself* is evidence-based and whether
 * high-confidence editorial issues have been addressed. It cannot prove a
 * mathematical or factual claim. Its trust basis is the cited excerpts, the
 * claim audit and, for high-risk narration, a genuinely independent review.
 */
import {
  CRITERIA,
  NARRATED_MODES,
  claimRisk,
  containsExcerpt,
  lower,
  normalizeForMatch,
  resolveSectionReference,
} from './narration-model.mjs'
import { runEditorialHeuristics } from './editorial-heuristics.mjs'

const STOP_WORDS = new Set([
  'và', 'là', 'của', 'cho', 'một', 'những', 'các', 'cái', 'điều', 'khi', 'thì', 'mà', 'với', 'trong', 'ra', 'vào',
  'để', 'từ', 'đến', 'về', 'như', 'vậy', 'này', 'đó', 'kia', 'gì', 'sao', 'thế', 'nào', 'có', 'không', 'được',
  'người', 'ta', 'chúng', 'mình', 'bạn', 'họ', 'nó', 'ở', 'tại', 'bằng', 'vì', 'nên', 'nếu', 'nhưng', 'hay', 'hoặc',
])

function contentWords(text) {
  return new Set(normalizeForMatch(text).split(/\s+/u).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

function citedSectionIds(context, review, errors, warnings) {
  const cited = new Set()
  const evidence = review.criteriaEvidence ?? {}
  for (const criterion of CRITERIA) {
    for (const [index, item] of (Array.isArray(evidence[criterion]) ? evidence[criterion] : []).entries()) {
      if (item?.paragraph !== undefined) {
        const paragraph = context.parsed.paragraphs.find((candidate) => candidate.index === item.paragraph)
        if (paragraph !== undefined) {
          cited.add(paragraph.sectionId)
          continue
        }
      }
      if (item?.sectionRef !== undefined) {
        const resolved = resolveSectionReference(context.parsed, item.sectionRef)
        if (resolved.section !== undefined) cited.add(resolved.section.sectionId)
        else warnings.push(`criteriaEvidence.${criterion}[${index}].sectionRef does not resolve: ${resolved.error}`)
      }
    }
  }
  if (review.reviewedSections !== undefined) {
    if (!Array.isArray(review.reviewedSections)) {
      errors.push('review.reviewedSections must be an array of section references')
    } else {
      for (const [index, reference] of review.reviewedSections.entries()) {
        const resolved = resolveSectionReference(context.parsed, reference)
        if (resolved.section === undefined) errors.push(`review.reviewedSections[${index}] does not resolve: ${resolved.error}`)
      }
    }
  }
  return cited
}

function findingMatches(heuristic, reviewFindings) {
  return reviewFindings.filter((candidate) => {
    if (candidate === undefined) return false
    if (candidate.code === heuristic.code) return true
    if (typeof candidate.excerpt === 'string' && containsExcerpt(candidate.excerpt, heuristic.excerpt)) return true
    if (typeof candidate.excerpt === 'string' && containsExcerpt(heuristic.excerpt, candidate.excerpt)) return true
    return false
  })
}

/**
 * @param {ReturnType<import('./narration-integrity.mjs').loadNarrationEpisode>} context
 * @param {{ requireSegments?: boolean, segments?: string }} [options]
 */
export function validateNarrationEditorial(context, options = {}) {
  const errors = []
  const warnings = []
  if (!NARRATED_MODES.has(context.mode)) {
    return {
      ok: true,
      errors,
      warnings,
      data: {
        episodeDir: context.root,
        mode: context.mode,
        skipped: `mode "${context.mode}" has no narration editorial gate`,
        mechanical: false,
        editorial: true,
      },
    }
  }
  if (context.parsed === undefined || context.review === undefined) {
    errors.push('editorial review cannot run without narration.md and narration-review.json')
    return { ok: false, errors, warnings, data: { episodeDir: context.root, mode: context.mode } }
  }
  const review = context.review
  if (review.schemaVersion !== 2) errors.push('editorial evidence requires schemaVersion 2')
  if (String(review.narrationSha256).toLowerCase() !== context.sha256) {
    errors.push('editorial evidence was written for a different narration hash; re-review the current script')
  }
  if (lower(review.status) !== 'pass') {
    errors.push(`editorial gate needs one passing evidence-based review; status is "${review.status ?? 'missing'}"`)
  }
  if (review.reviewer?.readFullScript !== true) {
    errors.push('the reviewer must record readFullScript: true after reading the complete script')
  }
  if (lower(review.reviewer?.method) === 'draft') {
    errors.push('a draft cannot review itself: use a separate self-review, fresh-context, subagent or human pass')
  }

  for (const criterion of CRITERIA) {
    if (lower(review.criteria?.[criterion]) !== 'pass') {
      errors.push(`editorial criterion ${criterion} is not pass; the script cannot hold a quality PASS`)
    }
    const entries = Array.isArray(review.criteriaEvidence?.[criterion]) ? review.criteriaEvidence[criterion] : []
    if (entries.length === 0) errors.push(`editorial criterion ${criterion} has no cited evidence`)
  }

  const cited = citedSectionIds(context, review, errors, warnings)
  for (const section of context.parsed.sections) {
    if (!cited.has(section.sectionId)) {
      errors.push(`review evidence never cites section ${section.sectionId}${section.heading ? ` ("${section.heading}")` : ''}; the reviewer must cite it through criteriaEvidence (reviewedSections is only a declaration, not evidence)`)
    }
  }

  const findings = Array.isArray(review.actionableFindings) ? review.actionableFindings : []
  for (const finding of findings) {
    const status = lower(finding?.status)
    const severity = lower(finding?.severity)
    if (severity === 'block' && ['open', 'escalated'].includes(status)) {
      errors.push(`unresolved blocking finding "${finding?.id ?? finding?.excerpt ?? 'unnamed'}"; a quality PASS is impossible until it is resolved or withdrawn with evidence`)
    }
    if (severity === 'needs-work' && ['open', 'escalated'].includes(status)) {
      errors.push(`unresolved needs-work finding "${finding?.id ?? finding?.excerpt ?? 'unnamed'}" contradicts a quality PASS; resolve it or mark the review needs-work`)
    }
    if (status === 'accepted' && !['note', 'needs-work'].includes(severity)) {
      errors.push(`blocking finding "${finding?.id ?? 'unnamed'}" cannot be accepted silently; resolve it or escalate it`)
    }
    if (status === 'withdrawn' && !(finding.resolution ?? '').trim()) {
      errors.push(`withdrawn finding "${finding?.id ?? 'unnamed'}" needs a resolution explaining why it was withdrawn`)
    }
  }

  const throughline = context.throughline ?? {}
  const centralWords = contentWords(throughline.centralQuestion ?? '')
  for (const [index, entry] of (Array.isArray(throughline.sections) ? throughline.sections : []).entries()) {
    const connection = `${entry?.connectionToCentralQuestion ?? ''} ${entry?.whyHere ?? ''}`
    if (centralWords.size > 0 && ![...centralWords].some((word) => normalizeForMatch(connection).includes(word))) {
      warnings.push(`throughline.sections[${index}] does not name a word from the central question in its connection; verify the section earns its place`)
    }
  }

  // High-risk claims need to be referenced by the accuracy evidence, not merely
  // listed in claim-check.json.
  const accuracyRefs = new Set()
  for (const item of (Array.isArray(review.criteriaEvidence?.accuracy) ? review.criteriaEvidence.accuracy : [])) {
    for (const ref of (Array.isArray(item?.claimRefs) ? item.claimRefs : [])) accuracyRefs.add(ref)
  }
  for (const claim of (Array.isArray(context.claims?.claims) ? context.claims.claims : [])) {
    if (['high', 'critical'].includes(claimRisk(claim)) && !accuracyRefs.has(claim?.id)) {
      errors.push(`high-risk claim ${JSON.stringify(claim?.id ?? claim?.claim)} is not cited by accuracy evidence; add a claimRef after checking it`)
    }
  }

  const heuristicResult = runEditorialHeuristics(context.parsed, {
    centralQuestion: throughline.centralQuestion,
  })
  const heuristicFindings = heuristicResult.findings
  for (const heuristic of heuristicFindings) {
    const matches = findingMatches(heuristic, findings)
    if (heuristic.severity === 'block') {
      if (matches.length === 0) {
        errors.push(`high-confidence content problem not addressed by the review: ${heuristic.code} ("${heuristic.excerpt.slice(0, 90)}"). ${heuristic.problem}`)
        continue
      }
      const resolved = matches.some((candidate) => ['resolved', 'withdrawn'].includes(lower(candidate.status)))
      if (!resolved) {
        errors.push(`high-confidence content problem is still open: ${heuristic.code} ("${heuristic.excerpt.slice(0, 90)}")`)
      } else {
        errors.push(`review marks ${heuristic.code} resolved, but the current narration still contains the problem ("${heuristic.excerpt.slice(0, 90)}"); a resolution must edit the text`)
      }
    } else if (heuristic.severity === 'needs-work' && lower(review.status) === 'pass') {
      if (matches.length === 0) {
        errors.push(`review claims PASS but does not address detected editorial issue ${heuristic.code} ("${heuristic.excerpt.slice(0, 90)}"); cite it as a finding with a decision or revise the script`)
      } else if (matches.some((candidate) => ['open', 'escalated'].includes(lower(candidate.status)))) {
        errors.push(`review claims PASS while ${heuristic.code} remains open ("${heuristic.excerpt.slice(0, 90)}")`)
      } else if (matches.some((candidate) => ['resolved', 'withdrawn'].includes(lower(candidate.status)))) {
        errors.push(`review marks ${heuristic.code} resolved, but the current narration still contains the issue ("${heuristic.excerpt.slice(0, 90)}"); a resolution must edit the text or be recorded as an explicit acceptance with rationale`)
      }
    }
  }

  if (heuristicResult.findings.length === 0) {
    const first = context.parsed.paragraphs[0]
    if (first !== undefined && context.parsed.normalizedSpoken.length > 400) {
      // No issue detected is a valid outcome; it is not evidence of quality.
      warnings.push('no deterministic editorial anti-pattern was detected; that does not replace the cited review judgement')
    }
  }

  const target = context.production?.targetDurationSec
  if (Number.isFinite(target) && target > 0) {
    const words = context.parsed.normalizedSpoken.split(/\s+/u).filter(Boolean).length
    const estimatedMinutes = words / 150
    const estimatedSec = estimatedMinutes * 60
    if (estimatedSec < target * 0.65 || estimatedSec > target * 1.35) {
      warnings.push(`estimated read time is ${estimatedSec.toFixed(0)}s at 150 wpm for a target of ${target}s; check pacing against the brief`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: {
      episodeDir: context.root,
      mode: context.mode,
      reviewStatus: review.status,
      criteriaEvidence: Object.fromEntries(CRITERIA.map((criterion) => [criterion, (review.criteriaEvidence?.[criterion] ?? []).length])),
      sectionsCited: [...cited],
      sectionsTotal: context.parsed.sections.length,
      heuristicFindings: heuristicFindings.map((item) => ({
        code: item.code,
        category: item.category,
        severity: item.severity,
        excerpt: item.excerpt,
        paragraph: item.paragraph,
        problem: item.problem,
      })),
      mechanical: false,
      editorial: true,
      caveat: 'This gate verifies that evidence exists and is internally consistent. It does not prove that a factual or mathematical claim is true; the cited independent review and human accountability are the trust basis.',
    },
  }
}
