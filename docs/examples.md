# Example requests to DSH after installation

## Vietnamese mathematics episode

```text
/video-produce
Make a real 10-minute Vietnamese episode based on the provided math-book pages.
Use the book as source material; create an original listener-first narration.
Write the full spoken script, verify every mathematical claim, then synthesize
speech and generate timeline based on actual WAV durations.
Reuse accepted scene templates before writing new code. At most two C-scene
workers. Apply risk-based QA and deliver an MP4 plus production metrics.
```

## Narration-first lesson with an explicit review gate

```text
/video-produce
Make a Vietnamese explainer about why multiplying two negative numbers gives a positive.
Use the source I supplied. Make it conversational and insightful, like the example
indeterminate-forms script. Draft first; do not synthesize speech until the narration
passes review.
```

The producer drafts `narration.md`, audits claims into `claim-check.json`, runs one editorial pass, writes `narration-review.json` with the file hash, and runs `scripts/validate-narration.mjs`. If the review blocks, the answer names the claim and the correction instead of starting TTS.

## Lesson that follows a stored style reference

```text
/video-produce
Use the `indeterminate-forms` style package for a Vietnamese explainer on why a
negative times a negative is positive. Follow its architecture (familiar example,
one central metaphor, bridges, full example arc, warning, synthesis ending), not its
wording or outline. Keep the lesson short; run G0 before any speech.
```

The producer reads `library/styles/indeterminate-forms/notes.md`, records the constraints in `execution-brief.md`, and writes original prose. The package's audit reminds it to state any one-sided limit explicitly.

## Narration review only, no production

```text
/video-narration
Review the narration in projects/<series>/episodes/ep-001 against the studio G0 rubric.
Check the two-sided/one-sided limit statements, the transitions, and whether a listener
can follow without the screen. Write narration-review.json and report blockers; do not
run TTS or touch scenes.
```

## History documentary with archival footage

```text
/video-produce
Create an 8-minute documentary about an event described in the supplied sources.
Prefer archival images/footage I have licensed. Explain source uncertainty in
narration; use captions, maps and timelines. Do not invent archival footage or
choose fake historic dates. Use FFmpeg/editing backend if available.
```

## Product launch short, not a mathematical video

```text
/video-produce
Create a 35-second vertical (1080x1920) launch video from the assets in
assets/original. Energetic typography, no spoken narration. Use the brand
style. Reuse the vertical intro/feature/CTA templates. Produce master MP4,
poster, and captions if any speech is present.
```

## Draft-only from conversation

```text
/video-produce
I want a series about simple science demonstrations for ages 12-15.
Start with episode 1 on buoyancy. Design the series style and a proposed
narration-first episode, but stop before TTS, rendering, installations,
paid APIs, or other external actions. Identify any essential missing assets.
```

## QA an existing video only

```text
/video-qa
Review exports/master.mp4 and the available storyboard/timeline.
Check streams, dimensions, audio/silence, subtitle ordering, transition
issues and selected risky frames. Do not regenerate the whole video.
```
