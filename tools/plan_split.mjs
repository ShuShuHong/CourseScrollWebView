// 分流副本平面图 v3（客户 2026-11-07：三尖头导流岛 + 三条腿隔离带）
//   · 准正交俯视（fov≈8° @ 900 m），关雾、关 SVG 层
//   · 按世界范围自动算像素包围盒 → 裁切 → 叠 5/10/50 m 网格 + 刻度 + 路线 + 编号 + 尺寸
//   · 产出 refs/分流副本/平面图/分流副本-平面图.png + 坐标表.csv + dist/分流副本-平面图.html
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME } from './shot.mjs';
import {
  SP, roadZ, branchAt, DIVIDERS, ISLAND, ISLAND_ARCS, ISLAND_TRI, SIGN, bankZ, sampleAlong, femaleAt, maleAt,
} from '../src/config/split.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'refs', '分流副本', '平面图');
fs.mkdirSync(OUT, { recursive: true });

// 取景（世界米）：三条腿的隔离带都要装下 —— 西到 −98、东到 +111、北到 −110
const ARGV = process.argv.slice(2);
const BOX = ARGV.length >= 4 ? ARGV.slice(0, 4).map(Number) : [-126, 118, -116, 28];
const SUFFIX = ARGV[4] || '';
const X0 = BOX[0], X1 = BOX[1], Z0 = BOX[2], Z1 = BOX[3];
const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
const CAM_H = 900, W = 1920, H = 1080, DPR = 4;
// 屏幕上方 = +x ⇒ 世界 x 跨度落在画面的竖直方向
const FOV = 2 * Math.atan((X1 - X0) * 1.06 / 2 / CAM_H) * 180 / Math.PI;

const pts = [];
const K = (x, z, h = 0) => { pts.push([x, z, h]); return pts.length - 1; };

// 网格（按取景范围自适应）
const grid = [];
for (let x = Math.floor(X0 / 5) * 5; x <= Math.ceil(X1 / 5) * 5; x += 5) grid.push({ n: x, a: K(x, Z0 - 2), b: K(x, Z1 + 2) });
for (let z = Math.floor(Z0 / 5) * 5; z <= Math.ceil(Z1 / 5) * 5; z += 5) grid.push({ n: z, a: K(X0 - 2, z), b: K(X1 + 2, z) });
// 屏幕上方 = +x ⇒ x 刻度画在左右两边；+z 向右 ⇒ z 刻度画在上下两边
const xLab = [], zLab = [];
for (let x = Math.ceil(X0 / 10) * 10; x <= X1; x += 10) xLab.push({ n: x, iL: K(x, Z0 + 0.8), iR: K(x, Z1 - 0.8) });
for (let z = Math.ceil(Z0 / 10) * 10; z <= Z1; z += 10) zLab.push({ n: z, iB: K(X0 + 0.8, z), iT: K(X1 - 0.8, z) });

// 路线
const R = { main: [], branch: [], f: [], m: [] };
for (let x = X0; x <= X1; x += 2) R.main.push(K(x, roadZ(x)));
for (let s = 0; s <= 200; s += 2) { const q = branchAt(s); if (q.z > Z0 - 10) R.branch.push(K(q.x, q.z)); }
for (let s = -140; s <= 60; s += 1) { const f = femaleAt(s), m = maleAt(s); if (f.z > Z0 - 6) R.f.push(K(f.x, f.z)); if (m.z > Z0 - 6) R.m.push(K(m.x, m.z)); }

const islandIdx = ISLAND.map(([x, z]) => K(x, z, 0.24));
// 三尖形不再铺装，改成三道弧上的粉蓝水马
const ARC_IDX = ISLAND_ARCS.map((a) => a.map(([x, z]) => K(x, z, 0.86)));
const triIdx = ISLAND_TRI.map(([x, z]) => K(x, z, 0.24));
const bankIdx = sampleAlong(bankZ, X0 - 10, X1 + 10, 60).map(([x, z]) => K(x, z));

// 双黄线：两条 0.30 m 实线，中心距 0.66 m（跟三维场景里画的一致）
const YEL_A = [], YEL_B = [], YEL_CA = [], YEL_CB = [];
for (let x = X0; x <= X1; x += 2) { YEL_A.push(K(x, roadZ(x) - 0.15)); YEL_B.push(K(x, roadZ(x) + 0.15)); }
for (let s = 0; s <= 200; s += 2) {
  const q = branchAt(s);
  if (q.z < Z0 - 10) break;
  const n = [-q.t[1], q.t[0]];
  YEL_CA.push(K(q.x + n[0] * 0.15, q.z + n[1] * 0.15));
  YEL_CB.push(K(q.x - n[0] * 0.15, q.z - n[1] * 0.15));
}

// 三条隔离带：0–50 m 水马（白实线）/ 50–100 m 反光锥（橙虚线）
const LEG = DIVIDERS.map((D) => {
  const wl = D.waterLen ?? SP.waterSeg;
  return {
    id: D.id, name: D.name, tip: D.tip, end: D.pts[100], mid: D.pts[Math.round(wl / 2)], cMid: D.pts[Math.round((wl + 100) / 2)],
    water: D.pts.slice(0, Math.round(wl) + 1).map(([x, z]) => K(x, z, 0.86)),
    cone: D.pts.filter((q, i) => i >= wl + 1 && i % 4 === 0 && i <= 98).map(([x, z]) => K(x, z, 0.30)),
  };
});

// 编号道具
const PROPS = [
  { id: 1, name: '岔口（分叉点）', x: SP.tipX, z: 0, h: 0, off: [-20, -13], size: '支路与来路夹角 100°；主路往南弯 10°', src: 'split.js · SP.tipX / kinkDeg' },
  { id: 2, name: '三尖水马（原导流岛）', x: SP.tipX + 5, z: -3.4, h: 0.86, off: [-17, -17], size: '闭合 Catmull-Rom 三道弧上的粉蓝水马围合；三点 (2.2,0)(12.2,0)(7.2,−10)，内凹 0.50/0.45/0.45 m', src: 'split.js · ISLAND_ARCS' },
  { id: 3, name: '注水马（西 12 m / 东北 50 m）', x: LEG[0].mid[0], z: LEG[0].mid[1], h: 0.86, off: [-8, -15], size: '单元 2.0 m × 高 0.86 m，白身 + 粉蓝腰带；西腿只做 12 m，其余 50 m', src: 'buildMedian() · DIVIDERS' },
  { id: 4, name: '反光锥（四米一个）', x: LEG[0].cMid[0], z: LEG[0].cMid[1], h: 0.62, off: [-8, 14], size: '每 4 m 一个，锥体 0.62 m', src: 'buildMedian() · DIVIDERS' },
  { id: 5, name: '分流牌（落地牌）', x: SIGN.x, z: SIGN.z, h: SIGN.y0 + SIGN.h, off: [-18, 16], size: '2.6×3.06 m 落地标识牌，牌面下沿 0.16 m，距岔口 100 m', src: 'buildSign() · SIGN' },
  { id: 6, name: '双黄线（普通双向车道）', x: -40, z: 0, h: 0, off: [9, -14], size: '宽 0.45 m（2×0.15 线 + 0.15 间距），隔离设施压在线上', src: 'buildMarkings() · PAL.yellow' },
  { id: 7, name: '母蟹车道中心线', x: -60, z: -5.05, h: 0, off: [-10, -6], size: 'z = −5.05（北侧车道）', src: 'femaleAt()' },
  { id: 8, name: '公蟹车道中心线', x: -60, z: 5.05, h: 0, off: [10, 6], size: 'z = +5.05（南侧车道）', src: 'maleAt()' },
  { id: 9, name: '主路弯 10°（R60）', x: 36, z: roadZ(36), h: 0, off: [-16, -8], size: '圆弧半径 60 m，弯向 +z（南）', src: 'roadZ()' },
  { id: 10, name: '支路（18 m）', x: 6.2, z: -30, h: 0, off: [14, 8], size: '40 m 内由 −80° 收敛到 −90°', src: 'branchAt()' },
  { id: 11, name: '支路人行横道', x: branchAt(62).x, z: branchAt(62).z, h: 0, off: [14, -10], size: '跨支路 18 m', src: 'buildMarkings()' },
  { id: 12, name: '主会场门架', x: branchAt(78).x, z: branchAt(78).z, h: 0, off: [-16, 8], size: '6.0 m 高 × 10.5 m 跨 + 志愿者', src: 'buildWest()' },
  { id: 13, name: '主路人行横道', x: -129, z: roadZ(-129), h: 0, off: [-10, -13], size: 'x −133…−129.5，跨主路 18 m', src: 'buildMarkings()' },
  { id: 14, name: '北侧绿篱', x: -40, z: roadZ(-40) - 15, h: 0.92, off: [-12, -9], size: '沿人行道外 3.6 m，高 0.92 m', src: 'buildWest()' },
  { id: 15, name: '帐篷带', x: -50, z: roadZ(-50) - 22, h: 0, off: [12, -9], size: '5.2×3.6 m，间距 11–13 m', src: 'buildWest()' },
  { id: 16, name: '东侧驳岸 / 步道', x: 0, z: bankZ(0) - 2.4, h: 0, off: [12, 6], size: '3 m 石板道 + 三级台阶下水', src: 'buildEast()' },
  { id: 17, name: '东腿隔离带末端', x: LEG[1].end[0], z: LEG[1].end[1], h: 0, off: [-16, 11], size: '东腿 100 m 处（50 水马 + 50 锥结束）', src: 'DIVIDERS[1]' },
  { id: 18, name: '北腿隔离带末端', x: LEG[2].end[0], z: LEG[2].end[1], h: 0, off: [15, -7], size: '北腿 100 m 处（50 水马 + 50 锥结束）', src: 'DIVIDERS[2]' },
];
for (const p of PROPS) p.i = K(p.x, p.z, p.h || 0);

// 尺寸标注
const DIMS = [
  { a: [-120, roadZ(-120) - 9], b: [-120, roadZ(-120) + 9], label: '主路 18 m', off: [-11, 0] },
  { a: [branchAt(40).x - 9, branchAt(40).z], b: [branchAt(40).x + 9, branchAt(40).z], label: '支路 18 m', off: [0, 10] },
  { a: [SP.tipX, 0], b: [SIGN.x, 0], label: '分流牌距岔口 100 m', off: [-8, 11] },
  { a: ISLAND_TRI[1], b: [LEG[1].end[0], LEG[1].end[1]], label: '东腿隔离带 100 m', off: [-11, 7] },
];
for (const d of DIMS) { d.ai = K(d.a[0], d.a[1], 0.2); d.bi = K(d.b[0], d.b[1], 0.2); }

const crabPts = [];
for (const t of [49.833, 51.5, 53.0, 54.2, 54.733]) {
  const s = SP.s0 + SP.speed * (t - 1495 / 30);
  const f = femaleAt(s), m = maleAt(s);
  crabPts.push({ t: +t.toFixed(2), s: +s.toFixed(1), f: K(f.x, f.z), m: K(m.x, m.z) });
}
const tipI = K(SP.tipX, 0);
const cornerIdx = [K(X0, Z0), K(X1, Z0), K(X1, Z1), K(X0, Z1)];
// 比例尺锚点（世界 50 m 长，画在图内左下角）
const barA = K(X0 + 12, Z0 + 6), barB = K(X0 + 12, Z0 + 16), barC = K(X0 + 12, Z0 + 56);

// ── 渲染
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
await page.goto('file:///' + path.join(ROOT, 'dist', 'stage-B-导航地图.html').replace(/\\/g, '/') + '?clean=1&dpr=' + DPR, { waitUntil: 'load' });
await page.evaluate(() => window.__ready || Promise.resolve());
await page.evaluate(() => window.__seekFrame(1600));
const got = await page.evaluate(({ fov, camH, cx, cz, W, H, pts }) => {
  const Wd = window.__director.splitWorld;
  document.getElementById('ov').style.display = 'none';
  Wd.scene.fog = null;
  const cam = Wd.camera;
  cam.up.set(1, 0, 0);
  cam.fov = fov; cam.aspect = W / H; cam.near = 150; cam.far = 4200;
  cam.position.set(cx, camH, cz);
  cam.lookAt(cx, 0, cz);
  cam.setViewOffset(W, H, 0, 0, W, H);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  Wd._rect = { x: 0, y: 0, w: W, h: H };
  // 平面图专用：路面压深一档，和草地拉开对比
  Wd.mats.asphalt.color.setScalar(0.80);
  Wd.mats.solid.color.setScalar(0.94);
  Wd.renderView({ x: 0, y: 0, w: W, h: H });
  return { png: Wd.renderer.domElement.toDataURL('image/png'), xy: pts.map(([x, z, h]) => { const q = Wd.project(x, z, h); return [q.x, q.y]; }) };
}, { fov: FOV, camH: CAM_H, cx: CX, cz: CZ, W, H, pts });
await browser.close();

fs.writeFileSync(path.join(OUT, '_raw.png'), Buffer.from(got.png.split(',')[1], 'base64'));
const px = got.xy.map(([u, v]) => [u * DPR, v * DPR]);

// 裁切包围盒 = 四个世界角 + 余量
const cx4 = cornerIdx.map((i) => px[i]);
const pad = 46;
let bx0 = Math.min(...cx4.map((p) => p[0])) - pad, bx1 = Math.max(...cx4.map((p) => p[0])) + pad;
let by0 = Math.min(...cx4.map((p) => p[1])) - pad, by1 = Math.max(...cx4.map((p) => p[1])) + pad;
bx0 = Math.max(0, Math.round(bx0)); by0 = Math.max(0, Math.round(by0));
bx1 = Math.min(W * DPR, Math.round(bx1)); by1 = Math.min(H * DPR, Math.round(by1));
const CW = bx1 - bx0, CH = by1 - by0;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(OUT, '_raw.png'), '-vf', `crop=${CW}:${CH}:${bx0}:${by0}`, path.join(OUT, '_crop.png')]);

const P = (i) => [px[i][0] - bx0, px[i][1] - by0];
const r1 = (n) => Math.round(n * 10) / 10;
// 每米像素：z 方向（屏幕水平）与 x 方向（屏幕竖直）各量一次取均值
const pxPerM = (() => {
  const a = P(barA), b = P(barB), c = P(barC);
  const dz = Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;      // 10 m 沿 z
  const dx = Math.hypot(c[0] - b[0], c[1] - b[1]) / 40;      // 40 m 沿 x
  return (dz + dx) / 2;
})();
const tw = (t, fs) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? fs : fs * 0.56), 0);

// ── 叠加
let g = '';
for (const L of grid) {
  const a = P(L.a), b = P(L.b);
  const isAxis = Math.abs(L.n) < 0.01, isMajor = Math.abs(L.n % 50) < 0.01;
  g += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${isAxis ? '#0E3A52' : isMajor ? 'rgba(14,58,82,.50)' : 'rgba(14,58,82,.15)'}" stroke-width="${isAxis ? 3.4 : isMajor ? 2.0 : 1.0}"/>`;
}
for (const L of xLab) {
  const [, yL] = P(L.iL);
  g += `<text x="14" y="${r1(yL + 9)}" text-anchor="start" font-size="25" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="6">${L.n}</text>`;
  g += `<text x="${CW - 14}" y="${r1(yL + 9)}" text-anchor="end" font-size="25" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="6">${L.n}</text>`;
}
for (const L of zLab) {
  const [uB] = P(L.iB);
  for (const y of [38, CH - 14]) g += `<text x="${r1(uB)}" y="${y}" text-anchor="middle" font-size="25" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="6">${L.n}</text>`;
}
const poly = (idx, color, w, dash, op = 0.95) => {
  const d = idx.map((i) => P(i)).map(([x, y], k) => `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(' ');
  g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="${op}"/>`;
};
poly(bankIdx, '#4C7FC4', 4, '10 8');
poly(R.main, '#5B6672', 9, '24 13');
poly(R.branch, '#F0238C', 10);
poly(R.f, '#F0238C', 5, '15 9');
poly(R.m, '#1475D9', 5, '15 9');
// 双黄线（两条细实线；隔离设施就压在上面）
const yw = Math.max(1.6, r1(0.15 * pxPerM));
for (const L2 of [YEL_A, YEL_B, YEL_CA, YEL_CB]) poly(L2, '#E9B420', yw, null, 0.9);
// 三条腿的隔离带：水马（白）压线、反光锥（橙虚）
const WU = r1(2 * pxPerM), WB = r1(0.62 * pxPerM), WG = r1(4 * pxPerM);
for (const L of LEG) {
  const wq = L.water.map((i) => P(i));
  const wd = wq.map(([x, y], k) => `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(' ');
  g += `<path d="${wd}" fill="none" stroke="#0E3A52" stroke-width="${r1(WB * 1.5)}" opacity=".22" stroke-linecap="round"/>`;
  g += `<path d="${wd}" fill="none" stroke="#FFFFFF" stroke-width="${WB}" stroke-linecap="butt"/>`;
  g += `<path d="${wd}" fill="none" stroke="#F0238C" stroke-width="${WB}" stroke-dasharray="${WU} ${WG}" stroke-linecap="butt"/>`;
  g += `<path d="${wd}" fill="none" stroke="#1475D9" stroke-width="${WB}" stroke-dasharray="${WU} ${WG}" stroke-dashoffset="${r1(2 * pxPerM)}" stroke-linecap="butt"/>`;
  const cq = L.cone.map((i) => P(i));
  g += `<path d="${cq.map(([x, y], k) => `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(' ')}" fill="none" stroke="#F4701E" stroke-width="${r1(0.42 * pxPerM)}" stroke-dasharray="${r1(0.5 * pxPerM)} ${r1(1.5 * pxPerM)}"/>`;
}
// 三尖形：三道弧的中段摆粉蓝水马，三个尖 1.75 m 内改反光锥（跟三维一致）
{
  const BW = Math.max(5, r1(0.62 * pxPerM)), U = r1(1.9 * pxPerM);
  for (const arc of ARC_IDX) {
    const pts2 = arc.map((i) => P(i));
    const cum = [0];
    for (let k = 1; k < pts2.length; k++) cum.push(cum[k - 1] + Math.hypot(pts2[k][0] - pts2[k - 1][0], pts2[k][1] - pts2[k - 1][1]));
    const Lq = cum[cum.length - 1], a = 1.75 * pxPerM, b = Lq - 1.75 * pxPerM;
    const seg = pts2.filter((q, k) => cum[k] >= a && cum[k] <= b);
    if (seg.length > 1) {
      const d = seg.map(([x, y], k) => `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join(' ');
      g += `<path d="${d}" fill="none" stroke="#0E3A52" stroke-width="${r1(BW * 1.5)}" opacity=".22" stroke-linecap="round"/>`;
      g += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${BW}" stroke-linecap="butt"/>`;
      g += `<path d="${d}" fill="none" stroke="#F0238C" stroke-width="${BW}" stroke-dasharray="${U} ${U}" stroke-linecap="butt"/>`;
      g += `<path d="${d}" fill="none" stroke="#1475D9" stroke-width="${BW}" stroke-dasharray="${U} ${U}" stroke-dashoffset="${U}" stroke-linecap="butt"/>`;
    }
    // 尖上的锥
    for (const k of [0, pts2.length - 1]) {
      const [x, y] = pts2[k];
      g += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.42 * pxPerM)}" fill="#F4701E" stroke="#0E3A52" stroke-width="1.2"/>`;
    }
  }
}
// 分流牌脚印
const signP = P(PROPS.find((p) => p.id === 5).i);
// 落地牌的俯视脚印：沿 z 2.6 m 宽、沿 x 0.6 m 深
const SW = SIGN.w * pxPerM, SD = 0.72 * pxPerM;
g += `<rect x="${r1(signP[0] - SW / 2)}" y="${r1(signP[1] - SD / 2)}" width="${r1(SW)}" height="${r1(SD)}" rx="${r1(1.2 * pxPerM)}" fill="#0E3A52"/>`;

// 标注（避让）
const items = [];
for (const p of PROPS) {
  const [u, v] = P(p.i);
  items.push({ kind: 'tag', id: p.id, ax: u, ay: v, bx: u + p.off[0] * pxPerM, by: v + p.off[1] * pxPerM, w: 54, h: 40 });
}
for (const d of DIMS) {
  const [au, av] = P(d.ai), [bu, bv] = P(d.bi);
  const ang = Math.atan2(bv - av, bu - au) * 180 / Math.PI;
  const tick = (x, y, a) => `<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x + Math.cos((a + 90) * Math.PI / 180) * 18)}" y2="${r1(y + Math.sin((a + 90) * Math.PI / 180) * 18)}"/><line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x + Math.cos((a - 90) * Math.PI / 180) * 18)}" y2="${r1(y + Math.sin((a - 90) * Math.PI / 180) * 18)}"/>`;
  g += `<g stroke="#B85400" stroke-width="3" fill="none"><line x1="${r1(au)}" y1="${r1(av)}" x2="${r1(bu)}" y2="${r1(bv)}"/>${tick(au, av, ang)}${tick(bu, bv, ang)}</g>`;
  const mx = (au + bu) / 2, my = (av + bv) / 2;
  items.push({ kind: 'dim', text: d.label, ax: mx, ay: my, bx: mx + d.off[0] * pxPerM, by: my + d.off[1] * pxPerM, w: tw(d.label, 26) + 24, h: 36, color: '#B85400' });
}
{
  const [u, v] = P(tipI);
  items.push({ kind: 'dim', text: '岔口 x = 2.2', ax: u, ay: v, bx: u - 15 * pxPerM, by: v - 10 * pxPerM, w: tw('岔口 x = 2.2', 26) + 24, h: 36, color: '#B85400' });
}
const placed = [];
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const steps = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [0, 2], [-2, 0], [2, 0], [-2, -1], [2, 1], [0, -3], [0, 3], [-3, 0], [3, 0]];
for (const it of items) {
  let best = null;
  for (const k of [1, 1.6, 2.4, 3.2]) {
    for (const [dx, dy] of steps) {
      const x = it.bx + dx * k * 64, y = it.by + dy * k * 44;
      const box = { x: x - it.w / 2 - 3, y: y - it.h / 2 - 3, w: it.w + 6, h: it.h + 6 };
      if (box.x < 6 || box.y < 6 || box.x + box.w > CW - 6 || box.y + box.h > CH - 6) continue;
      if (!placed.some((q) => hit(box, q))) { best = { x, y, box }; break; }
    }
    if (best) break;
  }
  if (!best) best = { x: it.bx, y: it.by, box: { x: it.bx - it.w / 2, y: it.by - it.h / 2, w: it.w, h: it.h } };
  placed.push(best.box);
  it.px = best.x; it.py = best.y;
}
for (const it of items) {
  if (Math.hypot(it.px - it.ax, it.py - it.ay) > 6) {
    g += `<line x1="${r1(it.ax)}" y1="${r1(it.ay)}" x2="${r1(it.px)}" y2="${r1(it.py)}" stroke="${it.kind === 'tag' ? '#0E3A52' : it.color}" stroke-width="2.2" stroke-dasharray="8 6"/>`;
    g += `<circle cx="${r1(it.ax)}" cy="${r1(it.ay)}" r="4.5" fill="${it.kind === 'tag' ? '#0E3A52' : it.color}"/>`;
  }
  if (it.kind === 'tag') {
    g += `<g><rect x="${r1(it.px - 26)}" y="${r1(it.py - 19)}" width="52" height="38" rx="10" fill="#FFFFFF" stroke="#0E3A52" stroke-width="3.2"/><text x="${r1(it.px)}" y="${r1(it.py + 9)}" text-anchor="middle" font-size="26" font-weight="800" fill="#0E3A52">${it.id}</text></g>`;
  } else {
    g += `<g><rect x="${r1(it.px - it.w / 2)}" y="${r1(it.py - 17)}" width="${r1(it.w)}" height="34" rx="17" fill="#FFFFFF" fill-opacity=".93" stroke="${it.color}" stroke-width="2"/><text x="${r1(it.px)}" y="${r1(it.py + 8)}" text-anchor="middle" font-size="26" font-weight="800" fill="${it.color}">${it.text}</text></g>`;
  }
}
// 螃蟹取样点
for (const c of crabPts) {
  const [fu, fv] = P(c.f), [mu, mv] = P(c.m);
  g += `<circle cx="${r1(fu)}" cy="${r1(fv)}" r="10" fill="#F0238C" stroke="#fff" stroke-width="3"/>`;
  g += `<circle cx="${r1(mu)}" cy="${r1(mv)}" r="10" fill="#1475D9" stroke="#fff" stroke-width="3"/>`;
  g += `<text x="${r1(mu + 16)}" y="${r1(mv - 12)}" font-size="23" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="5">${c.t}s</text>`;
}
// 指北针 → 上=东 / 右=南
g += `<g transform="translate(${CW - 132} 104)">
  <text text-anchor="middle" font-size="26" font-weight="800" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="6">上 = 东</text>
  <path d="M0 42 L0 -34 M-13 -18 L0 -38 L13 -18" stroke="#0E3A52" stroke-width="4.4" fill="none"/>
  <text x="52" y="6" text-anchor="start" font-size="22" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="5">右 = 南</text>
  <path d="M0 4 L44 4 M28 -6 L46 4 L28 14" stroke="#0E3A52" stroke-width="3.4" fill="none"/>
</g>`;
// 比例尺（图内左下角，5 × 10 m）
{
  const a = P(barA), b = P(barB), c = P(barC);
  const yBar = Math.max(b[1], c[1]) + 26;
  g += `<g transform="translate(44 ${r1(CH - 96)})">`;
  for (let k = 0; k < 5; k++) {
    const w = (Math.abs(b[0] - a[0]) || 20);
    g += `<rect x="${r1(k * w)}" y="-12" width="${r1(w)}" height="12" fill="${k % 2 ? '#FFFFFF' : '#0E3A52'}" stroke="#0E3A52" stroke-width="1.6"/>`;
  }
  g += `<text x="0" y="-24" text-anchor="start" font-size="25" font-weight="700" fill="#0E3A52" paint-order="stroke" stroke="#fff" stroke-width="6">0 · 每格 10 m · 共 50 m</text></g>`;
  void yBar;
}

const b64 = fs.readFileSync(path.join(OUT, '_crop.png')).toString('base64');
const rows = PROPS.map((p) => ({ ...p, x2: +p.x.toFixed(2), z2: +p.z.toFixed(2) }));
const csv = ['"编号","名称","x（东+，图面上）","z（南+，图面右）","尺寸/说明","源码位置"']
  .concat(rows.map((p) => `${p.id},${p.name},${p.x2},${p.z2},"${p.size}",${p.src}`))
  .join('\n');
fs.writeFileSync(path.join(OUT, `坐标表${SUFFIX}.csv`), '\ufeff' + csv, 'utf8');
const legend = rows.map((p) => `<tr><td class="id">${p.id}</td><td class="nm">${p.name}</td><td class="xy">${p.x2}, ${p.z2}</td><td class="sz">${p.size}</td><td class="src">${p.src}</td></tr>`).join('');

const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>分流副本 · 平面图 v3</title>
<style>
 body{margin:0;background:#E9EDF1;font-family:'Microsoft YaHei',sans-serif;color:#0E3A52}
 .wrap{width:${CW}px;margin:0 auto;background:#fff}
 .map{position:relative;width:${CW}px;height:${CH}px}
 .map img{position:absolute;inset:0;width:${CW}px;height:${CH}px}
 .bar{display:flex;gap:24px;align-items:center;padding:16px 24px;background:#0E3A52;color:#fff;font-size:20px;flex-wrap:wrap}
 .bar b{font-size:24px}
 .k{display:inline-flex;align-items:center;gap:8px}.sw{width:48px;height:8px;border-radius:4px;display:inline-block}
 table{width:100%;border-collapse:collapse;font-size:20px}
 th,td{padding:9px 12px;border-bottom:1px solid #D8E0E7;text-align:left}
 th{background:#F2F6F9;font-size:19px}
 td.id{width:56px;font-weight:800;color:#1475D9}
 td.xy{width:150px;font-family:Consolas,monospace}
 td.src{width:240px;color:#5B6672;font-family:Consolas,monospace;font-size:17px}
 h2{font-size:24px;margin:20px 24px 4px}
 p.note{margin:4px 24px 16px;font-size:18px;color:#41525F;line-height:1.6}
</style>
<div class="wrap">
 <div class="bar"><b>分流副本 · 平面图（上 = 东 / 右 = 南）</b>
  <span class="k"><span class="sw" style="background:#F0238C"></span>半马支路 / 母蟹车道</span>
  <span class="k"><span class="sw" style="background:#1475D9"></span>公蟹车道</span>
  <span class="k"><span class="sw" style="background:#5B6672"></span>湖滨大道</span>
  <span class="k"><span class="sw" style="background:#E9B420"></span>双黄线</span>
  <span class="k"><span class="sw" style="background:#FFFFFF;border:1px solid #0E3A52"></span>注水马</span>
  <span class="k"><span class="sw" style="background:#F4701E"></span>反光锥</span>
  <span class="k"><span class="sw" style="background:#7CB95A"></span>导流岛</span>
  <span>单位 米 · 网格 5 / 10 / 50 m</span>
 </div>
 <div class="map"><img src="data:image/png;base64,${b64}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" style="position:absolute;inset:0">${g}</svg></div>
 <h2>坐标表（+x = 东（图面上）/ +z = 南（图面右）/ 原点 = 岔口 x=2.2, z=0）</h2>
 <p class="note">导流岛三点 = 客户给的（横0竖0）(横0竖10)(横−10竖5)；三边中点朝重心内凹 30% → 三尖头。三条腿的注水马（0–50 m）+ 反光锥（50–100 m）都是临时加装，下方就是普通双向车道的双黄线。</p>
 <table><thead><tr><th>#</th><th>名称</th><th>x, z（米）</th><th>尺寸 / 说明</th><th>源码位置</th></tr></thead><tbody>${legend}</tbody></table>
 <div style="height:24px"></div>
</div></html>`;
fs.writeFileSync(path.join(ROOT, 'dist', `分流副本-平面图${SUFFIX}.html`), html, 'utf8');

const b3 = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
const p3 = await b3.newPage();
await p3.setViewport({ width: CW, height: 900, deviceScaleFactor: 1 });
await p3.goto('file:///' + path.join(ROOT, 'dist', `分流副本-平面图${SUFFIX}.html`).replace(/\\/g, '/'), { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await p3.screenshot({ path: path.join(OUT, `分流副本-平面图${SUFFIX}.png`), fullPage: true });
const dims = await p3.evaluate(() => [document.body.scrollWidth, document.body.scrollHeight]);
await b3.close();
fs.rmSync(path.join(OUT, '_crop.png'), { force: true });
fs.rmSync(path.join(OUT, '_raw.png'), { force: true });

console.log(`平面图 ${CW}×${CH}（页面 ${dims[0]}×${dims[1]}）· 每米 ${pxPerM.toFixed(1)} px`);
console.log(`→ refs/分流副本/平面图/分流副本-平面图${SUFFIX}.png`);
console.log(`→ dist/分流副本-平面图${SUFFIX}.html`);
console.log(`→ refs/分流副本/平面图/坐标表${SUFFIX}.csv（${rows.length} 项）`);
for (const p of rows) console.log(`  ${String(p.id).padStart(2)}  ${p.name.padEnd(14, '　')} x=${String(p.x2).padStart(8)}  z=${String(p.z2).padStart(8)}`);
