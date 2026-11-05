import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseNarration, extractSpokenProse } from '../scripts/lib/narration-model.mjs'
import { validateNarration } from '../scripts/validate-narration.mjs'
import {
  buildClaims,
  buildReview,
  buildThroughline,
  findSentence,
  makeEpisode,
  makeSegments,
  writeSegmentManifest,
} from './helpers/episode-fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, 'fixtures')
const algebraFixture = path.join(fixtures, 'editorial', 'algebra-la-gi', 'narration.md')

function fixture(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8')
}

const NEGATIVE_CLAIMS = [
  { id: 'c01', claim: '3 + (-3) = 0', needle: 'ba cộng với âm ba bằng không', source: 'arithmetic', risk: 'low' },
  { id: 'c02', claim: '2 x (-3) = -6', needle: 'hai nhân âm ba là âm sáu', source: 'arithmetic', risk: 'low' },
  { id: 'c03', claim: 'distributivity forces (-2)(-3)=6', needle: 'âm sáu cộng với tích của âm hai và âm ba phải bằng không', derivation: '(-2)(3+(-3)) = 0; -6 + x = 0', risk: 'medium' },
]

const DOCUMENTARY_CLAIMS = [
  { id: 'c01', claim: 'Hội An houses used durable wood species', needle: 'Những loại gỗ được dùng ở đây thường có độ bền cao', source: 'conservation literature (fixture citation)', risk: 'medium' },
  { id: 'c02', claim: 'many structural members were replaced over time', needle: 'Nhiều phần đã được thay qua thời gian', source: 'conservation records (fixture citation)', risk: 'medium' },
]

function passingEpisode(t, narration, options = {}) {
  const parsed = parseNarration(narration)
  const claims = buildClaims(parsed, options.claimSpecs ?? NEGATIVE_CLAIMS)
  const throughline = buildThroughline(parsed, {
    centralQuestion: options.centralQuestion ?? 'Vì sao âm nhân âm lại thành dương?',
    claimIds: claims.claims.map((claim) => claim.id),
  })
  const review = buildReview(parsed, '0'.repeat(64), {
    claimRefs: claims.claims.map((claim) => claim.id),
    ...options.review,
  })
  return makeEpisode(t, {
    narration,
    claims,
    throughline,
    review: { ...review, narrationSha256: undefined },
    mode: options.mode,
    production: options.production,
  })
}

function hashOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function currentHash(episode) {
  return hashOf(fs.readFileSync(path.join(episode.dir, 'narration.md'), 'utf8'))
}


test('acceptance: a listener-first Vietnamese lesson passes both gates', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.equal(result.data.integrity.ok, true)
  assert.equal(result.data.editorial.ok, true)
  assert.ok(result.data.spokenChars > 1200)
  assert.equal(result.data.reviewStatus, 'pass')
  assert.equal(result.data.claimStatus, 'PASS')
  assert.match(result.data.editorial.data.caveat, /does not prove/)
})

test('acceptance: a documentary passes without mathematics', (t) => {
  const narration = fixture('narration-documentary.md')
  const parsed = parseNarration(narration)
  const claims = buildClaims(parsed, DOCUMENTARY_CLAIMS)
  const throughline = buildThroughline(parsed, {
    centralQuestion: 'Vì sao những ngôi nhà gỗ Hội An vẫn đứng được?',
    claimIds: claims.claims.map((claim) => claim.id),
  })
  const review = buildReview(parsed, '0'.repeat(64), { claimRefs: claims.claims.map((claim) => claim.id) })
  const episode = makeEpisode(t, { narration, claims, throughline, review })
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.ok(result.data.editorial.data.heuristicFindings.every((finding) => finding.severity !== 'block'))
})

test('an incorrect two-sided limit with a fake self-review PASS cannot obtain a content PASS', (t) => {
  const narration = fixture('narration-limit-bad.md')
  const parsed = parseNarration(narration)
  const falseClaim = {
    id: 'c01',
    claim: 'Giới hạn của một phần x tại 0 là dương vô cực.',
    source: 'self-review (author says so)',
    verified: true,
    risk: 'high',
    location: {
      sectionRef: { sectionId: parsed.sections[0].sectionId },
      paragraph: 2,
      excerpt: findSentence(parsed, 'giới hạn của một phần x tại 0 là dương vô cực').text,
    },
  }
  const claims = {
    schemaVersion: 2,
    status: 'PASS',
    reviewedAt: new Date().toISOString(),
    coverage: { claimsExpected: true, justification: null },
    claims: [falseClaim],
    conditions: [],
  }
  const throughline = buildThroughline(parsed, { centralQuestion: 'Giới hạn của một phần x tại 0 là gì?', claimIds: ['c01'] })
  const review = buildReview(parsed, '0'.repeat(64), {
    claimRefs: ['c01'],
    reviewer: { kind: 'author', id: 'main-agent', method: 'self-review', readFullScript: true },
    status: 'pass',
  })
  const episode = makeEpisode(t, {
    narration,
    claims,
    throughline,
    review,
    production: { narrationRisk: 'high', qualitySensitive: true },
  })
  const editorialOnly = validateNarration(episode.dir, { mode: 'editorial' })
  assert.equal(editorialOnly.ok, false, 'editorial gate must reject the fake self-review')
  const text = editorialOnly.errors.join('\n')
  assert.match(text, /math\.limit\.two-sided-qualification/)
  assert.match(text, /two-sided|right-hand/i)
  const full = validateNarration(episode.dir)
  assert.equal(full.ok, false)
  assert.match(full.errors.join('\n'), /independent review|independentReview/)
  assert.equal(editorialOnly.data.editorial.data.caveat.includes('does not prove'), true)
})

test('an unresolved blocking finding fails G0 even when blockers is empty', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const parsed = parseNarration(fixture('narration-negative.md'))
  const hash = currentHash(episode)
  const sentence = findSentence(parsed, 'Hãy tưởng tượng chúng ta đứng trên một trục số').text
  const review = buildReview(parsed, hash, {
    claimRefs: NEGATIVE_CLAIMS.map((claim) => claim.id),
    findings: [{
      id: 'F01',
      criterion: 'reasoning',
      severity: 'block',
      excerpt: sentence,
      paragraph: 2,
      sectionRef: { sectionId: parsed.sections[0].sectionId },
      problem: 'The analogy is asserted without stating where it stops working.',
      evidence: 'The paragraph never states a condition of use; a listener can over-generalize the flip.',
      proposedFix: 'State that the analogy preserves direction but not magnitude, then return to the algebra.',
      status: 'open',
    }],
  })
  fs.writeFileSync(path.join(episode.dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /unresolved blocking finding|passing review cannot contain/)
})

test('claims need evidence and a real narration location; high-risk without evidence blocks', (t) => {
  const narration = fixture('narration-negative.md')
  const parsed = parseNarration(narration)
  const sentence = findSentence(parsed, 'ba cộng với âm ba bằng không').text
  const claims = {
    schemaVersion: 2,
    status: 'PASS',
    reviewedAt: new Date().toISOString(),
    coverage: { claimsExpected: true, justification: null },
    claims: [
      { id: 'c01', claim: 'A claim marked verified without evidence.', verified: true, risk: 'low', location: { sectionRef: { sectionId: parsed.sections[0].sectionId }, paragraph: 4, excerpt: sentence } },
      { id: 'c02', claim: 'A high-risk claim without evidence.', verified: false, risk: 'high', location: { sectionRef: { sectionId: parsed.sections[0].sectionId }, paragraph: 4, excerpt: sentence } },
      { id: 'c03', claim: 'A claim with no location at all.', source: 'memory', verified: true, risk: 'low' },
    ],
    conditions: [],
  }
  const throughline = buildThroughline(parsed, { centralQuestion: 'Vì sao âm nhân âm lại thành dương?', claimIds: ['c01', 'c02', 'c03'] })
  const review = buildReview(parsed, '0'.repeat(64), { claimRefs: ['c01', 'c02', 'c03'] })
  const episode = makeEpisode(t, { narration, claims, throughline, review })
  const result = validateNarration(episode.dir, { mode: 'integrity' })
  assert.equal(result.ok, false)
  const errors = result.errors.join('\n')
  assert.match(errors, /no source, derivation or evidence/)
  assert.match(errors, /high-risk and not verified/)
  assert.match(errors, /needs location/)
})

test('an empty claim list cannot silently pass claim-bearing narration', (t) => {
  const narration = fixture('narration-negative.md')
  const episode = passingEpisode(t, narration, { claimSpecs: [] })
  const result = validateNarration(episode.dir, { mode: 'integrity' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /claim list is empty|claim-bearing/)
})

test('review evidence must cite real sections and cover the whole script', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const review = JSON.parse(fs.readFileSync(path.join(episode.dir, 'narration-review.json'), 'utf8'))
  review.criteriaEvidence.accuracy = [{ sectionRef: { sectionId: 'sec-99' }, paragraph: 1, excerpt: 'This sentence does not exist.', note: 'Fabricated evidence.' }]
  delete review.reviewedSections
  fs.writeFileSync(path.join(episode.dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /unknown sectionId|does not occur|never cites/)
})

test('a passing review with no cited evidence fails the quality gate', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const review = JSON.parse(fs.readFileSync(path.join(episode.dir, 'narration-review.json'), 'utf8'))
  review.criteriaEvidence = {}
  fs.writeFileSync(path.join(episode.dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  const result = validateNarration(episode.dir, { mode: 'editorial' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /no cited evidence|criteriaEvidence/)
})

test('through-line map must cover every narration section', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const throughline = JSON.parse(fs.readFileSync(path.join(episode.dir, 'throughline-map.json'), 'utf8'))
  throughline.sections = []
  fs.writeFileSync(path.join(episode.dir, 'throughline-map.json'), `${JSON.stringify(throughline, null, 2)}\n`)
  const result = validateNarration(episode.dir, { mode: 'integrity' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /throughline\.sections|throughline map does not cover/)
})

test('contradictory review state (pass with blockers) fails', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const review = JSON.parse(fs.readFileSync(path.join(episode.dir, 'narration-review.json'), 'utf8'))
  review.blockers = ['Still blocked.']
  fs.writeFileSync(path.join(episode.dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /blocker\(s\) but status is "pass"/)
})

test('the narration extractor keeps display math and production notes out of speech', () => {
  const parsed = parseNarration('# Title\n\nSpoken line.\n\n> note\n\n```text\na + b\n```\n\n## Next\n\nMore speech.\n')
  assert.equal(parsed.spokenText, 'Spoken line.\n\nMore speech.')
  assert.equal(parsed.displayBlocks.length, 1)
  assert.equal(parsed.sections.length, 2)
  assert.equal(extractSpokenProse('# X\n\nY\n'), 'Y')
})

test('silent and text-only modes do not require a fake narration', (t) => {
  for (const mode of ['silent', 'text-only']) {
    const dir = makeEpisode(t, { narration: '', mode, createContracts: false }).dir
    const result = validateNarration(dir, { requireSegments: true })
    assert.equal(result.ok, true, `${mode}: ${result.errors.join('\n')}`)
    assert.equal(result.data.mode, mode)
    assert.match(result.data.integrity.data.skipped, /no voice-over/)
    assert.equal(result.data.editorial.data.skipped !== undefined, true)
  }
})

test('skills keep metadata, reference links and the size budget', () => {
  const skillsDir = path.join(here, '..', 'skills')
  const dirs = fs.readdirSync(skillsDir).filter((entry) => fs.statSync(path.join(skillsDir, entry)).isDirectory())
  assert.equal(dirs.length, 9)
  const names = new Set()
  for (const entry of dirs) {
    const file = path.join(skillsDir, entry, 'SKILL.md')
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.length <= 9000, `${entry} SKILL.md is ${content.length} characters`)
    const { meta } = parseFrontmatter(content)
    assert.ok(meta.name && meta.description, `${entry} needs frontmatter`)
    assert.equal(meta.name, entry)
    assert.ok(!names.has(meta.name), `duplicate skill name ${meta.name}`)
    names.add(meta.name)
  }
  const narrationSkill = fs.readFileSync(path.join(skillsDir, 'video-narration', 'SKILL.md'), 'utf8')
  for (const reference of ['narration-style-vi.md', 'annotated-examples.md', 'script-review.md']) {
    assert.ok(fs.existsSync(path.join(skillsDir, 'video-narration', 'references', reference)), `${reference} is missing`)
    assert.ok(narrationSkill.includes(reference), `SKILL.md does not point to ${reference}`)
  }
  assert.match(narrationSkill, /throughline-map/)
  assert.match(narrationSkill, /independent/)
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-produce', 'SKILL.md'), 'utf8'), /validate-narration\.mjs/)
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-audio', 'SKILL.md'), 'utf8'), /spokenText/)
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-qa', 'SKILL.md'), 'utf8'), /--release|release gate/)
})

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { meta: {} }
  const end = lines.indexOf('---', 1)
  const meta = {}
  for (let index = 1; index < end; index += 1) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index])
    if (match !== null) meta[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return { meta }
}

test('a genuinely claim-free script may declare coverage with a justification', (t) => {
  const narration = '# Buổi sáng\n\nÁnh sáng tràn qua khung cửa và đọng lại trên mặt bàn gỗ. Người nghe có thể hình dung một căn phòng yên tĩnh, nơi mọi vật còn đang ngủ. Không có con số nào cần kiểm chứng, không có tuyên bố khoa học nào được đưa ra. Đây chỉ là một đoạn mở đầu quan sát, để người xem chậm lại trước khi bước vào câu chuyện.\n\nRồi tiếng chim ngoài hiên cất lên, rất khẽ, như một dấu phẩy trong câu văn dài của buổi sớm. Không có gì phải chứng minh; chỉ có một trạng thái cần được nghe thấy.\n'
  const episode = passingEpisode(t, narration, { claimSpecs: [], centralQuestion: 'Buổi sáng yên tĩnh được cảm nhận như thế nào?' })
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, true, result.errors.join('\n'))
  const claims = JSON.parse(fs.readFileSync(path.join(episode.dir, 'claim-check.json'), 'utf8'))
  assert.equal(claims.coverage.claimsExpected, false)
  assert.ok(claims.coverage.justification.length > 20)
})

test('high-risk narration passes only with a genuine independent review', (t) => {
  const narration = '# Nước sôi\n\nỞ áp suất khí quyển tiêu chuẩn, nước tinh khiết sôi ở một trăm độ C. Đây là một mốc quen thuộc trong đời sống và trong phòng thí nghiệm. Nhưng con số đó không phải một hằng số vũ trụ: khi áp suất thay đổi, nhiệt độ sôi cũng thay đổi. Trên núi cao, nước sôi ở nhiệt độ thấp hơn, nên việc nấu ăn cần nhiều thời gian hơn. Điều cần nhớ là mốc một trăm độ C gắn với một điều kiện cụ thể, không phải với mọi nơi trên Trái Đất.\n'
  const parsed = parseNarration(narration)
  const claims = buildClaims(parsed, [{
    id: 'c01', claim: 'Pure water boils at 100 °C at standard atmospheric pressure.', needle: 'nước tinh khiết sôi ở một trăm độ C',
    source: 'standard physical chemistry definition (fixture citation)', risk: 'high',
  }])
  const throughline = buildThroughline(parsed, { centralQuestion: 'Nước sôi ở nhiệt độ nào và điều kiện nào?', claimIds: ['c01'] })
  const review = buildReview(parsed, '0'.repeat(64), {
    claimRefs: ['c01'],
    reviewer: { kind: 'independent', id: 'editor-2', method: 'fresh-context', readFullScript: true },
    independentReview: {
      required: true, status: 'pass',
      reviewer: { kind: 'independent', id: 'editor-3', method: 'fresh-context', readFullScript: true },
      reviewedAt: new Date().toISOString(), narrationSha256: '0'.repeat(64),
      summary: 'Read the full script and checked the pressure condition against the cited definition.',
      evidence: [{ excerpt: 'nước tinh khiết sôi ở một trăm độ C' }],
    },
  })
  const episode = makeEpisode(t, {
    narration, claims, throughline, review,
    production: { narrationRisk: 'high', qualitySensitive: true },
  })
  // The helper aligns the review hash; align the nested independent-review hash too.
  const reviewPath = path.join(episode.dir, 'narration-review.json')
  const stored = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  stored.independentReview.narrationSha256 = stored.narrationSha256
  fs.writeFileSync(reviewPath, JSON.stringify(stored, null, 2))
  const result = validateNarration(episode.dir)
  assert.equal(result.ok, true, result.errors.join('\n'))
})


test('the CLI exposes integrity and editorial as separate gates', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const cli = path.join(here, '..', 'scripts', 'validate-narration.mjs')
  for (const mode of ['--integrity', '--editorial', '--gate']) {
    const result = spawnSync(process.execPath, [cli, episode.dir, mode, '--json'], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${mode}: ${result.stderr}\n${result.stdout}`)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.data.gate, mode.slice(2))
  }
  const missing = spawnSync(process.execPath, [cli, episode.dir, '--require-segments', '--json'], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(JSON.parse(missing.stdout).errors.join('\n'), /segment manifest is required/)
})

test('the bounded review budget cannot be exceeded by a self-certified pass', (t) => {
  const episode = passingEpisode(t, fixture('narration-negative.md'))
  const review = JSON.parse(fs.readFileSync(path.join(episode.dir, 'narration-review.json'), 'utf8'))
  review.reviewPasses = 3
  fs.writeFileSync(path.join(episode.dir, 'narration-review.json'), `${JSON.stringify(review, null, 2)}\n`)
  const result = validateNarration(episode.dir, { mode: 'integrity' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /reviewPasses is 3|escalate/)
})
