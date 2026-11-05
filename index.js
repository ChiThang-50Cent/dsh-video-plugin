/**
 * Portable video studio: register the studio skills for every session in the
 * profile, so they work from any workspace.
 *
 * The skills live in this package, not in the session's project root. Each
 * registered body carries the resolved studio roots, because a session opened
 * in another workspace must not resolve `projects/`, `library/` or `scripts/`
 * against its own working directory.
 *
 * `scripts/studio-paths.mjs` owns root resolution for the plugin and every CLI
 * helper. The plugin adds the configurable `dataRoot` row value to that one
 * resolver instead of reimplementing path logic here.
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDataRoot, resolveStudioPaths } from './scripts/studio-paths.mjs'

export const name = 'video-studio'

/** Wait for the skill registry before registering the catalog. */
export const inject = ['skills']

const packageRoot = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the studio data root with the shared resolver.
 * @param {unknown} [configured] - optional `dataRoot` from the plugin row.
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {string} absolute data root.
 */
export function dataRootOf(configured, options = {}) {
  return resolveDataRoot({
    dataRoot: typeof configured === 'string' ? configured : undefined,
    codeRoot: packageRoot,
    env: options.env ?? process.env,
  }).dataRoot
}

/**
 * Split YAML frontmatter from a SKILL.md body.
 * @param {string} text - file contents.
 * @returns {{ meta: Record<string, string>, body: string }} parsed parts.
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { meta: {}, body: text }
  const end = lines.indexOf('---', 1)
  if (end === -1) return { meta: {}, body: text }
  const meta = {}
  for (let index = 1; index < end; index += 1) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index])
    if (match === null) continue
    const [, key, raw] = match
    if (raw === '>' || raw === '|') {
      const parts = []
      for (index += 1; index < end; index += 1) {
        if (lines[index].trim() === '') continue
        if (!/^\s+/.test(lines[index])) { index -= 1; break }
        parts.push(lines[index].trim())
      }
      meta[key] = parts.join(raw === '>' ? ' ' : '\n')
      continue
    }
    meta[key] = raw.replace(/^(['"])(.*)\1$/, '$2').trim()
  }
  return { meta, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') }
}

/**
 * Describe where the studio code and outputs live, and the standing rules.
 * @param {string} dataRoot - resolved data root.
 * @param {string} [root] - package/code root.
 * @returns {string} markdown quote block prepended to every skill body.
 */
export function studioHeader(dataRoot, root = packageRoot) {
  const code = resolveStudioPaths(dataRoot, root).codeRoot
  const same = dataRoot === code
  const lines = same
    ? [`Studio root: \`${code}\` (code, projects, library, cache)`]
    : [
      `Studio code root: \`${code}\``,
      `Studio data root: \`${dataRoot}\` (projects, library, cache)`,
    ]
  return [
    ...lines,
    `Standing rules: \`${join(code, 'AGENTS.md')}\` — read it before the first production action.`,
    'Resolve every `projects/`, `library/`, `scripts/` and `.cache/` path against these roots, never against the session working directory.',
    `\`node ${join(code, 'scripts', 'studio-root.mjs')}\` prints the same roots as JSON.`,
  ].map((line) => `> ${line}`).join('\n')
}

/**
 * Register every `<skills>/<name>/SKILL.md` as a runtime skill.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ dataRoot?: string } | undefined} config - row config.
 */
export async function apply(ctx, config) {
  const resolution = resolveDataRoot({
    dataRoot: typeof config?.dataRoot === 'string' ? config.dataRoot : undefined,
    codeRoot: packageRoot,
  })
  const dataRoot = resolution.dataRoot
  for (const warning of resolution.warnings ?? []) ctx.logger?.warn(`video-studio: ${warning}`)
  const skillsDir = join(packageRoot, 'skills')
  const header = studioHeader(dataRoot, packageRoot)
  let entries
  try {
    entries = await readdir(skillsDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`video-studio: skills directory is unreadable: ${skillsDir}`, { cause: error })
  }
  let registered = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = join(skillsDir, entry.name, 'SKILL.md')
    let raw
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      ctx.logger?.warn(`video-studio: skipping unreadable skill ${file}`, error)
      continue
    }
    const { meta, body } = parseFrontmatter(raw)
    if (meta.name === undefined || meta.description === undefined) {
      ctx.logger?.warn(`video-studio: skipping skill without name/description: ${file}`)
      continue
    }
    ctx.skills.register({
      name: meta.name,
      description: meta.description,
      ...(meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse }),
      content: `${header}\n\n${body}`,
      path: file,
      // The registry defaults invocation and provider, but not the prompt-visible origin.
      source: 'runtime',
    })
    registered += 1
  }
  if (registered === 0) throw new Error(`video-studio: no skills registered from ${skillsDir}`)
}
