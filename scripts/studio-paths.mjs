/**
 * Where the portable video studio keeps its code and its output data.
 *
 * `codeRoot` holds skills, scripts, kit contracts and standing rules.
 * `dataRoot` holds `projects/`, `library/` and `.cache/`; it defaults to the
 * package directory and can be redirected with `VIDEO_STUDIO_ROOT` so videos
 * can live outside the plugin checkout.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory holding this package. */
export const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Directory holding projects, library and cache. */
export const dataRoot = path.resolve(process.env.VIDEO_STUDIO_ROOT || codeRoot)

export const paths = {
  codeRoot,
  dataRoot,
  projects: path.join(dataRoot, 'projects'),
  library: path.join(dataRoot, 'library'),
  cache: path.join(dataRoot, '.cache'),
  kit: path.join(codeRoot, 'kit'),
  skills: path.join(codeRoot, 'skills'),
  scripts: path.join(codeRoot, 'scripts'),
}
