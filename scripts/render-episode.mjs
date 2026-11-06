#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import os from 'node:os'
import { runBounded } from './lib/bounded.mjs'
import { resolveProductionMode } from './lib/episode-artifacts.mjs'
import { NARRATED_MODES } from './lib/narration-model.mjs'
import { selectEncoder } from './lib/render/encoder.mjs'
import { resolveVisualStyle } from './lib/render/theme.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const sceneRunner = path.join(scriptDir, 'render-scene.mjs')

function hashTree(hash, dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name)
    hash.update(entry.name)
    if (entry.isDirectory()) hashTree(hash, file)
    else if (entry.isFile()) hash.update(fs.readFileSync(file))
    else if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(file)
      if (fs.statSync(target).isDirectory()) hashTree(hash, target)
      else hash.update(fs.readFileSync(target))
    }
  }
}

function sceneKey(scene, root, settings) {
  const hash = createHash('sha256')
  const seen = new Set()
  let cacheable = true
  function moduleFile(file) {
    try { file = fs.realpathSync(file) } catch { cacheable = false; return }
    if (seen.has(file)) return
    seen.add(file)
    const source = fs.readFileSync(file, 'utf8')
    hash.update(file).update(source)
    const imports = /\b(?:import|export)\b[^'";]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g
    for (const match of source.matchAll(imports)) moduleFile(path.resolve(path.dirname(file), match[1] ?? match[2]))
    // Dynamic imports that cannot be resolved statically must always miss the cache.
    for (const match of source.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
      const literal = match[1].match(/^(['"])([^'"]+)\1\s*$/)
      if (!literal) cacheable = false
      else if (/^\.{1,2}\//.test(literal[2])) moduleFile(path.resolve(path.dirname(file), literal[2]))
    }
  }
  moduleFile(scene.file)
  hashTree(hash, path.join(root, 'assets'))
  hashTree(hash, path.join(root, 'fonts'))
  hashTree(hash, path.join(scriptDir, 'lib', 'render'))
  hash.update(fs.readFileSync(sceneRunner))
  hash.update(JSON.stringify({ durationSec: scene.durationSec, ...settings }))
  return { key: hash.digest('hex'), cacheable }
}

async function renderChildren(jobs, concurrency, timeoutMs, options) {
  const active = new Set()
  let next = 0, failure
  const kill = () => {
    for (const child of active) {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL') } catch {}
    }
  }
  const onSignal = signal => { failure ??= new Error(`render interrupted by ${signal}`); kill() }
  const onInt = () => onSignal('SIGINT'), onTerm = () => onSignal('SIGTERM')
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm)
  async function worker() {
    while (!failure && next < jobs.length) {
      const job = jobs[next++]
      try {
        const args = [sceneRunner, job.scene.file, '--out', job.out, '--json', '--engine', options.engine ?? 'cpu', '--encoder', options.encoder, '--threads', String(options.threads), '--min-free-mem-mib', String(options.minFreeMemMiB)]
        if (options.bodyFont !== undefined) args.push('--body-font', options.bodyFont)
        if (options.visualStyle !== undefined) args.push('--visual-style', options.visualStyle)
        const report = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
          active.add(child)
          let stdout = '', stderr = '', timedOut = false, spawnError
          child.stdout.on('data', data => { stdout += data })
          child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536) })
          child.on('error', error => { spawnError = error })
          const timer = setTimeout(() => { timedOut = true; try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL') } catch {} }, timeoutMs)
          child.on('close', (code, signal) => {
            clearTimeout(timer); active.delete(child)
            if (code !== 0 || spawnError || timedOut) return reject(new Error(`scene ${job.scene.id}: ${timedOut ? 'timed out' : spawnError?.message || stderr.trim() || signal || `exit ${code}`}`))
            try { resolve(JSON.parse(stdout)) } catch (error) { reject(new Error(`scene ${job.scene.id}: invalid renderer report: ${error.message}`)) }
          })
        })
        job.report = report
      } catch (error) { failure ??= error; kill() }
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker)) }
  finally { process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); kill() }
  if (failure) throw failure
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function regularFile(file) {
  try { return fs.lstatSync(file).isFile() } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function publish(file, write) {
  const dir = fs.mkdtempSync(path.join(path.dirname(file), '.publish-'))
  try {
    const staged = path.join(dir, 'file')
    write(staged)
    fs.renameSync(staged, file)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function episodeFile(root, relative, label) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error(`${label} must be an episode-relative path`)
  const file = path.resolve(root, relative)
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes the episode: ${relative}`)
  const real = fs.realpathSync(file)
  if (!real.startsWith(`${fs.realpathSync(root)}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error(`${label} must be a file inside the episode: ${relative}`)
  return real
}

function run(command, args, timeoutMs, stderr = false) {
  const result = runBounded(command, args, { timeoutMs, retries: 0 })
  if (!result.ok) throw new Error(`${command} failed: ${result.timedOut ? 'timed out' : result.errorCode ?? result.stderr ?? `exit ${result.status}`}`)
  return stderr ? result.stderr : result.stdout
}

function loudnessResult(stderr) {
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1)
  if (!match) throw new Error('ffmpeg did not report loudness measurements')
  return JSON.parse(match)
}

/** Render the ordered timeline and mux existing audio chunks, without synthesizing speech. */
export async function renderEpisode(episodeDir, options = {}) {
  const root = fs.realpathSync(path.resolve(episodeDir))
  const timeline = readJson(path.join(root, 'timeline.json'))
  const production = readJson(path.join(root, 'production.json'))
  const audio = readJson(path.join(root, 'audio', 'manifest.json'))
  const projectFile = path.join(root, '..', '..', 'project.json')
  const project = fs.existsSync(projectFile) ? readJson(projectFile) : {}
  const style = resolveVisualStyle({ episodeRoot: root, id: options.visualStyle })
  const bodyFont = options.bodyFont
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
  if (!options.overwrite && fs.lstatSync(output, { throwIfNoEntry: false })) throw new Error(`output already exists; pass --overwrite to replace it: ${output}`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const outputDir = fs.realpathSync(path.dirname(output))
  if (!outputDir.startsWith(`${root}${path.sep}`) && outputDir !== root) throw new Error('output directory escapes the episode')
  const temp = fs.mkdtempSync(path.join(outputDir, '.render-episode-'))
  const timeoutMs = options.timeoutMs ?? 30 * 60_000
  try {
    const cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length
    const requestedConcurrency = options.concurrency ?? Math.max(1, Math.min(3, Math.floor(cpus / 4)))
    if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1) throw new Error('concurrency must be a positive integer')
    const encoder = selectEncoder(options.encoder ?? 'auto').encoder
    const concurrency = Math.min(requestedConcurrency, cpus, encoder === 'h264_nvenc' ? 3 : cpus)
    const threads = Math.min(options.threads ?? Math.max(1, Math.floor(cpus / concurrency)), Math.max(1, Math.floor(cpus / concurrency)))
    const cacheDir = path.join(root, '.cache', 'render')
    fs.mkdirSync(cacheDir, { recursive: true })
    if (!fs.realpathSync(cacheDir).startsWith(`${root}${path.sep}`)) throw new Error('render cache escapes the episode')
    const jobs = scenes.map((scene, index) => {
      const cacheStarted = performance.now()
      const { key, cacheable } = sceneKey(scene, root, { engine: options.engine ?? 'cpu', encoder, bodyFont: bodyFont ?? null, styleSha256: style.sha256 })
      const cached = path.join(cacheDir, `${key}.mp4`)
      const out = path.join(temp, `scene-${index}.mp4`)
      const reportFile = `${cached}.json`
      const job = { scene, key, cacheable, cached, out, reportFile, cache: 'miss' }
      if (cacheable && !options.noCache && regularFile(cached) && regularFile(reportFile)) {
        job.report = readJson(reportFile)
        fs.copyFileSync(cached, out)
        job.cache = 'hit'
        job.cacheLookupMs = performance.now() - cacheStarted
      }
      return job
    })
    await renderChildren(jobs.filter(job => !job.report), concurrency, timeoutMs, { engine: options.engine, encoder, threads, bodyFont, visualStyle: options.visualStyle, minFreeMemMiB: options.minFreeMemMiB ?? 1024 })
    let meta
    const reports = jobs.map(job => {
      const { scene, report } = job
      const current = report.meta
      if (current.id !== scene.id || Math.abs(current.durationSec - scene.durationSec) > 1e-6) throw new Error(`scene ${scene.id} metadata does not match its timeline entry`)
      if (meta && (current.width !== meta.width || current.height !== meta.height || current.fps !== meta.fps)) throw new Error(`scene ${scene.id} has incompatible dimensions or frame rate`)
      meta ??= current
      if (Math.abs(scene.startSec * meta.fps - Math.round(scene.startSec * meta.fps)) > 1e-6 || Math.abs(scene.durationSec * meta.fps - Math.round(scene.durationSec * meta.fps)) > 1e-6) throw new Error(`scene ${scene.id} timing must align to frames`)
      if (job.cache === 'miss' && job.cacheable && !fs.lstatSync(job.cached, { throwIfNoEntry: false })?.isDirectory() && !fs.lstatSync(job.reportFile, { throwIfNoEntry: false })?.isDirectory()) {
        publish(job.cached, file => fs.copyFileSync(job.out, file))
        publish(job.reportFile, file => fs.writeFileSync(file, JSON.stringify(report)))
      }
      return { ...report, cache: job.cache, cacheKey: job.key, cacheLookupMs: job.cacheLookupMs ?? null }
    })
    const list = path.join(temp, 'scenes.txt')
    fs.writeFileSync(list, scenes.map((_, i) => `file 'scene-${i}.mp4'`).join('\n') + '\n')
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list]
    let loudness = null
    if (chunks.length) {
      const targetLufs = project.audio?.loudness?.integratedLufs ?? -16
      const targetTruePeakDbtp = project.audio?.loudness?.truePeakDbtp ?? -1.5
      if (!Number.isFinite(targetLufs) || targetLufs < -70 || targetLufs > -5 || !Number.isFinite(targetTruePeakDbtp) || targetTruePeakDbtp < -9 || targetTruePeakDbtp > 0) throw new Error('invalid project audio loudness target')
      const audioKey = createHash('sha256').update(JSON.stringify({ targetLufs, targetTruePeakDbtp, durationSec: timeline.durationSec }))
      for (const chunk of chunks) audioKey.update(fs.readFileSync(chunk.file))
      const cachedAudio = path.join(cacheDir, `audio-${audioKey.digest('hex')}.wav`)
      const normalized = path.join(temp, 'normalized.wav')
      if (!options.noCache && regularFile(cachedAudio) && regularFile(`${cachedAudio}.json`)) {
        fs.copyFileSync(cachedAudio, normalized)
        loudness = { ...readJson(`${cachedAudio}.json`), cache: 'hit' }
      } else {
        const inputs = chunks.flatMap(chunk => ['-i', chunk.file])
        const filters = chunks.map((_, i) => `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`)
        const concat = `${filters.join(';')};${chunks.map((_, i) => `[a${i}]`).join('')}concat=n=${chunks.length}:v=0:a=1,apad,atrim=duration=${timeline.durationSec}`
        const target = `I=${targetLufs}:TP=${targetTruePeakDbtp}:LRA=11`
        const first = loudnessResult(run('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'info', ...inputs, '-filter_complex', `${concat},loudnorm=${target}:print_format=json[audio]`, '-map', '[audio]', '-f', 'null', '-'], timeoutMs, true))
        const measured = `measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}`
        const second = loudnessResult(run('ffmpeg', ['-hide_banner', '-nostats', '-loglevel', 'info', '-y', ...inputs, '-filter_complex', `${concat},loudnorm=${target}:${measured}:linear=true:print_format=json,aresample=48000[audio]`, '-map', '[audio]', '-ac', '2', normalized], timeoutMs, true))
        loudness = { targetLufs, targetTruePeakDbtp, measuredIntegratedLufs: Number(second.output_i), measuredTruePeakDbtp: Number(second.output_tp), measuredLra: Number(second.output_lra) }
        if (!fs.lstatSync(cachedAudio, { throwIfNoEntry: false })?.isDirectory() && !fs.lstatSync(`${cachedAudio}.json`, { throwIfNoEntry: false })?.isDirectory()) {
          publish(cachedAudio, file => fs.copyFileSync(normalized, file))
          publish(`${cachedAudio}.json`, file => fs.writeFileSync(file, JSON.stringify(loudness)))
        }
        loudness = { ...loudness, cache: 'miss' }
      }
      args.push('-i', normalized, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2')
    } else args.push('-map', '0:v:0', '-c:v', 'copy')
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
      publish(path.join(reportsDir, `${scenes[i].id}.render.json`), file => fs.writeFileSync(file, `${JSON.stringify(persistentReports[i], null, 2)}\n`))
    }
    if (options.overwrite) fs.renameSync(staged, output)
    else { fs.linkSync(staged, output); fs.unlinkSync(staged) }
    return { output, durationSec: timeline.durationSec, style: { id: style.id, sha256: style.sha256, source: style.source }, scenes: persistentReports, audioChunks: chunks.length, audio: { loudness } }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const episode = args.shift()
  if (!episode || episode.startsWith('--')) throw new Error('Usage: node scripts/render-episode.mjs <episode-dir> [--out path] [--overwrite] [--no-cache] [--concurrency N] [--engine auto|cpu|gpu] [--encoder auto|h264_nvenc|libx264] [--threads N] [--visual-style id] [--body-font family] [--min-free-mem-mib N] [--timeout-ms N] [--json]')
  const options = {}
  const keys = { '--out': 'out', '--engine': 'engine', '--encoder': 'encoder', '--threads': 'threads', '--concurrency': 'concurrency', '--visual-style': 'visualStyle', '--body-font': 'bodyFont', '--min-free-mem-mib': 'minFreeMemMiB', '--timeout-ms': 'timeoutMs' }
  while (args.length) {
    const flag = args.shift()
    if (flag === '--overwrite') { options.overwrite = true; continue }
    if (flag === '--no-cache') { options.noCache = true; continue }
    if (flag === '--json') continue
    const key = keys[flag]
    if (!key || !args.length || args[0].startsWith('--')) throw new Error(`invalid or missing option: ${flag}`)
    const value = args.shift()
    options[key] = ['threads', 'concurrency', 'minFreeMemMiB', 'timeoutMs'].includes(key) ? Number(value) : value
    if (typeof options[key] === 'number' && (!Number.isInteger(options[key]) || options[key] <= 0)) throw new Error(`${flag} must be a positive integer`)
  }
  console.log(JSON.stringify(await renderEpisode(episode, options), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
