import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { readProductionMode } from './narration-model.mjs'

export function resolveProductionMode(root, override) {
  const persisted = readProductionMode(root)
  return {
    ...persisted,
    mode: override ?? persisted.mode,
    source: override === undefined ? persisted.source : 'override',
    ...(override !== undefined && persisted.mode !== undefined && persisted.source !== 'default' && override !== persisted.mode
      ? { conflict: `production mode override ${override} conflicts with persisted mode ${persisted.mode}` }
      : {}),
  }
}

export function readLabeledJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

/** Data root implied by the episode layout `<dataRoot>/projects/<slug>/episodes/<episode>`. */
export function episodeDataRoot(episodeRoot) {
  return path.resolve(episodeRoot, '..', '..', '..', '..')
}

/** Episode layout is `<dataRoot>/projects/<slug>/episodes/<episode>`; project.json is optional. */
export function episodeContext(episodeRoot) {
  const projectDir = path.resolve(episodeRoot, '..', '..')
  const dataRoot = episodeDataRoot(episodeRoot)
  const production = readLabeledJson(path.join(episodeRoot, 'production.json'), 'production.json')
  const projectFile = path.join(projectDir, 'project.json')
  const project = existsSync(projectFile) ? readLabeledJson(projectFile, 'project.json') : {}
  return { dataRoot, projectDir, production, project }
}

const DEFAULT_MASTERS = ['exports/master.mp4', 'exports/master.mov', 'exports/master.webm']

export function findMaster(root, production, timeline) {
  const configured = [production?.finalOutput, timeline?.finalOutput].find((value) => typeof value === 'string' && value.length > 0)
  const candidates = configured === undefined ? DEFAULT_MASTERS : [configured]
  for (const relative of candidates) {
    if (typeof relative !== 'string' || !relative) continue
    const absolute = path.resolve(root, relative)
    const rel = path.relative(root, absolute)
    if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) continue
    if (existsSync(absolute) && statSync(absolute).isFile()) return { path: absolute, relative: rel }
  }
  return null
}

export function findExistingMasters(root, production, timeline) {
  const configured = [production?.finalOutput, timeline?.finalOutput].find((value) => typeof value === 'string' && value.length > 0)
  const candidates = configured === undefined ? DEFAULT_MASTERS : [configured, ...DEFAULT_MASTERS]
  const masters = new Map()
  for (const finalOutput of candidates) {
    const master = findMaster(root, { finalOutput })
    if (master !== null) masters.set(master.path, master)
  }
  return [...masters.values()]
}
