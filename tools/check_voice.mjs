// 口播/字幕自检：切行是否与原文一致、每行时长是否来自音轨、语速与停顿是否正常
// 用法：node tools/check_voice.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const entry = path.join(ROOT, '_work', 'voice_entry.mjs');
fs.writeFileSync(entry, `export { buildScript, VO, AUDIO, LINES, PARAGRAPHS, ORIGINAL } from '../src/config/voice.js';`);
const out = path.join(ROOT, '_work', 'voice.bundle.mjs');
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
  outfile: out, logLevel: 'error',
});
const { buildScript, VO, AUDIO } = await import(pathToFileURL(out).href + `?v=${Date.now()}`);

const S = buildScript();
if (S.errors.length) {
  console.error('❌ 文案切行自检失败：');
  for (const e of S.errors) console.error('  ' + e);
  process.exit(1);
}
const last = S.lines[S.lines.length - 1];
const first = S.lines[0];
const spoken = last.t + last.d - first.t;

console.log(`✅ 切行自检通过（${S.lines.length} 行，拼回原文一字不差 · 比对方式 ${S.match}）`);
console.log(`片长 ${S.DURATION}s = 片头留白 ${VO.audioOffset}s + 音轨 ${AUDIO.dur}s + 片尾 ${VO.tail}s`);
console.log(`说话时长 ${spoken.toFixed(2)}s · 口播 ${S.charsNoPunct} 字（含标点 ${S.chars}）· 平均 ${S.cpsAvg} 字/秒\n`);

console.log('# 段落');
for (const b of S.paragraphs) {
  const ls = S.lines.filter((l) => b.lines.includes(l.id));
  const ch = ls.reduce((a, l) => a + l.charsNoPunct, 0);
  const km = b.km ? `${b.km[0].toFixed(2)}→${b.km[1].toFixed(2)}` : '起跑前';
  const span = (ls[ls.length - 1].t + ls[ls.length - 1].d) - ls[0].t;
  const speed = b.km && b.km[1] > b.km[0] ? ((b.km[1] - b.km[0]) / span).toFixed(3) : '-';
  console.log(`  ${b.id.padEnd(8)} ${ls[0].t.toFixed(2).padStart(6)}→${(ls[ls.length - 1].t + ls[ls.length - 1].d).toFixed(2).padStart(6)}s  ${span.toFixed(1).padStart(5)}s  ${String(ls.length).padStart(2)} 行 ${String(ch).padStart(3)} 字  km ${km.padEnd(16)} 地图速度 ${speed} km/s`);
}

console.log('\n# 逐行（时间全部来自音轨 SRT）');
console.log('  #   入点    出点   时长   字  字/秒   空隙     km   字幕');
for (const l of S.lines) {
  console.log(`  ${String(l.i).padStart(2)}  ${l.t.toFixed(2).padStart(6)} ${(l.t + l.d).toFixed(2).padStart(6)} ${l.d.toFixed(2).padStart(5)} ${String(l.charsNoPunct).padStart(4)} ${l.cps.toFixed(2).padStart(6)} ${l.gap.toFixed(2).padStart(6)} ${(l.km ?? 0).toFixed(2).padStart(7)}   ${l.text}`);
}

const cps = S.lines.map((l) => l.cps);
const short = S.lines.filter((l) => l.d < 1.0);
const gaps = S.lines.slice(1).map((l) => l.gap);
console.log('\n# 语速与停顿（实测）');
console.log(`  字/秒 min ${Math.min(...cps).toFixed(2)}  max ${Math.max(...cps).toFixed(2)}  平均 ${S.cpsAvg}`);
console.log(`  不足 1 秒的短句：${short.length ? short.map((l) => `${l.id}(${l.charsNoPunct}字/${l.d.toFixed(2)}s)`).join(', ') : '无'}`);
console.log(`  句间空隙 min ${Math.min(...gaps).toFixed(2)}s  max ${Math.max(...gaps).toFixed(2)}s  平均 ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2)}s`);
console.log(`  里程锚点 ${S.MALE_KM.length} 个，尾部 ${JSON.stringify(S.MALE_KM.slice(-3))}`);

// 地图速度：按公蟹里程曲线算瞬时速度，找出最快的几段（用于判断是否要显式“快进”）
const kmAt = (t) => {
  const P = S.MALE_KM;
  let i = 0;
  while (i < P.length - 2 && P[i + 1][0] <= t) i++;
  const [t0, k0] = P[i], [t1, k1] = P[i + 1];
  const u = Math.min(1, Math.max(0, (t - t0) / ((t1 - t0) || 1)));
  return k0 + (k1 - k0) * u;
};
const speeds = [];
for (let t = 0; t < S.DURATION - 0.1; t += 0.1) speeds.push({ t: +t.toFixed(1), v: +((kmAt(t + 0.1) - kmAt(t)) / 0.1).toFixed(2) });
const fast = speeds.filter((s) => s.v > 1.6);
console.log(`\n# 地图速度（公蟹，km/s）：max ${Math.max(...speeds.map((s) => s.v))}  min ${Math.min(...speeds.map((s) => s.v))}`);
if (fast.length) {
  console.log(`  超过 1.6 km/s 的区间：`);
  let run = null;
  for (const s of fast) {
    if (run && s.t - run.t1 < 0.35) { run.t1 = s.t; run.v = Math.max(run.v, s.v); }
    else { if (run) console.log(`    ${run.t0.toFixed(1)}–${run.t1.toFixed(1)}s  ${run.t0 === run.t1 ? '' : ''}峰值 ${run.v} km/s  ${(kmAt(run.t0)).toFixed(1)}→${(kmAt(run.t1)).toFixed(1)} km`); run = { t0: s.t, t1: s.t, v: s.v }; }
  }
  if (run) console.log(`    ${run.t0.toFixed(1)}–${run.t1.toFixed(1)}s  峰值 ${run.v} km/s  ${(kmAt(run.t0)).toFixed(1)}→${(kmAt(run.t1)).toFixed(1)} km`);
}
