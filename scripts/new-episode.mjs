#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { codeRoot, dataRoot } from './studio-paths.mjs';
const [series, episode] = process.argv.slice(2);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const epid = /^ep-[0-9]{3,5}$/;
if (!slug.test(series || '') || !epid.test(episode || '')) {
  console.error('Usage: node scripts/new-episode.mjs <series-slug> <ep-001>'); process.exit(2);
}
const base = path.join(dataRoot, 'projects', series);
const dest = path.join(base, 'episodes', episode);
if (fs.existsSync(dest)) { console.error(`Episode already exists: ${dest}`); process.exit(3); }
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.mkdirSync(dest);
for (const dir of ['assets/original', 'assets/derived', 'audio/narration', 'audio/stems', 'scenes', 'qa/scene', 'reports', 'exports', 'work']) {
  fs.mkdirSync(path.join(dest, dir), { recursive: true });
}
fs.writeFileSync(path.join(dest, 'request.md'), `# Request: ${series}/${episode}\n\nAwaiting the user's brief.\n`);
fs.writeFileSync(path.join(dest, 'execution-brief.md'), '# Execution brief\n\nNot started.\n');
fs.writeFileSync(path.join(dest, 'narration.md'), '# Narration\n\nNot approved.\n');
fs.writeFileSync(path.join(dest, 'claim-check.json'), JSON.stringify({ claims: [], status: 'PENDING' }, null, 2)+'\n');
fs.writeFileSync(path.join(dest, 'storyboard.json'), JSON.stringify({ schemaVersion: 1, scenes: [] }, null, 2)+'\n');
fs.writeFileSync(path.join(dest, 'timeline.json'), JSON.stringify({ schemaVersion: 1, durationSec: null, scenes: [] }, null, 2)+'\n');
fs.writeFileSync(path.join(dest, 'audio', 'manifest.json'), JSON.stringify({ engine: null, chunks: [] }, null, 2)+'\n');
const narrationHash = createHash('sha256').update(fs.readFileSync(path.join(dest, 'narration.md'))).digest('hex');
fs.writeFileSync(path.join(dest, 'narration-review.json'), JSON.stringify({
  schemaVersion: 1,
  narrationFile: 'narration.md',
  narrationSha256: narrationHash,
  status: 'blocked',
  reviewedAt: null,
  criteria: {
    accuracy: 'needs-work', audienceFit: 'needs-work', narrativeArc: 'needs-work', reasoning: 'needs-work',
    continuity: 'needs-work', spokenLanguage: 'needs-work', pacing: 'needs-work', styleAndOriginality: 'needs-work',
  },
  blockers: ['Narration has not been drafted or reviewed.'],
  actionableFindings: [],
  claimCheckFile: 'claim-check.json',
  reviewPasses: 0,
}, null, 2)+'\n');
fs.writeFileSync(path.join(dest, 'reports', 'metrics.json'), JSON.stringify({ phaseTimings: [], sceneClasses: {}, fullRenders: 0, imageInspections: 0 }, null, 2)+'\n');
if (!fs.existsSync(path.join(base, 'project.json'))) {
  const config = JSON.parse(fs.readFileSync(path.join(codeRoot, 'kit', 'project.json'), 'utf8'));
  config.slug = series; config.name = series;
  fs.writeFileSync(path.join(base, 'project.json'), JSON.stringify(config, null, 2)+'\n');
}
console.log(dest);
