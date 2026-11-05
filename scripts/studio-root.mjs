#!/usr/bin/env node
// Print the resolved studio roots as JSON for agents, plugins and path checks.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  codeRoot,
  ensureWorkspace,
  resolveDataRoot,
  resolveStudioPaths,
} from './studio-paths.mjs'

function parseArgs(argv) {
  const args = { json: true, dataRoot: undefined, init: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json') args.json = true
    else if (value === '--init') args.init = true
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
    console.error(`Usage: node scripts/studio-root.mjs [--data-root <dir>] [--init]\n${error.message}`)
    process.exitCode = 2
    return
  }
  const resolution = resolveDataRoot({ dataRoot: args.dataRoot })
  let init
  if (args.init) init = ensureWorkspace({ dataRoot: resolution.dataRoot, codeRoot })
  const paths = resolveStudioPaths(resolution.dataRoot, codeRoot)
  console.log(JSON.stringify({
    ...paths,
    rootSource: resolution.source,
    ...(resolution.configPath === undefined ? {} : { configFile: resolution.configPath }),
    warnings: resolution.warnings,
    ...(init === undefined ? {} : {
      init: { created: init.created.length, copiedFiles: init.copiedFiles.length },
    }),
  }, null, 2))
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
