#!/usr/bin/env node
/**
 * Episode validation with two clearly different results:
 *
 *   lint     Structural contract only. It is safe to run while editing; it must
 *            not be presented as "the production is finished".
 *   release  Strict completion gate: real master, QA artifacts for the current
 *            master, scene QA, narration G0 (narrated/mixed), audio/timeline
 *            consistency and no stale markers.
 *
 * A freshly scaffolded episode is structurally valid but release status is
 * INCOMPLETE: no scenes, no master, no QA.
 *
 * Usage:
 *   node scripts/validate-episode.mjs <episode-dir> [--lint|--release] [--json] [--mode <mode>]
 *
 * Exit codes: 0 pass, 1 lint failure / release not PASS, 2 usage or unreadable input.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { MODES, NARRATED_MODES, sha256File } from './lib/narration-model.mjs'
import { findMaster, resolveProductionMode } from './lib/episode-artifacts.mjs'
import { runBounded } from './lib/bounded.mjs'
import { validateNarration } from './validate-narration.mjs'

function readJsonFile(file, label, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`Cannot parse ${label}: ${error.message}`)
    return undefined
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hashFileStream(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function inside(root, relative) {
  const absolute = path.resolve(root, String(relative))
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : undefined
}

function sceneQaStatus(finalQa, sceneId) {
  const record = finalQa?.sceneChecks?.[sceneId] ?? finalQa?.scenes?.[sceneId]
  if (isObject(record)) return String(record.status ?? record.result ?? '').toUpperCase()
  if (Array.isArray(finalQa?.sceneChecks)) {
    const found = finalQa.sceneChecks.find((item) => item?.id === sceneId || item?.sceneId === sceneId)
    if (isObject(found)) return String(found.status ?? found.result ?? '').toUpperCase()
  }
  return undefined
}

/**
 * @param {string} episodeDir
 * @param {{ release?: boolean, mode?: string }} [options]
 */
export async function validateEpisode(episodeDir, options = {}) {
  const root = path.resolve(episodeDir)
  const errors = []
  const warnings = []
  let stat
  try {
    stat = statSync(root)
  } catch {
    const error = new Error(`episode directory not found: ${root}`)
    error.code = 'ENOENT_EPISODE'
    throw error
  }
  if (!stat.isDirectory()) {
    const error = new Error(`not a directory: ${root}`)
    error.code = 'ENOTDIR_EPISODE'
    throw error
  }

  const modeInfo = resolveProductionMode(root, options.mode)
  const mode = modeInfo.mode
  if (!MODES.includes(mode)) errors.push(`Production mode is ${JSON.stringify(mode)}; expected one of ${MODES.join(', ')}`)
  if (modeInfo.error !== undefined) warnings.push(modeInfo.error)
  const productionPath = path.join(root, 'production.json')
  const production = existsSync(productionPath) ? readJsonFile(productionPath, 'production.json', errors) : {}
  if (production !== undefined) {
    if (production.schemaVersion !== undefined && production.schemaVersion !== 1) warnings.push('production.json schemaVersion should be 1')
    if (production.targetDurationSec !== undefined && production.targetDurationSec !== null
      && (!Number.isFinite(production.targetDurationSec) || production.targetDurationSec <= 0)) {
      errors.push('production.json targetDurationSec must be positive or null')
    }
  }

  const storyboard = readJsonFile(path.join(root, 'storyboard.json'), 'storyboard.json', errors) ?? {}
  const timeline = readJsonFile(path.join(root, 'timeline.json'), 'timeline.json', errors) ?? {}
  const audio = readJsonFile(path.join(root, 'audio', 'manifest.json'), 'audio/manifest.json', errors) ?? {}

  const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : []
  if (!Array.isArray(storyboard.scenes)) errors.push('storyboard.json scenes must be an array')
  const seen = new Set()
  for (const scene of scenes) {
    if (!isObject(scene)) {
      errors.push('storyboard scene must be an object')
      continue
    }
    if (!/^[a-z][a-z0-9-]{2,}$/.test(scene.id || '')) errors.push(`Invalid scene id: ${scene.id}`)
    if (seen.has(scene.id)) errors.push(`Duplicate scene id: ${scene.id}`)
    seen.add(scene.id)
    if (!['A', 'B', 'C'].includes(scene.reuseClass)) errors.push(`Missing reuseClass A/B/C: ${scene.id}`)
    if (scene.reuseClass === 'B' && !scene.reuseFrom) errors.push(`B scene without reuseFrom: ${scene.id}`)
    if (scene.reuseClass === 'A' && !scene.reuseFrom && !scene.templateId) errors.push(`A scene without reuseFrom or templateId: ${scene.id}`)
    if (scene.reuseClass === 'C' && scene.reuseFrom) warnings.push(`Custom scene ${scene.id} has reuseFrom; verify classification`)
    if (scene.durationSec !== undefined && (!Number.isFinite(scene.durationSec) || scene.durationSec <= 0)) {
      errors.push(`Scene ${scene.id} durationSec must be positive`)
    }
    for (const asset of (Array.isArray(scene.assets) ? scene.assets : [])) {
      if (typeof asset === 'string' && inside(root, asset) === undefined) errors.push(`Scene ${scene.id} asset escapes the episode: ${asset}`)
    }
    if (NARRATED_MODES.has(mode)) {
      const refs = scene.narrationSegments ?? scene.beatIds
      if (!Array.isArray(refs) || refs.length === 0) warnings.push(`Scene ${scene.id} has no narrationSegments/beatIds reference in a narrated mode`)
    }
  }

  const timedScenes = Array.isArray(timeline.scenes) ? timeline.scenes : []
  let duration = timeline.durationSec
  if (duration !== null && !(Number.isFinite(duration) && duration > 0)) errors.push('timeline.durationSec must be positive or null')
  const timed = new Set()
  let previousEnd = 0
  for (const scene of timedScenes) {
    if (!isObject(scene)) {
      errors.push('timeline scene must be an object')
      continue
    }
    if (!seen.has(scene.id)) errors.push(`Timeline references unknown scene: ${scene.id}`)
    if (timed.has(scene.id)) errors.push(`Timeline repeats scene: ${scene.id}`)
    timed.add(scene.id)
    if (scene.source !== undefined && (typeof scene.source !== 'string' || !scene.source.endsWith('.mjs') || path.isAbsolute(scene.source) || inside(root, scene.source) === undefined)) {
      errors.push(`Timeline scene ${scene.id} source must be an episode-relative .mjs path`)
    }
    if (!(Number.isFinite(scene.startSec) && scene.startSec >= 0 && Number.isFinite(scene.durationSec) && scene.durationSec > 0)) {
      errors.push(`Invalid timing ${scene.id}`)
      continue
    }
    const end = scene.startSec + scene.durationSec
    if (duration !== null && end > duration + 1e-3) errors.push(`Scene ${scene.id} ends after film`)
    if (scene.startSec + 1e-3 < previousEnd) warnings.push(`Timeline scene ${scene.id} overlaps the previous scene by ${(previousEnd - scene.startSec).toFixed(3)}s`)
    previousEnd = Math.max(previousEnd, end)
    for (const keyframe of (scene.keyframes || [])) {
      if (!(Number.isFinite(keyframe) && keyframe >= 0 && keyframe <= scene.durationSec + 1e-3)) errors.push(`Out-of-bounds keyframe ${scene.id}@${keyframe}`)
    }
  }
  if (scenes.length > 0 && timedScenes.length === 0) warnings.push('Storyboard has scenes but timeline has no timed scenes')
  if (scenes.length !== timedScenes.length && timedScenes.length > 0) warnings.push(`Storyboard scenes=${scenes.length}, timeline scenes=${timedScenes.length}`)
  for (const scene of scenes) {
    if (!timed.has(scene.id) && timedScenes.length > 0) warnings.push(`Storyboard scene has no timeline entry: ${scene.id}`)
  }
  const declaredAudioDuration = (Array.isArray(audio.chunks) ? audio.chunks : []).reduce((sum, chunk) => sum + (Number.isFinite(chunk?.durationSec) ? chunk.durationSec : Number.isFinite(chunk?.duration) ? chunk.duration : 0), 0)
  if (Number.isFinite(duration) && declaredAudioDuration > duration + 0.05) warnings.push(`declared audio duration (${declaredAudioDuration.toFixed(2)}s) exceeds timeline duration (${duration}s)`)
  if (!Array.isArray(audio.chunks)) errors.push('audio/manifest.json chunks must be an array')

  const presentNarration = ['narration.md', 'narration-review.json', 'claim-check.json'].filter((file) => existsSync(path.join(root, file)))
  if (NARRATED_MODES.has(mode)) {
    if (presentNarration.length === 0) {
      errors.push(`Production mode is "${mode}" but no narration artifacts exist`)
    } else {
      const claimPath = path.join(root, 'claim-check.json')
      if (existsSync(claimPath)) {
        const claim = readJsonFile(claimPath, 'claim-check.json', errors) ?? {}
        if (String(claim.status).toUpperCase() !== 'PASS') warnings.push('Source/fact audit is not PASS; do not synthesize narration (G0 has not passed)')
      }
    }
  } else if (presentNarration.length > 0) {
    warnings.push(`Mode "${mode}" does not use voice-over, but narration artifacts are present; they are informational only`)
  }

  // Staleness markers are never a release PASS.
  for (const [file, value] of [['storyboard.json', storyboard], ['timeline.json', timeline], ['audio/manifest.json', audio]]) {
    if (value?.stale === true) warnings.push(`${file} is marked stale: ${value.staleReason ?? 'reason not recorded'}`)
  }

  const lintOk = errors.length === 0
  const release = { checked: options.release === true, status: 'NOT_CHECKED', errors: [], warnings: [] }
  let master = null

  if (options.release === true) {
    const releaseErrors = []
    const releaseWarnings = []
    if (modeInfo.conflict !== undefined) releaseErrors.push(modeInfo.conflict)
    for (const [file, value] of [['storyboard.json', storyboard], ['timeline.json', timeline], ['audio/manifest.json', audio]]) {
      if (value?.stale === true) releaseErrors.push(`${file} is marked stale`)
    }
    for (const configured of [production?.finalOutput, timeline?.finalOutput]) {
      if (typeof configured === 'string' && inside(root, configured) === undefined) releaseErrors.push(`configured finalOutput escapes the episode: ${configured}`)
    }
    const incomplete = []
    const staleMaster = path.join(root, 'exports', 'master.stale.json')
    if (existsSync(staleMaster)) {
      releaseErrors.push('exports/master.stale.json marks the existing master as built from a superseded narration; render and QA a new master, then remove the marker')
    }
    master = findMaster(root, production, timeline)
    if (master === null) {
      const configured = [production?.finalOutput, timeline?.finalOutput].find((value) => typeof value === 'string' && value.length > 0)
      incomplete.push(configured === undefined ? 'no final master found (expected exports/master.mp4 or production.finalOutput)' : `configured final master not found: ${configured}`)
    }
    if (master !== null) {
      const size = statSync(master.path).size
      if (size < 1024) releaseErrors.push(`final master is implausibly small (${size} bytes)`)
      master.size = size
      master.sha256 = await hashFileStream(master.path)
      const probe = runBounded('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', master.path,
      ], { timeoutMs: 30_000, retries: 0 })
      if (!probe.ok) {
        incomplete.push(`cannot verify the final master with ffprobe (${probe.errorCode ?? (probe.timedOut ? 'timeout' : `exit ${probe.status}`)})`)
      } else {
        try {
          const parsed = JSON.parse(probe.stdout)
          const streams = parsed.streams ?? []
          const video = streams.find((stream) => stream.codec_type === 'video')
          const sound = streams.find((stream) => stream.codec_type === 'audio')
          const actualDuration = Number(parsed.format?.duration)
          master.probe = {
            durationSec: Number.isFinite(actualDuration) ? actualDuration : null,
            width: video?.width ?? null,
            height: video?.height ?? null,
            fps: video?.r_frame_rate ?? null,
            hasAudio: sound !== undefined,
          }
          if (video === undefined) releaseErrors.push('final master has no video stream')
          if (NARRATED_MODES.has(mode) && sound === undefined) releaseErrors.push(`mode "${mode}" requires a final master with an audio stream`)
          if (Number.isFinite(actualDuration) && Number.isFinite(duration) && Math.abs(actualDuration - duration) > Math.max(1, duration * 0.02)) {
            releaseErrors.push(`final master duration ${actualDuration.toFixed(2)}s does not match timeline ${duration}s within 2%`)
          }
        } catch (error) {
          releaseErrors.push(`final master probe JSON is invalid: ${error.message}`)
        }
      }
    }

    const finalQaPath = path.join(root, 'qa', 'final.json')
    const finalQa = existsSync(finalQaPath) ? readJsonFile(finalQaPath, 'qa/final.json', releaseErrors) : undefined
    if (!existsSync(finalQaPath)) incomplete.push('qa/final.json is missing')
    if (finalQa !== undefined) {
      const verdict = String(finalQa.status ?? finalQa.result ?? '').toUpperCase()
      if (verdict !== 'PASS') releaseErrors.push(`qa/final.json status is ${JSON.stringify(finalQa.status ?? finalQa.result)}; expected PASS`)
      if (Array.isArray(finalQa.blockers) && finalQa.blockers.length > 0) releaseErrors.push(`qa/final.json has ${finalQa.blockers.length} blocker(s)`)
      if (finalQa.failed > 0) releaseErrors.push('qa/final.json reports failed checks')
      if (NARRATED_MODES.has(mode)) {
        const g0 = finalQa.g0 ?? finalQa.narration
        if (isObject(g0) && String(g0.status ?? g0.result ?? '').toUpperCase() !== 'PASS') {
          releaseErrors.push('qa/final.json records a non-PASS narration G0')
        }
      }
    }

    const mediaPath = path.join(root, 'qa', 'media.json')
    const media = existsSync(mediaPath) ? readJsonFile(mediaPath, 'qa/media.json', releaseErrors) : undefined
    if (!existsSync(mediaPath)) incomplete.push('qa/media.json is missing')
    if (media !== undefined) {
      if (media.ok !== true) releaseErrors.push('qa/media.json did not pass')
      if (master !== null && media.sha256 !== undefined && String(media.sha256).toLowerCase() !== master.sha256) {
        releaseErrors.push('qa/media.json sha256 does not match the current master; QA belongs to another file')
      }
      if (master !== null && media.sha256 === undefined) releaseErrors.push('qa/media.json has no sha256 binding to the master')
      if (Number.isFinite(media.durationSec) && Number.isFinite(duration) && Math.abs(media.durationSec - duration) > Math.max(1, duration * 0.02)) {
        releaseErrors.push(`qa/media duration ${media.durationSec}s does not match timeline ${duration}s within 2%`)
      }
      if (media.video !== null && media.video !== undefined && (!Number.isFinite(media.video.width) || media.video.width <= 0)) {
        releaseErrors.push('qa/media.json has invalid video metadata')
      }
      if (NARRATED_MODES.has(mode) && (media.audio === null || media.audio === undefined)) {
        releaseErrors.push(`mode "${mode}" requires an audio stream but qa/media.json has none`)
      }
      if (master?.probe !== undefined) {
        if (Number.isFinite(media.durationSec) && master.probe.durationSec !== null
          && Math.abs(media.durationSec - master.probe.durationSec) > Math.max(1, master.probe.durationSec * 0.02)) {
          releaseErrors.push(`qa/media duration ${media.durationSec}s does not match the probed master ${master.probe.durationSec}s`)
        }
        if (isObject(media.video) && Number.isFinite(media.video.width) && master.probe.width !== null
          && (media.video.width !== master.probe.width || media.video.height !== master.probe.height)) {
          releaseErrors.push('qa/media video dimensions do not match the probed master')
        }
        if (NARRATED_MODES.has(mode) && master.probe.hasAudio === false) {
          releaseErrors.push('the final master has no audio stream but the production mode requires voice-over')
        }
      }
    }

    if (scenes.length === 0) {
      incomplete.push('storyboard has no scenes')
    } else if (timedScenes.length !== scenes.length) {
      releaseErrors.push(`storyboard has ${scenes.length} scene(s) but timeline has ${timedScenes.length}; release needs a consistent timed scene for every storyboard scene`)
    } else {
      for (const scene of scenes) {
        const qaPath = path.join(root, 'qa', 'scene', `${scene.id}.json`)
        let status = existsSync(qaPath) ? String((readJsonFile(qaPath, `qa/scene/${scene.id}.json`, releaseErrors) ?? {}).status ?? '').toUpperCase() : undefined
        if (status === undefined) status = sceneQaStatus(finalQa, scene.id)
        if (status === undefined) {
          incomplete.push(`scene QA missing for ${scene.id}`)
        } else if (status !== 'PASS') {
          releaseErrors.push(`scene QA for ${scene.id} is ${status || 'unknown'}; expected PASS`)
        }
      }
    }

    if (NARRATED_MODES.has(mode)) {
      try {
        const gate = validateNarration(root, { requireSegments: true, productionMode: mode })
        if (!gate.ok) {
          releaseErrors.push(`narration G0 failed: ${gate.errors.slice(0, 3).join(' | ')}`)
        }
        release.narration = { ok: gate.ok, errors: gate.errors, warnings: gate.warnings }
      } catch (error) {
        releaseErrors.push(`narration G0 could not run: ${error.message}`)
      }

      const chunks = Array.isArray(audio.chunks) ? audio.chunks : []
      const segmentFile = path.join(root, 'audio', 'segments.json')
      const segments = existsSync(segmentFile) ? readJsonFile(segmentFile, 'audio/segments.json', releaseErrors)?.segments : undefined
      if (Array.isArray(segments)) {
        const expected = new Set(segments.map((segment) => segment.id))
        const seenChunks = new Set()
        for (const chunk of chunks) {
          const id = chunk?.segmentId ?? chunk?.id
          if (!expected.has(id)) releaseErrors.push(`audio chunk references unknown segment: ${id}`)
          if (seenChunks.has(id)) releaseErrors.push(`audio chunk repeats segment: ${id}`)
          seenChunks.add(id)
        }
        for (const id of expected) if (!seenChunks.has(id)) releaseErrors.push(`approved segment has no audio chunk: ${id}`)
      }
      if (chunks.length === 0) {
        incomplete.push('audio manifest has no synthesized chunks')
      } else {
        let total = 0
        for (const [index, chunk] of chunks.entries()) {
          const label = `audio chunk ${chunk?.id ?? index + 1}`
          const chunkRelative = chunk?.path ?? chunk?.file ?? chunk?.wav ?? chunk?.audio
          if (!isObject(chunk) || typeof chunkRelative !== 'string') {
            releaseErrors.push(`${label} has no path`)
            continue
          }
          const chunkPath = inside(root, chunkRelative)
          if (chunkPath === undefined) {
            releaseErrors.push(`${label} path escapes the episode: ${chunk.path}`)
            continue
          }
          if (!existsSync(chunkPath) || !statSync(chunkPath).isFile()) {
            incomplete.push(`${label} audio file is missing: ${chunkRelative}`)
            continue
          }
          if (statSync(chunkPath).size < 44) releaseErrors.push(`${label} audio file is empty or header-only`)
          const chunkDuration = Number.isFinite(chunk.durationSec) ? chunk.durationSec : chunk.duration
          if (!Number.isFinite(chunkDuration) || chunkDuration <= 0) releaseErrors.push(`${label} durationSec must be positive and measured`)
          if (typeof chunk.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(chunk.sha256)) releaseErrors.push(`${label} requires a sha256`)
          else if (sha256File(chunkPath) !== chunk.sha256.toLowerCase()) releaseErrors.push(`${label} sha256 does not match the file`)
          const probe = runBounded('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', chunkPath], { timeoutMs: 30_000, retries: 0 })
          if (!probe.ok) incomplete.push(`${label} could not be verified with ffprobe`)
          else {
            try {
              const parsed = JSON.parse(probe.stdout)
              const measured = Number(parsed.format?.duration)
              if (!parsed.streams?.some((stream) => stream.codec_type === 'audio')) releaseErrors.push(`${label} has no audio stream`)
              if (!Number.isFinite(measured) || measured <= 0) releaseErrors.push(`${label} has no measurable duration`)
              else {
                total += measured
                if (Number.isFinite(chunkDuration) && Math.abs(measured - chunkDuration) > Math.max(0.05, measured * 0.02)) releaseErrors.push(`${label} declared duration does not match measured duration`)
              }
            } catch { releaseErrors.push(`${label} probe returned invalid JSON`) }
          }
        }
        if (Number.isFinite(duration) && total > duration + 0.05) {
          releaseErrors.push(`audio chunk durations (${total.toFixed(2)}s) exceed timeline duration (${duration}s)`)
        }
        const narrationPath = path.join(root, 'narration.md')
        if (audio.narrationSha256 === undefined) {
          releaseErrors.push('audio/manifest.json has no narrationSha256 binding; release cannot prove the audio belongs to the frozen script')
        } else if (existsSync(narrationPath) && String(audio.narrationSha256).toLowerCase() !== sha256File(narrationPath)) {
          releaseErrors.push('audio/manifest.json narrationSha256 is stale relative to narration.md')
        }
      }
    } else if (Array.isArray(audio.chunks) && audio.chunks.length > 0) {
      const total = audio.chunks.reduce((sum, chunk) => sum + (Number.isFinite(chunk?.durationSec) ? chunk.durationSec : 0), 0)
      release.note = `mode "${mode}" has ${audio.chunks.length} audio chunk(s), total ${total.toFixed(2)}s; voice-over not required`
    }

    release.errors = releaseErrors
    release.warnings = releaseWarnings
    const coreMissing = master === null || scenes.length === 0 || !existsSync(finalQaPath) || !existsSync(mediaPath)
    if (coreMissing) release.status = 'INCOMPLETE'
    else if (releaseErrors.length > 0) release.status = 'FAIL'
    else if (incomplete.length > 0) release.status = 'INCOMPLETE'
    else release.status = 'PASS'
    if (incomplete.length > 0) release.missing = incomplete
    release.master = master
  }

  const ok = lintOk && (options.release !== true || release.status === 'PASS')
  return {
    ok,
    lint: { ok: lintOk, errors, warnings },
    release,
    errors: [...errors, ...release.errors],
    warnings: [...warnings, ...release.warnings],
    scenes: scenes.length,
    timedScenes: timedScenes.length,
    mode,
    master: master === null ? undefined : { path: path.relative(root, master.path), size: master.size, sha256: master.sha256 },
    releaseStatus: release.checked ? release.status : undefined,
  }
}


function parseArgs(argv) {
  const args = { episode: undefined, release: false, json: false, mode: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--release') args.release = true
    else if (value === '--lint') args.release = false
    else if (value === '--json') args.json = true
    else if (value === '--mode') {
      index += 1
      if (argv[index] === undefined) throw new Error('--mode needs a value')
      args.mode = argv[index]
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`)
    else if (args.episode === undefined) args.episode = value
    else throw new Error(`unexpected argument: ${value}`)
  }
  if (args.episode === undefined) throw new Error('missing episode directory')
  return args
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`Usage: node scripts/validate-episode.mjs <episode-dir> [--lint|--release] [--json] [--mode <mode>]\n${error.message}`)
    process.exitCode = 2
    return
  }
  let result
  try {
    result = await validateEpisode(args.episode, { release: args.release, mode: args.mode })
  } catch (error) {
    console.error(`validate-episode: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (args.json || true) {
    console.log(JSON.stringify({
      ok: result.ok,
      lint: result.lint,
      release: result.release,
      errors: result.errors,
      warnings: result.warnings,
      scenes: result.scenes,
      timedScenes: result.timedScenes,
      mode: result.mode,
      ...(result.releaseStatus === undefined ? {} : { releaseStatus: result.releaseStatus }),
    }, null, 2))
  }
  process.exitCode = result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) main()
