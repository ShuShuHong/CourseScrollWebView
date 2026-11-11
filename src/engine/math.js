// 数值工具：保形三次插值（PCHIP，单调数据不过冲）
export function pchip(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  // 端点：若相邻段为平段，端点斜率取 0（起步/收尾不突兀）
  if (d[0] === 0) m[0] = 0; if (d[n - 2] === 0) m[n - 1] = 0;
  const f = (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const i = lo, t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
  f.xs = xs; f.ys = ys;
  return f;
}

/** 单调非减函数 f 在 [a,b] 上的反函数（二分） */
export function inverse(f, a, b, y, iters = 44) {
  if (f(b) < y) return b;
  let lo = a, hi = b;
  for (let i = 0; i < iters; i++) { const mid = (lo + hi) / 2; if (f(mid) < y) lo = mid; else hi = mid; }
  return hi;
}

/** 分段线性插值（与 pchip 同接口：返回 f(x)，带 xs/ys）。
 *  为什么需要它：**公里窗口排程本身是分段线性的**（每段速度 = 窗口 ÷ 时长，恒定）。
 *  用 pchip 会在锚点处把速度抹成 0 斜率 ⇒ 螃蟹在段末“收脚”——客户 2026-11-09 报的
 *  「1750 帧进分流副本之前像故意停下脚步」就是分流前那段被 pchip 缓出了。
 *  需要平滑过渡的地方（母蟹分流后的里程）仍用 pchip。 */
export function linearCurve(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return Object.assign(() => ys[0], { xs, ys });
  const f = (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const i = lo, h = xs[i + 1] - xs[i];
    if (h <= 1e-9) return ys[i + 1];
    return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / h;
  };
  f.xs = xs; f.ys = ys;
  return f;
}
