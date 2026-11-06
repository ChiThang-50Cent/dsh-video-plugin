---
name: video-audio
description: Segment frozen narration, verify the speech provider/device with a sample, synthesize and time audio with bounded jobs and a meaning-preserving pronunciation contract. Use after narration passes G0.
---

# Audio and speech

The audio step consumes a frozen script. It never improves, shortens, paraphrases or re-voices the approved meaning.

## Preconditions

- `narration-review.json` is `status: "pass"` with empty `blockers`, all blocking findings resolved, and its `narrationSha256` matches `narration.md`.
- `node <studio>/scripts/validate-narration.mjs <episode-dir>` passes. Re-run with `--segments audio/segments.json --require-segments` after writing the manifest.
- If the review is missing, stale or blocked, stop and return the blocker. Do not synthesize a draft.
- `silent`/`text-only` productions have no voice-over; do not fabricate narration. Validate music/SFX and visual timing instead.

## Preflight the actual backend

Before batch synthesis, run:

```bash
node <studio>/scripts/audio-preflight.mjs --provider <id> --voice <id> \
  --voice-reference <wav> --synthesize-sample [--require-gpu] [--json]
```

- `nvidia-smi` proves hardware, not that the TTS provider uses it. Provider/device readiness is verified by the configured device probe **and** a short sample. If `--require-gpu` cannot be verified, stop; never silently run CPU for a long batch.
- Inspect the voice reference for readability, duration, sample rate, silence and clipping. Language/timbre suitability still needs listening.
- Run TTS/ASR through bounded jobs with a timeout and explicit retry policy (`scripts/lib/bounded.mjs`). Do not retry forever or hide a failure.
- Record provider, command/version, device, voice/model, settings, sample path/result and environment in `audio/manifest.json`.

## Segment without rewriting

Create `audio/segments.json` at sentence/paragraph boundaries the engine handles naturally. There is no universal word count and no "one scene = one chunk".

```json
{
  "schemaVersion": 2,
  "narrationSha256": "<hash of the frozen narration.md>",
  "segments": [{
    "id": "seg-001",
    "paragraphStart": 1,
    "text": "exact prose from narration.md",
    "displayText": "optional; must equal text",
    "spokenText": "optional; only if pronunciation differs",
    "pronunciation": {
      "version": 1,
      "overrides": [{
        "from": "16", "to": "mười sáu", "kind": "number",
        "provenance": "Vietnamese number reading table",
        "justification": "The approved value stays 16; the engine reads digits inconsistently.",
        "risk": "low"
      }]
    },
    "audio": "audio/narration/seg-001.wav"
  }]
}
```

Segment audio paths are relative to the episode directory, not `audio/`.

Contract:

- `text` is copied from spoken prose, not retyped. Normalized concatenation of every `text` in order must equal the frozen spoken prose exactly.
- `displayText` is the on-screen wording and must equal `text`; subtitles use it, never `spokenText`.
- `spokenText` may differ only through declared `pronunciation.overrides`. Every override needs `from`, `to`, `kind`, `provenance`, `justification`, and `risk`. The tool reconstructs `spokenText` from the overrides; an undeclared change fails.
- An override may normalize pronunciation (`16` → "mười sáu", `%` → "phần trăm", an abbreviation), but may **never** change numbers, operators, signs, quantities or a mathematical claim. `trừ` → `cộng`, `âm` → `dương`, a changed number or an omitted quantity fails the gate even if marked reviewed. Ambiguous but meaning-preserving readings need `reviewed`, `reviewedBy` and a resolved `reviewRef`.
- If the script must change, stop. Use `scripts/revise-narration.mjs`; it blocks the review and moves the old segment manifest aside. Never keep old audio for a new hash.

## Targeted audio QA

Before/with synthesis:

```bash
node <studio>/scripts/qa-audio.mjs <episode-dir> --segments audio/segments.json [--audio] [--json]
```

- Deterministically check that every number/operator in `text` is still present in the spoken form; flag potential omissions and digits left for the engine to read.
- After WAVs exist, `--audio` checks readability, duration, silence and clipping. Optional ASR (`--asr-command`, `--asr-arg` with `{audio}`) is advisory evidence, not truth.
- Listen to the sample and targeted segments containing numbers, operators, names and ambiguous units; automated checks cannot hear a wrong tone.

## Synthesis, cache and timeline

1. Synthesize or modify only changed segments. Fingerprint normalized `spokenText`, voice, model/version, seed when meaningful, language and parameters. Successful unchanged chunks reuse their WAVs; failed chunks are never cached.
2. Verify sample rate, channels, peak levels, audible samples, clipping, long silence and numeric speech pronunciation. Unknown engines are reported as unknown.
3. Measure every WAV in seconds and build `timeline.json` from measured durations plus authored pauses/transitions. Word-count estimates are planning-only.
4. Music/SFX need attribution/license and suitable loudness; keep separate stems. No copyrighted media without authorization.
5. Output `audio/manifest.json` with `narrationSha256`, segment IDs, engine identity, fingerprints, paths, hashes, measured durations, subtitle cues, QA summary and any `stale` marker. Release rejects a manifest that cannot bind the audio to the frozen script. Do not regenerate unchanged audio during scene or layout edits.
Each chunk must identify its approved segment (`segmentId` or matching `id`), include a SHA-256 and measured duration, and contain a probeable audio stream. Exactly one chunk is required per approved segment.
