---
name: video-scene-code
description: Implement or patch video scene code and renderer adapters. Use only for scenes that cannot be instantiated from a validated template, and for maintaining scene components, lint rules and animation tests.
---

# Scene coding contract

1. Read the assigned `scene.json`, measured timing, frozen narration segments, scene style, closest PASS scene, supported backend and output contract. Do not reread an unrelated project tree.
2. Check native tools and choose a working backend: FFmpeg for edits/compositing; Remotion or browser canvas/SVG for code animation; Blender if 3D is required. HyperFrames is optional, never assumed. Do not install packages without authorization.
3. Work only in the assigned isolated `work/<task-id>/`. Never edit shared timelines, render config, TTS manifests, narration, storyboard, catalog or another worker's output. The parent integrates changes.
4. Favor deterministic scene functions; isolate data from layout/animation; reuse theme/components; avoid hard-coded global paths. Do not read the whole script or assets outside the brief.
5. Implement checks for duration, asset existence, bounds, NaN/invalid math and animation end. For JS/TS run existing ESLint/TypeScript/format/tests; do not introduce a framework solely for lint.
6. Render just the changed scene/frames, inspect one representative contact sheet if new/complex, and stop once acceptance passes. No speculative polish loop.
7. Deliver `scene-result.json` with `sceneId`, `status`, `codePaths`, `previewPaths`, `qaReportPath`, `backendVersion`, `changedFiles`, `reuse` (`A/B/C` or `reuseFrom`), and notes/risks. Mark FAIL rather than fabricate PASS.
8. Before handing back, keep every changed file inside `work/<task-id>/` and the granted allowlist. The parent must run `node <studio>/scripts/validate-workers.mjs result <episode> <scene-result.json> --work work/<task-id> --allow 'work/<task-id>/**'`. Prompt text is not a filesystem sandbox; the DSH child session sandbox is the enforcement layer where available.

A scene worker has no subagent tool. Parent controls scheduling: at most two concurrent scene workers by default, and `maxDepth` (nesting) is a different limit from concurrency. Return exact paths and measured facts, not claims of correctness.
