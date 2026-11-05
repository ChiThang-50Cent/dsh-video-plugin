---
name: video-workspace
description: Organize portable multi-series video workspaces, episode sources, reusable assets, generated outputs, caches, worker sandboxes and release files. Use when starting a project, resuming production, publishing a finished video or safely cleaning intermediates.
---

# Workspace and provenance

`AGENTS.md` owns standing instructions. Each project lives under `projects/<slug>/`, episode under `projects/<slug>/episodes/<episode-id>/`. Resolve these paths against the `Studio code` / `Studio data root` lines at the top of this skill, never against the session working directory; `scripts/studio-root.mjs` prints them as JSON.

Episode canonical files: `request.md`, `execution-brief.md`, `narration.md`, `claim-check.json`, `storyboard.json`, `timeline.json`, `scenes/`, `assets/original/`, `audio/manifest.json`, `qa/`, `reports/`, `exports/master.mp4`.

Reusable catalog, templates, components and preview references live under `library/`; `library` is not an output dump. Narration style packages live in `library/styles/<id>/` (`style.json`, source reference, `notes.md`) and a project opts in with `project.json.styleRefs`; validate with `scripts/validate-style-refs.mjs <project-dir>`. Reference material stays in the library, never in `skills/` or the shipped bundle. Episode `work/` is scratch, globally shared `.cache/` is content-addressed; neither should be required to recreate accepted master if source+external dependencies are preserved.

Do not mutate external originals or delete source/voice/accepted output. Retain exact versions and hashes for reproducibility. Never assume two files with the same filename are duplicates; compare hashes and dependents first.

If user asks for another series, start a new project retaining existing shared `library/`. If asked to resume, read `report.json`, manifests, and QA, then rebuild only invalid stages. If moving paths, preserve compatibility and verify master hash.

Only promote a scene to shared library after reproducible QA pass, clear parameter schema and a reason for future reuse. Do not create a taxonomy so deep that every new episode needs a new directory type.
