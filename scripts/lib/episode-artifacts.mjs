import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { readProductionMode } from './narration-model.mjs'

export function resolveProductionMode(root, override) {
  const persisted = readProductionMode(root)
  return {
    ...persisted,
    mode: override ?? persisted.mode,
    source: override === undefined ? persisted.source : 'override',
    ...(override !== undefined && persisted.mode !== undefined && persisted.source !== 'default' && persisted.source !== 'legacy-inference' && override !== persisted.mode
      ? { conflict: `production mode override ${override} conflicts with persisted mode ${persisted.mode}` }
      : {}),
  }
}

export function findMaster(root, production, timeline) {
  const configured = [production?.finalOutput, timeline?.finalOutput].find((value) => typeof value === 'string' && value.length > 0)
  const candidates = configured === undefined ? ['exports/master.mp4', 'exports/master.mov', 'exports/master.webm'] : [configured]
  for (const relative of candidates) {
    if (typeof relative !== 'string' || !relative) continue
    const absolute = path.resolve(root, relative)
    const rel = path.relative(root, absolute)
    if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) continue
    if (existsSync(absolute) && statSync(absolute).isFile()) return { path: absolute, relative: rel }
  }
  return null
}
