#!/usr/bin/env node
/**
 * Promote one accepted scene as a COPY/PATCH example in the shared library.
 *
 * Safety properties:
 *   - works with an empty/absent library (no ENOENT on first promotion);
 *   - copies into a staging directory and renames it atomically;
 *   - writes the catalog through a temporary file and never leaves a partial
 *     entry after a failure;
 *   - rejects non-PASS, contradictory or evidence-free QA reports, id
 *     collisions, symlink escapes and files outside this studio's projects;
 *   - records source/preview/QA hashes, template version, backend compatibility
 *     and the source episode.
 *
 * Usage:
 *   node scripts/promote-scene.mjs <catalog-id> <scene-code> <preview> <qa-report>
 *        [--backend <renderer>] [--version <n>] [--purpose <text>] [--tags a,b] [--json]
 *        [--data-root <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { codeRoot as defaultCodeRoot, ensureWorkspace, resolveDataRoot, resolveStudioPaths } from './studio-paths.mjs'

const ID = /^[a-z][a-z0-9-]{3,}$/
const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.vue', '.svelte'])
const PREVIEW_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm'])

function parseArgs(argv) {
  const args = {
    id: undefined, scene: undefined, preview: undefined, qa: undefined,
    backend: undefined, version: undefined, purpose: undefined, tags: undefined,
    json: false, dataRoot: undefined,
  }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const need = () => {
      index += 1
      if (argv[index] === undefined) throw new Error(`${value} needs a value`)
      return argv[index]
    }
    if (value === '--backend') args.backend = need()
    else if (value === '--version') args.version = need()
    else if (value === '--purpose') args.purpose = need()
    else if (value === '--tags') args.tags = need()
    else if (value === '--data-root') args.dataRoot = need()
    else if (value === '--json') args.json = true
    else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else positional.push(value)
  }
  ;[args.id, args.scene, args.preview, args.qa] = positional
  return args
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function realpathInside(root, file) {
  const realRoot = fs.realpathSync(root)
  const real = fs.realpathSync(file)
  if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) return undefined
  return real
}

function validateQa(qa, id, errors, projectsRoot, qaDir) {
  if (qa === null || typeof qa !== 'object' || Array.isArray(qa)) {
    errors.push('QA report must be a JSON object')
    return
  }
  const statuses = []
  if (qa.status !== undefined) statuses.push(String(qa.status).toUpperCase())
  if (qa.result !== undefined) statuses.push(String(qa.result).toUpperCase())
  if (qa.verdict !== undefined) statuses.push(String(qa.verdict).toUpperCase())
  if (statuses.length === 0) errors.push('QA report has no status/result/verdict')
  const passes = statuses.filter((status) => status === 'PASS').length
  if (passes === 0) errors.push(`QA report is not PASS (${statuses.join(', ') || 'missing'})`)
  if (passes > 0 && passes !== statuses.length) errors.push(`QA report has contradictory verdicts: ${statuses.join(', ')}`)
  if (qa.ok === false) errors.push('QA report has ok: false')
  if (qa.failed > 0) errors.push(`QA report has ${qa.failed} failed check(s)`)
  for (const field of ['blockers', 'errors', 'failures']) {
    if (Array.isArray(qa[field]) && qa[field].length > 0) errors.push(`QA report has non-empty ${field}`)
  }
  if (qa.sceneId !== undefined && qa.sceneId !== id) errors.push(`QA sceneId ${JSON.stringify(qa.sceneId)} does not match ${id}`)
  if (qa.id !== undefined && qa.id !== id) errors.push(`QA id ${JSON.stringify(qa.id)} does not match ${id}`)
  if (projectsRoot !== undefined) {
    for (const field of ['evidencePaths', 'previewPaths', 'codePaths']) {
      if (qa[field] === undefined) continue
      if (!Array.isArray(qa[field])) {
        errors.push(`QA ${field} must be an array when present`)
        continue
      }
      for (const [index, relative] of qa[field].entries()) {
        if (typeof relative !== 'string' || relative.length === 0) {
          errors.push(`QA ${field}[${index}] must be a non-empty path`)
          continue
        }
        const dataRoot = path.dirname(projectsRoot)
        const candidates = [
          path.resolve(dataRoot, relative),
          path.resolve(projectsRoot, relative),
          ...(qaDir === undefined ? [] : [path.resolve(qaDir, relative), path.resolve(path.dirname(qaDir), relative)]),
          path.resolve(relative),
        ]
        const absolute = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
        if (absolute === undefined) {
          errors.push(`QA ${field}[${index}] references a missing file: ${relative}`)
          continue
        }
        if (realpathInside(projectsRoot, absolute) === undefined) errors.push(`QA ${field}[${index}] escapes the projects directory: ${relative}`)
      }
    }
  }
}

function readCatalog(file, errors) {
  if (!fs.existsSync(file)) return { schemaVersion: 1, entries: [] }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`library catalog is not readable JSON: ${error.message}`)
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
    errors.push('library catalog must be an object with an entries array')
    return undefined
  }
  return parsed
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temp, file)
}

/**
 * @param {{
 *   id: string, scene: string, preview: string, qa: string,
 *   backend?: string, version?: string|number, purpose?: string, tags?: string,
 *   dataRoot?: string, codeRoot?: string
 * }} options
 */
export function promoteScene(options) {
  const errors = []
  const { id } = options
  if (!ID.test(id ?? '')) errors.push(`catalog id must match ${ID} (lowercase, starts with a letter, at least 4 characters)`)
  const resolution = resolveDataRoot({ dataRoot: options.dataRoot, codeRoot: options.codeRoot ?? defaultCodeRoot })
  const roots = resolveStudioPaths(resolution.dataRoot, options.codeRoot ?? defaultCodeRoot)
  ensureWorkspace({ dataRoot: roots.dataRoot, codeRoot: roots.codeRoot })
  const library = roots.library
  const scenesRoot = path.join(library, 'scenes')
  const stagingRoot = path.join(library, '.staging')
  const catalogPath = path.join(library, 'catalog.json')
  fs.mkdirSync(scenesRoot, { recursive: true })
  fs.mkdirSync(stagingRoot, { recursive: true })

  const inputs = [options.scene, options.preview, options.qa]
  if (inputs.some((file) => typeof file !== 'string' || file.length === 0)) errors.push('scene, preview and QA paths are required')
  const resolved = []
  const projectsRoot = path.join(roots.dataRoot, 'projects')
  if (errors.length === 0) {
    if (!fs.existsSync(projectsRoot)) errors.push(`projects directory not found: ${projectsRoot}`)
    for (const [index, file] of inputs.entries()) {
      const absolute = path.resolve(file)
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        errors.push(`input is not an existing regular file: ${absolute}`)
        continue
      }
      const real = realpathInside(projectsRoot, absolute)
      if (real === undefined) {
        errors.push(`input must resolve inside ${projectsRoot}: ${absolute}`)
        continue
      }
      const extension = path.extname(real).toLowerCase()
      const allowed = index === 0 ? SOURCE_EXT : index === 1 ? PREVIEW_EXT : new Set(['.json'])
      if (!allowed.has(extension)) errors.push(`unexpected ${index === 0 ? 'scene' : index === 1 ? 'preview' : 'QA'} extension ${extension || '(none)'} for ${path.basename(real)}`)
      resolved.push(real)
    }
  }

  let qa
  if (resolved[2] !== undefined) {
    try {
      qa = JSON.parse(fs.readFileSync(resolved[2], 'utf8'))
    } catch (error) {
      errors.push(`QA report is not readable JSON: ${error.message}`)
    }
    if (qa !== undefined) validateQa(qa, id, errors, projectsRoot, resolved[2] === undefined ? undefined : path.dirname(resolved[2]))
  }

  const catalog = readCatalog(catalogPath, errors)
  if (catalog !== undefined && catalog.entries.some((entry) => entry?.id === id)) {
    errors.push(`catalog id already exists; do not overwrite an accepted version: ${id}`)
  }
  if (fs.existsSync(path.join(scenesRoot, id))) errors.push(`scene directory already exists; refusing to overwrite: library/scenes/${id}`)
  if (fs.existsSync(path.join(stagingRoot, id))) errors.push(`staging directory already exists: library/.staging/${id}`)

  if (errors.length > 0) return { ok: false, errors, warnings: [] }
  if (catalog === undefined) return { ok: false, errors: ['catalog is unreadable'], warnings: [] }

  const version = options.version === undefined ? 1 : Number(options.version)
  if (!Number.isInteger(version) || version < 1) errors.push('--version must be a positive integer')
  if (typeof options.backend === 'string' && options.backend.length > 0 && !/^[a-z0-9][a-z0-9._-]*$/i.test(options.backend)) {
    errors.push('--backend must be a simple renderer identifier')
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [] }

  const staging = path.join(stagingRoot, id)
  fs.mkdirSync(staging, { recursive: false })
  const finalDir = path.join(scenesRoot, id)
  const tempCatalog = `${catalogPath}.tmp-${process.pid}-${Date.now()}`
  try {
    const sourceName = `source${path.extname(resolved[0]).toLowerCase()}`
    const previewName = `preview${path.extname(resolved[1]).toLowerCase()}`
    fs.copyFileSync(resolved[0], path.join(staging, sourceName))
    fs.copyFileSync(resolved[1], path.join(staging, previewName))
    fs.copyFileSync(resolved[2], path.join(staging, 'qa.json'))
    const hashes = {
      source: sha256(path.join(staging, sourceName)),
      preview: sha256(path.join(staging, previewName)),
      qa: sha256(path.join(staging, 'qa.json')),
    }
    const backend = options.backend ?? (typeof qa?.backend === 'string' && qa.backend.length > 0 ? qa.backend : 'unknown')
    const tags = typeof options.tags === 'string'
      ? options.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      : (Array.isArray(qa?.tags) ? qa.tags.filter((tag) => typeof tag === 'string') : [])
    const entry = {
      id,
      category: 'accepted-example',
      purpose: options.purpose ?? (typeof qa?.purpose === 'string' ? qa.purpose : 'Describe visual intent before generalizing'),
      tags,
      backend,
      backendCompatibility: {
        renderer: backend,
        verified: qa?.backendVerified === true,
        notes: typeof qa?.backendVersion === 'string' ? `QA engine: ${qa.backendVersion}` : 'Backend compatibility inferred from the source QA report; not re-verified by promotion.',
      },
      sourcePath: `library/scenes/${id}/${sourceName}`,
      preview: `library/scenes/${id}/${previewName}`,
      qaReportPath: `library/scenes/${id}/qa.json`,
      sourceSha256: hashes.source,
      previewSha256: hashes.preview,
      qaSha256: hashes.qa,
      qaEvidence: {
        status: 'PASS',
        checks: Array.isArray(qa?.checks) ? qa.checks.length : undefined,
        evidencePaths: Array.isArray(qa?.evidencePaths) ? qa.evidencePaths : undefined,
      },
      paramSchema: null,
      limitations: ['Promoted as a COPY/PATCH reference; not yet a parameterized template', 'Preview and QA were copied from the source episode; re-verify on a different backend before reuse'],
      requirements: [],
      qaStatus: 'PASS',
      templateVersion: version,
      sourceEpisode: path.relative(roots.dataRoot, resolved[0]),
      promotedAt: new Date().toISOString(),
    }
    const nextCatalog = { ...catalog, entries: [...catalog.entries, entry] }
    fs.writeFileSync(tempCatalog, `${JSON.stringify(nextCatalog, null, 2)}\n`)
    // Commit order: scene directory first, then catalog. If the catalog rename
    // fails, remove the committed scene so the catalog can never point at a
    // half-promoted entry.
    fs.renameSync(staging, finalDir)
    try {
      fs.renameSync(tempCatalog, catalogPath)
    } catch (error) {
      fs.rmSync(finalDir, { recursive: true, force: true })
      throw error
    }
    return {
      ok: true,
      errors: [],
      warnings: entry.backendCompatibility.verified ? [] : ['backend compatibility was not verified; recorded as unverified'],
      entry,
      paths: { sceneDir: finalDir, catalog: catalogPath },
    }
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
    if (fs.existsSync(tempCatalog)) fs.rmSync(tempCatalog, { force: true })
  }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/promote-scene.mjs <catalog-id> <scene-code> <preview> <qa-report> [options]\n${error.message}`)
    process.exitCode = 2
    return
  }
  if (!args.id || !args.scene || !args.preview || !args.qa) {
    console.error('Usage: node scripts/promote-scene.mjs <catalog-id> <scene-code> <preview> <qa-report> [--backend <name>] [--version <n>] [--purpose <text>] [--tags a,b] [--json] [--data-root <dir>]')
    process.exitCode = 2
    return
  }
  let result
  try {
    result = promoteScene(args)
  } catch (error) {
    console.error(`promote-scene: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else if (result.ok) {
    console.log(`Promoted accepted example: ${args.id}`)
    console.log(`  entry: library/catalog.json`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
  } else {
    for (const error of result.errors) console.error(`ERROR: ${error}`)
  }
  process.exitCode = result.ok ? 0 : result.errors.some((error) => /already exists|refusing to overwrite/.test(error)) ? 3 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
