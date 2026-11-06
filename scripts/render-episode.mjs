#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBounded } from './lib/bounded.mjs'
import { resolveProductionMode } from './lib/episode-artifacts.mjs'
import { NARRATED_MODES } from './lib/narration-model.mjs'
import { renderScene } from './render-scene.mjs'

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function episodeFile(root, relative, label) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error(`${label} must be an episode-relative path`)
  const file = path.resolve(root, relative)
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes the episode: ${relative}`)
  const real = fs.realpathSync(file)
  if (!real.startsWith(`${fs.realpathSync(root)}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error(`${label} must be a file inside the episode: ${relative}`)
  return real
}

function run(command, args, timeoutMs) {
  const result = runBounded(command, args, { timeoutMs, retries: 0 })
  if (!result.ok) throw new Error(`${command} failed: ${result.timedOut ? 'timed out' : result.errorCode ?? result.stderr ?? `exit ${result.status}`}`)
  return result.stdout
}

/** Render the ordered timeline and mux existing audio chunks, without synthesizing speech. */
export async function renderEpisode(episodeDir, options = {}) {
  const root = fs.realpathSync(path.resolve(episodeDir))
  const timeline = readJson(path.join(root, 'timeline.json'))
  const production = readJson(path.join(root, 'production.json'))
  const audio = readJson(path.join(root, 'audio', 'manifest.json'))
  let bodyFont = options.bodyFont
  const projectDir = path.resolve(root, '..', '..')
  const projectFile = path.join(projectDir, 'project.json')
  if (bodyFont === undefined && fs.existsSync(projectFile)) {
    const project = readJson(projectFile)
    if (project.style !== undefined && project.style !== null) {
      if (typeof project.style !== 'string' || !project.style || path.isAbsolute(project.style)) throw new Error('project style must be a relative path')
      const dataRoot = fs.realpathSync(path.resolve(projectDir, '..', '..'))
      const stylePath = fs.realpathSync(path.resolve(projectDir, project.style))
      if (!stylePath.startsWith(`${dataRoot}${path.sep}`) || !fs.statSync(stylePath).isFile()) throw new Error('project style must be a file inside the workspace')
      bodyFont = readJson(stylePath).bodyFont
      if (bodyFont !== undefined && (typeof bodyFont !== 'string' || !bodyFont.trim())) throw new Error('style bodyFont must be a non-empty string')
    }
  }
  const modeInfo = resolveProductionMode(root)
  if (modeInfo.error || modeInfo.conflict) throw new Error(modeInfo.conflict ?? modeInfo.error)
  if (timeline.stale || audio.stale) throw new Error('timeline or audio manifest is stale')
  const ids = new Set()
  if (!Array.isArray(timeline.scenes) || timeline.scenes.length === 0 || !Number.isFinite(timeline.durationSec) || timeline.durationSec <= 0) throw new Error('timeline must contain scenes and a positive durationSec')
  if (!Array.isArray(audio.chunks)) throw new Error('audio manifest chunks must be an array')
  if (NARRATED_MODES.has(modeInfo.mode) && audio.chunks.length === 0) throw new Error('narrated episodes require existing audio chunks')
  let end = 0
  const scenes = timeline.scenes.map((scene) => {
    if (!scene || !/^[a-z][a-z0-9-]{2,}$/.test(scene.id || '') || !Number.isFinite(scene.startSec) || !Number.isFinite(scene.durationSec) || scene.durationSec <= 0 || Math.abs(scene.startSec - end) > 1e-6) throw new Error('timeline scenes must have valid ids, be contiguous, ordered, and have positive durations')
    if (ids.has(scene.id)) throw new Error(`duplicate timeline scene: ${scene.id}`)
    ids.add(scene.id)
    if (typeof scene.source !== 'string' || !scene.source.endsWith('.mjs')) throw new Error(`scene ${scene.id} source must be an episode-relative .mjs path`)
    end = scene.startSec + scene.durationSec
    return { ...scene, file: episodeFile(root, scene.source, `scene ${scene.id} source`) }
  })
  if (Math.abs(end - timeline.durationSec) > 1e-6) throw new Error('timeline scenes must cover durationSec exactly')
  const chunks = audio.chunks.map((chunk, index) => {
    const duration = chunk?.durationSec ?? chunk?.duration
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`audio chunk ${index + 1} requires a positive measured duration`)
    return { file: episodeFile(root, chunk.path ?? chunk.file ?? chunk.wav ?? chunk.audio, `audio chunk ${index + 1}`), duration }
  })
  let measuredAudio = 0
  for (const chunk of chunks) {
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration:format=duration', '-of', 'json', chunk.file], options.timeoutMs ?? 30 * 60_000))
    if (!probe.streams?.length) throw new Error(`audio chunk has no audio stream: ${chunk.file}`)
    const duration = Number(probe.streams[0].duration ?? probe.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration - chunk.duration) > 0.05) throw new Error(`audio chunk measured duration differs from manifest: ${chunk.file}`)
    measuredAudio += duration
  }
  if (measuredAudio > timeline.durationSec + 0.05) throw new Error('measured audio exceeds the timeline duration')
  if (chunks.reduce((sum, chunk) => sum + chunk.duration, 0) > timeline.durationSec + 0.05) throw new Error('audio chunks exceed the timeline duration')
  const output = path.resolve(root, options.out ?? production.finalOutput ?? timeline.finalOutput ?? 'exports/master.mp4')
  if (path.extname(output).toLowerCase() !== '.mp4') throw new Error('episode output must use the .mp4 extension')
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('output must be inside the episode')
  if (!options.overwrite && fs.existsSync(output)) throw new Error(`output already exists; pass --overwrite to replace it: ${output}`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const outputDir = fs.realpathSync(path.dirname(output))
  if (!outputDir.startsWith(`${root}${path.sep}`) && outputDir !== root) throw new Error('output directory escapes the episode')
  const temp = fs.mkdtempSync(path.join(outputDir, '.render-episode-'))
  const timeoutMs = options.timeoutMs ?? 30 * 60_000
  try {
    let meta
    const reports = []
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i]
      const report = await renderScene(scene.file, { out: path.join(temp, `scene-${i}.mp4`), engine: options.engine, encoder: reports[0]?.encoder.encoder ?? options.encoder, threads: options.threads, minFreeMemMiB: options.minFreeMemMiB, bodyFont, timeoutMs })
      const current = report.meta
      if (current.id !== scene.id || Math.abs(current.durationSec - scene.durationSec) > 1e-6) throw new Error(`scene ${scene.id} metadata does not match its timeline entry`)
      if (meta && (current.width !== meta.width || current.height !== meta.height || current.fps !== meta.fps)) throw new Error(`scene ${scene.id} has incompatible dimensions or frame rate`)
      meta ??= current
      if (Math.abs(scene.startSec * meta.fps - Math.round(scene.startSec * meta.fps)) > 1e-6 || Math.abs(scene.durationSec * meta.fps - Math.round(scene.durationSec * meta.fps)) > 1e-6) throw new Error(`scene ${scene.id} timing must align to frames`)
      reports.push(report)
    }
    const list = path.join(temp, 'scenes.txt')
    fs.writeFileSync(list, scenes.map((_, i) => `file 'scene-${i}.mp4'`).join('\n') + '\n')
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list]
    for (const chunk of chunks) args.push('-i', chunk.file)
    args.push('-map', '0:v:0', '-c:v', 'copy')
    if (chunks.length) {
      const filters = chunks.map((_, i) => `[${i + 1}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`)
      filters.push(`${chunks.map((_, i) => `[a${i}]`).join('')}concat=n=${chunks.length}:v=0:a=1,apad,atrim=duration=${timeline.durationSec}[audio]`)
      args.push('-filter_complex', filters.join(';'), '-map', '[audio]', '-c:a', 'aac')
    }
    const staged = path.join(temp, 'master.mp4')
    args.push('-t', String(timeline.durationSec), '-movflags', '+faststart', staged)
    run('ffmpeg', args, timeoutMs)
    const reportsDir = path.join(root, 'reports', 'render-scenes')
    fs.mkdirSync(reportsDir, { recursive: true })
    if (!fs.realpathSync(reportsDir).startsWith(`${root}${path.sep}`)) throw new Error('reports directory escapes the episode')
    const persistentReports = reports.map((report, index) => ({
      ...report,
      output: null,
      sceneSource: scenes[index].source,
      episodeOutput: output,
    }))
    for (let i = 0; i < persistentReports.length; i += 1) {
      fs.writeFileSync(path.join(reportsDir, `${scenes[i].id}.render.json`), `${JSON.stringify(persistentReports[i], null, 2)}\n`)
    }
    if (options.overwrite) fs.renameSync(staged, output)
    else { fs.linkSync(staged, output); fs.unlinkSync(staged) }
    return { output, durationSec: timeline.durationSec, scenes: persistentReports, audioChunks: chunks.length }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const episode = args.shift()
  if (!episode || episode.startsWith('--')) throw new Error('Usage: node scripts/render-episode.mjs <episode-dir> [--out path] [--overwrite] [--engine auto|cpu|gpu] [--encoder auto|h264_nvenc|libx264] [--threads N] [--body-font family] [--min-free-mem-mib N] [--timeout-ms N]')
  const options = {}
  const keys = { '--out': 'out', '--engine': 'engine', '--encoder': 'encoder', '--threads': 'threads', '--body-font': 'bodyFont', '--min-free-mem-mib': 'minFreeMemMiB', '--timeout-ms': 'timeoutMs' }
  while (args.length) {
    const flag = args.shift()
    if (flag === '--overwrite') { options.overwrite = true; continue }
    const key = keys[flag]
    if (!key || !args.length || args[0].startsWith('--')) throw new Error(`invalid or missing option: ${flag}`)
    const value = args.shift()
    options[key] = ['threads', 'minFreeMemMiB', 'timeoutMs'].includes(key) ? Number(value) : value
    if (typeof options[key] === 'number' && (!Number.isInteger(options[key]) || options[key] <= 0)) throw new Error(`${flag} must be a positive integer`)
  }
  console.log(JSON.stringify(await renderEpisode(episode, options), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
