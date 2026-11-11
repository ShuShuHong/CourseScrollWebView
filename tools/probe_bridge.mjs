import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const entry = path.join(ROOT, '_work', 'probe_entry.mjs');
fs.writeFileSync(entry, `export { MALE_KM, DURATION } from '../src/config/story.js';
export { tAtKm } from '../src/config/story.js';
export { stateAt } from '../src/engine/timeline.js';
`);
const out = path.join(ROOT, '_work', 'probe.bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import(pathToFileURL(out).href + `?v=${Date.now()}`);

const tAtKm = M.tAtKm;
for (const km of [6.2, 6.5, 6.75, 7.0, 7.5, 8.0, 8.2, 8.6]) {
  console.log('km', km, '→ t', tAtKm(km).toFixed(2));
}
const T = tAtKm(6.75);
console.log('\nbridge event T(6.75km) =', T.toFixed(2), 's;  build=clamp((t-T)/1.6)');
for (const t of [17.2, 17.5, 17.9, 18.0, 18.2, 18.4, 18.6, 19.0, 19.4, 20.0, 20.4]) {
  const build = Math.min(1, Math.max(0, (t - T) / 1.6));
  const H = 78 * build;
  const cableK = Math.min(1, Math.max(0, (build - 0.45) / 0.55));
  console.log(`t=${t}  build=${build.toFixed(3)}  H=${H.toFixed(1)}/78  cableK=${cableK.toFixed(2)}  cap=${build > 0.8 ? 'on' : 'off'}  beams=${build > 0.35 ? 'on' : 'off'}  km=${M.stateAt(t, null).male.km.toFixed(2)}`);
}
