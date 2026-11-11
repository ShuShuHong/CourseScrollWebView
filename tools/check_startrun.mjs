// 起跑段（F270–296）两只螃蟹是否**一直在往前跑**（客户 2026-11-08）
//   node tools/check_startrun.mjs
import { launch, openPage } from './shot.mjs';
import { WIN_T } from '../src/config/venue.js';

const ok = [], bad = [];
const chk = (n, c, d) => (c ? ok : bad).push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' · ' + d : ''}`);

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1280, 720, 1);
await p.waitForFunction('window.__ready !== undefined');
await p.evaluate(() => window.__ready);

const rows = [];
for (let f = 262; f <= 300; f++) {
  const r = await p.evaluate(async (n) => {
    await window.__seekFrame(n);
    const st = window.__director.state;
    return { f: n, t: +st.t.toFixed(4), scene: st.scene, x: st.venuePose?.femaleX ?? null, still: st.venuePose?.still ?? null };
  }, f);
  rows.push(r);
}
await b.close();

const win = rows.filter((r) => r.scene === 'venue');
const xs = win.map((r) => r.x).filter((v) => v !== null);
const steps = xs.slice(1).map((v, i) => +(v - xs[i]).toFixed(4));
const minStep = Math.min(...steps);
const zero = steps.filter((s) => Math.abs(s) < 1e-4).length;

console.log(`起跑副本窗口 ${WIN_T.start0}–${WIN_T.start1}s · 采样 ${win.length} 帧（F${win[0]?.f}–F${win.at(-1)?.f}）`);
console.log(`  x ${Math.min(...xs).toFixed(2)} → ${Math.max(...xs).toFixed(2)} m · 每帧位移 min ${minStep.toFixed(4)} / max ${Math.max(...steps).toFixed(4)} m`);
console.log(`  播放头最后 20 帧 x：${xs.slice(-20).map((v) => v.toFixed(2)).join(' ')}`);
if (minStep <= 0) console.log(`  停住的帧：${win.filter((r, i) => i && Math.abs(steps[i - 1]) < 1e-4).map((r) => 'F' + r.f).slice(0, 12).join(' ')}`);

chk('F262–300 全程位移 > 0（没有站住）', zero === 0, `零位移 ${zero} 处`);
chk('切走前 20 帧仍在前进', xs.slice(-20).every((v, i, a) => i === 0 || v - a[i - 1] > 0.05),
  `末段速度 ${(xs.at(-1) - xs.at(-6)).toFixed(2)} m / 5 帧`);
// 客户点名的是 276–296
const seg = win.filter((r) => r.f >= 276 && r.f <= 296);
const segSteps = seg.slice(1).map((r, i) => r.x - seg[i].x);
chk('276–296 帧一直往前跑', segSteps.every((s) => s > 0.05), `最小一步 ${Math.min(...segSteps).toFixed(3)} m`);

for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
