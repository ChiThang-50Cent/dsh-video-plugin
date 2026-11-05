#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const commands = [
  ['node', ['--version']], ['ffmpeg', ['-version']], ['ffprobe', ['-version']],
  ['npx', ['--version']], ['python3', ['--version']], ['blender', ['--version']],
  ['nvidia-smi', ['--query-gpu=name,memory.free', '--format=csv,noheader']]
];
function probe(name, args) {
  const p = spawnSync(name, args, { encoding: 'utf8', timeout: 6000, maxBuffer: 500_000 });
  const output = (p.stdout || p.stderr || '').split(/\r?\n/).filter(Boolean)[0] || '';
  return { available: p.status === 0, summary: output.slice(0, 180), error: p.error?.code || (p.status !== 0 ? `exit-${p.status}` : null) };
}
const result = Object.fromEntries(commands.map(([cmd, args]) => [cmd, probe(cmd, args)]));
console.log(JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), tools: result }, null, 2));
if (process.argv.includes('--require-media') && (!result.ffmpeg.available || !result.ffprobe.available)) process.exitCode = 2;
