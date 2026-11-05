---
name: video-intake
description: Understand a natural-language video request and source materials, determine viewers, educational claims, rights, production mode and quality constraints, and write a compact production brief. Use before scripts or scene coding for a new or revised video.
---

# Video Intake

1. Identify format, purpose, audience, language, length, references, visual tone, deadline and deliverables. Use project defaults where possible. Ask only for an essential missing source or permission; no default questionnaire. Record genre (lesson, documentary, essay, product explainer, short), intended prior knowledge and the production mode: `narrated`, `silent`, `text-only` or `mixed`.
2. Inspect primary source content. Preserve source framing; distinguish sourced statements from new teaching examples. For nonfiction, record claims requiring checking and source pages/URLs in `research-notes.md`.
3. When `project.json` lists `styleRefs`, read each `library/styles/<id>/style.json` and `notes.md` before writing the brief and run `node <studio>/scripts/validate-style-refs.mjs <project-dir>`. Record usable constraints (voice, address, pacing, example arc) in `execution-brief.md`. Treat the reference as architecture, never wording, outline, scope or fact.
4. Establish exactly one central audience question per episode where useful. Write the one-sentence promise (what the viewer understands or can do afterwards) and a preferred narrative arc. For Vietnamese educational videos favour curiosity → observation → reasoning → discovery → generalization, but choose the structure the topic and genre need.
5. Assess risk: mark `production.json.narrationRisk` as `high` and/or `qualitySensitive: true` when claims are mathematical, medical, historical, legal, financial, safety-relevant or source-contested. High risk requires an independent narration review; state that in the brief.
6. Write `request.md` preserving the user's language and hard constraints, plus `execution-brief.md` defining success, constraints, style, candidate backends, mode, risk and what remains uncertain. Include what must **not** be claimed.
7. For copyrighted material, create fresh prose/visuals and record attribution/licenses; do not build a shot-for-shot replica or long verbatim narration.
8. If a style reference is outside the project packages, record its role explicitly: architecture and voice guidance, not wording to copy. If unavailable, say so rather than implying it was read.
9. Make the modes explicit: `draft-only` stops after brief/script review; `produce` attempts a real video including QA. For `silent`/`text-only`, state that no narration is required and that visual/media QA is the gate. The narration gate applies to `narrated`/`mixed` in both modes.
