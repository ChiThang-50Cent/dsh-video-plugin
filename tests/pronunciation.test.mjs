import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseNarration } from '../scripts/lib/narration-model.mjs'
import { compareSemantics, semanticFingerprint } from '../scripts/lib/pronunciation.mjs'
import { validateNarration } from '../scripts/validate-narration.mjs'
import {
  buildClaims,
  buildReview,
  buildThroughline,
  findSentence,
  makeEpisode,
  writeSegmentManifest,
} from './helpers/episode-fixtures.mjs'

const NARRATION = `# Phép trừ và cách đọc số

Ta có 16 trừ 5 bằng 11. Đây là một phép trừ đơn giản, nhưng nó đủ để kiểm tra cách bộ đọc xử lý con số và dấu trừ. Nếu bộ đọc bỏ mất số 16 hoặc đổi dấu trừ thành dấu cộng, người nghe sẽ nhận một kết luận sai dù chữ trên màn hình vẫn đúng.

Vì vậy, trước khi tổng hợp giọng nói, hãy kiểm tra từng chỗ khác nhau giữa chữ hiển thị và cách đọc. Một thay đổi hợp lệ là đọc 16 thành mười sáu. Một thay đổi không hợp lệ là đọc trừ thành cộng.

Kết luận của phép tính này là 11, và kết luận đó phải được giữ nguyên trong âm thanh.
`

function episode(t, reviewOverrides = {}, narration = NARRATION) {
  const parsed = parseNarration(narration)
  const claims = buildClaims(parsed, [{ id: 'c01', claim: '16 trừ 5 bằng 11', needle: '16 trừ 5 bằng 11', derivation: '16 - 5 = 11', risk: 'low' }])
  const throughline = buildThroughline(parsed, { centralQuestion: 'Phép trừ 16 trừ 5 bằng bao nhiêu?', claimIds: ['c01'] })
  const review = buildReview(parsed, '0'.repeat(64), { claimRefs: ['c01'], ...reviewOverrides })
  return makeEpisode(t, { narration, claims, throughline, review, parsedOverride: parsed })
}

function segmentsFrom(parsed, hash) {
  const spoken = parsed.normalizedSpoken
  const marker = ' Đây là'
  const cut = spoken.indexOf(marker)
  return {
    schemaVersion: 2,
    narrationSha256: hash,
    segments: [
      { id: 'seg-001', text: spoken.slice(0, cut).trim() },
      { id: 'seg-002', text: spoken.slice(cut + 1).trim() },
    ],
  }
}

function currentHash(dir) {
  return createHash('sha256').update(fs.readFileSync(path.join(dir, 'narration.md'))).digest('hex')
}

function run(created, manifest) {
  writeSegmentManifest(created.dir, manifest)
  return validateNarration(created.dir, { requireSegments: true })
}

test('valid pronunciation normalization 16 -> "mười sáu" is supported with provenance', (t) => {
  const created = episode(t)
  const parsed = parseNarration(NARRATION)
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  const first = manifest.segments[0]
  first.spokenText = first.text.replace('16', 'mười sáu')
  first.pronunciation = {
    version: 1,
    overrides: [{
      from: '16',
      to: 'mười sáu',
      kind: 'number',
      provenance: 'Vietnamese number reading table',
      justification: 'Keep the approved quantity 16 but read it as words because the engine reads bare digits inconsistently.',
      risk: 'low',
    }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.equal(result.data.segments.overrides, 1)
})

test('a spokenText override from "trừ" to "cộng" is rejected even when marked reviewed', (t) => {
  const parsed = parseNarration(NARRATION)
  const sentence = findSentence(parsed, '16 trừ 5 bằng 11').text
  const created = episode(t, {
    findings: [{
      id: 'F01', criterion: 'spokenLanguage', severity: 'note', excerpt: sentence, paragraph: 1,
      problem: 'The operator needs an explicit spoken form.', evidence: 'The engine may misread symbols.',
      proposedFix: 'Read the operator as a word without changing it.', status: 'resolved', resolution: 'Resolved by keeping trừ.',
    }],
  })
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  const first = manifest.segments[0]
  first.spokenText = first.text.replace('trừ', 'cộng')
  first.pronunciation = {
    version: 1,
    overrides: [{
      from: 'trừ',
      to: 'cộng',
      kind: 'symbol',
      provenance: 'reviewed by editor',
      justification: 'Claims to be a pronunciation change.',
      risk: 'high',
      reviewed: true,
      reviewedBy: 'fixture-editor',
      reviewRef: 'F01',
    }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /changes protected mathematical content|changes numbers\/operators\/signs/)
})

test('a number override cannot change the quantity', (t) => {
  const created = episode(t)
  const parsed = parseNarration(NARRATION)
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  const first = manifest.segments[0]
  first.spokenText = first.text.replace('16', 'mười bảy')
  first.pronunciation = {
    version: 1,
    overrides: [{ from: '16', to: 'mười bảy', kind: 'number', provenance: 'test', justification: 'Incorrect test change.', risk: 'low' }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /protected mathematical content|NUM:16/)
})

test('an override that omits a quantity is rejected', (t) => {
  const created = episode(t)
  const parsed = parseNarration(NARRATION)
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  const first = manifest.segments[0]
  first.spokenText = first.text.replace(' 5 ', ' ')
  first.pronunciation = {
    version: 1,
    overrides: [{ from: ' 5 ', to: ' ', kind: 'number', provenance: 'test', justification: 'Drop five.', risk: 'high' }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /changes|protected mathematical content/)
})

test('spokenText without declared overrides and changed displayText are rejected', (t) => {
  const created = episode(t)
  const parsed = parseNarration(NARRATION)
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  manifest.segments[0].spokenText = manifest.segments[0].text.replace('16', 'mười sáu')
  let result = run(created, manifest)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /without declared pronunciation\.overrides/)

  const manifest2 = segmentsFrom(parsed, currentHash(created.dir))
  manifest2.segments[0].displayText = manifest2.segments[0].text.replace('16', 'mười sáu')
  result = run(created, manifest2)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /displayText changes the approved wording/)
})

test('a reviewed ambiguous reading of the same operator is allowed', (t) => {
  const parsed = parseNarration(NARRATION)
  const sentence = findSentence(parsed, '16 trừ 5 bằng 11').text
  const created = episode(t, {
    findings: [{
      id: 'F01', criterion: 'spokenLanguage', severity: 'note', excerpt: sentence, paragraph: 1,
      problem: 'The operator should be read explicitly.', evidence: 'The symbol may be skipped by the engine.',
      proposedFix: 'Read it as "dấu trừ" without changing the operation.', status: 'resolved', resolution: 'The operator is preserved; only its spoken name changes.',
    }],
  })
  const manifest = segmentsFrom(parsed, currentHash(created.dir))
  const first = manifest.segments[0]
  first.spokenText = first.text
    .replace('trừ', 'dấu trừ')
  first.pronunciation = {
    version: 1,
    overrides: [{
      from: 'trừ', to: 'dấu trừ', kind: 'symbol', provenance: 'review F01', justification: 'The operator is unchanged; the engine reads the spoken name more reliably.', risk: 'low',
      reviewed: true, reviewedBy: 'fixture-editor', reviewRef: 'F01',
    }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, true, result.errors.join('\n'))
})

test('a segment manifest must match the frozen narration hash and cover every word', (t) => {
  const created = episode(t)
  const parsed = parseNarration(NARRATION)
  const manifest = segmentsFrom(parsed, 'a'.repeat(64))
  let result = run(created, manifest)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /different narration hash/)

  const manifest2 = segmentsFrom(parsed, currentHash(created.dir))
  manifest2.segments = manifest2.segments.slice(0, 1)
  result = run(created, manifest2)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /segment coverage does not match/)
})


test('symbol pronunciation can preserve the operator while changing its spoken name', () => {
  assert.equal(compareSemantics('%', 'phần trăm').ok, true)
  assert.equal(compareSemantics('16%', 'mười sáu phần trăm').ok, true)
  assert.equal(compareSemantics('16%', 'mười sáu').ok, false)
})

test('percent operator spans split number-word runs without hiding quantities', () => {
  assert.equal(compareSemantics('một phần trăm nghìn', 'một phần trăm').ok, false)
  assert.equal(compareSemantics('5% năm 2025', 'năm phần trăm năm hai nghìn không trăm hai mươi lăm').ok, true)
})

test('adjacent digit words form separate numbers without splitting linked numbers', () => {
  assert.deepEqual(semanticFingerprint('ba bốn').tokens, ['NUM:3', 'NUM:4'])
  assert.deepEqual(semanticFingerprint('một trăm lẻ năm').tokens, ['NUM:105'])
  assert.deepEqual(semanticFingerprint('hai mươi lăm').tokens, ['NUM:25'])
})

test('a function name after a number can be pronounced without becoming a unit', (t) => {
  const narration = NARRATION.replace('Đây là một phép trừ', 'Hàm 2 g(x) xuất hiện ở đây. Đây là một phép trừ')
  const created = episode(t, {}, narration)
  const manifest = segmentsFrom(parseNarration(narration), currentHash(created.dir))
  const segment = manifest.segments[0]
  segment.spokenText = segment.text.replace('g(x)', 'gờ(x)')
  segment.pronunciation = {
    version: 1,
    overrides: [{ from: 'g(x)', to: 'gờ(x)', kind: 'letter', provenance: 'test', justification: 'Read the function name as a letter.', risk: 'low' }],
  }
  const result = run(created, manifest)
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(semanticFingerprint('2 g').tokens, ['NUM:2', 'UNIT:g'])
})

test('semantic fingerprints preserve ordered quantities, operators, signs and units', async () => {
  const { compareSemantics } = await import('../scripts/lib/pronunciation.mjs')
  for (const [left, right] of [
    ['16 trừ 5 bằng 11', '5 trừ 16 bằng 11'],
    ['−5', '5'], ['–5', '5'], ['a * b', 'a b'], ['5 km', '5 m'],
    ['5 km 6 m', '5 m 6 km'],
    ['2x', 'ba x'], ['2*3', 'hai ba'], ['2 * x', 'hai x'],
  ]) assert.equal(compareSemantics(left, right).ok, false, `${left} / ${right}`)
  for (const [left, right] of [
    ['1.000 người', '1000 người'], ['5 km', 'năm ki-lô-mét'],
    ['1,5 mét', 'một phẩy năm mét'],
    ['16', 'mười sáu'], ['−5', 'âm năm'], ['a * b', 'a nhân b'],
    ['**Quan trọng**: 2 + 3 = 5', 'Quan trọng: hai cộng ba bằng năm'],
    ['*ghi chú* 4', 'ghi chú bốn'],
    ['hàm g(x) = 2x', 'hàm g(x) bằng hai x'],
    ['a m b', 'a b'], ['a * b', 'a nhân b'], ['2*3', 'hai nhân ba'],
    ['2 * x', 'hai nhân x'],
  ]) assert.equal(compareSemantics(left, right).ok, true, `${left} / ${right}`)
  const ambiguous = compareSemantics('1.5 mét', '15 mét')
  assert.equal(ambiguous.ok, false)
  assert.match(ambiguous.missing.join(' '), /1\.5/)
})
