---
name: video-produce
description: Coordinate creation, revision, or full production of any video. Invoke when the user wants a finished video, episode, short, explainer, documentary, or video series; drive narration-first production with two G0 gates, risk-based QA and a strict release check, without binding to a renderer.
---

# Video Produce: coordinator

You are the ONE accountable producer. A skill is a procedure, not another agent. The actual subagent is spawned with a DSH Agent Preset if one is configured.

## Contract

1. Read `AGENTS.md` at the studio code root named in each skill header, the project `project.json`/style and `production.json`. Use `video-intake` to normalize the natural-language request; do not ask for facts the source already supplies.
2. Create `request.md` and `execution-brief.md` in a NEW episode. Choose `draft-only`/`produce` and the production mode: `narrated`, `silent`, `text-only` or `mixed`. Silent/text-only modes must **not** create fake narration; they use visual/audio QA instead.
3. **Narration first, two gates.** For narrated/mixed, invoke `video-narration`: through-line map → continuous draft → claim audit → editorial pass → independent review when risk requires it → freeze. The producer owns G0 even if a subagent wrote the draft:
   - `throughline-map.json`, `claim-check.json` (schema v2) and `narration-review.json` (schema v2) are present;
   - the review is `status: "pass"`, empty `blockers`, all eight criteria pass with cited evidence, all blocking findings resolved, matching SHA-256;
   - `node <studio>/scripts/validate-narration.mjs <episode-dir>` exits 0.
   Run `--integrity` and `--editorial` separately when a failure is ambiguous; the default runs both. **Do not call `video-audio`, implement scenes or dispatch workers before G0 passes.** In `draft-only`, stop here and deliver the reviewed draft plus unresolved issues.
4. Invoke `video-storyboard` on the frozen narration/through-line. It maps prose into visual beats and references narration segments; it does not rewrite the story. Invoke `video-reuse` to classify every shot A template, B copy/patch or C custom, with a `reuseFrom` or a reason none exists.
5. `audio-preflight` before batch speech: verify the actual provider/device, voice reference and a short synthesis sample; use bounded timeouts/retries; never accept `nvidia-smi` as provider readiness and never silently fall back from GPU to CPU. Then invoke `video-audio` to segment the frozen prose without paraphrasing, synthesize changed clips, measure real WAVs and freeze `timeline.json`. Re-run `validate-narration.mjs --segments audio/segments.json --require-segments` after segment changes.
6. Generate A scenes programmatically, B by minimal patch. For independent C tasks, dispatch at most **two concurrent** `video-scene-worker` subagents. Nesting depth is not concurrency: `maxDepth` limits recursion, the two-worker cap limits simultaneous children. Validate the plan and every worker result before integration:
   `node <studio>/scripts/validate-workers.mjs plan <plan.json>`
   Before dispatching a wave, run `node <studio>/scripts/validate-workers.mjs snapshot <episode> --task <wave-id>` and retain its printed SHA256 outside the worker's control; protect `qa/worker-baselines/<wave-id>.json` from worker writes. After all wave workers finish, validate their results together:
   `node <studio>/scripts/validate-workers.mjs wave <episode> --baseline <episode>/qa/worker-baselines/<wave-id>.json --baseline-sha256 <snapshot-sha256> --result <result-a.json> --result <result-b.json> --allow 'work/<scene-a>/**' --allow 'work/<scene-b>/**'`
   Each result must report every changed file it owns, including its result file. The full-episode diff rejects unreported or multiply reported writes and files outside the reporting worker's directory or the allowlist. Do not modify other episode files during the wave. For a single worker, snapshot with its sceneId and use `result <episode> <scene-result.json> --baseline <episode>/qa/worker-baselines/<scene>.json --baseline-sha256 <snapshot-sha256> --work work/<scene> --allow 'work/<scene>/**'`; `--skip-baseline` explicitly opts out of detecting unreported changes. Diffs cannot identify the process that wrote a file: use the child session sandbox to restrict each worker and protect the baseline. The main agent owns the global timeline, assets manifest, library promotion and narration.
7. Invoke `video-qa` on changed scenes, integration and one delivery render. For narrated/mixed, run G0 at release; for every mode, require real media QA. Run another full render only to fix a demonstrated defect.
   Before final encoding, run `node <studio>/scripts/preflight.mjs` in the render execution context and use its recommended encoder (`h264_nvenc` only after a real NVENC encode passes; otherwise `libx264`). Report any CPU encode and its reason in the production report.
8. Release only through the strict gate:
   `node <studio>/scripts/validate-episode.mjs <episode-dir> --release`
   It requires a real master verified by ffprobe, `qa/final.json` PASS, `qa/media.json` bound by hash, scene QA, narration/audio/timeline consistency, and no unreleased stale markers. `--lint` is only a work-in-progress structural check; never report it as delivery.
9. Complete `reports/production-report.md` and `report.json`: measured wall time (not estimates), model/tool usage from `node <studio>/scripts/collect-metrics.mjs`, A/B/C, QA calls, retries, narration passes, blocked issues, TTS cache invalidations, final master path/hash.

## Gate rules

- G0 is the evidence-based review plus deterministic integrity checks, not a model's confidence. Good prose never certifies a false claim.
- A narration edit after review is stale by definition. Use `scripts/revise-narration.mjs <episode> --from <file> --reason "..."`; it archives the old script, blocks the review and invalidates segments. Never hand-edit a frozen narration.
- Scene/storyboard workers may propose dialogue changes but cannot edit approved narration. Integrate only a child whose declared paths are inside its `work/` allowlist and whose scene result validates.
- Do not regenerate completed narration, valid TTS or an accepted master because a scene or layout changed.
- Release status `INCOMPLETE` is not a defect report: it means the deliverable/QA is not there yet. Do not label it PASS, and do not call a fresh scaffold "done".

## Scheduling

- No n QA agents for n coding agents. QA is primarily executable checks; model visual review only for new/risky/failed scenes.
- Do not use DSH `workflow` for one or two delegations; invoke `subagent` directly. Use workflows only for large, explicitly requested fan-out.
- A worker gets: one scene spec, relevant frozen segments/timing, 1-2 closest PASS examples, allowed `work/` paths, and the acceptance contract. Do not send the whole script or unrelated assets.
- Observe completion notifications; do not poll while idle.

## Failure policy

- Missing source: ask for only the essential document or state the uncertainty; never invent references.
- Missing renderer/TTS: choose a verified backend or stop with an actionable prerequisite. No silent CPU fallback, no unsupported renderer assumption.
- Blocked narration: deliver the evidence, the blocker and the specific decision/source needed. Do not synthesize to "save time".
- Resumption: read manifests, hashes, review status and QA; reuse valid outputs and never erase an accepted master.
- Keep assertions about supported DSH versions separate from backend capabilities.
