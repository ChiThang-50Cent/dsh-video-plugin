---
name: video-produce
description: Coordinate creation, revision, or full production of any video. Invoke when the user wants a finished video, episode, short, explainer, documentary, or video series; drive narration-first production and delegate without binding to a renderer.
---

# Video Produce: coordinator

You are the ONE accountable producer. A skill is a procedure, not another agent. The actual subagent is spawned using the DSH tool with a dedicated Agent Preset if configured.

## Contract

1. Read `AGENTS.md` at the studio root named in each loaded skill's header, plus the active project's `project.json`/style. Use `video-intake` to normalize the user's natural-language request. Do not ask for details the source or project already supplies.
2. Create `request.md` and `execution-brief.md` in a NEW episode directory. Choose `draft-only` or `produce`; default to the user's stated intent. An irreversible or paid external action requires permission.
3. **Narration first, and it must pass G0.** Invoke `video-narration` to draft coherent listener-first prose, audit claims, run one substantive editorial pass, review, and freeze. The producer owns this gate even when a subagent wrote a draft:
   - `narration.md` is complete spoken prose, not scene captions;
   - `claim-check.json` records verified claims and unresolved risk;
   - `narration-review.json` is `status: "pass"` with empty `blockers` and the current SHA-256;
   - `node <studio>/scripts/validate-narration.mjs <episode-dir>` exits 0.
   **Do not call `video-audio`, implement scenes, or dispatch scene workers before this passes.** A stale hash, missing review, or blocked review means stop and report the exact blocker. In `draft-only` mode, stop here and deliver the reviewed draft and open issues.
4. Invoke `video-storyboard` on the frozen narration. It maps the prose into visual beats referencing narration segment IDs or spans; it does not rewrite the story. Invoke `video-reuse` to classify every shot A template, B copy/patch, or C custom; provide a `reuseFrom` source or a reason none exists.
5. Invoke `video-audio` to segment the frozen prose without paraphrasing, synthesize only changed clips, measure real WAV durations, and freeze `timeline.json`. Re-run the narration validator with `--segments` before synthesis if segments changed.
6. Generate A scenes programmatically, B scenes by minimal patch. For independent C tasks, dispatch at most TWO `video-scene-worker` preset subagents at once if configured. The main agent continues useful work in parallel. Subagents cannot edit shared project files or `narration.md`.
7. Invoke `video-qa` on changed scenes, then integration QA and one delivery render; run another full render only to fix demonstrated defects. Report the final MP4 path and evidence.
8. Complete `report.json`/`production-report.md` with actual wall time, model usage when measurable, A/B/C, QA calls, retries, narration draft/edit/review time, review passes, blockers, and TTS cache invalidations. Do not estimate savings as measured results.

## Gate rules

- The G0 gate is the review document plus the deterministic validator, not a model's confidence. Good prose never certifies a false claim.
- A narration edit after the review is stale by definition: re-run the affected claim checks, update the review hash, and invalidate only the affected audio/timeline artifacts.
- Scene or storyboard workers may propose dialogue changes to the producer but may not edit approved narration. Integrate only a child that delivered its declared artifacts and passes the scene acceptance script.
- Do not regenerate completed narration, TTS, or accepted masters merely because a scene or layout changed.

## Scheduling

- Do not launch n QA agents for n coding agents. QA is primarily executable checks; model visual review only for new/risky/failed scenes.
- Do not use DSH `workflow` for one or two delegations; invoke `subagent` directly. Use the workflow plugin only for truly large, explicitly requested multi-agent fanout.
- A scene worker receives: one scene specification, relevant narration segments and measured timing, 1-2 closest PASS examples, allowed paths, and the acceptance contract. Do not send the whole script or unrelated assets.
- One substantive editorial pass plus at most one targeted fix is the default. A second independent content review is a risk-based choice for high-stakes claims, not a per-episode ritual.
- Observe child completion notifications; do not poll while idle.

## Failure policy

- Missing source: ask for only the essential document or state the source uncertainty; never invent references.
- Missing renderer/TTS: choose a verified existing backend, or stop with an actionable missing prerequisite. No silent CPU fallback.
- Blocked narration: deliver the review, the blocker, and the specific decision or evidence required. Do not synthesize audio "to save time".
- Resumption: read manifests, review hashes, and signatures; reuse valid outputs, never erase the previous accepted master.
- Keep assertions about supported DSH versions separate from video backend capabilities.
