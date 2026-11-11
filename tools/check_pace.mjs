// 节奏体检：口播行 ↔ 公蟹里程 ↔ 速率（纯 node，不启浏览器）
// 用法：node tools/check_pace.mjs [--csv]
import { VO_LINES, MALE_KM, tAtKm, SPLIT, T_FEMALE_FINISH, DURATION, lineT, lineEnd, POINTS } from '../src/config/story.js';

const csv = process.argv.includes('--csv');
const rows = VO_LINES.map((l) => ({
  id: l.id, t: +l.t.toFixed(2), d: +l.d.toFixed(2), mid: +(l.t + l.d / 2).toFixed(2),
  km: l.km, text: l.text.slice(0, 14),
}));
if (csv) { for (const r of rows) console.log(`${r.id},${r.t},${r.d},${r.mid},${r.km},${r.text}`); process.exit(0); }

console.log('ID    句首   句长   中点   里程     速率km/s  文本');
let prev = null;
for (const r of rows) {
  let v = '';
  if (prev && r.mid > prev.mid) v = ((r.km - prev.km) / (r.mid - prev.mid)).toFixed(2);
  console.log(`${r.id} ${String(r.t).padStart(6)} ${String(r.d).padStart(6)} ${String(r.mid).padStart(6)} ${String(r.km).padStart(8)}  ${String(v).padStart(8)}  ${r.text}`);
  prev = r;
}

// 分段速率统计（按段落）
const P = [
  ['城区 0–7', 'L05', 'L10'], ['大桥1 7–11', 'L11', 'L15'], ['水杉/水慢城 11–16', 'L16', 'L18'],
  ['二次桥 16–19', 'L19', 'L21'], ['折返/分流 19–21', 'L22', 'L23'], ['分流后 21–22', 'L24', 'L25'],
  ['环湖 22–40', 'L25', 'L32'], ['湿地→终点 40–42', 'L33', 'L35'],
];
console.log('\n=== 分段速率 ===');
for (const [name, a, b] of P) {
  const x = VO_LINES.find((l) => l.id === a), y = VO_LINES.find((l) => l.id === b);
  const dt = (y.t + y.d / 2) - (x.t + x.d / 2);
  console.log(`${name.padEnd(18)} ${x.km.toFixed(2)} → ${y.km.toFixed(2)} km  /  ${dt.toFixed(2)}s  =  ${((y.km - x.km) / dt).toFixed(2)} km/s`);
}

console.log('\n=== 关键时刻 ===');
console.log('母蟹冲线        ', T_FEMALE_FINISH.toFixed(2), 's');
console.log('分屏            ', `k0=${SPLIT.k0} → ${tAtKm(SPLIT.k0).toFixed(2)}s · k1=${SPLIT.k1} → ${tAtKm(SPLIT.k1).toFixed(2)}s`);
for (const km of [18.5, 19.2, 19.61, 20.91, 22, 23, 25, 27.5, 28, 29.2, 30, 35, 40, 40.6, 41.4, 42.195]) {
  console.log(`  ${String(km).padStart(7)} km → ${tAtKm(km).toFixed(2)}s`);
}
console.log('\n=== 项目点到站（公蟹）===');
for (const p of POINTS.filter((p) => p.tMale !== null)) console.log(`  ${p.name.padEnd(22)} ${p.tMale}s`);
console.log('\nMALE_KM 锚点数', MALE_KM.length, '· 片长', DURATION);
