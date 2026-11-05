# Implementation report: narration-first writing system (V3)

Status: implemented and tested in this checkout. No TTS was called and no video was rendered.

## 1. What changed

The narration step is now a real gate instead of advice. An episode drafts listener-first prose, audits claims, runs one editorial pass, records a rubric review with the exact file hash, and freezes that hash. Storyboard, audio and scene work consume the frozen narration; `scripts/validate-narration.mjs` refuses to unlock audio when the review is missing, stale, blocked, or when a claim or segment-coverage check fails.

The nine-skill architecture and the two existing Agent Presets are unchanged. No new skill, subagent, renderer, TTS provider or orchestrator was added.

## 2. Repository integration note

The request names `.agents/skills/...`. This checkout moved the studio skills to `skills/` and registers them profile-wide from `index.js`, so they load in any workspace (the earlier workspace-independence change). The same files are updated; nothing was duplicated under `.agents/`. `video-narration/references/` is new.

The user's long indeterminate-forms transcript was **not present when the first implementation landed**. It was supplied afterwards, stored at `library/styles/indeterminate-forms/reference.vi.md`, and read; the style guide was then checked against the actual text and one sentence was corrected (see section 9). The installed skills still contain no transcript text.

## 3. Files

| Path | Change |
|---|---|
| `skills/video-narration/SKILL.md` | Rewritten as the G0 controller: inputs, outputs, non-spoken conventions, draft -> audit -> edit -> review -> freeze sequence, handoff rules, reference pointers, revision budget, freeze invariant. |
| `skills/video-narration/references/narration-style-vi.md` | New. Voice and address consistency, paragraph rhythm, transitions, rhetorical questions, analogies, formula vocalization table, terminology, genre variations, what not to imitate from the sample, read-aloud checklist. |
| `skills/video-narration/references/annotated-examples.md` | New. Four before/after cases: `n^2=(n-1)(n+1)+1`, `(a+b)^2` and the origin of `2ab`, `x/x^2` with one-sided and two-sided limits, and a non-math documentary opening. Each states why the better version is better for listening and records the correctness condition. |
| `skills/video-narration/references/script-review.md` | New. Eight-criterion rubric with pass/needs-work/block anchors, hard blockers, finding format, review JSON contract and hash command, claim-check contract, revision budget, two rejection examples, cross-genre guidance. |
| `skills/video-produce/SKILL.md` | Narration gate is step 3 and blocks audio/scenes/workers; `draft-only` stops after the reviewed draft; gate rules, scheduling (one editorial pass; at most one targeted fix), failure policy. |
| `skills/video-storyboard/SKILL.md` | Consumes frozen narration and review hash; beats reference segment IDs/spans; no rewrite; only affected scenes become stale after a narration change. |
| `skills/video-audio/SKILL.md` | Precondition gate; `audio/segments.json` contract; exact coverage of spoken prose; `spokenText` pronunciation-only; cache fingerprint fields; measured WAV durations. |
| `skills/video-qa/SKILL.md` | G0 now checks review status/hash, claims, rubric quality and segment coverage via the validator; G1-G4 preserved. |
| `skills/video-intake/SKILL.md` | Records genre, prior knowledge, style-reference role and source certainty; both modes state that the gate applies. |
| `AGENTS.md` | One permanent rule: listener-first, matching review PASS + SHA-256, run the validator, never synthesize or storyboard from a draft/stale/blocked script. |
| `scripts/validate-narration.mjs` | New deterministic gate and reusable module. |
| `scripts/new-episode.mjs` | Scaffolds `narration-review.json` as `blocked`, with the placeholder hash, so a fresh episode cannot synthesize by accident. |
| `tests/narration.test.mjs` | New focused tests (gate, claims, hash, coverage, LaTeX, scaffold, skill metadata). |
| `tests/fixtures/narration-negative.md` | New Vietnamese listener-first lesson on negative times negative. |
| `tests/fixtures/narration-documentary.md` | New non-math documentary opening with source certainty. |
| `tests/fixtures/narration-limit-bad.md` | New engaging-but-false two-sided limit script. |
| `tests/fixtures/narration-fragments.md` | New scene-caption anti-pattern. |
| `library/styles/indeterminate-forms/style.json` | New. Metadata, language, rights, source and notes pointers for the user-provided style reference. |
| `library/styles/indeterminate-forms/reference.vi.md` | New. The user-provided transcript, stored verbatim in the workspace library. Not in package `files`; rights note forbids embedding/redistribution. |
| `library/styles/indeterminate-forms/notes.md` | New. Derived style guidance and a mathematical audit; the reusable extract. |
| `library/styles/README.md` | New. Style-package convention, `styleRefs`, rights and validation. |
| `scripts/validate-style-refs.mjs` | New. Validates a project's `styleRefs` against `library/styles/<id>/`. |
| `tests/style.test.mjs` | New. Style-package and CLI validation tests. |
| `kit/project.json` | Adds `styleRefs: []` so new episodes opt in explicitly. |
| `package.json` | `validate:narration` and `validate:styles` scripts; `skills/**/*.md` in `files`; version `0.4.0`. |
| `README.md`, `docs/architecture.md`, `docs/acceptance.md`, `docs/examples.md` | Workflow, artifacts, gate commands, acceptance checks and examples updated. |

## 4. G0 contract

Episode artifacts:

- `narration.md` — spoken prose. Non-spoken by deterministic extraction: YAML frontmatter, ATX headings, blockquote notes, fenced code/display blocks, HTML comments, horizontal rules.
- `claim-check.json` — top-level `status: "PASS"`, claims with `verified`, `risk`/`severity`, source or derivation. An unverified high-risk/critical claim blocks.
- `narration-review.json` — eight criteria all `pass`, empty `blockers`, `status: "pass"`, and `narrationSha256` of the exact approved bytes.
- `audio/segments.json` — optional before synthesis, required with `--require-segments`: ordered `id`, exact `text`, optional pronunciation-only `spokenText`, `narrationSha256`.

Commands:

```bash
node scripts/validate-narration.mjs <episode-dir>
node scripts/validate-narration.mjs <episode-dir> --segments audio/segments.json --require-segments
node scripts/validate-narration.mjs <episode-dir> --json
```

Exit codes: `0` pass, `1` gate/content failure (missing/stale/blocked review, claim blocker, coverage mismatch, raw LaTeX, missing required segments), `2` usage or unreadable episode directory.

The hash covers raw file bytes, so any whitespace edit makes the review stale. Repairing a script requires updating the review hash and only the affected segments.

## 5. Acceptance evidence

Deterministic validator runs on the fixtures (all reproduced by the test suite):

| Case | Fixture / review | Command | Result |
|---|---|---|---|
| A. Listener-first Vietnamese | `narration-negative.md`, pass review | `validate-narration.mjs` | exit 0; 2,969 spoken chars; review pass; claims PASS (2) |
| B. False two-sided limit | `narration-limit-bad.md`, accuracy `block` | `validate-narration.mjs` | exit 1; `review status is "blocked"`, `criteria.accuracy is "block"`, blocker names the one-sided correction |
| C. Scene captions | `narration-fragments.md`, arc/reasoning/continuity `needs-work` | `validate-narration.mjs` | exit 1; arc/reasoning/continuity errors; caption blocker |
| D. Freeze/coverage | pass episode + 2-segment manifest | `--require-segments` | exit 0 |
| D. Drop one segment | same | `--require-segments` | exit 1; `segment coverage does not match ... at character ...` |
| D. Change a segment word | same | `--require-segments` | exit 1; coverage mismatch |
| D. Change one narration word | same | `--require-segments` | exit 1; `review hash does not match narration.md`, `segments were built from a different narration hash`, coverage mismatch |
| D. Repair subset | rewrite narration + review hash, keep manifest | `--require-segments` | exit 0 |
| E. Documentary | `narration-documentary.md`, pass review | `validate-narration.mjs` | exit 0; 1,921 spoken chars |
| F. Regression | full suite | `node --test tests/*.test.mjs` | 20 pass, 0 fail |
| LaTeX guard | prose containing `\frac{1}{2}` | `validate-narration.mjs` | exit 1; raw-LaTeX blocker |
| Required segments | pass episode without manifest | `--require-segments` | exit 1; segment manifest required |

Fresh-episode scaffold check:

```text
$ node scripts/new-episode.mjs demo-series ep-001     # VIDEO_STUDIO_ROOT=/tmp/...
$ node scripts/validate-narration.mjs .../ep-001
review: blocked, claims: PENDING
ERROR: review status is "blocked"; expected "pass"
ERROR: claim-check status is "PENDING"; expected "PASS"
RESULT: FAIL
```

Focused tests are in `tests/narration.test.mjs` and cover A-E, the high-risk claim gate, raw LaTeX, required segments, the scaffold behavior and skill metadata/reference links.

## 6. Live registration

The bundle was reloaded so the running profile re-read `skills/`. An independent verification agent working in `/tmp/foreign-ws` loaded `video-narration` through the `skill` tool:

- the call succeeded and the catalog description was the new one ("Write, audit, edit, review and freeze listener-first spoken narration ...");
- all three references were named, both inline and in the References table;
- `validate-narration.mjs` was named twice (extractor note and gate command);
- the gate sentence quoted back was: "Only `status: "pass"`, empty `blockers`, and a matching hash unlock audio."
- paths still resolved to the absolute studio root, not the session cwd.

Bundle version bumped to `0.4.0` for this skill/validator/style-package upgrade.

## 7. Reference transcript received after the first implementation

The user supplied the full Vietnamese lecture on indeterminate forms after the first pass. It is stored at `library/styles/indeterminate-forms/`:

- `reference.vi.md` — the transcript verbatim, with the rights note in `style.json`;
- `notes.md` — the reusable extract: what works, voice/address drift, scope warning, display-versus-spoken handling, and a mathematical audit;
- `style.json` — `id: indeterminate-forms`, language `vi`, genre `math-explainer`, rights, `useAs` and `doNotUseAs`.

What the analysis changed:

- The first version of `narration-style-vi.md` called the sample's limit statement "unqualified". The actual text says `x -> 0 from the positive side`, so the right-hand statement `1/x -> +infinity` is correct. The real issue is that the examples are introduced as two-sided `x -> 0` and the conclusion never states the left-hand limit or that the two-sided limit does not exist. The guide now says exactly that, and the audit in `notes.md` records the required correction.
- The sample mixes `chúng ta`, `mình`, `các bạn` and `bạn`; the guide now names that drift as a thing to avoid copying.
- The sample covers `0/0`, `∞/∞`, L'Hôpital and five more forms in one video; the notes mark that as series scope, not one-episode scope.

Other audited claims (factorization, conjugation, degree rule, `ln x / x`, `x^2 / e^x`, L'Hôpital cautions, `x ln x`, `sqrt(x^2+x) - x`, `(1+1/x)^x = e`) are correct; the notes list them and the domain caveat for `x ln x`.

`project.json` now supports `styleRefs: ["<id>"]`; `video-intake`, `video-narration` and `video-workspace` read the notes first, and `scripts/validate-style-refs.mjs` checks that every referenced package exists, declares its id/language/rights, and has an existing source and notes file.

## 8. Limitations and residual risk

- The review is qualitative and model-judged; the deterministic helper enforces structure, hash, claim status and segment coverage, not prose quality. The rubric keeps that judgement explicit and evidence-backed.
- The validator's spoken-prose extraction is convention-based: display math must live in fenced blocks; headings, blockquotes and fenced blocks are not spoken. A writer who puts spoken text in a quote block loses it from the comparison.
- `claim-check.json` cannot prove a source exists. It records verification; a fabricated citation still needs human or retrieval checks.
- No TTS, scene worker or render ran, by instruction. No full film was produced, so no production timing comparison is claimed.
- The indeterminate-forms transcript is user-provided workspace material. It is stored with a rights note and excluded from the package `files`; it must not be redistributed or embedded in a skill without permission. Its math audit is human-reviewed, not machine-proved.
- Git was not used; the repository is a plain checkout, so no commit was produced.

## 9. How to use

1. Start a narrated episode with `video-produce` or `video-narration`.
2. Draft `narration.md` as prose; keep display math in fenced blocks and notes in `>` lines.
3. Record `claim-check.json`; fix or block missing/high-risk claims.
4. Read `references/script-review.md`, run one editorial pass, write `narration-review.json` with the hash and criteria.
5. Run the validator. On failure, fix the named issue; do not start TTS.
6. Storyboard and audio consume the frozen file; run `--segments audio/segments.json` before synthesis.
7. `draft-only` ends after the reviewed draft; `produce` continues only from a passing gate.

Efficiency: one producer, one editorial pass, at most one targeted fix, no extra agents, no TTS or render in this task.
