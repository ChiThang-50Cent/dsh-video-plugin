#!/usr/bin/env node
/**
 * Create a narrator voice package from a reference recording or a provider voice id.
 *
 * Usage:
 *   node scripts/new-voice.mjs <id> --reference <wav> --ref-text <exact transcript> --rights <note>
 *        [--provider omnivoice] [--language vi] [--name <text>] [--data-root <dir>] [--json]
 *   node scripts/new-voice.mjs <id> --provider <id> --provider-voice <voice-id> --rights <note>
 *        [--language vi] [--name <text>] [--data-root <dir>] [--json]
 *
 * The reference is checked (readable, 1–120 s, not clipped, not mostly silence)
 * and copied into `<dataRoot>/library/voices/<id>/` with `voice.json` and a
 * `notes.md` stub. It never overwrites an existing package. Listening is still
 * required: run audio-preflight with `--voice-package <id> --synthesize-sample`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDataRoot } from './studio-paths.mjs'
import { inspectVoiceReference } from './audio-preflight.mjs'
import { VOICE_ID, loadVoicePackage } from './lib/voice.mjs'

export function newVoice(id, options = {}, deps = {}) {
  if (!VOICE_ID.test(id ?? '')) throw new Error(`voice id must be a lowercase slug: ${JSON.stringify(id)}`)
  if (typeof options.rights !== 'string' || !options.rights.trim()) throw new Error('--rights is required: whose voice it is and how it may be used')
  const provider = options.provider ?? 'omnivoice'
  if (options.reference === undefined && options.providerVoice === undefined) throw new Error('give --reference <wav> --ref-text <transcript> or --provider-voice <id>')
  if (options.reference !== undefined && !(typeof options.refText === 'string' && options.refText.trim())) throw new Error('--ref-text with the exact transcript of the reference is required')
  let inspection = null
  if (options.reference !== undefined) {
    const source = path.resolve(options.reference)
    if (path.extname(source).toLowerCase() !== '.wav') throw new Error('the reference must be a .wav file')
    inspection = inspectVoiceReference(source, deps)
    if (inspection.status !== 'PASS') throw new Error(`voice reference is not suitable: ${inspection.error}`)
  }
  const dataRoot = path.resolve(options.dataRoot ?? resolveDataRoot().dataRoot)
  const library = path.join(dataRoot, 'library', 'voices')
  const destination = path.join(library, id)
  if (fs.existsSync(destination)) throw new Error(`voice package already exists, refusing to overwrite: ${destination}`)
  fs.mkdirSync(library, { recursive: true })
  const staging = fs.mkdtempSync(path.join(library, `.${id}-`))
  const voice = {
    schemaVersion: 1,
    id,
    name: options.name ?? id,
    provider,
    language: options.language ?? 'vi',
    ...(options.providerVoice === undefined ? {} : { providerVoice: options.providerVoice }),
    ...(options.reference === undefined ? {} : { reference: { file: 'reference.wav', text: options.refText.trim() } }),
    rights: options.rights.trim(),
  }
  try {
    if (options.reference !== undefined) fs.copyFileSync(path.resolve(options.reference), path.join(staging, 'reference.wav'))
    fs.writeFileSync(path.join(staging, 'voice.json'), `${JSON.stringify(voice, null, 2)}\n`)
    fs.writeFileSync(path.join(staging, 'notes.md'), `# ${voice.name}\n\nRights: ${voice.rights}\n\nRecord what this voice suits (genre, audience, pacing), what it handles poorly, and the listening check that approved it.\n`)
    fs.renameSync(staging, destination)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
  const pkg = loadVoicePackage(id, dataRoot)
  return { id, dir: pkg.dir, sha256: pkg.sha256, provider, reference: inspection && { durationSec: inspection.metadata.durationSec, sampleRate: inspection.metadata.sampleRate } }
}

function main() {
  const args = process.argv.slice(2)
  const options = {}
  const names = { '--reference': 'reference', '--ref-text': 'refText', '--rights': 'rights', '--provider': 'provider', '--provider-voice': 'providerVoice', '--language': 'language', '--name': 'name', '--data-root': 'dataRoot' }
  let id, json = false
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '--json') json = true
      else if (names[arg]) {
        if (args[i + 1] === undefined) throw new Error(`${arg} needs a value`)
        options[names[arg]] = args[++i]
      } else if (!arg.startsWith('-') && id === undefined) id = arg
      else throw new Error(`unexpected argument: ${arg}`)
    }
    const result = newVoice(id, options)
    console.log(json ? JSON.stringify(result, null, 2) : `Created voice "${result.id}" (${result.provider}): ${result.dir}\nListen before use: node scripts/audio-preflight.mjs --voice-package ${result.id} --synthesize-sample --require-gpu`)
  } catch (error) {
    console.error(`new-voice: ${error.message}\nUsage: node scripts/new-voice.mjs <id> (--reference <wav> --ref-text <text> | --provider <id> --provider-voice <voice>) --rights <note> [--language vi] [--name <text>] [--data-root <dir>] [--json]`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
