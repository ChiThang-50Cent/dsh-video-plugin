# Script review and the G0 gate

Read this when reviewing a narration draft, when a review is challenged, or when a blocked script needs a focused repair. The review judges the **script**, not the scenes, the render, or how much effort the draft took.

## Artifacts

| File | Role |
|---|---|
| `throughline-map.json` | Central question, promise, audience and every section's purpose/connection/position/takeaway. |
| `narration.md` | Spoken prose plus non-spoken headings, notes and display blocks. |
| `claim-check.json` | Schema v2 claims with evidence/derivation and a location in the narration; explicit coverage. |
| `narration-review.json` | Schema v2 verdict, cited evidence, findings/resolutions, reviewer identity and the approved hash. |
| `audio/segments.json` | Created later by the audio step; must reproduce the frozen spoken prose exactly. |

The producer runs `node <studio>/scripts/validate-narration.mjs <episode-dir>` after writing the review. That command has two distinguishable gates:

```bash
node scripts/validate-narration.mjs <episode-dir> --integrity   # schemas, hash, refs, coverage
node scripts/validate-narration.mjs <episode-dir> --editorial   # evidence-based quality process
node scripts/validate-narration.mjs <episode-dir>               # both (default)
```

A model statement that the script "looks good" is not a gate. Neither deterministic gate proves truth: they verify identity, structure and evidence presence. The truth claim rests on the cited review, the independent reviewer when required, and human accountability.

## Procedure

1. Read `request.md`, `execution-brief.md`, sources, style requirements and `throughline-map.json`. Know what the episode promised.
2. Read `narration.md` once, aloud and in full, before scoring anything. Do not stop at the first awkward sentence.
3. Run `node <studio>/scripts/editorial-review.mjs <episode-dir> --write-suggestions` to detect known anti-patterns. Treat its output as triage, never as the review. Add the semantic findings it cannot see.
4. Audit claims first. For every checkable statement, confirm source or derivation and point to where it occurs. For mathematics, verify domains, one-sided versus two-sided statements, denominators, endpoint conditions, sign rules, and whether a geometric argument assumes nonnegative lengths.
5. Check the through-line. Every section must state why it is there and what it adds to the central question. A section that only restates the thesis is repetition, not development.
6. Score the eight criteria below. Use `pass`, `needs-work` or `block`; every non-pass needs a concrete quote and a fix.
7. Write findings that name a location and an action, not a mood: quote the sentence, say what is wrong for a listener, give evidence/reasoning, say what to do.
8. Resolve findings in the text, not just in the JSON. A finding marked `resolved` while the offending sentence remains is a contradiction; the editorial gate detects this for known high-confidence issues.
9. Compute the SHA-256 of the exact approved `narration.md` bytes and record it. Do not record a hash of a later edit.
10. Run the validator. Fix review evidence, not the validator.

## Mechanical versus editorial

**Mechanical integrity** checks: file presence, schema versions, hash match, through-line coverage/order, claim IDs and locations, review criteria/evidence references, finding fields and statuses, independent-review hash, segment coverage and pronunciation reconstruction. A PASS here means "the evidence is structurally valid and attached to this exact script".

**Editorial evidence** checks: every criterion is pass with a real excerpt, every section is cited, findings are resolved as claimed, high-risk claims are cited, and detected high-confidence editorial defects are either absent or explicitly addressed. A PASS here means "the review process is credible and complete enough to trust", not "the mathematics has been proved".

Both gates are necessary. Neither is sufficient for truth. Never write or imply that regex or schema checks verified a mathematical claim.

## Rubric

### 1. Accuracy and source fidelity

- **pass**: every checkable claim is correct or correctly hedged; assumptions and conditions are stated where they change the answer; contested claims are attributed; each high-risk claim has evidence/derivation and a location.
- **needs-work**: a claim is vague enough to mislead, or a condition is implied but never said.
- **block**: a false mathematical or factual claim; an unverified high-risk statement presented as fact; a source invented or misattributed; a high-risk claim with no evidence.

### 2. Audience fit

- **pass**: prior knowledge is respected; terms are introduced when needed; depth matches the stated audience.
- **needs-work**: a term is used before it is defined, or a passage explains what the audience already knows while skipping the hard step.
- **block**: the script assumes knowledge the brief excludes, or explains so little that the promised outcome is unreachable.

### 3. Narrative arc / through-line

- **pass**: a concrete opening question or situation, development with a reason to continue, and an ending that changes what the listener understands.
- **needs-work**: the opening is generic, the middle is a list, an example is a digression, or the ending only summarizes sections.
- **block**: there is no through-line; the script is a sequence of unrelated captions, mini-lectures or repeated theses.

### 4. Reasoning quality

- **pass**: explains why the crucial step is valid; anticipates at least one likely misconception; distinguishes a rule from its justification; names a new identity before using it.
- **needs-work**: states the rule and an example but not the reason; a misconception is mentioned without being resolved; an unexplained switch between identities.
- **block**: the central explanation is absent or wrong; the script asserts authority instead of reasoning.

### 5. Continuity

- **pass**: each section follows from the previous one for a stated reason; references are audio-only safe; no sentence exists only to announce the next.
- **needs-work**: a jump needs a bridge; a callback is unclear; a formula appears before its purpose is established.
- **block**: sections contradict each other or require the visuals to make basic sense.

### 6. Spoken Vietnamese

- **pass**: reads aloud naturally; one consistent address; formulas are pronounced; no raw LaTeX, slide fragments or visual-only deixis; pronunciation overrides are meaning-preserving and justified.
- **needs-work**: a sentence is hard to say, register slips, or a formula is read symbol by symbol.
- **block**: spoken text is unintelligible, garbled mathematics, a string of captions, or an override that changes an operator/number/sign.

### 7. Pacing and information density

- **pass**: examples earn their runtime; length is appropriate to the promise; repetition is deliberate.
- **needs-work**: a section over-explains arithmetic or rushes the conceptual leap; an example adds nothing new.
- **block**: the script cannot fit the stated duration without losing essential content, or pads to fill it.

### 8. Originality and style

- **pass**: honors the project voice and the stated reference without copying its sentences; examples are original.
- **needs-work**: the voice drifts, or the structure imitates the sample literally instead of its reasoning.
- **block**: reproduces copyrighted or user-provided narration at length, or claims a source it did not use.

## Hard blockers

Any one of these sets `status: "blocked"` and prevents audio:

- A false mathematical or factual claim.
- An unverified high-risk claim presented as fact, or a high-risk claim without evidence and a narration location.
- A missing essential source with no justified workaround.
- Spoken mathematics that cannot be pronounced as written, or a pronunciation override that changes meaning.
- The central explanation missing.
- A script that is only isolated scene captions.
- A review hash that does not match `narration.md`.
- A blocking finding that is open or escalated, even if `blockers` is empty.

## Finding format

Every finding is machine-readable and specific:

```json
{
  "id": "F03",
  "criterion": "reasoning",
  "severity": "block",
  "excerpt": "Lấy ví dụ chín mươi chín nhân một trăm lẻ một.",
  "paragraph": 12,
  "sectionRef": { "sectionId": "sec-05" },
  "problem": "The narration uses a difference of squares without introducing it in speech; the previous identity was the square of a sum.",
  "evidence": "The listener has only heard (a+b)^2; the displayed a^2-b^2 appears after the numeric example, so the spoken argument changes identity without a bridge.",
  "proposedFix": "Name the new identity, state it in speech, then show why 99 x 101 has the form a^2 - b^2.",
  "status": "open",
  "resolution": null
}
```

`criterion` is one of the eight keys. `severity` is `block`, `needs-work` or `note`. `status` is `open`, `resolved`, `escalated`, `withdrawn` or `accepted`. A resolved/withdrawn/accepted finding needs a `resolution` explaining what changed or why it is no longer a problem. A `block` finding must appear in `blockers` as a short sentence **and** be resolved/withdrawn before a pass. `accepted` is only legitimate for a note or needs-work item with an explicit rationale; it cannot silence a block.

## The review document (schema v2)

Minimum contract; extra fields are allowed:

```json
{
  "schemaVersion": 2,
  "narrationFile": "narration.md",
  "narrationSha256": "<sha256 of the exact approved bytes>",
  "status": "pass",
  "reviewedAt": "2026-11-05T00:00:00.000Z",
  "reviewer": {
    "kind": "independent",
    "id": "editor-2",
    "method": "fresh-context",
    "readFullScript": true
  },
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
  "criteriaEvidence": {
    "accuracy": [{
      "excerpt": "Đây là một câu thật trong bài.",
      "sectionRef": { "sectionId": "sec-02" },
      "paragraph": 3,
      "note": "Checked the derivation against claim c04; the condition is stated in the next sentence.",
      "claimRefs": ["c04"]
    }],
    "audienceFit": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-01" }, "note": "..." }],
    "narrativeArc": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-01" }, "note": "..." }],
    "reasoning": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-03" }, "note": "..." }],
    "continuity": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-04" }, "note": "..." }],
    "spokenLanguage": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-02" }, "note": "..." }],
    "pacing": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-03" }, "note": "..." }],
    "styleAndOriginality": [{ "excerpt": "...", "sectionRef": { "sectionId": "sec-05" }, "note": "..." }]
  },
  "reviewedSections": [{ "sectionId": "sec-01" }, { "sectionId": "sec-02" }],
  "blockers": [],
  "actionableFindings": [],
  "throughlineMap": "throughline-map.json",
  "claimCheckFile": "claim-check.json",
  "reviewPasses": 2,
  "independentReview": {
    "required": true,
    "status": "pass",
    "reviewer": { "kind": "independent", "id": "editor-2", "method": "fresh-context" },
    "reviewedAt": "2026-11-05T01:00:00.000Z",
    "narrationSha256": "<same hash>",
    "summary": "Read the full script and brief; checked the limit claim and the identity bridge.",
    "evidence": [{ "excerpt": "same real excerpt" }],
    "findingsReviewed": ["F01", "F03"]
  },
  "revision": 1
}
```

Rules:

- Every criterion needs at least one evidence entry. Every evidence `excerpt` must occur in the referenced narration section/paragraph.
- The evidence must cite every section through `criteriaEvidence`; `reviewedSections` is optional metadata, not a substitute for evidence. The validator checks complete-script coverage.
- `status: "pass"` with a non-pass criterion, a blocker, or an open blocking/needs-work finding is contradictory and fails.
- `reviewer.readFullScript` must be true for a pass. `method: "draft"` cannot review itself.
- High-risk episodes (risk marked high, quality-sensitive, or any high/critical claim) need either the primary reviewer to be genuinely independent or an `independentReview` with `status: "pass"` and a matching hash. An independent reviewer must not be the author and must not write scenes, TTS or renders.

Hash command:

```bash
node -e "const {createHash}=require('node:crypto');const fs=require('node:fs');console.log(createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" narration.md
```

Any edit to spoken prose makes the hash stale. Use `scripts/revise-narration.mjs` for an intentional revision; it archives and invalidates downstream artifacts instead of letting old audio survive a changed script.

## Claim check (schema v2)

```json
{
  "schemaVersion": 2,
  "status": "PASS",
  "reviewedAt": "2026-11-05T00:00:00.000Z",
  "coverage": { "claimsExpected": true, "justification": null },
  "claims": [
    {
      "id": "c01",
      "claim": "(-2)(-3) = 6 follows from distributivity",
      "derivation": "(-2)(3 + (-3)) = 0; -6 + (-2)(-3) = 0; hence the product is 6.",
      "verified": true,
      "risk": "medium",
      "location": {
        "sectionRef": { "sectionId": "sec-03" },
        "paragraph": 4,
        "excerpt": "âm sáu cộng với tích của âm hai và âm ba phải bằng không"
      }
    }
  ],
  "conditions": []
}
```

Rules:

- A claim cannot be marked verified without evidence/source or derivation **and** a location whose excerpt actually occurs in the narration.
- High-risk/critical claims must be verified and have evidence and a location; otherwise approval is blocked.
- An empty claim list is not silently audited. If the spoken prose contains numerals, percentages or displayed mathematics, the list must contain the claims. If the content is genuinely claim-free, declare `claimsExpected: false` and justify it; claim-bearing signals still fail.
- `source`/`derivation`/`evidence` records verification; a fabricated citation still needs human or retrieval checks. The validator cannot prove a source exists.

## Independent review protocol

Use one separate pass when the episode is high-risk or quality-sensitive. Prefer a review-capable DSH subagent; if the profile only configures a scene-worker preset, use a fresh top-level review session instead of misusing that preset. Record the method. The reviewer receives the complete `narration.md`, `execution-brief.md`, sources, style notes, `claim-check.json`, `throughline-map.json` and this rubric. The reviewer must not write scenes, synthesize TTS, render, or edit the narration; findings go to the producer.

The independent reviewer:

1. Reads the full script, not excerpts.
2. Runs `editorial-review.mjs` as a pre-scan and verifies or rejects each suggestion.
3. Checks claims against sources/derivations and locations.
4. Checks through-line, bridges, examples, repetition, register and listening comprehension.
5. Returns findings in the schema above, including excerpts, evidence and proposed corrections.
6. Records `independentReview` with the same narration hash and at least one real cited excerpt.

Bound the cycle: one independent pass, the author resolves findings, and at most one targeted re-review of the changed sections. If a blocking issue remains, escalate with the exact issue and evidence needed; never self-certify a PASS or lower the rubric.

## Rejection examples

**Engaging prose, wrong mathematics.** "Khi x tiến tới 0, một phần x tiến tới dương vô cực." The voice may be excellent, but this is false as a two-sided statement. Set `accuracy: "block"`, add a `block` finding with the one-sided correction, and block the episode. A fake self-review with every criterion `pass` does not override the claim or the missing independent review.

**Correct mathematics, formula-by-formula narration.** Every line is true, and none explains where `2ab` comes from. Set `reasoning`/`narrativeArc`/`continuity` to `needs-work` and request one targeted rewrite that counts the four products and states the geometric condition. Keep the rest.

**Correct pieces, unexplained pivot.** The algebra evaluation fixture moves from `(a+b)^2` to `99 x 101` without introducing `a^2 - b^2` in speech. The displayed derivation does not repair the spoken gap. Mark `reasoning` needs-work and give the exact sentence plus the required bridge.

## Cross-genre use

The rubric does not require a mathematical proof. For documentary and history, accuracy means dates, names, quotes, and the distinction between record and inference. For a product explainer, reasoning means the trade-off and the condition where the product is wrong. For an essay, continuity means the thesis is visible, not that every section follows a formula. Do not force a five-step lesson onto a genre that does not need one; do not excuse a missing through-line either.

## What the deterministic gate cannot do

- It cannot decide whether a claim is true, a source exists, or an example is apt.
- It cannot detect every weak transition, misleading abstraction or missing explanation.
- It cannot prove a review was performed honestly; it enforces cited evidence, hash identity, complete-section coverage, resolution consistency and high-risk independence.
- It treats a handful of high-confidence patterns (e.g. a two-sided limit asserted as one-sided, a forced meta opening, a verbatim repeated conclusion, an unexplained identity switch) as triage signals that a PASS review must address. Absence of those signals is not evidence of quality.
