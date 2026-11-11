// 极简 SVG DOM 工具
export const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/** 把一段 SVG 片段字符串解析进新的 <g> */
export function frag(markup, attrs = {}, parent) {
  const g = el('g', attrs, parent);
  g.innerHTML = markup;
  return g;
}

export function set(e, attrs) {
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export const fmt = (n) => (Math.round(n * 100) / 100).toString();
export const tr = (x, y, s = 1, r = 0) => `translate(${fmt(x)} ${fmt(y)})${r ? ` rotate(${fmt(r)})` : ''}${s !== 1 ? ` scale(${fmt(s)})` : ''}`;

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
/** 0→1 入场、保持、1→0 出场 的包络 */
export function env(t, t0, d, fin = 0.3, fout = 0.3) {
  if (t < t0 || t > t0 + d) return 0;
  return Math.min(clamp((t - t0) / fin), clamp((t0 + d - t) / fout));
}
/** 确定性伪随机（逐帧渲染必须可复现） */
export function rand(i, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
