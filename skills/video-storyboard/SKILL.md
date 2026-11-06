---
name: video-storyboard
description: Map frozen, reviewed narration and its through-line into visual beats and shot specifications for any video genre. Use for scene plans, shot lists, motion concepts, b-roll plans or edit decisions before coding or rendering.
---

# Storyboard and shot design

Inputs: frozen `narration.md`, `narration-review.json` with `status: "pass"` and the current hash, `throughline-map.json`, `audio/segments.json` when it exists, sources, project style, asset inventory and the scene library. **Do not rewrite the narrated story while dividing beats.**

1. Confirm the gate: the review hash matches `narration.md` and `node <studio>/scripts/validate-narration.mjs <episode-dir>` passes. If it fails, stop and return the blocker. A plan built on a draft or stale narration is waste.
2. Read the through-line map. Each beat inherits a section purpose/connection from it; do not invent a visual thesis that contradicts the spoken one.
3. Create semantic beats, not sentence-to-scene mappings. Each beat has a unique ID, the narration segment IDs or prose spans it covers, a learning/emotional purpose, intended on-screen action, timing dependency, and accessibility/caption notes. One scene may cover several sentences; one sentence may need several beats.
4. Choose a visual form that does the work: existing footage/photo, typography, formula, 2D/3D animation, graph, diagram, map or demonstration. Avoid animating every sentence and a slide per formula.
5. Produce `storyboard.json` with `scenes[]`: `id`, `kind`, `beatIds`, `narrationSegments`, `visualGoal`, `visualSpec`, `assets`, `renderer`, `reuseClass`, `reuseFrom`, `qaRisk`, optional `durationSec`.
6. Consult `video-reuse` BEFORE authoring new code. Every A/B/C needs a reason and a reference; B needs `reuseFrom`.
7. After WAVs are measured, update `timeline.json` with exact starts/durations. No keyframe beyond its scene duration; no scene after the film.
8. For `silent`/`text-only`, build from `visual-brief.md`/the brief and do not require narration. For `mixed`, map voiced and unvoiced sections explicitly.
9. If narration changes through `scripts/revise-narration.mjs`, only scenes whose spans changed are stale. Propose a re-plan of those; never edit `narration.md`.
10. Identify 3-5 decisive timestamps per new complex scene for geometry/snapshot QA. Base scenes may need fewer.

Keep visual intent separate from backend implementation. For code-animated 2D scenes, plan for the built-in Skia adapter when preflight passes; FFmpeg handles compositing and delivery. Other verified engines are opt-in. A scene whose backend is unavailable is not reusable until an adapter exists.
