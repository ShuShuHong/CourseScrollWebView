// ════════════════════════════════════════════════════════════════════════
//  分流丁字路口的几何（客户 2026-11-06 第二批全局改动）
//
//  ★ 方位口径（客户 2026-11-06 更正）：**图面上方 = 东**
//      +x = 东（跑进方向、图面上方）      +z = 南（图面右、湖侧）      -z = 北（图面左、主会场侧）
//    （旧文档里写的「+x 北 / +z 东」一律作废）
//
//  本次改动（客户原话编号）：
//    1. 全图往「南」再延伸 100 m —— 即沿来路方向（−x）延长，路旁景色照旧接着铺
//    2. 星湖南路（半马支路）拓宽到 **18 m**，与主路同宽
//    3. 支路拐弯角 = **100°**（以分叉点为顶点、与来路方向的夹角），岔口做伞形加宽
//    4. 岔路之后主路往南弯 **10°**（圆弧 R60，圆润过渡）
//    5. 导流岛在岔口正中间（三尖头三角，客户 2026-11-07 定点），三个尖头各往一条腿延伸
//       50 m 隔离栏 + 50 m 反光锥（临时加装，下方就是普通双向车道的双黄线）
//    6. 分流牌放在距分叉点 **100 m** 处（正好在中分带北端）
//    7. 两只吉祥物从 **120 m** 外就已经分在两条车道里（中分带从 x = −120 开始）
// ════════════════════════════════════════════════════════════════════════

const D2R = Math.PI / 180;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export const SP = {
  /** 主路（环湖大道）车行道宽 18 m；分红线后每条腿也是 18 m */
  roadW: 18,
  /** 半马支路宽 —— 客户要求与主路一致 */
  exitW: 18,
  /** 中分带（两车道之间那道隔离）净宽 */
  medianW: 2.2,
  walkW: 3.2,
  vergeW: 6.0,

  /** 分叉点（= 原点基准） */
  tipX: 2.2,
  /** 主路过岔口后往南弯 10°，圆弧半径 60 m（圆润） */
  kinkDeg: 10, kinkR: 60,
  /** 支路出口方向：与来路夹角 100° ⇒ 相对 +x 是 −80° */
  branchDeg: -80,
  /** 出口 40 m 内由 −80° 缓到 −90°（之后就是正南北向的星湖南路） */
  branchEase: 40,

  /** 两条车道中心线离路中心的横向距离：中分带半宽 + 半条车道 = 1.1 + 3.95 */
  laneHalf: 2.2 / 2 + (18 - 2.2) / 4,
  /** 并流段（中分带起点以南）两车还是挤在一条路上 */
  mergeHalf: 2.0,
  /** 中分带起点：从这里往北，两条车道已经分开 */
  mergeX: -120,
  /** 中分带（导流岛）从分叉点往北的总长 = 分流牌位置 */
  medianLen: 100,
  /** 中分带分段：0–50 m 注水马，50–100 m 反光锥 */
  waterSeg: 50,
  coneSeg: 50,

  /**
   * 视觉位移（2026-11-07 第三版）：s = 沿各自路线的弧长，从西端 x = xMin 起算。
   *   窗口 1495–1642 帧（49.833–54.760 s，4.927 s），s 从 78 走到 ≈262：
   *     · 起点 x = −162，分流牌（x −97.8）在 64 m 外 ⇒ 牌面从第 1495 帧一直待到 51.55 s
   *     · 湾湾**第 1612 帧（53.733 s）正好开始打弯**（s = 223.5 = 起点 x −16.5）
   *     · 之后 1 s 内拐进星湖南路，收尾在 z ≈ −34
   */
  speed: 37.31,          // 旧窗口(4.93s)下的走位速度，只用于换算 sEnd，不再直接当速度用
  sEnd: 252, // 旧窗口终点的弧长 ≈ 262：新窗口按比例走到同一个地方
  s0: 78,

  /** 东侧湖岸（x=0 处离路中心 26 m，往北抬） */
  waterZ: 26, waterK: 0.16,
  /** 场景两端 */
  xMin: -240, xMax: 170,
};

// ── 主路中心线：x ≤ tipX 直走；过了岔口按 R60 往南弯 10°
const KINK = SP.kinkDeg * D2R;
const XA = SP.tipX + SP.kinkR * Math.sin(KINK);
export const roadZ = (x) => {
  if (x <= SP.tipX) return 0;
  if (x <= XA) { const u = x - SP.tipX; return SP.kinkR - Math.sqrt(Math.max(0, SP.kinkR * SP.kinkR - u * u)); }
  return SP.kinkR * (1 - Math.cos(KINK)) + Math.tan(KINK) * (x - XA);
};
/** 主路航向角（度，相对 +x；正 = 往南偏） */
export const roadHeading = (x) => (x <= SP.tipX ? 0 : x <= XA ? Math.asin(Math.min(1, (x - SP.tipX) / SP.kinkR)) / D2R : SP.kinkDeg);

// ── 支路中心线：按弧长采样（从分叉点起算，s = 0 在岔口）
function buildBranch(len = 170, step = 0.5) {
  const pts = [[SP.tipX, 0]];
  let x = SP.tipX, z = 0;
  for (let s = step; s <= len + 1e-9; s += step) {
    const u = smooth(s / SP.branchEase);
    const ang = (SP.branchDeg - (90 + SP.branchDeg) * u) * D2R;   // −80° → −90°
    x += Math.cos(ang) * step; z += Math.sin(ang) * step;
    pts.push([x, z]);
  }
  return pts;
}
export const BRANCH = buildBranch();

/** 折线 + 弧长参数 */
function makePath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = (s) => {
    const c = Math.max(0, Math.min(len, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= c) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo] || 1, u = (c - cum[lo]) / seg;
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    const t = [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
    return { x, z, t, heading: Math.atan2(t[1], t[0]) / D2R };
  };
  return { pts, cum, len, at };
}
export const BRANCH_PATH = makePath(BRANCH);

/** 支路上距分叉点 s 米的点（s 沿支路量） */
export const branchAt = (s) => BRANCH_PATH.at(s);

/** 主路上 x 处的点/切向（参数仍是 x） */
export const mainAt = (x) => {
  const z = roadZ(x), h = roadHeading(x) * D2R;
  return { x, z, t: [Math.cos(h), Math.sin(h)], heading: roadHeading(x) };
};

// ── 两条车道中心线（湾湾 = 支路 / 蓝蓝 = 主路）
function cubic(P0, P1, P2, P3, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
      u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
    ]);
  }
  return out;
}

/** 并流段：从 x0 往北到 mergeX 由 laneHalf 收拢到 mergeHalf */
function approachLane(side) {
  const out = [];
  for (let x = SP.xMin; x <= -8; x += 2) {
    const u = smooth((x - (SP.mergeX - 14)) / 14);
    out.push([x, side * (SP.mergeHalf + (SP.laneHalf - SP.mergeHalf) * u)]);
  }
  return out;
}

// 客户 2026-11-07：湾湾**提前拐弯**，出弯后走 x = 0.5 这条纬线（星湖南路南车道中线）。
//   旧轨迹是先冲到岔口前 x ≈ 10 再折回来，读起来贴着支路外缘；现在改成 90° 圆弧（R = 17），
//   在 x = −16.5 就开始打弯，出弯点 (0.5, −22.05)，之后一路正北。
const F_TURN_R = 17, F_LANE_X = 0.5;
const F_TURN_X0 = F_LANE_X - F_TURN_R;                 // −16.5：开始打弯
const FC = [F_TURN_X0, -SP.laneHalf - F_TURN_R];       // 圆弧圆心
const FEMALE_PTS = [
  ...approachLane(-1).filter(([x]) => x < F_TURN_X0),
  ...Array.from({ length: 22 }, (_, i) => {
    const phi = ((i + 1) / 22) * (Math.PI / 2);
    return [FC[0] + F_TURN_R * Math.sin(phi), FC[1] + F_TURN_R * Math.cos(phi)];
  }),
  ...Array.from({ length: 70 }, (_, i) => [F_LANE_X, FC[1] - 0.6 - 148 * (i / 69)]),
];
export const FEMALE_TURN = { r: F_TURN_R, x0: F_TURN_X0, laneX: F_LANE_X, zOut: FC[1] };
const M_JOIN = 34;                                   // 主路上并入点（x = 34）
const FEMALE_PATH = makePath(FEMALE_PTS);
const MALE_PTS = [
  ...approachLane(+1),
  ...cubic([-8, SP.laneHalf], [12, SP.laneHalf], [M_JOIN - 22, roadZ(M_JOIN - 22)], [M_JOIN, roadZ(M_JOIN)], 36).slice(1),
  ...Array.from({ length: 80 }, (_, i) => { const x = M_JOIN + (SP.xMax - M_JOIN) * (i / 79); return [x, roadZ(x)]; }),
];
const MALE_PATH = makePath(MALE_PTS);

/**
 * s = 沿各自路线的弧长，从西端 x = xMin 起算（2026-11-07 改口径）。
 * 两只吉祥物同一 s 前进 ⇒ 谁也不会凭空快慢；湾湾的路线更长（要拐弯），但走到岔口前的
 * 弧长和蓝蓝完全一样，所以并流段依然是并排的。
 */
export const femaleAt = (s) => FEMALE_PATH.at(s);
export const maleAt = (s) => MALE_PATH.at(s);

/** 兼容旧接口：按 x 取 z（只在并流段/车道接近平行时有意义） */
export const femaleZ = (x) => {
  if (x <= -8) return -(SP.mergeHalf + (SP.laneHalf - SP.mergeHalf) * smooth((x - (SP.mergeX - 14)) / 14));
  const s = (x - SP.tipX) * 1.2;
  return femaleAt(s).z;
};
export const maleZ = (x) => (x <= -8
  ? (SP.mergeHalf + (SP.laneHalf - SP.mergeHalf) * smooth((x - (SP.mergeX - 14)) / 14))
  : maleAt((x - SP.tipX) * 1.05).z);

/** 支路折线（兼容 exitPath 这个名字：从岔口出发，按 step 采样） */
export const exitPath = (step = 1) => {
  const n = Math.max(8, Math.round(BRANCH_PATH.len / step));
  return Array.from({ length: n + 1 }, (_, i) => { const q = BRANCH_PATH.at((BRANCH_PATH.len * i) / n); return [q.x, q.z]; });
};

// ── 导流岛：客户 2026-11-07 给的三点（图面「横 / 竖」→ 世界 z / x）
//    （横 −10，竖  5）→ (x = tipX + 5, z = −10)  北尖（星湖南路）
//    （横   0，竖 10）→ (x = tipX + 10, z =  0)  东尖（主路东行）
//    （横   0，竖  0）→ (x = tipX,      z =  0)  西尖（来路）
//    三边中点朝重心内凹 → 三尖头三角形
export const ISLAND_TRI = [
  [SP.tipX, 0],
  [SP.tipX + 10, 0],
  [SP.tipX + 5, -10],
];
/** 内凹比例：三边中点朝重心收 15%（底边凹 0.50 m、两条侧边各凹 0.45 m）—— 弧线更顺滑圆润 */
export const ISLAND_K = 0.15;

/**
 * 三尖头轮廓（2026-11-07 第三版：**改成闭合 Catmull-Rom**）。
 *   控制点 = 三个尖 + 三个浅内凹中点（朝重心收 k），曲线穿过全部控制点、**处处 C1 连续**，
 *   所以三道弧是顺滑圆润的连续曲线，不会再在每个尖上出现切线折角。
 *   span = 每两个控制点之间的细分数。
 */
export const ISLAND_SPAN = 12;
function starOutline(tri, k, span = ISLAND_SPAN) {
  const n = tri.length;
  const G = [tri.reduce((a, p) => a + p[0] / n, 0), tri.reduce((a, p) => a + p[1] / n, 0)];
  const CP = [];
  for (let i = 0; i < n; i++) {
    const A = tri[i], B = tri[(i + 1) % n];
    CP.push(A);
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    CP.push([M[0] + (G[0] - M[0]) * k, M[1] + (G[1] - M[1]) * k]);
  }
  const m = CP.length, out = [];
  for (let i = 0; i < m; i++) {
    const p0 = CP[(i - 1 + m) % m], p1 = CP[i], p2 = CP[(i + 1) % m], p3 = CP[(i + 2) % m];
    for (let j = 0; j < span; j++) {
      const t = j / span, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
export const ISLAND = starOutline(ISLAND_TRI, ISLAND_K);
/** 三道弧（每道 = 尖 A → 内凹中点 → 尖 B）：第 i 道是轮廓上第 24i … 24i+24 点（含两端尖） */
const ARC_N = 2 * ISLAND_SPAN;
export const ISLAND_ARCS = [0, 1, 2].map((i) => ISLAND
  .slice(i * ARC_N, i * ARC_N + ARC_N)
  .concat([ISLAND[((i + 1) * ARC_N) % ISLAND.length]]));


// ── 三条腿的临时隔离带：从岛尖出发，各 100 m = 0–50 m 隔离栏 + 50–100 m 反光锥
//    下方就是普通双向车道的双黄线（隔离设施是赛事临时加装的，路本身没有特别铺装）
export const DIV_BLEND = 18;      // 岛尖 → 中心线 的过渡长度（米）

/**
 * 隔离带路径：从岛尖起步，前 DIV_BLEND 米由「顺着该腿方向直行」平滑过渡到「压在双黄线上」，
 * 之后 100% 贴中心线；整体按弧长重采样成 100 段，保证从尖头量正好 100 m。
 */
const _divPts = (tip, centerAt) => {
  const raw = [];
  for (let d = 0; d <= SP.medianLen + 40; d += 0.25) {
    const t = smooth(d / DIV_BLEND), C = centerAt(d);
    raw.push([tip[0] + (C[0] - tip[0]) * t, tip[1] + (C[1] - tip[1]) * t]);
  }
  const P = makePath(raw);
  const out = [];
  for (let i = 0; i <= SP.medianLen; i += 1) { const q = P.at(i); out.push([q.x, q.z]); }
  return out;
};
export const DIVIDERS = (() => {
  const [W, E, N] = ISLAND_TRI;
  let sN = 0;
  for (let s = 0; s <= 60; s += 0.05) { if (branchAt(s).z <= N[1]) { sN = s; break; } }
  return [
    { id: 'W', name: '来路（西）', tip: W, center: 0, waterLen: SP.waterSeg, pts: _divPts(W, (d) => [SP.tipX - d, 0]) },
    { id: 'E', name: '主路东行（东）', tip: E, center: 0, waterLen: SP.waterSeg, pts: _divPts(E, (d) => [E[0] + d, roadZ(E[0] + d)]) },
    { id: 'N', name: '星湖南路（北）', tip: N, center: sN, waterLen: SP.waterSeg, pts: _divPts(N, (d) => { const q = branchAt(sN + d); return [q.x, q.z]; }) },
  ];
})();

/** 兼容旧名字：西腿（来路）隔离带的路径 */
export const MEDIAN = DIVIDERS[0].pts;

/**
 * 分流牌：**落地标识牌**（客户 2026-11-07 改版，不再用高架子）
 * 位于西腿反光锥之前（距岔口 100 m，跑者先看到牌、再进锥阵），正面朝来路（−x）。
 * w/h = 牌面尺寸，y0 = 牌面下沿离地（底座高度）。
 */
export const SIGN = { x: SP.tipX - SP.medianLen, z: 0, w: 2.6, h: 3.06, y0: 0.16, ry: Math.PI / 2 };

/** 东侧岸线 / 驳岸 */
export const shoreZ = (x) => SP.waterZ + SP.waterK * x;
export const bankZ = (x) => Math.max(shoreZ(x), roadZ(x) + SP.roadW / 2 + SP.walkW + 4.5);

export function sampleAlong(fn, x0, x1, n = 60) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * (i / n), fn(x0 + (x1 - x0) * (i / n))]);
  return out;
}

/** 供自检/平面图用：关键点位 */
export const LAYOUT = {
  tip: [SP.tipX, 0],
  sign: [SIGN.x, SIGN.z],
  mergeStart: [SP.mergeX, 0],
  branchAngleDeg: 100,             // 与来路方向的夹角
  branchOutDeg: Math.abs(SP.branchDeg),
  kinkDeg: SP.kinkDeg,
  laneHalf: SP.laneHalf,
  medianLen: SP.medianLen,
  waterSeg: SP.waterSeg,
  coneSeg: SP.coneSeg,
};
