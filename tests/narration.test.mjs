import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { extractSpokenProse } from '../scripts/validate-narration.mjs'
import { parseFrontmatter } from '../index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const validator = path.join(repoRoot, 'scripts', 'validate-narration.mjs')
const fixtures = path.join(here, 'fixtures')

const PASS_CRITERIA = {
  accuracy: 'pass',
  audienceFit: 'pass',
  narrativeArc: 'pass',
  reasoning: 'pass',
  continuity: 'pass',
  spokenLanguage: 'pass',
  pacing: 'pass',
  styleAndOriginality: 'pass',
}

function sha(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function fixture(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8')
}

function passingClaims() {
  return {
    status: 'PASS',
    claims: [
      { claim: '3 + (-3) = 0', source: 'arithmetic', verified: true, risk: 'low', fix: null },
      { claim: '(-2) x 3 = -6', source: 'arithmetic', verified: true, risk: 'low', fix: null },
      { claim: '(-2) x (-3) = 6 follows from distributivity', source: 'derivation', verified: true, risk: 'medium', fix: null },
    ],
  }
}

function baseReview(overrides = {}) {
  return {
    schemaVersion: 1,
    narrationFile: 'narration.md',
    status: 'pass',
    reviewedAt: new Date().toISOString(),
    criteria: { ...PASS_CRITERIA },
    blockers: [],
    actionableFindings: [],
    claimCheckFile: 'claim-check.json',
    reviewPasses: 1,
    ...overrides,
  }
}

function makeEpisode(t, { narration, claims = passingClaims(), review = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narration-gate-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'narration.md'), narration)
  fs.writeFileSync(path.join(dir, 'claim-check.json'), JSON.stringify(claims, null, 2))
  fs.writeFileSync(path.join(dir, 'narration-review.json'), JSON.stringify({
    ...baseReview(),
    narrationSha256: sha(path.join(dir, 'narration.md')),
    ...review,
  }, null, 2))
  return dir
}

function run(dir, args = []) {
  const result = spawnSync(process.execPath, [validator, dir, '--json', ...args], { encoding: 'utf8' })
  let json
  try {
    json = JSON.parse(result.stdout)
  } catch {
    json = undefined
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('acceptance A: a listener-first Vietnamese draft passes G0', (t) => {
  const dir = makeEpisode(t, { narration: fixture('narration-negative.md') })
  const { status, json } = run(dir)
  assert.equal(status, 0, json?.errors?.join('\n'))
  assert.equal(json.ok, true)
  assert.ok(json.data.spokenChars > 1200, 'the draft must be substantive spoken prose')
  assert.equal(json.data.reviewStatus, 'pass')
  assert.equal(json.data.claimStatus, 'PASS')
})

test('acceptance B: an engaging but false limit claim is blocked', (t) => {
  const dir = makeEpisode(t, {
    narration: fixture('narration-limit-bad.md'),
    review: {
      status: 'blocked',
      criteria: { ...PASS_CRITERIA, accuracy: 'block' },
      blockers: ['Two-sided limit at zero does not exist; only the right-hand limit is +infinity.'],
      actionableFindings: [{
        criterion: 'accuracy',
        severity: 'block',
        quote: 'giới hạn của một phần x tại 0 là dương vô cực',
        problem: 'The statement is false for the two-sided limit.',
        fix: 'State x -> 0+ explicitly, then the left-hand behavior and the two-sided conclusion.',
      }],
    },
  })
  const { status, json } = run(dir)
  assert.equal(status, 1)
  const errors = json.errors.join('\n')
  assert.match(errors, /review status is "blocked"/)
  assert.match(errors, /criteria\.accuracy/)
  assert.match(errors, /two-sided|right-hand/i)
})

test('an unverified high-risk claim blocks even with a passing review', (t) => {
  const dir = makeEpisode(t, {
    narration: fixture('narration-negative.md'),
    claims: {
      status: 'PASS',
      claims: [{ claim: 'â m nhân âm bằng dương trong mọi vành', source: 'unknown', verified: false, risk: 'high' }],
    },
  })
  const { status, json } = run(dir)
  assert.equal(status, 1)
  assert.match(json.errors.join('\n'), /unverified high-risk claim/)
})

test('acceptance C: scene captions cannot pass as a finished script', (t) => {
  const dir = makeEpisode(t, {
    narration: fixture('narration-fragments.md'),
    review: {
      status: 'blocked',
      criteria: { ...PASS_CRITERIA, narrativeArc: 'needs-work', reasoning: 'needs-work', continuity: 'needs-work' },
      blockers: ['The script is a list of scene captions with no through-line or explanation.'],
      actionableFindings: [{
        criterion: 'narrativeArc',
        severity: 'block',
        quote: 'Ba bình phương bằng chín. Bốn bình phương bằng mười sáu.',
        problem: 'The numbers never build a question or a pattern.',
        fix: 'Rewrite the middle as one observation, one question and one justification.',
      }],
    },
  })
  const { status, json } = run(dir)
  assert.equal(status, 1)
  const errors = json.errors.join('\n')
  assert.match(errors, /criteria\.narrativeArc/)
  assert.match(errors, /review status is "blocked"/)
})

test('acceptance D: freeze, coverage, stale hash and focused repair', (t) => {
  const narration = fixture('narration-negative.md')
  const dir = makeEpisode(t, { narration })
  const narrationPath = path.join(dir, 'narration.md')
  const reviewPath = path.join(dir, 'narration-review.json')
  const segmentsPath = path.join(dir, 'audio', 'segments.json')
  fs.mkdirSync(path.dirname(segmentsPath), { recursive: true })

  assert.equal(run(dir).status, 0)

  const spoken = extractSpokenProse(narration)
  const cut = spoken.indexOf(' ', Math.floor(spoken.length / 2))
  const segments = {
    schemaVersion: 1,
    narrationSha256: sha(narrationPath),
    segments: [
      { id: 'seg-001', text: spoken.slice(0, cut).trim() },
      { id: 'seg-002', text: spoken.slice(cut).trim() },
    ],
  }
  fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2))
  assert.equal(run(dir, ['--require-segments']).status, 0, 'a complete manifest must pass')

  fs.writeFileSync(segmentsPath, JSON.stringify({ ...segments, segments: [segments.segments[0]] }, null, 2))
  let result = run(dir, ['--require-segments'])
  assert.equal(result.status, 1)
  assert.match(result.json.errors.join('\n'), /segment coverage/)

  fs.writeFileSync(segmentsPath, JSON.stringify({
    ...segments,
    segments: [{ ...segments.segments[0], text: `${segments.segments[0].text} thêm` }, segments.segments[1]],
  }, null, 2))
  result = run(dir, ['--require-segments'])
  assert.equal(result.status, 1)
  assert.match(result.json.errors.join('\n'), /segment coverage/)

  fs.writeFileSync(segmentsPath, JSON.stringify(segments, null, 2))
  fs.appendFileSync(narrationPath, '\n\nHết.\n')
  result = run(dir, ['--require-segments'])
  assert.equal(result.status, 1)
  assert.match(result.json.errors.join('\n'), /review hash does not match/)

  fs.writeFileSync(narrationPath, narration)
  fs.writeFileSync(reviewPath, JSON.stringify({
    ...baseReview(),
    narrationSha256: sha(narrationPath),
  }, null, 2))
  assert.equal(run(dir, ['--require-segments']).status, 0, 'repairing the affected subset restores the gate')
})

test('acceptance E: a documentary script passes without mathematics', (t) => {
  const dir = makeEpisode(t, {
    narration: fixture('narration-documentary.md'),
    claims: {
      status: 'PASS',
      claims: [
        { claim: 'Hội An houses used durable wood species', source: 'conservation literature (to cite in production)', verified: true, risk: 'medium' },
        { claim: 'Many structural members were replaced over time', source: 'conservation records (to cite in production)', verified: true, risk: 'medium' },
      ],
    },
  })
  const { status, json } = run(dir)
  assert.equal(status, 0, json?.errors?.join('\n'))
  assert.ok(json.data.spokenChars > 800)
})

test('raw LaTeX in spoken prose is a blocker', (t) => {
  const dir = makeEpisode(t, {
    narration: '# Công thức\n\nTa có $\\frac{1}{2}$ là một nửa, và đó là điều cần nhớ trong bài này.\n',
  })
  const { status, json } = run(dir)
  assert.equal(status, 1)
  assert.match(json.errors.join('\n'), /LaTeX/)
})

test('segments can be required before synthesis', (t) => {
  const dir = makeEpisode(t, { narration: fixture('narration-negative.md') })
  const { status, json } = run(dir, ['--require-segments'])
  assert.equal(status, 1)
  assert.match(json.errors.join('\n'), /segment manifest is required/)
})

test('skills keep metadata, reference links and the size budget', () => {
  const skillsDir = path.join(repoRoot, 'skills')
  const dirs = fs.readdirSync(skillsDir).filter((entry) => fs.statSync(path.join(skillsDir, entry)).isDirectory())
  assert.equal(dirs.length, 9)
  const names = new Set()
  for (const entry of dirs) {
    const file = path.join(skillsDir, entry, 'SKILL.md')
    const content = fs.readFileSync(file, 'utf8')
    assert.ok(content.length <= 8192, `${entry} SKILL.md is ${content.length} characters`)
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
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-produce', 'SKILL.md'), 'utf8'), /validate-narration\.mjs/)
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-audio', 'SKILL.md'), 'utf8'), /segments\.json/)
  assert.match(fs.readFileSync(path.join(skillsDir, 'video-qa', 'SKILL.md'), 'utf8'), /validate-narration\.mjs/)
})
