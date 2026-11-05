#!/usr/bin/env node
// Promote accepted scene code+preview as a copy/patch EXAMPLE, never as a generic
// renderer. No data is deleted; requires an explicit PASS report.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './studio-paths.mjs';
const root = dataRoot;
const [id, sceneFile, previewFile, qaFile] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{3,}$/.test(id || '') || !sceneFile || !previewFile || !qaFile) {
  console.error('Usage: node scripts/promote-scene.mjs <catalog-id> <scene-code> <preview> <qa-report>'); process.exit(2);
}
const input = [sceneFile, previewFile, qaFile].map(p=>path.resolve(p));
const rootPrefix = path.join(root,'projects')+path.sep;
for (const p of input) {
  if (!p.startsWith(rootPrefix) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    console.error('Input must be an existing regular file from a project episode:',p);process.exit(2);
  }
}
const qa=JSON.parse(fs.readFileSync(input[2],'utf8'));
if (qa.status !== 'PASS' && qa.result !== 'PASS') { console.error('QA is not PASS');process.exit(3); }
const catalogPath=path.join(root,'library','catalog.json');
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
if (catalog.entries.some(e=>e.id===id) || fs.existsSync(path.join(root,'library','scenes',id))) {
  console.error('Catalog id exists; do not overwrite previous accepted version:',id);process.exit(3);
}
const out=path.join(root,'library','scenes',id);fs.mkdirSync(out,{recursive:false});
const paths={source:`library/scenes/${id}/source${path.extname(input[0])}`,preview:`library/scenes/${id}/preview${path.extname(input[1])}`,qa:`library/scenes/${id}/qa.json`};
fs.copyFileSync(input[0],path.join(root,paths.source));
fs.copyFileSync(input[1],path.join(root,paths.preview));
fs.copyFileSync(input[2],path.join(root,paths.qa));
const entry={id,category:'accepted-example',purpose:'Describe visual intent before generalizing',tags:[],backend:'unknown',sourcePath:paths.source,preview:paths.preview,qaReportPath:paths.qa,paramSchema:null,limitations:['Promoted as COPY/PATCH reference; not yet a parameterized template'],requirements:[],qaStatus:'PASS',templateVersion:1,sourceEpisode:path.relative(root,input[0])};
catalog.entries.push(entry);
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log(`Promoted accepted example: ${id}`);
