# Visual styles

`library/visual-styles/<id>/` holds swappable looks for rendered scenes. They are separate from `library/styles/`, which holds narration (voice/writing) references.

| Path | Role |
|---|---|
| `style.json` | Tokens: `schemaVersion: 1`, `id` (must equal the directory name), `name`, `colors{}`, `typography{role: {family, size, weight, style}}`, optional `layout{}`, `motion{}`, free-form `tokens{}` and `fonts[]`. |
| `fonts/` | Font files declared in `style.json.fonts` as `{ "family", "file": "fonts/X.ttf", "license" }`. Ship only fonts whose license allows it (OFL etc.). |
| `refs/` | Reference frames, contact sheet and palette from `scripts/extract-style-refs.mjs`, with a rights note. Inspiration only; never copy a third-party design one-for-one. |
| `notes.md` | What the look is for, what to avoid, and why tokens were chosen. |

Every style defines the core colours `background`, `ink`, `muted`, `line`, `accent`, `structure`, `success` and `error`, so any scene renders under any style; add more names freely. Typography roles are free-form; `headline`, `body`, `label` and `data` are conventional and `theme.font(role)` falls back to `body`. Ids are lowercase slugs (`[a-z][a-z0-9-]*`).

## Where a style is found

1. `<dataRoot>/library/visual-styles/<id>/` (the workspace, editable);
2. the built-in copy in the installed bundle (`default` only).

A workspace package with the same id shadows the built-in one, so customizing `default` means editing or creating `<dataRoot>/library/visual-styles/default/`. `init-workspace.mjs` copies `default` into a new workspace and never overwrites an existing one.

## Selecting a style

`production.json.visualStyle` (one episode) overrides `project.json.visualStyle` (the series), which falls back to `default`. `render-scene.mjs`/`render-episode.mjs --visual-style <id>` overrides both for a single render (previews, comparisons). Scenes read `api.theme` (`colors`, `typography`, `layout`, `motion`, `tokens`, `font(role, overrides)`), and the renderer registers the declared fonts before the scene loads.

## Add

```bash
node scripts/new-visual-style.mjs <new-id> --from <existing-id> [--name "..."]
node scripts/extract-style-refs.mjs <id> <video-or-image...> --rights "<who owns it, how it may be used>" [--at 12,40,95] [--count 6]
```

`new-visual-style` copies `style.json`, `fonts/` and `notes.md` (not `refs/`) from `--from` (default `default`) and refuses an existing id. `extract-style-refs` reads local files only, writes into an existing package and records the rights note; it does not change tokens. Read `refs/contact.png` and the palette (mean colour and share per cluster) in `refs/refs.json`, then set the tokens yourself.

## Edit

Edit `style.json` (and `fonts/`, `notes.md`). Validation runs on every render and fails with the reason: wrong `schemaVersion`, id/directory mismatch, missing core colour, typography role without `family`, non-positive size, font file missing or outside the package. The style hash covers `style.json` and every declared font file, so after an edit:

- `render-episode` re-renders exactly the scenes rendered under the old hash (the cache key includes it);
- release fails until each `qa/scene/<id>.json` records the new `styleSha256` (re-run scene QA);
- a released master is never touched; render the restyled cut to a new output path.

## Switch

Change `visualStyle` in `project.json` (whole series) or `production.json` (one episode), then re-render and re-run scene QA as above. Preview first without editing files: `node scripts/render-scene.mjs <scene.mjs> --visual-style <id> --snapshots-only --frames 2,6 --frames-dir /tmp/preview --contact-sheet /tmp/preview/contact.png`.

## Delete

There is no delete command: remove the directory. First make sure no `project.json`/`production.json` names it; otherwise the next render stops with `visual style "<id>" not found` rather than silently falling back. Deleting the workspace `default` reverts to the built-in `default`. Released masters and their QA records are unaffected, but re-rendering such an episode needs a style that exists.

## Scope

Only scenes that take their look from `api.theme` restyle. A scene with hard-coded colours or its own font registration keeps its look under any style; port it to `api.theme` before relying on a style switch.
