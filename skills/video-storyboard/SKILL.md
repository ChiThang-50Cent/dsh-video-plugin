---
name: video-storyboard
description: Map frozen, reviewed narration into visual beats and shot specifications for any video genre. Use when creating scene plans, shot lists, motion concepts, b-roll plans, or edit decisions before coding or rendering.
---

# Storyboard and shot design

Inputs: frozen `narration.md`, `narration-review.json` with `status: "pass"` and the current hash, `audio/segments.json` when it exists, sources, project style, asset inventory and the scene library. **Do not rewrite the narrated story while dividing beats.**

1. Confirm the gate: the review hash matches `narration.md`, and `node <studio>/scripts/validate-narration.mjs <episode-dir>` passes. If not, stop and return the blocker to the producer. A scene plan built on a draft or stale narration is waste.
2. Create semantic beats, not sentence-to-scene mappings. Each beat has a unique ID, the narration segment IDs or prose spans it covers, a learning or emotional purpose, the intended on-screen action, timing dependency, and accessibility/caption notes. One scene may cover several sentences; one sentence may need several beats.
3. Choose a meaningful visual form for the beat: existing footage/photo, typography, formula, 2D/3D animation, graph, diagram, map, or demonstration. Avoid animating every sentence mechanically; avoid a slide per formula.
4. Produce `storyboard.json` with `scenes[]`, each holding `id`, `kind`, `beatIds`, `narrationSegments` (IDs or spans), `visualGoal`, `visualSpec`, `assets`, `renderer`, `reuseClass`, `reuseFrom`, `qaRisk`.
5. Consult `video-reuse` BEFORE authoring new code. Each scene A/B/C needs a reason and a reference. Prefer grouping that matches visual ideas, not narration segments or paragraph boundaries.
6. After WAVs are measured, update `timeline.json` with exact starts/durations; no animation keyframe beyond its scene duration.
7. If narration later changes, only the scenes whose segments/spans changed are stale; propose a re-plan of those to the producer. Never edit `narration.md` yourself.
8. Identify 3-5 decisive timestamps per new complex scene for automatic geometry/snapshot QA. Base scenes may need fewer checks.
