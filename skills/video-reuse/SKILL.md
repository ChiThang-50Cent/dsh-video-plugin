---
name: video-reuse
description: Search, adapt, register, and promote validated scene templates and components across episodes and genres. Use before writing new scene code or when growing a series library from successful scenes.
---

# Reuse-first scene library

Search `library/catalog.json` FIRST. Match by audience function and animation mechanism, not title keywords. Inspect metadata, the nearest accepted source, its params and one representative screenshot.

A = instantiate a tested template with parameters, no coding worker.
B = copy/patch one accepted scene with a minimal diff; rerun changed-content checks.
C = custom only when A/B cannot communicate the idea without distortion. Reuse primitive components/styles.

Catalog entries include: `id`, `category`, `purpose`, `tags`, `backend`, `backendCompatibility`, `sourcePath`, `preview`, `qaReportPath`, `sourceSha256`, `previewSha256`, `qaSha256`, `qaEvidence`, `paramSchema`, `limitations`, `requirements`, `qaStatus`, `templateVersion`, `sourceEpisode`.

## Promote safely

```bash
node <studio>/scripts/promote-scene.mjs <id> <scene-code> <preview> <qa-report> \
  --backend <renderer> --version <n> --purpose "<visual intent>" --tags a,b
```

- Works on an empty library; creates parents/catalog idempotently.
- Rejects non-PASS or contradictory QA, non-empty blockers/errors, id collisions, symlink escapes, source outside `projects/`, and unexpected file types. When QA specifies `sceneId`, it must match the source filename stem, not the new catalog id; Python sources are supported.
- Stages copies, hashes source/preview/QA, then atomically renames the scene directory and catalog under a catalog lock. A failure never leaves a partial catalog entry.
- The entry records both catalog `id` and `sourceSceneId`, backend compatibility (verified or explicitly unverified), template version, source episode and hashes. A promoted scene is a COPY/PATCH reference, not automatically a parameterized template.
- Never overwrite an accepted id. Create a new version/id and keep old evidence.

`reuseFrom` must identify an actual file and accepted QA record; otherwise `null`. Do not inflate reuse percentages by counting generic library imports as scene-template reuse. Distinguish scene reuse from shared-component usage.

After a successful production, promote only genuinely repeatable scenes: remove episode-specific data, define safe inputs, reference a screenshot/regression check, add limitations, version, QA PASS and update the catalog. If extraction costs more than near-term reuse, keep an example scene instead of building a generic renderer.

Cache keys include template/adapter version, parameters, source assets, fonts and material timing. An untrusted cache is a MISS. Changes invalidate only dependent products.
