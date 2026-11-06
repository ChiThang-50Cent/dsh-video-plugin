---
name: video-workspace
description: Initialize and organize video workspaces, series, episode files, assets, caches and releases, and explain how to use the studio. Use for workspace setup, first-time setup, file organization or usage questions ("how do I use this", "getting started", "hướng dẫn sử dụng", "bắt đầu thế nào", "tạo workspace", "quản lý dự án video"); use video-intake to summarize a request and its sources.
---

# Workspace and provenance

`AGENTS.md` owns standing instructions. Resolve `projects/`, `library/`, `.cache/` and `scripts/` against the `Studio code root` / `Studio data root` lines at the top of each skill, never the session working directory. `scripts/studio-root.mjs` prints them as JSON.

## Usage questions and first-time setup

When the user asks how to use the studio or what to do next, run `node <studio>/scripts/studio-status.mjs` (read-only), read `docs/getting-started.md` at the code root, and answer for this machine: say what is already set up, then give only the missing steps from `nextSteps` with the exact commands. Do not recite the whole guide. Speech setup is `setup-tts.mjs` once per machine (writes `<dataRoot>/tts.config.json` only after a passing sample) and `new-voice.mjs` once per narrator; never run a setup step that installs packages or changes `$DSH_HOME` without the user's approval.

## Roots and initialization

- **Code root** is the installed plugin (skills, scripts, kit, standing rules, built-in library payload). It may be read-only when installed from npm.
- **Data root** is the user's production data. It defaults to the session workspace (or the nearest ancestor containing `library/catalog.json`) and can be overridden with `--data-root`, `VIDEO_STUDIO_ROOT`, or `studio.config.json`; one resolver is shared by the plugin and every CLI helper.
- Initialize idempotently: `node <studio>/scripts/init-workspace.mjs [--data-root <dir>]`. It creates `projects/`, `library/`, `library/styles/`, `library/scenes/`, `library/templates/`, `.cache/`, a catalog and missing built-in style files. Existing files are never overwritten.
- `new-episode.mjs` runs the same initialization, so a fresh workspace needs no separate init step. A project is `projects/<slug>/`; an episode is `projects/<slug>/episodes/<ep-id>/`.

## Episode artifacts

`production.json` (mode/risk), `request.md`, `execution-brief.md`, `throughline-map.json` + `narration.md` + `claim-check.json` + `narration-review.json` (narrated/mixed), `visual-brief.md` (silent/text-only), `storyboard.json`, `timeline.json`, `scenes/`, immutable `assets/original/`, `audio/segments.json` + `audio/manifest.json` + WAVs, `qa/`, `reports/`, `exports/master.*`, and `work/` scratch.

Narration revisions use `scripts/revise-narration.mjs`; it writes `narration-revisions/` and marks downstream artifacts stale. Never hand-edit a frozen script and never delete a released master or accepted audio.

Reusable catalog, templates, components and previews live under `library/`; it is not an output dump. Narration style packages are `library/styles/<id>/` with `style.json`, source reference (or `sourceBundled: false` + `externalSource`), and `notes.md`. A project opts in with `project.json.styleRefs`; validate with `scripts/validate-style-refs.mjs <project-dir>`. Reference material stays in the library, never in `skills/` or the installed bundle.

Narrator voices are packages `library/voices/<id>/` (reference WAV, exact transcript, language, rights; see `library/voices/README.md` at the code root), selected by `production.json.voicePackage` > `project.json.voicePackage`, with no default. Add one with `node <studio>/scripts/new-voice.mjs <id> --reference <wav> --ref-text "<exact words>" --rights "<note>"`; switch by changing `voicePackage` and re-synthesizing; delete only once nothing references it. Never copy a voice into `skills/` or the bundle.

Visual looks are separate packages `library/visual-styles/<id>/` (`style.json` tokens, `fonts/`, `refs/`, `notes.md`; see `library/visual-styles/README.md` at the code root). Selection: `production.json.visualStyle` (this episode) > `project.json.visualStyle` (the series) > built-in `default`. To change the look:

- reuse an existing look: set `visualStyle` on the project (whole series) or on one episode's `production.json` (one-off);
- derive a new one: `node <studio>/scripts/new-visual-style.mjs <id> --from <existing>`, edit its tokens, optionally add OFL fonts under `fonts/` declared in `style.json.fonts`;
- start from a reference the user gives (video/screenshots, already on disk): first create the package (`new-visual-style.mjs <id> --from <closest-existing>`), then `node <studio>/scripts/extract-style-refs.mjs <id> <files...> --rights "<owner and permitted use>"`, read `refs/contact.png` and the palette in `refs/refs.json`, then set tokens. Take mood, palette and typography direction; never clone a third-party design;
- then re-render (`render-episode` re-renders exactly the scenes whose style hash changed) and re-run scene QA so each `qa/scene/<id>.json` records the new `styleSha256`. A released master stays untouched; render the restyled cut to a new output path.

## Modes and releases

`narrated`/`mixed` require G0; `silent`/`text-only` intentionally have no narration and must not be given fake audio. Release with `scripts/validate-episode.mjs <episode> --release`; `--lint` is work-in-progress only. A new episode is `INCOMPLETE`, not delivered.

## Reuse, resume and cleanup

If the user asks for another series, create a new project and retain the shared `library/`. To resume, read `report.json`, manifests, review status and QA, then rebuild only invalid stages. Prefix an accepted master before re-rendering; never overwrite without versioning. Episode `work/` is scratch; `.cache/` is content-addressed. Neither should be required to recreate an accepted master if sources and external dependencies remain. Do not mutate external originals or delete source/voice/accepted output. Compare hashes and dependents, never just filenames.

Only promote a scene after reproducible QA, a clear parameter schema and a future-reuse reason. Avoid a taxonomy so deep that every new episode needs a new directory type.
