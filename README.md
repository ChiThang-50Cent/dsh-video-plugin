# Portable Video Studio for DeepSeek Harness v0.2.2-rc.1

This repository is two things in one checkout: an installable **DSH bundle** that adds two Agent Presets (`video-producer`, `video-scene-worker`), and a portable **video-studio workspace** with nine skills, contract examples, deterministic helpers and a per-episode tree. It is backend-agnostic and starts on a fresh machine; no `math-motion` project, HyperFrames, OmniVoice, Python runtime, or particular video genre is required.

## Contents

- `package.json`, `index.js`, `cordis.patch.yml`, `skills/`, `locale/`, `icon.svg`: the DSH bundle payload. `package.json` declares `dsh.bundle.patch`; `cordis.patch.yml` inserts the Studio plugin and the two Agent Presets. The Studio plugin registers the nine video skills with `ctx.skills.register`, so every session in the profile gets them regardless of its working directory, and it prepends the resolved studio roots to each skill body.
- `AGENTS.md`: standing rules for the studio checkout.
- `skills/`: nine targeted DSH skills, registered profile-wide by the bundle so they load in every workspace. `video-narration/references/` carries the Vietnamese style guide, annotated before/after examples, and the G0 review rubric. They are not project-discovered; a workspace that keeps its own `video-*` copies under `.agents/skills` would outrank them by project rank.
- `kit/`: example project and scene contracts (`project.json`, `scene-contract.json`, `scene-result.json`).
- `scripts/`: zero-dependency Node helpers for preflight, new-episode, episode contract lint, the narration G0 gate and final MP4 metadata QA. They are optional aids, not a new renderer.
- `library/`: approved reusable templates and scenes catalog, plus narration style packages under `library/styles/<id>/` (metadata, source, derived notes).
- `projects/`: one directory per series/project; `episodes/` contains self-contained episodes.
- `docs/`: rationale, log bottlenecks, runbook and troubleshooting.

## Fresh machine

1. Install Node.js 20+ and DSH `0.2.2-rc.1`. Pin the package explicitly instead of using `@latest` while npm's `latest` points at a different channel:

   `npx -y @deepseek-ai/dsh@0.2.2-rc.1 --version`

2. Extract this ZIP to `video-studio`, start in that directory and (optionally) initialize its own Git repository:

   `git init`

3. Run `node scripts/preflight.mjs` to inspect available render/audio tools. No software is installed by preflight.

4. Install the bundle in the profile you use. From the Web **Plugins** page choose install from a local path, or ask the agent to run `plugin_manager` with `action: install_bundle` and `target` set to the absolute path of this checkout. Installation links the checkout into the profile, applies `cordis.patch.yml` as one layer, and enables the bundle by default. The profile then shows `Video studio presets` with the two preset rows.

5. Select `video-producer` from Agent Presets in a new session. The presets are available to every session in that profile, not only to this checkout.

6. Invoke `/video-produce` or send a natural-language request asking for a draft-only plan. No tiny video benchmark is necessary; after the config smoke check, run a real desired video.

### Using the studio from another workspace

The bundle is profile-wide, not project-local. In any workspace, open a new task, pick **Video Producer**, and the `video-*` skills are already in the catalog.

Every loaded studio skill starts with the roots it resolved:

```text
> Studio root (code and output data): `/path/to/video-studio`
> Standing rules: `/path/to/video-studio/AGENTS.md` — read it before the first production action.
> Resolve every `projects/`, `library/`, `scripts/` and `.cache/` path against these roots, never against the session working directory.
```

Outputs (`projects/`, `library/`, `.cache/`) go to the studio data root, which defaults to this checkout. To keep videos outside the plugin directory, launch DSH with `VIDEO_STUDIO_ROOT=/path/to/data`, or set `dataRoot` in the `video-studio` plugin row. `node scripts/studio-root.mjs` prints the effective roots as JSON, and `scripts/new-episode.mjs`, `scripts/validate-episode.mjs` and `scripts/promote-scene.mjs` honour the same root.

### Narration gate (G0)

Narrated productions follow: intake -> narration draft -> claim audit -> editorial pass -> review -> **frozen narration** -> storyboard/reuse -> TTS/timeline -> scenes -> QA/master. Nothing audio- or scene-related may start from a draft.

An episode carries `narration.md`, `claim-check.json` and `narration-review.json`. The review records all eight rubric verdicts, blockers, findings and the exact SHA-256 of the approved file. The deterministic gate checks the review, the hash, the claims, and (once planned) that the TTS segment concatenation reproduces the spoken prose exactly:

```bash
node scripts/validate-narration.mjs projects/<series>/episodes/ep-001
node scripts/validate-narration.mjs projects/<series>/episodes/ep-001 --segments audio/segments.json --require-segments
```

The command exits `0` only when audio may start. A changed word invalidates the review hash and only the affected audio chunks; `draft-only` stops after the reviewed draft. `scripts/new-episode.mjs` scaffolds a blocked review, so a fresh episode cannot synthesize by accident.

### Style references

A series can point at reusable narration styles in `project.json`:

```json
{ "styleRefs": ["indeterminate-forms"] }
```

Each id resolves to `library/styles/<id>/` with `style.json`, the source reference and `notes.md`. Agents read the notes (what to take, what not to copy, voice, scope, factual/mathematical audit) and never paste the reference into `narration.md` or the installed skill. The bundled `indeterminate-forms` package stores the user-provided Vietnamese lecture with its rights note and an audit that flags its one-sided limit framing.

```bash
node scripts/validate-style-refs.mjs projects/<series>
```

### Checking the patch without installing

A non-persistent dry run validates the same YAML without changing the profile:

`npx -y @deepseek-ai/dsh@0.2.2-rc.1 web --patch cordis.patch.yml --dump-config`

Do not install the bundle and also pass `--patch cordis.patch.yml` to the same runtime: the preset ids would be declared twice and declaration loading fails.

## Example request

> Use /video-produce to make episode 01 of a Vietnamese series about why negative times negative is positive. I will supply source material. Write natural narration before dividing it into shots; use existing PASS templates; at most two coding scene workers; measure actual timing and produce a narrated 1080p MP4. If an essential source or production tool is missing, tell me exactly what is missing rather than inventing it.

## Expected episode tree

`projects/toan-hoc-chan-phuong/episodes/ep-001/` has the brief, approved narration plus `claim-check.json`/`narration-review.json`, storyboard, timeline, immutable sources, scene modules, `audio/segments.json` and stems, QA reports, a final MP4 and production report. Ephemeral worker scratch lives in `work/`; shared validated examples live under `library/`, never inside each episode's output folder.

## Limitations

- The bundle was installed on `0.2.2-alpha.3` and re-validated on `0.2.2-rc.1`, where the preset roster reports both presets as loadable. On rc.1 `@deepseek-ai/dsh-tool-fs-search` requires `sampleOverCapGlobResults`; keep that config when editing the patch. Recheck the child list if a future release renames a row or field.
- Installed preset display depends on the release's Agent Preset UI. The bundle's own title, description and icon live in `locale/` and `icon.svg`; the preset rows themselves carry no icon and use the panel's default artwork.
- The included Node utilities do not themselves synthesize audio or render video. A real backend such as FFmpeg, Remotion or Blender must be available and configured based on the project.
- Scene A/B/C reuse is a workflow classification; the bundle begins with an empty catalog. Successful productions grow the library as templates are promoted.
- The 9 skills are lightweight instruction bundles and do not imply 9 concurrently running agents.

See `docs/architecture.md`, `docs/dsh.md`, `docs/log-based-improvements.md`, and `docs/acceptance.md`.
