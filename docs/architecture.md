# General-purpose video production architecture

## 1. Separation of concerns

- **DSH plugins**: executable capabilities and Agent Presets. DSH owns models, context, shell, skills, delegation, permissions and session persistence.
- **DSH skills**: procedural instructions loaded selectively. They are not processes, renderers or substitutes for subagents.
- **Video project**: immutable sources, production mode, narration/review evidence, shot plans, audio, scene data and QA for one series/episode.
- **Adapters**: the built-in Skia adapter is the default for code-animated 2D scenes when preflight passes. FFmpeg handles encoding, compositing and delivery; Remotion, browser SVG/Canvas, Blender or others remain opt-in when installed and verified. Rendering engine and video encoder are independent choices. Use the execution-context preflight's real-encode recommendation for final encoding and report CPU encoding with its reason; GPU hardware evidence alone does not verify a TTS provider.

## 2. Workflow

Input → intake (audience, mode, risk, sources) → through-line map → continuous narration draft → claim audit → editorial critique/revise → independent review when high-risk → **G0 freeze** → storyboard → reuse A/B/C → audio preflight → segment manifest → synthesis/cache → measured timeline → A instantiate / B patch / C delegate (≤2 concurrent) → static/geometry QA → targeted visual QA → integration/render → media QA → strict release → metrics → scene promotion.

Synthesize speech sequentially before rendering rather than competing for memory or GPU resources. Keep scene-worker concurrency at two or fewer. The renderer checks available RAM against its configured minimum (1024 MiB by default) before allocating; libx264 defaults to half the logical CPUs, and the renderer attempts nice 10 on Linux and records priority failures. Auto rendering selects a real GPU engine when available, otherwise CPU with a reason; explicit GPU requests fail if unavailable. Use the DSH GPU runner for GPU rendering or NVENC inside the sandbox, and verify the actual execution context.

**G0 has two gates.**

- **Mechanical integrity**: schema versions, SHA-256, references, required fields, through-line/section coverage, claim evidence and narration locations, review evidence locations/finding structure, exact segment coverage and pronunciation overrides.
- **Editorial/content**: a complete-script evidence review with per-criterion citations, resolved findings, complete section coverage, cited high-risk claims and handling of high-confidence editorial defects.

`scripts/validate-narration.mjs` can run `--integrity`, `--editorial` or both. A PASS means the evidence is structurally complete and consistent; it does not prove a claim. High-risk narration needs a genuinely independent review pass. Any script edit invalidates the review hash and downstream segments; `scripts/revise-narration.mjs` archives the old script and marks/relocates affected artifacts.

**Modes.** `narrated`/`mixed` require G0 and audio QA. `silent`/`text-only` require visual/media QA and never fake narration. `mixed` marks voiced and unvoiced portions explicitly.

**Abort/resumption.** Every phase writes durable inputs and an acceptance record. Never re-run completed TTS/builds without changed fingerprints. If a source or backend is missing, stop with a precise prerequisite and preserve the brief/narration.

## 3. DSH coordination

The top-level `video-producer` Agent Preset owns the episode and G0. `video-produce` is the coordination recipe. `video-scene-worker` is an independent preset via `dsh-tool-subagent`/in-process spawn; it receives one scene brief, frozen segments/timing, closest PASS examples, work allowlist and acceptance contract. It cannot delegate.

At most two scene workers run concurrently by default. Nesting depth (`maxDepth: 1`) is not concurrency. Validate the plan and each returned result (`scripts/validate-workers.mjs`) before integration; prompt instructions are not a filesystem boundary. No QA subagent per scene. One independent content review at episode level is allowed for high-risk work.

## 4. Workspace tree

```text
video-studio/                  # code root (may be read-only if installed)
  AGENTS.md
  skills/
  kit/                         # project/production/throughline/claim/review/segments/scene contracts
  scripts/
  library/                     # built-in catalog + styles; copied to a data root on init
  projects/                    # only when dataRoot == codeRoot
  .cache/
<dataRoot>/
  library/
    catalog.json
    templates/
    scenes/<id>/{source,preview,qa}
    styles/<id>/{style.json, notes.md, optional source}
  projects/
    <series>/
      project.json
      episodes/<ep>/
        production.json        # mode/risk
        request.md
        execution-brief.md
        throughline-map.json    # narrated/mixed
        narration.md
        claim-check.json
        narration-review.json
        narration-revisions/    # archived revisions
        visual-brief.md         # silent/text-only
        storyboard.json
        timeline.json
        assets/{original,derived}
        audio/{manifest.json,segments.json,narration/*.wav,stems/}
        scenes/
        qa/{scene/*.json,final.json,media.json}
        reports/{metrics.json,production-report.md,editorial-suggestions.*}
        exports/master.*
        work/                   # worker sandboxes/scratch
  .cache/
```

`init-workspace.mjs` creates the data tree and overlays missing built-in styles/catalog; it never overwrites. The shared resolver uses explicit > env > config file > nearest initialized workspace ancestor or cwd. Relative explicit and env overrides resolve against cwd; config values resolve against the config file directory.

## 5. Ownership and promotion

| Artifact | Owner | Stable? | Promotion |
|---|---|---|---|
| source original | user/owner | immutable | never automatic |
| narration/throughline/claims/review | producer + independent reviewer | canonical | not a template |
| segments/timeline/audio manifest | producer/audio step | canonical | not a template |
| A template instance | producer | canonical | existing template |
| B modified scene | producer after integration | canonical on acceptance | only after QA/parameterization |
| C scene code | worker in `work`, producer imports | canonical on acceptance | only after repeat-use judgement |
| previews/snapshots | QA | rebuildable evidence | keep representative accepted frame |
| master.* | producer | immutable release | never overwrite without versioning |

Only a QA-PASS, hash-recorded scene with clear limitations/version/backend compatibility is promotable. `promote-scene.mjs` stages copies, rejects invalid QA/collisions/escapes, atomically updates the catalog, and never overwrites an accepted id.

## 6. Reuse and cache

Reuse priority: adequate A → B with the smallest diff → C. Reuse style/fonts/components/TTS caches. Cache audio by exact text, pronunciation, voice, engine/version/settings and language; scenes by template version, parameters, asset hashes, timing and backend. An untrusted cache is a MISS. A component revision triggers regression QA for representative dependants.

## 7. Scene types

Text reveal, formula, graph, number line, arithmetic/pattern, diagram, quote, map, timeline, photo pan/zoom, archival b-roll, lower-third, split comparison, UI capture, closing card. Store purpose separately from backend. A template without an installed adapter is not reusable.

The Skia scene module exports `meta` (`id`, `durationSec`, `width`, `height`, `fps`) and deterministic `draw(ctx, t, api)`. The adapter supplies text, TeX formula, axes, plots, animation and annotation helpers. `render-scene.mjs` renders video and records `<out>.render.json`, or renders selected snapshots without encoding. The episode renderer consumes contiguous frame-aligned timeline entries with episode-relative scene module `source`, `startSec` and `durationSec`, and sequences existing audio chunks from zero; it does not run TTS. The final master must still pass the existing media and release gates.

## 8. QA, release and reporting

- **G0** as above.
- **G1** static contract/IDs/timing.
- **G2** geometry/safe areas at decisive timestamps.
- **G3** targeted motion/audio preview; frozen frames, silence, clipping, determinism.
- **G4** release: real master probed by ffprobe and hash, `qa/final.json` PASS, `qa/media.json` bound to the master, scene QA, narrated/mixed G0+audio consistency, no stale markers.
- **Media QA cost boundary**: FFprobe metadata by default; `--quality`/`--subtitles` targeted; duplicate/full passes only on explicit request. A narration or code edit must not trigger full-media QA.
- **Metrics**: use `collect-metrics.mjs` on persisted DSH session logs, following workers. Separate wall-clock, active turns, tool execution/overlap, observed model latency, multi-agent overlap, worker concurrency, tokens/cache, retries, failed jobs and image reads. Missing measurements stay unavailable; no manual estimates labelled measured.
