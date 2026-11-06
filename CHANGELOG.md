# Changelog

All notable changes to the portable video studio. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/) (pre-1.0: a minor bump may change contracts; the **Migration** notes say what to do).

Every change that alters behaviour, a contract or a command adds an entry under **Unreleased**. A release moves those entries under a new version heading, bumps `package.json` to match and tags the commit `v<version>`.

## [Unreleased]

## [0.7.0] - 2026-11-06

### Added
- `docs/getting-started.md`: first-use guide after installing the bundle (install, GPU sandbox, workspace, speech engine, voice, look, first video, common requests, troubleshooting).
- `scripts/setup-tts.mjs` (`npm run tts:setup`): verifies the speech engine with a real sample and only then saves `<dataRoot>/tts.config.json` (interpreter, model, provider command, GPU requirement, environment, verification record); `--show` prints it.
- `scripts/studio-status.mjs` (`npm run status`): read-only report of version, roots, saved engine, voices, visual styles, series and episodes, with the next missing setup steps.
- The `video-workspace` skill answers usage and first-time-setup questions from the guide and the current machine status.
- Example requests for setup, usage questions and re-voicing/restyling.

### Changed
- `synthesize-narration.mjs` and `audio-preflight.mjs` fill unset engine options and environment from `tts.config.json` for its provider; explicit flags still win. `synthesize-narration` no longer assumes `python` on PATH and the `k2-fsa/OmniVoice` repo id when a runtime is saved.
- README "Fresh machine" points to the guide and no longer refers to a ZIP checkout.

### Migration
- Run `setup-tts.mjs` once per data root with the paths you previously passed on every audio command; the old flags keep working.

## [0.6.0] - 2026-11-06

### Added
- Voice packages `<dataRoot>/library/voices/<id>/` (`voice.json`, reference WAV, exact transcript, language, required `rights`, `notes.md`), selected by `production.json.voicePackage` > `project.json.voicePackage`. There is no default voice: synthesis without a selection stops.
- `scripts/new-voice.mjs` (`npm run voice:new`) checks a reference recording (readable, 1–120 s, not clipped, not mostly silence) and creates a package without overwriting.
- `--voice-package <id>` for `audio-preflight.mjs` and `synthesize-narration.mjs`; mixing a package with `--voice-reference`/`--ref-text` or another `--provider` is rejected.
- Release gate: when an episode selects a voice package, `audio/manifest.json.engine.voicePackage` must name it with its current hash.
- Visual style packages `library/visual-styles/<id>/` (tokens, fonts, refs), selected by `production.json.visualStyle` > `project.json.visualStyle` > built-in `default`; scenes read `api.theme`. `new-visual-style.mjs` and `extract-style-refs.mjs` create and seed looks.
- Deterministic Skia renderer (`render-episode.mjs`): parallel scene processes, content-addressed scene cache, cached two-pass loudness normalization, NVENC only after a real encode probe.
- Persistent OmniVoice helper (`synthesize-narration.mjs`): one model load per batch, resumable by fingerprint, refuses CPU fallback.
- EBU R128 loudness check in `qa-media.mjs` (project `audio.loudness`, default −16 LUFS / −1.5 dBTP); release requires it.
- Scene QA binds to `narrationSha256` (narrated/mixed) and `styleSha256`.
- `worker-brief.mjs`: byte-stable, cache-friendly scene worker briefs.
- `dsh-gpu-sandbox` runner exposing NVIDIA/DRI (and WSL2 `/dev/dxg`) device nodes to sandboxed TTS and encoding.
- Data root defaults to the session workspace; `new-episode` initializes it.
- `CHANGELOG.md` and versioned releases.

### Changed
- `AGENTS.md` restructured into workflow, gates with the exact command, and hard limits; skill descriptions state triggers and boundaries.
- Audio cache fingerprints include the probed OmniVoice version, helper hash and interpreter path.
- Worker waves attribute each worker to its result file's `work/<task-id>/` directory.
- HyperFrames is no longer offered as a renderer.

### Fixed
- `revise-narration` detects every existing master, not only the configured one.
- Catalog promotion never auto-reclaims a stale lock and releases only its own lock.
- Symlink and traversal escapes in TTS outputs, render cache, style fonts and reference extraction.
- Interrupted synthesis keeps unvisited cache entries and stays marked stale.
- Large bounded-job inputs travel over stdin (no `E2BIG`).
- Render cache keys follow compact and literal dynamic imports; `\boxed` formulas draw an outline.
- Vietnamese number reading: operator spans, adjacent digit words, `không trăm`, function names such as `g(x)`.

### Migration
- `project.json` `"style"` is ignored; set `"visualStyle": "<id>"` and give the style all eight core colours (`background`, `ink`, `muted`, `line`, `accent`, `structure`, `success`, `error`).
- Narrated series: create a voice package from the reference you already use (`new-voice.mjs <id> --reference <wav> --ref-text "<exact words>" --rights "<note>"`) and set `voicePackage`, then re-run `synthesize-narration` before release. Segments made by 0.6.0 with the same reference, transcript and language are reused; audio from older versions is re-synthesized because the helper changed.

## [0.5.0] - 2026-11-05

### Added
- Narration G0 split into mechanical integrity and editorial evidence gates; through-line map, v2 claim-check and review schemas, independent review for high-risk work.
- Meaning-preserving `spokenText` pronunciation contract and `revise-narration.mjs` that invalidates downstream artifacts.
- Production modes `narrated`, `silent`, `text-only`, `mixed`, and the strict release gate (`validate-episode.mjs --release`).
- Provider-aware audio preflight, bounded jobs, targeted audio QA, DSH-log metrics, worker path/allowlist validation, atomic scene promotion.

### Migration
- See [docs/migration-v05.md](docs/migration-v05.md).

## [0.4.0] - 2026-11-05

### Added
- Initial portable video studio DSH bundle: `video-producer` and `video-scene-worker` presets, nine `video-*` skills, workspace kit and library.

[Unreleased]: https://github.com/ChiThang-50Cent/dsh-video-plugin/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/ChiThang-50Cent/dsh-video-plugin/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ChiThang-50Cent/dsh-video-plugin/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ChiThang-50Cent/dsh-video-plugin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ChiThang-50Cent/dsh-video-plugin/releases/tag/v0.4.0
