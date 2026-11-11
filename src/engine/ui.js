// 叠加层通用小件：文字宽度估算、胶囊标签、面板
import { THEME } from '../config/theme.js';
import { esc } from '../art/svg.js';

export const HUD = THEME.hud, OUT = THEME.crab.outline, FONT = THEME.font;
// 彩色底上的文字：卡通/剪纸 用 HUD.text，导航风（白面板）彩色底时用白字
const onFill = (fill) => (!fill || fill === HUD.panel ? HUD.text : fill === HUD.card || fill === '#fff' || fill === '#FFFFFF' ? HUD.ink : '#FFFFFF');
export const LINE = THEME.key === 'navi' ? 'rgba(31,45,61,.35)' : OUT;   // 引线颜色
export const f = (n) => Math.round(n * 10) / 10;

/** 粗略文字宽度（中文 1em、ASCII 0.58em） */
export function textW(s, fs) {
  let w = 0;
  for (const ch of String(s)) w += ch.charCodeAt(0) < 128 ? 0.58 : 1.0;
  return w * fs;
}

export function pill(x, y, text, o = {}) {
  const fs = o.fs ?? 26, pad = o.pad ?? 18, h = o.h ?? fs * 1.7;
  const w = textW(text, fs) + pad * 2;
  const x0 = o.anchor === 'start' ? x : o.anchor === 'end' ? x - w : x - w / 2;
  return `<rect x="${f(x0)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${o.fill ?? HUD.panel}" stroke="${o.stroke ?? HUD.stroke}" stroke-width="${o.sw ?? 3}"/>` +
    `<text x="${f(x0 + w / 2)}" y="${f(y + fs * 0.36)}" text-anchor="middle" font-family="${o.font ?? FONT.cn}" font-weight="${o.weight ?? 700}" font-size="${fs}" fill="${o.color ?? onFill(o.fill)}">${esc(text)}</text>`;
}
export const pillW = (text, fs = 26, pad = 18) => textW(text, fs) + pad * 2;

/** 包一层变换与透明度；透明度≈0 时直接省略 */
export function grp(transform, inner, op = 1, attrs = '') {
  if (op <= 0.002 || !inner) return '';
  return `<g transform="${transform}"${attrs}${op < 0.999 ? ` opacity="${op.toFixed(3)}"` : ''}>${inner}</g>`;
}
export const T = (x, y, s = 1, r = 0) => `translate(${f(x)} ${f(y)})${r ? ` rotate(${f(r)})` : ''}${Math.abs(s - 1) > 0.001 ? ` scale(${s.toFixed(3)})` : ''}`;

/** 圆角面板 */
export function panel(x, y, w, h, o = {}) {
  return `<rect x="${f(x + 5)}" y="${f(y + 7)}" width="${f(w)}" height="${f(h)}" rx="${o.r ?? 22}" fill="${HUD.shadow}"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${o.r ?? 22}" fill="${o.fill ?? HUD.panel}" stroke="${o.stroke ?? HUD.stroke}" stroke-width="${o.sw ?? 4}"/>`;
}

/** 警示三角（不依赖字体里的 ⚠） */
export function warnTri(s = 1) {
  return `<g transform="scale(${s})"><path d="M 0 -17 L 17 13 L -17 13 Z" fill="#FFC83D" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/><path d="M 0 -6 V 3" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="8.5" r="2.3" fill="${OUT}"/></g>`;
}

/**
 * 叠加层收集器：每个图元带一个“离相机多远”的深度键。
 *   · 不做深度排序的层（地面贴花、路名、贴纸卡、屏幕特效）直接 push，z 默认最远 ⇒ 保持插入顺序；
 *   · 要参与三维遮挡的层（公里牌、补给卡、折返牌、螃蟹、拱门）push 时给 z，渲染前按 z 从远到近排一次。
 *   · hit 是“这个图元钉在地图上的那个点”，供深度探针判断它是否被大桥/楼/树挡在后面。
 *     hit = null ⇒ 不做场景遮挡测试（屏幕固定件、角色本体）。
 */
export class Layer {
  constructor() { this.items = []; }
  push(s, z = Infinity, hit = null) { this.items.push({ s, z, hit }); return this; }
  get size() { return this.items.length; }
  sortFar() { this.items.sort((a, b) => b.z - a.z); return this; }
  toString() { return this.items.map((i) => i.s).join(''); }
}
/** 展开成 push 的 (z, hit) 两个参数：out.push(svg, ...Z(p)) */
export const Z = (p, hit = true) => (hit ? [p.d, { x: p.x, y: p.y, z: p.z }] : [p.d, null]);
