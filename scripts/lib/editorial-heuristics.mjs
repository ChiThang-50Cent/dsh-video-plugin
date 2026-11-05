/**
 * Deterministic editorial triage.
 *
 * These heuristics do not understand meaning and cannot certify a script. They
 * detect a small set of high-confidence editorial anti-patterns that a review
 * must either fix or explicitly discuss with evidence. This is deliberately
 * conservative: a heuristic that cannot explain itself is a warning, not a
 * claim of correctness.
 */
import { containsExcerpt, normalizeForMatch, splitSentences } from './narration-model.mjs'

const META_OPENING = /(?:chào mừng|hôm nay (?:chúng ta|mình)|trong video này|bài học hôm nay|hãy cùng nhau (?:tìm hiểu|khám phá)|chúng ta sẽ cùng (?:tìm hiểu|khám phá)|video này sẽ)/iu

const EXTERNAL_DOMAIN_MARKERS = [
  'vật lý', 'lực hấp dẫn', 'newton', 'khối lượng', 'trọng lực', 'vận tốc', 'định luật vạn vật hấp dẫn',
  'sinh học', 'tế bào', 'adn', 'dna', 'tiến hóa',
  'lịch sử', 'chiến tranh', 'triều đại',
  'kinh tế', 'lạm phát', 'cổ phiếu', 'thị trường chứng khoán',
  'bóng đá', 'thể thao', 'olympic',
]

const BRIDGE_BACK = /(?:quay lại|trở lại|liên quan (?:tới|đến)|điều này (?:cho thấy|giải thích|dẫn tới)|vì vậy|chính vì|ứng dụng (?:của|vào)|ví dụ này (?:cho thấy|minh họa))/iu

const STOP_WORDS = new Set([
  'và', 'là', 'của', 'cho', 'một', 'những', 'các', 'cái', 'điều', 'khi', 'thì', 'mà', 'với', 'trong', 'ra', 'vào',
  'để', 'từ', 'đến', 'về', 'như', 'vậy', 'này', 'đó', 'kia', 'gì', 'sao', 'thế', 'nào', 'có', 'không', 'được',
  'người', 'ta', 'chúng', 'mình', 'bạn', 'họ', 'nó', 'ở', 'tại', 'bằng', 'vì', 'nên', 'nếu', 'nhưng', 'hay', 'hoặc',
])

function contentWords(text) {
  return new Set(
    normalizeForMatch(text)
      .split(/\s+/u)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  )
}

function firstSentenceOfSection(section) {
  const paragraph = section.paragraphs[0]
  if (paragraph === undefined) return undefined
  return splitSentences(paragraph.text)[0]
}

function sentenceEntries(parsed) {
  const entries = []
  for (const paragraph of parsed.paragraphs) {
    for (const sentence of splitSentences(paragraph.text)) {
      entries.push({ sentence, paragraph: paragraph.index, sectionId: paragraph.sectionId })
    }
  }
  return entries
}

function finding(code, category, severity, excerpt, paragraph, sectionId, problem, evidence, proposedFix, confidence = 'high') {
  return {
    code,
    category,
    severity,
    excerpt,
    paragraph,
    sectionRef: { sectionId },
    problem,
    evidence,
    proposedFix,
    confidence,
  }
}

function detectForcedOpening(parsed) {
  const first = parsed.sections[0]?.paragraphs[0]
  if (first === undefined) return []
  const sentences = splitSentences(first.text)
  const opening = sentences.slice(0, 2).join(' ')
  if (!META_OPENING.test(opening)) return []
  const excerpt = sentences.find((sentence) => META_OPENING.test(sentence)) ?? sentences[0]
  return [finding(
    'opening.meta-greeting',
    'audienceFit',
    'needs-work',
    excerpt,
    first.index,
    first.sectionId,
    'The script opens by announcing the video or greeting the audience instead of starting from a concrete observation, puzzle or question.',
    'A listener decides within the first sentence whether the film has begun. Meta openings spend that attention on production furniture and delay the central question.',
    'Replace the greeting/agenda with a concrete observation, contradiction or question that the episode will resolve; keep the central question in the prose, not in an announcement.',
  )]
}

function detectDisconnectedDigression(parsed, options) {
  const central = contentWords(options.centralQuestion ?? '')
  if (central.size === 0) return []
  const findings = []
  for (const section of parsed.sections) {
    const text = section.paragraphs.map((paragraph) => paragraph.text).join(' ')
    const lowerText = text.toLowerCase()
    const marker = EXTERNAL_DOMAIN_MARKERS.find((candidate) => lowerText.includes(candidate))
    if (marker === undefined) continue
    const opening = section.paragraphs[0].text
    const openingSentences = splitSentences(opening).slice(0, 2).join(' ')
    // A legitimate example names the central topic in its opening and builds a
    // bridge. A digression introduces the second domain first and explains only
    // afterwards (or never).
    if ([...central].some((word) => openingSentences.toLowerCase().includes(word))) continue
    if (BRIDGE_BACK.test(openingSentences)) continue
    const sentence = splitSentences(opening).find((candidate) => candidate.toLowerCase().includes(marker)) ?? splitSentences(opening)[0]
    findings.push(finding(
      'continuity.external-digression',
      'continuity',
      'needs-work',
      sentence,
      section.paragraphs[0].index,
      section.sectionId,
      `The section introduces the external domain "${marker}" without showing how it answers the episode's central question.`,
      'A new domain asks the listener to build a second mental model. Unless the bridge earns it, the example reads as a digression and weakens the through-line.',
      `State why this ${marker} example is the same idea as the central question, or remove it and use an example inside the episode's own domain.`,
    ))
  }
  return findings
}

function detectRepetition(parsed) {
  const entries = sentenceEntries(parsed)
  const byNormalized = new Map()
  for (const entry of entries) {
    const key = normalizeForMatch(entry.sentence)
      .replace(/[.!?…]+$/u, '')
      .trim()
    if (key.split(/\s+/u).length < 4) continue
    if (!byNormalized.has(key)) byNormalized.set(key, [])
    byNormalized.get(key).push(entry)
  }
  const findings = []
  for (const [key, occurrences] of byNormalized) {
    if (occurrences.length < 2) continue
    const first = occurrences[0]
    const places = occurrences.map((entry) => `paragraph ${entry.paragraph}`).join(', ')
    findings.push(finding(
      'repetition.verbatim',
      'styleAndOriginality',
      'needs-work',
      first.sentence,
      first.paragraph,
      first.sectionId,
      `The same sentence is repeated at ${places}. Repetition is only useful when it changes meaning or emphasis; here it restates an abstract conclusion.`,
      `Repeated sentence: "${key}". A listener hears this as filler rather than development, and it inflates the perceived length without adding a new step.`,
      'Keep at most one occurrence at the point where it lands; replace the others with a concrete consequence, a new example, or a transition that advances the argument.',
    ))
  }

  const abstract = entries.filter((entry) => /^(?:đại số|toán học|văn học|khoa học|nghệ thuật|lịch sử|triết học)\s+(?:là|chính là)\s+/iu.test(entry.sentence))
  if (abstract.length >= 2) {
    const first = abstract[0]
    findings.push(finding(
      'repetition.abstract-conclusion',
      'narrativeArc',
      'needs-work',
      first.sentence,
      first.paragraph,
      first.sectionId,
      'The script keeps restating what the subject is in abstract terms instead of adding a concrete step that the listener can check.',
      `Abstract definition sentences appear ${abstract.length} times (${abstract.map((entry) => `paragraph ${entry.paragraph}`).join(', ')}). This creates a loop: the conclusion is asserted again rather than earned again.`,
      'Replace all but the final definition with a concrete worked consequence, a boundary case, or a bridge that changes what the listener can do.',
    ))
  }
  return findings
}

function detectUnexplainedIdentitySwitch(parsed) {
  const findings = []
  const identityCue = /(?:\(a\s*\+\s*b\)\s*\^?\s*2|a cộng b,?\s*tất cả bình phương|bình phương của một tổng)/iu
  const differenceCue = /(?:hiệu hai bình phương|a\s*bình phương\s*trừ\s*b\s*bình phương|a\s*\^?\s*2\s*-\s*b\s*\^?\s*2|a²\s*[-−]\s*b²)/iu
  const numericCue = /(?:99\s*[.·×x*]\s*101|chín mươi chín nhân một trăm lẻ một|chín mươi chín nhân với một trăm lẻ một)/iu
  for (const section of parsed.sections) {
    const text = section.paragraphs.map((paragraph) => paragraph.text).join(' ')
    if (!identityCue.test(text) || !numericCue.test(text)) continue
    const sentences = splitSentences(text)
    const numericIndex = sentences.findIndex((sentence) => numericCue.test(sentence))
    if (numericIndex === -1) continue
    const before = sentences.slice(0, numericIndex).join(' ')
    if (differenceCue.test(before)) continue
    const sentence = sentences[numericIndex]
    const paragraph = section.paragraphs.find((candidate) => containsExcerpt(candidate.text, sentence))
      ?? section.paragraphs[0]
    findings.push(finding(
      'reasoning.unexplained-identity-switch',
      'reasoning',
      'needs-work',
      sentence,
      paragraph.index,
      section.sectionId,
      'The narration moves from the square-of-a-sum identity to a difference-of-squares example without naming or deriving the new identity for the listener.',
      'The displayed derivation may introduce a^2 - b^2, but the spoken argument reaches 99 × 101 while the listener still has (a+b)^2 in mind. A listener cannot see when the identity changed.',
      'Before the numeric example, say that a different identity is needed, state it in speech, and show why 99 × 101 has the form a² − b².',
    ))
  }
  return findings
}

function detectTwoSidedLimit(parsed) {
  const findings = []
  const entries = sentenceEntries(parsed)
  const rightSide = /(?:từ (?:phía )?bên phải|bên phải|giới hạn bên phải|0\s*\+|0 cộng|một phía|phía dương|từ phía dương)/iu
  const twoSidedConclusion = /(?:hai phía|không tồn tại|không có giới hạn|hai kết quả khác nhau)/iu
  for (const entry of entries) {
    const sentence = entry.sentence
    const hasExpression = /(?:một phần x|1\s*\/\s*x|x\s*\/\s*x\s*(?:\^?\s*2|bình phương))/iu.test(sentence)
    const hasInfinity = /(?:dương vô cực|vô cực dương|âm vô cực|vô cực âm)/iu.test(sentence)
    const atZero = /(?:tại 0|tiến tới 0|tiến về 0|về 0|đến 0|x\s*→\s*0)/iu.test(sentence)
    if (!hasExpression || !hasInfinity || !atZero) continue
    if (rightSide.test(sentence)) continue
    const neighborhood = entries
      .filter((candidate) => Math.abs(candidate.paragraph - entry.paragraph) <= 1)
      .map((candidate) => candidate.sentence)
      .join(' ')
    if (twoSidedConclusion.test(neighborhood) && rightSide.test(neighborhood)) continue
    findings.push(finding(
      'math.limit.two-sided-qualification',
      'accuracy',
      'block',
      sentence,
      entry.paragraph,
      entry.sectionId,
      'The spoken statement asserts a one-sided infinity as if it were the two-sided limit at zero.',
      'Near x = 0, 1/x tends to +infinity from the right and −infinity from the left; the two-sided limit does not exist. Without the side, the statement is false and a listener can leave with the wrong generalization.',
      'Name the side explicitly, state the opposite side, then state that the two-sided limit does not exist (or give the correct two-sided conclusion).',
    ))
  }
  return findings
}

function detectAddressDrift(parsed) {
  const text = parsed.normalizedSpoken.toLowerCase()
  const forms = [
    ['chúng ta', (text.match(/chúng ta/gu) ?? []).length],
    ['các bạn', (text.match(/các bạn/gu) ?? []).length],
    ['bạn', (text.match(/(?<!các )bạn/gu) ?? []).length],
    ['mình', (text.match(/(?<!chúng )mình/gu) ?? []).length],
    ['quý vị', (text.match(/quý vị/gu) ?? []).length],
  ].filter(([, count]) => count >= 2)
  if (forms.length < 2) return []
  const paragraph = parsed.paragraphs[0]
  return [finding(
    'voice.address-drift',
    'spokenLanguage',
    'note',
    parsed.sentences[0]?.text ?? paragraph.text,
    paragraph.index,
    paragraph.sectionId,
    `The narration mixes address forms (${forms.map(([form, count]) => `${form} ×${count}`).join(', ')}).`,
    'Changing who the narrator is talking to forces the listener to re-establish the relationship, and it reads as an unedited draft.',
    'Choose one address form for the episode and replace the others, unless a quoted voice or deliberate register shift explains the change.',
    'medium',
  )]
}

/**
 * @param {ReturnType<import('./narration-model.mjs').parseNarration>} parsed
 * @param {{ centralQuestion?: string, brief?: string, targetDurationSec?: number }} [options]
 */
export function runEditorialHeuristics(parsed, options = {}) {
  if (parsed === undefined) return { findings: [], warnings: ['narration is unavailable; heuristics not run'] }
  const all = [
    ...detectTwoSidedLimit(parsed),
    ...detectForcedOpening(parsed),
    ...detectDisconnectedDigression(parsed, options),
    ...detectRepetition(parsed),
    ...detectUnexplainedIdentitySwitch(parsed),
    ...detectAddressDrift(parsed),
  ]
  const seen = new Set()
  const findings = []
  for (const item of all) {
    const key = `${item.code}:${item.paragraph}:${normalizeForMatch(item.excerpt)}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(item)
  }
  findings.sort((a, b) => (a.paragraph ?? 0) - (b.paragraph ?? 0) || a.code.localeCompare(b.code))
  return {
    findings,
    warnings: detectAddressDrift(parsed).length > 0 ? ['address form drifts between second-person and inclusive first-person'] : [],
  }
}
