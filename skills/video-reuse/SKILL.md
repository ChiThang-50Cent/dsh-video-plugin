---
name: video-reuse
description: Find, adapt, register, and promote validated video scene templates and components across episodes and genres. Use before writing new scene code or when building a series library from successful scenes.
---

# Reuse-first scene library

Search `library/catalog.json` FIRST. Match by audience function and animation mechanism, not merely title keywords. For top candidates inspect metadata, the nearest accepted scene source, its params and one representative screenshot.

A = instantiate tested template with parameters, no coding worker.
B = copy/patch one accepted scene, minimize changed surface, rerun changed-content checks.
C = custom only when A/B cannot communicate the idea without distortion. Reuse primitive components and styles.

`library/catalog.json` entries: `id`, `category`, `purpose`, `tags`, `backend`, `sourcePath`, `preview`, `paramSchema`, `limitations`, `requirements`, `qaStatus`, `templateVersion`, `sourceEpisode`.

`reuseFrom` must identify an actual file and accepted QA record; otherwise mark `null`. Do not inflate reuse percentages by counting generic library imports as scene template reuse. Distinguish scene reuse and shared component usage.

After a successful production, promote only genuinely repeatable scenes to `library/` after: remove episode-specific data, define safe inputs, reference screenshot/regression test, add explicit limitations, version, QA PASS, and update catalog. If extraction costs more than near-term reuse, preserve an example scene without building a generic renderer.

Cache keys include template/adapter version, scene parameters, source assets, fonts and material timing inputs. An untrusted cache is a MISS. Changes invalidate only dependent products.
