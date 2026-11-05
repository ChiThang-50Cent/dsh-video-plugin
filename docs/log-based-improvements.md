# Design decisions grounded in earlier user-provided DSH sessions

## Evidence, not projections

1. Four-scene A/B: sequential 940.241s (15m40), two workers 821.723s (13m42), 1.14x speedup. Parallel output tokens ~155,624 versus 109,503 sequential (+42% approximately). Conclusion: worker count is not the main optimization lever; set a default cap of two and dynamic assignment.
2. Continuity 1080p/30 FPS narrated production required ~107-112m session; GPU TTS of 49 chunks was ~30.5s and final render ~58s, while planning/coding/review dominated. Avoid renderer optimization before reusing code and cutting model retries.
3. Scene workbench earlier measurements per scene roughly: build 0.02s, check 9.2s, snapshots/determinism 6.4s, preview 14.8s, ~30.5s total, versus much longer model authoring. Use cheap gates and targeted preview, but do not pretend skipping 15s previews alone will save tens of minutes.
4. Episode 01 A/B/C: 5 template, 2 copy/patch, 5 custom = 7/12 reused by scene-classification, NOT 58% saved tokens nor bytes. New `ArithmeticSequence` used twice, `AreaDiagram` once. Need a catalog of PASS scenes with parameter schemas, limitations and previews.
5. Episode 01 main `read_image`: 44, workers 10 + 9 = 63 calls; scene workbench 12 calls, 6 full build/check. An agent QA worker per coding worker would duplicate visual review. Implement geometry/contradiction checks then selective visual inspection.
6. Episode 01 narration was scene-driven and a mathematical mistake was corrected after narration synthesis began. New narrator must create complete prose with a content audit before TTS. Keep visual segmentation as later data, not the primary prose format.
7. Older one-sided limit had ~45m GPU/CPU fallback incident. Run capability/voice preflight and explicit failure policy, and retain cached chunks.
8. Old scene workers built their own HyperFrames mini-project and repeatedly copied fonts/KaTeX/audio, making thousands of generated files. New worker contract keeps scene source and reports stable while scratch and shared dependencies live separately.
9. Math formula collision could bypass HyperFrames checks through `data-layout-allow-overlap`. New QA explicitly checks DOM bounding boxes and critical timestamps on supported browser renderers.

## Priorities in order

P0: factual/educational accuracy before synthesizing; preflight required backends.
P1: reuse catalog and per-scene A/B/C resolution before new code.
P2: script narration quality independent from scene implementation.
P3: target QA and eliminate double-inspection or cosmetic post-PASS loops.
P4: two-worker dynamic C queue only; preserve shared-file ownership and compact briefs.
P5: metrics and scene promotion after acceptance; only expand orchestration when observed workload warrants it.

## Target metrics, not promises

Measure `T_total`, model-active time, T_narration, T_custom, T_QA, T_render, clips reused, % A/B scenes, code line diff, visual inspections, number of workbench cycles, per-worker idle and active time, full renders, TTS cache hit count. Do not claim a 2x speedup without matching full-episode evidence. Measure quality as hard-gate pass and a separate narrative editor score, not just more screenshots.
