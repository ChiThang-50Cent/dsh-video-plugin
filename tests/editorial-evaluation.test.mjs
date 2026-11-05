import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseNarration } from '../scripts/lib/narration-model.mjs'
import { runEditorialHeuristics } from '../scripts/lib/editorial-heuristics.mjs'
import { validateNarration } from '../scripts/validate-narration.mjs'
import {
  buildClaims,
  buildReview,
  buildThroughline,
  makeEpisode,
} from './helpers/episode-fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.join(here, 'fixtures', 'editorial', 'algebra-la-gi')
const narration = fs.readFileSync(path.join(fixtureDir, 'narration.md'), 'utf8')
const expected = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected-findings.json'), 'utf8'))

const CLAIMS = [
  { id: 'c01', claim: '(n-1)(n+1)+1 = n^2', needle: 'Cộng thêm một, ta quay về n bình phương', derivation: '(n-1)(n+1) = n^2 - 1; add 1', risk: 'low' },
  { id: 'c02', claim: '(a+b)^2 = a^2 + 2ab + b^2', needle: 'Có hai tích a nhân b, không phải một', derivation: 'Expand (a+b)(a+b) and collect the two equal cross terms.', risk: 'low' },
  { id: 'c03', claim: '99 x 101 = 9999 = 100^2 - 1', needle: 'Tích trở thành một trăm bình phương trừ một bình phương', derivation: '(100-1)(100+1) = 100^2 - 1 = 9999', risk: 'low' },
  { id: 'c04', claim: 'Newtonian gravitation is F = G m1 m2 / r^2 for point masses', needle: 'Mọi vật hút nhau bằng một lực tỉ lệ thuận với tích khối lượng', source: 'standard Newtonian gravitation (fixture citation)', risk: 'medium' },
]

test('the editorial evaluator detects the four recorded algebra weaknesses with evidence', () => {
  const parsed = parseNarration(narration)
  const result = runEditorialHeuristics(parsed, { centralQuestion: expected.centralQuestion })
  assert.ok(result.findings.length >= expected.required.length)
  for (const required of expected.required) {
    const found = result.findings.find((finding) => finding.code === required.code && finding.excerpt.includes(required.excerptIncludes))
    assert.ok(found, `missing expected finding ${required.code} with excerpt ${required.excerptIncludes}`)
    assert.ok(found.problem.length > 20)
    assert.ok(found.evidence.length > 20)
    assert.ok(found.proposedFix.length > 20)
    assert.equal(found.paragraph >= 1, true)
    assert.equal(typeof found.sectionRef.sectionId, 'string')
  }
  assert.equal(narration.includes('status'), false, 'the fixture must not simulate a failure with a status field')
})

test('a fake self-review PASS on the algebra script cannot obtain a quality PASS', (t) => {
  const parsed = parseNarration(narration)
  const claims = buildClaims(parsed, CLAIMS)
  const throughline = buildThroughline(parsed, {
    centralQuestion: expected.centralQuestion,
    claimIds: claims.claims.map((claim) => claim.id),
  })
  const review = buildReview(parsed, '0'.repeat(64), {
    claimRefs: claims.claims.map((claim) => claim.id),
    reviewer: { kind: 'author', id: 'main-agent', method: 'self-review', readFullScript: true },
    criteria: { ...Object.fromEntries(Object.keys(reviewCriteria()).map((criterion) => [criterion, 'pass'])) },
    findings: [],
    status: 'pass',
  })
  const episode = makeEpisode(t, { narration, claims, throughline, review })
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, false)
  const errors = result.errors.join('\n')
  for (const required of expected.required) {
    assert.match(errors, new RegExp(required.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(errors, /does not address detected editorial issue/)
})

test('open heuristic findings with a pass review are invalid, not silently accepted', (t) => {
  const parsed = parseNarration(narration)
  const heuristics = runEditorialHeuristics(parsed, { centralQuestion: expected.centralQuestion }).findings
  const claims = buildClaims(parsed, CLAIMS)
  const throughline = buildThroughline(parsed, {
    centralQuestion: expected.centralQuestion,
    claimIds: claims.claims.map((claim) => claim.id),
  })
  const findings = heuristics.map((item, index) => ({
    id: `H${index + 1}`,
    criterion: item.category,
    severity: item.severity,
    excerpt: item.excerpt,
    paragraph: item.paragraph,
    sectionRef: item.sectionRef,
    problem: item.problem,
    evidence: item.evidence,
    proposedFix: item.proposedFix,
    status: 'open',
  }))
  const review = buildReview(parsed, '0'.repeat(64), {
    claimRefs: claims.claims.map((claim) => claim.id),
    reviewer: { kind: 'author', id: 'main-agent', method: 'self-review', readFullScript: true },
    findings,
    status: 'pass',
  })
  const episode = makeEpisode(t, { narration, claims, throughline, review })
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /open needs-work finding|remains open|unresolved needs-work/)
})

function reviewCriteria() {
  return {
    accuracy: 'pass',
    audienceFit: 'pass',
    narrativeArc: 'pass',
    reasoning: 'pass',
    continuity: 'pass',
    spokenLanguage: 'pass',
    pacing: 'pass',
    styleAndOriginality: 'pass',
  }
}
