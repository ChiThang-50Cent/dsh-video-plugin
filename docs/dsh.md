# DSH v0.2.2-rc.1 integration notes (updated 5 Nov 2026)

**Pinned version:** `v0.2.2-rc.1` is the newest published GitHub release recorded when this kit was authored. npm's `latest` still resolved to `0.2.1-rc.5` and `next` to `0.2.2-rc.1` at that time; pin an exact version for reproducibility.

## Verified mechanisms

1. `@deepseek-ai/dsh-agent-preset-registry` selects preset definitions; `@deepseek-ai/dsh-agent-preset` composes persona/tools/skill/boundaries through Cordis YAML. Rows accept `id`, `plugins`, optional `name`, `description`, `order`; children accept `id`, `name`, `config`, `disabled` (including `!!js`).
2. `@deepseek-ai/dsh-skill-filesystem` discovers `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, `~/.dsh/skills` and `~/.agents/skills`. The bundle contributes a global `ctx.skills.registerProvider` catalog at bundled rank (600), below project skills, and renders each body using the lookup workspace.
3. `@deepseek-ai/dsh-subagent`, `-spawn-in-process` and `-tool-subagent` implement delegated children. Only in-process spawn supports an independent `agentPreset`; `maxDepth: 1` prevents recursion. The tool returns a child id immediately; parent receives completion later.
4. `@deepseek-ai/dsh-tool-workflow` is for explicitly requested large fan-out; use direct `subagent` for one or two workers.
5. `dsh-agent-instructions` auto-loads the workspace `AGENTS.md`; the producer also reads the studio rules path printed in the skill header.
6. A profile lives in `$DSH_HOME/profiles/<name>/` and assembles bundle patches, the profile patch and overlays. `--patch` / `--dump-config` inspect composition without persisting.
7. A profile **bundle** declares `dsh.bundle.patch`; `plugin_manager install_bundle` accepts an absolute local directory, validates the patch and activates it. A configuration-only bundle needs no Host row; this bundle inserts one so its Host code can register skills.
8. Each bundle row targets a package resolvable from the profile or DSH installation. This bundle declares no dependency on shipped packages beyond those rows.

## Bundle layout

```text
package.json        # manifest, files allowlist, dsh.bundle.patch, exports
index.js            # registers skills/*/SKILL.md and prefixes resolved roots
cordis.patch.yml    # video-studio + two preset rows
skills/             # nine SKILL.md bodies and narration references
scripts/            # shared root resolver, gates, audio/media/metrics/worker helpers
kit/                # public contract examples
library/            # built-in catalog + style metadata/notes (no user transcript)
locale/, icon.svg   # display metadata
```

## Roots

The plugin and every CLI use `scripts/studio-paths.mjs`:

- **code root**: installed package (read-only in npm installs), holding `skills/`, `scripts/`, `kit/`, `AGENTS.md` and built-in `library/`.
- **data root**: `projects/`, `library/`, `.cache/`; defaults to the current session workspace.

Precedence: explicit `dataRoot`/`--data-root` → `VIDEO_STUDIO_ROOT` → `studio.config.json` (`dataRoot`) → nearest initialized workspace ancestor (marked by `library/catalog.json`), or cwd. Relative explicit and environment values resolve against cwd; config values resolve against the config file's directory. Run the code root's `studio-root.mjs` from the workspace to print effective paths. `init-workspace.mjs` creates the data tree and copies missing built-in style files/catalog without overwriting; `new-episode.mjs` calls it.

The package `files` list includes only public library payload: catalog, default style, style `style.json`/`notes.md`/`reference.external.md`. User-provided transcripts are not redistributed. `validate-style-refs.mjs` accepts a missing source only when `style.json` declares `sourceBundled: false` and `externalSource`.

## Patch notes

- `0.2.2-rc.1` requires `@deepseek-ai/dsh-tool-fs-search` to declare `sampleOverCapGlobResults`; the row sets `false`.
- A preset card with an invalid child config still mounts as a plugin but appears as **Failed to load**; `agentPresets/list` exposes the reason.
- Do not both install the bundle and pass `--patch cordis.patch.yml` to the same runtime; duplicate preset ids fail declaration loading.

## GPU inside the DSH sandbox

The optional GPU runner exposes existing GPU device nodes to sandboxed commands. Add or merge the following row into the home-level `$DSH_HOME/cordis.patch.yml` (use the absolute path to the installed bundle's script, not the workspace data root):

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
  config:
    runnerCommand: ['/absolute/path/to/installed/video-studio/scripts/dsh-gpu-sandbox']
    runnerFailureSignatures: ['bwrap: ']
    probeTimeoutMs: 5000
```

Keep any other existing home patch rows and sandbox configuration you need. Restart DSH so the patch takes effect. The runner requires `bwrap` on PATH and forwards the sandbox profile and command while exposing only existing GPU device nodes; it does not add filesystem binds.

Verify from a command executed **inside the same DSH sandbox context** as the intended workload:

```bash
node /absolute/path/to/installed/video-studio/scripts/preflight.mjs --json
node /absolute/path/to/installed/video-studio/scripts/audio-preflight.mjs \
  --provider omnivoice --provider-command /absolute/path/to/venv/bin/omnivoice-infer \
  --voice-reference /absolute/path/to/voice.wav --synthesize-sample --require-gpu --json
```

The GPU section distinguishes `available`, `absent` and `hidden-by-sandbox`; host hardware evidence alone is not provider readiness. The recommended encoder is `h264_nvenc` only after a real NVENC encode passes, otherwise `libx264` with a reason. An optional `--python /path/to/python` checks that interpreter's Torch CUDA availability. For speech, require the provider's verified GPU identity and a passing sample; use a suitable voice reference and listen for quality.

`omnivoice-infer-batch` has no device flag. Run it only after the GPU audio preflight passes in the same execution context, and require the batch adapter to assert Torch CUDA availability before synthesis. Do not silently fall back to CPU.

**Security:** this grants sandboxed commands access to GPU devices, with the associated device/driver attack surface and shared GPU resources. It does not change the sandbox filesystem policy. To revert, remove the added row or restore the prior `sandbox` row and its configuration in `$DSH_HOME/cordis.patch.yml`, then restart DSH. Re-run preflight in the sandbox to check the resulting visibility.

## Test protocol

1. Use the exact pinned DSH version in a dedicated workspace. Run `node scripts/preflight.mjs`.
2. `--dump-config` confirms rows exist; it does not prove plugins boot.
3. Install the bundle, verify `application: applied` and no bundle error.
4. Boot the Web profile, select `video-producer`, run `/video-produce` with `draft-only`; confirm `AGENTS.md`, skill resolution and roots.
5. Trigger one harmless synthetic scene-worker task writing only an assigned `work/` folder; verify the child preset, no delegation tool and parent integration via `validate-workers.mjs`.
6. Exercise audio/media adapters only where installed. Do not treat a GPU as a verified TTS backend.
7. Then produce the first real user-requested film and collect measured metrics from session logs.

**Do not interpret `--dump-config` success as proof the runtime boots.** Install and test the actual Web runtime and a child invocation.

Sources:
- https://github.com/deepseek-ai/deepseek-harness/releases
- https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/workflow/tool-workflow/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md
