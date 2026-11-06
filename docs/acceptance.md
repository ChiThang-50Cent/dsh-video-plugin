# Acceptance and safety test checklist

## DSH composition
- [ ] Pinned `dsh --version` prints 0.2.2-rc.1; profile resolves with Web agent presets.
- [ ] `AGENTS.md` is injected into a session in this checkout and the skill list shows all 9 skills.
- [ ] In a workspace outside this checkout, the 9 skills load and each body states the absolute code/data roots.
- [ ] `/video-produce` loads and writes request + execution brief; `video-scene-worker` is a real independent preset with no delegation tool.
- [ ] No package installation, paid services or destructive actions without authorization.

## Narration G0
- [ ] `throughline-map.json` maps every narration section, in order, with purpose/connection/position/takeaway.
- [ ] `claim-check.json` is schema v2: verified claims have evidence/derivation and a real narration location; high-risk claims cannot pass without both.
- [ ] `narration-review.json` is schema v2: all eight criteria pass with cited evidence covering every section; blockers empty; reported findings resolved; current SHA-256.
- [ ] `validate-narration.mjs <ep> --integrity` and `--editorial` each pass; a false two-sided limit with a fake self-review PASS fails editorial, and high-risk work without independent review fails integrity.
- [ ] Open blocking findings fail G0 even when `blockers` is empty; missing claim evidence/location fails.
- [ ] One spoken word change makes the hash stale and blocks audio; `revise-narration.mjs` archives the old script and invalidates segments.
- [ ] `spokenText` 16 → “mười sáu” passes with provenance; `trừ` → `cộng`, changed/omitted numbers and changed display text fail.
- [ ] `draft-only` stops after the reviewed draft; no TTS/scene worker/render.
- [ ] `silent`/`text-only` episodes have no fake narration and pass their non-narration gates.

## Workspace and data root
- [ ] `studio-root.mjs` reports distinct code/data roots and no malformed header.
- [ ] `init-workspace.mjs` is idempotent, preserves existing files and copies built-in styles/catalog.
- [ ] An external data root works from an unrelated cwd; a clean npm tarball initializes and resolves built-in styles.
- [ ] A fresh episode is lint-clean but release `INCOMPLETE`, never PASS.

## Audio
- [ ] `audio-preflight.mjs` verifies provider, device/GPU requirement, voice reference and a short sample; `nvidia-smi` alone is not readiness.
- [ ] Audio paths are episode-relative; every approved segment has exactly one hashed, probeable chunk whose measured duration fits the timeline.
- [ ] Release rejects stale artifacts and conflicting production-mode overrides; unavailable strict audio checks cannot pass.
- [ ] GPU requirement failure stops rather than silently using CPU; jobs have explicit timeout/retry policy.
- [ ] OmniVoice preflight passes `--model`/`--ref-text`; `synthesize-narration.mjs` loads the model once, refuses a CPU device, enforces per-segment and overall timeouts, and reuses only segments whose fingerprint and file hash match.
- [ ] Voice packages: `production.json.voicePackage` overrides `project.json.voicePackage`; no selection stops synthesis instead of borrowing a voice; `new-voice.mjs` rejects an unsuitable reference or missing rights/transcript and never overwrites; a package cannot be mixed with `--voice-reference`; switching or re-recording a voice re-synthesizes every segment; release fails unless `audio/manifest.json` records the selected package's current hash.
- [ ] `setup-tts.mjs` saves `tts.config.json` only after a passing sample, tests the candidate (not the saved) runtime and keeps the previous file on failure; audio commands then need no engine paths, explicit flags win and another provider's runtime is ignored. `studio-status.mjs` lists missing setup steps in order.
- [ ] `qa-audio.mjs` checks numbers/operators/omissions and optional audio silence/clipping; ASR evidence is not truth.

## Scene/render/QA
- [ ] Every scene has A/B/C, source/reference and limitations, or a documented C reason.
- [ ] First promotion into an empty library succeeds; invalid QA/collision leaves the catalog valid; hashes/version/backend are recorded.
- [ ] At most two concurrent workers; depth and concurrency are reported separately; result changed files stay inside `work/` + allowlist.
- [ ] Static/layout/timing checks pass; full-media QA is optional/targeted.
- [ ] `render-episode.mjs` renders scenes in parallel; a rerun with no change hits the cache for every scene and the normalized audio; editing one scene (or an imported module) re-renders only its dependants; `--no-cache` re-renders all.
- [ ] Narrated masters are normalized to project `audio.loudness` (default −16 LUFS / −1.5 dBTP) and `qa-media.mjs` loudness PASSes; an unnormalized master fails.
- [ ] Visual style: `production.json` overrides `project.json` overrides `default`; a workspace package shadows the built-in; invalid packages (missing core colour, id mismatch, missing/escaping font) fail with the reason; switching style restyles `api.theme` scenes without code edits and re-renders every cached scene.
- [ ] Release gate verifies the real master, QA hash binding, loudness, scene QA bound to the current `styleSha256` and (narrated/mixed) `narrationSha256`, G0/audio consistency and no stale marker (`exports/master.stale.json` after a narration revision blocks until a new master is rendered).

## Metrics
- [ ] `collect-metrics.mjs` includes main and worker sessions and separates wall clock/tool/model/overlap.
- [ ] Tokens, cached tokens, cache hit ratio, retries, failed jobs and image reads are measured when present; missing cache counters on a recorded call count as zero; calls with no usage are listed and leave the aggregate unavailable, not guessed.

## Explicit gaps
- [ ] The bundle does not ship a TTS provider, renderer, DOM bbox inspector or speech-quality model; these are adapters selected after preflight.
- [ ] DSH runtime integration must be exercised, not inferred from `--dump-config`.
- [ ] A full real episode has not been produced by this test suite; fixtures exercise gates with real files and logs where practical.
