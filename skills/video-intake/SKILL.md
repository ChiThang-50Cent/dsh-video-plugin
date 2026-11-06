---
name: video-intake
description: Analyze a video request and its source materials into a production brief, including audience, claims and constraints. Use for request intake or source summaries ("tóm tắt yêu cầu", "tóm tắt tài liệu nguồn", "lập brief"); use video-workspace for workspace setup.
---

# Video Intake

1. Identify format, purpose, audience, language, length, references, visual tone, deadline and deliverables. Use project defaults where possible. Ask only for an essential missing source or permission; no default questionnaire. Record genre (lesson, documentary, essay, product explainer, short), intended prior knowledge and the production mode: `narrated`, `silent`, `text-only` or `mixed`.
2. Inspect primary source content. Preserve source framing; distinguish sourced statements from new teaching examples. For nonfiction, record claims requiring checking and source pages/URLs in `research-notes.md`.
3. When `project.json` lists `styleRefs`, read each `library/styles/<id>/style.json` and `notes.md` before writing the brief and run `node <studio>/scripts/validate-style-refs.mjs <project-dir>`. Record usable constraints (voice, address, pacing, example arc) in `execution-brief.md`. Treat the reference as architecture, never wording, outline, scope or fact.
   Visual tone is separate: record the active `visualStyle` (episode `production.json` > series `project.json` > `default`) in the brief. If the user asks for a different look or supplies a reference video/screenshots, plan a visual style package per `video-workspace` (reuse an existing id, `new-visual-style --from`, or `extract-style-refs` with a rights note) and set it on the episode or series as the user intends; never plan per-scene hard-coded colours.
   For narrated/mixed work, record the selected `voicePackage` (episode > series; see `video-audio`). If none is selected and the library has no fitting voice, ask the user for a voice recording and its rights; never assume a voice.
4. Establish exactly one central audience question per episode where useful. Write the one-sentence promise (what the viewer understands or can do afterwards) and a preferred narrative arc. For Vietnamese educational videos favour curiosity → observation → reasoning → discovery → generalization, but choose the structure the topic and genre need.
5. Assess risk: mark `production.json.narrationRisk` as `high` and/or `qualitySensitive: true` when claims are mathematical, medical, historical, legal, financial, safety-relevant or source-contested. High risk requires an independent narration review; state that in the brief.
6. Write `request.md` preserving the user's language and hard constraints, plus `execution-brief.md` defining success, constraints, style, candidate backends, mode, risk and what remains uncertain. Include what must **not** be claimed.
7. For copyrighted material, create fresh prose/visuals and record attribution/licenses; do not build a shot-for-shot replica or long verbatim narration.
8. If a style reference is outside the project packages, record its role explicitly: architecture and voice guidance, not wording to copy. If unavailable, say so rather than implying it was read.
9. Make the modes explicit: `draft-only` stops after brief/script review; `produce` attempts a real video including QA. For `silent`/`text-only`, state that no narration is required and that visual/media QA is the gate. The narration gate applies to `narrated`/`mixed` in both modes.
