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
- [ ] `qa-audio.mjs` checks numbers/operators/omissions and optional audio silence/clipping; ASR evidence is not truth.

## Scene/render/QA
- [ ] Every scene has A/B/C, source/reference and limitations, or a documented C reason.
- [ ] First promotion into an empty library succeeds; invalid QA/collision leaves the catalog valid; hashes/version/backend are recorded.
- [ ] At most two concurrent workers; depth and concurrency are reported separately; result changed files stay inside `work/` + allowlist.
- [ ] Static/layout/timing checks pass; full-media QA is optional/targeted.
- [ ] Release gate verifies the real master, QA hash binding, scene QA, G0/audio consistency and no stale marker (`exports/master.stale.json` after a narration revision blocks until a new master is rendered).

## Metrics
- [ ] `collect-metrics.mjs` includes main and worker sessions and separates wall clock/tool/model/overlap.
- [ ] Tokens, cached tokens, retries, failed jobs and image reads are measured when present; missing fields are unavailable, not guessed.

## Explicit gaps
- [ ] The bundle does not ship a TTS provider, renderer, DOM bbox inspector or speech-quality model; these are adapters selected after preflight.
- [ ] DSH runtime integration must be exercised, not inferred from `--dump-config`.
- [ ] A full real episode has not been produced by this test suite; fixtures exercise gates with real files and logs where practical.
