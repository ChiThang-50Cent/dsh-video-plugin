/**
 * Visual styles: swappable look packages under `library/visual-styles/<id>/`.
 *
 * A package is `style.json` plus optional `fonts/`, `refs/` and `notes.md`. The
 * active style is chosen per episode: `production.json.visualStyle` overrides
 * `project.json.visualStyle`, which falls back to the built-in `default`. Scenes
 * receive the resolved tokens as `api.theme`, so changing the look is a style
 * edit or an id switch followed by a re-render, never a scene rewrite.
 *
 * Resolution is pure (no Skia import) so validators can bind QA to the style
 * hash without loading the renderer.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_VISUAL_STYLE = 'default'
const ID = /^[a-z][a-z0-9-]{0,63}$/
const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

/** Nearest ancestor (inclusive) holding `production.json`, or null outside an episode. */
export function findEpisodeRoot(start) {
  let dir = path.resolve(start)
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir)
  while (true) {
    if (fs.existsSync(path.join(dir, 'production.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Episode layout is `<dataRoot>/projects/<slug>/episodes/<episode>`. */
function episodeContext(episodeRoot) {
  const projectDir = path.resolve(episodeRoot, '..', '..')
  const dataRoot = path.resolve(projectDir, '..', '..')
  const production = readJson(path.join(episodeRoot, 'production.json'), 'production.json')
  const projectFile = path.join(projectDir, 'project.json')
  const project = fs.existsSync(projectFile) ? readJson(projectFile, 'project.json') : {}
  return { dataRoot, production, project }
}

/** Every structural problem in a parsed style.json; empty when usable. */
export function visualStyleErrors(style, packageDir) {
  const errors = []
  if (!isObject(style)) return ['style.json must be an object']
  if (style.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (typeof style.id !== 'string' || !ID.test(style.id)) errors.push('id must be a lowercase slug')
  for (const key of ['colors', 'typography']) {
    if (!isObject(style[key])) errors.push(`${key} must be an object`)
  }
  for (const [name, value] of Object.entries(isObject(style.colors) ? style.colors : {})) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`colors.${name} must be a CSS color string`)
  }
  for (const [role, value] of Object.entries(isObject(style.typography) ? style.typography : {})) {
    if (!isObject(value) || typeof value.family !== 'string' || !value.family.trim()) errors.push(`typography.${role}.family is required`)
    else if (value.size !== undefined && !(Number.isFinite(value.size) && value.size > 0)) errors.push(`typography.${role}.size must be a positive number`)
  }
  if (style.fonts !== undefined) {
    if (!Array.isArray(style.fonts)) errors.push('fonts must be an array')
    else {
      for (const [index, font] of style.fonts.entries()) {
        const label = `fonts[${index}]`
        if (!isObject(font) || typeof font.family !== 'string' || !font.family.trim()) { errors.push(`${label}.family is required`); continue }
        if (typeof font.file !== 'string' || !font.file || path.isAbsolute(font.file)) { errors.push(`${label}.file must be a package-relative path`); continue }
        const file = path.resolve(packageDir, font.file)
        if (!file.startsWith(`${packageDir}${path.sep}`)) errors.push(`${label}.file escapes the style package`)
        else if (!fs.existsSync(file) || !fs.statSync(file).isFile()) errors.push(`${label}.file not found: ${font.file}`)
      }
    }
  }
  return errors
}

/** Package directory for `id`: the workspace library first, then the bundled built-in. */
export function visualStylePackage(id, dataRoot) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`visual style id must be a lowercase slug: ${JSON.stringify(id)}`)
  const candidates = [dataRoot && path.join(dataRoot, 'library', 'visual-styles', id), path.join(codeRoot, 'library', 'visual-styles', id)].filter(Boolean)
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'style.json')))
  if (dir === undefined) throw new Error(`visual style "${id}" not found; create library/visual-styles/${id}/style.json (scripts/new-visual-style.mjs)`)
  return dir
}

/**
 * Resolve the active visual style.
 * @param {{episodeRoot?: string|null, dataRoot?: string, id?: string}} options
 *   `id` overrides the episode/project selection (CLI `--visual-style`).
 */
export function resolveVisualStyle(options = {}) {
  let id = options.id
  let dataRoot = options.dataRoot
  let source = id === undefined ? 'default' : 'override'
  if (options.episodeRoot) {
    const context = episodeContext(options.episodeRoot)
    dataRoot ??= context.dataRoot
    if (id === undefined && context.production.visualStyle !== undefined) { id = context.production.visualStyle; source = 'production.json' }
    else if (id === undefined && context.project.visualStyle !== undefined) { id = context.project.visualStyle; source = 'project.json' }
  }
  id ??= DEFAULT_VISUAL_STYLE
  const dir = fs.realpathSync(visualStylePackage(id, dataRoot))
  const file = path.join(dir, 'style.json')
  const raw = fs.readFileSync(file)
  const style = readJson(file, `visual style ${id}`)
  const errors = visualStyleErrors(style, dir)
  if (style.id !== undefined && style.id !== id) errors.push(`id "${style.id}" does not match its directory "${id}"`)
  if (errors.length) throw new Error(`visual style "${id}" is invalid: ${errors.join('; ')}`)
  const hash = createHash('sha256').update(raw)
  const fonts = (style.fonts ?? []).map((font) => ({ ...font, path: path.resolve(dir, font.file) }))
  for (const font of [...fonts].sort((a, b) => a.file.localeCompare(b.file))) hash.update(font.file).update(fs.readFileSync(font.path))
  return { id, source, dir, file, style, fonts, sha256: hash.digest('hex') }
}

/**
 * Register the package fonts with Skia and return the scene-facing theme.
 * `theme.font(role, overrides)` yields a canvas font string for a typography role.
 */
export async function loadTheme(resolved) {
  if (resolved.fonts.length) {
    const { FontLibrary } = await import('skia-canvas')
    const byFamily = new Map()
    for (const font of resolved.fonts) byFamily.set(font.family, [...(byFamily.get(font.family) ?? []), font.path])
    for (const [family, files] of byFamily) FontLibrary.use(family, files)
  }
  const { style } = resolved
  const typography = style.typography
  const font = (role, overrides = {}) => {
    const spec = { ...(typography[role] ?? typography.body ?? Object.values(typography)[0]), ...overrides }
    const family = /[\s"']/.test(spec.family) && !/^["']/.test(spec.family) ? `"${spec.family}"` : spec.family
    return `${spec.style ?? 'normal'} ${spec.weight ?? 400} ${spec.size ?? 48}px ${family}`
  }
  return Object.freeze({
    id: resolved.id,
    sha256: resolved.sha256,
    name: style.name ?? resolved.id,
    colors: Object.freeze({ ...style.colors }),
    typography: Object.freeze({ ...typography }),
    layout: Object.freeze({ ...(style.layout ?? {}) }),
    motion: Object.freeze({ ...(style.motion ?? {}) }),
    tokens: Object.freeze({ ...(style.tokens ?? {}) }),
    bodyFont: (typography.body ?? Object.values(typography)[0]).family,
    font,
  })
}
