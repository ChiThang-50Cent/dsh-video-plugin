/**
 * Portable video studio: register the studio skills for every session in the
 * profile, so they work from any workspace.
 *
 * Skills live in this package; production data defaults to each session's
 * workspace. Headers are rendered at lookup time for that workspace.
 *
 * `scripts/studio-paths.mjs` owns root resolution for the plugin and every CLI
 * helper. The plugin adds the configurable `dataRoot` row value to that one
 * resolver instead of reimplementing path logic here.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDataRoot, resolveStudioPaths } from './scripts/studio-paths.mjs'

export const name = 'video-studio'

/** Wait for the skill registry before registering the catalog. */
export const inject = ['skills']

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'portable-video-studio',
    validate(value) {
      if (value === undefined) return { value: {} }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { issues: [{ message: 'config must be an object' }] }
      }
      if (value.dataRoot !== undefined && (typeof value.dataRoot !== 'string' || !value.dataRoot.trim())) {
        return { issues: [{ message: 'dataRoot must be a non-empty string', path: ['dataRoot'] }] }
      }
      return { value }
    },
  },
}

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
    cwd: options.cwd,
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
  const code = resolveStudioPaths(dataRoot ?? root, root).codeRoot
  const lines = [
    `Studio code root: \`${code}\``,
    dataRoot === undefined
      ? 'Studio data root: the session workspace (subject to configured overrides).'
      : `Studio data root: \`${dataRoot}\` (projects, library, cache)`,
    `Standing rules: \`${join(code, 'AGENTS.md')}\` — read it before the first production action.`,
    'Resolve `scripts/` against the code root and `projects/`, `library/`, `.cache/` against the data root.',
    `Run \`node ${join(code, 'scripts', 'studio-root.mjs')}\` from the session workspace to print the effective roots as JSON.`,
  ]
  return lines.map((line) => `> ${line}`).join('\n')
}

/**
 * Register every `<skills>/<name>/SKILL.md` as a runtime skill.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ dataRoot?: string } | undefined} config - row config.
 */
export function apply(ctx, config) {
  const skillsDir = join(packageRoot, 'skills')
  let entries
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
  } catch (error) {
    throw new Error(`video-studio: skills directory is unreadable: ${skillsDir}`, { cause: error })
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = join(skillsDir, entry.name)
    const file = join(directory, 'SKILL.md')
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      ctx.logger?.warn(`video-studio: skipping unreadable skill ${file}`, error)
      continue
    }
    const { meta, body } = parseFrontmatter(raw)
    if (meta.name === undefined || meta.description === undefined) {
      ctx.logger?.warn(`video-studio: skipping skill without name/description: ${file}`)
      continue
    }
    candidates.push({
      name: meta.name,
      description: meta.description,
      ...(meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse }),
      path: file,
      source: 'bundled',
      provider: 'video-studio',
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'directory', path: directory },
      // Bundled rank lets workspace skills take precedence over package skills.
      rank: 600,
      locator: body,
    })
  }
  if (candidates.length === 0) throw new Error(`video-studio: no skills registered from ${skillsDir}`)
  ctx.skills.registerProvider(() => ({
    name: 'video-studio',
    list: async () => candidates,
    get: async (candidate, options = {}) => {
      const resolution = options.cwd === undefined ? undefined : resolveDataRoot({
        dataRoot: config?.dataRoot,
        codeRoot: packageRoot,
        cwd: options.cwd,
      })
      for (const warning of resolution?.warnings ?? []) ctx.logger?.warn(`video-studio: ${warning}`)
      const { rank, locator, ...summary } = candidate
      return { ...summary, content: `${studioHeader(resolution?.dataRoot)}\n\n${locator}` }
    },
  }))
}
