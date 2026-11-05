---
name: video-intake
description: Understand a natural-language video request and source materials, determine intended viewers, educational claims, rights and quality constraints, and write a compact production brief. Use before scripts or scene coding for a new or revised video.
---

# Video Intake

1. Identify format, purpose, audience, language, length, references, visual tone, deadline, and deliverables. Use project defaults where possible. Ask only for an essential absent source or permission; no default questionnaire. Record the genre (lesson, documentary, essay, product explainer, short) and the intended prior knowledge, because narration style depends on both.
2. Inspect primary source content. Preserve the source framing, distinguish sourced statements from new teaching examples. For nonfiction, record claims requiring checking and source pages/URLs in `research-notes.md`.
3. When the project's `project.json` lists `styleRefs`, read each `library/styles/<id>/style.json` and its `notes.md` before writing the brief, and run `node <studio>/scripts/validate-style-refs.mjs <project-dir>`. Record the usable constraints (voice, address form, pacing, example arc) in `execution-brief.md`. Treat the reference as architecture: never copy its wording, outline, scope or factual claims, and never paste it into a skill.
4. Establish exactly one central audience question per episode where useful; choose the best storytelling structure for the topic, not the same gimmick for every film.
5. Write `request.md` preserving the user's own language and hard constraints, plus `execution-brief.md` defining success/constraints/style/candidate backends and what remains uncertain.
6. For copyrighted material, create fresh prose and visuals and record attribution/licenses; do not build a shot-for-shot replica or long verbatim narration.
7. If the user supplies a style reference outside the project's style packages, record its role explicitly: architecture and voice guidance, not wording to copy. If the file is unavailable, say so rather than implying it was read.
8. Make the two modes explicit: `draft-only` stops after brief/script review; `produce` attempts an actual video including QA. The narration gate applies in both modes.
