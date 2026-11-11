// ════════════════════════════════════════════════════════════════════════
// 虚构案例地图生成器：一次性产出
//   data/course.json                    赛道语义层（全/半马线、桥、分流、POI、公里牌…）
//   data/map_layers.json                底图矢量层（水面/绿地/道路/河流）
//   races/lanwan-2026/config/labels.js  路名标签（pt + 投影 km）
//   _work/map_preview.html              调试预览（水面/绿地/道路/赛道/锚点一张图）
//
// 设计（几何全部程序虚构，仅沿用叙事锚点里程口径）：
//   · 云澜湖 = 西湖湾 + 云澜海峡（大桥）+ 南湖 + 悦水湾 + 葫芦细腰 + 东湾长臂 + 东湾头；
//   · 城区在湖北岸，起终点 SF(1140,790)，出发向北、终点自南北上（沿用旧口径）；
//   · 城区方格网 zigzag 0–6.1km（文渊寺塔 2.36 / 博物馆 2.73 / 老街 6.38）；
//   · 云澜大桥 x≈838/845 双向跨海：8.001–8.539 南向、18.311–18.849 北向；
//   · 南岸环南湖 8.5–18.3km（银杏大道 11.2–12.7、悦水湾花海 12.8–17）；
//   · 19.61 白鹭路折返（全半马共同），20.91 分流：半马左转进终点、全马右转去东湾；
//   · 全马专属：东湾北岸堤顶去程、29.20 东端 180° 折返、原堤回程、科创大道斜穿、
//     40.59 湿地公园（芦苇 40–41）、41.40 回到星湖南路路口、42.195 终点。
//
// 用法：node tools/gen_fictional_course.mjs
//   之后必须再跑：uv run --with numpy --with shapely python tools/build_world.py
// ════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MPP = 3.34302;                 // m / pt（与旧数据 meta.m_per_pt 一致）
const PPK = 1000 / MPP;              // ≈ 299.13 pt / km
const FRAME = [0, 300, 3606, 2551];
const STEP = 0.01;
const FULL_LEN = 42.195, HALF_LEN = 21.0975;
const SF = [1140, 790];

// ═══════════════ 基础几何 ═══════════
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  len: (a) => Math.hypot(a[0], a[1]),
  norm: (a) => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; },
};
const polyLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += V.len(V.sub(pts[i], pts[i - 1])); return L; };
function cumLen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + V.len(V.sub(pts[i], pts[i - 1]))); return c; }
function posAt(pts, cum, km) {
  const s = km * PPK;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}
function resampleEq(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    let segL = Math.hypot(x1 - x0, y1 - y0);
    while (carry + segL >= step && segL > 1e-9) {
      const t = (step - carry) / segL;
      x0 = x0 + (x1 - x0) * t; y0 = y0 + (y1 - y0) * t;
      out.push([x0, y0]); segL = Math.hypot(x1 - x0, y1 - y0); carry = 0;
    }
    carry += segL;
  }
  const last = pts[pts.length - 1];
  if (V.len(V.sub(out[out.length - 1], last)) > 1e-6) out.push(last.slice());
  return out;
}

// ═══════════════  Turtle（里程表式精确布局） ═══════════
// heading 用角度制：0=东 90=南 -90=北 180=西（屏幕坐标 y 向下）
// A(r,deg)：deg>0 右转（视觉顺时针），deg<0 左转
function makeTurtle(start, headingDeg) {
  const T = { p: start.slice(), th: headingDeg * Math.PI / 180, km: 0, pts: [start.slice()], marks: [] };
  const dir = () => [Math.cos(T.th), Math.sin(T.th)];
  const push = (p) => { T.pts.push(p); T.p = p; };
  T.S = (len) => {                       // 直行 len pt
    const d = dir();
    for (let rest = len; rest > 0;) {
      const st = Math.min(0.25, rest);
      push([T.p[0] + d[0] * st, T.p[1] + d[1] * st]);
      rest -= st; T.km += st / PPK;
    }
    return T;
  };
  T.Sto = (km) => { const need = (km - T.km) * PPK; if (need <= 0.5) throw new Error(`Sto(${km}) 已过（当前 ${T.km.toFixed(3)}）`); return T.S(need); };
  T.A = (r, deg) => {                    // 转弯：半径 r、扫 deg°（+右 -左）
    const rad = deg * Math.PI / 180;
    const n0 = [-Math.sin(T.th), Math.cos(T.th)];          // 右法线
    const sgn = Math.sign(deg);
    const C = [T.p[0] + n0[0] * r * sgn, T.p[1] + n0[1] * r * sgn];
    const a0 = Math.atan2(T.p[1] - C[1], T.p[0] - C[0]);
    const arc = Math.abs(rad) * r, steps = Math.max(4, Math.ceil(arc / 0.25));
    for (let i = 1; i <= steps; i++) {
      const a = a0 + rad * (i / steps);
      push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]);
      T.km += (arc / steps) / PPK;
    }
    T.th += rad;
    return T;
  };
  T.mark = (name) => { T.marks.push({ name, km: T.km, pt: T.p.slice(), th: T.th * 180 / Math.PI }); return T; };
  return T;
}

// ═══════════════  Hermite 段（湖岸有机段，长度可解） ═══════════
function hermite(P, T0, Q, T1, m0, m1, n = 200) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    pts.push([
      h00 * P[0] + h10 * m0 * T0[0] + h01 * Q[0] + h11 * m1 * T1[0],
      h00 * P[1] + h10 * m0 * T0[1] + h01 * Q[1] + h11 * m1 * T1[1],
    ]);
  }
  return pts;
}
/** 过 via 的平滑段；用公共倍率 k 二分切向量长度，使弧长 = targetPt */
function solveShore(P, H0, Q, H1, via, targetPt) {
  const build = (k) => {
    const pts = [P, ...via, Q], raw = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const t0 = i === 0 ? H0 : V.norm(V.sub(B, pts[i - 1]));
      const t1 = i === pts.length - 2 ? H1 : V.norm(V.sub(pts[i + 2], A));
      const d = V.len(V.sub(B, A));
      raw.push(hermite(A, t0, B, t1, Math.max(20, d * 0.45) * k, Math.max(20, d * 0.45) * k, 120));
    }
    let cat = raw.flat();
    for (let s = 0; s < 3; s++) cat = cat.map((p, i) => {
      const a = cat[Math.max(0, i - 8)], b = cat[Math.min(cat.length - 1, i + 8)];
      return [(p[0] * 2 + a[0] + b[0]) / 4, (p[1] * 2 + a[1] + b[1]) / 4];
    });
    cat[0] = P.slice(); cat[cat.length - 1] = Q.slice();
    return cat;
  };
  let lo = 0.05, hi = 40, best = build(lo);
  const loLen = polyLen(best);
  if (targetPt <= loLen) return { pts: best, len: loLen, short: true };
  for (let it = 0; it < 42; it++) {
    const mid = (lo + hi) / 2, pts = build(mid), L = polyLen(pts);
    best = { pts, len: L };
    if (Math.abs(L - targetPt) < 0.05) break;
    if (L < targetPt) lo = mid; else hi = mid;
  }
  return best;
}

// ═══════════════  水面 / 绿地形状 ═══════════
let seed = 20261109;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function blob(cx, cy, rx, ry, wob = 0.09, n = 64, rot = 0) {
  const ph1 = rnd() * Math.PI * 2, ph2 = rnd() * Math.PI * 2, pts = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wob * (0.55 * Math.sin(3 * a + ph1) + 0.45 * Math.sin(5 * a + ph2));
    const x = rx * k * Math.cos(a), y = ry * k * Math.sin(a);
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}
function capsule(x0, y0, x1, y1, hw, wob = 0.06, n = 16) {
  const d = V.norm([x1 - x0, y1 - y0]), nx = -d[1], ny = d[0];
  const pts = [], ph = rnd() * Math.PI * 2;
  for (let i = 0; i <= n; i++) { const t = i / n, k = 1 + wob * Math.sin(t * 7 + ph); pts.push([x0 + (x1 - x0) * t + nx * hw * k, y0 + (y1 - y0) * t + ny * hw * k]); }
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([x1 + (nx * Math.cos(a) + d[0] * Math.sin(a)) * hw, y1 + (ny * Math.cos(a) + d[1] * Math.sin(a)) * hw]); }
  for (let i = n; i >= 0; i--) { const t = i / n, k = 1 + wob * Math.sin(t * 7 + ph + 2.1); pts.push([x0 + (x1 - x0) * t - nx * hw * k, y0 + (y1 - y0) * t - ny * hw * k]); }
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([x0 + (-nx * Math.cos(a) - d[0] * Math.sin(a)) * hw, y0 + (-ny * Math.cos(a) - d[1] * Math.sin(a)) * hw]); }
  return pts;
}
// 海峡：双岸折线围成的带（桥位处水面宽 ~155pt）
function band(nb, sb) { return nb.concat([...sb].reverse()); }

const BANK_NB = [[400, 1150], [560, 1148], [700, 1168], [860, 1210]];   // 海峡北岸
const BANK_SB = [[400, 1300], [560, 1304], [700, 1322], [860, 1362]];   // 海峡南岸
const LAKE = {
  westBay: blob(300, 1210, 130, 110, 0.10),                // 西湖湾（死end湾，海峡西端）
  strait: band(BANK_NB, BANK_SB),                          // 云澜海峡（桥跨 x=838/845）
  connector: capsule(880, 1360, 960, 1500, 68, 0.05),      // 海峡 → 南湖 连接水道
  basin: blob(950, 1950, 470, 420, 0.09),                  // 南湖主体
  baySE: blob(1350, 2020, 290, 230, 0.09),                 // 悦水湾（东南湾，花海所在）
  midLink: blob(1500, 1830, 150, 120, 0.08),               // 悦水湾 → 细腰 连接湖
  waist: capsule(1620, 1660, 1750, 1460, 60, 0.05),        // 葫芦细腰
  eastArm: capsule(1740, 1300, 2560, 1340, 175, 0.06),     // 东湾长臂（滨湖公园水岸）
  eastBulb: blob(2650, 1400, 260, 210, 0.08),              // 东湾头
  pond1: blob(1300, 752, 98, 62, 0.12),                    // 湿地池塘①
  pond2: blob(1452, 726, 82, 58, 0.12),                    // 湿地池塘②
  parkPond: blob(1905, 1076, 92, 60, 0.10),                // 滨湖公园内湖
};
const WATER = [
  [LAKE.westBay, []], [LAKE.strait, []], [LAKE.connector, []], [LAKE.basin, []],
  [LAKE.baySE, []], [LAKE.midLink, []], [LAKE.waist, []], [LAKE.eastArm, []], [LAKE.eastBulb, []],
  [LAKE.pond1, []], [LAKE.pond2, []], [LAKE.parkPond, []],
];
const GREEN = [
  [blob(1250, 640, 132, 105, 0.10), []],                   // 澜渚洲公园（起终点旁）
  [blob(620, 960, 100, 75, 0.11), []],                     // 城西桥头公园
  [blob(1330, 950, 115, 85, 0.11), []],                    // 城南绿地
  [blob(1700, 2130, 130, 90, 0.12), []],                   // 悦水湾花海绿地
  [capsule(1560, 1165, 2500, 1195, 55, 0.10), []],         // 滨湖公园绿带（东湾北岸）
  [blob(1390, 730, 160, 100, 0.10), []],                   // 湿地公园绿地
  [blob(560, 2280, 120, 80, 0.12), []],                    // 南湖西南绿滩
];

// ═══════════════  全马主链 ═══════════
// 结构段用 turtle（里程精确）；南岸大环线用 solveShore（长度解到 km）
function buildFull() {
  const T = makeTurtle(SF, -90);         // 出发朝北
  // —— 城区 zigzag
  T.S(158).mark('星湖南路北段');         // → (1140,632)
  T.A(28, 90);                           // 右转向东
  T.S(300).mark('文昌路');               // → (1468,604)
  T.A(24, 90);                           // 右转向南
  T.S(176).mark('塔前街');               // → (1492,804)  文渊寺塔 ~2.36
  T.A(24, 90);                           // 右转向西
  T.S(316).mark('镜湖南路');             // → (1152,828)  博物馆 2.73 在途中
  T.A(26, -90);                          // 左转向南
  T.S(192).mark('云澜南路');             // → (1126,1046)
  T.A(24, 90);                           // 右转向西
  T.S(386).mark('澜兴路');               // → (716,1070)
  T.A(22, -90);                          // 左转向南（集贤街）
  T.S(30).mark('集贤街');                // → (694,1122)
  T.A(24, -90);                          // 左转向东（望江路→环湖大道）
  T.S(92).mark('环湖大道');              // → (810,1146)  老街 6.38 在途中
  T.A(28, 90);                           // 右转向南 → (838,1174)
  T.Sto(8.001).mark('桥北1');            // → 桥面起点 (838,1199)
  T.S(161).mark('桥南1');                // 云澜大桥 → (838,1360)  km 8.539
  const segA = { pts: T.pts.slice(), km: T.km, end: T.p.slice(), h: [Math.cos(T.th), Math.sin(T.th)] };

  // —— 南岸大环线（8.539 → 18.043）：观澜路/长丰路/银杏大道/悦水湾/听涛路
  const VIA_SOUTH = [
    [830, 1520], [680, 1650], [545, 1790], [485, 1980],   // 观澜路→长丰路（西湖岸）
    [530, 2180],                                          // 入银杏大道弯
    [545, 2300], [1020, 2330],                            // 银杏大道（笔直，sequoia 11.2–12.7）
    [1260, 2330], [1480, 2290], [1615, 2200],             // 悦水湾南/东岸（花海 12.8–17）
    [1620, 2040], [1560, 1905], [1465, 1840],             // 悦水湾东北岸
    [1500, 1700], [1560, 1610],                           // 细腰西侧走廊
    [1380, 1530], [1150, 1470], [950, 1440],              // 听涛路（内湾北岸回程）
  ];
  const END_S = [815, 1430], H1_S = [1, 0];               // 回到桥南（朝东接左转弯）
  const targetShore = (18.043 - 8.539) * PPK;
  const shore = solveShore(segA.end, segA.h, END_S, H1_S, VIA_SOUTH, targetShore);
  if (shore.short) console.warn(`  [南岸过短] 目标 ${targetShore.toFixed(0)}pt < 最直 ${shore.len.toFixed(0)}pt`);

  // —— 第二桥段 + 折返 + 分流
  const T2 = makeTurtle(END_S, 0);
  T2.pts = shore.pts.slice(0, -1);       // 接岸线（去掉重复终点）
  T2.km = 8.539; T2.p = END_S.slice(); T2.th = 0;
  T2.A(30, -90).mark('桥南弯2');         // 左转向北 → (845,1400)
  T2.Sto(18.311).mark('桥南2');          // → 桥面起点 (845,1367)
  T2.S(161).mark('桥北2');               // 云澜大桥回程 → (845,1206)  km 18.849
  T2.S(60).mark('白鹭路');               // 北行
  T2.A(25, 90);                          // 右转向东
  T2.S(55);
  T2.A(25, -90);                         // 左转向北
  T2.Sto(19.61).mark('折返1');           // 白鹭路折返点（朝北）
  T2.A(12, 180).mark('折返1出');         // 180° 掉头（朝南朝回）
  T2.S(82);                              // 南行（环湖大道 20.14）
  T2.A(28, -90);                         // 左转向东
  T2.S(50);
  T2.A(24, -90);                         // 左转向北
  T2.S(30);
  T2.A(24, 90);                          // 右转向东
  T2.Sto(20.91).mark('分流');            // 分流点（朝东）
  // —— 全马专属：东湾去程
  T2.S(80).mark('柳堤南路');
  T2.A(30, 90);                          // 右转向南
  T2.S(60);
  T2.A(30, -90);                         // 左转向东（东湾北岸堤顶）
  T2.S(200).mark('滨湖公园');            // 22.4 滨湖公园西口
  T2.S(1400).mark('堤顶直行');           // 东湾北岸长堤
  T2.Sto(29.06);                         // 折返前直道
  T2.A(14, 180).mark('折返2');           // 东端 180° 掉头（29.20 在弧顶）
  // —— 回程（同堤对侧车道）
  T2.S(1480).mark('堤顶回程');
  T2.A(40, -45);                         // 左前方斜出（科创大道）
  T2.S(300).mark('科创大道');
  T2.A(60, 90);                          // 右转向北
  T2.S(330);
  T2.A(40, -45);                         // 左前方（东北向）
  T2.S(240).mark('人民医院');            // 39.24 附近
  T2.A(40, -45);                         // 左前方（北向）
  T2.S(120).mark('湿地公园');            // 40.59 湿地（芦苇 40–41）
  T2.A(40, -45);                         // 左前方（西北向）
  T2.S(150);
  T2.A(30, -45);                         // 左转向西
  T2.S(120).mark('星湖南路口');          // 41.40 回到星湖南路路口
  T2.A(28, 90);                          // 右转向北（终点直道入口）
  T2.Sto(41.965).mark('直道入口');
  T2.S(FULL_LEN * PPK - T2.km * PPK).mark('终点');
  return { segA, T2 };
}

// ═══════════════  生成导出 ═══════════
function main() {
  console.log('布局全马主链…');
  const { segA, T2 } = buildFull();
  const dense = resampleEq(segA.pts.slice(0, -1).concat(T2.pts), 0.25);
  const cumF = cumLen(dense);
  const totalKm = cumF[cumF.length - 1] / PPK;
  console.log(`  实测全长 ${totalKm.toFixed(4)} km（目标 ${FULL_LEN}）`);

  const at = (km) => posAt(dense, cumF, Math.min(km, totalKm)).map((v) => +v.toFixed(1));
  const dirAt = (km, w = 0.02) => V.norm(V.sub(posAt(dense, cumF, Math.min(km + w, totalKm)), posAt(dense, cumF, Math.max(km - w, 0))));

  // 锚点核对表
  console.log('\n══ 锚点核对 ══');
  for (const m of T2.marks.concat()) console.log(`  ${m.name.padEnd(6)} km ${m.km.toFixed(3).padStart(7)}  (${Math.round(m.pt[0])},${Math.round(m.pt[1])})  h ${m.th.toFixed(0)}°`);

  // 全马 10m 重采样
  const nF = Math.floor(FULL_LEN / STEP) + 1;
  const full = [];
  for (let i = 0; i < nF; i++) full.push(at(i * STEP));
  full.push(at(FULL_LEN));
  const cumFull = cumLen(full).map((v) => v / PPK);

  // 桥
  const P1 = [8.001, 8.539], P2 = [18.311, 18.849];
  const deck = []; for (let i = 0; i < 41; i++) deck.push(at(P1[0] + (i / 40) * (P1[1] - P1[0])));
  const c1 = at((P1[0] + P1[1]) / 2), c2 = at((P2[0] + P2[1]) / 2);
  const bridge = {
    name: '云澜大桥', length_m: 537.4, pass1_km: P1, pass2_km: P2,
    pass2_offset_pt: +Math.hypot(c2[0] - c1[0], c2[1] - c1[1]).toFixed(1), deck,
  };

  // —— 半马线：0 → 分流点 与全马平行（(-dy,dx) 侧 7pt，与旧数据同侧），分流后左转进终点
  const HALF_OFF = 7.0, SPLIT_FULL_KM = 20.91;
  const iSplit = Math.round(SPLIT_FULL_KM / STEP);
  const halfShare = [];
  for (let i = 0; i <= iSplit; i++) {
    const km = i * STEP, p = posAt(dense, cumF, km), d = dirAt(km);
    halfShare.push([p[0] - d[1] * HALF_OFF, p[1] + d[0] * HALF_OFF]);
  }
  const shareKm = cumLen(halfShare).pop() / PPK;
  const hSplit = halfShare[halfShare.length - 1], hDir = dirAt(SPLIT_FULL_KM);
  const finEnter = [1133, 860], finPt = [1133, 792.5];     // 终点直道 230m（自南北上）
  const spurTarget = (HALF_LEN - shareKm) * PPK - (finEnter[1] - finPt[1]);
  const spur = solveShore(hSplit, hDir, finEnter, [0, -1], [[hSplit[0] - 60, hSplit[1] - 70], [1145, 905]], spurTarget);
  const halfPts = halfShare.concat(spur.pts.slice(1), [finPt]);
  const cumH0 = cumLen(halfPts);
  const halfLenNow = cumH0[cumH0.length - 1] / PPK;
  console.log(`\n半马：共线 ${shareKm.toFixed(3)} km，支线 ${(spur.len / PPK * 1000).toFixed(0)}m，合计 ${halfLenNow.toFixed(4)} km`);
  const nH = Math.floor(HALF_LEN / STEP) + 1;
  const half = [];
  for (let i = 0; i < nH; i++) half.push(posAt(halfPts, cumH0, Math.min(i * STEP, halfLenNow - 1e-6)).map((v) => +v.toFixed(1)));
  half.push(finPt.map((v) => +v.toFixed(1)));
  const cumHalf = cumLen(half).map((v) => v / PPK);

  const half_on_full = [];
  for (let hk = 0; hk <= shareKm - 1e-6; hk += 0.05) {
    const i = Math.round(hk / STEP);
    half_on_full.push([+hk.toFixed(3), +cumFull[i].toFixed(3)]);
  }
  half_on_full.push([+shareKm.toFixed(3), SPLIT_FULL_KM]);
  const split = { half_km: +shareKm.toFixed(3), full_km: SPLIT_FULL_KM, pt: [+hSplit[0].toFixed(1), +hSplit[1].toFixed(1)] };

  const kmBadges = [], halfBadges = [];
  for (let k = 1; k <= 42; k++) kmBadges.push({ km: k, pt: at(Math.min(k, FULL_LEN)) });
  for (let k = 1; k <= 21; k++) halfBadges.push({ km: k, pt: posAt(halfPts, cumH0, Math.min(k, halfLenNow)).map((v) => +v.toFixed(1)) });

  // POI
  const POI_DEF = {
    baosheng_temple: [1600, 760], museum: [1405, 792], old_street: [760, 1105],
    water_town: [1560, 2120], laizhuzhou_park: [1250, 640], wetland_park: [1390, 700],
    tcm_hospital: [1000, 560], people_hospital: [1240, 800],
    timing_21: [1133, 850], timing_east: [2900, 1155],
  };
  const nearestKm = (pts, cum, p) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < pts.length; i += 3) { const d = Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]); if (d < bd) { bd = d; best = i; } }
    return { km: cum[best], d: bd };
  };
  const pois = {};
  for (const [k, p] of Object.entries(POI_DEF)) {
    const f = nearestKm(full, cumFull, p), h = nearestKm(half, cumHalf, p);
    pois[k] = { pt: p, full_km: +f.km.toFixed(2), full_d_pt: +f.d.toFixed(1), half_km: h.d < 80 ? +h.km.toFixed(2) : null };
  }

  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/course.json'), 'utf8'));
  const course = {
    meta: {
      source: '2026澜湾马拉松·虚构案例地图（tools/gen_fictional_course.mjs 全程序生成）',
      coord: 'AI 页面 pt，原点左上，y 向下', m_per_pt: MPP, step_km: STEP,
      start_finish: SF,
      notes: [
        '整张地图为虚构案例：湖链（西湖湾—云澜海峡—南湖—悦水湾—细腰—东湾）、城区方格网与赛道几何均为程序生成，不对应任何真实城市',
        '全/半马共线段画成相距约 7pt 的平行双线，半马线在 (-dy,dx) 一侧（与旧版双线口径一致）',
        '桥长 537.4m 沿用既有设定；分流点全马 20.91km / 半马约 20.7km',
        '功能点与海拔剖面沿用既有已核验口径',
      ],
    },
    full, half, full_len_km: FULL_LEN, half_len_km: HALF_LEN,
    half_on_full, split, km_badges: kmBadges, half_badges: halfBadges,
    stations: old.stations, elevation: old.elevation, bridge,
    turnarounds: [
      { km: 19.61, pt: at(19.61), name: '镜湖南路折返' },
      { km: 29.2, pt: at(29.2), name: '全马折返点' },
    ],
    pois,
  };

  // ═══════════ map_layers.json ═══════════
  const R = (p) => p.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]);
  const roads = [];
  const road = (w, pts) => roads.push({ w, pts: R(pts) });
  // 城区方格网（赛道所在街 + 支路）
  road(16, [[1140, 300], [1140, 632], [1140, 792]]);                        // 星湖南路
  road(16, [[940, 632], [1140, 632], [1468, 604], [1560, 600]]);            // 文昌路
  road(12, [[1492, 480], [1492, 628], [1492, 804], [1480, 900]]);           // 塔前街
  road(14, [[1000, 828], [1152, 828], [1468, 828], [1560, 824]]);           // 镜湖南路
  road(12, [[1126, 828], [1126, 1046], [1126, 1120]]);                      // 云澜南路
  road(14, [[716, 1070], [1102, 1070], [1300, 1070]]);                      // 澜兴路
  road(10, [[694, 1070], [694, 1122]]);                                     // 集贤街
  road(12, [[694, 1122], [718, 1146], [810, 1146]]);                        // 望江路/环湖大道（北岸）
  road(12, [[810, 1146], [838, 1174], [838, 1199]]);                        // 桥北引道
  // 城区支路
  for (const x of [980, 1050, 1230, 1320, 1410]) road(6, [[x, 470], [x, 632]]);
  for (const x of [980, 1050, 1230, 1320]) road(6, [[x, 632], [x, 828]]);
  for (const x of [970, 1040, 1210, 1300]) road(6, [[x, 828], [x, 1070]]);
  for (const y of [500, 560, 690, 760]) road(6, [[940, y], [1492, y]]);
  for (const y of [890, 950, 1010]) road(6, [[716, y], [1492, y]]);
  road(6, [[940, 470], [940, 300]]); road(6, [[1320, 632], [1320, 560]]);
  // 桥与南岸
  road(16, [[838, 1199], [838, 1360], [830, 1520]]);                        // 云澜大桥（去程）
  road(8, [[845, 1367], [845, 1206], [845, 1146]]);                         // 大桥回程车道
  road(12, [[830, 1520], [680, 1650], [545, 1790], [485, 1980], [530, 2180], [545, 2300], [1020, 2330]]); // 观澜路—长丰路—银杏大道
  road(12, [[1020, 2330], [1260, 2330], [1480, 2290], [1615, 2200], [1620, 2040], [1560, 1905], [1465, 1840]]); // 悦水湾路
  road(12, [[1465, 1840], [1500, 1700], [1560, 1610], [1380, 1530], [1150, 1470], [950, 1440], [815, 1430]]);  // 听涛路
  // 白鹭路（折返）与分流
  road(10, [[845, 1146], [845, 1086], [870, 1056], [900, 1056]]);           // 白鹭路南口
  road(10, [[900, 1062], [900, 990]]);                                      // 白鹭路（折返北段）
  road(10, [[924, 1062], [924, 1100], [952, 1128], [1002, 1128]]);          // 环湖大道东段
  road(10, [[1002, 1128], [1026, 1104], [1026, 1074], [1050, 1050], [1120, 1052]]); // 分流前蛇形
  road(8, [[1120, 1052], [1060, 982], [1145, 905], [1133, 860], [1133, 792.5]]);    // 半马冲刺支路
  // 全马东湾
  road(14, [[1120, 1052], [1200, 1052], [1230, 1082], [1230, 1142], [1260, 1112], [1460, 1112]]); // 柳堤南路（出）
  road(14, [[1460, 1112], [2400, 1112], [2860, 1112]]);                     // 东湾北岸堤顶（去程）
  road(14, [[2860, 1148], [2400, 1148], [1420, 1148]]);                     // 堤顶回程
  road(14, [[1420, 1148], [1352, 1228], [1100, 1480]]);                     // 科创大道（斜穿）
  road(12, [[1100, 1480], [960, 1340], [940, 1100], [980, 960]]);           // 回城纵路
  road(12, [[980, 960], [1100, 860], [1300, 810], [1400, 800]]);            // 人民医院/湿地路
  road(12, [[1400, 800], [1300, 810], [1210, 838], [1176, 872]]);           // 湿地回程
  road(14, [[1176, 872], [1140, 861], [1140, 792]]);                        // 星湖南路终点段
  const rivers = [
    { w: 5, pts: R([[350, 300], [360, 500], [340, 700], [330, 900], [315, 1050]]) },  // 西郊河入湖湾
    { w: 4, pts: R([[3150, 320], [3100, 600], [3060, 900], [3030, 1200]]) },          // 东郊溪
  ];
  const layers = {
    meta: {
      source: '2026澜湾马拉松·虚构案例地图（tools/gen_fictional_course.mjs 全程序生成）',
      coord: 'AI 页面 pt，原点左上，y 向下', m_per_pt: MPP,
      frame: FRAME, legend_box: [1490, 1925, 3606, 2551],
    },
    water: WATER.map(([o, h]) => [R(o), h.map(R)]),
    green: GREEN.map(([o, h]) => [R(o), h.map(R)]),
    road_fill: [], roads, rivers, labels: [], icons: [],
  };

  // ═══════════ labels.js ═══════════
  const lab = (name, kms) => ({ name, pt: at(kms[0]).map((v) => Math.round(v)), km: kms });
  const LABELS = [
    lab('星湖南路', [0.38, 41.80]), lab('文昌路', [1.54]), lab('镜湖南路', [3.10]),
    lab('云澜南路', [3.84]), lab('澜兴路', [5.40]), lab('集贤街', [5.90]), lab('望江路', [6.20]),
    lab('环湖大道', [7.46, 20.14]), lab('云澜大桥', [8.27, 18.58]), lab('观澜路', [9.65]),
    lab('长丰路', [10.81]), lab('听涛路', [12.49]), lab('柳堤南路', [21.40, 40.74]),
    lab('科创大道', [38.68]), lab('环湖大道', [40.21]), lab('星湖南路', [42.0]),
  ];
  const labelsJs = `// 路名标签：pt 为虚构地图上的取字点（tools/gen_fictional_course.mjs 生成）。
// km 为该路名在全程线上的投影里程，仅用于“临近才显示”。
export const ROAD_LABELS = ${JSON.stringify(LABELS, null, 2)};
`;

  fs.writeFileSync(path.join(ROOT, 'data/course.json'), JSON.stringify(course));
  fs.writeFileSync(path.join(ROOT, 'data/map_layers.json'), JSON.stringify(layers));
  fs.writeFileSync(path.join(ROOT, 'races/lanwan-2026/config/labels.js'), labelsJs);
  console.log('\n写出 data/course.json / data/map_layers.json / races/lanwan-2026/config/labels.js');

  // ═══════════ 自检 ═══════════
  console.log('\n══ 自检 ══');
  console.log(`full ${full.length} pts（应 4221）  half ${half.length} pts（应 2111）`);
  console.log(`split  half ${split.half_km} / full ${split.full_km}  pt ${split.pt.map(Math.round)}`);
  console.log(`bridge 双桥间距 ${bridge.pass2_offset_pt}pt  deck[0] ${deck[0].map(Math.round)}  deck[40] ${deck[40].map(Math.round)}`);
  function ptInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inWater = (p) => WATER.some(([o, holes]) => ptInRing(p, o) && !holes.some((h) => ptInRing(p, h)));
  let bad = [];
  for (let km = 0; km <= FULL_LEN; km += 0.005) {
    const onBridge = (km >= P1[0] - 0.02 && km <= P1[1] + 0.02) || (km >= P2[0] - 0.02 && km <= P2[1] + 0.02);
    if (!onBridge && inWater(posAt(dense, cumF, km))) bad.push(+km.toFixed(2));
  }
  console.log(`赛道落水：${bad.length ? bad.slice(0, 12).join(',') + (bad.length > 12 ? ' …' : '') : '无 ✓'}`);
  for (const [name, km] of [['博物馆', 2.73], ['老街', 6.38], ['桥心1', 8.27], ['银杏大道', 11.9], ['悦水湾', 15.65], ['桥心2', 18.58], ['折返1', 19.61], ['分流', 20.91], ['滨湖', 22.4], ['折返2', 29.2], ['科创', 38.68], ['湿地', 40.59], ['回程口', 41.4]]) {
    const p = at(km); console.log(`  km ${String(km).padEnd(6)} ${name.padEnd(4)} → (${Math.round(p[0])}, ${Math.round(p[1])})`);
  }
  const d0 = dirAt(0.05), dE = dirAt(FULL_LEN - 0.03);
  console.log(`起点朝向 (${d0[0].toFixed(2)},${d0[1].toFixed(2)})（应 ≈(0,-1)）  终点朝向 (${dE[0].toFixed(2)},${dE[1].toFixed(2)})（应 ≈(0,-1)）`);

  writePreview(course, layers);
}

// ═══════════════ 调试预览（SVG in HTML，shot.mjs 截图用） ═══════════════
function writePreview(course, layers) {
  const ring = (r) => 'M' + r.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join('L') + 'Z';
  const line = (r) => 'M' + r.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join('L');
  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 250 3800 2400" style="background:#e8e2d4;width:100vw;height:100vh">`);
  for (const [o] of layers.water) svg.push(`<path d="${ring(o)}" fill="#9fc6e8" stroke="none"/>`);
  for (const [o] of layers.green) svg.push(`<path d="${ring(o)}" fill="#b5d6a0"/>`);
  for (const r of layers.roads) svg.push(`<path d="${line(r.pts)}" fill="none" stroke="#f5efe2" stroke-width="${r.w}" stroke-linecap="round"/>`);
  svg.push(`<path d="${line(course.full)}" fill="none" stroke="#2255cc" stroke-width="4"/>`);
  svg.push(`<path d="${line(course.half)}" fill="none" stroke="#e0447e" stroke-width="2.5"/>`);
  for (const b of course.km_badges) { svg.push(`<circle cx="${b.pt[0]}" cy="${b.pt[1]}" r="9" fill="#fff" stroke="#333"/><text x="${b.pt[0]}" y="${b.pt[1] + 4}" font-size="11" text-anchor="middle">${b.km}</text>`); }
  for (const [name, km] of [['桥1', 8.27], ['桥2', 18.58], ['折返1', 19.61], ['分流', 20.91], ['折返2', 29.2], ['湿地', 40.59]]) {
    const b = course.km_badges[Math.min(41, Math.floor(km))];
    const p = posAt(course.full, cumLen(course.full), km);
    svg.push(`<circle cx="${p[0]}" cy="${p[1]}" r="14" fill="none" stroke="#d00" stroke-width="3"/><text x="${p[0] + 18}" y="${p[1]}" font-size="22" fill="#d00">${name}</text>`);
  }
  const sp = course.split.pt; svg.push(`<circle cx="${sp[0]}" cy="${sp[1]}" r="16" fill="none" stroke="#0a0" stroke-width="3"/>`);
  svg.push('</svg>');
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0">${svg.join('')}</body>`;
  fs.mkdirSync(path.join(ROOT, '_work'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '_work/map_preview.html'), html);
}

main();
