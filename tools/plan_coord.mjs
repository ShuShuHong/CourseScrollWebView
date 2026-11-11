// 平面图（矢量）：图元 + 10 m 网格 + 坐标轴 + 编号 + 坐标表
//   node tools/plan_coord.mjs           # 出两张 SVG
//   node tools/plan_png.mjs             # 栅格化成 PNG
// 坐标口径：+x = 东（图面右）、+z = 南（图面下），单位米。
import fs from 'node:fs';
import path from 'node:path';
import { bendPath, subPath } from '../src/config/bend.js';
import { V } from '../src/config/venue.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/plan');
fs.mkdirSync(OUT, { recursive: true });
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'out/review/v10/geo.json'), 'utf8'));

const C = {
  paper: '#FCFBF7', city: '#E7E4DB', plaza: '#F0EEE7', park: '#D9E9CF', pond: '#C6E1F3',
  lot: '#D4D8DD', lotLine: '#F5F6F8', walk: '#E9E1D0', road: '#CFD2D7', edge: '#AEB3BA',
  junc: '#CFD2D7', zoneA: '#ED1C24', zoneB: '#019EDB', zoneC: '#019EDB',
  stage: '#3B6FD4', tent: '#F6B24B', sec: '#FFD24A', water: '#019EDB',
  bldg: '#CBC8BF', bldgEdge: '#A8A59C',
  grid: '#E6E9ED', grid5: '#CBD3DB', axis: '#C8382B', ink: '#1B2430', dim: '#5A6472', faint: '#93A0AE',
};
const FONT = "'Microsoft YaHei','Segoe UI',sans-serif";
const off = (pts, d) => pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  return [p[0] + (-dz / L) * d, p[1] + (dx / L) * d];
});

const ITEMS = [
  ['起跑门头', V.arch.x, 0, `x ${V.arch.x} · z 0`],
  ['A 区', (V.zones[0].x0 + V.zones[0].x1) / 2, (V.zones[0].z0 + V.zones[0].z1) / 2, `x ${V.zones[0].x0}…${V.zones[0].x1}`],
  ['B 区', (V.zones[1].x0 + V.zones[1].x1) / 2, (V.zones[1].z0 + V.zones[1].z1) / 2, `x ${V.zones[1].x0}…${V.zones[1].x1}`],
  ['C 区集结带', -100, 22, `arc 0…${V.zoneC.arc1} · 半宽 ${V.zoneC.halfW}`],
  ['西边界弧中点 (5)', G.mid[0], G.mid[1], `( ${G.mid[0]} , ${G.mid[1]} )`],
  ['Q 并入点 (6)', G.J1[0], G.J1[1], `( ${G.J1[0].toFixed(2)} , ${G.J1[1].toFixed(2)} )`],
  ['P2 东侧接点 (7)', G.J2[0], G.J2[1], `( ${G.J2[0].toFixed(2)} , ${G.J2[1].toFixed(2)} )`],
  ['A 支路口西角 (8)', G.nw[0], G.nw[1], `( ${G.nw[0]} , ${G.nw[1]} )`],
  ['B 支路口东角 (9)', G.east[0], G.east[1], `( ${G.east[0]} , ${G.east[1]} )`],
  ['主舞台', V.stage.x, V.stage.z, `${V.stage.w}×${V.stage.d} m`],
  ['演员候场', V.actor.x, V.actor.z, `${V.actor.w}×${V.actor.d} m`],
  ['观众观摩区', (V.viewer.x0 + V.viewer.x1) / 2, (V.viewer.z0 + V.viewer.z1) / 2, ''],
  ['赛后饮水站', V.water.x, V.water.z, `${V.water.w}×${V.water.d} m`],
  ['安保车辆区', (V.security.x0 + V.security.x1) / 2, (V.security.z0 + V.security.z1) / 2, `x ${V.security.x0}…${V.security.x1}`],
  ['北停车场', (V.urban.lots[0].x0 + V.urban.lots[0].x1) / 2, (V.urban.lots[0].z0 + V.urban.lots[0].z1) / 2, `${V.urban.lots[0].bays} 车位`],
  ['西停车场', (V.urban.lots[1].x0 + V.urban.lots[1].x1) / 2, (V.urban.lots[1].z0 + V.urban.lots[1].z1) / 2, `${V.urban.lots[1].bays} 车位`],
  ['居民楼列', -60, V.urban.towerZ, `z = ${V.urban.towerZ}`],
  ['临街商铺列', -60, V.urban.shopZ, `z = ${V.urban.shopZ}`],
  ['WC', V.wc.x, V.wc.z, ''],
  ['存衣车', (V.storage.x0 + V.storage.x1) / 2, V.storage.z, ''],
];

function sheet({ x0, x1, z0, z1, scale, title, sub }) {
  const pad = { l: 84, t: 76, r: 44, b: 372 };
  const W = Math.round((x1 - x0) * scale), H = Math.round((z1 - z0) * scale);
  const SW = W + pad.l + pad.r, SH = H + pad.t + pad.b;
  const X = (x) => pad.l + (x - x0) * scale;
  const Y = (z) => pad.t + (z - z0) * scale;
  const g = [];
  const P = (pts) => pts.map((q) => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(' L');
  const poly = (pts, fill, extra = '') => g.push(`<path d="M${P(pts)} Z" fill="${fill}" ${extra}/>`);
  const line = (pts, stroke, w, extra = '') => g.push(`<path d="M${P(pts)}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`);
  const rect = (a, b, c, d, fill, extra = '') => g.push(`<rect x="${X(a).toFixed(1)}" y="${Y(c).toFixed(1)}" width="${((b - a) * scale).toFixed(1)}" height="${((d - c) * scale).toFixed(1)}" fill="${fill}" ${extra}/>`);
  const txt = (x, y, s, o = {}) => g.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 13}" fill="${o.fill || C.ink}" font-family="${FONT}" font-weight="${o.w || 400}" text-anchor="${o.anchor || 'start'}" ${o.rot ? `transform="rotate(${o.rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${s}</text>`);
  return { g, poly, line, rect, txt, X, Y, pad, W, H, SW, SH, x0, x1, z0, z1, scale, title, sub };
}

function drawGrid(s) {
  for (let x = Math.ceil(s.x0 / 10) * 10; x <= s.x1; x += 10) {
    const m = x % 50 === 0;
    s.g.push(`<line x1="${s.X(x)}" y1="${s.Y(s.z0)}" x2="${s.X(x)}" y2="${s.Y(s.z1)}" stroke="${m ? C.grid5 : C.grid}" stroke-width="${m ? 1.2 : 0.75}"/>`);
  }
  for (let z = Math.ceil(s.z0 / 10) * 10; z <= s.z1; z += 10) {
    const m = z % 50 === 0;
    s.g.push(`<line x1="${s.X(s.x0)}" y1="${s.Y(z)}" x2="${s.X(s.x1)}" y2="${s.Y(z)}" stroke="${m ? C.grid5 : C.grid}" stroke-width="${m ? 1.2 : 0.75}"/>`);
  }
  const step = s.scale >= 20 ? 10 : 20;
  for (let x = Math.ceil(s.x0 / step) * step; x <= s.x1; x += step) {
    s.txt(s.X(x), s.pad.t - 14, String(x), { size: 12, fill: C.dim, anchor: 'middle' });
    s.txt(s.X(x), s.SH - s.pad.b + 24, String(x), { size: 11, fill: C.faint, anchor: 'middle' });
  }
  for (let z = Math.ceil(s.z0 / step) * step; z <= s.z1; z += step) {
    s.txt(s.pad.l - 12, s.Y(z) + 4, String(z), { size: 12.5, fill: C.dim, anchor: 'end' });
    s.txt(s.pad.l + s.W + 10, s.Y(z) + 4, String(z), { size: 12, fill: C.faint });
  }
}

function drawAxes(s) {
  const arrow = (x1, y1, x2, y2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), L = 12;
    s.g.push(`<path d="M${x1},${y1} L${x2},${y2}" stroke="${C.axis}" stroke-width="2.4"/>`);
    s.g.push(`<path d="M${x2},${y2} L${(x2 - L * Math.cos(a - 0.4)).toFixed(1)},${(y2 - L * Math.sin(a - 0.4)).toFixed(1)} L${(x2 - L * Math.cos(a + 0.4)).toFixed(1)},${(y2 - L * Math.sin(a + 0.4)).toFixed(1)} Z" fill="${C.axis}"/>`);
  };
  // x 轴放在 z 轴负侧留白处；z 轴放在 x 轴右侧留白处
  const yA = s.Y(Math.max(s.z0 + 8, Math.min(s.z1, -78)));
  arrow(s.X(s.x0 + 3), yA, s.X(s.x1 - 8), yA);
  s.txt(s.X(s.x1 - 12), yA - 12, 'x → 东', { size: 15, fill: C.axis, w: 700, anchor: 'end' });
  const xA = s.X(Math.min(s.x1 - 18, -84));
  s.txt(xA + 12, s.Y(s.z1 - 10), 'z ↓ 南', { size: 15, fill: C.axis, w: 700 });
  arrow(xA, s.Y(s.z0 + 3), xA, s.Y(s.z1 - 8));
}

function drawSite(s) {
  s.rect(V.city.x0, V.city.x1, V.city.z0, V.city.z1, C.city);
  s.rect(V.plaza.x0, V.plaza.x1, V.plaza.z0, V.plaza.z1, C.plaza);
  s.rect(V.park.x0, V.park.x1, V.park.z0, V.park.z1, C.park);
  s.poly(V.pond, C.pond);
  // 停车场
  for (const L of V.urban.lots) {
    s.rect(L.x0, L.x1, L.z0, L.z1, C.lot);
    const bw = (L.x1 - L.x0 - 4) / L.bays;
    for (let i = 0; i <= L.bays; i++) {
      const x = L.x0 + 2 + i * bw;
      s.g.push(`<line x1="${s.X(x)}" y1="${s.Y(L.z0 + 2.2)}" x2="${s.X(x)}" y2="${s.Y(L.z1 - 2.2)}" stroke="${C.lotLine}" stroke-width="0.9"/>`);
    }
  }
  // 建筑
  for (const b of V.urban.towers) s.rect(b.x - b.w / 2, b.x + b.w / 2, V.urban.towerZ - b.d / 2, V.urban.towerZ + b.d / 2, C.bldg, `stroke="${C.bldgEdge}" stroke-width="1"`);
  for (const sh of V.urban.shops) s.rect(sh.x - sh.w / 2, sh.x + sh.w / 2, V.urban.shopZ - 4.5, V.urban.shopZ + 4.5, C.bldg, `stroke="${C.bldgEdge}" stroke-width="1"`);
  // 车道 / 人行道
  const p = bendPath(V);
  s.poly([...off(p, -V.road.halfW - V.walk.w), ...off(p, V.road.halfW + V.walk.w).reverse()], C.walk);
  s.poly([...off(p, -V.road.halfW), ...off(p, V.road.halfW).reverse()], C.road, `stroke="${C.edge}" stroke-width="1.1"`);
  // 分区涂装
  for (const z of V.zones) s.rect(z.x0, z.x1, z.z0, z.z1, z.color, `fill-opacity="0.26" stroke="${z.color}" stroke-opacity="0.8" stroke-width="1.4"`);
  // C 区集结带
  const cp = subPath(V.zoneC.arc0, V.zoneC.arc1, 2, V);
  s.poly([...off(cp, -V.zoneC.halfW), ...off(cp, V.zoneC.halfW).reverse()], C.zoneC, 'fill-opacity="0.26" stroke="#0188BC" stroke-opacity="0.5" stroke-width="1"');
  // 帐篷 / 功能块
  for (const t of V.tents) s.rect(t.x0, t.x1, V.tentStrip.z0, V.tentStrip.z1, C.tent, 'fill-opacity="0.55" stroke="#D79A2E" stroke-width="1"');
  s.rect(V.security.x0, V.security.x1, V.security.z0, V.security.z1, C.sec, 'fill-opacity="0.62" stroke="#C99F00" stroke-width="1.1"');
  s.rect(V.stage.x - V.stage.w / 2, V.stage.x + V.stage.w / 2, V.stage.z - V.stage.d / 2, V.stage.z + V.stage.d / 2, C.stage, 'fill-opacity="0.48" stroke="#2A55A8" stroke-width="1.3"');
  s.rect(V.actor.x - V.actor.w / 2, V.actor.x + V.actor.w / 2, V.actor.z - V.actor.d / 2, V.actor.z + V.actor.d / 2, C.tent, 'fill-opacity="0.3" stroke="#D79A2E" stroke-dasharray="6 3"');
  s.rect(V.viewer.x0, V.viewer.x1, V.viewer.z0, V.viewer.z1, '#8E96A4', 'fill-opacity="0.3" stroke="#6C7484" stroke-dasharray="6 3"');
  s.rect(V.water.x - V.water.w / 2, V.water.x + V.water.w / 2, V.water.z - V.water.d / 2, V.water.z + V.water.d / 2, C.water, 'fill-opacity="0.5"');
  s.rect(V.wc.x - 4, V.wc.x + 4, V.wc.z - 3, V.wc.z + 3, '#B8C2CE', 'stroke="#8E99A6" stroke-width="1"');
  s.rect(V.storage.x0, V.storage.x1, V.storage.z - 3, V.storage.z + 3, '#DDE2E8', 'stroke="#B4BCC6" stroke-dasharray="5 3"');
  s.rect(V.sponsor.x0, V.sponsor.x1, V.sponsor.z - 1.3, V.sponsor.z + 1.3, '#C8102E', 'fill-opacity="0.6"');
  // 三岔口铺装（精确多边形）
  s.poly(G.poly, C.junc, `stroke="${C.edge}" stroke-width="1.2"`);
  // 顶点标注（只在小比例那张图里放）
  if (s.scale >= 20) {
    const marks = [
      ['A · 8', G.nw, [-10, -10]], ['B · 9', G.east, [10, -10]],
      ['5', G.mid, [12, 2]], ['Q · 6', G.J1, [12, 10]], ['P2 · 7', G.J2, [12, 16]],
    ];
    for (const [nm, pt, [dx, dy]] of marks) {
      const cx = s.X(pt[0]), cy = s.Y(pt[1]);
      s.g.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="#FFFFFF" stroke="${C.axis}" stroke-width="2"/>`);
      s.txt(cx + dx, cy + dy, nm, { size: 16, w: 700, fill: C.axis, anchor: dx < 0 ? 'end' : 'start' });
      s.txt(cx + dx, cy + dy + 16, `(${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})`, { size: 11, fill: C.dim, anchor: dx < 0 ? 'end' : 'start' });
    }
  }
}

function drawNumbers(s) {
  ITEMS.forEach(([, x, z], i) => {
    const cx = s.X(x), cy = s.Y(z);
    if (cx < s.pad.l + 8 || cx > s.pad.l + s.W - 8 || cy < s.pad.t + 8 || cy > s.pad.t + s.H - 8) return;
    s.g.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="#FFFFFF" fill-opacity="0.94" stroke="${C.ink}" stroke-width="1.7"/>`);
    s.txt(cx, cy + 4.6, String(i + 1), { size: 12.5, w: 700, anchor: 'middle' });
  });
}

function drawFooter(s) {
  const y0 = s.pad.t + s.H + 30;
  s.g.push(`<line x1="${s.pad.l}" y1="${y0 - 14}" x2="${s.pad.l + s.W}" y2="${y0 - 14}" stroke="${C.grid5}" stroke-width="1.2"/>`);
  // 标题
  s.txt(s.pad.l, y0 + 8, s.title, { size: 24, w: 700 });
  s.txt(s.pad.l, y0 + 32, s.sub, { size: 13.5, fill: C.dim });
  const info = [
    '+x = 东（图面右）', '+z = 南（图面下）', '单位 = 米；细网格 10 m，粗线 50 m',
    '原点 (0,0) = 直路中心线 × 起跑门头', '三维场景与这张图共用同一套世界坐标',
  ];
  info.forEach((t, i) => s.txt(s.pad.l + 470 + (i % 2) * 300, y0 - 6 + Math.floor(i / 2) * 20, t, { size: 12.5, fill: C.dim }));

  // 图例：3 列
  const keys = [
    ['车行道', C.road, 1], ['三岔口铺装', C.junc, 1], ['人行道', C.walk, 1],
    ['C 区集结带', C.zoneC, 0.3], ['A 区', C.zoneA, 0.3], ['B 区', C.zoneB, 0.3],
    ['主舞台', C.stage, 0.5], ['帐篷/功能区', C.tent, 0.55], ['安保车区', C.sec, 0.65],
    ['停车场', C.lot, 1], ['建筑', C.bldg, 1], ['绿地/水面', C.park, 1],
  ];
  const ly = y0 + 64;
  s.txt(s.pad.l, ly, '图例', { size: 14, w: 700 });
  keys.forEach(([n, col, op], i) => {
    const kx = s.pad.l + (i % 3) * 170, ky = ly + 24 + Math.floor(i / 3) * 22;
    s.g.push(`<rect x="${kx}" y="${ky - 11}" width="22" height="14" fill="${col}" fill-opacity="${op}" stroke="#AEB4BC" stroke-width="0.9"/>`);
    s.txt(kx + 29, ky + 1, n, { size: 12.5 });
  });

  // 坐标表：两列
  const tx = s.pad.l + 560;
  s.txt(tx, ly, '编号 / 坐标', { size: 14, w: 700 });
  const half = Math.ceil(ITEMS.length / 2);
  ITEMS.forEach(([name, , , note], i) => {
    const col = Math.floor(i / half), row = i % half;
    const bx = tx + col * 400, by = ly + 24 + row * 19;
    s.g.push(`<circle cx="${bx + 9}" cy="${by - 4.5}" r="9" fill="#FFFFFF" stroke="${C.ink}" stroke-width="1.4"/>`);
    s.txt(bx + 9, by - 0.6, String(i + 1), { size: 10.5, w: 700, anchor: 'middle' });
    s.txt(bx + 26, by, name, { size: 12.5 });
    if (note) s.txt(bx + 168, by, note, { size: 11, fill: C.dim });
  });
}

function compass(s) {
  const cx = s.pad.l + 46, cy = s.pad.t + 52;
  s.g.push(`<circle cx="${cx}" cy="${cy}" r="27" fill="#FFFFFF" fill-opacity="0.92" stroke="${C.ink}" stroke-width="1.4"/>`);
  s.g.push(`<path d="M${cx},${cy - 22} L${cx - 9},${cy + 8} L${cx},${cy + 1} L${cx + 9},${cy + 8} Z" fill="${C.ink}"/>`);
  s.txt(cx, cy - 30, '北', { size: 13, w: 700, anchor: 'middle' });
  // 比例尺
  const sx = s.pad.l + s.W - 260, sy = s.pad.t + s.H - 34;
  s.g.push(`<rect x="${sx}" y="${sy}" width="${25 * s.scale}" height="8" fill="${C.ink}"/>`);
  s.g.push(`<rect x="${sx + 25 * s.scale}" y="${sy}" width="${25 * s.scale}" height="8" fill="#FFFFFF" stroke="${C.ink}" stroke-width="1"/>`);
  for (const [dx, lab] of [[0, '0'], [25, '25'], [50, '50 m']]) s.txt(sx + dx * s.scale, sy - 6, lab, { size: 11.5, fill: C.dim, anchor: dx === 0 ? 'start' : 'middle' });
}

function build(opt) {
  const s = sheet(opt);
  const gid = 'clip' + Math.random().toString(36).slice(2, 8);
  s.g.push(`<defs><clipPath id="${gid}"><rect x="${s.pad.l}" y="${s.pad.t}" width="${s.W}" height="${s.H}"/></clipPath></defs>`);
  s.g.push(`<rect x="0" y="0" width="${s.SW}" height="${s.SH}" fill="#FFFFFF"/>`);
  s.g.push(`<rect x="${s.pad.l}" y="${s.pad.t}" width="${s.W}" height="${s.H}" fill="${C.paper}"/>`);
  s.g.push(`<g clip-path="url(#${gid})">`);
  drawSite(s);
  s.g.push('</g>');
  drawGrid(s);
  drawAxes(s);
  drawNumbers(s);
  drawFooter(s);
  compass(s);
  s.g.push(`<rect x="${s.pad.l}" y="${s.pad.t}" width="${s.W}" height="${s.H}" fill="none" stroke="${C.grid5}" stroke-width="1.4"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.SW}" height="${s.SH}" viewBox="0 0 ${s.SW} ${s.SH}">${s.g.join('')}</svg>`;
}

const SHEETS = [
  { key: '总图', x0: -180, x1: 140, z0: -100, z1: 100, scale: 7, title: '主会场副本 · 平面图（坐标网格）', sub: 'B 导航地图 · 1 m = 7 px' },
  { key: '岔口', x0: -165, x1: -55, z0: -62, z1: 44, scale: 19, title: '三岔口细部 · 平面图', sub: 'B 导航地图 · 1 m = 19 px' },
];
for (const sh of SHEETS) {
  const svg = build(sh);
  fs.writeFileSync(path.join(OUT, `平面图-${sh.key}.svg`), svg, 'utf8');
  // HTML 放在 dist/（预览服务器根目录），SVG 也复制一份过去，相对路径才对得上
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist', `平面图-${sh.key}.svg`), svg, 'utf8');
  console.log(`  平面图-${sh.key}.svg  ${(svg.length / 1024).toFixed(0)} KB`);
}

// HTML 预览：两张图 + 缩放 + 十字光标读数（鼠标移到哪儿就报那一格的世界坐标）
const html = `<!doctype html><meta charset="utf-8"><title>主会场副本 · 平面图（坐标网格）</title>
<style>
:root{--ink:#12233A}
*{box-sizing:border-box}
body{margin:0;background:#EDF0F4;color:var(--ink);font:14px/1.55 'Microsoft YaHei',system-ui}
header{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:20px;flex-wrap:wrap;
  background:#12233A;color:#DCE7F5;padding:10px 18px;box-shadow:0 2px 10px rgba(10,25,45,.25)}
header b{font-size:15px}
header .hint{font-size:12.5px;color:#8FB3D9}
header label{font-size:12.5px;color:#8FB3D9;display:flex;align-items:center;gap:8px}
#read{font-variant-numeric:tabular-nums;background:#0A1729;border:1px solid #25496F;border-radius:8px;
  padding:5px 12px;color:#8FD0FF;font-size:13px;min-width:230px;text-align:center}
.wrap{padding:18px}
figure{margin:0 0 26px;background:#fff;border-radius:8px;overflow:auto;box-shadow:0 3px 16px rgba(18,40,70,.13)}
figcaption{padding:10px 16px;font-size:13px;color:#4A5563;border-bottom:1px solid #E6EBF1}
.pic{position:relative;line-height:0}
.pic img{display:block;max-width:none;cursor:crosshair}
.cross{position:absolute;pointer-events:none;display:none;width:1px;height:100%;background:rgba(200,56,43,.75);top:0}
.crossh{position:absolute;pointer-events:none;display:none;height:1px;width:100%;background:rgba(200,56,43,.75);left:0}
</style>
<header>
  <b>主会场副本 · 平面图（坐标网格）</b>
  <span class="hint">+x = 东（右） · +z = 南（下） · 单位米</span>
  <span id="read">鼠标移上去读坐标</span>
  <label>缩放 <input id="z" type="range" min="40" max="220" value="100"> <span id="zp">100%</span></label>
</header>
<div class="wrap" id="w"></div>
<script>
const SHEETS=[{f:'平面图-总图.svg',c:'总图 · 320 × 200 m · 1 m = 7 px',x0:-180,z0:-100,ppm:7},
              {f:'平面图-岔口.svg',c:'三岔口细部 · 110 × 106 m · 1 m = 19 px',x0:-165,z0:-62,ppm:19}];
const w=document.getElementById('w'),read=document.getElementById('read'),zr=document.getElementById('z'),zp=document.getElementById('zp');
SHEETS.forEach(S=>{
  const fig=document.createElement('figure');
  fig.innerHTML='<figcaption>'+S.c+'</figcaption><div class="pic"><img src="'+S.f+'">'+
    '<div class="cross"></div><div class="crossh"></div></div>';
  w.appendChild(fig);
  const pic=fig.querySelector('.pic'),im=fig.querySelector('img');
  const cv=fig.querySelector('.cross'),ch=fig.querySelector('.crossh');
  const PAD={l:84,t:76};
  pic.addEventListener('mousemove',e=>{
    const r=im.getBoundingClientRect();
    const k=r.width/im.naturalWidth;
    const px=(e.clientX-r.left)/k, py=(e.clientY-r.top)/k;
    const x=S.x0+(px-PAD.l)/S.ppm, z=S.z0+(py-PAD.t)/S.ppm;
    read.textContent='x = '+x.toFixed(1)+'   z = '+z.toFixed(1)+'   (m)';
    cv.style.display='block';cv.style.left=(px*k)+'px';
    ch.style.display='block';ch.style.top=(py*k)+'px';
  });
  pic.addEventListener('mouseleave',()=>{cv.style.display='none';ch.style.display='none';read.textContent='鼠标移上去读坐标';});
});
zr.oninput=()=>{
  const f=zr.value/100; zp.textContent=zr.value+'%';
  document.querySelectorAll('.pic img').forEach(im=>{ im.style.width=(im.naturalWidth*f)+'px'; });
};
</script>`;
fs.writeFileSync(path.join(ROOT, 'dist/平面图-主会场.html'), html, 'utf8');
console.log('  dist/平面图-主会场.html');
