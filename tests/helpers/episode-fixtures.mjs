/**
 * Test-only fixture builder for evidence-based narration episodes.
 *
 * It constructs *real* citations: every criteriaEvidence excerpt is located in
 * the narration, every claim location resolves, and every narration section is
 * reviewed. Tests still exercise the validators; this helper does not bypass
 * them.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseNarration, locateExcerpt, splitSentences } from '../../scripts/lib/narration-model.mjs'

export const PASS_CRITERIA = {
  accuracy: 'pass',
  audienceFit: 'pass',
  narrativeArc: 'pass',
  reasoning: 'pass',
  continuity: 'pass',
  spokenLanguage: 'pass',
  pacing: 'pass',
  styleAndOriginality: 'pass',
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function findSentence(parsed, needle) {
  for (const sentence of parsed.sentences) {
    if (sentence.text.includes(needle)) return sentence
  }
  throw new Error(`fixture sentence not found: ${needle}`)
}

export function claimFrom(parsed, spec) {
  const location = spec.excerpt ?? findSentence(parsed, spec.needle).text
  const located = locateExcerpt(parsed, location)
  if (!located.found) throw new Error(`claim excerpt not found: ${location}`)
  return {
    id: spec.id,
    claim: spec.claim,
    ...(spec.source === undefined ? {} : { source: spec.source }),
    ...(spec.derivation === undefined ? {} : { derivation: spec.derivation }),
    verified: spec.verified ?? true,
    risk: spec.risk ?? 'low',
    location: {
      sectionRef: { sectionId: located.sectionId },
      paragraph: located.paragraph.index,
      excerpt: location,
    },
  }
}

export function buildClaims(parsed, specs = []) {
  return {
    schemaVersion: 2,
    status: 'PASS',
    reviewedAt: new Date().toISOString(),
    coverage: {
      claimsExpected: specs.length > 0,
      justification: specs.length > 0 ? null : 'No checkable factual or mathematical claim appears in this script.',
    },
    claims: specs.map((spec) => claimFrom(parsed, spec)),
    conditions: [],
  }
}

export function buildThroughline(parsed, options = {}) {
  const centralQuestion = options.centralQuestion ?? 'Câu hỏi trung tâm của tập phim là gì?'
  const sections = parsed.sections.map((section, index) => ({
    sectionId: section.sectionId,
    heading: section.heading,
    purpose: options.purpose?.(section, index) ?? `Thực hiện bước ${index + 1} của lập luận: ${section.heading ?? 'mở đầu'}.`,
    connectionToCentralQuestion: options.connection?.(section, index) ?? `Phần này trả lời trực tiếp câu hỏi: ${centralQuestion}`,
    whyHere: options.whyHere?.(section, index) ?? `Nó xuất hiện sau bước trước để người nghe có đủ tiền đề cho bước kế tiếp.`,
    audienceTakeaway: options.takeaway?.(section, index) ?? `Người nghe hiểu thêm một bước của câu trả lời.`,
    claimRefs: options.claimRefs?.(section, index) ?? (index === 0 ? options.claimIds ?? [] : []),
  }))
  return {
    schemaVersion: 1,
    centralQuestion,
    promise: options.promise ?? 'Người nghe trả lời được câu hỏi trung tâm mà không cần nhìn màn hình.',
    audience: options.audience ?? 'Người xem phổ thông chưa quen chủ đề.',
    sections,
  }
}

function evidenceForSection(section, criterion, claims, claimRefs) {
  const paragraph = section.paragraphs[0]
  const sentence = splitSentences(paragraph.text)[0] ?? paragraph.text
  return {
    sectionRef: { sectionId: section.sectionId },
    paragraph: paragraph.index,
    excerpt: sentence,
    note: `During the full read-aloud pass this paragraph was checked for ${criterion}; the quoted sentence carries the judgement.`,
    ...(criterion === 'accuracy' && claimRefs.length > 0 ? { claimRefs } : {}),
  }
}

export function buildReview(parsed, hash, options = {}) {
  const claimRefs = options.claimRefs ?? []
  const criteriaEvidence = options.criteriaEvidence ?? Object.fromEntries(
    Object.keys(PASS_CRITERIA).map((criterion) => [
      criterion,
      parsed.sections.map((section) => evidenceForSection(section, criterion, options.claims, claimRefs)),
    ]),
  )
  return {
    schemaVersion: 2,
    narrationFile: 'narration.md',
    narrationSha256: hash,
    status: options.status ?? 'pass',
    reviewedAt: options.reviewedAt ?? new Date().toISOString(),
    reviewer: options.reviewer ?? {
      kind: 'independent',
      id: options.reviewerId ?? 'fixture-editor',
      method: 'fresh-context',
      readFullScript: true,
    },
    criteria: options.criteria ?? { ...PASS_CRITERIA },
    criteriaEvidence,
    blockers: options.blockers ?? [],
    actionableFindings: options.findings ?? [],
    throughlineMap: 'throughline-map.json',
    claimCheckFile: 'claim-check.json',
    reviewPasses: options.reviewPasses ?? 2,
    reviewedSections: options.reviewedSections ?? parsed.sections.map((section) => ({ sectionId: section.sectionId })),
    independentReview: options.independentReview ?? { required: false, status: 'not-required' },
    revision: 1,
  }
}

/**
 * @param {import('node:test').TestContext} t
 * @param {{
 *   narration: string,
 *   claims?: object[]|object,
 *   throughline?: object,
 *   review?: object,
 *   mode?: string,
 *   production?: object,
 *   createContracts?: boolean
 * }} options
 */
export function makeEpisode(t, options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-studio-fixture-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const narration = options.narration
  fs.writeFileSync(path.join(dir, 'narration.md'), narration)
  const parsed = parseNarration(narration)
  const hash = sha256(fs.readFileSync(path.join(dir, 'narration.md')))
  const mode = options.mode ?? 'narrated'
  fs.writeFileSync(path.join(dir, 'production.json'), `${JSON.stringify({
    schemaVersion: 1,
    mode,
    voiceOver: mode === 'narrated' || mode === 'mixed',
    narrationRisk: 'standard',
    qualitySensitive: false,
    targetDurationSec: null,
    ...options.production,
  }, null, 2)}\n`)
  if (options.createContracts !== false) {
    const claimSpecs = Array.isArray(options.claims) ? options.claims : []
    const claims = Array.isArray(options.claims) || options.claims === undefined ? buildClaims(parsed, claimSpecs) : options.claims
    const throughline = options.throughline ?? buildThroughline(parsed, { claimIds: (claims.claims ?? []).map((claim) => claim.id) })
    const review = options.review === undefined
      ? buildReview(parsed, hash, { claimRefs: (claims.claims ?? []).map((claim) => claim.id) })
      : { ...options.review, narrationSha256: hash }
    fs.writeFileSync(path.join(dir, 'claim-check.json'), `${JSON.stringify(claims, null, 2)}\n`)
    fs.writeFileSync(path.join(dir, 'throughline-map.json'), `${JSON.stringify(throughline, null, 2)}\n`)
    fs.writeFileSync(path.join(dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  }
  fs.writeFileSync(path.join(dir, 'storyboard.json'), `${JSON.stringify(options.storyboard ?? { schemaVersion: 1, scenes: [] }, null, 2)}\n`)
  fs.writeFileSync(path.join(dir, 'timeline.json'), `${JSON.stringify(options.timeline ?? { schemaVersion: 1, durationSec: null, scenes: [] }, null, 2)}\n`)
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), `${JSON.stringify(options.audio ?? { schemaVersion: 1, engine: null, chunks: [] }, null, 2)}\n`)
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'qa', 'scene'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true })
  return { dir, parsed, hash, claims: options.claims, throughline: options.throughline, review: options.review }
}

export function makeSegments(parsed, hash, count = 4, mutate = (segments) => segments) {
  const words = parsed.normalizedSpoken.split(' ')
  const size = Math.ceil(words.length / count)
  const segments = []
  for (let index = 0; index < count; index += 1) {
    const text = words.slice(index * size, (index + 1) * size).join(' ').trim()
    if (text.length === 0) continue
    segments.push({ id: `seg-${String(index + 1).padStart(3, '0')}`, text })
  }
  return {
    schemaVersion: 2,
    narrationSha256: hash,
    segments: mutate(segments),
  }
}

export function writeSegmentManifest(dir, manifest) {
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'audio', 'segments.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
