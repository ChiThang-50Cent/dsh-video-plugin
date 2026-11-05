---
name: video-narration
description: Write, audit, edit, review and freeze listener-first spoken narration before storyboard, TTS or scene work. Use for any narrated explainer, documentary, essay, history or science piece, and to repair mechanical scene-driven scripts.
---

# Narration: listener-first controller

The narration is the film's spine. Write a complete spoken essay/lesson **before** visual decomposition, so a listener can follow the main line with the screen off. Visuals deepen understanding; they never carry missing connective tissue.

This skill is the G0 controller. It produces the draft, the claim audit, the editorial review, and the frozen hash that downstream skills must consume.

## Inputs

- `request.md` and `execution-brief.md`: purpose, audience, language, length, constraints, mode (`draft-only` or `produce`), style reference.
- Sources and `research-notes.md`: what may be claimed, what is uncertain, what is missing.
- Project/series style, if any. The user's style reference is architecture, not wording.
- Read `video-intake` first when the request is new or the audience is unclear.

## Outputs (episode root)

| File | Content |
|---|---|
| `narration.md` | Spoken prose; headings, blockquote notes and fenced display blocks are non-spoken. |
| `claim-check.json` | Checkable claims with source/derivation, `verified`, `risk`, `fix`; top-level `status` (`PASS`, `FAIL`, `BLOCKED`, `PENDING`). |
| `narration-review.json` | Rubric verdict, blockers, findings, exact file hash, `status` (`pass`, `needs-work`, `blocked`). |

`audio/segments.json` is created later by `video-audio`; it must reproduce this frozen prose exactly.

## Non-spoken conventions

The deterministic extractor in `scripts/validate-narration.mjs` speaks only paragraphs. Keep out of speech:

- YAML frontmatter, ATX headings (`#`, `##`, ...), blockquote lines (`>`), fenced code blocks, HTML comments, horizontal rules.
- §Use headings for section labels and `>` lines for production notes, scene hints, or source reminders.
- Put displayed math or derivations in fenced blocks. Write the spoken version in the paragraph: `a cộng b, tất cả bình phương`, not `(a+b)^2` or raw LaTeX.
- Never put scene directions, camera notes, or "as you can see" inside spoken paragraphs.

## Sequence

1. **Know the promise.** State in one sentence what the listener will understand or feel by the end. Name the central question and the one idea that answers it. If the brief gives no audience, use intake; do not invent a different film.
2. **Plan the path.** Choose the fewest examples that do different work: intuition, proof, counterexample, application. Decide where the listener is likely to resist or misread, and where the bridge must explain why the next step is needed.
3. **Draft in paragraphs.** Write the full spoken prose in `narration.md` before any scene plan. Open with a concrete puzzle, observation, conflict, or question — not a greeting or hype. Explain between calculations. End by returning to the opening idea and saying what changed.
4. **Audit claims.** Record every checkable claim in `claim-check.json` with source or derivation. Verify arithmetic, equivalence, domains, one-sided/two-sided limits, denominators, endpoint conditions, dates, names, quotes. Prefer deterministic checks over self-confidence. A missing essential source is a blocker, not an invitation to invent.
5. **Edit once, substantially.** Read aloud. Remove filler, duplicate explanations and sentences that only announce the next sentence. Fix continuity, voice, and pronunciation of formulas. Touch flagged sections, not the whole script.
6. **Review and freeze.** Read `references/script-review.md`, score all eight criteria, write `narration-review.json` with the SHA-256 of the exact approved `narration.md`, then run:
   `node <studio>/scripts/validate-narration.mjs <episode-dir>`
   Only `status: "pass"`, empty `blockers`, and a matching hash unlock audio.
7. **Hand off.** Give storyboard, reuse, audio and QA the review file and hash. Spoken prose is immutable from here; later changes go through a revision request to the producer.

`draft-only` stops after step 7 and reports the reviewed draft, unresolved issues, and what is missing — with no TTS, scene work, or render.

## What the draft must do

- **Through-line:** one or a few coherent ideas; no unrelated topic list, no separate mini-lectures.
- **Bridges:** after a significant result, say what it means and why the next step follows.
- **Reasoning:** explain why a rule is valid; distinguish a rule from its justification.
- **Specificity:** concrete examples, each earning its runtime; vary their function.
- **Scope:** assumptions, conditions, limitations and common traps stated where they matter, not dumped as footnotes.
- **Payoff:** reconnect the ending to the opening and name what the listener now understands.
- **Voice:** one consistent address form; natural Vietnamese; no visual-only references.

Do not force a fixed five-step formula. A short, a documentary, and a proof need different pacing; project style and audience override generic patterns.

## Style and examples

- If the project lists `styleRefs`, read those `library/styles/<id>/notes.md` packages first; they specialize the generic guide. Keep their constraints in your process, never their sentences: reference material does not enter `narration.md` or an installed skill, and it is not a factual source.
- Read `references/narration-style-vi.md` when writing or editing Vietnamese, choosing the voice, or adapting to a genre. It includes formula vocalization and what not to imitate from a long reference sample.
- Read `references/annotated-examples.md` before drafting a nontrivial explanation or when a draft feels like a list of scene captions. It shows four before/after cases: a numeric pattern, `(a+b)^2`, a one-sided limit, and a non-math documentary opening.

## Review and revision budget

- Read `references/script-review.md` at review time. Score accuracy, audience fit, narrative arc, reasoning, continuity, spoken Vietnamese, pacing, and originality.
- Hard blockers include a false claim, an unverified high-risk statement presented as fact, missing essential evidence, garbled spoken math, a missing central explanation, and a script that is only captions.
- Default budget: first draft + one substantive editorial pass + at most one targeted fix pass. If still blocked, report the exact issue and the decision or evidence needed; do not loop or silently synthesize.

## Freeze invariant

- The approved hash covers the exact `narration.md` bytes. Any spoken change makes the review stale.
- If spoken prose changes, recheck only affected claims, invalidate affected audio chunks and timings, and keep unchanged audio.
- If only visuals change, the narration hash and valid TTS caches stay.
- Storyboard or scene workers may not alter approved dialogue; they propose a revision to the producer.

## References

| File | Read when |
|---|---|
| `references/narration-style-vi.md` | Drafting or editing Vietnamese; choosing voice or genre variation; vocalizing formulas. |
| `references/annotated-examples.md` | Before a nontrivial explanation; when a draft reads like scene captions; when repairing a weak bridge. |
| `references/script-review.md` | At G0 review; when a blocker needs a precise fix; when judging cross-genre scripts. |
