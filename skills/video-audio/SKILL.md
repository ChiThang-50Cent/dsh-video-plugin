---
name: video-audio
description: Segment frozen narration, synthesize speech, time and mix audio in video production. Use after narration passes G0, and when a video needs voice-over, music, sound effects or synchronization to spoken language.
---

# Audio and speech

The audio step consumes a frozen script. It never improves, shortens, or paraphrases the narration.

## Preconditions

- `narration-review.json` is `status: "pass"` with empty `blockers`, and its `narrationSha256` matches `narration.md`.
- `node <studio>/scripts/validate-narration.mjs <episode-dir>` passes. Re-run it with `--segments audio/segments.json` after writing the segment manifest.
- If the review is missing, stale, or blocked, stop and return the blocker to the producer. Do not synthesize a draft.

## Segment without rewriting

Create `audio/segments.json` from the frozen prose. Split at paragraph or sentence boundaries that the chosen engine can synthesize naturally; there is no universal word count and no "one scene = one chunk".

```json
{
  "schemaVersion": 1,
  "narrationSha256": "<hash of the frozen narration.md>",
  "segments": [
    {
      "id": "seg-001",
      "paragraph": 1,
      "text": "exact prose from narration.md",
      "spokenText": "only when pronunciation differs",
      "audio": "narration/seg-001.wav"
    }
  ]
}
```

Rules:

- `text` is copied from the spoken prose, not retyped. The normalized concatenation of every `text`, in order, must equal the spoken prose extracted from `narration.md` — no dropped, duplicated, reordered, or paraphrased sentences.
- `spokenText` is only pronunciation normalization for symbols, abbreviations, numbers and units. It may not change meaning or add words the listener did not approve.
- Subtitles and display transcripts derive from `text` (canonical wording), not `spokenText`.
- Run the validator with `--segments`; a coverage or hash failure blocks synthesis.
- If the script must change, stop: the producer reopens narration, redoes G0, and only then re-segments.

## Synthesis and cache

1. Inventory actual TTS providers or existing recorded audio. Ask for a voice or use the configured project default. No assumed OmniVoice/CUDA/hardware. Preserve source files and rights metadata.
2. Preflight the chosen engine/model, required runtime, GPU memory when requested, language and output codec. If policy demands GPU and GPU fails, stop; never silently run CPU for tens of minutes.
3. Synthesize or modify only changed segments. Fingerprint normalized `spokenText`, voice, model/version, seed when meaningful, language, and parameters. Unchanged segments reuse their WAVs; failed chunks are not cached.
4. Verify sample rate, channels, peak levels, audible samples, clipping, long silence, and numeric speech pronunciation. `ffprobe` can measure media; an unknown engine must be reported as unknown.
5. Measure every WAV in seconds and build `timeline.json` from measured durations plus intentionally authored pauses/transitions. Word-count estimates are planning-only and never override measured audio.
6. Music and SFX require attribution/license and suitable loudness relative to the voice; no copyrighted media without authorization. Keep separate stems for future remixes.
7. Output `audio/manifest.json` with segment IDs, engine identity, fingerprints, WAV paths, hashes and durations, plus subtitles/cue timings and a QA summary. Do not regenerate unchanged audio during scene or layout edits.
