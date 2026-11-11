// 副本场景的弯道中心线（纯几何，零依赖）
//
// 原来这段算法长在 venue3d.js 的 VenueWorld.roadPath() 里，只有 3D 能用。
// 俯视图（src/pages/plan.js）也要画同一条弯道，所以抽出来放这里 —— **唯一来源**，
// venue3d 与俯视图都 import 它，改转向/半径只改一处，两边不会走形。
import { V } from './venue.js';

/** 中心线：北段直路 → 圆弧（r / turn 度）→ 直出 ext 米。返回 [[x,z], …] */
export function bendPath(V_ = V) {
  const { x0, x1 } = V_.road;
  const { r, turn, ext } = V_.bend;
  const pts = [];
  for (let x = x1; x > x0; x -= 10) pts.push([x, 0]);
  pts.push([x0, 0]);
  const A = (turn * Math.PI) / 180, n = 24;
  for (let i = 1; i <= n; i++) {
    const a = (A * i) / n;
    pts.push([x0 - r * Math.sin(a), r * (1 - Math.cos(a))]);
  }
  const hx = -Math.cos(A), hz = Math.sin(A);
  const [ex, ez] = pts[pts.length - 1];
  for (let d = 8; d <= ext; d += 8) pts.push([ex + hx * d, ez + hz * d]);
  return pts;
}

/** 弯道起点在中心线数组里的下标（x 首次 <= road.x0） */
export function bendStart(all, V_ = V) {
  return Math.max(0, all.findIndex(([x]) => x <= V_.road.x0 + 1e-6));
}

/** 沿中心线按弧长取子路径（s0..s1，米；0 = 弯道起点） */
export function subPath(s0, s1, step = 2, V_ = V) {
  const all = bendPath(V_);
  const seg = all.slice(bendStart(all, V_));
  const cum = [0];
  for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * k, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * k];
  };
  const out = [];
  for (let s = s0; s <= s1 + 1e-6; s += step) out.push(at(s));
  out.push(at(s1));
  return out;
}

/** 弯道上弧长 s 处的点 */
export const cPoint = (s, V_ = V) => {
  const p = subPath(Math.max(0, s - 0.6), s + 0.6, 0.6, V_);
  return p[p.length - 1];
};

/** 弯道起点在 all 里的下标（x 首次 <= road.x0）—— 与上面 bendStart 等价，只是显式传数组 */
const firstIdx = (all, V_ = V) => {
  for (let i = 0; i < all.length; i++) if (all[i][0] <= V_.road.x0 + 1e-6) return i;
  return -1;
};

/**
 * 按弧长（0 = 弯道起点）取 [a,b] 区间上的等距点。
 * 2026-11-08 新增：C 区丁字路口要沿弯道画双黄线，之前用 cPoint() 逐点采样，
 * 在浏览器里会整条带子变成 NaN（几何 0 顶点）；这里改成一次建表 + 线性插值，
 * 并且在 Node 里可以直接单测。
 */
export function arcPoints(a, b, n, V_ = V) {
  const all = bendPath(V_);
  const i0 = firstIdx(all, V_);
  if (i0 < 0) return [];
  const cum = [0];
  for (let i = i0 + 1; i < all.length; i++) cum.push(cum[cum.length - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (ss) => {
    const c = Math.max(0, Math.min(total, ss));
    let k = 1;
    while (k < cum.length - 1 && cum[k] < c) k++;
    const u = (c - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
    const p0 = all[i0 + k - 1], p1 = all[i0 + k];
    return [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u];
  };
  const out = [];
  for (let i = 0; i <= n; i++) out.push(at(a + ((b - a) * i) / n));
  return out;
}

/** 弯道总弧长（弯道起点 → 路径末端） */
export function bendLen(V_ = V) {
  const all = bendPath(V_);
  const i0 = firstIdx(all, V_);
  let L = 0;
  for (let i = i0 + 1; i < all.length; i++) L += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]);
  return L;
}
