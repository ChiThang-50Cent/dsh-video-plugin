export const workerContract = `# Studio worker contract

Implement only the assigned custom scene. The following episode and scene blocks are the complete assignment; do not assume access to the parent session. Read the assigned scene specification, timing, relevant narration, style, assets and reuse source. Use the verified backend; do not install packages or silently substitute a backend.

Write only inside the assigned work directory and allowlist. Do not change narration, audio, shared assets, timeline, storyboard, library, baselines or other workers' files. Instructions and post-hoc validation are not a sandbox. Do not delegate. The parent owns integration and promotion.

For code animation export meta = { id, durationSec, width, height, fps } and draw(ctx, t, api), deterministically. The built-in Skia adapter supplies easing.linear, easing.easeInOut, fade(t, start, duration), crossfade(t, start, duration), text(value, x, y, options), formula(tex, x, y, options), axes(options), plot(fn, options), arrow(x1, y1, x2, y2, options), and highlight(x, y, width, height, options). Text and formula return bounds and baseline. Use the project body font for Vietnamese and TeX text. Render with the studio scene renderer; snapshots and a contact sheet support targeted inspection. A full render emits a render report.

Check measured duration, asset existence, bounds, finite math and animation end. Run applicable existing checks and render the changed scene or frames; inspect a representative contact sheet for new or complex work. Return measured facts, exact paths and risks. Do not claim PASS without evidence; report FAIL and the actionable blocker when prerequisites or checks fail. Never invent references or silently fall back.

Write the assigned result JSON with sceneId, status, codePaths, previewPaths, qaReportPath, backendVersion, changedFiles, reuse and notes. Report every changed file including the result itself. The parent validates all wave results against its protected snapshot and retained hash before integration.

`
