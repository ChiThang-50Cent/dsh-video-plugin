#!/usr/bin/env node
/**
 * Lightweight narration Markdown/style lint, separate from G0.
 *
 * It is safe (and cheap) to run while drafting: it reports concrete style
 * problems but never issues a production PASS and never claims the content is
 * correct. G0 remains the evidence-based review.
 *
 * Usage: node scripts/lint-narration.mjs <episode-dir|narration.md> [--json] [--strict]
 * Exit: 0 no errors (warnings allowed), 1 errors (or warnings with --strict), 2 usage.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseNarration, splitSentences } from './lib/narration-model.mjs'
import { runEditorialHeuristics } from './lib/editorial-heuristics.mjs'

const FILLER = /\b(?:rõ ràng|rất đơn giản|như bạn thấy|không thể phủ nhận|như chúng ta đều biết|dễ thấy rằng|hiển nhiên là)\b/giu
const VISUAL_DEIXIS = /\b(?:như (?:bạn|các bạn) (?:thấy|đã biết)|ở (?:đây|trên)|trên (?:màn hình|hình)|dưới đây|xem hình|theo hình)\b/giu
const ABBREVIATION = /\b[A-Z]{2,}\b/g

export function lintParsed(parsed, options = {}) {
  const errors = []
  const warnings = []
  const stats = {
    spokenChars: parsed.normalizedSpoken.length,
    words: parsed.normalizedSpoken.split(/\s+/u).filter(Boolean).length,
    paragraphs: parsed.paragraphs.length,
    sections: parsed.sections.length,
    sentences: parsed.sentences.length,
    displayBlocks: parsed.displayBlocks.length,
  }
  if (stats.words === 0) errors.push('no spoken prose; headings, notes and fenced blocks are not spoken')
  if (/\\[A-Za-z]+|\$\$[^$]+\$\$/.test(parsed.normalizedSpoken)) errors.push('raw LaTeX or display math appears in spoken prose; move it to a fenced block and write the spoken form')
  if (stats.sections === 1 && parsed.sections[0]?.heading === null) warnings.push('narration has no section headings; a through-line may still work, but the map cannot show section structure')
  let previousLevel = 0
  for (const section of parsed.sections) {
    if (section.heading === null) continue
    const levelMatch = /^#{1,6}/.exec(parsed.source.split('\n')[section.startLine - 1] ?? '')
    const level = levelMatch === null ? 1 : levelMatch[0].length
    if (previousLevel > 0 && level > previousLevel + 1) warnings.push(`heading level jumps from ${previousLevel} to ${level} before "${section.heading}"`)
    previousLevel = level
  }
  for (const paragraph of parsed.paragraphs) {
    const words = paragraph.normalized.split(/\s+/u).filter(Boolean)
    if (words.length > 140) errors.push(`paragraph ${paragraph.index} has ${words.length} words; split it for listening`)
    else if (words.length > 90) warnings.push(`paragraph ${paragraph.index} has ${words.length} words; consider splitting`)
    for (const sentence of splitSentences(paragraph.text)) {
      const sentenceWords = sentence.split(/\s+/u).filter(Boolean).length
      if (sentenceWords > 55) warnings.push(`paragraph ${paragraph.index} has a ${sentenceWords}-word sentence; check it aloud`)
    }
    FILLER.lastIndex = 0
    if (FILLER.test(paragraph.text)) warnings.push(`paragraph ${paragraph.index} contains filler: "${(paragraph.text.match(FILLER) ?? [])[0]}"`)
    VISUAL_DEIXIS.lastIndex = 0
    if (VISUAL_DEIXIS.test(paragraph.text)) errors.push(`paragraph ${paragraph.index} uses visual-only deixis in spoken prose: "${(paragraph.text.match(VISUAL_DEIXIS) ?? [])[0]}"`)
    for (const match of paragraph.text.matchAll(ABBREVIATION)) {
      const token = match[0]
      if (!/^(?:OK|TV|URL|GPS|AI|PDF|MP4|USD|VND|UNESCO|ADN|DNA)$/.test(token)) warnings.push(`paragraph ${paragraph.index} contains unexpanded abbreviation "${token}"; expand it on first use`)
    }
  }
  if (/%|\d/.test(parsed.normalizedSpoken)) warnings.push('digits or % appear in spoken prose; verify the TTS engine reads them naturally or use a reviewed pronunciation override')
  const heuristic = runEditorialHeuristics(parsed, { centralQuestion: options.centralQuestion })
  for (const item of heuristic.findings) {
    const message = `${item.code} (paragraph ${item.paragraph}): ${item.problem}`
    if (item.severity === 'block') warnings.push(message)
    else warnings.push(message)
  }
  return { errors, warnings, stats, heuristic: heuristic.findings.map((item) => ({ code: item.code, severity: item.severity, paragraph: item.paragraph, excerpt: item.excerpt })) }
}

function parseArgs(argv) {
  const args = { json: false, strict: false, centralQuestion: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--strict') args.strict = true
    else if (value === '--central-question') {
      index += 1
      if (argv[index] === undefined) throw new Error('--central-question needs text')
      args.centralQuestion = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.target === undefined) args.target = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.target === undefined) throw new Error('missing episode directory or narration file')
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/lint-narration.mjs <episode-dir|narration.md> [--json] [--strict]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let file
  try {
    file = args.target
    if (existsSync(file) && !file.endsWith('.md')) file = path.join(path.resolve(file), 'narration.md')
    if (!existsSync(file)) throw new Error(`narration not found: ${file}`)
    const parsed = parseNarration(readFileSync(file, 'utf8'))
    const result = lintParsed(parsed, { centralQuestion: args.centralQuestion })
    const ok = result.errors.length === 0 && (!args.strict || result.warnings.length === 0)
    if (args.json) {
      console.log(JSON.stringify({ ok, file, ...result, caveat: 'Style lint only; it cannot prove correctness or production completion.' }, null, 2))
    } else {
      console.log(`Narration lint: ${file}`)
      console.log(`  ${result.stats.words} words, ${result.stats.paragraphs} paragraphs, ${result.stats.sections} sections, ${result.stats.displayBlocks} display blocks`)
      for (const warning of result.warnings) console.log(`WARN: ${warning}`)
      for (const error of result.errors) console.log(`ERROR: ${error}`)
      console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'}${ok ? ' (lint only, not G0)' : ''}`)
    }
    process.exitCode = ok ? 0 : 1
  } catch (error) {
    console.error(`lint-narration: ${error.message}`)
    process.exitCode = 2
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
