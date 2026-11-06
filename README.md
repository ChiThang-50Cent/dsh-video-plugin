# Portable Video Studio for DeepSeek Harness 0.5.0

This repository is two things in one checkout: an installable **DSH bundle** that adds two Agent Presets (`video-producer`, `video-scene-worker`), and a portable **video-studio workspace** with nine skills, contract examples, deterministic helpers and a per-episode tree. It is backend-agnostic: no `math-motion` project, HyperFrames, OmniVoice, Python runtime, or particular genre is required.

The 0.5 line makes narration quality a real evidence-based gate, adds a meaning-preserving pronunciation contract, separates lint from release, and hardens workspace, audio, metrics and worker integration.

## Contents

- `package.json`, `index.js`, `cordis.patch.yml`, `skills/`, `locale/`, `icon.svg`: DSH bundle payload. The Studio plugin registers a provider for nine skills profile-wide and renders roots for each session workspace.
- `AGENTS.md`: standing rules for the studio.
- `skills/`: nine DSH skills. `video-narration/references/` carries the Vietnamese style guide, annotated examples and the full G0 review/claim/review schemas.
- `kit/`: example contracts: project, production mode, through-line map, claim check, narration review, segments, scene contract/result, worker plan.
- `scripts/`: zero-dependency Node helpers for workspace init, episode creation, narration integrity/editorial gates, revision, narration lint, editorial pre-scan, scene promotion, episode lint/release, audio preflight/QA, media QA, worker validation and log-based metrics.
- `library/`: approved scene catalog, templates and narration style packages.
- `projects/`: one directory per series; `episodes/` holds self-contained episodes.
- `docs/`: architecture, runbook, acceptance checks, examples and DSH notes.

## Fresh machine

1. Install Node.js 20+ and DSH `0.2.2-rc.1` (pin the package explicitly):

   `npx -y @deepseek-ai/dsh@0.2.2-rc.1 --version`

2. Extract this ZIP to `video-studio`, enter it and optionally `git init`.

3. Run `node scripts/preflight.mjs` to inspect render/audio tools. Preflight installs nothing and does not treat a GPU as a ready TTS backend.

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

Install the npm payload separately from production data. The package deliberately excludes user-provided transcripts and includes `library/catalog.json`, `library/styles/default.json` and the public style metadata/notes needed to initialize.

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

Before batch speech:

```bash
node scripts/audio-preflight.mjs --provider espeak-ng --voice-reference voice.wav \
  --synthesize-sample --json
```

- `nvidia-smi` proves hardware, not that the provider uses it. The provider command, configured device probe, voice reference and short measured sample must pass. `--require-gpu` refuses an unknown/CPU backend instead of silently falling back.
- Voice reference checks cover readability, duration, sample rate, silence and clipping; language/timbre fit still needs listening.
- Use bounded jobs with explicit timeouts/retries (`scripts/lib/bounded.mjs`). Never retry forever.
- `node scripts/qa-audio.mjs <episode> --segments audio/segments.json [--audio]` checks numbers/operators/omissions deterministically and, with `--audio`, silence/clipping. ASR is optional advisory evidence, not truth.
- Measure every WAV; never use word-count estimates as measured timing. Preserve valid caches and attribution.

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

`--lint` checks structure only. `--release` requires a real master verified by ffprobe and hash, `qa/final.json` PASS, `qa/media.json` bound to the current file, scene QA for every scene, G0 and audio consistency for narrated/mixed, and no unresolved stale marker. A fresh or incomplete episode is `INCOMPLETE`, never PASS. Media QA is metadata-only by default; `--quality`/`--subtitles` are targeted and optional, so narration/code edits do not trigger a full-media pass.

## Worker isolation

- Default: at most **two concurrent** scene workers. `maxDepth` (nesting) is a different control.
- Workers own `work/<task-id>/`; the main agent owns narration, global timeline, assets and library promotion.
- Validate plans and results before integration:

```bash
node scripts/validate-workers.mjs plan plan.json --max-concurrency 2 --max-depth 1
node scripts/validate-workers.mjs result <episode> scene-result.json \
  --work work/s03 --allow 'work/s03/**'
```

The result check rejects changed files outside the work directory/allowlist, protected artifacts and symlink escapes. This is post-hoc review, **not** a filesystem sandbox; prompt text is not security. Use the DSH child session sandbox where available.

## Metrics from DSH logs

```bash
node scripts/collect-metrics.mjs --session <main-session-id> --out reports/metrics.json
node scripts/collect-metrics.mjs --episode <episode-dir> --json
```

The collector reads persisted DSH session JSONL (plain or zstd), follows `parentSession` to include scene workers, and separates wall-clock union, active turns, tool execution/union/overlap, observed model latency, multi-agent overlap, worker concurrency (distinct from delegation depth), tokens, cached tokens, retries, failed jobs and image reads. Missing data is `null`/`unavailable`; manual estimates are never labelled measured.

## Style references

A project opts in with `project.json.styleRefs: ["indeterminate-forms"]`. Each id resolves to `<dataRoot>/library/styles/<id>/` with `style.json`, notes and optionally a source reference. The source transcript may be omitted from an installed package when `style.json` declares `sourceBundled: false` and `externalSource`; notes remain the reusable extract. Validate with:

```bash
node scripts/validate-style-refs.mjs projects/<series>
```

## Tests and package checks

```bash
node --test tests/*.test.mjs
node --check index.js
npm pack --dry-run
```

The suite covers the false limit/self-review regression, unresolved blocking findings, missing claim evidence, spokenText semantic changes and valid pronunciation, external data roots, npm-package initialization, first-scene promotion and failure isolation, empty-episode release status, silent/text-only release, metrics aggregation, audio preflight, worker isolation, editorial evaluation fixtures and style validation.

## Example request

> Use /video-produce for a 10-minute Vietnamese explainer on why negative times negative is positive. Build the through-line map first, write continuous narration, audit every claim with a location, run the editorial and independent review, and freeze it. Use existing PASS templates before new scenes, at most two scene workers, verified audio preflight and a real narrated 1080p MP4. If a source or backend is missing, tell me exactly what is missing.

See `docs/architecture.md`, `docs/acceptance.md`, `docs/examples.md`, `docs/dsh.md` and `docs/log-based-improvements.md`.
