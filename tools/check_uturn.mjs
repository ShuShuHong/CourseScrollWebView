// 折返点标识自检（客户 2026-10-27 十批：贴地、字的底边正好抵在折返点上、沿赛道方向、只留文字）
//
// ① 路线箭头方向：解析 world3d.js 的 chevron 表达式
// ② 只有文字：不该有 #FFB020 的路径（黄色 U 型线已删）
// ③ 提前量：按实际配速给（2026-11-08 起不再固定 2 km）
// ④ **底边抵点**：字形盒底边中点 = 折返点投影（逐帧 ≤0.5px）
// ⑤ **贴地 + 沿路**：字的排字方向 = 该处赛道切线的屏幕方向（≤3°），行列式 > 0（不镜像）
// ⑥ 正着读：字形盒顶边在屏幕上高于基线
// ⑦ 世界字号逐帧不变
import fs from 'node:fs';
import { launch, openPage } from './shot.mjs';
import { EVENTS, tAtKm } from '../src/config/story.js';

const ok = [], bad = [];
const chk = (name, cond, detail) => (cond ? ok : bad).push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);

// ── ① 箭头方向
console.log('=== ① 路线箭头方向 ===');
const src = fs.readFileSync('src/engine/world3d.js', 'utf8');
const m = src.match(/float f = fract\(([^;]+)\);/);
console.log('  表达式:', m && m[1]);
if (!m) bad.push('FAIL  没找到 chevron 表达式');
else {
  const bandKm = (a, t, chev = 0.14) => chev * (0.13 + t * 0.7 - a * 0.45);
  const k0 = bandKm(0, 3), kMid = bandKm(0.3, 3), kEdge = bandKm(0.62, 3), k0b = bandKm(0, 3.1);
  chk('箭头尖角朝前（中线领先、路缘拖后）', k0 > kMid && kMid > kEdge, `${k0.toFixed(4)} > ${kMid.toFixed(4)} > ${kEdge.toFixed(4)}`);
  chk('箭头随时间为 +km 流动', k0b > k0, `Δ=+${(k0b - k0).toFixed(4)} km / 0.1s`);
}

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?v=' + Date.now());

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const svg = document.querySelector('#ov');
  const st = window.__dbg.state();
  const F = window.__dbg.FULL, P = window.__dbg.project;
  const el = [...svg.querySelectorAll('text')].find((e) => (e.textContent || '').trim() === '折返点');
  const gold = [...svg.querySelectorAll('path')].filter((e) => (e.getAttribute('stroke') || '').toUpperCase() === '#FFB020').length;
  const r = { t: +tt.toFixed(2), km: +st.male.km.toFixed(3), gold, lab: null };
  if (!el) return r;
  const g = el.closest('g');
  const M = g.transform.baseVal.consolidate().matrix;
  const bb = el.getBBox();
  const dbg = g.getAttribute('data-u') || '';
  const km = +((dbg.match(/km:([\d.]+)/) || [])[1] || NaN);
  const kb = +((dbg.match(/base:([\d.]+)/) || [])[1] || NaN);
  const pr = P(...F.pos(km), 0.3);
  // 基线中点 = 局部原点；字形盒顶边中点 = 局部 (0, bb.y)
  const bot = [M.e, M.f];
  const top = [M.c * bb.y + M.e, M.d * bb.y + M.f];
  const left = [M.a * bb.x + M.e, M.b * bb.x + M.f];
  const right = [M.a * (bb.x + bb.width) + M.e, M.b * (bb.x + bb.width) + M.f];
  // 该处赛道切线（和渲染端一致的 ±8pt 中心差分）
  const P2 = F.pos(kb), d2 = F.dir(kb, 0.012);
  const tA = P(P2[0] - d2[0] * 8, P2[1] - d2[1] * 8, 0.3);
  const tB = P(P2[0] + d2[0] * 8, P2[1] + d2[1] * 8, 0.3);
  const norm = (v) => ((v % 180) + 180) % 180;
  const ang = (x, y) => Math.atan2(y, x) * 180 / Math.PI;
  // 期望方向 = 赛道切线 + rotDeg（客户自己在 story.js 里调的角度，检查要跟着它一起算）
  const rotDeg = +((dbg.match(/rot:(-?[\d.]+)/) || [])[1] || 0);
  let dRoad = Math.abs(norm(ang(right[0] - left[0], right[1] - left[1]) - (ang(tB.x - tA.x, tB.y - tA.y) + rotDeg)));
  dRoad = Math.min(dRoad, 180 - dRoad);
  r.lab = {
    km,
    bottomGap: +Math.hypot(bot[0] - pr.x, bot[1] - pr.y).toFixed(2),
    dRoad: +dRoad.toFixed(2),
    det: +(M.a * M.d - M.b * M.c).toFixed(2),
    readable: top[1] < bot[1],
    pxH: +Math.hypot(top[0] - bot[0], top[1] - bot[1]).toFixed(1),
    pxW: +Math.hypot(right[0] - left[0], right[1] - left[1]).toFixed(1),
    fsPt: (dbg.match(/fsPt:([\d.]+)/) || [])[1],
    rotDeg,
  };
  return r;
}, t);

// 扫描范围跟着折返事件自己走：从“提前 2km 出现”的时刻扫到跑过点位 1s 之后
const ts = [];
for (const ev of EVENTS.filter((e) => e.type === 'uturn')) {
  const t0 = tAtKm(ev.at.km), t1 = tAtKm(ev.km) + 1.0;
  for (let t = t0 - 0.3; t <= t1; t += 0.1) ts.push(+t.toFixed(2));
}
const rows = [];
for (const t of ts) rows.push(await probe(t));
const withLab = rows.filter((r) => r.lab);

// ── ② 只有文字
console.log('\n=== ② 只有文字 ===');
const goldMax = Math.max(...rows.map((r) => r.gold));
console.log(`  #FFB020 路径条数最大值: ${goldMax}`);
chk('没有黄色 U 型线', goldMax === 0, `max ${goldMax}`);

// ── ③ 提前量：2026-11-08 起不再固定 2 km —— 匀速 0.80 km/s 下，2 km 等于提前 2.5 s，
//   地面字会比螃蟹早很久亮起来。现在的口径是「提前量 ≤ 0.8 km 且 ≥ 0.3 km」，
//   两个折返点各自按实际配速取值（19.61 仍走 2 km 因为那一段是减速通过）。
console.log('\n=== ③ 提前量 ===');
const first1 = rows.find((r) => r.lab && r.km < 22);
const first2 = rows.find((r) => r.lab && r.km > 25);
const lead1 = 19.61 - (first1?.km ?? 0), lead2 = 29.2 - (first2?.km ?? 0);
console.log(`  南漪路折返：首现 ${first1?.t}s · 公蟹 ${first1?.km}km（点位 19.61，提前 ${lead1.toFixed(2)} km）`);
console.log(`  全马折返点：首现 ${first2?.t}s · 公蟹 ${first2?.km}km（点位 29.20，提前 ${lead2.toFixed(2)} km）`);
chk('南漪路折返提前量 0.3–2.2 km', !!first1 && lead1 > 0.3 && lead1 < 2.2, `提前 ${lead1.toFixed(2)} km`);
chk('全马折返点提前量 0.3–0.9 km', !!first2 && lead2 > 0.3 && lead2 < 0.9, `提前 ${lead2.toFixed(2)} km`);

// ── ④ 底边抵点
console.log('\n=== ④ 字的底边抵在折返点上 ===');
const gaps = withLab.map((r) => r.lab.bottomGap);
console.log(`  底边中点 vs 点位投影：${Math.min(...gaps)}–${Math.max(...gaps)} px（${withLab.length} 帧）`);
chk('底边正好抵在点位上（≤0.5px）', Math.max(...gaps) <= 0.5, `max ${Math.max(...gaps)}px`);

// ── ⑤ 贴地沿路
console.log('\n=== ⑤ 贴地 · 沿赛道方向 ===');
const ds = withLab.map((r) => r.lab.dRoad);
const rots = [...new Set(withLab.map((r) => r.lab.rotDeg))];
console.log(`  配置的 rotDeg：${rots.join(' / ')}°`);
console.log(`  排字方向 vs 期望（赛道切线 + rotDeg）：${Math.min(...ds)}–${Math.max(...ds)}°`);
chk('排字方向 = 赛道切线 + rotDeg（≤3°）', Math.max(...ds) <= 3, `max ${Math.max(...ds)}°`);
chk('不镜像（行列式 > 0）', withLab.every((r) => r.lab.det > 0), `min ${Math.min(...withLab.map((r) => r.lab.det))}`);

// ── ⑥ 正着读
const upsideDown = withLab.filter((r) => !r.lab.readable).length;
console.log(`\n=== ⑥ 正着读 ===\n  倒挂帧: ${upsideDown}/${withLab.length}`);
chk('没有倒挂', upsideDown === 0);

// ── ⑦ 字号
const fsPts = [...new Set(withLab.map((r) => r.lab.fsPt))];
const hs = withLab.map((r) => r.lab.pxH);
console.log(`\n=== ⑦ 字号 ===\n  世界字号 ${fsPts.join(' / ')} pt · 屏幕字高 ${Math.min(...hs).toFixed(0)}–${Math.max(...hs).toFixed(0)} px`);
chk('世界字号逐帧不变', fsPts.length <= 2, fsPts.join(' / '));
chk('屏幕字高 ≥ 18px', Math.min(...hs) >= 18, `${Math.min(...hs).toFixed(0)}px`);

await b.close();
console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
