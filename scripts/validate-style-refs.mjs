#!/usr/bin/env node
/**
 * Validate a series project's `styleRefs` against `library/styles/<id>/`.
 *
 * Usage:
 *   node scripts/validate-style-refs.mjs <project-dir> [--library <dir>] [--json]
 *
 * Exit codes: 0 pass, 1 validation failure, 2 usage or unreadable project.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

/**
 * @param {string} projectDir
 * @param {{ library?: string }} [options]
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

  const library = path.resolve(options.library ?? path.join(project, '..', '..', 'library'))
  const refs = manifest.styleRefs ?? []
  if (!Array.isArray(refs)) {
    errors.push('project.json styleRefs must be an array of style ids')
    return { ok: false, errors, warnings, data: { library, refs: [] } }
  }

  const checked = []
  for (const id of refs) {
    if (typeof id !== 'string' || !ID.test(id)) {
      errors.push(`invalid style id: ${JSON.stringify(id)}`)
      continue
    }
    const dir = path.join(library, 'styles', id)
    const stylePath = path.join(dir, 'style.json')
    if (!existsSync(stylePath)) {
      errors.push(`style "${id}" is missing ${path.relative(library, stylePath)}`)
      continue
    }
    let style
    try {
      style = readJson(stylePath)
    } catch (error) {
      errors.push(error.message)
      continue
    }
    if (style.schemaVersion !== 1) errors.push(`style "${id}" schemaVersion is ${JSON.stringify(style.schemaVersion)}; expected 1`)
    if (style.id !== id) errors.push(`style "${id}" declares id ${JSON.stringify(style.id)}`)
    if (typeof style.language !== 'string' || style.language.length === 0) errors.push(`style "${id}" needs a language`)
    if (typeof style.rights !== 'string' || style.rights.length === 0) errors.push(`style "${id}" needs a rights note`)
    for (const [field, label] of [['source', 'source'], ['notes', 'notes']]) {
      const value = style[field]
      if (typeof value !== 'string' || value.length === 0) {
        if (field === 'source') errors.push(`style "${id}" needs a source file`)
        else warnings.push(`style "${id}" has no notes file`)
        continue
      }
      const file = path.join(dir, value)
      if (!existsSync(file) || !statSync(file).isFile()) errors.push(`style "${id}" ${label} file is missing: ${value}`)
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
  const args = { json: false, library: undefined, project: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--library') {
      index += 1
      if (argv[index] === undefined) throw new Error('--library needs a directory')
      args.library = argv[index]
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
    console.error(`Usage: node scripts/validate-style-refs.mjs <project-dir> [--library <dir>] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = validateStyleRefs(args.project, { library: args.library })
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
