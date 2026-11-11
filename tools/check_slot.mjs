// 地标卡槽位让位动画自检：前一张消失后 0.5s 缓入缓出平移到上一格，无瞬移
import { launch, openPage } from './shot.mjs';
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const svg = document.querySelector('#ov');
  const out = [];
  // 卡宽固定 560：按它定位卡片组（scale=1 时 transform 里没有 scale，不能靠选择器筛）
  for (const rect of svg.querySelectorAll('rect[width="560"]')) {
    const g = rect.closest('g');
    if (!g) continue;
    const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
    const name = [...g.querySelectorAll('text')].map((e) => e.textContent).join('|');
    out.push({ y: +(+m[2]).toFixed(2), x: +(+m[1]).toFixed(2), op: +(g.getAttribute('opacity') || 1), name });
  }
  return { t: +tt.toFixed(2), cards: out };
}, t);

// 窗口
const win = await p.evaluate(() => window.__dbg.stickers());
console.log('地标卡窗口:', JSON.stringify(win));

const rows = [];
for (let t = 0; t <= 76.8; t += 1 / 30) {
  const r = await probe(t);
  rows.push(r);
}
// 逐帧检查每张卡的 y 变化
const byName = new Map();
for (const r of rows) for (const c of r.cards) {
  if (c.op <= 0.02) continue;
  if (!byName.has(c.name)) byName.set(c.name, []);
  byName.get(c.name).push({ t: r.t, y: c.y, op: c.op });
}
let worst = 0, worstAt = null;
for (const [n, arr] of byName) {
  for (let i = 1; i < arr.length; i++) {
    const dy = Math.abs(arr[i].y - arr[i - 1].y);
    if (dy > worst) { worst = dy; worstAt = [n, arr[i - 1].t]; }
  }
}
console.log(`\n逐帧最大纵向位移: ${worst.toFixed(2)} px/帧 @ ${JSON.stringify(worstAt)}（瞬移时为 306）`);
// 找出发生位移的那一段，验证用时与曲线
for (const [n, arr] of byName) {
  const y0 = arr[0].y, yEnd = arr[arr.length - 1].y;
  const moving = arr.filter((a, i) => i > 0 && Math.abs(a.y - arr[i - 1].y) > 0.3);
  if (!moving.length) continue;
  const t0 = moving[0].t, t1 = moving[moving.length - 1].t;
  const v = [];
  for (let i = 1; i < arr.length; i++) v.push({ t: arr[i].t, v: (arr[i].y - arr[i - 1].y) * 30 });
  const inWin = v.filter((q) => q.t >= t0 - 0.04 && q.t <= t1 + 0.04);
  const vmax = Math.max(...inWin.map((q) => Math.abs(q.v)));
  const vStart = Math.abs(inWin[0].v), vEnd = Math.abs(inWin[inWin.length - 1].v);
  const mid = inWin[Math.floor(inWin.length / 2)];
  console.log(`\n${n}: y ${y0} → ${yEnd}，位移段 ${t0.toFixed(2)}–${t1.toFixed(2)}s（${(t1 - t0 + 1 / 30).toFixed(2)}s）`);
  console.log(`  速度 px/s：起点 ${vStart.toFixed(1)} · 中段 ${Math.abs(mid.v).toFixed(1)} · 终点 ${vEnd.toFixed(1)} · 峰值 ${vmax.toFixed(1)}`);
  console.log(`  曲线形状（每 0.08s 的位移 px）：${inWin.filter((_, i) => i % 3 === 0).map((q) => q.v.toFixed(0)).join(' ')}`);
}
await b.close();
