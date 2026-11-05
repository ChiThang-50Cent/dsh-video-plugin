import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
test('preflight returns structured tools', () => {
  const p=spawnSync(process.execPath,[path.join(scripts,'preflight.mjs')],{encoding:'utf8'});
  assert.equal(p.status,0);const json=JSON.parse(p.stdout);assert.ok(json.tools.node.available);
});
test('validator blocks timing after scene end', () => {
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'video-studio-test-'));
 try {
  fs.mkdirSync(path.join(tmp,'audio'));
  fs.writeFileSync(path.join(tmp,'storyboard.json'),JSON.stringify({scenes:[{id:'s01-example',reuseClass:'A'}]}));
  fs.writeFileSync(path.join(tmp,'timeline.json'),JSON.stringify({durationSec:5,scenes:[{id:'s01-example',startSec:0,durationSec:5,keyframes:[5.5]}]}));
  fs.writeFileSync(path.join(tmp,'claim-check.json'),JSON.stringify({status:'PASS'}));
  fs.writeFileSync(path.join(tmp,'audio/manifest.json'),JSON.stringify({chunks:[]}));
  const p=spawnSync(process.execPath,[path.join(scripts,'validate-episode.mjs'),tmp],{encoding:'utf8'});
  assert.equal(p.status,1); assert.match(p.stdout,/Out-of-bounds keyframe/);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('new-episode rejects path traversal', () => {
  const p=spawnSync(process.execPath,[path.join(scripts,'new-episode.mjs'),'../wrong','ep-001'],{encoding:'utf8'});
  assert.equal(p.status,2);
});
