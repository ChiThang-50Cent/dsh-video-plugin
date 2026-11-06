#!/usr/bin/env node
/**
 * Create a visual style package by copying an existing look.
 *
 * Usage:
 *   node scripts/new-visual-style.mjs <id> [--from <id>] [--name <text>] [--data-root <dir>] [--json]
 *
 * Copies style.json, declared font files, fonts/ and notes.md from `--from`
 * (default: `default`), found in the workspace library or bundled built-ins, into
 * `<dataRoot>/library/visual-styles/<id>/`. Reference frames (refs/) belong to
 * the source look and are not copied. Never overwrites an existing package.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDataRoot } from './studio-paths.mjs'
import { DEFAULT_VISUAL_STYLE, VISUAL_STYLE_ID, resolveVisualStyle } from './lib/render/theme.mjs'

export function newVisualStyle(id, options = {}) {
  if (!VISUAL_STYLE_ID.test(id ?? '')) throw new Error(`style id must be a lowercase slug: ${JSON.stringify(id)}`)
  const dataRoot = path.resolve(options.dataRoot ?? resolveDataRoot().dataRoot)
  const from = resolveVisualStyle({ id: options.from ?? DEFAULT_VISUAL_STYLE, dataRoot })
  const destination = path.join(dataRoot, 'library', 'visual-styles', id)
  if (fs.existsSync(destination)) throw new Error(`visual style already exists, refusing to overwrite: ${destination}`)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), `.${id}-`))
  try {
    const style = { ...from.style, id, name: options.name ?? `${from.style.name ?? from.id} (copy)`, derivedFrom: from.id }
    fs.writeFileSync(path.join(staging, 'style.json'), `${JSON.stringify(style, null, 2)}\n`)
    if (fs.existsSync(path.join(from.dir, 'fonts'))) fs.cpSync(path.join(from.dir, 'fonts'), path.join(staging, 'fonts'), { recursive: true, dereference: true })
    for (const font of from.fonts) {
      const target = path.join(staging, font.file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(font.path, target)
    }
    const notes = path.join(from.dir, 'notes.md')
    fs.writeFileSync(path.join(staging, 'notes.md'), fs.existsSync(notes)
      ? `${fs.readFileSync(notes, 'utf8').trimEnd()}\n\n<!-- Copied from "${from.id}"; rewrite for "${id}". -->\n`
      : `# ${style.name}\n\nDerived from \`${from.id}\`. Record what this look is for, what to avoid, and why the tokens were chosen.\n`)
    fs.renameSync(staging, destination)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
  return { id, from: from.id, dir: destination }
}

function main() {
  const args = process.argv.slice(2)
  const options = {}
  let id, json = false
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      const value = () => { if (args[i + 1] === undefined) throw new Error(`${arg} needs a value`); return args[++i] }
      if (arg === '--from') options.from = value()
      else if (arg === '--name') options.name = value()
      else if (arg === '--data-root') options.dataRoot = value()
      else if (arg === '--json') json = true
      else if (!arg.startsWith('-') && id === undefined) id = arg
      else throw new Error(`unexpected argument: ${arg}`)
    }
    const result = newVisualStyle(id, options)
    console.log(json ? JSON.stringify(result, null, 2) : `Created visual style "${result.id}" from "${result.from}": ${result.dir}`)
  } catch (error) {
    console.error(`new-visual-style: ${error.message}\nUsage: node scripts/new-visual-style.mjs <id> [--from <id>] [--name <text>] [--data-root <dir>] [--json]`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
