# Script review and the G0 gate

Read this when reviewing a narration draft, when a review is challenged, or when a blocked script needs a focused repair. The review judges the **script**, not the scenes, the render, or how much effort the draft took.

## Artifacts

| File | Role |
|---|---|
| `narration.md` | Spoken prose plus non-spoken headings, notes, and display blocks. |
| `claim-check.json` | Checkable claims, source or derivation, verification state, risk, fix. |
| `narration-review.json` | The G0 verdict, rubric, blockers, findings, and the approved file hash. |
| `audio/segments.json` | Created later by the audio step; must reproduce the frozen spoken prose exactly. |

The producer must run `node <studio>/scripts/validate-narration.mjs <episode-dir>` after writing the review. A model statement that the script "looks good" is not a gate.

## Procedure

1. Read `request.md`, `execution-brief.md`, the sources, and the project style. Know what the episode promised.
2. Read `narration.md` once, aloud and in full, before scoring anything. Do not stop at the first awkward sentence.
3. Audit claims first. For every checkable statement, confirm source or derivation. For mathematics, verify domains, one-sided versus two-sided statements, denominators, endpoint conditions, and whether a geometric argument assumes nonnegative lengths.
4. Score the eight criteria below. Use `pass`, `needs-work`, or `block`; every non-pass needs a concrete quote and a fix.
5. Write findings that name a location and an action, not a mood: quote the sentence, say what is wrong for a listener, say what to do.
6. Compute the SHA-256 of the exact approved `narration.md` bytes and record it in the review. Do not record a hash of a later edit.
7. Run the deterministic validator. Fix review fields, not the validator.

## Rubric

### 1. Accuracy and source fidelity

- **pass**: every checkable claim is correct or correctly hedged; assumptions and conditions are stated where they change the answer; contested claims are attributed.
- **needs-work**: a claim is vague enough to mislead, or a condition is implied but never said.
- **block**: a false mathematical or factual claim; an unverified high-risk statement presented as fact; a source invented or misattributed.

### 2. Audience fit

- **pass**: prior knowledge is respected; terms are introduced when needed; the depth matches the stated audience.
- **needs-work**: a term is used before it is defined, or a passage explains what the audience already knows while skipping the hard step.
- **block**: the script assumes knowledge the brief excludes, or explains so little that the promised outcome is unreachable.

### 3. Narrative arc

- **pass**: a concrete opening question or situation, development with a reason to continue, and an ending that changes what the listener understands.
- **needs-work**: the opening is generic, the middle is a list, or the ending only summarizes sections.
- **block**: there is no through-line; the script is a sequence of unrelated captions or mini-lectures.

### 4. Reasoning quality

- **pass**: explains why the crucial step is valid; anticipates at least one likely misconception; distinguishes a rule from its justification.
- **needs-work**: states the rule and an example but not the reason; a misconception is mentioned without being resolved.
- **block**: the central explanation is absent or wrong; the script asserts authority instead of reasoning.

### 5. Continuity

- **pass**: each section follows from the previous one for a stated reason; references are audible-only safe; no sentence exists only to announce the next.
- **needs-work**: a jump needs a bridge; a callback is unclear; a formula appears before its purpose is established.
- **block**: sections contradict each other or require the visuals to make basic sense.

### 6. Spoken Vietnamese

- **pass**: reads aloud naturally; one consistent address; formulas are pronounced; no raw LaTeX, slide fragments, or visual-only deixis.
- **needs-work**: a sentence is hard to say, accent or register slips, or a formula is read symbol by symbol.
- **block**: spoken text is unintelligible, garbled mathematics, or a string of captions rather than speech.

### 7. Pacing and information density

- **pass**: examples earn their runtime; length is appropriate to the promise; repetition is deliberate.
- **needs-work**: a section over-explains arithmetic or rushes the conceptual leap; an example adds nothing new.
- **block**: the script cannot fit the stated duration without losing essential content, or pads to fill it.

### 8. Originality and style

- **pass**: honors the project voice and the user's stated reference without copying its sentences; examples are original.
- **needs-work**: the voice drifts, or the structure imitates the sample literally instead of its reasoning.
- **block**: reproduces copyrighted or user-provided narration at length, or claims a source it did not use.

## Hard blockers

Any one of these sets `status: "blocked"` and prevents audio:

- A false mathematical or factual claim.
- An unverified high-risk claim presented as fact.
- A missing essential source with no justified workaround.
- Spoken mathematics that cannot be pronounced as written.
- The central explanation missing.
- A script that is only isolated scene captions.
- A review hash that does not match `narration.md`.

## Soft findings and the revision budget

Editorial weaknesses are `needs-work`, not automatic blocks: a weak hook, a duplicate explanation, a bridge that needs one sentence. The default budget is:

1. the first full draft;
2. one substantive editorial pass over the whole script;
3. at most one targeted fix pass that touches only flagged sections.

After that, if a blocker remains, stop and report the exact unresolved issue and the evidence or decision you need. Do not run an unlimited critique/rewrite loop, and do not re-draft sections that no finding names.

## Finding format

Keep findings machine-readable and specific:

```json
{
  "criterion": "accuracy",
  "severity": "block",
  "quote": "khi x tiến tới 0, một phần x tiến tới dương vô cực",
  "problem": "The two-sided limit does not exist; only the right-hand limit is +infinity.",
  "fix": "State x -> 0+ explicitly, then state the left-hand limit and the two-sided conclusion."
}
```

`severity` is `block`, `needs-work`, or `note`. A `block` finding must also appear in `blockers` as a short sentence.

## The review document

Minimum contract (extra fields are allowed):

```json
{
  "schemaVersion": 1,
  "narrationFile": "narration.md",
  "narrationSha256": "<sha256 of the exact approved bytes>",
  "status": "pass",
  "reviewedAt": "2026-11-05T00:00:00.000Z",
  "criteria": {
    "accuracy": "pass",
    "audienceFit": "pass",
    "narrativeArc": "pass",
    "reasoning": "pass",
    "continuity": "pass",
    "spokenLanguage": "pass",
    "pacing": "pass",
    "styleAndOriginality": "pass"
  },
  "blockers": [],
  "actionableFindings": [],
  "claimCheckFile": "claim-check.json",
  "reviewPasses": 1
}
```

Hash command:

```bash
node -e "const {createHash}=require('node:crypto');const fs=require('node:fs');console.log(createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" narration.md
```

Any edit to spoken prose makes the hash stale: mark the review stale, recheck the claims the edit touches, and invalidate only the affected audio chunks.

## Claim check

`claim-check.json` must reflect the review:

```json
{
  "status": "PASS",
  "claims": [
    {
      "claim": "(-2) x (-3) = 6",
      "source": "distributive law over the integers; arithmetic check",
      "verified": true,
      "risk": "low",
      "fix": null
    }
  ]
}
```

A claim with `verified: false` and `risk: high` or `critical: true` blocks. Low-risk unverified wording is a warning, not a pass for the episode: the review must still decide whether the script presents it as fact.

## Rejection example 1: engaging prose, wrong mathematics

> "Khi x tiến tới 0, một phần x tiến tới dương vô cực. Điều này cho thấy mọi giới hạn tại 0 đều kéo về cùng một hướng."

The voice may be excellent. The review still sets `accuracy: "block"` and `status: "blocked"`, with the one-sided correction and the two-sided conclusion. Good prose never certifies a false claim, and the deterministic validator must refuse to unlock audio while `blockers` is non-empty.

## Rejection example 2: correct mathematics, formula-by-formula narration

> "a cộng b, tất cả bình phương, bằng a bình phương cộng hai ab cộng b bình phương. Tiếp theo, a trừ b, tất cả bình phương, bằng a bình phương trừ hai ab cộng b bình phương. Tiếp theo ..."

Every line is true, and none of it explains where `2ab` comes from. Set `narrativeArc`, `reasoning`, and `continuity` to `needs-work`, and request one targeted rewrite of the middle section: count the four products, show the two cross terms, then state the geometric condition. Keep the rest of the script.

## Cross-genre use

The rubric does not require a mathematical proof. For documentary and history, accuracy means dates, names, quotes, and the distinction between record and inference. For a product explainer, reasoning means the trade-off and the condition where the product is wrong. For an essay, continuity means the thesis is visible, not that every section follows a formula. Do not force a five-step lesson onto a genre that does not need one; do not excuse a missing through-line either.
