// 赛道几何查询：里程 → 图上坐标（AI pt），以及全/半马里程互换、桥面高度
import C from '../../data/course.json';

export const COURSE = C;
export const MPP = C.meta.m_per_pt;          // 1 pt ≈ 3.343 m
export const PT_PER_KM = 1000 / MPP;

export class Route {
  constructor(pts, len) { this.p = pts; this.len = len; this.n = pts.length; this.step = C.meta.step_km; }
  pos(km) {
    const p = this.p, n = this.n;
    if (km <= 0) {
      // 起点之前：沿首段反向延伸（候场区）
      const a = p[0], b = p[4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, s = km * PT_PER_KM;
      return [a[0] + dx / L * s, a[1] + dy / L * s];
    }
    const lastK = (n - 2) * this.step;
    if (km >= this.len) return p[n - 1].slice();
    let i, t;
    if (km >= lastK) { i = n - 2; t = (km - lastK) / (this.len - lastK); }
    else { const f = km / this.step; i = Math.floor(f); t = f - i; }
    const a = p[i], b = p[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  /** 单位切向量（pt 平面），w = 前后取样窗口（km） */
  dir(km, w = 0.04) {
    const a = this.pos(Math.max(km - w, -0.2)), b = this.pos(Math.min(km + w, this.len));
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  }
  slice(k0, k1, step = 0.02) {
    const out = [];
    for (let k = k0; k < k1; k += step) out.push(this.pos(k));
    out.push(this.pos(k1));
    return out;
  }
}

export const FULL = new Route(C.full, C.full_len_km);
export const HALF = new Route(C.half, C.half_len_km);
export const ROUTES = { full: FULL, half: HALF };

const H2F = C.half_on_full; // [[halfKm, fullKm], ...] 共线段
function interpPairs(arr, x, from, to) {
  const n = arr.length;
  if (x <= arr[0][from]) return arr[0][to] + (x - arr[0][from]);
  if (x >= arr[n - 1][from]) return arr[n - 1][to] + (x - arr[n - 1][from]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][from] <= x) lo = m; else hi = m; }
  const a = arr[lo], b = arr[hi], t = (x - a[from]) / (b[from] - a[from] || 1);
  return a[to] + (b[to] - a[to]) * t;
}
export const fullToHalf = (f) => (f < 0 ? f : interpPairs(H2F, f, 1, 0));
export const halfToFull = (h) => (h < 0 ? h : interpPairs(H2F, h, 0, 1));
export const SPLIT = C.split;
/** 全/半马在共线段几乎重合：把半马线整体向行进方向左法线错开 6pt，
 *  做成“蓝左粉右”的双主线，母蟹也跟着这条线走（否则粉线永远被蓝线盖住）。 */
export const HALF_OFF = 0.0;   // 实测两条折线天然相距 5.7pt，足够并排；再加偏移会重叠，故不额外错开

// ── 云澜大桥
// 客户 2026-11-05：**桥面高度降到原来的三分之一** —— 46 → 15.3 pt。
//   原来隆起 46 pt（≈154 m）比实景夸张 6 倍，画面上像一座小山。
//   桥塔是另一件事（world3d.makeTower 的 H，已按客户要求砍到原来的 1/3：96 → 32）。
export const BRIDGE_H = 15.3;
export const BRIDGE_BASE = 0.1;    // 平时保留的隆起比例
const B = C.bridge;
export const BRIDGE_RANGES = {
  full: [B.pass1_km, B.pass2_km],
  half: [B.pass1_km.map(fullToHalf), B.pass2_km.map(fullToHalf)],
};
export function bridgeBump(u) { return u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), 0.75); }
/** 某条线在 km 处的桥面抬升（pt） */
export function liftAt(which, km, lift) {
  let h = 0;
  for (const [k0, k1] of BRIDGE_RANGES[which]) h = Math.max(h, bridgeBump((km - k0) / (k1 - k0)));
  return h * lift * BRIDGE_H;
}
