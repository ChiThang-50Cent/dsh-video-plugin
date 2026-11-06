/**
 * Machine TTS runtime: `<dataRoot>/tts.config.json`, written by
 * `scripts/setup-tts.mjs` only after a real sample synthesis passed.
 *
 * It records where the speech engine lives on this machine (interpreter, model,
 * provider command, environment) so audio commands need no paths. Precedence:
 * explicit flag > this file > built-in default. It applies only to its own
 * provider, and it never selects a voice: voices are packages.
 */
import fs from 'node:fs'
import path from 'node:path'

export const TTS_CONFIG_FILE = 'tts.config.json'
const KEYS = ['python', 'model', 'providerCommand', 'device']
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

export function ttsConfigPath(dataRoot) {
  return path.join(path.resolve(dataRoot), TTS_CONFIG_FILE)
}

/** Every structural problem in a parsed config; empty when usable. */
export function ttsConfigErrors(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return ['must be a JSON object']
  const errors = []
  if (config.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!nonEmpty(config.provider)) errors.push('provider is required')
  for (const key of KEYS) if (config[key] !== undefined && !nonEmpty(config[key])) errors.push(`${key} must be a non-empty string`)
  if (config.requireGpu !== undefined && typeof config.requireGpu !== 'boolean') errors.push('requireGpu must be a boolean')
  if (config.env !== undefined) {
    if (config.env === null || typeof config.env !== 'object' || Array.isArray(config.env)) errors.push('env must be an object')
    else for (const [name, value] of Object.entries(config.env)) {
      if (!ENV_NAME.test(name) || typeof value !== 'string') errors.push(`env.${name} must be a string variable`)
    }
  }
  return errors
}

/** The config for `dataRoot`, or null when absent. Throws when present but invalid. */
export function readTtsConfig(dataRoot) {
  if (!dataRoot) return null
  const file = ttsConfigPath(dataRoot)
  if (!fs.existsSync(file)) return null
  let config
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file} is not readable JSON: ${error.message}`)
  }
  const errors = ttsConfigErrors(config)
  if (errors.length) throw new Error(`${file} is invalid: ${errors.join('; ')}; re-run scripts/setup-tts.mjs`)
  return { ...config, path: file }
}

/**
 * Fill unset options from the config when it is for the same provider, then
 * export its environment for child processes without overriding variables the
 * caller already set. Returns the merged options plus `ttsConfig` (path or null).
 */
export function applyTtsConfig(options, config, defaults = {}) {
  const provider = options.provider ?? defaults.provider ?? config?.provider
  const applies = config !== null && config !== undefined && config.provider === provider
  const merged = { ...options, ...(provider === undefined ? {} : { provider }), ttsConfig: applies ? config.path : null }
  for (const key of KEYS) {
    const value = options[key] ?? (applies ? config[key] : undefined) ?? defaults[key]
    if (value !== undefined) merged[key] = value
  }
  if (applies && config.requireGpu === true) merged.requireGpu = true
  if (applies) for (const [name, value] of Object.entries(config.env ?? {})) process.env[name] ??= value
  return merged
}
