#!/usr/bin/env node
/**
 * Validate a series project's `styleRefs` against the studio library.
 *
 * The default library is `<dataRoot>/library`, resolved by the same module the
 * plugin uses, so an external data root and a different cwd agree. A style
 * package must declare its id, language and rights and provide derived notes.
 * A reference transcript may be intentionally absent from an npm package; that
 * is only accepted when `style.json` declares `sourceBundled: false` and an
 * `externalSource` explanation.
 *
 * Usage:
 *   node scripts/validate-style-refs.mjs <project-dir> [--library <dir>] [--data-root <dir>] [--json]
 *
 * Exit codes: 0 pass, 1 validation failure, 2 usage or unreadable project.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDataRoot, resolveStudioPaths } from './studio-paths.mjs'

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

function inside(root, relative) {
  const absolute = path.resolve(root, String(relative))
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : undefined
}

/**
 * @param {string} projectDir
 * @param {{ library?: string, dataRoot?: string }} [options]
 */
export function validateStyleRefs(projectDir, options = {}) {
  const project = path.resolve(projectDir)
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new Error(`project directory not found: ${project}`)
  const manifestPath = path.join(project, 'project.json')
  if (!existsSync(manifestPath)) throw new Error(`project.json not found: ${manifestPath}`)

  const errors = []
  const warnings = []
  let manifest
  try {
    manifest = readJson(manifestPath)
  } catch (error) {
    throw new Error(`project.json is not readable JSON: ${error.message}`)
  }

  const library = path.resolve(options.library ?? resolveStudioPaths(
    resolveDataRoot({ dataRoot: options.dataRoot }).dataRoot,
  ).library)
  const refs = manifest.styleRefs ?? []
  if (!Array.isArray(refs)) {
    errors.push('project.json styleRefs must be an array of style ids')
    return { ok: false, errors, warnings, data: { project, library, refs: [] } }
  }

  const checked = []
  const seen = new Set()
  for (const id of refs) {
    if (typeof id !== 'string' || !ID.test(id)) {
      errors.push(`invalid style id: ${JSON.stringify(id)}; ids use lowercase letters, digits and hyphens`)
      continue
    }
    if (seen.has(id)) {
      errors.push(`style "${id}" is referenced more than once`)
      continue
    }
    seen.add(id)
    const dir = path.join(library, 'styles', id)
    const stylePath = path.join(dir, 'style.json')
    if (!existsSync(stylePath)) {
      errors.push(`style "${id}" is missing library/styles/${id}/style.json; create the package or remove the ref`)
      continue
    }
    let style
    try {
      style = readJson(stylePath)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    if (style === null || typeof style !== 'object' || Array.isArray(style)) {
      errors.push(`style "${id}" style.json must be an object`)
      continue
    }
    if (style.schemaVersion !== 1) errors.push(`style "${id}" schemaVersion is ${JSON.stringify(style.schemaVersion)}; expected 1`)
    if (style.id !== id) errors.push(`style "${id}" declares id ${JSON.stringify(style.id)}; the directory id must match`)
    if (typeof style.language !== 'string' || style.language.length === 0) errors.push(`style "${id}" needs a language (for example "vi")`)
    if (typeof style.rights !== 'string' || style.rights.length === 0) errors.push(`style "${id}" needs a rights note explaining what may be reused`)
    for (const field of ['useAs', 'doNotUseAs']) {
      if (style[field] !== undefined && (typeof style[field] !== 'string' || style[field].trim().length === 0)) {
        errors.push(`style "${id}" ${field} must be a non-empty string when present`)
      }
    }

    const notes = style.notes
    if (typeof notes !== 'string' || notes.length === 0) {
      errors.push(`style "${id}" needs a notes file with derived guidance (not a copy of the source)`)
    } else {
      const notesFile = inside(dir, notes)
      if (notesFile === undefined) errors.push(`style "${id}" notes path escapes the package: ${notes}`)
      else if (!existsSync(notesFile) || !statSync(notesFile).isFile()) errors.push(`style "${id}" notes file is missing: ${notes}`)
      else if (readFileSync(notesFile, 'utf8').trim().length < 100) warnings.push(`style "${id}" notes file is very short; record what to take, what not to copy, voice and audit notes`)
    }

    const source = style.source
    if (typeof source !== 'string' || source.length === 0) {
      errors.push(`style "${id}" needs a source file reference`)
    } else {
      const sourceFile = inside(dir, source)
      if (sourceFile === undefined) {
        errors.push(`style "${id}" source path escapes the package: ${source}`)
      } else if (!existsSync(sourceFile) || !statSync(sourceFile).isFile()) {
        if (style.sourceBundled === false) {
          if (typeof style.externalSource !== 'string' || style.externalSource.trim().length === 0) {
            errors.push(`style "${id}" is not bundling its source; declare externalSource so an installed package explains where the reference lives`)
          } else {
            warnings.push(`style "${id}" source "${source}" is not bundled (${style.externalSource}); notes remain the reusable extract`)
          }
        } else {
          errors.push(`style "${id}" source file is missing: ${source}; add it or set sourceBundled: false with externalSource`)
        }
      }
    }
    checked.push(id)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: { project, library, refs, checked },
  }
}

function parseArgs(argv) {
  const args = { json: false, library: undefined, project: undefined, dataRoot: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--library') {
      index += 1
      if (argv[index] === undefined) throw new Error('--library needs a directory')
      args.library = argv[index]
    } else if (value === '--data-root') {
      index += 1
      if (argv[index] === undefined) throw new Error('--data-root needs a directory')
      args.dataRoot = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.project === undefined) args.project = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.project === undefined) throw new Error('missing project directory')
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/validate-style-refs.mjs <project-dir> [--library <dir>] [--data-root <dir>] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = validateStyleRefs(args.project, { library: args.library, dataRoot: args.dataRoot })
  } catch (error) {
    console.error(`validate-style-refs: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Style refs: ${result.data.project}`)
    console.log(`  library: ${result.data.library}`)
    console.log(`  refs: ${result.data.checked.length === 0 ? 'none' : result.data.checked.join(', ')}`)
    for (const warning of result.warnings) console.log(`WARN: ${warning}`)
    for (const error of result.errors) console.log(`ERROR: ${error}`)
    console.log(`RESULT: ${result.ok ? 'PASS' : 'FAIL'}`)
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
