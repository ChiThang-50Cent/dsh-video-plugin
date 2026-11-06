# Voice packages

A voice package is one narrator voice: `<dataRoot>/library/voices/<id>/`. Voices are personal data, so the studio bundles none and there is no default voice. A narrated episode that selects no voice stops with an error rather than borrowing another speaker.

```
library/voices/<id>/
  voice.json       provider, language, reference transcript, rights
  reference.wav    reference recording (cloning providers such as OmniVoice)
  notes.md         what the voice suits, what it handles poorly, the listening check that approved it
```

`voice.json`:

```json
{
  "schemaVersion": 1,
  "id": "narrator-vi",
  "name": "Narrator (Vietnamese, calm)",
  "provider": "omnivoice",
  "language": "vi",
  "reference": { "file": "reference.wav", "text": "Exact transcript of reference.wav." },
  "rights": "Recorded by the channel owner; licensed for this channel's videos."
}
```

- `rights` is required: whose voice it is and how it may be used. Cloning a voice without permission is not acceptable.
- `reference.text` must be the exact words in the recording. A wrong transcript degrades cloning.
- Providers with built-in voices (Piper, Edge TTS) use `providerVoice` instead of `reference`.
- The reference must stay inside the package; a symlink pointing elsewhere is rejected.

## Selection

`production.json.voicePackage` (this episode) overrides `project.json.voicePackage` (the series). `--voice-package <id>` on `audio-preflight` or `synthesize-narration` overrides both for one run. An explicit `--voice-reference`/`--ref-text` pair still works for a one-off, but cannot be combined with a package.

## Lifecycle

- **Add:** `node scripts/new-voice.mjs <id> --reference take.wav --ref-text "<exact words>" --rights "<owner and permitted use>"`. It checks the recording (readable, 1–120 s, not clipped, not mostly silence), copies it, writes `voice.json` and a `notes.md` stub, and never overwrites an existing package. Then listen: `node scripts/audio-preflight.mjs --voice-package <id> --model <checkpoint> --synthesize-sample --require-gpu`.
- **Switch:** set `voicePackage` on the project (whole series) or on one episode, then re-synthesize. Segments made with another voice are re-synthesized automatically; a released master stays untouched, so render the re-voiced cut to a new path.
- **Edit:** re-recording `reference.wav` or changing `reference.text`, `language`, `provider` or `providerVoice` changes the package hash and therefore the audio. Renaming the voice or editing `rights`/`notes.md` does not.
- **Delete:** remove the directory once no project or episode references it. Released audio keeps its recorded package id and hash in `audio/manifest.json`.

## Release binding

`audio/manifest.json.engine.voicePackage` records `{ id, sha256, source }`. When an episode selects a package, `validate-episode.mjs --release` fails unless the manifest names that package with its current hash, so a series cannot ship an episode spoken by the wrong voice or by a reference that changed after synthesis.
