// 功能点图标 / 公里牌 / 折返牌 / 体力心 / 等级章 —— 均为以 (0,0) 为中心的 SVG 片段
// 三套画风各有一套图标做法：A 描边徽章 / B 导航白片 / C 剪纸纸盘（靠 THEME.key 切换，不用改调用处）
import { THEME } from '../config/theme.js';

const O = THEME.crab.outline;
const C = THEME.station;
const W = '#fff';
const H = THEME.hud;
const ST = THEME.key;
const NAVI = ST === 'navi', PAPER = ST === 'papercut';

// 剪纸圆边：沿圆周剪出的小波浪（n 个齿，齿高 d）
function scallopCircle(r, n = 16, d = 2.8) {
  let p = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const cx = Math.cos(am) * (r + d), cy = Math.sin(am) * (r + d);
    const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
    p += `${i ? ' Q ' : 'M '}${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return p + ' Z';
}

// 与官方图例一一对应（名称照官方图例）
export const STATION_TYPES = {
  timing: { name: '计时点', color: C.timing },
  medical: { name: '医疗点', color: C.medical },
  drink: { name: '饮料站', color: C.drink },
  water: { name: '饮水站', color: C.water },
  sponge: { name: '用水站', color: C.sponge },
  food: { name: '食品补给站', color: C.food },
  wc: { name: '洗手间', color: C.wc },
};

const GLYPH = {
  timing: `<circle cx="0" cy="3" r="12.5" fill="none" stroke="${W}" stroke-width="4"/><rect x="-4" y="-17" width="8" height="6" rx="1.5" fill="${W}"/><path d="M 0 3 L 0 -5" stroke="${W}" stroke-width="3.6" stroke-linecap="round"/><path d="M 9 -9 l 3 -3" stroke="${W}" stroke-width="3.6" stroke-linecap="round"/>`,
  medical: `<path d="M -5.5 -15 h 11 v 9.5 h 9.5 v 11 h -9.5 v 9.5 h -11 v -9.5 h -9.5 v -11 h 9.5 z" fill="${W}"/>`,
  drink: `<path d="M -10 -8 L 10 -8 L 7 15 L -7 15 Z" fill="none" stroke="${W}" stroke-width="3.6" stroke-linejoin="round"/><path d="M -8.6 3 q 4.3 -3 8.6 0 t 8.6 0" fill="none" stroke="${W}" stroke-width="3"/><path d="M 2 -8 L 6 -18 l 4 0" fill="none" stroke="${W}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  water: `<path d="M 0 -16 C 8 -5 11 1 11 6 A 11 11 0 0 1 -11 6 C -11 1 -8 -5 0 -16 Z" fill="none" stroke="${W}" stroke-width="3.8" stroke-linejoin="round"/><path d="M -4 6 a 4.5 4.5 0 0 0 4.5 4.5" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round"/>`,
  sponge: `<rect x="-15" y="-14" width="30" height="17" rx="8" fill="${W}"/><circle cx="-7" cy="-7" r="2.2" fill="${C.sponge}"/><circle cx="1" cy="-9" r="1.8" fill="${C.sponge}"/><circle cx="7" cy="-4" r="2.2" fill="${C.sponge}"/><circle cx="-1" cy="-3" r="1.6" fill="${C.sponge}"/><path d="M -5 7 c 2.5 3 3 5 0 7 c -3 -2 -2.5 -4 0 -7 Z M 5 7 c 2.5 3 3 5 0 7 c -3 -2 -2.5 -4 0 -7 Z" fill="${W}"/>`,
  food: `<path d="M -15 -1 C -10 13 10 15 16 -8 C 13 -6 11 -2 9 1 C 4 8 -6 9 -15 -1 Z" fill="${W}"/><path d="M -13 -8 C -8 3 6 4 12 -10 C 9 -9 7 -7 5 -5 C 1 -1 -6 0 -13 -8 Z" fill="${W}"/><path d="M 12 -10 l 3 -6" stroke="${W}" stroke-width="3.4" stroke-linecap="round"/>`,
  wc: `<text x="0" y="8.5" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="22" fill="${W}" letter-spacing="-1">WC</text>`,
};

/** 功能点圆章（r≈30） */
export function stationIcon(type) {
  const c = STATION_TYPES[type].color;
  const g = `<g transform="scale(.82)">${GLYPH[type]}</g>`;
  if (NAVI) {
    // 导航风：白片 + 柔和落影 + 彩色实心圆 + 顶部高光（无黑描边）
    return `<circle cy="3" r="27" fill="rgba(30,50,90,.18)"/>` +
      `<circle r="26" fill="#FFFFFF"/><circle r="21" fill="${c}"/>` +
      `<path d="M -15 -9 a 19 19 0 0 1 19 -10" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".5"/>` + g;
  }
  if (PAPER) {
    // 剪纸风：深红纸盘 + 米白衬纸 + 彩色纸盘 + 剪口波浪边
    return `<path d="${scallopCircle(29.5)}" transform="translate(2.5 3)" fill="rgba(60,15,10,.32)"/>` +
      `<path d="${scallopCircle(29.5)}" fill="${H.panel}"/>` +
      `<circle r="25" fill="${H.card}"/><circle r="20.5" fill="${c}"/>` +
      `<circle r="20.5" fill="none" stroke="${H.card}" stroke-width="1.6" stroke-dasharray="3 5" opacity=".55"/>` + g;
  }
  // 卡通风：深色描边 + 白圈 + 彩色徽章
  return `<circle r="30" fill="${O}"/><circle r="27" fill="${W}"/><circle r="23.5" fill="${c}"/>` +
    `<path d="M -16 -12 a 20 20 0 0 1 22 -10" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" opacity=".35"/>` + g;
}

/** 功能点弹出卡（横排图标的底板）：宽 width，高 76，中心对齐 */
export function stationCard(width) {
  const w = width + 16;
  if (NAVI) return `<rect x="${-w / 2}" y="-32" width="${w}" height="76" rx="30" fill="rgba(30,50,90,.14)"/>` +
    `<rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="30" fill="rgba(255,255,255,.97)"/>`;
  if (PAPER) return `<rect x="${-w / 2 + 3}" y="-35" width="${w}" height="76" rx="6" fill="rgba(60,15,10,.3)"/>` +
    `<rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="6" fill="${H.panel}"/>` +
    `<rect x="${-w / 2 + 5}" y="-33" width="${w - 10}" height="66" rx="3" fill="${H.card}"/>`;
  return `<rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="38" fill="rgba(255,255,255,.96)" stroke="${O}" stroke-width="4"/>`;
}

/** 一组功能点图标横排（中心对齐），返回 {svg, width} */
export function stationRow(types, gap = 64) {
  const w = (types.length - 1) * gap;
  return { svg: types.map((t, i) => `<g transform="translate(${-w / 2 + i * gap} 0)">${stationIcon(t)}</g>`).join(''), width: w + 64 };
}

/** 公里牌：蓝底白字（沿用官方圆标的样式，加游戏感描边）；color 可传半马粉 */
export function kmBadge(km, color = THEME.route.full) {
  const t = String(km).padStart(2, '0');
  const txt = `<text x="0" y="7.6" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="${t.length > 2 ? 15 : 21}" fill="${W}">${t}</text>`;
  if (NAVI) {
    return `<circle cy="2.5" r="24" fill="rgba(30,50,90,.22)"/><circle r="23" fill="#FFFFFF"/>` +
      `<circle r="19" fill="${color}"/>` +
      `<path d="M -11 -8 a 15 15 0 0 1 15 -8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>` + txt;
  }
  if (PAPER) {
    return `<path d="${scallopCircle(24.5, 14, 2.4)}" transform="translate(2 2.5)" fill="rgba(60,15,10,.32)"/>` +
      `<path d="${scallopCircle(24.5, 14, 2.4)}" fill="${H.panel}"/><circle r="20.5" fill="${H.card}"/>` +
      `<circle r="18" fill="${color}"/>` + txt;
  }
  return `<circle r="25" fill="${O}"/><circle r="22.5" fill="${W}"/><circle r="19" fill="${color}"/>` + txt;
}

/** 折返牌：菱形路牌 + 掉头箭头，下挂文字牌 */
export function uturnSign(label) {
  const pole = NAVI ? '#9AA9B8' : O;
  const ring = NAVI ? '#FFFFFF' : PAPER ? H.panel : O;
  const face = NAVI ? '#FFB020' : PAPER ? H.card : '#FFC83D';
  const ink = NAVI ? '#1F2D3D' : PAPER ? H.panel : O;
  const shadow = NAVI ? `<rect x="-46" y="-42" width="92" height="92" rx="11" transform="rotate(45) translate(3 3)" fill="rgba(30,50,90,.16)"/>` : '';
  return `<path d="M 0 -150 V -10" stroke="${pole}" stroke-width="9" stroke-linecap="round"/><path d="M 0 -150 V -10" stroke="#9AA9B8" stroke-width="5" stroke-linecap="round"/>` +
    `<g transform="translate(0 -168)">${shadow}<rect x="-50" y="-50" width="100" height="100" rx="14" transform="rotate(45)" fill="${ring}"/><rect x="-45" y="-45" width="90" height="90" rx="11" transform="rotate(45)" fill="${face}"/>` +
    `<path d="M -14 26 V -6 A 14 14 0 0 1 14 -6 V 8" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round"/><path d="M 2 4 L 14 20 L 26 4 Z" fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/></g>` +
    (label ? `<g transform="translate(0 -78)"><rect x="-${label.length * 14 + 18}" y="-22" width="${label.length * 28 + 36}" height="44" rx="12" fill="${THEME.hud.panel}" stroke="${W}" stroke-width="3.5"/><text x="0" y="10" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="28" fill="${W}">${label}</text></g>` : '');
}

/** 体力心 */
export function heart(full = true, color = THEME.hud.red) {
  const d = 'M 0 9 C -14 0 -14 -12 -7 -12 C -3 -12 -1 -9 0 -7 C 1 -9 3 -12 7 -12 C 14 -12 14 0 0 9 Z';
  return `<path d="${d}" transform="scale(1.25)" fill="${full ? color : '#3B4D6B'}" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>` +
    (full ? `<path d="M -9 -8 q 2 -3 5 -2" transform="scale(1.25)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>` : '');
}

/** 等级章 */
export function levelBadge(lv, color) {
  return `<path d="M 0 -20 L 17 -10 L 17 10 L 0 20 L -17 10 L -17 -10 Z" fill="${O}"/><path d="M 0 -16.5 L 14 -8.3 L 14 8.3 L 0 16.5 L -14 8.3 L -14 -8.3 Z" fill="${color}"/>` +
    `<text x="0" y="7" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="19" fill="#fff">${lv}</text>`;
}

/** 加油：起跑枪（小图标） */
export function gunIcon() {
  return `<path d="M -22 -8 H 18 V 4 H -4 L -10 18 H -20 L -16 4 H -22 Z" fill="${THEME.hud.panel}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="-2" r="5" fill="#FFC83D"/>`;
}
