#!/usr/bin/env node
/**
 * Create one episode skeleton under `<dataRoot>/projects/<series>/episodes/<ep>`.
 *
 * Workspace and built-in library setup is idempotent, so this works from an
 * npm-installed plugin with an external data root. The new episode is
 * deliberately incomplete: the narration review starts `blocked`, claims start
 * `PENDING`, the throughline map is empty, and no scene or master exists.
 *
 * Usage:
 *   node scripts/new-episode.mjs <series-slug> <ep-001> [--mode narrated|silent|text-only|mixed] [--data-root <dir>]
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { codeRoot as defaultCodeRoot, ensureWorkspace, resolveDataRoot, resolveStudioPaths } from './studio-paths.mjs'
import { parseNarration } from './lib/narration-model.mjs'

export const MODES = ['narrated', 'silent', 'text-only', 'mixed']

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EPISODE = /^ep-[0-9]{3,5}$/

function parseArgs(argv) {
  const args = { series: undefined, episode: undefined, mode: undefined, dataRoot: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--mode') {
      index += 1
      if (argv[index] === undefined) throw new Error('--mode needs a value')
      args.mode = argv[index]
    } else if (value === '--data-root') {
      index += 1
      if (argv[index] === undefined) throw new Error('--data-root needs a directory')
      args.dataRoot = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.series === undefined) args.series = value
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  return args
}

function narrationSkeleton(mode) {
  return `# Narration\n\nNot approved. Write the full listener-first narration here, then record the throughline map, claim check and editorial review. The gate stays blocked until all evidence exists.\n`
}

function claimSkeleton() {
  return {
    schemaVersion: 2,
    status: 'PENDING',
    reviewedAt: null,
    coverage: { claimsExpected: null, justification: null },
    claims: [],
    conditions: [],
  }
}

function reviewSkeleton(narrationHash) {
  return {
    schemaVersion: 2,
    narrationFile: 'narration.md',
    narrationSha256: narrationHash,
    status: 'blocked',
    reviewedAt: null,
    reviewer: {
      kind: 'author',
      id: 'main-agent',
      method: 'draft',
      readFullScript: false,
    },
    criteria: {
      accuracy: 'needs-work',
      audienceFit: 'needs-work',
      narrativeArc: 'needs-work',
      reasoning: 'needs-work',
      continuity: 'needs-work',
      spokenLanguage: 'needs-work',
      pacing: 'needs-work',
      styleAndOriginality: 'needs-work',
    },
    criteriaEvidence: {},
    blockers: ['Narration has not been drafted or reviewed.'],
    actionableFindings: [],
    throughlineMap: 'throughline-map.json',
    claimCheckFile: 'claim-check.json',
    reviewPasses: 0,
    independentReview: { required: false, status: 'not-required' },
    revision: 1,
  }
}

function throughlineSkeleton(parsed) {
  const sections = parsed.sections.length === 0
    ? [{ sectionId: 'preamble', heading: null }]
    : parsed.sections.map((section) => ({ sectionId: section.sectionId, heading: section.heading }))
  return {
    schemaVersion: 1,
    centralQuestion: '',
    promise: '',
    audience: '',
    sections: sections.map((section) => ({
      ...section,
      purpose: '',
      connectionToCentralQuestion: '',
      whyHere: '',
      audienceTakeaway: '',
      claimRefs: [],
    })),
  }
}

function productionSkeleton(mode) {
  return {
    schemaVersion: 1,
    mode,
    voiceOver: mode === 'narrated' || mode === 'mixed',
    narrationRisk: 'standard',
    qualitySensitive: false,
    targetDurationSec: null,
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function atomicWrite(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, content)
  fs.renameSync(temp, file)
}

/**
 * Create one episode. Throws typed errors with `code` values:
 *   EINVALID usage, EEXIST episode exists, EIO filesystem failure.
 * @param {{ series: string, episode: string, mode?: string, dataRoot?: string, codeRoot?: string }} options
 */
export function createEpisode(options) {
  const { series, episode } = options
  if (!SLUG.test(series ?? '') || !EPISODE.test(episode ?? '')) {
    const error = new Error('Usage: node scripts/new-episode.mjs <series-slug> <ep-001> [--mode ...]')
    error.code = 'EINVALID'
    throw error
  }
  const mode = options.mode ?? 'narrated'
  if (!MODES.includes(mode)) {
    const error = new Error(`--mode must be one of ${MODES.join(', ')}; got ${JSON.stringify(options.mode)}`)
    error.code = 'EINVALID'
    throw error
  }
  const resolution = resolveDataRoot({
    dataRoot: options.dataRoot,
    codeRoot: options.codeRoot ?? defaultCodeRoot,
  })
  const roots = resolveStudioPaths(resolution.dataRoot, options.codeRoot ?? defaultCodeRoot)
  ensureWorkspace({ dataRoot: roots.dataRoot, codeRoot: roots.codeRoot })

  const base = path.join(roots.projects, series)
  const episodesDir = path.join(base, 'episodes')
  const dest = path.join(episodesDir, episode)
  if (fs.existsSync(dest)) {
    const error = new Error(`Episode already exists: ${dest}`)
    error.code = 'EEXIST'
    throw error
  }
  fs.mkdirSync(episodesDir, { recursive: true })

  const staging = path.join(episodesDir, `.staging-${episode}-${process.pid}-${Date.now()}`)
  fs.mkdirSync(staging, { recursive: false })
  try {
    for (const dir of ['assets/original', 'assets/derived', 'audio/narration', 'audio/stems', 'scenes', 'qa/scene', 'reports', 'exports', 'work']) {
      fs.mkdirSync(path.join(staging, dir), { recursive: true })
    }
    fs.writeFileSync(path.join(staging, 'request.md'), `# Request: ${series}/${episode}\n\nAwaiting the user's brief.\n`)
    fs.writeFileSync(path.join(staging, 'execution-brief.md'), '# Execution brief\n\nNot started.\n')
    writeJson(path.join(staging, 'production.json'), productionSkeleton(mode))
    writeJson(path.join(staging, 'storyboard.json'), { schemaVersion: 1, scenes: [] })
    writeJson(path.join(staging, 'timeline.json'), { schemaVersion: 1, durationSec: null, scenes: [] })
    writeJson(path.join(staging, 'audio', 'manifest.json'), { schemaVersion: 1, engine: null, chunks: [] })
    writeJson(path.join(staging, 'reports', 'metrics.json'), {
      schemaVersion: 2,
      measured: false,
      source: null,
      phases: [],
      scenes: { A: 0, B: 0, C: 0 },
      fullRenders: 0,
      imageReads: 0,
      unavailable: ['No DSH session measurement has been collected yet.'],
    })

    if (mode === 'narrated' || mode === 'mixed') {
      fs.writeFileSync(path.join(staging, 'narration.md'), narrationSkeleton(mode))
      const narrationRaw = fs.readFileSync(path.join(staging, 'narration.md'), 'utf8')
      const narrationHash = createHash('sha256').update(narrationRaw).digest('hex')
      writeJson(path.join(staging, 'claim-check.json'), claimSkeleton())
      writeJson(path.join(staging, 'throughline-map.json'), throughlineSkeleton(parseNarration(narrationRaw)))
      writeJson(path.join(staging, 'narration-review.json'), reviewSkeleton(narrationHash))
    } else {
      fs.writeFileSync(path.join(staging, 'visual-brief.md'), '# Visual brief\n\nWrite the shot intent here. This mode has no voice-over and does not require a narration gate.\n')
    }

    // Rename is the commit point: no partially scaffolded episode is visible.
    fs.renameSync(staging, dest)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }

  const projectFile = path.join(base, 'project.json')
  if (!fs.existsSync(projectFile)) {
    const config = JSON.parse(fs.readFileSync(path.join(roots.kit, 'project.json'), 'utf8'))
    config.slug = series
    config.name = series
    config.defaultMode = mode
    atomicWrite(projectFile, `${JSON.stringify(config, null, 2)}\n`)
  }
  return { episodeDir: dest, mode, dataRoot: roots.dataRoot, codeRoot: roots.codeRoot }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${error.message}\nUsage: node scripts/new-episode.mjs <series-slug> <ep-001> [--mode narrated|silent|text-only|mixed] [--data-root <dir>]`)
    process.exitCode = 2
    return
  }
  if (!args.series || !args.episode) {
    console.error('Usage: node scripts/new-episode.mjs <series-slug> <ep-001> [--mode ...] [--data-root <dir>]')
    process.exitCode = 2
    return
  }
  try {
    const created = createEpisode(args)
    console.log(created.episodeDir)
  } catch (error) {
    console.error(error.message)
    process.exitCode = error.code === 'EEXIST' ? 3 : 2
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
