---
name: video-scene-code
description: Implement or patch video scene code and renderer adapters. Use only for scenes that cannot be instantiated from an existing validated template, and for maintaining scene components, lint rules and animation tests.
---

# Scene coding contract

1. Read the assigned `scene.json`, measured timing, scene style, closest PASS scene, supported backend, and output contract. Do not reread an unrelated project tree.
2. Check native tools and choose a working backend: FFmpeg for edits/compositing; Remotion or browser canvas/SVG for code animation; Blender if 3D is required. HyperFrames is optional, never assumed. Do not install packages without authorization.
3. Work only in assigned isolated `work/<task-id>/`. Never edit shared timelines, render config, TTS manifests, catalog or other worker output. Parent integrates changes.
4. Favor pure deterministic scene functions; isolate data from layout/animation; reuse theme and components; avoid hard-coded global paths.
5. Implement checks for scene duration, asset existence, bounds, NaN/invalid math and animation end. For JS/TS run existing ESLint/TypeScript/formatting/tests; do not introduce a new framework solely for lint.
6. Render just the changed scene/frames, inspect one representative contact sheet if new/complex, and stop once acceptance passes. No speculative polishing loop.
7. Deliver `scene-result.json` with paths, backend/version, code diff summary, usage of reuse, changed files, commands/test results, key frames and outstanding risks. Mark FAIL rather than fabricate a PASS.

A scene worker has no subagent tool. All subagent count and scheduling is controlled by parent, maximum two concurrent workers by default.
