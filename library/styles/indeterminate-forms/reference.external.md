# Reference availability

This style package does not bundle the user-provided Vietnamese lecture in the npm tarball.

- In a source checkout and in the user's own studio data root the transcript is stored as `reference.vi.md` beside this file.
- The installed package ships `style.json`, this note and `notes.md`. The notes are the reusable extract: architecture, voice, pacing, scope warning and mathematical audit.
- To use the source later, place the original transcript at `library/styles/indeterminate-forms/reference.vi.md` in the data root. Do not redistribute it; read `style.json.rights` first.
- `scripts/validate-style-refs.mjs` accepts the missing source only when `sourceBundled` is `false` and `externalSource` explains the situation.
