#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [video, expectedWidth='1920', expectedHeight='1080', expectedFps='30'] = process.argv.slice(2);
if (!video || !fs.existsSync(video)) { console.error('Usage: node scripts/qa-media.mjs <video.mp4> [width] [height] [fps] [--allow-no-audio]'); process.exit(2); }
const result = spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type,width,height,r_frame_rate','-of','json',video],{encoding:'utf8',timeout:30_000});
if (result.status!==0) { console.error('ffprobe failed:', result.stderr || result.error?.message); process.exit(2); }
const j=JSON.parse(result.stdout); const streams=j.streams || [];
const visual=streams.find(s=>s.codec_type==='video'), sound=streams.find(s=>s.codec_type==='audio');
const fps=visual?.r_frame_rate?.split('/').map(Number).reduce((a,b)=>a/b);
const duration=Number(j.format?.duration); const errors=[];
if (!visual) errors.push('Missing video stream');
if (!sound && !process.argv.includes('--allow-no-audio')) errors.push('Missing audio stream');
if (!Number.isFinite(duration) || duration<=0) errors.push('Missing/nonpositive duration');
if (visual && (visual.width!==Number(expectedWidth) || visual.height!==Number(expectedHeight))) errors.push(`Unexpected resolution ${visual.width}x${visual.height}`);
if (visual && (!Number.isFinite(fps)|| Math.abs(fps-Number(expectedFps))>0.1)) errors.push(`Unexpected frame rate ${fps}`);
const report={ok:errors.length===0,durationSec:duration,video:visual||null,audio:sound||null,errors};
console.log(JSON.stringify(report,null,2)); if(errors.length) process.exitCode=1;
