/**
 * One resolver for the two studio roots.
 *
 * `codeRoot` is the installed plugin package: skills, scripts, kit contracts,
 * standing rules and the built-in library payload. It is read-only in an npm
 * install and must never be used for user output.
 *
 * `dataRoot` is the user's production workspace: `projects/`, `library/` and
 * `.cache/`. It defaults to the nearest initialized workspace containing cwd,
 * or cwd itself when none exists.
 *
 * Precedence: explicit option / plugin row `dataRoot`, `VIDEO_STUDIO_ROOT`,
 * `studio.config.json` beside the package, then the workspace. Explicit and
 * environment values are relative to cwd; config values are relative to the
 * config file directory.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory holding this package (plugin code). */
export const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Optional config file beside the package. */
export const CONFIG_FILE_NAME = 'studio.config.json'

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function absoluteAgainst(base, value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(base, value)
}

/**
 * Read the optional `studio.config.json`.
 * @param {{ codeRoot?: string, env?: NodeJS.ProcessEnv, cwd?: string }} [options]
 * @returns {{ path?: string, dataRoot?: string, source: string, error?: string }}
 */
export function readStudioConfigFile(options = {}) {
  const root = options.codeRoot ?? codeRoot
  const env = options.env ?? process.env
  const file = nonEmpty(env.VIDEO_STUDIO_CONFIG)
    ? absoluteAgainst(options.cwd ?? process.cwd(), env.VIDEO_STUDIO_CONFIG)
    : path.join(root, CONFIG_FILE_NAME)
  if (!fs.existsSync(file)) return { source: 'none' }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return { path: file, source: 'config', error: `${file}: ${error.message}` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { path: file, source: 'config', error: `${file}: expected a JSON object` }
  }
  if (parsed.dataRoot !== undefined && !nonEmpty(parsed.dataRoot)) {
    return { path: file, source: 'config', error: `${file}: dataRoot must be a non-empty string` }
  }
  return {
    path: file,
    source: 'config',
    ...(nonEmpty(parsed.dataRoot) ? { dataRoot: absoluteAgainst(path.dirname(file), parsed.dataRoot) } : {}),
  }
}

/**
 * Resolve the production data root and discover initialized workspace ancestors.
 * @param {{
 *   dataRoot?: unknown,
 *   codeRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string,
 *   configFile?: { dataRoot?: string, error?: string, path?: string }
 * }} [options]
 * @returns {{ dataRoot: string, source: string, codeRoot: string, configPath?: string, warnings: string[] }}
 */
export function resolveDataRoot(options = {}) {
  const root = options.codeRoot ?? codeRoot
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const warnings = []
  const config = options.configFile ?? readStudioConfigFile({ codeRoot: root, env, cwd })
  if (config.error !== undefined) warnings.push(config.error)

  if (nonEmpty(options.dataRoot)) {
    return {
      dataRoot: absoluteAgainst(cwd, options.dataRoot),
      source: 'explicit',
      codeRoot: root,
      ...(config.path === undefined ? {} : { configPath: config.path }),
      warnings,
    }
  }
  if (nonEmpty(env.VIDEO_STUDIO_ROOT)) {
    return {
      dataRoot: absoluteAgainst(cwd, env.VIDEO_STUDIO_ROOT),
      source: 'env',
      codeRoot: root,
      ...(config.path === undefined ? {} : { configPath: config.path }),
      warnings,
    }
  }
  if (nonEmpty(config.dataRoot)) {
    return {
      dataRoot: absoluteAgainst(config.path ? path.dirname(config.path) : cwd, config.dataRoot),
      source: 'config',
      codeRoot: root,
      ...(config.path === undefined ? {} : { configPath: config.path }),
      warnings,
    }
  }
  const start = path.resolve(cwd)
  let workspace = start
  while (true) {
    if (fs.existsSync(path.join(workspace, 'library', 'catalog.json'))) break
    const parent = path.dirname(workspace)
    if (parent === workspace) {
      workspace = start
      break
    }
    workspace = parent
  }
  return {
    dataRoot: workspace,
    source: workspace === start ? 'workspace' : 'workspace-ancestor',
    codeRoot: root,
    ...(config.path === undefined ? {} : { configPath: config.path }),
    warnings,
  }
}

/**
 * Paths for one data root.
 * @param {string} dataRoot
 * @param {string} [root]
 */
export function resolveStudioPaths(dataRoot, root = codeRoot) {
  const data = path.resolve(dataRoot)
  const code = path.resolve(root)
  return {
    codeRoot: code,
    dataRoot: data,
    projects: path.join(data, 'projects'),
    library: path.join(data, 'library'),
    cache: path.join(data, '.cache'),
    kit: path.join(code, 'kit'),
    skills: path.join(code, 'skills'),
    scripts: path.join(code, 'scripts'),
    rules: path.join(code, 'AGENTS.md'),
    builtinLibrary: path.join(code, 'library'),
  }
}

const resolved = resolveDataRoot()

/** Directory holding projects, library and cache for this process. */
export const dataRoot = resolved.dataRoot
/** Resolution metadata (source, config path, warnings). */
export const rootResolution = resolved
/** Effective paths for this process. */
export const paths = resolveStudioPaths(dataRoot)

const LIBRARY_DIRS = ['scenes', 'templates', 'styles']

function copyMissing(source, destination) {
  if (!fs.existsSync(source)) return []
  const copied = []
  if (fs.statSync(source).isFile()) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(source, destination)
      copied.push(destination)
    }
    return copied
  }
  if (!fs.statSync(source).isDirectory()) return []
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      copied.push(...copyMissing(from, to))
    } else if (entry.isFile() && !fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      copied.push(to)
    }
  }
  return copied
}

/**
 * Idempotently create the workspace and overlay the built-in library.
 *
 * Missing files are copied from the installed package; existing files are never
 * overwritten. A separate data root therefore receives the built-in style
 * packages even when the plugin was installed from an npm tarball.
 * @param {{ dataRoot?: string, codeRoot?: string, withBuiltins?: boolean }} [options]
 */
export function ensureWorkspace(options = {}) {
  const data = path.resolve(options.dataRoot ?? dataRoot)
  const code = path.resolve(options.codeRoot ?? codeRoot)
  const created = []
  const copiedFiles = []
  for (const dir of ['projects', 'library', '.cache']) {
    const absolute = path.join(data, dir)
    if (!fs.existsSync(absolute)) created.push(absolute)
    fs.mkdirSync(absolute, { recursive: true })
  }
  for (const dir of LIBRARY_DIRS) {
    const absolute = path.join(data, 'library', dir)
    if (!fs.existsSync(absolute)) created.push(absolute)
    fs.mkdirSync(absolute, { recursive: true })
  }

  const builtin = path.join(code, 'library')
  const withBuiltins = options.withBuiltins ?? true
  if (withBuiltins && data !== code && fs.existsSync(builtin)) {
    // Copy style packages, but never copy a catalog whose scene/template files
    // were not copied: that would leave entries pointing at missing files.
    const styles = path.join(builtin, 'styles')
    copiedFiles.push(...copyMissing(styles, path.join(data, 'library', 'styles')))
  }

  const catalog = path.join(data, 'library', 'catalog.json')
  const builtinCatalog = path.join(builtin, 'catalog.json')
  let content = `${JSON.stringify({ schemaVersion: 1, entries: [] }, null, 2)}\n`
  let copiedCatalog = false
  if (withBuiltins && data !== code && fs.existsSync(builtinCatalog)) {
    try {
      const raw = fs.readFileSync(builtinCatalog, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.entries) && parsed.entries.length === 0) {
        content = raw
        copiedCatalog = true
      }
    } catch {
      // A broken built-in catalog must not block workspace initialization.
    }
  }
  try {
    fs.writeFileSync(catalog, content, { flag: 'wx' })
    ;(copiedCatalog ? copiedFiles : created).push(catalog)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(catalog, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      throw new Error('entries must be an array')
    }
  } catch (error) {
    throw new Error(`library catalog is not valid JSON with an entries array: ${catalog}: ${error.message}`)
  }

  return {
    dataRoot: data,
    codeRoot: code,
    created: [...new Set(created)],
    copiedFiles,
    paths: resolveStudioPaths(data, code),
  }
}
