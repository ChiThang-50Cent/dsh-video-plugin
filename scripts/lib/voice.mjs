/**
 * Voice packages: reusable narrator voices under `<dataRoot>/library/voices/<id>/`.
 *
 * A package is `voice.json` plus, for cloning providers, a reference recording
 * and its exact transcript; `notes.md` records what the voice suits and its
 * rights. The active voice is chosen per episode: `production.json.voicePackage`
 * overrides `project.json.voicePackage`. There is no built-in default: a voice
 * is personal data, and silently substituting another speaker is a defect.
 *
 * The package hash covers only what changes the sound (provider, provider voice,
 * language, reference transcript and reference bytes), so renaming a voice or
 * editing its notes does not invalidate synthesized audio.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { episodeContext, episodeDataRoot } from './episode-artifacts.mjs'

export const VOICE_ID = /^[a-z][a-z0-9-]{0,63}$/

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

/** Every structural problem in a parsed voice.json; empty when usable. */
export function voicePackageErrors(voice, packageDir) {
  const errors = []
  if (!isObject(voice)) return ['voice.json must be an object']
  if (voice.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (typeof voice.id !== 'string' || !VOICE_ID.test(voice.id)) errors.push('id must be a lowercase slug')
  if (!nonEmpty(voice.provider)) errors.push('provider is required')
  if (!nonEmpty(voice.language)) errors.push('language is required')
  if (!nonEmpty(voice.rights)) errors.push('rights is required: whose voice it is and how it may be used')
  if (voice.providerVoice !== undefined && !nonEmpty(voice.providerVoice)) errors.push('providerVoice must be a non-empty string')
  if (voice.reference === undefined) {
    if (voice.providerVoice === undefined) errors.push('a voice needs a reference recording or a providerVoice')
  } else if (!isObject(voice.reference)) errors.push('reference must be an object')
  else {
    if (!nonEmpty(voice.reference.text)) errors.push('reference.text (exact transcript of the recording) is required')
    const relative = voice.reference.file
    if (!nonEmpty(relative) || path.isAbsolute(relative)) errors.push('reference.file must be a package-relative path')
    else {
      const dir = fs.existsSync(packageDir) ? fs.realpathSync(packageDir) : path.resolve(packageDir)
      const file = path.resolve(dir, relative)
      if (!file.startsWith(`${dir}${path.sep}`)) errors.push('reference.file escapes the voice package')
      else if (!fs.existsSync(file)) errors.push(`reference.file not found: ${relative}`)
      else if (!fs.realpathSync(file).startsWith(`${dir}${path.sep}`)) errors.push('reference.file escapes the voice package')
      else if (!fs.statSync(file).isFile()) errors.push(`reference.file is not a file: ${relative}`)
    }
  }
  return errors
}

/** Directory for `id` inside the workspace library; voices are never bundled. */
export function voicePackageDir(id, dataRoot) {
  if (typeof id !== 'string' || !VOICE_ID.test(id)) throw new Error(`voice package id must be a lowercase slug: ${JSON.stringify(id)}`)
  if (!dataRoot) throw new Error('voice packages live in a workspace data root; none was resolved')
  return path.join(dataRoot, 'library', 'voices', id)
}

/** Load and validate one package by id. */
export function loadVoicePackage(id, dataRoot) {
  const dir = voicePackageDir(id, dataRoot)
  const file = path.join(dir, 'voice.json')
  if (!fs.existsSync(file)) throw new Error(`voice package "${id}" not found; create it with scripts/new-voice.mjs`)
  const realDir = fs.realpathSync(dir)
  const library = fs.realpathSync(path.join(dataRoot, 'library', 'voices'))
  if (!realDir.startsWith(`${library}${path.sep}`)) throw new Error(`voice package "${id}" escapes the voices library`)
  const voice = readJson(file, `voice package ${id}`)
  const errors = voicePackageErrors(voice, realDir)
  if (voice.id !== undefined && voice.id !== id) errors.push(`id "${voice.id}" does not match its directory "${id}"`)
  if (errors.length) throw new Error(`voice package "${id}" is invalid: ${errors.join('; ')}`)
  const reference = voice.reference === undefined ? null : {
    path: path.resolve(realDir, voice.reference.file),
    text: voice.reference.text,
  }
  if (reference) reference.sha256 = createHash('sha256').update(fs.readFileSync(reference.path)).digest('hex')
  const sound = {
    provider: voice.provider,
    providerVoice: voice.providerVoice ?? null,
    language: voice.language,
    reference: reference && { text: reference.text, sha256: reference.sha256 },
  }
  const sha256 = createHash('sha256').update(JSON.stringify(sound)).digest('hex')
  return { id, dir: realDir, file, voice, reference, sha256 }
}

/**
 * Resolve the voice selected for an episode (or an explicit id).
 * Returns null when nothing selects a package; callers decide whether that is allowed.
 * @param {{episodeRoot?: string|null, dataRoot?: string, id?: string}} options
 */
export function resolveVoicePackage(options = {}) {
  let id = options.id
  let dataRoot = options.dataRoot
  let source = id === undefined ? null : 'override'
  if (options.episodeRoot) {
    const context = fs.existsSync(path.join(options.episodeRoot, 'production.json'))
      ? episodeContext(options.episodeRoot)
      : { dataRoot: episodeDataRoot(options.episodeRoot), production: {}, project: {} }
    dataRoot ??= context.dataRoot
    if (id === undefined && context.production.voicePackage !== undefined) { id = context.production.voicePackage; source = 'production.json' }
    else if (id === undefined && context.project.voicePackage !== undefined) { id = context.project.voicePackage; source = 'project.json' }
  }
  if (id === undefined) return null
  return { ...loadVoicePackage(id, dataRoot), source }
}

/**
 * Merge a resolved package into provider options. A package supplies the
 * speaker; mixing it with an explicit reference/transcript or another provider
 * is ambiguous and rejected rather than silently preferring one.
 */
export function applyVoicePackage(options, pkg) {
  if (options.voiceReference !== undefined || options.refText !== undefined) throw new Error('use either a voice package or --voice-reference/--ref-text, not both')
  if (options.provider !== undefined && options.provider !== pkg.voice.provider) throw new Error(`voice package "${pkg.id}" is for provider ${pkg.voice.provider}, not ${options.provider}`)
  if (options.voice !== undefined && pkg.voice.providerVoice !== undefined && options.voice !== pkg.voice.providerVoice) throw new Error(`voice package "${pkg.id}" sets providerVoice ${pkg.voice.providerVoice}; --voice ${options.voice} conflicts`)
  return {
    ...options,
    provider: pkg.voice.provider,
    voice: options.voice ?? pkg.voice.providerVoice,
    voiceReference: pkg.reference?.path,
    refText: pkg.reference?.text,
    language: options.language ?? pkg.voice.language,
  }
}
