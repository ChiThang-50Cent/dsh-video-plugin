# General-purpose video production architecture

## 1. Separation of concerns

- DSH plugins: real executable capabilities and Agent Presets. DSH owns models, context, shell, skill discovery, delegation, permission checks and session persistence.
- DSH skills: procedural instructions loaded selectively. They are not processes, not rendering engines, and not substitutes for real subagent presets.
- Video project: immutable source assets, scripts, shot plans, audio and scene data for one series or standalone film.
- Renderer/TTS adapters: the installed and verified tools that build the film. FFmpeg is the minimal common delivery/mixing backend. Remotion, browser SVG/Canvas, Blender, or other tools are opt-in and selected per shot type. No engine assumed.

## 2. Full workflow

Input user -> intake brief -> listener-first narration draft -> claim/fact audit -> one editorial pass -> G0 review and hash freeze -> storyboard -> library retrieval/A-B-C classification -> segment manifest -> audio preflight -> synthesis/cache -> measured timeline -> instantiate A -> patch B -> delegate C up to 2 -> static/geometry QA -> selected preview/AI vision -> integration render -> final audio/visual/metadata QA -> master + metrics -> promote useful approved scenes.

**G0 gate:** `narration-review.json` must be `pass` with the current SHA-256 and empty blockers, and `scripts/validate-narration.mjs` must pass, before TTS segments, scene code or scene workers. A script edit makes the review stale; only affected claims, audio chunks and timings are invalidated.

**Abort and resumption:** every phase writes durable inputs and an acceptance record; never re-run completed TTS or builds without changed fingerprints. If TTS/renderer not installed, stop at preflight with a clear reason and retain script/brief.

## 3. DSH coordination

Top-level `video-producer` Agent Preset owns the project. The producer owns the G0 narration gate and freezes `narration.md` before storyboard or audio. `video-produce` skill is the coordination recipe. `video-scene-worker` is an independent DSH Agent Preset accessed through `dsh-tool-subagent` and in-process spawn. Workers receive an exact scene brief, their own work path, 1-2 PASS examples, backend config, duration and acceptance contract. They do not receive whole script or unrelated assets.

No dedicated QA subagent per scene. The QA *skill* runs code-based gates. Only a mathematically/factually high-risk film may justify a single independent review, with a bound on depth and model cost.

For one or two delegations use direct subagent start; in DSH the tool returns an ID immediately and parent receives completion later. Use `workflow` only when the user explicitly requests large scripted orchestration (not simply because an episode has many scenes).

## 4. Workspace tree (after successful real episode)

```text
video-studio/
  AGENTS.md
  skills/                   # reusable DSH skills; registered profile-wide by the bundle
  kit/                      # project/scene contract examples
  library/
    catalog.json            # searchable metadata for QA-approved reusable assets
    templates/              # stable template implementations and input schemas
    scenes/                 # PASSED example code, preview, QA evidence
    styles/                 # typography/color defaults and <id>/ style packages
  projects/
    toan-hoc-chan-phuong/
      project.json          # series identity; not a renderer
      episodes/
        ep-001/
          request.md        # original user intent
          execution-brief.md
          narration.md      # approved voiceover before segmenting
          claim-check.json
          narration-review.json  # G0 verdict, blockers, SHA-256
          storyboard.json   # scene intent and reuseFrom
          timeline.json     # real WAV-based cue times
          assets/
            original/       # immutable PDFs, audio, footage with attribution
            derived/        # thumbnails, images, charts (rebuildable)
          audio/
            manifest.json
            segments.json   # ordered text/spoken text, frozen narration hash
            narration/*.wav # stable cacheable TTS chunks
            stems/*         # optional music/SFX/voice mix stems
          scenes/
            s01-hook/scene.json
            s02-example/scene.json
            s02-example/entry.mjs  # only if custom code required
          qa/
            scene/*.json
            final.json
            contact-sheet.jpg
          reports/
            metrics.json
            production-report.md
          exports/
            master.mp4
            subtitles.srt
          work/             # worker sandboxes, previews, temporary files
  .cache/                   # content-addressed render / speech caches
  scripts/                  # actual deterministic checks
```

## 5. Ownership and promotion

| Artifact | Owner | Stable? | Promotion |
| --- | --- | --- | --- |
| source original | owner/user | immutable | never automatically |
| narration/claims | producer/script skill | canonical | not generic template |
| timeline/audio manifest | producer/audio skill | canonical | not generic template |
| A template instance | episode producer | canonical scene data | existing template |
| B modified scene | producer after integration | canonical | only after QA and parameterization |
| C scene code | assigned worker in `work`, producer imports | canonical on acceptance | only after repeat-use judgment |
| previews, browser snapshots | QA | rebuildable evidence | keep representative accepted frame |
| master.mp4 | producer | immutable release | never overwrite without versioning |

## 6. Reuse and cache

Reuse priority: select A if semantically adequate, else B with smallest diff, else C. Reuse `style`, `fonts`, `scenes`, `narration settings`, and `TTS cache` across episodes. Two different episodes may share a template but never share stale audio just because filenames match. Create digest from exact text, voice engine/version/settings for audio; from template version, scene data, asset hashes, timing and backend version for scenes. Validate fingerprint before cache hit.

A accepted component revision triggers regression QA of representative dependant scenes. A new scene can be added to `library/catalog.json` only if QA PASS, reproducible preview, clear limitations and parameter contract. This prevents catalog rot.

## 7. Default scene types across genres

Text reveal, formula, graph, number line, arithmetic progression, diagram, quote, map, timeline, photo pan/zoom, archival b-roll, lower-third, split comparison, UI screen capture, closing card. A scene's *purpose* is stored separately from its backend implementation. A template with no implementation on installed backend is not reusable until an adapter is provided.

## 8. QA and reporting

G0 narration gate before speech: review status/hash, claim check, rubric quality and segment coverage; G1 structural lint/ID/timing; G2 geometry at meaningful timestamps and template-safe areas; G3 targeted motion/audio preview; G4 complete film delivery checks. Deterministic checks always first, human/AI image inspection selective, not per worker. Main producer reviews selected film contact sheet and transitions rather than all children screenshots again.

Store wall time for every phase, active/idle model time when available, prompts/tokens, repeated tool calls, scene classification, number of visual inspections, worker retries and full renders. Compare real episodes only with topic complexity caveat.
