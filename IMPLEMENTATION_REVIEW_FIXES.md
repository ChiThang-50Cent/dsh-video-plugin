# Implementation review fixes — Video Studio 0.5.0

Status: implemented and tested in this checkout. No production TTS, GPU inference, scene worker or full video render was run. A tiny synthetic clip was generated only to exercise the media/release gate.

## 0. Audit reference and scope

`dsh-video-plugin-review.md` was **not present** in the repository, its parent directories or the workspace. The audit reference used here is the requirements supplied in the task. Every named defect was checked against the current source before editing; the repository is `dsh-video-studio` (remote `dsh-video-plugin`), the same checkout.

The nine skills and two Agent Presets remain. No renderer, TTS provider, genre or framework was made mandatory. Existing accepted production data was read for validation but not modified; the previous `dai-so-la-gi` episode still has its original narration, review, audio and master.

## 1. Root causes and reproduction

| # | Reported issue | Root cause found | Reproduced before the fix? | Regression evidence now |
|---|---|---|---|---|
| P0.1 | G0 could PASS weak/repetitive/wrong narration | The old gate checked `review.status`, eight self-reported `pass` strings, `blockers` and a hash. It had no per-criterion evidence, no through-line artifact, no finding status/resolution and no independent review. Claims had no required location/evidence, and an empty claim list passed silently. | Yes, by constructing a review with all criteria `pass` for the false two-sided-limit fixture. The old validator returned exit 0. | `tests/narration.test.mjs` — fake self-review test; `tests/editorial-evaluation.test.mjs` |
| P0.2 | `spokenText` could change meaning while `text` matched | The old validator checked only that `spokenText` was a non-empty string. It never reconstructed it from declared changes or compared numbers/operators/signs. | Yes, by changing `trừ` to `cộng` in a segment while keeping `text` byte-identical. The old validator passed segment coverage. | `tests/pronunciation.test.mjs` — subtraction/addition, quantity change, omission, valid 16→mười sáu, display text |
| P0.3 | Review findings could be unresolved without blocking | Findings had no required status/resolution fields and `blockers` was the only blocker source. A `severity: block` finding with `status: open` and empty `blockers` passed. | Yes, reproduced with a passing review containing an open block finding. | `tests/narration.test.mjs` — unresolved blocking finding |
| P0.4 | Independent review was advice only | No schema field, no risk inference and no enforcement for high-risk claims/quality-sensitive work. | Yes: a high-risk claim with an author-only self-review passed the old gate. | `tests/narration.test.mjs` — fake self-review and high-risk pass-with-independent tests |
| P1.1 | Data root was inconsistent/incomplete | The plugin resolved configured roots relative to the package; CLIs used only `VIDEO_STUDIO_ROOT` and often the cwd; no shared config file; npm `files` omitted `library/**`; no initialization copied built-ins to an external root. | Yes: an external data root plus a different cwd produced different roots, and the npm tarball had no `library` at all. | `tests/plugin.test.mjs`, `tests/workspace.test.mjs`, fresh npm-package test |
| P1.2 | First scene promotion failed on an empty library | `promote-scene.mjs` read `library/catalog.json` and created `library/scenes/<id>` without ensuring parents/catalog; no staging, no hashes, no rollback. | Yes: the empty library raised `ENOENT` on the catalog. | `tests/promote.test.mjs` — first promotion, invalid QA, collision |
| P1.3 | Lint was treated as release | `validate-episode.mjs` returned `ok` for a scaffold with zero scenes and no output. There was no release-specific check for master/QA/hash/audio consistency. | Yes: a fresh episode returned `ok: true` with zero scenes/output. | `tests/release.test.mjs` — fresh episode INCOMPLETE; silent/text-only PASS; fake master rejected |
| P1.4 | Audio preflight equated GPU presence with readiness | Preflight probed `nvidia-smi` only; no provider/device/sample, no voice-reference check, no bounded TTS/ASR wrapper, no targeted numeric QA. | Yes: `nvidia-smi` was reported as a tool while no TTS provider was installed, and there was no concept of readiness. | `tests/audio.test.mjs` — hardware ≠ provider; GPU refusal; sample gating; reference checks |
| P1.5 | Metrics were manually estimated | There was no log collector. `metrics.json` was a hand-written scaffold and reports described estimates. | Yes: the scaffold had empty phase timings and no main/worker session linkage. | `tests/metrics.test.mjs`; live read-only DSH logs smoke |
| P1.6 | Worker isolation was prompt-only; depth/concurrency conflated | The only controls were instructions and `maxDepth: 1`. No path/allowlist validation and no separate concurrency check. | Yes: a `scene-result.json` could name any changed file and nothing validated it. | `tests/workers.test.mjs` — plan/result, symlink, allowlist, depth vs concurrency |
| P2.1 | Metadata QA presented as quality QA | `qa-media.mjs` only ran ffprobe and called the result `ok`; no lint, no frozen/gap/clipping/subtitle checks. | Yes: an MP4 with no audio and frozen content passed the metadata check. | `tests/media-lint.test.mjs` — metadata vs quality, SRT, lint |
| P2.2 | Style/installation validation incomplete | Style source files were assumed present; npm package omitted style metadata; notes were not required to be substantial; duplicate refs were accepted. | Yes: a package-style project with a missing source could not validate; the tarball lacked styles. | `tests/style.test.mjs`, fresh-package test |

### Reproduction log against the legacy validator

The pre-fix validator was recovered with `git show HEAD:scripts/validate-narration.mjs` and run on two deliberately weak episodes:

```text
# False two-sided limit + all-pass self review + PASS claim check
$ node /tmp/old-validate-narration.mjs /tmp/old-gate-repro
RESULT: PASS

$ node scripts/validate-narration.mjs /tmp/old-gate-repro
ERROR: review evidence never cites section sec-01 ...
ERROR: high-confidence content problem not addressed by the review: math.limit.two-sided-qualification ...
RESULT: FAIL
```

```text
# Segment text matches the narration; spokenText changes dương -> âm
$ node /tmp/old-validate-narration.mjs <episode> --segments audio/segments.json --require-segments
RESULT: PASS

$ node scripts/validate-narration.mjs <episode> --segments audio/segments.json --require-segments
ERROR: segment seg-001 spokenText differs from text without declared pronunciation.overrides ...
ERROR: segment seg-001 spokenText changes numbers/operators/signs from the approved text ...
RESULT: FAIL
```

This confirms the two highest-risk defects were real, not inferred from the requirements.

Other reproductions:

```text
# Legacy promotion against an empty library
$ VIDEO_STUDIO_ROOT=<empty> node /tmp/old-promote/promote-scene.mjs ...
Error: ENOENT ... /library/catalog.json

# Legacy release check on a freshly scaffolded zero-scene episode
$ node /tmp/old-validate-episode.mjs <fresh episode>
{ "ok": true, "errors": [], "scenes": 0, "timedScenes": 0 }   (exit 0)
```

The new promotion creates the library idempotently; the new release gate returns `INCOMPLETE` for the same scaffold.

The old external production (`/home/vmn/code/vm/studio-data/projects/dai-so-la-gi/episodes/ep-001`) is **not recertified** by the new gate. It has a schema-v1 review and no evidence/locations; `validate-narration.mjs` now reports that as a migration requirement. Its narration and master were not touched.

## 2. Files changed

### Shared resolver, workspace and packaging

| Path | Purpose |
|---|---|
| `scripts/studio-paths.mjs` | One resolver for code/data roots (explicit → env → `studio.config.json` → package), effective paths, idempotent `ensureWorkspace`, built-in library overlay. |
| `scripts/studio-root.mjs` | Prints roots/resolution metadata; `--data-root`, `--init`. |
| `scripts/init-workspace.mjs` | Idempotent data-root initialization, including built-in styles/catalog. |
| `scripts/new-episode.mjs` | External-root support, mode-aware scaffold, production.json v2 artifacts, atomic episode commit. |
| `index.js` | Uses the shared resolver; fixed code/data header; preserves `apply`/`dataRootOf` API. |
| `package.json` | Version 0.5.0, new scripts, public library/docs/kit payload, transcript excluded. |
| `library/styles/indeterminate-forms/style.json`, `reference.external.md` | `sourceBundled:false` + `externalSource` so installed packages can resolve notes without redistributing the transcript. |

### P0 narration gates

| Path | Purpose |
|---|---|
| `scripts/lib/narration-model.mjs` | Parsing, sections/paragraphs, hashing, excerpt locating, claim signals, modes. |
| `scripts/lib/narration-integrity.mjs` | Mechanical gate: schemas, hash, refs, claims/locations, through-line, review evidence, independent review, segments, pronunciations. |
| `scripts/lib/narration-editorial.mjs` | Editorial gate: evidence-based criteria, full-section citation, finding resolution, high-confidence defect handling. |
| `scripts/lib/editorial-heuristics.mjs` | Conservative anti-pattern triage (forced opening, digression, repetition, unexplained identity switch, two-sided limit, address drift). |
| `scripts/lib/pronunciation.mjs` | Vietnamese numbers/operators fingerprint, override reconstruction, semantic comparison. |
| `scripts/validate-narration.mjs` | Orchestrates `--integrity`/`--editorial`/`--gate`; legacy-compatible exports. |
| `scripts/editorial-review.mjs` | Independent reviewer pre-scan; never writes PASS. |
| `scripts/revise-narration.mjs` | Archived revisions, blocked review, invalidated segments, stale downstream markers, released-master protection. |
| `scripts/migrate-narration.mjs` | Blocked v2 scaffolding for legacy episodes; originals untouched. |
| `kit/throughline-map.json`, `claim-check.json`, `narration-review.json`, `segments.json`, `production.json` | Public contracts. |
| `skills/video-narration/**` | 9-step editorial workflow, through-line, independent review, schemas, Vietnamese teaching pattern. |

### P1 release, audio, metrics, workers, QA

| Path | Purpose |
|---|---|
| `scripts/validate-episode.mjs` | Mode-aware lint vs strict release; master ffprobe/hash; QA binding; scene QA; audio/timeline checks. |
| `scripts/promote-scene.mjs` | Empty-library safe, staged atomic promotion, QA/ID/reference validation, hashes/version/backend. |
| `scripts/preflight.mjs` | Provider candidates, hardware vs provider readiness, ASR candidates. |
| `scripts/audio-preflight.mjs` | Actual provider/device probe, voice-reference checks, sample synthesis with timeouts/retries, no silent CPU fallback. |
| `scripts/qa-audio.mjs` | Numbers/operators/omissions; optional WAV silence/clipping; optional ASR evidence. |
| `scripts/lib/bounded.mjs` | Bounded subprocess execution with explicit retry policy. |
| `scripts/collect-metrics.mjs` | DSH session JSONL/zstd metrics, parent/worker inclusion, concurrency vs depth. |
| `scripts/validate-workers.mjs` | Plan concurrency/depth; result work-dir/allowlist/symlink/protected-artifact validation. |
| `scripts/qa-media.mjs` | Metadata by default; targeted quality/subtitles/duplicates; explicit cost boundary. |
| `scripts/lint-narration.mjs` | Draft-time Markdown/style lint, separate from G0. |
| `scripts/validate-style-refs.mjs` | Data-root default, sourceBundled handling, notes/rights/id/duplicate checks. |

### Skills, docs, tests

All nine `skills/*/SKILL.md` were updated together, plus the three narration references. `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/acceptance.md`, `docs/examples.md`, `docs/dsh.md`, `docs/log-based-improvements.md`, `docs/migration-v05.md`, `kit/project.json`, `kit/scene-result.json`, `cordis.patch.yml` and locale descriptions were updated.

New tests: `contracts`, `editorial-evaluation`, `pronunciation`, `audio`, `metrics`, `workers`, `promote`, `release`, `revise`, `media-lint`, plus expanded `narration`, `plugin`, `style`, `workspace`. The algebra evaluation fixture is under `tests/fixtures/editorial/algebra-la-gi/`.

## 3. Before / after behaviour

### P0.1 Mechanical vs editorial gates

**Before:** one validator checked self-reported PASS labels, hash and simple claim flags. A weak or false script could pass if the review said `pass`.

**After:**
- `--integrity` validates schema/identity/references/coverage; it never claims truth.
- `--editorial` requires per-criterion real excerpts, full-section coverage, resolved findings, cited high-risk claims and handling of high-confidence defects.
- Neither gate is described as proving mathematics. High-risk work needs a genuinely independent review.
- The false two-sided-limit fixture with an author self-review PASS now fails editorial; with a high-risk claim it also fails the independent-review requirement.

### P0.2 Through-line and narration workflow

**Before:** no artifact connected each section to the central question; the skill described a sequence but not a required map or complete-script critique.

**After:** `throughline-map.json` is required for narrated/mixed episodes. The skill has a 9-step workflow: audience/promise → map → continuous draft → full read → structural critique → factual/math audit → revise → independent review → freeze/split. The Vietnamese pattern curiosity → observation → reasoning → discovery → generalization is documented as a preference, not a rigid template; the indeterminate-forms package is a benchmark, not copy text.

### P0.3 Claims and review evidence

**Before:** a claim could be `verified: true` with no source/derivation/location; empty claims could pass; findings lacked status/resolution.

**After:** each claim needs `verified`, risk, evidence/source or derivation, and a location whose excerpt exists in the narration. High-risk claims cannot be unverified or evidence-free. Empty claims fail on claim-bearing content (numerals/percentages/display math) unless coverage is explicitly justified for a genuinely claim-free script. Findings require excerpt/section/paragraph, criterion, severity, problem, evidence, proposed fix and resolution status; open block findings fail even with empty `blockers`. A pass after more than the bounded review budget is rejected.

### P0.4 Independent review

**Before:** optional advice only.

**After:** high-risk/quality-sensitive episodes require either a genuinely independent primary reviewer or an `independentReview` with a matching hash, reviewer identity, summary and cited evidence. The reviewer must not be the author and must not write scenes/TTS/render. The validator cannot verify honesty, but the evidence and attribution are explicit.

### P0.5 Spoken pronunciation

**Before:** any non-empty `spokenText` was accepted.

**After:** `spokenText` must be reconstructible from declared overrides with provenance/justification. Semantic fingerprints compare numbers, operators and signs. `16` → “mười sáu” and `%` → “phần trăm” are valid; `trừ` → `cộng`, a changed number, a sign flip or an omitted quantity is rejected even with `reviewed: true`. Ambiguous meaning-preserving changes need review fields. `displayText` must equal canonical `text`. Revisions archive the old script, block the review, move the old segment manifest and mark downstream files stale; a released master needs explicit authorization.

### P1.1 Roots, installation and initialization

**Before:** plugin and CLIs could resolve different roots; external/cwd cases failed; npm package had no library; no initialization.

**After:** one shared precedence (explicit → env → config file → package) across plugin and CLIs. Code and data roots are distinct in the skill header. `init-workspace.mjs` and `new-episode.mjs` are idempotent and copy missing built-in styles/catalog; external data roots work from any cwd. The npm tarball includes public style metadata/notes, catalog and contracts, excludes the user transcript/tests/projects, and a clean extracted tarball initializes and resolves the built-in style package.

### P1.2 Scene promotion

**Before:** ENOENT on empty library, no parent creation, direct copy, no rollback, no hashes/version/backend, no QA reference checks.

**After:** parents/catalog are created safely; QA is validated for PASS/contradictions/blockers/missing evidence paths; collisions and project escapes are rejected; files are staged with SHA-256; the scene directory and catalog update atomically; a failure leaves the old catalog byte-identical. Entries record source/preview/QA hashes, `templateVersion`, backend compatibility, source episode and limitations.

### P1.3 Modes and release

**Before:** every episode implied narration; zero-scene scaffold could release PASS; no master/QA consistency.

**After:** `production.json.mode` supports narrated/silent/text-only/mixed. Silent/text-only have no fake narration and use visual/media QA; silent and text-only release tests pass with real tiny media and QA. `--lint` is structural only; `--release` requires a real master probed by ffprobe and hash-bound QA, `qa/final.json` PASS, scene QA, narrated/mixed G0+segments+audio consistency, and no unknown stale markers. A fresh episode is INCOMPLETE; a fake master or missing QA cannot pass.

### P1.4 Audio preflight and runtime

**Before:** `nvidia-smi` presence was the only GPU signal; no provider/device/sample/reference checks; no bounded jobs; no numeric/operator audio QA.

**After:** `audio-preflight.mjs` verifies the provider command, configured device probe, voice reference (duration/format/silence/clipping) and a measured sample. `--require-gpu` refuses CPU/unknown instead of silently falling back. `scripts/lib/bounded.mjs` enforces timeouts/retry policy; `qa-audio.mjs` checks numbers/operators/omissions and optional audio silence/clipping; ASR is optional advisory evidence. Actual TTS/GPU execution was not performed.

### P1.5 Metrics

**Before:** metrics were hand-written/estimated.

**After:** `collect-metrics.mjs` reads persisted DSH session JSONL/zstd, follows `parentSession` to include scene workers, and separates wall-clock union, active turns, tool execution/union/overlap, observed model latency, multi-agent overlap, worker concurrency (vs delegation depth), tokens, cached tokens, retries, failed jobs and image reads. Missing data is `null`/`unavailable`; no manual estimates. A read-only smoke against real DSH logs found 2 sessions (1 worker), 69 image reads, cached tokens and 9,882s wall time. Fixtures verify exact arithmetic.

### P1.6 Worker isolation

**Before:** prompt-only boundaries; `maxDepth` was the only limit; no result path validation.

**After:** `validate-workers.mjs plan` reports concurrency and depth separately and enforces default 2/1. `result` requires PASS (unless explicitly allowed), checks every changed file against the assigned `work/<task-id>/` and optional allowlist, rejects protected/shared artifacts and symlink escapes, and records that this is post-hoc review, not a filesystem sandbox. Actual DSH child sandbox enforcement was not exercised.

### P2 QA and maintainability

**Before:** metadata-only media QA; no narration lint; thin style errors.

**After:** `lint-narration.mjs` reports filler, visual-only deixis, raw LaTeX, long paragraphs/sentences, unexpanded abbreviations and heuristic anti-patterns without claiming G0. `qa-media.mjs` separates metadata from optional quality checks (frozen frames, silence/clipping, A/V start delta, subtitle structure, optional duplicate scan), so narration/code edits do not force a full-media pass. Style validation has data-root-aware defaults, duplicate/source/notes/rights checks and actionable messages.

## 4. Tests and actual results

Commands run from `/home/vmn/code/dsh-video-studio`:

```bash
node --check index.js
for f in scripts/*.mjs scripts/lib/*.mjs tests/*.test.mjs tests/helpers/*.mjs; do node --check "$f"; done
node --test tests/*.test.mjs
npm pack --dry-run
```

Actual results (final run, Node v24.22.1, Linux x64):

```text
ℹ tests 78
ℹ pass 78
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

(Duration varies with machine load because the suite runs `npm pack` and two tiny ffmpeg clips; pass/fail counts are the acceptance signal.)

Per file: narration 17, pronunciation 8, editorial-evaluation 3, workspace 6, release 5, promote 4, audio 8, metrics 2, workers 5, media-lint 3, style 8, plugin 5, contracts 1, revise 3.

Mandatory regression mapping:

| Requirement | Test |
|---|---|
| 1 false two-sided limit + fake self-review PASS | `tests/narration.test.mjs` |
| 2 unresolved blocking finding fails G0 | `tests/narration.test.mjs` |
| 3 missing claim verification/evidence fails | `tests/narration.test.mjs` |
| 4 spokenText subtraction→addition rejected | `tests/pronunciation.test.mjs` |
| 5 valid pronunciation remains supported | `tests/pronunciation.test.mjs` |
| 6 external data root independent of cwd | `tests/workspace.test.mjs` |
| 7 clean npm package initializes/styles resolve | `tests/workspace.test.mjs` |
| 8 first scene promotes into empty library | `tests/promote.test.mjs` |
| 9 failed promotion does not corrupt catalog | `tests/promote.test.mjs` |
| 10 new empty episode INCOMPLETE | `tests/release.test.mjs` |
| 11 silent/text-only non-narration release | `tests/release.test.mjs` |
| 12 metrics aggregate main+worker | `tests/metrics.test.mjs` |
| stale released master after revision | `tests/revise.test.mjs`, `tests/release.test.mjs` |

Editorial evaluation: `tests/editorial-evaluation.test.mjs` runs the deterministic reviewer on the reconstructed “Đại số là gì?” fixture and asserts it detects forced opening, disconnected Newton digression, repeated abstract conclusion and the unexplained `(a+b)^2 → 99×101` identity switch with exact excerpts, paragraph/section and proposed fixes. The fixture contains no `status: FAIL`; a fake self-review PASS on it fails the editorial gate. Existing high-quality Vietnamese (`narration-negative.md`) and non-mathematical documentary (`narration-documentary.md`) fixtures pass both gates.

Other smoke results:

- `npm pack --dry-run`: 65 files, ~126.3 kB package, ~434.7 kB unpacked; includes `library/catalog.json`, default/indeterminate style metadata/notes, kit contracts and docs; excludes `reference.vi.md`, `tests/`, `projects/`.
- Fresh-install test extracts the tarball outside the repo, initializes an external data root, creates an episode, resolves and validates `indeterminate-forms`, and loads `index.js` registering 9 skills with the external data root in the header.
- `node scripts/preflight.mjs --require-audio` exits 2 with `no TTS provider` and reports `providerVerified:false`, `readyForBatch:false`; `nvidia-smi` hardware is reported separately.
- `node scripts/validate-workers.mjs plan kit/worker-plan.json --json`: PASS with max concurrency 2 and depth 1.
- `node scripts/collect-metrics.mjs --session 80252bc0-...`: 2 sessions (1 worker), separate wall/tool/model, cached tokens, 69 image reads, max worker concurrency 1, max delegation depth 1.
- Tiny synthetic MP4 tests exercise release/media QA without claiming a production render.

`git diff --check` reports no whitespace errors.

## 5. Updated G0 flow and trust boundaries

```text
intake (audience/mode/risk/sources)
  → throughline-map.json (central question, promise, section purpose/connection/position/takeaway)
  → continuous narration.md
  → claim-check.json v2 (verified, risk, evidence/derivation, narration location, coverage)
  → editorial critique + targeted revision
  → independent review if high-risk/quality-sensitive
  → narration-review.json v2 (criteria evidence, findings/resolutions, reviewer, hash)
  → validate-narration --integrity  +  --editorial  (or default --gate)
  → frozen narration
  → segments.json v2 + pronunciation overrides
  → validate-narration --segments --require-segments
  → audio/storyboard/scenes
```

Trust boundaries:

| Layer | What it establishes | What it does **not** establish |
|---|---|---|
| Mechanical integrity | Artifact identity, schemas, reference/location existence, through-line/segment coverage, override reconstruction | Truth, quality, honesty of a citation |
| Editorial evidence | A cited review covers every section, resolves its findings and addresses high-confidence defects | That the reviewer is right or the mathematics is true |
| Independent review | A fresh, non-author process reviewed high-risk work with a matching hash | That model/human judgement is infallible; the validator cannot prove independent execution |
| Claim check | Each claim has a recorded source/derivation and a real narration location | That the source exists, is authoritative, or is correctly paraphrased |
| Pronunciation contract | Spoken integers/operators/signs/quantities match the canonical text | That the engine actually pronounces every word correctly (sample/listening required) |
| Release gate | Real master exists, ffprobe-verifiable, hash-bound QA, scene QA, audio/G0 consistency | Perceptual quality or that QA evidence was honestly produced |
| Worker validation | Declared changed files stay in work/allowlist and are not protected | OS-level containment; prompt text is not a sandbox |
| Metrics | Measured event/model/tool data from persisted logs | Provider-side compute time or unrecorded work |

## 6. Remaining limitations and unverified assumptions

- **No DSH runtime integration was exercised for this change.** The Web profile has an older link to this checkout, but this session did not reload the plugin, invoke `video-producer`, or spawn a `video-scene-worker`. Reload/install and a synthetic child test remain required; `docs/dsh.md` and `docs/acceptance.md` describe the protocol. Do not claim runtime integration from `--dump-config` or tests.
- **No real TTS/ASR/GPU inference/full render** was run. Audio-preflight and sample paths are unit-tested with injected dependencies; a real provider/voice/device sample is still required on the production machine. `--require-gpu` behavior with a real provider is unverified.
- **Editorial quality is still a semantic judgement.** The deterministic heuristics are conservative triage; they cannot prove correctness, detect every weak transition or validate satire/register. The gate enforces evidence, coverage and consistency, not truth. Fabricated sources/evidence can still pass a dishonest review; independent/human review remains the trust anchor.
- **Complex numeric pronunciation** (decimals with “phẩy”, negative decimals, unusual units) may currently be rejected by the semantic fingerprint rather than silently accepted. Rejected is safe but may require rewriting the narration or a reviewed override; integer/percentage/simple operators are covered.
- **Legacy v1 productions do not pass the new gate.** They are not recertified. `migrate-narration.mjs` writes blocked v2 scaffolding only; a real review must fill and rename it. The existing `dai-so-la-gi` production was not modified.
- **Release media verification trusts `qa/final.json` and scene QA content.** It verifies the master with ffprobe, hash binding, duration/dimensions/audio presence and structural QA records; it does not independently re-run scene visual QA or detect a fabricated QA JSON with a perfectly valid master. Full perceptual QA remains a reviewer responsibility.
- **Worker filesystem enforcement** depends on the DSH child session sandbox. `validate-workers.mjs` is post-hoc; a malicious worker could still have written outside before validation if the runtime sandbox allows it.
- **Metrics** use persisted session logs; model latency is an observed event gap including transport, not provider compute time. Cached-token fields depend on provider usage records. `.jsonl.zstd` decompression requires Node 22.15+ or a `zstd` CLI fallback; not tested on Node 20.
- **Package smoke is a tarball extraction, not a registry install.** `npm pack`/extract verifies payload and initialization, not `plugin_manager install_bundle` in a live profile. The package is private and version 0.5.0.
- **The indeterminate-forms transcript** remains excluded from the npm package for rights reasons. Installed packages ship notes and an `externalSource` explanation; a data-root copy must be supplied by the user for source reading.

## 7. Migration notes

1. New episodes: `new-episode.mjs` writes `production.json`, through-line/claim/review v2 scaffolding and no fake narration for silent/text-only.
2. Existing narrated episodes: add `production.json` (`mode:"narrated"`, `voiceOver:true`, risk) if missing; run `migrate-narration.mjs` to create `*.migrating.json` blocked artifacts; complete a genuine evidence review; rename the three files; run `validate-narration --integrity` and `--editorial`.
3. Do not bulk-convert old PASS labels. A v1 PASS is not evidence.
4. Intentional narration changes: `revise-narration.mjs --from ... --reason ...`; it archives, blocks and invalidates. Released masters need `--allow-released` and versioning.
5. Scene catalog: new entries add hashes/backend compatibility/version/source episode. Re-promote old entries before relying on them for reuse.
6. Data root: set `VIDEO_STUDIO_ROOT`/`studio.config.json`/`--data-root`; run `init-workspace.mjs` once (non-destructive). If `dataRoot` is set only in the plugin row, export the same value for CLI helpers or pass `--data-root`.
7. Contract files: `kit/` now includes production/throughline/claim/review/segments/worker-plan. `kit/scene-result.json` is FAIL by design as an example.

## 8. Acceptance matrix

| Item | Status | Evidence / caveat |
|---|---|---|
| P0.1 Separate mechanical/editorial gates | **PASS** | Validator + tests; no truth claim |
| P0.2 Through-line map + 9-step narration workflow | **PASS** | Skill/docs/contracts/validator tests |
| P0.3 Independent review for high risk | **PASS** | Validator/tests; actual subagent run NOT VERIFIED |
| P0.4 Claim/review schema v2 and finding statuses | **PASS** | Tests for missing evidence, empty claims, unresolved findings |
| P0.5 Pronunciation contract + revisions | **PASS** | Valid/invalid tests and revision invalidation tests |
| P1.1 Shared roots, external data root, init, npm styles | **PASS** | Plugin/workspace/npm-package tests |
| P1.2 Atomic scene promotion, empty library, hashes | **PASS** | Promotion tests |
| P1.3 Modes + lint/release separation | **PASS** | Release tests including fresh INCOMPLETE and silent/text-only PASS |
| P1.4 Audio provider/device/sample, bounded runtime | **PASS (logic)** | Unit tests with injected provider; real TTS/GPU NOT VERIFIED |
| P1.5 Log-based metrics | **PASS** | Fixture arithmetic + read-only real DSH session smoke |
| P1.6 Worker concurrency/depth/path validation | **PASS (logic)** | Unit tests; live child-sandbox enforcement NOT VERIFIED |
| P2 Narration lint, style errors, targeted media QA | **PASS** | Lint/style/media tests |
| Regression suite | **PASS** | 78/78 tests, 0 fail |
| Syntax checks | **PASS** | `node --check` on all runtime/tests |
| Package-content / fresh extract smoke | **PASS** | 65 files; external-root init/style/episode/skills test |
| Real TTS/GPU/ASR/speech QA | **NOT VERIFIED** | Not run by instruction |
| Full video render / master production | **NOT VERIFIED** | Not run by instruction; tiny synthetic media only |
| Live DSH plugin reload + producer/worker integration | **NOT VERIFIED** | Not exercised in this session; requires profile reload and child test |
| Legacy v1 production recertification | **NOT VERIFIED / BLOCKED BY DESIGN** | Old review lacks evidence/locations; migration scaffolding leaves it blocked |
| Fabricated-source / dishonest-review resistance | **NOT VERIFIED** | Independent/human accountability only; deterministic checks cannot prove honesty |
