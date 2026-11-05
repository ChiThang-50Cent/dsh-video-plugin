# Migrating to the 0.5 evidence gates

## What changed

- Narration G0 has separate mechanical (`--integrity`) and editorial (`--editorial`) gates.
- `claim-check.json` requires schemaVersion 2: each claim needs `verified`, risk, evidence/derivation and a location whose excerpt exists in `narration.md`; coverage is explicit.
- `narration-review.json` requires schemaVersion 2: cited evidence for all eight criteria, complete-section coverage, findings with evidence/fix/resolution status, a reviewer block, the exact hash, and an independent review when risk is high.
- `throughline-map.json` is required for narrated/mixed episodes.
- `audio/segments.json` is schemaVersion 2; `spokenText` differences require declared pronunciation overrides with provenance and justification.
- Release is `validate-episode.mjs --release`; plain validation is lint.
- Mode comes from `production.json`; silent/text-only episodes do not need narration.

## Legacy v1 artifacts

A v1 `status: "pass"` review is not accepted by the new gate. This is intentional: the old review did not cite evidence, claim locations or through-line coverage. Do **not** edit the old production's narration or master to force a pass, and do not bulk-rewrite reviews as PASS.

Use the migration scaffold:

```bash
node scripts/migrate-narration.mjs <episode-dir>
# writes:
#   throughline-map.migrating.json
#   claim-check.migrating.json
#   narration-review.migrating.json   (status: blocked)
```

The command does not modify `narration.md`, `narration-review.json` or `claim-check.json`. Fill every through-line field, add/verify claims with real locations, perform the editorial (and independent, when high-risk) review, write the cited evidence and findings, then rename the three files only after the review is genuinely done. Run:

```bash
node scripts/validate-narration.mjs <episode-dir> --integrity
node scripts/validate-narration.mjs <episode-dir> --editorial
```

For an intentional narration change, use `revise-narration.mjs` instead; it archives the old script and blocks/invalidate downstream artifacts.

## Project files

- Add `production.json` (`{"schemaVersion":1,"mode":"narrated","voiceOver":true,...}`) to older episodes if it is missing; narrated is inferred for legacy episodes that have narration.
- Add `defaultMode` to new project contracts (the kit already has it).
- Existing storyboards/timelines remain structurally compatible; release now verifies the master and QA bindings.

## Scene catalog

The catalog still uses `schemaVersion: 1`. New entries add `backendCompatibility`, `sourceSha256`, `previewSha256`, `qaSha256`, `qaEvidence`, `templateVersion` and `sourceEpisode`. Old entries without hashes remain readable but should be re-promoted if reused.

## Data root

Existing `projects/`/`library/` under a checkout keep working. To move data, set `VIDEO_STUDIO_ROOT` or `studio.config.json`, run `init-workspace.mjs` once (non-destructive), and verify `studio-root.mjs`. Built-in style files are copied only when missing.
