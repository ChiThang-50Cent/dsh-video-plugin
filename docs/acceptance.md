# Acceptance and safety test checklist

## DSH composition
- [ ] Pinned `dsh --version` prints 0.2.2-rc.1; profile resolves with Web agent presets.
- [ ] `AGENTS.md` is injected into a session opened in this checkout, and the skill list shows all 9 skills there.
- [ ] Opened in a workspace outside this checkout, a session still lists and loads the 9 skills; each loaded body states the absolute studio code/data roots.
- [ ] `/video-produce` loads on explicit request and writes request + execution brief.
- [ ] `video-scene-worker` is a real independent preset: child receives only assigned scene brief, outputs only assigned paths, no delegation tool, and returns `scene-result.json`.
- [ ] No package installation, paid services or destructive actions without authorization.

## Narration (G0)
- [ ] `narration.md` reads as a complete spoken essay in paragraphs; a listener can follow the main line with the screen off; no scene captions and no visual-only deixis.
- [ ] `claim-check.json` records each checkable claim with source/derivation, `verified`, `risk`; a missing essential source is a blocker, not an invented answer.
- [ ] `narration-review.json` scores all eight criteria, has empty `blockers`, `status: "pass"` and the current SHA-256 of `narration.md`.
- [ ] `node scripts/validate-narration.mjs <episode-dir>` exits 0; when segments exist, the same command with `--segments audio/segments.json --require-segments` also exits 0.
- [ ] A false two-sided limit statement is blocked with a one-sided correction; an engaging but wrong script never unlocks audio.
- [ ] Changing one spoken word makes the review hash stale and blocks audio; repairing only the affected narration, review and segments restores the gate.
- [ ] `draft-only` stops after the reviewed draft with no TTS, scene worker or render.
- [ ] Non-mathematical genres pass with source-certainty narration and no forced proof format.
- [ ] A project with `styleRefs` validates (`node scripts/validate-style-refs.mjs <project-dir>`), the notes are read before drafting, and no reference wording or full outline is copied into `narration.md`.

## Script and audio
- [ ] Full `narration.md` has natural prose, transitions, accurate proof/facts, and is approved before TTS.
- [ ] Source claim-check passes, attributed external media includes permission/licensing metadata.
- [ ] Backend preflight measured, no silent CPU fallback where disallowed, actual WAV durations drive timeline.
- [ ] TTS cache preserves unchanged chunks.

## Scene/render
- [ ] Every scene has A/B/C, source template and limits, or documented reason for C.
- [ ] A scene can render without asking coding subagent for new code; B uses minimal copy/patch.
- [ ] C subagent cannot cause shared-file conflicts, and main agent has at most two active scene workers.
- [ ] Static/layout QA checks timing bounds, text clip/overlap and relevant motion timestamps.
- [ ] Final film has correct audio/video streams, subtitles and validated full duration.
- [ ] Approved master is not overwritten by another run; failures retain evidence.

## Operational metrics
- [ ] Actual stage times, model/tool counts, image inspections, retries, full renders and A/B/C reuse logged.
- [ ] Final report separates facts from estimates; only PASS scenes eligible for library promotion.
- [ ] Re-running after interruption does not regenerate unchanged voice or recompute accepted scenes without reason.

## Explicit gaps in this starter
- It does not include a real TTS provider, renderer, DOM bbox inspector or speech-quality model. These are *adapters* chosen after machine preflight. Never mark such stages PASS on a machine that lacks them.
- The presets and the `video-studio` skill plugin have been mounted in a running DSH 0.2.2-rc.1 profile; the roster reports both presets as loadable. The narration gate is exercised by deterministic fixtures (Vietnamese lesson, false-limit case, caption fragments, freeze/coverage, documentary); a full episode has not been produced yet.
- The user supplied the long indeterminate-forms transcript after the first implementation. It is stored at `library/styles/indeterminate-forms/reference.vi.md` with a rights note and an audit; it is not embedded in the installed skills or the package `files`.
