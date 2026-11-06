# Portable Video Studio for DeepSeek Harness

This repository is two things in one checkout: an installable **DSH bundle** that adds two Agent Presets (`video-producer`, `video-scene-worker`), and a portable **video-studio workspace** with nine skills, contract examples, deterministic helpers and a per-episode tree. The built-in Skia adapter is the default for code-animated 2D scenes when preflight passes; no `math-motion` project, OmniVoice, Python runtime, or particular genre is required.

Current version: 0.6.0. The 0.6 line adds switchable visual styles and narrator voice packages, a parallel cached Skia renderer, batch GPU speech and a loudness gate. The 0.5 line made narration quality a real evidence-based gate. Every change is recorded in [CHANGELOG.md](CHANGELOG.md); releases are tagged `v<version>`.

## Contents

- `package.json`, `index.js`, `cordis.patch.yml`, `skills/`, `locale/`, `icon.svg`: DSH bundle payload. The Studio plugin registers a provider for nine skills profile-wide and renders roots for each session workspace.
- `AGENTS.md`: standing rules for the studio.
- `skills/`: nine DSH skills. `video-narration/references/` carries the Vietnamese style guide, annotated examples and the full G0 review/claim/review schemas.
- `kit/`: example contracts: project, production mode, through-line map, claim check, narration review, segments, scene contract/result, worker plan.
- `scripts/`: Node helpers for rendering, workspace init, episode creation, narration integrity/editorial gates, revision, narration lint, editorial pre-scan, scene promotion, episode lint/release, audio preflight/QA, media QA, worker validation and log-based metrics.
- `library/`: approved scene catalog, templates and narration style packages.
- `projects/`: one directory per series; `episodes/` holds self-contained episodes.
- `docs/`: architecture, runbook, acceptance checks, examples and DSH notes.

## Fresh machine

1. Install Node.js 20+ and DSH `0.2.2-rc.1` (pin the package explicitly):

   `npx -y @deepseek-ai/dsh@0.2.2-rc.1 --version`

2. Extract this ZIP to `video-studio`, enter it and optionally `git init`.

3. Run `node scripts/preflight.mjs` to inspect render/audio tools and the execution environment's GPU visibility and encoder recommendation. Preflight installs nothing and does not treat GPU hardware as a ready TTS backend. For optional GPU access inside DSH, configure the home-level sandbox runner and verify it as described in [GPU inside the DSH sandbox](docs/dsh.md#gpu-inside-the-dsh-sandbox); review the security and reversion instructions first.

   The built-in Skia adapter needs its installed Node dependencies and FFmpeg. Its CPU and GPU rendering engines are separate from the video encoder: a CPU-rendered scene can use NVENC if its real encode probe passes. GPU rendering or NVENC inside DSH requires the GPU sandbox runner and verification in that same sandbox context.

4. Install the bundle from the Web **Plugins** page (local path) or with `plugin_manager` `action: install_bundle`. The bundle applies `cordis.patch.yml` and shows `Video studio presets`.

5. Select `video-producer` in a new session, then invoke `/video-produce` or ask naturally. The skills are available to every session in the profile.

### Using the studio from another workspace

Every loaded skill begins with:

```text
> Studio code root: `/path/to/video-studio`
> Studio data root: `/data/video` (projects, library, cache)
> Standing rules: `/path/to/video-studio/AGENTS.md` ...
```

Resolve `scripts/` against the **code root**, the installed package (skills, scripts, kit, built-in library payload). Resolve `projects/`, `library/` and `.cache/` against the **data root**. By default this is the nearest ancestor of the current directory containing `library/catalog.json`, or the current directory if no initialized workspace exists. From the workspace, initialize it with:

```bash
node /path/to/video-studio/scripts/init-workspace.mjs
# To select another data root:
node /path/to/video-studio/scripts/init-workspace.mjs --data-root /data/video
```

Precedence is explicit `--data-root`/plugin `dataRoot` > `VIDEO_STUDIO_ROOT` > `studio.config.json` > initialized workspace ancestor or cwd. Relative explicit and environment values resolve against cwd; relative config values resolve against the config file directory. The plugin and CLI helpers use the same resolver. If `dataRoot` is set only in the plugin row, export the same value for shell helpers or pass `--data-root`; a profile row is not visible to a CLI process. Run the code root's `scripts/studio-root.mjs` from the workspace to print effective roots. Initialization is idempotent and copies missing built-in styles/catalog; it never overwrites existing user files.

Install the npm payload separately from production data. The package deliberately excludes user-provided transcripts and includes `library/catalog.json`, the built-in `library/visual-styles/default` look and the public narration style metadata/notes needed to initialize.

## Built-in Skia renderer

Install the package dependencies and FFmpeg, then run `node scripts/preflight.mjs` in the intended execution context. A scene is an ES module exporting `meta = { id, durationSec, width, height, fps }` and `draw(ctx, t, api)`. Drawing must depend only on its inputs. The built-in API provides easing, fades and crossfades, wrapped text, cached TeX formulas, axes, progressively revealed function plots, arrows and highlights, plus `api.theme`: the active visual style's colours, typography (`api.theme.font(role)`), layout, motion and free-form tokens, with its fonts already registered. Scenes take every colour and font from `api.theme`; see [Visual styles](library/visual-styles/README.md).

```bash
node scripts/render-scene.mjs scene.mjs --out scene.mp4 --engine auto --encoder auto
node scripts/render-scene.mjs scene.mjs --snapshots-only --frames 0.5,4,9.5 --frames-dir frames --contact-sheet contact.png
node scripts/render-episode.mjs path/to/episode --out exports/master-v2.mp4 --json
```

The scene CLI also accepts `--engine cpu|gpu|auto`, `--encoder auto|h264_nvenc|libx264`, `--threads n`, `--min-free-mem-mib n`, `--body-font <family>`, `--frames`, `--frames-dir`, `--contact-sheet` and `--json`. A full render writes `<out>.render.json`; snapshots-only requires frame times and a frames directory and does not require `--out`. The episode renderer consumes frame-aligned, contiguous timeline scenes with episode-relative `source`, `startSec` and `durationSec`; audio chunks are read in manifest order from time zero. It probes each audio stream and requires its measured duration to match the manifest within 0.05 seconds. Audio longer than the timeline is rejected; shorter audio is padded with silence. Silent and text-only episodes still require `audio/manifest.json`, but may have empty chunks. The renderer does not synthesize speech.

The visual style is resolved per episode: `production.json.visualStyle` overrides `project.json.visualStyle`, falling back to the built-in `default`; `--visual-style <id>` overrides both for one render. `--body-font <family>` overrides only the body font. The render report records the style id and SHA-256 (style.json plus its font files), and scene QA must record the same `styleSha256` before release.

Episode rendering refuses to replace an existing output unless `--overwrite` is explicitly supplied. It keeps per-scene reports in `reports/render-scenes/<id>.render.json`; intermediate videos are discarded, so each report's `output` is null and `episodeOutput` identifies the master. Do not overwrite a released master without authorization.

Scenes render as parallel child processes (`--concurrency N`, default min(3, CPUs/4), at least one; NVENC is capped at three). Each scene is cached under `<episode>/.cache/render/` by a key covering its source and every relative import, the episode `assets/` and `fonts/`, the renderer code, duration, engine/encoder, body font and the visual style hash; only scenes whose inputs changed re-render, and `--no-cache` forces all. Narrated audio gets two-pass EBU R128 normalization to project `audio.loudness` (default −16 LUFS integrated, −1.5 dBTP); the normalized track is cached by the chunk bytes and target. The report records per-scene `cache`/timings, `style` and `audio.loudness`. Run it as one blocking command with a generous timeout rather than polling a log. Measured on the 12-minute ep-803 copy: 276 s cold (401 s sequential before), 43 s after editing one scene, 23 s with nothing changed.

`auto` Skia rendering selects GPU when a real GPU engine is available, otherwise CPU with a reason; an explicit GPU engine requires a working GPU and fails otherwise. Encoder `auto` probes a real NVENC encode and falls back to libx264 with a reason. The default free-RAM minimum is 1024 MiB; libx264 defaults to half the logical CPUs and the renderer attempts nice 10 on Linux, recording priority failures in the report. Synthesize TTS sequentially before rendering, and run at most two scene workers. See [GPU inside the DSH sandbox](docs/dsh.md#gpu-inside-the-dsh-sandbox) for GPU rendering and NVENC access.

NVENC uses VBR CQ 28, zero target bitrate and preset p5; libx264 uses CRF 23 and medium preset. On the included 10-second 1080p example, NVENC produced 296,393 bytes versus 231,601 bytes for libx264 (1.28×); comparing decoded outputs gave SSIM 0.999145 and PSNR 52.26 dB. These measurements are content- and hardware-dependent, not a general quality guarantee.

## Narration-first production (G0)

Workflow: intake → through-line map → complete narration draft → claim audit → editorial critique → independent review when risk requires it → frozen narration → storyboard/reuse → TTS/timeline → scenes → QA → release.

### Two gates

```bash
node scripts/validate-narration.mjs <episode-dir> --integrity
node scripts/validate-narration.mjs <episode-dir> --editorial
node scripts/validate-narration.mjs <episode-dir>              # both, default
```

- **Mechanical integrity** checks schemas, hash, references, required fields, claim evidence/locations, through-line coverage/order, review evidence locations and exact segment coverage.
- **Editorial/content** checks that the review is evidence-based: every criterion is pass with real cited excerpts, every section is covered, findings are resolved as claimed, high-risk claims are cited, and known high-confidence defects are addressed.
- Neither gate proves mathematical or factual truth. The cited review, independent reviewer and human accountability are the trust basis; the validator must never be described as proving a claim.

### Artifacts

An episode carries:

- `throughline-map.json` — central question, promise, audience, and every section's purpose, connection, position and takeaway.
- `narration.md` — continuous spoken prose; headings, blockquotes, fenced blocks and HTML comments are non-spoken.
- `claim-check.json` (schema v2) — each claim has `verified`, risk, a source/derivation or evidence, and a real narration location. High-risk claims need evidence and a location. An empty claim list cannot silently pass claim-bearing content.
- `narration-review.json` (schema v2) — eight criteria with per-criterion excerpts and notes, reviewer identity, complete-section coverage, findings with severity/evidence/proposed fix/resolution status, exact SHA-256, and an `independentReview` block when risk is high.
- `audio/segments.json` (schema v2) — canonical `text` exactly reproduces the frozen prose; pronunciation changes require declared overrides.

A quality PASS requires all eight criteria `pass`, empty `blockers`, no open blocking findings, evidence citations, and a matching hash. Open blocking findings fail G0 even if `blockers` is empty. A high-risk or quality-sensitive episode needs one separate review pass with fresh context (prefer a DSH subagent); see `video-narration/references/script-review.md`.

### Spoken-text contract

`text` is canonical wording. `displayText` must equal it. `spokenText` may differ only through `pronunciation.overrides` with `from`, `to`, `kind`, `provenance` and `justification`:

- `16` → “mười sáu” is valid.
- `trừ` → `cộng`, a sign flip, a changed number or an omitted quantity is invalid **even if a review marks it approved**.
- An ambiguous but meaning-preserving reading (`trừ` → `dấu trừ`) needs `reviewed`, `reviewedBy` and a resolved `reviewRef`.
- The validator reconstructs `spokenText` from declared overrides and compares the semantic fingerprint of numbers/operators/signs.

### Revisions

Never hand-edit a frozen script. Use:

```bash
node scripts/revise-narration.mjs <episode> --from new.md --reason "why the approved script changes"
```

It archives the old narration/review under `narration-revisions/`, blocks the review with the new hash, moves the old segment manifest aside, blocks the claim audit to `PENDING`, and marks the through-line, storyboard, timeline and audio manifest stale. If a released master exists, a protected `exports/master.stale.json` marker is written; release fails until a new master is rendered and the marker removed. A released master is protected unless `--allow-released` is explicit.

### Migration from v1 reviews

Schema-v1 `narration-review.json`/`claim-check.json` passes are **not** re-certified by the evidence gate. Existing released masters and locked narration are untouched. To continue an older episode, scaffold blocked v2 files without rewriting history:

```bash
node scripts/migrate-narration.mjs <episode>     # writes *.migrating.json only
```

Fill the through-line, claims and cited review, rename the three files to their canonical names after a genuine review, then run `validate-narration.mjs --gate`. See `docs/migration-v05.md`.

### Modes

`production.json.mode` is `narrated`, `silent`, `text-only` or `mixed`.

- `narrated`/`mixed`: narration G0 and audio QA required.
- `silent`/`text-only`: no fake narration, claims or review. Visual/media QA and, where present, music/SFX/subtitles are the gates.

From the workspace, create an episode with `node /path/to/video-studio/scripts/new-episode.mjs <series> <ep-001> --mode silent`. A fresh episode is structurally lint-clean but release status `INCOMPLETE`.

## Audio preflight and runtime

The narrator voice is a package `<dataRoot>/library/voices/<id>/` (reference recording, exact transcript, language, rights), selected by `production.json.voicePackage` > `project.json.voicePackage`. There is no default voice. Create one and listen to it before use:

```bash
node scripts/new-voice.mjs narrator-vi --reference take.wav --ref-text "exact transcript" \
  --rights "recorded by the channel owner for this channel"
node scripts/audio-preflight.mjs --voice-package narrator-vi --provider-command /venv/bin/omnivoice-infer \
  --model /path/to/OmniVoice-checkpoint --synthesize-sample --require-gpu --json
node scripts/audio-preflight.mjs --provider espeak-ng --voice-reference voice.wav \
  --synthesize-sample --json          # one-off reference without a package
```

Switch the voice by changing `voicePackage` and re-synthesizing; segments spoken by another voice are redone automatically. Details: [library/voices/README.md](library/voices/README.md).

- `nvidia-smi` proves hardware, not that the provider uses it. The provider command, configured device probe, voice reference and short measured sample must pass. `--require-gpu` refuses an unknown/CPU backend instead of silently falling back.
- Voice reference checks cover readability, duration, sample rate, silence and clipping; language/timbre fit still needs listening.
- Use bounded jobs with explicit timeouts/retries (`scripts/lib/bounded.mjs`). Never retry forever.
- `node scripts/qa-audio.mjs <episode> --segments audio/segments.json [--audio]` checks numbers/operators/omissions deterministically and, with `--audio`, silence/clipping. ASR is optional advisory evidence, not truth.
- Measure every WAV; never use word-count estimates as measured timing. Preserve valid caches and attribution.
- OmniVoice batch: `node scripts/synthesize-narration.mjs <episode> --python /venv/bin/python --model <checkpoint> --require-gpu [--voice-package <id>] [--timeout-ms 120000] [--retries 1] [--overall-timeout-ms 3600000] --json` uses the episode's voice package (or `--voice-reference`/`--ref-text` for a one-off), keeps one model loaded for every segment (`scripts/lib/tts/omnivoice_batch.py`), refuses a CPU device, skips segments whose fingerprint and file hash still match, and writes `audio/manifest.json` `chunks[]` plus `engine.voicePackage` `{id, sha256}`. Release fails when that record does not match the selected package. Run audio preflight first in the same execution context. Measured: 6 segments (118 s of speech) in 39.5 s versus about 60 s with one process per segment.

## Scene library and reuse

```bash
node scripts/promote-scene.mjs intro-template scene.mjs preview.png qa.json \
  --backend browser --version 2 --purpose "Opening title" --tags intro,title
```

Promotion works on an empty library, creates parents/catalog idempotently, rejects invalid/contradictory QA, collisions and non-project inputs, stages files, records source/preview/QA hashes, template version and backend compatibility, and atomically updates the catalog. A failed promotion leaves the old catalog intact.

Classification remains A (template), B (copy/patch), C (custom). Every scene needs a reason and `reuseFrom` where applicable. Never overwrite an accepted id.

## Lint vs release

```bash
node scripts/validate-episode.mjs <episode> --lint       # work in progress
node scripts/validate-episode.mjs <episode> --release    # delivery
```

`--lint` checks structure only. `--release` requires a real master verified by ffprobe and hash, `qa/final.json` PASS, `qa/media.json` bound to the current file with a passing loudness check, scene QA for every scene recording the current visual style hash (`styleSha256`) and, for narrated/mixed, the frozen narration hash (`narrationSha256`), G0 and audio consistency for narrated/mixed, and no unresolved stale marker. A fresh or incomplete episode is `INCOMPLETE`, never PASS. Media QA is metadata plus loudness by default; `--quality`/`--subtitles` are targeted and optional, so narration/code edits do not trigger a full-media pass.

## Worker isolation

- Default: at most **two concurrent** scene workers. `maxDepth` (nesting) is a different control.
- Workers own `work/<task-id>/`; the main agent owns narration, global timeline, assets and library promotion.
- Generate worker prompts with `node scripts/worker-brief.mjs <episode> --scene <scene-id> --task <task-id> --wave <wave-id> --out <brief-file>` and dispatch the file verbatim. It reads the active visual style (id, hash and tokens; scenes still read them from `api.theme` at render time), narration style references, production, storyboard, measured timeline, relevant narration and `<episode>/worker-plan.json` (override with `--plan`); each plan worker's `id` is its task id and `sceneId` identifies the scene. Only custom C scenes are delegated. Use the same wave id for the entire wave; without `--wave`, the task id is used for a single-worker wave.
- The tool reports each block's UTF-8 byte length and SHA-256 on stderr, or in JSON with `--json`; `--json` without `--out` includes the full brief. The blocks are ordered studio contract, episode context, scene assignment. Keep generated files outside the episode during a wave so they cannot invalidate its snapshot. Snapshot and sandbox rules still apply.
- Validate plans and results before integration:

```bash
node scripts/validate-workers.mjs plan plan.json --max-concurrency 2 --max-depth 1
node scripts/validate-workers.mjs result <episode> scene-result.json \
  --work work/task-s03 --allow 'work/task-s03/**'
node scripts/validate-workers.mjs wave <episode> --baseline <episode>/qa/worker-baselines/<wave-id>.json \
  --baseline-sha256 <sha256> --result work/task-s03/scene-result.json --result work/task-s04/scene-result.json \
  --allow 'work/task-s03/**' --allow 'work/task-s04/**'
```

The result check rejects changed files outside the work directory/allowlist, protected artifacts and symlink escapes. In a wave, each worker's directory is the directory of its result file (`work/<task-id>/scene-result.json`), so task ids need not equal scene ids. This is post-hoc review, **not** a filesystem sandbox; prompt text is not security. Use the DSH child session sandbox where available.

## Metrics from DSH logs

```bash
node scripts/collect-metrics.mjs --session <main-session-id> --out reports/metrics.json
node scripts/collect-metrics.mjs --episode <episode-dir> --json
```

The collector reads persisted DSH session JSONL (plain or zstd), follows `parentSession` to include scene workers, and separates wall-clock union, active turns, tool execution/union/overlap, observed model latency, multi-agent overlap, worker concurrency (distinct from delegation depth), tokens, cached tokens, cache hit ratio, retries, failed jobs and image reads. Missing data is `null`/`unavailable`; manual estimates are never labelled measured. A call that records input/output but no cache counters counts as zero cache; calls with no usage at all (for example interrupted ones) are listed in `missingUsage`, leave the aggregate unavailable and are excluded from the labelled `observed` subtotal.

## Visual styles

The look of rendered scenes (colours, typography, fonts, layout, motion) lives in swappable packages `<dataRoot>/library/visual-styles/<id>/`, chosen by `production.json.visualStyle` > `project.json.visualStyle` > built-in `default`. Add one with `node scripts/new-visual-style.mjs <id> --from <existing>`, then optionally pull local references into it with `node scripts/extract-style-refs.mjs <id> <files...> --rights "<note>"` (the package must exist first); edit its `style.json`; switch by changing `visualStyle`; delete by removing the directory once nothing references it. Any change re-renders the affected scenes and requires scene QA again. Details: [library/visual-styles/README.md](library/visual-styles/README.md).

## Narration style references

A project opts in with `project.json.styleRefs: ["indeterminate-forms"]`. Each id resolves to `<dataRoot>/library/styles/<id>/` with `style.json`, notes and optionally a source reference. These shape voice and writing, not the rendered look. The source transcript may be omitted from an installed package when `style.json` declares `sourceBundled: false` and `externalSource`; notes remain the reusable extract. Validate with:

```bash
node scripts/validate-style-refs.mjs projects/<series>
```

## Tests and package checks

```bash
node --test tests/*.test.mjs
node --check index.js
npm pack --dry-run
```

The suite covers the false limit/self-review regression, unresolved blocking findings, missing claim evidence, spokenText semantic changes and valid pronunciation, external data roots, npm-package initialization, first-scene promotion and failure isolation, empty-episode release status, silent/text-only release, release hash binding (narration, visual style, loudness), metrics aggregation and cache hit ratio, audio preflight, batch synthesis resume/timeout/CPU refusal, render cache invalidation and loudness normalization, visual style precedence/validation/hashing/restyling, worker isolation, editorial evaluation fixtures and style validation.

## Example request

> Use /video-produce for a 10-minute Vietnamese explainer on why negative times negative is positive. Build the through-line map first, write continuous narration, audit every claim with a location, run the editorial and independent review, and freeze it. Use existing PASS templates before new scenes, at most two scene workers, verified audio preflight and a real narrated 1080p MP4. If a source or backend is missing, tell me exactly what is missing.

See `docs/architecture.md`, `docs/acceptance.md`, `docs/examples.md`, `docs/dsh.md` and `docs/log-based-improvements.md`.
