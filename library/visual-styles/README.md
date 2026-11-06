# Visual styles

`library/visual-styles/<id>/` holds swappable looks for rendered scenes. They are separate from `library/styles/`, which holds narration (voice/writing) references.

| Path | Role |
|---|---|
| `style.json` | Tokens: `schemaVersion: 1`, `id` (= directory), `name`, `colors{}`, `typography{role: {family, size, weight, style}}`, optional `layout{}`, `motion{}`, free-form `tokens{}` and `fonts[]`. |
| `fonts/` | Font files declared in `style.json.fonts` as `{ "family", "file": "fonts/X.ttf", "license" }`. Ship only fonts whose license allows it (OFL etc.). |
| `refs/` | Reference frames, contact sheet and palette from `scripts/extract-style-refs.mjs`, with a rights note. Inspiration only; never copy a third-party design one-for-one. |
| `notes.md` | What the look is for, what to avoid, and why tokens were chosen. |

Colour names scenes rely on: `background`, `ink`, `muted`, `line`, `accent`, `structure`, `success`, `error`. Typography roles: `headline`, `body`, `label`, `data` (add more freely; `theme.font(role)` falls back to `body`).

## Selecting a style

`production.json.visualStyle` (one episode) overrides `project.json.visualStyle` (the series), which falls back to the built-in `default`. Scenes read `api.theme` (`colors`, `typography`, `layout`, `motion`, `tokens`, `font(role, overrides)`), so switching the id or editing the tokens and re-rendering restyles every scene; cached scenes whose style hash changed re-render automatically.

## Creating or changing a look

```bash
node scripts/new-visual-style.mjs <new-id> --from <existing-id> [--name "..."]
node scripts/extract-style-refs.mjs <id> <video-or-image...> --rights "<who owns it, how it may be used>" [--at 12,40,95] [--count 6]
```

Then edit `style.json` from the contact sheet and palette in `refs/refs.json`, set `visualStyle`, re-render and re-run scene QA.
