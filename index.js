/**
 * Portable video studio: register the studio skills for every session in the
 * profile, so they work from any workspace.
 *
 * The skills live in this package, not in the session's project root. Each
 * registered body carries the resolved studio roots, because a session opened
 * in another workspace must not resolve `projects/`, `library/` or `scripts/`
 * against its own working directory.
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'video-studio'

/** Wait for the skill registry before registering the catalog. */
export const inject = ['skills']

const packageRoot = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the studio data root: explicit config, then `VIDEO_STUDIO_ROOT`,
 * then this package's directory.
 * @param {unknown} configured - `dataRoot` from the plugin row.
 * @returns {string} absolute data root.
 */
export function dataRootOf(configured) {
  const value = typeof configured === 'string' && configured.length > 0
    ? configured
    : process.env.VIDEO_STUDIO_ROOT
  return typeof value === 'string' && value.length > 0 ? resolve(packageRoot, value) : packageRoot
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
 * @param {string} dataRoot - resolved output root.
 * @returns {string} markdown quote block prepended to every skill body.
 */
export function studioHeader(dataRoot) {
  const same = dataRoot === packageRoot
  const roots = same
    ? `Studio root (code and output data): \`${packageRoot}\``
    : `Studio code: \`${packageRoot}\`\n> Studio data root (projects, library, cache): \`${dataRoot}\``
  return [
    `> ${roots.replaceAll('\n', '\n> ')}`,
    `> Standing rules: \`${join(packageRoot, 'AGENTS.md')}\` — read it before the first production action.`,
    '> Resolve every `projects/`, `library/`, `scripts/` and `.cache/` path against these roots, never against the session working directory.',
    '> `node <studio code>/scripts/studio-root.mjs` prints the same roots as JSON.',
  ].join('\n')
}

/**
 * Register every `<skills>/<name>/SKILL.md` as a runtime skill.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ dataRoot?: string } | undefined} config - row config.
 */
export async function apply(ctx, config) {
  const dataRoot = dataRootOf(config?.dataRoot)
  const skillsDir = join(packageRoot, 'skills')
  const header = studioHeader(dataRoot)
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
