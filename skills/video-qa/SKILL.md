---
name: video-qa
description: Run efficient, risk-based video QA for script correctness, narration quality, scene code, screenshots, timing, speech and final MP4. Use during changed-scene testing, integration verification and delivery without one independent AI reviewer per scene.
---

# Risk-based quality assurance

## Gates

**G0 script and source.** Run before any voice synthesis or scene implementation.
- Execute `node <studio>/scripts/validate-narration.mjs <episode-dir>` (add `--segments` after audio planning). It must pass: review `status: "pass"`, empty `blockers`, matching SHA-256, `claim-check.json` PASS, no critical unverified claim, and segment coverage when segments exist.
- Judge the script itself, not its visuals: use the rubric in `video-narration/references/script-review.md`. A beautiful scene does not compensate for weak or wrong narration.
- A blocked review, a stale hash, or a missing essential source is a blocker. Name the exact claim/paragraph and the correction; never certify a claim because the prose is engaging.
- Record the review pass, criteria, blockers and validator result in `qa/final.json` (or `qa/g0.json` when the episode has one). Do not proceed to G1-G4 audio work on a blocked narration.

**G1 static/contract.** Scene JSON IDs, asset paths, renderer availability, animation keyframes within duration, valid formulas/numbers, code lint/tests where relevant.

**G2 layout.** Programmatically sample decisive timestamps, check DOM/SVG bounding boxes and off-screen clipping with Playwright/browser API where applicable. Handle explicitly allowed overlaps as risky, not automatic PASS. For footage, inspect safe area/captions.

**G3 motion/audio.** Targeted scene preview for C, changed B or alerts; determinism test when reproducibility matters; detect blank frames, silence/clipping, timing drift. Model image inspection only for new visual language, unresolved warnings, or likely hard-to-detect issues. Avoid repeated main+worker inspection.

**G4 final.** Inspect duration, fps, resolution, video/audio codecs, subtitle cue ordering, A/V sync, scene transitions, first and last frames, no major black/silent gaps. Use `ffprobe`, existing render tests and human or AI review of one film contact sheet.

## Scope policy

A unchanged renderer, new data: fast schema+layout+content checks.
B changed code: static+targeted snapshots; visual if risk.
C new mechanism: full scene workbench and targeted vision.
Shared component changed: regression-check each dependent representative scene before promotion.

Records: machine-readable `qa/scene/<id>.json` with gate names, timestamps, result, evidencePaths, failureType. `qa/final.json` contains blockers, the G0 review reference/hash, and final acceptance. Never call a scene PASS purely because the renderer command exited 0.

Retry only on a concrete defect. Bound retries (default 2 per scene before escalation). Preserve failure history. Use no n QA subagents: a single high-risk content audit may be requested at episode level, not one per coding worker.
