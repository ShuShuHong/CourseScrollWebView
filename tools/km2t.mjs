// 把“里程”换算成片子里的秒：给字幕排时间用（用 esbuild 打包后再跑，绕开 JSON import 属性）
// 用法：node tools/km2t2.mjs 2.9 6.1 8.2 ...
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const kms = JSON.stringify(process.argv.slice(2).map(Number));
const entry = path.join(ROOT, '_work', 'km2t_entry.mjs');
fs.writeFileSync(entry, `
import { tOfMaleKm, DURATION, femaleKm } from '../src/engine/timeline.js';
const kms = ${kms};
console.log('km\\t公蟹(秒)\\t母蟹(秒)');
for (const km of kms) {
  const t = tOfMaleKm(km);
  let bt = 0, best = 1e9;
  for (let x = 0; x <= DURATION; x += 0.02) {
    const d = Math.abs(femaleKm(x) - km);
    if (d < best) { best = d; bt = x; }
  }
  console.log(km + '\\t' + t.toFixed(2) + '\\t' + (best < 0.08 ? bt.toFixed(2) : '-'));
}
`);
const out = path.join(ROOT, '_work', 'km2t.bundle.mjs');
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
  outfile: out, loader: { '.json': 'json' }, logLevel: 'error',
});
await import(pathToFileURL(out).href + `?v=${Date.now()}`);
