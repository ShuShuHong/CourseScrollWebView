// 自绘虚构赛道（澜湾马拉松案例）—— 替换原高淳几何
// 输出 data/course.json + data/map_layers.json
// 锚点里程严格对齐 story/voice（桥 8.195-8.732 / 19.13-19.50、折返 19.61 / 29.2、分流 20.973、湿地 40.59）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const M_PER_PT = 3.34;
const KM2PT = 1000 / M_PER_PT;
const STEP = 10; // 10 pt 重采样
const W = 2050, H = 2530;

// 骨架 waypoint（起点=终点），几何上合理的绕湖路径
const WAY = [
  [520, 420],   // W0 起点
  [520, 560],   // W1
  [760, 560],   // W2
  [760, 340],   // W3
  [1100, 340],  // W4
  [1100, 560],  // W5
  [1480, 560],  // W6
  [1480, 660],  // W7
  [820, 660],   // W8 桥北1
  [820, 840],   // W9 桥南1
  [1100, 1000], // W10
  [1500, 1100], // W11
  [1650, 1350], // W12
  [1400, 1600], // W13
  [900, 1650],  // W14
  [820, 840],   // W15 桥南2
  [820, 660],   // W16 桥北2
  [780, 660],   // W17 折返1
  [780, 560],   // W18
  [560, 560],   // W19
  [560, 420],   // W20 split
  [1400, 420],  // W21
  [1700, 700],  // W22
  [1700, 1100], // W23
  [1500, 1500], // W24
  [1100, 1600], // W25
  [1100, 1700], // W26 折返2
  [1600, 1700], // W27
  [1800, 1400], // W28
  [1800, 900],  // W29
  [1500, 600],  // W30
  [900, 600],   // W31
  [520, 500],   // W32 湿地
  [520, 420],   // W33 终点
];

// 超级段：[起 waypoint 索引, 止 waypoint 索引, 目标长度 pt]
const SUPER = [
  [0, 8, 8.195 * KM2PT],
  [8, 9, 0.537 * KM2PT],
  [9, 15, (19.13 - 8.732) * KM2PT],
  [15, 16, 0.37 * KM2PT],
  [16, 17, 0.11 * KM2PT],
  [17, 20, (20.973 - 19.61) * KM2PT],
  [20, 26, (29.2 - 20.973) * KM2PT],
  [26, 32, (40.59 - 29.2) * KM2PT],
  [32, 33, (42.195 - 40.59) * KM2PT],
];

// 按超级段目标长度等比拉伸每一段
function buildWaypoints() {
  const out = [WAY[0].slice()];
  for (const [i0, i1, target] of SUPER) {
    // 计算该超级段子段实际总长
    let segLen = 0;
    const sub = [];
    for (let i = i0; i < i1; i++) {
      const a = WAY[i], b = WAY[i + 1];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      sub.push([a, b, d]);
      segLen += d;
    }
    const s = segLen > 0 ? target / segLen : 1;
    // 从 out 最后一点出发，沿每段方向拉伸
    let cur = out[out.length - 1].slice();
    for (const [a, b] of sub) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;
      cur = [cur[0] + (dx / d) * d * s, cur[1] + (dy / d) * d * s];
      out.push(cur.slice());
    }
  }
  return out;
}

function cumul(wp) {
  const c = [0];
  for (let i = 1; i < wp.length; i++) c.push(c[i - 1] + Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]));
  return c;
}

// 10pt 等距重采样
function resample(wp) {
  const c = cumul(wp);
  const total = c[c.length - 1];
  const n = Math.round(total / STEP) + 1;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const d = k * STEP;
    let i = 0;
    while (i < c.length - 2 && c[i + 1] < d) i++;
    const segLen = c[i + 1] - c[i] || 1;
    const t = (d - c[i]) / segLen;
    pts.push([+(wp[i][0] + (wp[i + 1][0] - wp[i][0]) * t).toFixed(2), +(wp[i][1] + (wp[i + 1][1] - wp[i][1]) * t).toFixed(2)]);
  }
  return pts;
}

function ptAtKm(full, km) {
  const idx = Math.min(full.length - 1, Math.round((km * KM2PT) / STEP));
  return idx;
}
// 某里程对应的图上坐标 [x, y]
function coordAt(full, km) {
  return full[ptAtKm(full, km)];
}

// 城市建筑（仅北岸城区，避开公园绿地与主路）
function cityBuildings() {
  const out = [];
  const parks = [[300, 300, 700, 600], [1400, 300, 1750, 600]];
  const inPark = (x, y) => parks.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
  // 主路留空：y=420(澜兴路), y=660(镜湖南路), x=1100(集贤街), x=480(星湖南路) ±20
  const onRoad = (x, y) => Math.abs(y - 420) < 22 || Math.abs(y - 660) < 22 || Math.abs(x - 1100) < 22 || Math.abs(x - 480) < 22;
  let rng = 1;
  const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (let x = 300; x <= 1750; x += 55) {
    for (let y = 260; y <= 680; y += 55) {
      if (inPark(x, y) || onRoad(x, y)) continue;
      const w = 16 + rnd() * 18, d = 16 + rnd() * 18, h = 14 + rnd() * 36, rot = rnd() * 0.4, ci = Math.floor(rnd() * 4);
      out.push([+x.toFixed(1), +y.toFixed(1), +w.toFixed(1), +d.toFixed(1), +h.toFixed(1), +rot.toFixed(2), ci]);
    }
  }
  return out;
}

// 湖多边形（椭圆 + 轻微扰动）
function lakePoly() {
  const cx = 1120, cy = 1280, rx = 720, ry = 820;
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 1 + 0.04 * Math.sin(a * 5) + 0.02 * Math.cos(a * 3);
    pts.push([+(cx + Math.cos(a) * rx * r).toFixed(1), +(cy + Math.sin(a) * ry * r).toFixed(1)]);
  }
  return pts;
}

// 绿地多边形
function greenPolys() {
  return [
    // 北岸城区绿地（澜渚洲公园及周边）
    [[300, 300], [700, 300], [700, 600], [300, 600]],
    [[1400, 300], [1750, 300], [1750, 600], [1400, 600]],
    // 南岸湿地
    [[300, 1700], [900, 1700], [900, 2100], [300, 2100]],
    [[1500, 1700], [1850, 1700], [1850, 2100], [1500, 2100]],
  ];
}

// 道路（非赛道，纯地图装饰 + 路名标签锚点）
function roads() {
  return [
    { name: '星湖南路', pts: [[480, 300], [480, 700]] },
    { name: '镜湖南路', pts: [[640, 660], [1480, 660]] },
    { name: '澜兴路', pts: [[400, 420], [1700, 420]] },
    { name: '集贤街', pts: [[1100, 300], [1100, 660]] },
    { name: '环湖大道', pts: [[820, 840], [1100, 1000], [1500, 1100], [1650, 1350], [1400, 1600], [900, 1650]] },
    { name: '云澜大桥', pts: [[820, 660], [820, 840]] },
    { name: '科创大道', pts: [[1700, 700], [1800, 1400]] },
    { name: '柳堤南路', pts: [[1100, 1600], [1100, 1700], [1600, 1700]] },
  ];
}

function labels() {
  return [
    { name: '云澜湖', pt: [1120, 1280] },
    { name: '澜渚洲公园', pt: [500, 450] },
    { name: '文渊寺', pt: [380, 300] },
    { name: '澜湾博物馆', pt: [900, 380] },
    { name: '澜湾老街', pt: [1450, 360] },
    { name: '银杏大道', pt: [1650, 500] },
    { name: '云澜大桥', pt: [860, 750] },
    { name: '云澜悦水湾', pt: [1500, 1400] },
    { name: '云澜水岸滨湖公园', pt: [500, 1800] },
    { name: '云澜湖国家城市湿地公园', pt: [520, 2000] },
  ];
}

function landmarks() {
  return [
    { id: 'wenyuan', name: '文渊寺', pt: [380, 300] },
    { id: 'museum', name: '澜湾博物馆', pt: [900, 380] },
    { id: 'oldstreet', name: '澜湾老街', pt: [1450, 360] },
    { id: 'sequoia', name: '银杏大道', pt: [1650, 500] },
    { id: 'bridge', name: '云澜大桥', pt: [820, 750] },
    { id: 'watertown', name: '云澜悦水湾', pt: [1500, 1400] },
    { id: 'lakepark', name: '云澜水岸滨湖公园', pt: [500, 1800] },
    { id: 'wetland', name: '云澜湖国家城市湿地公园', pt: [520, 2000] },
  ];
}

function main() {
  const wp = buildWaypoints();
  const full = resample(wp);
  const totalKm = ((full.length - 1) * STEP * M_PER_PT) / 1000;
  console.log('full pts', full.length, 'total km', totalKm.toFixed(3));

  // 桥 / 折返 / split 锚点（pt = 图上坐标 [x,y]）
  const idx = (km) => ptAtKm(full, km);
  const xy = (km) => coordAt(full, km);
  const bridge = {
    name: '云澜大桥',
    length: 537,
    pass1_km: [8.195, 8.732],
    pass2_km: [19.13, 19.50],
    pass1_pt: [xy(8.195), xy(8.732)],
    pass2_pt: [xy(19.13), xy(19.50)],
  };
  const turnarounds = [
    { name: '镜湖南路折返', kind: 'full', pt: xy(19.61), km: 19.61, t: 0 },
    { name: '全马折返点', kind: 'full', pt: xy(29.2), km: 29.2, t: 0 },
  ];
  const split = {
    pt_km: 20.973,
    pt: xy(20.973),
    pt_at_half: { m: 0.5, f: 1 },
    island: true,
    half_turn_km: 20.9,
    back_to_route_km: 21.0,
    full_turn_km: 29.1,
    back_to_route_km2: 29.3,
  };

  // half：共享段 full[0..splitIdx] + 半马支线终点
  const splitIdx = idx(20.973);
  const splitPt = full[splitIdx];
  const halfEndKm = 21.0975;
  const halfExtraPt = (halfEndKm - split.pt_km) * KM2PT;
  const prev = full[splitIdx - 1] || full[0];
  const dx = splitPt[0] - prev[0], dy = splitPt[1] - prev[1];
  const d = Math.hypot(dx, dy) || 1;
  const halfEnd = [+(splitPt[0] + (dx / d) * halfExtraPt).toFixed(2), +(splitPt[1] + (dy / d) * halfExtraPt).toFixed(2)];
  const half = [...full.slice(0, splitIdx + 1), halfEnd];
  // half_on_full: [[halfKm, fullKm], ...] 共线段映射 + 半马支线终点
  const half_on_full = [];
  for (let k = 0; k <= 21; k++) half_on_full.push([k, k]);
  half_on_full.push([21.0975, 20.973]);

  // km 徽章
  const km_badges = [];
  for (let k = 1; k <= 42; k++) km_badges.push({ km: k, pt: xy(k) });
  km_badges.push({ km: 42.195, pt: xy(42.195) });
  const half_badges = [];
  for (let k = 1; k <= 21; k++) half_badges.push({ km: k, pt: xy(k) });
  half_badges.push({ km: 21.0975, pt: halfEnd });

  // POI
  // POI（按 id 索引的对象，engine 用 COURSE.pois[id].pt 取位）
  const pois = {
    wenyuan: { name: '文渊寺', route: 'both', full: 0.5, half: 0.5, pt: xy(0.5) },
    baosheng_temple: { name: '文渊寺塔', route: 'both', full: 0.5, half: 0.5, pt: xy(0.5) },
    museum: { name: '澜湾博物馆', route: 'both', full: 2.73, half: 2.73, pt: xy(2.73) },
    old_street: { name: '澜湾老街', route: 'both', full: 6.38, half: 6.38, pt: xy(6.38) },
    bridge: { name: '云澜大桥', route: 'both', full: 8.27, half: 8.27, pt: xy(8.27) },
    sequoia: { name: '银杏大道', route: 'both', full: 11.9, half: 11.9, pt: xy(11.9) },
    water_town: { name: '云澜湖悦水湾', route: 'both', full: 15.65, half: 15.55, pt: xy(15.65) },
    lakepark: { name: '云澜水岸滨湖公园', route: 'both', full: 17.0, half: 17.0, pt: xy(17.0) },
    wetland: { name: '云澜湖国家城市湿地公园', route: 'both', full: 40.59, half: 21.0975, pt: xy(40.59) },
  };

  // 站点（服务类型仅限 STATION_TYPES：timing/medical/drink/water/sponge/food/wc）
  const stationKms = [
    { km: 0, services: ['wc', 'medical'], half: true },
    { km: 1, services: ['water'], half: true },
    { km: 3, services: ['water', 'wc'], half: true },
    { km: 5, services: ['water', 'food', 'wc', 'medical'], half: true },
    { km: 7.5, services: ['water'], half: true },
    { km: 10, services: ['water', 'wc', 'medical'], half: true },
    { km: 12.5, services: ['water', 'food'], half: true },
    { km: 15, services: ['water', 'wc', 'medical'], half: true },
    { km: 17.5, services: ['water'], half: true },
    { km: 20, services: ['water', 'wc', 'food'], half: true },
    { km: 23, services: ['water'], half: false },
    { km: 26, services: ['water', 'wc', 'medical'], half: false },
    { km: 29.2, services: ['water', 'food'], half: false },
    { km: 32, services: ['water', 'wc'], half: false },
    { km: 35, services: ['water', 'medical'], half: false },
    { km: 38, services: ['water', 'food', 'wc'], half: false },
    { km: 40.5, services: ['water', 'medical'], half: false },
  ];
  const stations = stationKms.map((s) => ({ ...s, pt: xy(s.km) }));

  // 海拔（虚构：平坦 + 两次过桥微抬升 + 终点小坡）
  function elevAt(km) {
    let e = 6;
    const onBridge1 = km >= 8.195 && km <= 8.732;
    const onBridge2 = km >= 19.13 && km <= 19.50;
    if (onBridge1) e = 6 + 20 * Math.sin(((km - 8.195) / 0.537) * Math.PI);
    if (onBridge2) e = 6 + 20 * Math.sin(((km - 19.13) / 0.37) * Math.PI);
    if (km > 40) e = 6 + (km - 40) * 4;
    return +e.toFixed(1);
  }
  // elevation.profile = 每公里一个海拔值的纯数字数组（索引 i = km i，0..42）
  const elev = [];
  for (let k = 0; k <= 42; k++) elev.push(elevAt(k));

  const course = {
    meta: {
      source: '2026澜湾马拉松-路线图（虚构案例数据·程序自绘）',
      m_per_pt: M_PER_PT,
      step_km: +(STEP * M_PER_PT / 1000).toFixed(4),
      width_km: 6.85,
      height_km: 8.45,
      keep: { aspect: true, max_w: 2050, max_h: 2530 },
      start_finish: [full[0][0], full[0][1]],
    },
    full,
    full_len_km: 42.195,
    half,
    half_len_km: 21.0975,
    half_on_full,
    split,
    km_badges,
    half_badges,
    stations,
    elevation: { min: 6, max: 26, gain: 61, profile: elev },
    bridge,
    pois,
    turnarounds,
  };
  fs.writeFileSync(path.join(ROOT, 'data/course.json'), JSON.stringify(course));
  console.log('wrote data/course.json', full.length, 'pts');

  const layers = {
    meta: { source: '2026澜湾马拉松-路线图（虚构案例数据·程序自绘）· 第 1 页 · 图层 1', m_per_pt: M_PER_PT, width_km: 6.85, height_km: 8.45 },
    water: [{ pts: lakePoly() }],
    green: greenPolys().map((g) => ({ pts: g })),
    roads: roads().map((r) => ({ name: r.name, pts: r.pts })),
    buildings: cityBuildings(),
    labels: labels().map((l) => ({ ...l })),
    landmarks: landmarks().map((l) => ({ ...l })),
  };
  fs.writeFileSync(path.join(ROOT, 'data/map_layers.json'), JSON.stringify(layers));
  console.log('wrote data/map_layers.json');

  // ── data/world.json：3D 世界装饰层（与新几何对齐）──
  const lake = lakePoly();
  const scalePoly = (poly, s, cx = 1120, cy = 1280) => poly.map(([x, y]) => [+(cx + (x - cx) * s).toFixed(1), +(cy + (y - cy) * s).toFixed(1)]);
  const inPoly = (x, y, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  let rng2 = 7;
  const rnd2 = () => { rng2 = (rng2 * 1103515245 + 12345) & 0x7fffffff; return rng2 / 0x7fffffff; };
  // 树：绿地内撒点
  const trees = [], flowers = [], reeds = [];
  for (const g of greenPolys()) {
    const [x0, y0] = g[0], [x1, y1] = g[2];
    for (let i = 0; i < 80; i++) {
      const x = x0 + rnd2() * (x1 - x0), y = y0 + rnd2() * (y1 - y0);
      trees.push([+x.toFixed(1), +y.toFixed(1), +(0.7 + rnd2() * 0.6).toFixed(2)]);
      if (rnd2() < 0.4) flowers.push([+x.toFixed(1), +y.toFixed(1), Math.floor(rnd2() * 3)]);
    }
  }
  // 芦苇：湖岸内侧一圈
  for (const [x, y] of lake) {
    if (rnd2() < 0.35) reeds.push([+x.toFixed(1), +y.toFixed(1)]);
  }
  // 水杉（银杏大道）：沿科创大道/银杏大道段撒
  const seqRoad = roads().find((r) => r.name === '科创大道')?.pts || [[1700, 700], [1800, 1400]];
  const sequoia = [];
  for (let i = 0; i < seqRoad.length - 1; i++) {
    const [x0, y0] = seqRoad[i], [x1, y1] = seqRoad[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 60);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      sequoia.push([+(x + (rnd2() - 0.5) * 30).toFixed(1), +(y + (rnd2() - 0.5) * 30).toFixed(1), +(0.9 + rnd2() * 0.4).toFixed(2)]);
    }
  }
  const world = {
    meta: { source: '2026澜湾马拉松-虚构案例数据·程序自绘', m_per_pt: M_PER_PT },
    board: [-700, -420, 4300, 3200],
    frame: [-700, -420, 4300, 3200],
    water_outer: [[scalePoly(lake, 1.12), []]],
    water: [[lake, []]],
    water_deep: [[scalePoly(lake, 0.7), []]],
    green: greenPolys().map((g) => [g, []]),
    road_lines: roads().map((r) => ({ w: 6, pts: r.pts })),
    trees,
    sequoia,
    flowers,
    reeds,
    buildings: cityBuildings(),
  };
  fs.writeFileSync(path.join(ROOT, 'data/world.json'), JSON.stringify(world));
  console.log('wrote data/world.json', world.buildings.length, 'buildings');

  // 打印 labels.js 新内容（供 races/lanwan-2026/config/labels.js 使用）
  console.log('\n--- labels.js LABELS ---');
  console.log(JSON.stringify(labels(), null, 2));
}

main();
