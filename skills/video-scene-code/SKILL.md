---
name: video-scene-code
description: Implement custom C scene code in an assigned worker sandbox. Use for custom scene animation or coding ("code cảnh", "lập trình cảnh", "cảnh đồ thị") when templates or minimal reuse cannot meet the need; use video-reuse for A/B scenes.
---

# Scene coding contract
Use the generated worker brief verbatim as the assignment; it contains the shared contract and scene-specific inputs. Report missing prerequisites rather than guessing.

1. Read the assigned `scene.json`, measured timing, frozen narration segments, scene style, closest PASS scene, supported backend and output contract. Do not reread an unrelated project tree.
2. Use the built-in Skia adapter for code-animated 2D scenes when preflight passes; FFmpeg handles compositing and delivery. Remotion, browser canvas/SVG and Blender remain opt-in when verified and appropriate. Do not install packages without authorization.
3. Work only in the assigned isolated `work/<task-id>/`. Never edit shared timelines, render config, TTS manifests, narration, storyboard, catalog or another worker's output. The parent integrates changes.
4. Implement deterministic scene functions: export `meta = { id, durationSec, width, height, fps }` and `draw(ctx, t, api)`. Isolate data from layout/animation and reuse the provided components and project style; avoid hard-coded global paths. Do not read the whole script or assets outside the brief.
   The API offers `easing.linear`, `easing.easeInOut`, `fade(t, start, duration)`, `crossfade(t, start, duration)`, `text(text, x, y, options)`, `formula(tex, x, y, options)`, `axes(options)`, `plot(fn, options)`, `arrow(x1, y1, x2, y2, options)` and `highlight(x, y, width, height, options)`. Text and formula return bounds and baseline. Supply the project body font for Vietnamese and TeX `\text` with `--body-font <family>`.
   Render with `node <studio>/scripts/render-scene.mjs <scene.mjs> --out <scene.mp4>`; for targeted QA use `--snapshots-only --frames 0.5,4,9.5 --frames-dir <dir>` and optionally `--contact-sheet <png>`. A full render writes `<out>.render.json`.
5. Implement checks for duration, asset existence, bounds, NaN/invalid math and animation end. For JS/TS run existing ESLint/TypeScript/format/tests; do not introduce a framework solely for lint.
6. Render just the changed scene/frames, inspect one representative contact sheet if new/complex, and stop once acceptance passes. No speculative polish loop.
7. Deliver `scene-result.json` with `sceneId`, `status`, `codePaths`, `previewPaths`, `qaReportPath`, `backendVersion`, `changedFiles`, `reuse` (`A/B/C` or `reuseFrom`), and notes/risks. Mark FAIL rather than fabricate PASS.
8. Keep every changed file inside `work/<task-id>/` and the granted allowlist; report every changed file including the result file. Before dispatch the parent snapshots the wave with `node <studio>/scripts/validate-workers.mjs snapshot <episode> --task <wave-id>`, retains its printed SHA256 outside worker control and protects the baseline. After the wave it validates all results together with `node <studio>/scripts/validate-workers.mjs wave <episode> --baseline <episode>/qa/worker-baselines/<wave-id>.json --baseline-sha256 <snapshot-sha256> --result <result-a> --result <result-b> --allow 'work/<task-a>/**' --allow 'work/<task-b>/**'`. For one worker, the parent may snapshot with its sceneId and use the `result` command with `--baseline` and `--baseline-sha256`. `--skip-baseline` explicitly opts out of detecting unreported changes. Prompt text is not a filesystem sandbox; use the DSH child session sandbox where available.

A scene worker has no subagent tool. Parent controls scheduling: at most two concurrent scene workers by default, and `maxDepth` (nesting) is a different limit from concurrency. Return exact paths and measured facts, not claims of correctness.
