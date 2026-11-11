// 字幕表校验：时长重叠、阅读速度（字/秒）、是否越界、与关键帧是否对得上
// 用法：node tools/check_subs.mjs
import { SUBTITLES, DURATION } from '../src/config/story.js';
import { KEYFRAMES } from '../src/config/keyframes.js';
const MAX_CPS = 6.3;          // 阅读速度上限（实测音轨最快递 5.9，留 0.4 余量）
const MIN_D = 0.7;            // 最短停留（音轨里“赛道见”0.80s 是底，低于 0.7s 要报警）
const rows = [];
let prevEnd = -1;
for (const [i, s] of [...SUBTITLES].sort((a, b) => a.t - b.t).entries()) {
  const chars = [...s.text].length;
  const cps = chars / s.d;
  const overlap = s.t < prevEnd - 0.001;
  const near = KEYFRAMES.reduce((best, k) => (Math.abs(k.t - s.t) < Math.abs(best.t - s.t) ? k : best), KEYFRAMES[0]);
  rows.push({
    n: i + 1, t: s.t, d: s.d, end: +(s.t + s.d).toFixed(2), chars, cps: +cps.toFixed(2),
    flags: [
      overlap ? `OVERLAP(-${(prevEnd - s.t).toFixed(2)}s)` : '',
      cps > MAX_CPS ? `FAST(${cps.toFixed(1)})` : '',
      s.d < MIN_D ? `SHORT(${s.d}s)` : '',
      s.t + s.d > DURATION ? 'BEYOND_END' : '',
    ].filter(Boolean).join(' '),
    text: s.text, tag: s.tag || '', color: s.color || '',
    nearest: `${near.t.toFixed(1)}s ${near.title}`,
  });
  prevEnd = Math.max(prevEnd, s.t + s.d);
}

const total = SUBTITLES.reduce((a, s) => a + [...s.text].length, 0);
const span = Math.max(...SUBTITLES.map((s) => s.t + s.d)) - Math.min(...SUBTITLES.map((s) => s.t));
console.log(`字幕 ${SUBTITLES.length} 条 · 共 ${total} 字 · 覆盖 ${span.toFixed(1)}s / 片长 ${DURATION}s · 平均 ${(total / DURATION).toFixed(2)} 字/秒\n`);
console.log('  #  入点   时长   结束   字数  字/秒  文字                                   紧邻关键帧            问题');
for (const r of rows) {
  console.log(`${String(r.n).padStart(3)}  ${String(r.t).padEnd(6)} ${String(r.d).padEnd(5)} ${String(r.end).padEnd(6)} ${String(r.chars).padStart(4)}  ${String(r.cps).padStart(5)}  ${r.text.padEnd(30, ' ')} ${r.nearest.padEnd(22, ' ')} ${r.flags}`);
}
const bad = rows.filter((r) => r.flags);
console.log(`\n问题条目：${bad.length}`);
if (bad.length) process.exitCode = 1;
