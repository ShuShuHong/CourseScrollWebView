// 海拔窗自检：两条桥弧（顶点=26m、两脚落在地面曲线）、弧长与形状、进度点贴弧且不跳帧
import { launch, openPage } from './shot.mjs';
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const el = document.querySelector('[data-elev]');
  if (!el) return { t: +tt.toFixed(2), none: true };
  const arcs = [...el.querySelectorAll('path')]
    .filter((e) => (e.getAttribute('stroke-dasharray') || '') && /L/.test(e.getAttribute('d') || '') && ((e.getAttribute('d') || '').match(/L/g) || []).length > 20)
    .map((e) => e.getAttribute('d'));
  const dots = [...el.querySelectorAll('circle')].map((c) => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') }));
  return { t: +tt.toFixed(2), arcs, dots };
}, t);

const kmAt = (km) => p.evaluate(async (k) => {
  let lo = 0, hi = 76.81, tt = 0;
  for (let i = 0; i < 36; i++) { tt = (lo + hi) / 2; await window.__seek(tt); if (window.__dbg.state().male.km < k) lo = tt; else hi = tt; }
  return +tt.toFixed(2);
}, km);

const tb = [];
for (const km of [8.001, 8.27, 8.539, 18.311, 18.58, 18.849]) tb.push(await kmAt(km));
const q = await probe(20);
console.log('=== 桥弧 ===');
console.log('弧数量:', new Set(q.arcs).size, '(应为 2；每条弧有白底+红线两层描边)');
for (const d of [...new Set(q.arcs)]) {
  const pts = d.replace('M ', '').split(' L ').map((s) => s.trim().split(/\s+/).map(Number));
  const xs = pts.map((a) => a[0]), ys = pts.map((a) => a[1]);
  const apex = pts.reduce((m, a) => (a[1] < m[1] ? a : m));
  console.log(`  ${pts.length} 点 · x ${Math.min(...xs)}–${Math.max(...xs)}（宽 ${Math.max(...xs) - Math.min(...xs)}）· 顶点 y=${apex[1]} @x=${apex[0]} · 两脚 y=${pts[0][1]}/${pts[pts.length - 1][1]}`);
}
// 26m 与 0m 的像素位置（py 映射：h-46 - m/32*(h-110) = 194 - m*4.06）
console.log('  26m 应在 y≈', (194 - 26 * (130 / 32)).toFixed(1), '· 地面 4m ≈', (194 - 4 * (130 / 32)).toFixed(1));

console.log('\n=== 进度点 ===');
for (const [i, tag] of [[0, '第一次过桥'], [3, '第二次过桥']]) {
  const rows = [];
  for (let t = tb[i] - 0.5; t <= tb[i + 2] + 0.5; t += 1 / 30) {
    const r = await probe(t);
    const d = (r.dots || []).find((x) => x.r === 8);
    if (d) rows.push({ t: +t.toFixed(2), x: +d.cx.toFixed(1), y: +d.cy.toFixed(1) });
  }
  const ys = rows.map((r) => r.y);
  let mx = 0;
  for (let k = 1; k < rows.length; k++) mx = Math.max(mx, Math.abs(rows[k].x - rows[k - 1].x));
  console.log(`${tag} ${tb[i]}–${tb[i + 2]}s：y ${Math.max(...ys).toFixed(1)}(地面) → ${Math.min(...ys).toFixed(1)}(26m) → ${ys[ys.length - 1].toFixed(1)}；横向最大 ${mx.toFixed(2)} px/帧`);
}
// ── 图例（客户 2026-11-03 ③）：只留一条「最高点：桥面 26m」
const lg = await p.evaluate(async () => {
  await window.__seek(30.0);
  // 只看**海拔窗自己那块区域**里的字（左下角 x<640 / y>700）——
  //   以前是对全画面做正则，信息卡里“桥顶约26m，赛道最高点”也会被算进来，换配音后卡的时间一挪就误报
  const panel = [...document.querySelectorAll('#ov text')]
    .filter((e) => {
      const r = e.getBoundingClientRect?.() || { x: 0, y: 0 };
      const m = e.getCTM?.();
      const box = e.getBBox?.() || { x: 0, y: 0, width: 0, height: 0 };
      const px = m ? m.a * box.x + m.c * box.y + m.e : r.x;
      const py = m ? m.b * box.x + m.d * box.y + m.f : r.y;
      return px < 640 && py > 700;
    })
    .map((e) => e.textContent.trim())
    .filter((x) => /海拔剖面|最高点|湖面|桥面/.test(x));
  return { all: panel, hasLow: panel.includes('湖面'), hasBridge: panel.some((x) => /最高点：桥面 26m/.test(x)) };
});
console.log('\n=== 图例 ===');
console.log('  海拔窗内文字:', lg.all.join(' | '));
const okL = lg.hasBridge && !lg.hasLow && lg.all.length === 2;
console.log(okL ? 'PASS  图例只保留「最高点：桥面 26m」' : 'FAIL  图例应只剩一条（实测 ' + lg.all.join(' | ') + '）');
await b.close();
