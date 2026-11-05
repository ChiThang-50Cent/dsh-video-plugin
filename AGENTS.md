# Video Studio - standing agent instructions

- This repository produces many kinds of videos; no hard-coded video genre, renderer, TTS provider or machine-specific path.
- Invoke the matching `video-*` skill for the task. The skills ship in `skills/` and are registered profile-wide by the bundle, so they also load in a session opened outside this checkout. `video-produce` is the accountable coordinator when the user wants a full deliverable.
- Resolve `projects/`, `library/`, `scripts/` and `.cache/` against the studio roots printed at the top of each loaded skill, not against the session working directory. `node scripts/studio-root.mjs` prints them.
- Accept natural-language requests. Extract facts from the user files and existing project settings rather than demand an intake form.
- Draft narration and validate factual/math claims BEFORE TTS or scene coding; narration is independent of individual animation beats.
- Narration is listener-first and frozen before audio: require a matching `narration-review.json` PASS and SHA-256, run `scripts/validate-narration.mjs`, and never synthesize, storyboard or code scenes from a draft, stale hash or blocked review.
- Reuse approved templates first (A), copy/patch an approved scene second (B), code new scenes last (C). Keep an explicit `reuseFrom` when applicable.
- Use the configured DSH `video-scene-worker` preset for at most two independent C scenes in parallel. Do not start QA agents per scene; code-based QA is the default.
- Workers can write only inside their assigned episode `work/` directory. Main agent owns global timeline, assets manifest and library promotion.
- Select render/audio backends from preflight checks and project requirements. Do not use HyperFrames, Remotion, OmniVoice or any other specific engine unless available and appropriate.
- Do not install packages, use paid external services, or overwrite/delete a released master without explicit user authorization.
- Preserve accepted scene sources, source attribution, cached narration and master output. Work directories may be cleaned only after safe QA retention and explicit approval.
- Measure real elapsed time by phase, number of model turns, QA image reads and full renders. Never label theoretical speedup as measured.
- Deliver the requested master file or state precisely which prerequisite/failed gate blocked delivery.
