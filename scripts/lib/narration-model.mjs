/**
 * Parsing and hashing primitives shared by every narration check.
 *
 * The deterministic helpers never claim to prove that prose is correct. They
 * establish identity (hash), locate excerpts, enumerate sections/paragraphs,
 * and detect a small set of high-confidence textual signals. Semantic truth
 * belongs to the evidence-backed editorial review.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import path from 'node:path'

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

export const SEVERITIES = ['block', 'needs-work', 'note']
export const FINDING_STATUSES = ['open', 'resolved', 'escalated', 'withdrawn', 'accepted']
export const REVIEW_STATUSES = ['pass', 'needs-work', 'blocked', 'stale']
export const CLAIM_RISKS = ['low', 'medium', 'high', 'critical']
export function claimRisk(claim) {
  return lower(claim?.risk ?? claim?.severity)
}
export const MODES = ['narrated', 'silent', 'text-only', 'mixed']
export const NARRATED_MODES = new Set(['narrated', 'mixed'])

/** @param {string} value */
export function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** @param {string} file */
export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function sha256FileStream(file) {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  const descriptor = openSync(file, 'r')
  try {
    let bytes
    while ((bytes = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes))
    }
  } finally {
    closeSync(descriptor)
  }
  return hash.digest('hex')
}

/** @param {string} text */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[*_`]/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

/** Lowercased, punctuation-loose comparison form used only for locating quotes. */
export function normalizeForMatch(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\p{L}\p{N}\s+\-*/=<>^%().,;:!?'"/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function loosePunctuation(text) {
  return normalizeForMatch(text)
    .replace(/[.,;:!?'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when `needle` occurs in `haystack`, tolerating punctuation and case.
 * @param {string} haystack
 * @param {string} needle
 */
export function containsExcerpt(haystack, needle) {
  const hay = normalizeForMatch(haystack)
  const pin = normalizeForMatch(needle)
  if (pin.length === 0) return false
  if (hay.includes(pin)) return true
  const looseHay = loosePunctuation(haystack)
  const loosePin = loosePunctuation(needle)
  return loosePin.length > 0 && looseHay.includes(loosePin)
}

/** @param {string} text */
export function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/**
 * Split spoken paragraphs into sentences without destroying the source.
 * @param {string} paragraph
 */
export function sentenceSpans(paragraph) {
  const spans = []
  const pattern = /[^.!?…]+[.!?…]+|[^.!?…]+$/gu
  for (const match of paragraph.matchAll(pattern)) {
    const raw = match[0]
    const leading = raw.length - raw.trimStart().length
    const text = raw.trim()
    if (text.length === 0) continue
    spans.push({ text, start: (match.index ?? 0) + leading, end: (match.index ?? 0) + leading + text.length })
  }
  return spans
}

function stripHeading(line) {
  const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line.trim())
  return match === null ? undefined : match[1].trim()
}

function makeParagraph(text, startLine, sectionId, sectionIndex, index) {
  return {
    index,
    text,
    normalized: normalizeText(text),
    sectionId,
    sectionIndex,
    startLine,
  }
}

/**
 * Parse a narration markdown file into non-spoken containers and spoken prose.
 *
 * Non-spoken: YAML frontmatter, ATX headings, blockquotes, fenced blocks,
 * HTML comments and horizontal rules. Consecutive spoken lines form one
 * paragraph; blank lines separate paragraphs.
 *
 * @param {string} markdown
 */
export function parseNarration(markdown) {
  const source = String(markdown ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const notes = []
  const displayBlocks = []
  const sections = []
  const paragraphs = []
  let currentSection
  let fence = null
  let fenceMarker
  let fenceStart = 0
  let fenceContent = []
  let inComment = false
  let pending = []
  let pendingStart = 0
  let index = 0
  let headingCounter = 0

  const flushParagraph = () => {
    if (pending.length === 0) return
    const text = pending.join(' ').replace(/\s+/g, ' ').trim()
    if (text.length > 0) {
      const paragraph = makeParagraph(text, pendingStart, currentSection.sectionId, sections.indexOf(currentSection), paragraphs.length + 1)
      paragraphs.push(paragraph)
      currentSection.paragraphs.push(paragraph)
    }
    pending = []
  }

  const startSection = (heading, lineNumber) => {
    flushParagraph()
    if (heading !== null) headingCounter += 1
    const section = {
      sectionId: heading === null ? 'preamble' : `sec-${String(headingCounter).padStart(2, '0')}`,
      heading,
      startLine: lineNumber,
      paragraphs: [],
    }
    sections.push(section)
    currentSection = section
  }

  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1)
    if (end !== -1) index = end + 1
  }
  currentSection = {
    sectionId: 'preamble',
    heading: null,
    startLine: 1,
    paragraphs: [],
  }
  sections.push(currentSection)

  for (; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (inComment) {
      if (trimmed.includes('-->')) inComment = false
      continue
    }
    if (fence !== null) {
      if (trimmed.startsWith(fence)) {
        displayBlocks.push({
          content: fenceContent.join('\n'),
          startLine: fenceStart,
          sectionId: currentSection.sectionId,
          marker: fenceMarker,
        })
        fence = null
        fenceContent = []
      } else {
        fenceContent.push(line)
      }
      continue
    }
    if (trimmed.startsWith('<!--')) {
      flushParagraph()
      if (!trimmed.includes('-->')) inComment = true
      continue
    }
    const fenceMatch = /^(```|~~~)/.exec(trimmed)
    if (fenceMatch !== null) {
      flushParagraph()
      fence = fenceMatch[1]
      fenceMarker = fenceMatch[1]
      fenceStart = index + 1
      fenceContent = []
      continue
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      const heading = stripHeading(line)
      if (heading !== undefined && heading.length > 0) startSection(heading, index + 1)
      continue
    }
    if (trimmed.startsWith('>')) {
      flushParagraph()
      notes.push({ text: trimmed.replace(/^>\s?/, ''), startLine: index + 1, sectionId: currentSection.sectionId })
      continue
    }
    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushParagraph()
      continue
    }
    if (trimmed.length === 0) {
      flushParagraph()
      continue
    }
    if (pending.length === 0) pendingStart = index + 1
    pending.push(trimmed)
  }
  flushParagraph()

  const visibleSections = sections.filter((section) => section.paragraphs.length > 0)
  const spokenText = visibleSections
    .flatMap((section) => section.paragraphs.map((paragraph) => paragraph.text))
    .join('\n\n')
    .trim()
  const normalizedSpoken = normalizeText(spokenText)
  const allSentences = visibleSections.flatMap((section) => section.paragraphs.flatMap((paragraph) => sentenceSpans(paragraph.text).map((span) => ({
    ...span,
    paragraph: paragraph.index,
    sectionId: section.sectionId,
  }))))

  return {
    source,
    sha256: sha256Text(source),
    spokenText,
    normalizedSpoken,
    paragraphs,
    sections: visibleSections,
    displayBlocks,
    notes,
    sentences: allSentences,
  }
}

/**
 * Resolve a through-line/claim/review section reference.
 * @param {ReturnType<typeof parseNarration>} parsed
 * @param {unknown} reference
 * @returns {{ section: object|undefined, matches: object[], error?: string }}
 */
export function resolveSectionReference(parsed, reference) {
  const raw = typeof reference === 'string' ? { sectionId: reference } : (reference ?? {})
  const sectionId = typeof raw.sectionId === 'string' ? raw.sectionId.trim() : undefined
  const heading = typeof raw.heading === 'string' ? raw.heading.trim() : undefined
  if (sectionId === undefined && heading === undefined) {
    return { section: undefined, matches: [], error: 'section reference needs sectionId or heading' }
  }
  if (sectionId !== undefined) {
    const exact = parsed.sections.filter((section) => section.sectionId === sectionId)
    if (exact.length === 1) return { section: exact[0], matches: exact }
    if (exact.length > 1) return { section: undefined, matches: exact, error: `sectionId "${sectionId}" is ambiguous` }
    if (heading === undefined) return { section: undefined, matches: [], error: `unknown sectionId "${sectionId}"` }
  }
  const normalizedHeading = normalizeForMatch(heading)
  const matches = heading === undefined ? [] : parsed.sections.filter((section) => {
    if (section.heading === null) return normalizedHeading === 'preamble'
    return normalizeForMatch(section.heading) === normalizedHeading
  })
  if (matches.length === 0) return { section: undefined, matches: [], error: `unknown section heading ${JSON.stringify(heading)}` }
  if (matches.length > 1) return { section: undefined, matches, error: `section heading ${JSON.stringify(heading)} is ambiguous; use sectionId` }
  return { section: matches[0], matches }
}

/**
 * Locate an excerpt in the parsed narration.
 * @param {ReturnType<typeof parseNarration>} parsed
 * @param {string} excerpt
 * @param {{ paragraph?: number, section?: object }} [scope]
 * @returns {{ found: boolean, paragraph?: object, sectionId?: string, matches: object[] }}
 */
export function locateExcerpt(parsed, excerpt, scope = {}) {
  const candidates = scope.paragraph === undefined
    ? parsed.paragraphs
    : parsed.paragraphs.filter((paragraph) => paragraph.index === scope.paragraph)
  const matches = candidates.filter((paragraph) => containsExcerpt(paragraph.text, excerpt))
  if (scope.section !== undefined) {
    const inSection = matches.filter((paragraph) => paragraph.sectionId === scope.section.sectionId)
    if (inSection.length > 0) return { found: true, paragraph: inSection[0], sectionId: inSection[0].sectionId, matches: inSection }
    return { found: false, matches }
  }
  if (matches.length > 0) return { found: true, paragraph: matches[0], sectionId: matches[0].sectionId, matches }
  return { found: false, matches }
}

/**
 * Detect content that makes an empty claim list suspicious. This is a
 * conservative signal, not a proof that every sentence is factual: numerals
 * and displayed mathematics must be audited somewhere.
 * @param {ReturnType<typeof parseNarration>} parsed
 */
export function claimSignals(parsed) {
  const signals = []
  const digits = [...parsed.normalizedSpoken.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0])
  for (const value of new Set(digits)) signals.push({ kind: 'numeral', value })
  if (parsed.displayBlocks.some((block) => /[=<>^]|\\[A-Za-z]+|\d/.test(block.content))) {
    signals.push({ kind: 'display-math', value: `${parsed.displayBlocks.length} fenced block(s)` })
  }
  if (/\d+(?:[.,]\d+)?\s*%/.test(parsed.normalizedSpoken)) signals.push({ kind: 'percentage', value: '%' })
  const wordNumber = '(?:không|một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười|mươi|trăm|nghìn|ngàn|triệu|tỷ|tỉ)'
  const measuredUnit = '(?:độ|phần trăm|mét|ki-lô-mét|km|ki-lô-gam|kg|gam|giây|phút|giờ|đồng|xu|lần)'
  const measured = new RegExp(`(?<!\\p{L})${wordNumber}(?:\\s+${wordNumber})*\\s+${measuredUnit}(?!\\p{L})`, 'iu').exec(parsed.normalizedSpoken)
  if (measured !== null) signals.push({ kind: 'measured-quantity', value: measured[0] })
  const percentWords = /(?<!\p{L})phần\s+(?:trăm|nghìn)(?!\p{L})/iu.exec(parsed.normalizedSpoken)
  if (percentWords !== null && digits.length === 0) signals.push({ kind: 'percentage-words', value: percentWords[0] })
  return signals
}

/**
 * Read the episode production mode from `production.json`; narrated when absent.
 * @param {string} episodeDir
 */
export function readProductionMode(episodeDir) {
  const file = path.join(episodeDir, 'production.json')
  if (existsSync(file)) {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      return { mode: undefined, source: file, error: `${file}: ${error.message}` }
    }
    if (!MODES.includes(parsed?.mode)) {
      return { mode: undefined, source: file, error: `${file}: mode must be one of ${MODES.join(', ')}` }
    }
    return { mode: parsed.mode, source: file, config: parsed }
  }
  return { mode: 'narrated', source: 'default' }
}

/** @param {string} file */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** @param {unknown} value */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value */
export function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim())
}

/** @param {ReturnType<typeof parseNarration>} parsed */
export function wordCount(parsed) {
  return parsed.normalizedSpoken.split(/\s+/u).filter(Boolean).length
}

/** @param {unknown} value */
export function lower(value) {
  return String(value ?? '').trim().toLowerCase()
}
