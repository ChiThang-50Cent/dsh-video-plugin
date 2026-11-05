#!/usr/bin/env node
/**
 * Idempotently initialize a studio data root.
 *
 * Safe to run repeatedly: directories are created only when missing and the
 * built-in library (catalog, default style, style packages) is copied without
 * overwriting user files. This is what makes an npm-installed plugin usable
 * with `VIDEO_STUDIO_ROOT` outside the package directory.
 *
 * Usage:
 *   node scripts/init-workspace.mjs [--data-root <dir>] [--json]
 *   VIDEO_STUDIO_ROOT=/data/video node scripts/init-workspace.mjs
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { codeRoot, ensureWorkspace, resolveDataRoot } from './studio-paths.mjs'

function parseArgs(argv) {
  const args = { dataRoot: undefined, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--data-root') {
      index += 1
      if (argv[index] === undefined) throw new Error('--data-root needs a directory')
      args.dataRoot = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else throw new Error(`unexpected argument: ${value}`)
  }
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/init-workspace.mjs [--data-root <dir>] [--json]\n${error.message}`)
    process.exitCode = 2
    return
  }
  const resolution = resolveDataRoot({ dataRoot: args.dataRoot })
  let result
  try {
    result = ensureWorkspace({ dataRoot: resolution.dataRoot, codeRoot })
  } catch (error) {
    console.error(`init-workspace: ${error.message}`)
    process.exitCode = 1
    return
  }
  if (args.json) {
    console.log(JSON.stringify({
      dataRoot: result.dataRoot,
      codeRoot: result.codeRoot,
      rootSource: resolution.source,
      created: result.created.map((entry) => path.relative(result.dataRoot, entry) || '.'),
      copied: result.copiedFiles.map((entry) => path.relative(result.dataRoot, entry)),
      idempotent: true,
    }, null, 2))
  } else {
    console.log(`Studio data root: ${result.dataRoot}`)
    console.log(`  created: ${result.created.length}, built-in files copied: ${result.copiedFiles.length}`)
    console.log('Workspace initialized (idempotent).')
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
