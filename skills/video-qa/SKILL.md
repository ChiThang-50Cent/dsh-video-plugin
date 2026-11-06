---
name: video-qa
description: Run efficient, risk-based QA for narration integrity/editorial evidence, scene code, media, timing, speech and final release. Use during changed-scene testing, integration and delivery without one AI reviewer per scene.
---

# Risk-based quality assurance

## Gates

**G0 narration (narrated/mixed only).** Two distinct checks:

```bash
node <studio>/scripts/validate-narration.mjs <episode-dir> --integrity
node <studio>/scripts/validate-narration.mjs <episode-dir> --editorial
node <studio>/scripts/validate-narration.mjs <episode-dir>   # both
```

- Integrity: schema/hash/references, through-line coverage, claim evidence and narration locations, review evidence locations, exact segment coverage, pronunciation overrides.
- Editorial: evidence-based review, full-script citation, resolved findings, high-risk independence, high-confidence defect handling.
- A PASS means the evidence is complete; it does **not** prove mathematics. Read `video-narration/references/script-review.md`; never certify a claim because prose is engaging.
- Record the review pass, criteria, hash and validator result in `qa/final.json` (or `qa/g0.json`) with the command and evidence.

**G1 static/contract.** Scene IDs, asset paths, renderer availability, keyframes within duration, valid formulas/numbers, code lint/tests where relevant.

**G2 layout.** Programmatically sample decisive timestamps; check DOM/SVG bounding boxes and off-screen clipping where a browser renderer applies. Handle explicitly allowed overlaps as risky, not automatic PASS. For footage, inspect safe area/captions.

**G3 motion/audio.** Targeted preview for C, changed B or alerts; determinism when reproducibility matters; blank/frozen frames, silence, clipping, timing drift. Model image inspection only for new visual language or unresolved warnings. Avoid repeated main+worker inspection.

**G4 final/release.** Use `node <studio>/scripts/validate-episode.mjs <episode-dir> --release`. It requires:
- a real master verified by ffprobe and by hash;
- `qa/final.json` PASS with no blockers;
- `qa/media.json` matching the current master (hash/duration/dimensions), plus scene QA;
- narrated/mixed: G0 PASS with segments, exactly one hashed and ffprobe-verified chunk per segment, measured durations and audio manifest hash/consistency;
- silent/text-only: the correct non-narration gates, no fake narration;
- timeline/master/audio consistency and no unresolved stale marker.

`--lint` (or no flag) is structural only. A freshly scaffolded episode is `INCOMPLETE`, never release PASS.

## Media QA cost boundary

`node <studio>/scripts/qa-media.mjs <video> [width] [height] [fps]` is metadata-only. Add `--quality` for frozen-frame/silence/clipping/A-V-start checks and `--subtitles <srt>` for cue structure/order/duration. `--duplicates` is explicitly expensive. Do not run full-media QA for a narration or code edit; run it on renders and delivery.
Unavailable quality checks are reported as unavailable or incomplete, not PASS; `--strict-audio` rejects unavailable audio checks.

## Mode policy

- `narrated`/`mixed`: G0 + audio QA + visual QA.
- `silent`/`text-only`: no narration gate; require visual and media QA, music/SFX loudness/rights and subtitle integrity when text is present. A mode is not an excuse to skip final media verification.

## Scope and records

A unchanged renderer/new data: schema+layout+content. B changed code: static+targeted snapshots; visual if risk. C new mechanism: workbench and targeted vision. Shared component changed: regression-check a representative dependent scene.

Records: `qa/scene/<id>.json` with gate names, timestamps, result, evidence paths, failure type; `qa/final.json` with blockers, G0 reference/hash and acceptance. Never call a scene PASS because the renderer exited 0.

Validate worker integration with `scripts/validate-workers.mjs` (plan concurrency/depth; result paths/allowlist), not prompt text. Retry only on a concrete defect; default 2 attempts/scene before escalation. Preserve failures. Use no per-scene QA subagents; one high-risk content audit at episode level is enough.
