// 把时间轴数据导出给画图脚本（_work/timeline.json）
// 用法：node tools/dump_timeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const entry = path.join(ROOT, '_work', 'tl_entry.mjs');
fs.writeFileSync(entry, `export { SUBTITLES, NARRATION, MALE_KM, DURATION } from '../src/config/story.js';\nexport { VO } from '../src/config/voice.js';`);
const out = path.join(ROOT, '_work', 'tl.bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import(pathToFileURL(out).href + `?v=${Date.now()}`);

const SEGNAME = { start: '起跑', city: '城区', bridge: '大桥', water: '水杉水慢城', bridge2: '二次上桥', fork: '折返分流', half: '半马冲线', loop: '全马环湖', finish: '终点' };
const blockOf = (id) => id.replace(/L\d+$/, '').toLowerCase();
const subs = M.SUBTITLES.map((s) => ({
  t: s.t, d: s.d, text: s.text, km: s.km ?? null, block: { L01: 'start', L02: 'start', L03: 'start' }[s.id] || block(s.id),
}));
function block(id) {
  const n = +id.slice(1);
  if (n <= 3) return 'start';
  if (n <= 8) return 'city';
  if (n <= 13) return 'bridge';
  if (n <= 16) return 'water';
  if (n <= 19) return 'bridge2';
  if (n <= 23) return 'fork';
  if (n <= 25) return 'half';
  if (n <= 32) return 'loop';
  return 'finish';
}
const data = {
  duration: M.DURATION,
  male_km: M.MALE_KM,
  subs,
  narr: M.NARRATION.map((n) => ({ id: n.id, t0: n.t0, t1: n.t1, km: n.km })),
  segname: SEGNAME,
  chars: M.SUBTITLES.reduce((a, s) => a + s.text.length, 0),
  cps: M.CPS_AVG,
  audio: { dur: M.AUDIO_DUR, offset: M.AUDIO_OFFSET },
};
fs.writeFileSync(path.join(ROOT, '_work', 'timeline.json'), JSON.stringify(data, null, 1));
console.log('dumped _work/timeline.json', subs.length, 'subs ·', data.duration + 's');
