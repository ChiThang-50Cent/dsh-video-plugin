#!/usr/bin/env node
/**
 * What is set up in this studio, and the next setup step.
 *
 * Usage:
 *   node scripts/studio-status.mjs [--data-root <dir>] [--json]
 *
 * Reports the version, both roots, whether the workspace is initialized, the
 * saved TTS runtime, voice packages, visual styles and each series with its
 * episodes. `nextSteps` lists the missing setup in order. Read-only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { codeRoot, resolveDataRoot } from './studio-paths.mjs'
import { readTtsConfig } from './lib/tts-config.mjs'
import { loadVoicePackage } from './lib/voice.mjs'
import { findMaster } from './lib/episode-artifacts.mjs'

const dirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort() : [])
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }

export function studioStatus(options = {}) {
  const resolution = resolveDataRoot({ dataRoot: options.dataRoot })
  const dataRoot = resolution.dataRoot
  const initialized = fs.existsSync(path.join(dataRoot, 'library', 'catalog.json'))
  let tts
  try {
    const config = readTtsConfig(dataRoot)
    tts = config && { file: config.path, provider: config.provider, model: config.model ?? null, requireGpu: config.requireGpu === true, verifiedAt: config.verified?.at ?? null, device: config.verified?.device ?? null }
  } catch (error) {
    tts = { error: error.message }
  }
  const voices = dirs(path.join(dataRoot, 'library', 'voices')).map((id) => {
    try {
      const pkg = loadVoicePackage(id, dataRoot)
      return { id, name: pkg.voice.name ?? id, provider: pkg.voice.provider, language: pkg.voice.language }
    } catch (error) {
      return { id, error: error.message }
    }
  })
  const workspaceStyles = dirs(path.join(dataRoot, 'library', 'visual-styles'))
  const visualStyles = [...new Set([...workspaceStyles, ...dirs(path.join(codeRoot, 'library', 'visual-styles'))])].sort()
  const projects = dirs(path.join(dataRoot, 'projects')).map((slug) => {
    const project = readJson(path.join(dataRoot, 'projects', slug, 'project.json')) ?? {}
    const episodes = dirs(path.join(dataRoot, 'projects', slug, 'episodes')).map((id) => {
      const root = path.join(dataRoot, 'projects', slug, 'episodes', id)
      const production = readJson(path.join(root, 'production.json')) ?? {}
      return {
        id,
        mode: production.mode ?? null,
        voicePackage: production.voicePackage ?? project.voicePackage ?? null,
        visualStyle: production.visualStyle ?? project.visualStyle ?? 'default',
        master: findMaster(root, production, readJson(path.join(root, 'timeline.json')))?.relative ?? null,
      }
    })
    return { slug, voicePackage: project.voicePackage ?? null, visualStyle: project.visualStyle ?? 'default', episodes }
  })
  const nextSteps = []
  if (!initialized) nextSteps.push(`initialize the workspace: node ${path.join(codeRoot, 'scripts', 'init-workspace.mjs')} --data-root ${dataRoot}`)
  if (tts === null) nextSteps.push('narrated videos: verify and save the speech engine with scripts/setup-tts.mjs')
  else if (tts.error) nextSteps.push(`fix or re-create the TTS runtime: ${tts.error}`)
  if (!voices.some((voice) => !voice.error)) nextSteps.push('narrated videos: create a narrator voice with scripts/new-voice.mjs')
  if (projects.length === 0) nextSteps.push('start a series: ask the video-producer, or node scripts/new-episode.mjs <series> <episode>')
  const unvoiced = projects.flatMap((project) => project.episodes.filter((episode) => ['narrated', 'mixed'].includes(episode.mode) && !episode.voicePackage).map((episode) => `${project.slug}/${episode.id}`))
  if (unvoiced.length) nextSteps.push(`select a voicePackage for narrated episodes: ${unvoiced.join(', ')}`)
  return {
    version: readJson(path.join(codeRoot, 'package.json'))?.version ?? null,
    codeRoot,
    dataRoot,
    dataRootSource: resolution.source,
    initialized,
    tts,
    voices,
    visualStyles,
    projects,
    nextSteps,
  }
}

function main() {
  const args = process.argv.slice(2)
  let dataRoot, json = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true
    else if (args[i] === '--data-root' && args[i + 1] !== undefined) dataRoot = args[++i]
    else {
      console.error('Usage: node scripts/studio-status.mjs [--data-root <dir>] [--json]')
      process.exitCode = 2
      return
    }
  }
  const status = studioStatus({ dataRoot })
  if (json) {
    console.log(JSON.stringify(status, null, 2))
    return
  }
  console.log(`Video studio ${status.version}\n  code root: ${status.codeRoot}\n  data root: ${status.dataRoot} (${status.dataRootSource}${status.initialized ? '' : ', not initialized'})`)
  console.log(`  TTS runtime: ${status.tts === null ? 'not set up' : status.tts.error ?? `${status.tts.provider}, verified ${status.tts.verifiedAt ?? 'never'} on ${status.tts.device ?? 'unknown device'}`}`)
  console.log(`  voices: ${status.voices.map((voice) => (voice.error ? `${voice.id} (invalid)` : voice.id)).join(', ') || 'none'}`)
  console.log(`  visual styles: ${status.visualStyles.join(', ')}`)
  for (const project of status.projects) {
    console.log(`  series ${project.slug} (voice ${project.voicePackage ?? 'none'}, style ${project.visualStyle})`)
    for (const episode of project.episodes) console.log(`    ${episode.id}: ${episode.mode ?? 'no mode'}, master ${episode.master ?? 'none'}`)
  }
  if (status.nextSteps.length) console.log(`Next:\n${status.nextSteps.map((step) => `  - ${step}`).join('\n')}`)
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
