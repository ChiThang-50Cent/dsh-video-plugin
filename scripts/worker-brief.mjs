#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { codeRoot, resolveDataRoot, resolveStudioPaths } from './studio-paths.mjs'
import { validateWorkerPlan } from './validate-workers.mjs'
import { workerContract } from './lib/worker-brief-contract.mjs'

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== '.' && value !== '..'
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const block = (heading, value) => `# ${heading}\n\n${JSON.stringify(stable(value), null, 2)}\n\n`
const digest = text => ({ bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') })
function json(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { throw new Error(`${label}: ${error.message}`) }
}
function one(items, id, label) {
  const matches = Array.isArray(items) ? items.filter(item => item?.id === id) : []
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one entry for ${id}`)
  return matches[0]
}

/** Generate three independently hashed, ordered blocks; brief is their exact concatenation. */
export function generateWorkerBrief(episode, options = {}) {
  const root = path.resolve(episode)
  for (const [name, value] of [['scene', options.scene], ['task', options.task], ['wave', options.wave ?? options.task]]) {
    if (!safeId(value)) throw new Error(`${name} must be a safe non-empty id`)
  }
  const projectDir = path.resolve(root, '../..')
  const project = json(path.join(projectDir, 'project.json'), 'project.json')
  if (typeof project.style !== 'string' || !project.style) throw new Error('project.json style is required')
  const stylePath = path.resolve(projectDir, project.style)
  const style = json(stylePath, 'project style')
  const production = json(path.join(root, 'production.json'), 'production.json')
  if (!['narrated', 'mixed', 'silent', 'text-only'].includes(production.mode)) throw new Error('production.json mode is required')
  const storyboard = json(path.join(root, 'storyboard.json'), 'storyboard.json')
  const scene = one(storyboard.scenes, options.scene, 'storyboard scene')
  if (scene.reuseClass !== 'C') throw new Error(`scene ${options.scene} is reuse class ${scene.reuseClass}; only custom C scenes are delegated`)
  const timeline = json(path.join(root, 'timeline.json'), 'timeline.json')
  const timing = one(timeline.scenes, options.scene, 'timeline scene')
  if (!Number.isFinite(timing.startSec) || timing.startSec < 0 || !Number.isFinite(timing.durationSec) || timing.durationSec <= 0) throw new Error('scene measured timing requires startSec and positive durationSec')
  const planFile = path.resolve(options.plan ?? path.join(root, 'worker-plan.json'))
  const plan = json(planFile, 'worker plan')
  const validated = validateWorkerPlan(plan)
  if (!validated.ok) throw new Error(`invalid worker plan: ${validated.errors.join('; ')}`)
  const worker = one(plan.workers, options.task, 'worker plan task')
  if (worker.sceneId !== options.scene) throw new Error(`worker plan task ${options.task} does not match scene ${options.scene}`)
  const references = scene.narrationSegments ?? []
  if (!Array.isArray(references)) throw new Error('scene narrationSegments must be an array')
  if (['narrated', 'mixed'].includes(production.mode) && references.length === 0) throw new Error('scene narrationSegments are required for narrated or mixed production')
  let segments = []
  if (references.length) {
    const manifest = json(path.join(root, 'audio/segments.json'), 'audio/segments.json')
    segments = references.map(id => one(manifest.segments, id, 'narration segment'))
  }
  const roots = resolveStudioPaths(resolveDataRoot({ dataRoot: options.dataRoot }).dataRoot, codeRoot)
  const styleRefs = (project.styleRefs ?? []).map(id => {
    if (!safeId(id)) throw new Error('project styleRefs must contain safe ids')
    const file = path.join(roots.library, 'styles', id, 'style.json')
    return { id, path: file, style: json(file, `style reference ${id}`) }
  })
  const assetsFile = path.join(root, 'assets', 'manifest.json')
  const assets = fs.existsSync(assetsFile) ? json(assetsFile, 'assets manifest') : null
  const wave = options.wave ?? options.task
  const work = `work/${options.task}`
  const blocks = {
    studio: workerContract,
    episode: block('Episode context', { roots, episodeDir: root, projectDir, production, style: { path: stylePath, value: style, references: styleRefs }, sharedAssets: assets, waveId: wave }),
    scene: block('Scene assignment', { sceneId: options.scene, sceneJson: scene, measuredTiming: timing, narrationSegments: segments, reuseSource: scene.reuseFrom ?? null, taskId: options.task, workDir: work, allowlist: [`${work}/**`], outputPaths: { result: `${work}/scene-result.json`, code: `${work}/scene.mjs`, preview: `${work}/scene.mp4`, qaReport: `${work}/qa.json` } }),
  }
  return { brief: blocks.studio + blocks.episode + blocks.scene, blocks, hashes: Object.fromEntries(Object.entries(blocks).map(([key, text]) => [key, digest(text)])) }
}

function main(argv) {
  const options = {}; let episode
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (['--scene', '--task', '--wave', '--out', '--plan', '--data-root'].includes(arg)) {
      const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      options[({ '--data-root': 'dataRoot' })[arg] ?? arg.slice(2)] = value
    } else if (arg.startsWith('-') || episode) throw new Error(`unexpected argument: ${arg}`)
    else episode = arg
  }
  if (!episode) throw new Error('usage: worker-brief.mjs <episode> --scene <id> --task <id> [--wave <id>] [--plan <file>] [--data-root <dir>] [--out <file>] [--json]')
  const result = generateWorkerBrief(episode, options)
  if (options.out) fs.writeFileSync(options.out, result.brief)
  if (options.json) console.log(JSON.stringify({ ...(!options.out && { brief: result.brief }), blocks: result.hashes }, null, 2))
  else {
    if (!options.out) process.stdout.write(result.brief)
    console.error(JSON.stringify(result.hashes, null, 2))
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
