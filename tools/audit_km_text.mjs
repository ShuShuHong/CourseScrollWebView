// 台词里报的里程 vs 螃蟹实际所在里程 —— 新匀速模型的核心代价，必须量化
//   node tools/audit_km_text.mjs
import { VO_LINES, SEGS, MALE_KM, DURATION } from '../src/config/story.js';
import { pchip } from '../src/engine/math.js';

const f = pchip(MALE_KM);
const at = (t) => f(Math.max(0, Math.min(DURATION, t)));

/* 从台词里抠出里程数字（公里） */
function claimed(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*公里/g;
  let m;
  while ((m = re.exec(text))) out.push(+m[1]);
  if (/最后约?(\d+)\s*米/.test(text)) out.push(null);   // 230 米这种不参与
  return out;
}

const rows = [];
for (const l of VO_LINES) {
  const ks = claimed(l.vo);
  if (!ks.length) continue;
  for (const k of ks) {
    if (k === null || k > 21.2 && k < 41.9 && !/全马|22\.6/.test(l.vo)) continue;
    const a = at(l.t), b = at(l.t + l.d), mid = at(l.t + l.d / 2);
    const err = Math.min(Math.abs(k - a), Math.abs(k - b), Math.abs(k - mid));
    rows.push({ id: l.id, t: l.t, text: l.vo, claim: k, a, b, err, seg: l.seg });
  }
}
rows.sort((x, y) => y.err - x.err);
console.log('#  字幕                          报    起    止    最小误差   段');
for (const r of rows) {
  console.log(`${r.id.padEnd(4)}${r.text.slice(0, 18).padEnd(20)}${String(r.claim).padStart(6)}`
    + `${r.a.toFixed(2).padStart(7)}${r.b.toFixed(2).padStart(7)}${(r.err * 1000).toFixed(0).padStart(8)}m  ${r.seg}`);
}
const bad = rows.filter((r) => r.err > 0.5);
console.log(`\n共 ${rows.length} 处带里程的台词 · 误差 >500 m 的有 ${bad.length} 处`);
