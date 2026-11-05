#!/usr/bin/env node
/**
 * Editorial pre-scan for an independent reviewer.
 *
 * This tool detects a conservative set of high-confidence anti-patterns and
 * prints them as actionable finding drafts. It does not write a PASS, does not
 * edit narration.md and cannot replace reading the script. A reviewer must
 * verify the evidence, add semantic findings the heuristics cannot see, record
 * resolutions, and then run scripts/validate-narration.mjs.
 *
 * Usage:
 *   node scripts/editorial-review.mjs <episode-dir> [--json] [--write-suggestions]
 *        [--central-question "<question>"]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseNarration, readJson } from './lib/narration-model.mjs'
import { runEditorialHeuristics } from './lib/editorial-heuristics.mjs'
import { loadNarrationEpisode } from './lib/narration-integrity.mjs'

function parseArgs(argv) {
  const args = { episode: undefined, json: false, write: false, centralQuestion: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--write-suggestions') args.write = true
    else if (value === '--central-question') {
      index += 1
      if (argv[index] === undefined) throw new Error('--central-question needs text')
      args.centralQuestion = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  return args
}

function toSuggestion(item, index) {
  return {
    id: `suggest-${String(index + 1).padStart(2, '0')}`,
    code: item.code,
    criterion: item.category,
    severity: item.severity,
    excerpt: item.excerpt,
    paragraph: item.paragraph,
    sectionRef: item.sectionRef,
    problem: item.problem,
    evidence: item.evidence,
    proposedFix: item.proposedFix,
    status: 'open',
    confidence: item.confidence,
    source: 'deterministic-editorial-heuristics',
  }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/editorial-review.mjs <episode-dir> [--json] [--write-suggestions] [--central-question "<question>"]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let context
  try {
    context = loadNarrationEpisode(args.episode)
  } catch (error) {
    console.error(`editorial-review: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (context.narrationRaw === undefined) {
    console.error(`editorial-review: narration.md not found in ${context.root}`)
    process.exitCode = 1
    return
  }
  const parsed = context.parsed ?? parseNarration(context.narrationRaw)
  let centralQuestion = args.centralQuestion
  if (centralQuestion === undefined && fs.existsSync(path.join(context.root, 'throughline-map.json'))) {
    try {
      centralQuestion = readJson(path.join(context.root, 'throughline-map.json'))?.centralQuestion
    } catch {
      // An unreadable through-line map is reported by the gate, not here.
    }
  }
  const result = runEditorialHeuristics(parsed, { centralQuestion })
  const suggestions = result.findings.map(toSuggestion)
  const payload = {
    episodeDir: context.root,
    centralQuestion: centralQuestion ?? null,
    suggestions,
    warnings: result.warnings,
    caveat: 'Deterministic triage only. It cannot prove correctness, quality or completeness. The reviewer must read the full script, verify each item, and add findings the heuristics cannot detect.',
    generatedAt: new Date().toISOString(),
  }
  if (args.write) {
    const reports = path.join(context.root, 'reports')
    fs.mkdirSync(reports, { recursive: true })
    fs.writeFileSync(path.join(reports, 'editorial-suggestions.json'), `${JSON.stringify(payload, null, 2)}\n`)
    const lines = [
      '# Editorial pre-scan suggestions',
      '',
      'These are deterministic triage suggestions, not a review and not a PASS. Verify each item, add semantic findings, record resolutions, then run the G0 validator.',
      '',
      ...suggestions.flatMap((item) => [
        `## ${item.id} — ${item.criterion} / ${item.severity}`,
        '',
        `> ${item.excerpt}`,
        '',
        `Paragraph ${item.paragraph}, section ${item.sectionRef.sectionId}.`,
        '',
        `**Problem.** ${item.problem}`,
        '',
        `**Evidence/reasoning.** ${item.evidence}`,
        '',
        `**Proposed correction.** ${item.proposedFix}`,
        '',
        `Status: ${item.status}`,
        '',
      ]),
    ]
    fs.writeFileSync(path.join(reports, 'editorial-suggestions.md'), `${lines.join('\n')}\n`)
    payload.written = ['reports/editorial-suggestions.json', 'reports/editorial-suggestions.md']
  }
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(`Editorial pre-scan: ${context.root}`)
    if (suggestions.length === 0) console.log('No deterministic anti-pattern detected. This is NOT evidence of quality.')
    for (const item of suggestions) {
      console.log(`  [${item.severity}] ${item.criterion} ${item.code} @ paragraph ${item.paragraph}`)
      console.log(`    "${item.excerpt.slice(0, 120)}"`)
      console.log(`    ${item.problem}`)
      console.log(`    fix: ${item.proposedFix}`)
    }
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    if (args.write) console.log(`Written: ${payload.written.join(', ')}`)
    console.log('NOT A PASS: the independent reviewer must add semantic findings and evidence.')
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
