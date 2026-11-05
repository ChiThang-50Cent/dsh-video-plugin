# DSH v0.2.2-rc.1 integration notes (4 Nov 2026)

**Pinned version:** `v0.2.2-rc.1` is the newest published GitHub release at the time this kit was authored. npm's `latest` tag still resolves to `0.2.1-rc.5` and `next` to `0.2.2-rc.1`; use an exact version for reproducibility. `@deepseek-ai/dsh` CLI launches `web`, `headless`, `sdk`, etc.

## Verified API mechanisms from upstream docs

1. `@deepseek-ai/dsh-agent-preset-registry` selects preset definitions; `@deepseek-ai/dsh-agent-preset` composes a persona, tools, skill provider and per-agent boundaries through ordinary Cordis YAML. A preset row's `config` accepts `id`, `plugins`, and optional `name`, `description`, `order`; each child entry takes `id`, `name`, `config`, `disabled` (including `!!js` expressions).
2. `@deepseek-ai/dsh-skill-filesystem` finds `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, `~/.dsh/skills` and `~/.agents/skills`; body loads on demand through `dsh-tool-skill`. Project root is nearest `.git`, fallback cwd. Skills are not subagents. This bundle does **not** depend on that discovery for its own skills: `index.js` registers them through `ctx.skills.register`, which places them in the global layer of every session. Project-root copies still outrank runtime entries, so a workspace that keeps its own `video-*` skills under `.agents/skills` wins by rank.
3. `@deepseek-ai/dsh-subagent`, `@deepseek-ai/dsh-subagent-spawn-in-process`, and `@deepseek-ai/dsh-tool-subagent` form the delegated child path. Only in-process spawn supports an independent `agentPreset`. `agentPreset` selects a default, `allowedAgentPresets` optionally permits an enum of allowed choices. `maxDepth: 1` prevents recursive delegations.
4. A subagent tool returns a child id immediately; parent receives completion notice. Do not build a polling loop.
5. `@deepseek-ai/dsh-tool-workflow` handles large explicitly requested multi-agent orchestration; avoid it for 1-2 workers.
6. `AGENTS.md` is auto-loaded through `dsh-agent-instructions` and may include a shared user-global root.
7. A DSH profile lives in `$DSH_HOME/profiles/<name>/` and assembles bundle patches, the per-profile `cordis.patch.yml`, and home/invocation overlays. `--patch` and `--dump-config` enable nonpersistent composition inspection.
8. A profile **bundle** is a package whose `package.json` declares `dsh.bundle.patch`. `plugin_manager` `install_bundle` accepts an absolute local directory, reads its manifest, requires that declaration, validates the patch, then selects the bundle as a profile layer. A configuration-only bundle needs no Host entry, but a bundle may also insert a row naming its own package (this bundle does) so it can run Host code; display metadata comes from exported `locale/*.json` (`meta.title`, `meta.description`) and an exported icon.
9. Each bundle row targets a package that must resolve from either the profile or the DSH installation. Packages shipped with DSH resolve from the installation, so a bundle that only inserts shipped rows declares no dependencies.

## Bundle layout in this repository

```text
package.json        # name, version, description, exports, files, dsh.bundle.patch
index.js            # registers skills/*/SKILL.md with ctx.skills and prefixes studio roots
cordis.patch.yml    # inserts video-studio plus the two preset rows
skills/             # nine SKILL.md bodies; work from any workspace
scripts/            # studio-root.mjs and the deterministic checks
locale/en.json      # meta.title / meta.description shown in Plugins
locale/vi.json      # same fields for Vietnamese; the Web client currently offers de/en/es/fr/ja/pt/ru/zh
icon.svg            # bundle artwork, original, < 256 KiB
```

## Workspace independence

A workspace session must not resolve studio paths against its own cwd. The Studio plugin computes two roots from `index.js`:

- **code root**: this package, holding `skills/`, `scripts/`, `kit/` and `AGENTS.md`.
- **data root**: `projects/`, `library/`, `.cache/`; defaults to the code root, overridable by the plugin row's `dataRoot` or `VIDEO_STUDIO_ROOT`.

Each registered skill body is prefixed with both roots and the absolute `AGENTS.md` path, so the model resolves episode and output paths correctly without reading the checkout. `scripts/studio-paths.mjs` exposes the same resolution to the Node helpers, and `scripts/studio-root.mjs` prints it as JSON.

`kit/` no longer holds a patch. The file used to be `kit/video-studio.patch.yml`; it moved to the package root as `cordis.patch.yml` because a bundle manifest can only point at a file that exists in the package, and `install_bundle` validates that path before activation.

`0.2.2-rc.1` requires `@deepseek-ai/dsh-tool-fs-search` to declare `sampleOverCapGlobResults`; the row in `cordis.patch.yml` sets it to `false`, matching the shipped standard preset. A preset whose child row has an invalid config still mounts as a plugin but appears in the Agent Presets roster as **Failed to load**; the registry exposes that reason through `agentPresets/list` (`broken`).

## Test protocol

1. Use the exact pinned DSH version on a dedicated workspace. Run `node scripts/preflight.mjs`.
2. Run `... web --dump-config` to confirm the shipped `agent-preset-registry`, `skills` and `spawn` tools exist. Do not assume an old profile has them.
3. Install the bundle through the Web Plugins page or `plugin_manager` (`action: install_bundle`, absolute path to this checkout). Read the result: `application: applied` and no bundle `error` decide that the layer is live. A `--patch cordis.patch.yml --dump-config` run is the non-persistent alternative; never combine the two.
4. Boot the Web profile, select `video-producer`, call `/video-produce` with `draft-only`. Confirm `AGENTS.md` loaded, the skill is found, and `request.md`/`execution-brief.md` are correct.
5. Trigger ONE harmless, synthetic scene-worker task writing only to an assigned `work/` folder. Verify the child reports preset `video-scene-worker` and lacks subagent delegation. Test that the producer can integrate its output.
6. Confirm media checks work against an existing or user-provided MP4. No synthetic 1-minute film benchmark is needed.
7. Then produce the first REAL user-requested film. Record measurable timings, regressions, and errors.

**Do not interpret `--dump-config` success as proof the plugins boot correctly.** Install the bundle, then test the Web runtime and a child invocation.

Sources:
- https://github.com/deepseek-ai/deepseek-harness/releases
- https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/workflow/tool-workflow/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md
