---
name: video-narration
description: Write, audit, edit, review and freeze listener-first spoken narration with a mechanical integrity gate and a separate evidence-based editorial gate. Use for any narrated explainer, documentary, essay, history or science piece, and to repair mechanical scene-driven scripts.
---

# Narration: editorial controller (G0)

The narration is the film's spine. Write a complete spoken essay/lesson **before** visual decomposition, so a listener can follow the main line with the screen off. Visuals deepen understanding; they never carry missing connective tissue.

This skill owns G0: the draft, through-line map, claim audit, editorial review and frozen hash that downstream skills consume.

## Inputs

- `request.md`/`execution-brief.md`: purpose, audience, language, length, mode (`draft-only`/`produce`), production mode (`narrated`, `silent`, `text-only`, `mixed`), risk and style refs.
- Sources and `research-notes.md`: what may be claimed, what is uncertain, what is missing.
- Project style. A style reference is architecture, not wording. Read `video-intake` first when the audience is unclear.

## Outputs (episode root)

| File | Content |
|---|---|
| `throughline-map.json` | Central question, promise, audience, and every section's purpose, connection, position and takeaway. |
| `narration.md` | Continuous spoken prose. Frontmatter, headings, blockquotes, fenced blocks and HTML comments are non-spoken. |
| `claim-check.json` | Schema v2 claims with `verified`, risk, evidence/source or derivation, a narration location and explicit coverage. |
| `narration-review.json` | Schema v2: eight criteria with cited evidence, findings and resolutions, reviewer identity, through-line pointer, SHA-256. |
| `audio/segments.json` | Later, by `video-audio`. Canonical `text` reproduces the frozen prose exactly. |

## Two gates

- **Mechanical integrity** (`--integrity`): schemas, hash, references, required fields, claim locations, through-line coverage, review evidence locations, exact segment coverage.
- **Editorial/content** (`--editorial`): the review is evidence-based, covers every section, resolves its findings, cites high-risk claims and addresses high-confidence defects.
- `--gate` (default) requires both. PASS means review evidence is complete and consistent; it never proves prose quality or mathematical truth. That judgement is recorded and attributable.

## Workflow

1. **Know audience and promise.** Name the central question, the one idea that answers it, prior knowledge and allowed sources. Use intake when brief; never invent a different film.
2. **Plan the through-line before prose.** Write `throughline-map.json`: each section's purpose, connection to the question, why it is here, and the takeaway. If a section cannot answer "why here?", it is a digression or a deletion.
3. **Draft one continuous narration.** Complete paragraphs, not TTS beats or scene captions. Open from a concrete observation, puzzle, conflict or question, not a greeting or channel boilerplate. Explain between calculations.
4. **Read it once, aloud, in full.** Do not score or edit during the first reading. Listen for through-line, bridges, rhythm, repeated slogans and unsupported claims.
5. **Critique structure.** Fix forced openings, excess abstraction, disconnected examples/digressions, unnecessary scope, repeated abstract conclusions, weak transitions, unsupported conclusions, examples that add nothing and visual-only references.
6. **Audit facts and mathematics.** Record every checkable claim with source/derivation and a real location. Verify arithmetic, algebra, domains, denominators, one-sided/two-sided conditions, boundary cases, dates, names and quotes. Check pedagogical consistency: terms defined before use, examples matching the audience, no contradictions.
7. **Revise from concrete findings.** Touch flagged sections, not the whole script. Record resolutions. A missing blocking source stops the episode; do not invent a citation.
8. **Review independently when risk requires it.** High-risk or quality-sensitive scripts need one separate review pass with fresh context (a review-capable DSH subagent, or a fresh top-level review session; do not force the scene-worker preset into review) reading the complete script, brief, sources and style. The reviewer does not write scenes, synthesize audio or render. Use `scripts/editorial-review.mjs` as a pre-scan, then verify and add semantic findings. Never pass your own unexamined draft: record `reviewer`, `independentReview` and citations.
9. **Lock and split.** Only after blocking findings are resolved: `status: "pass"`, empty `blockers`, all eight criteria `pass` with cited evidence, exact SHA-256. Run the validator, then hand to storyboard/audio.

`draft-only` stops after step 9 with the draft, unresolved issues and missing evidence.

## What a quality PASS requires

- Every criterion is `pass` with at least one real narration excerpt (`criteriaEvidence`) and a note explaining the judgement.
- Citations cover every section through `criteriaEvidence`; `reviewedSections` is only a declaration, not evidence. Sampling only the opening is not a full review.
- Every finding has excerpt/paragraph, criterion, severity, problem, evidence, proposed fix and resolution status. A blocking finding must be `resolved` or `withdrawn`; open or escalated blocks G0 even if `blockers` is empty.
- Every high-risk claim is cited by accuracy evidence and has source/derivation plus a narration location. An empty claim list fails when numerals, percentages or displayed math appear, unless the content is genuinely claim-free and the coverage declaration justifies it.
- High-risk work has an independent reviewer whose hash matches and whose evidence cites the script.

Read `references/script-review.md` for full contracts and procedure. Do not produce PASS by filling every field with "pass"; evidence is the point.

## Through-line map

Required for narrated/mixed episodes: `centralQuestion`, `promise`, `audience`, and `sections[]` with `sectionId`, exact `heading` (or null), `purpose`, `connectionToCentralQuestion`, `whyHere`, `audienceTakeaway`, `claimRefs`. Every section with spoken prose is mapped once, in order. Placeholders (`TODO`, `n/a`) fail. With no headings, map `preamble`.

## Vietnamese educational narration

Preferred shape: **curiosity → observation → reasoning → discovery → generalization** — begin with something noticeable, explain why it happens, name the discovery, generalise and state limits. It is a preference, not a rigid formula; documentary, essay, product and short genres choose their own arc. Use `library/styles/indeterminate-forms` as an editorial benchmark for bridges, example arcs and warnings, never as wording, scope or address to copy.

Read `references/narration-style-vi.md` when writing Vietnamese and `references/annotated-examples.md` before a nontrivial explanation or when a draft reads like captions.

## Spoken-text contract

- **Canonical narration**: approved `narration.md` bytes and spoken prose.
- **Display text**: on-screen wording; subtitles/transcripts derive from it. Segment `displayText` must equal canonical `text`.
- **Spoken pronunciation**: only through declared `pronunciation.overrides` with `from`, `to`, `kind`, `provenance` and `justification` (`16` → "mười sáu", `%` → "phần trăm").
- An override may **never** change a number, operator, sign, quantity or claim. `trừ` → `cộng`, `âm` → `dương`, a changed number or omitted quantity fails G0 even if marked reviewed. A meaning-preserving ambiguous reading (`trừ` → `dấu trừ`) needs `reviewed`, `reviewedBy` and a resolved `reviewRef`.
- Intentional changes go through `scripts/revise-narration.mjs` with a reason: it archives the old script, blocks the review and invalidates segments. Never hand-edit a frozen script.

## Budget and escalation

Default: first draft + one substantive editorial pass + at most one targeted fix. A second independent content review is risk-based, not ritual. If a blocker remains, report the exact issue and evidence/decision needed; do not loop, lower the bar or synthesize a draft.

## References

| File | Read when |
|---|---|
| `references/narration-style-vi.md` | Drafting/editing Vietnamese; voice, genre, formula vocalization, teaching pattern. |
| `references/annotated-examples.md` | Nontrivial explanations, caption-like drafts, weak bridges, the algebra editorial case. |
| `references/script-review.md` | G0 review, findings/evidence, independent review, claim and review schemas. |
