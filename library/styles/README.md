# Style packages

`library/styles/` holds reusable narration styles. A style package is a directory `library/styles/<id>/` with:

| File | Role |
|---|---|
| `style.json` | Metadata: `schemaVersion`, `id`, `name`, `language`, `genres`, `description`, `source`, `notes`, `rights`, `useAs`, `doNotUseAs`. |
| source file | The reference itself (transcript, article, sample). User-provided material stays here and keeps its `rights` note. |
| `notes.md` | Short derived guidance: what to take, what not to copy, voice/address observations, scope, and a factual/mathematical audit. |

Projects select styles with an id list in `project.json`:

```json
{
  "styleRefs": ["indeterminate-forms"]
}
```

The ids resolve to `library/styles/<id>/` under the studio data root. `scripts/new-episode.mjs` writes an empty list, so a new series opts in deliberately.

## How agents use a style package

1. Read `style.json`, then `notes.md`. Read the source only when the notes are insufficient; never copy its sentences, structure one-for-one, or scope.
2. Treat the reference as style, not as a factual source. Claims still go through `claim-check.json`.
3. Record the usable constraints in `execution-brief.md` and reflect them in `narration.md` as original prose.
4. Check `notes.md` for known corrections before reusing an example. The `indeterminate-forms` package, for example, records a one-sided-limit qualification that must be stated explicitly.

## Rights

`style.json.rights` is mandatory. Do not include user-provided transcripts in the installed bundle (`skills/` or the npm `files` list), and do not redistribute them beyond the workspace unless the rights note allows it.

## Validate

```bash
node scripts/validate-style-refs.mjs projects/<series>
```

Exit `0` means every referenced package exists, parses, declares its id/language/rights and has a notes file; its source must exist unless `style.json` declares `sourceBundled: false` with a non-empty `externalSource` (then a warning is reported instead).
