// 一次性迁移工具：把当前（60s）时间轴里的“秒”换成“公里”，用于把 story/keyframes 改成里程锚定
// 用法：node tools/dump_km.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const entry = path.join(ROOT, '_work', 'dump_entry.mjs');
fs.writeFileSync(entry, `
export { maleKm, DURATION, tOfMaleKm } from '../src/engine/timeline.js';
export { CAMERA, CARDS, SPLIT, SUBTITLES, EVENTS } from '../src/config/story.js';
export { KEYFRAMES } from '../src/config/keyframes.js';
`);
const out = path.join(ROOT, '_work', 'dump.bundle.mjs');
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
  outfile: out, loader: { '.json': 'json' }, logLevel: 'error',
});
const M = await import(pathToFileURL(out).href + `?v=${Date.now()}`);
const km = (t) => +M.maleKm(t).toFixed(3);
const f = (x) => String(x).padStart(6);

console.log('DURATION', M.DURATION);
console.log('\n# CAMERA  t -> km');
for (const c of M.CAMERA) console.log(`  t ${f(c.t)}  km ${km(c.t).toFixed(2)}  target ${JSON.stringify(c.target)} dist ${c.dist} az ${c.az} pitch ${c.pitch} frame ${c.frame}${c.ease ? ' ease ' + c.ease : ''}`);
console.log('\n# CARDS  t -> km');
for (const c of M.CARDS) console.log(`  t ${f(c.t)}  km ${km(c.t).toFixed(2)}  ${c.id} ${c.title}`);
console.log('\n# SPLIT', M.SPLIT.t0, '->km', km(M.SPLIT.t0), ' t1', M.SPLIT.t1, '->km', km(M.SPLIT.t1));
console.log('\n# KEYFRAMES  t -> km');
M.KEYFRAMES.forEach((k, i) => console.log(`  ${String(i + 1).padStart(2)}  t ${f(k.t)}  km ${km(k.t).toFixed(2)}  ${k.title}`));
console.log('\n# EVENTS with t');
for (const e of M.EVENTS) if (e.t !== undefined) console.log(`  t ${f(e.t)}  km ${km(e.t).toFixed(2)}  ${e.type} ${e.label || e.text || ''}`);
