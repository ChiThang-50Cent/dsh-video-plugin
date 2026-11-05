# Example requests to DSH after installation

## Vietnamese mathematics episode

```text
/video-produce
Make a 10-minute Vietnamese episode from the supplied math-book pages. Use the book as
source; write an original through-line map and continuous narration. Audit every claim
with a real narration location, run an independent review, and freeze only after G0.
Use accepted templates before new code, at most two scene workers, verified audio
preflight and a real narrated 1080p MP4. If a source/backend is missing, name it.
```

The producer builds `throughline-map.json`, drafts prose, writes claim-check v2 and narration-review v2 with cited evidence, and runs `validate-narration.mjs`. A blocked review names the claim and correction instead of starting TTS.

## Narration review only

```text
/video-narration
Review episode 001 against the G0 rubric. Check the one-sided/two-sided limit claims,
the through-line, the identity transitions and whether a listener can follow without
the screen. Write schema-v2 evidence and findings. Do not run TTS or touch scenes.
```

## High-risk independent review

```text
/video-narration
The episode makes medical claims and is marked qualitySensitive. Run the deterministic
editorial pre-scan, then use one independent fresh-context review of the full script,
brief and sources. Return only actionable findings with exact excerpts and resolutions.
Do not write scenes, synthesize audio or render.
```

## Silent launch short

```text
/video-produce
Create a 35-second vertical launch video from assets/original. No voice-over; mode silent.
Energetic typography, brand style, licensed music. Produce a real master, poster,
captions if text appears, media QA and the strict release status. Do not create fake narration.
```

## Documentary with source uncertainty

```text
/video-produce
Create an 8-minute documentary from the supplied sources. Attribute contested claims and
distinguish record from inference. Use licensed archival footage, maps and timelines.
Explain uncertainty in the narration; do not invent footage, dates or quotes.
```

## Revision after a blocked review

```text
/video-narration
The limit paragraph was corrected. Use revise-narration with the reason, recheck the
affected claims and through-line, update the review evidence/hash, and report which
audio/timeline artifacts are now stale. Do not synthesize.
```

## QA an existing video only

```text
/video-qa
Review exports/master.mp4 and the available QA. Run metadata QA plus targeted --quality
and subtitle checks. Verify qa/media.json binds to the current master. Do not regenerate.
```

## Metrics only

```text
/video-qa
Collect measured metrics from the DSH session logs for the main session and its scene
workers. Report wall clock, tool execution, overlap, model latency, tokens/cache,
retries, failed jobs, image reads, worker concurrency and delegation depth separately.
Do not estimate missing values.
```
