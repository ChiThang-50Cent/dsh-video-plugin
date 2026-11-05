#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const target = process.argv[2];
if (!target) { console.error('Usage: node scripts/validate-episode.mjs <episode-dir>'); process.exit(2); }
const abs = path.resolve(target);
const errors = [], warnings = [];
const file = (name) => { try { return JSON.parse(fs.readFileSync(path.join(abs,name),'utf8')); } catch (e) { errors.push(`Cannot parse ${name}: ${e.message}`); return {}; } };
const storyboard = file('storyboard.json'), timeline = file('timeline.json'), claim = file('claim-check.json');
const audio = file('audio/manifest.json');
const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
const seen = new Set();
for (const s of scenes) {
  if (!/^[a-z][a-z0-9-]{2,}$/.test(s.id || '')) errors.push(`Invalid scene id: ${s.id}`);
  if (seen.has(s.id)) errors.push(`Duplicate scene id: ${s.id}`);
  seen.add(s.id);
  if (!['A','B','C'].includes(s.reuseClass)) errors.push(`Missing reuseClass A/B/C: ${s.id}`);
  if (s.reuseClass === 'B' && !s.reuseFrom) errors.push(`B scene without reuseFrom: ${s.id}`);
  if (s.reuseClass === 'A' && !s.reuseFrom && !s.templateId) errors.push(`A scene without reuseFrom or templateId: ${s.id}`);
  if (s.reuseClass === 'C' && s.reuseFrom) warnings.push(`Custom scene ${s.id} has reuseFrom; verify classification`);
}
const shotTimes = Array.isArray(timeline.scenes) ? timeline.scenes : [];
let duration = timeline.durationSec;
if (duration !== null && !(Number.isFinite(duration) && duration > 0)) errors.push('timeline.durationSec must be positive or null');
for (const s of shotTimes) {
  if (!seen.has(s.id)) errors.push(`Timeline references unknown scene: ${s.id}`);
  if (!(Number.isFinite(s.startSec) && s.startSec >= 0 && Number.isFinite(s.durationSec) && s.durationSec > 0)) errors.push(`Invalid timing ${s.id}`);
  const end = s.startSec + s.durationSec;
  if (duration !== null && end > duration + 1e-3) errors.push(`Scene ${s.id} ends after film`);
  for (const k of (s.keyframes || [])) if (!(Number.isFinite(k) && k >= 0 && k <= s.durationSec + 1e-3)) errors.push(`Out-of-bounds keyframe ${s.id}@${k}`);
}
if (shotTimes.length && scenes.length !== shotTimes.length) warnings.push(`Storyboard scenes=${scenes.length}, timeline scenes=${shotTimes.length}`);
if (claim.status && claim.status !== 'PASS') {
  const msg = 'Source/fact audit is not PASS; do NOT synthesize new narration';
  if (process.argv.includes('--gate-content')) errors.push(msg); else warnings.push(msg);
}
if (!Array.isArray(audio.chunks)) errors.push('audio/manifest.json chunks must be array');
console.log(JSON.stringify({ ok: errors.length===0, errors, warnings, scenes: scenes.length, timedScenes: shotTimes.length }, null, 2));
if (errors.length) process.exitCode=1;
