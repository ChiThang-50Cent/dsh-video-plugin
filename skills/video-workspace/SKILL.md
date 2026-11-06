---
name: video-workspace
description: Initialize and organize video workspaces, series, episode files, assets, caches and releases. Use for workspace setup or file organization ("tạo workspace", "tạo không gian làm việc", "quản lý dự án video"); use video-intake to summarize a request and its sources.
---

# Workspace and provenance

`AGENTS.md` owns standing instructions. Resolve `projects/`, `library/`, `.cache/` and `scripts/` against the `Studio code root` / `Studio data root` lines at the top of each skill, never the session working directory. `scripts/studio-root.mjs` prints them as JSON.

## Roots and initialization

- **Code root** is the installed plugin (skills, scripts, kit, standing rules, built-in library payload). It may be read-only when installed from npm.
- **Data root** is the user's production data. It defaults to the code root and can be set with `--data-root`, `VIDEO_STUDIO_ROOT`, or `studio.config.json`; one resolver is shared by the plugin and every CLI helper.
- Initialize idempotently: `node <studio>/scripts/init-workspace.mjs [--data-root <dir>]`. It creates `projects/`, `library/`, `library/styles/`, `library/scenes/`, `library/templates/`, `.cache/`, a catalog and missing built-in style files. Existing files are never overwritten.
- `new-episode.mjs` runs the same initialization, so an npm-installed plugin with an external data root starts cleanly. A project is `projects/<slug>/`; an episode is `projects/<slug>/episodes/<ep-id>/`.

## Episode artifacts

`production.json` (mode/risk), `request.md`, `execution-brief.md`, `throughline-map.json` + `narration.md` + `claim-check.json` + `narration-review.json` (narrated/mixed), `visual-brief.md` (silent/text-only), `storyboard.json`, `timeline.json`, `scenes/`, immutable `assets/original/`, `audio/segments.json` + `audio/manifest.json` + WAVs, `qa/`, `reports/`, `exports/master.*`, and `work/` scratch.

Narration revisions use `scripts/revise-narration.mjs`; it writes `narration-revisions/` and marks downstream artifacts stale. Never hand-edit a frozen script and never delete a released master or accepted audio.

Reusable catalog, templates, components and previews live under `library/`; it is not an output dump. Style packages are `library/styles/<id>/` with `style.json`, source reference (or `sourceBundled: false` + `externalSource`), and `notes.md`. A project opts in with `project.json.styleRefs`; validate with `scripts/validate-style-refs.mjs <project-dir>`. Reference material stays in the library, never in `skills/` or the installed bundle.

## Modes and releases

`narrated`/`mixed` require G0; `silent`/`text-only` intentionally have no narration and must not be given fake audio. Release with `scripts/validate-episode.mjs <episode> --release`; `--lint` is work-in-progress only. A new episode is `INCOMPLETE`, not delivered.

## Reuse, resume and cleanup

If the user asks for another series, create a new project and retain the shared `library/`. To resume, read `report.json`, manifests, review status and QA, then rebuild only invalid stages. Prefix an accepted master before re-rendering; never overwrite without versioning. Episode `work/` is scratch; `.cache/` is content-addressed. Neither should be required to recreate an accepted master if sources and external dependencies remain. Do not mutate external originals or delete source/voice/accepted output. Compare hashes and dependents, never just filenames.

Only promote a scene after reproducible QA, a clear parameter schema and a future-reuse reason. Avoid a taxonomy so deep that every new episode needs a new directory type.
