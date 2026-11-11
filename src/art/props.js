// 起终点拱门 / 分区牌 / 发枪波纹 —— 本片做“简化表达”的充气拱门
// 拱门本地坐标：地面中点为原点，宽 400（两柱外沿 ±200），高约 300
import { THEME, RACE_META } from '../config/theme.js';

const O = THEME.crab.outline;
const BLUE = '#1A6FD8', BLUE_L = '#4FA3FF', BLUE_D = '#0F4C9E';
const GOLD = '#FFC83D';

export function archDefs() {
  return `<linearGradient id="ar-post" x1="0" x2="1"><stop offset="0" stop-color="${BLUE_D}"/><stop offset=".35" stop-color="${BLUE_L}"/><stop offset=".7" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_D}"/></linearGradient>` +
    `<linearGradient id="ar-beam" y1="0" y2="1" x1="0" x2="0"><stop offset="0" stop-color="${BLUE_L}"/><stop offset=".55" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_D}"/></linearGradient>`;
}

/** part: 'back' = 柱子后半 + 横梁（画在螃蟹后面）；'front' = 柱子前沿（画在螃蟹前面）；'all' */
export function archSVG({ label = '起点 START', part = 'all', time = '', bare = false } = {}) {
  let s = '';
  if (part !== 'front') {
    // 柱
    for (const sx of [-1, 1]) {
      const x = sx * 172;
      s += `<path d="M ${x - 28} 0 V -236 Q ${x - 28} -262 ${x} -262 Q ${x + 28} -262 ${x + 28} -236 V 0 Z" fill="url(#ar-post)" stroke="${O}" stroke-width="5"/>`;
      for (let y = -200; y > -250; y -= 48) s += `<path d="M ${x - 27} ${y} q 27 7 54 0" fill="none" stroke="${BLUE_D}" stroke-width="3" opacity=".6"/>`;
      s += `<path d="M ${x - 14} -40 V -228" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>`;
      s += `<rect x="${x - 30}" y="-16" width="60" height="16" rx="5" fill="${BLUE_D}" stroke="${O}" stroke-width="4"/>`;
    }
    // 横梁（充气圆筒）
    s += `<rect x="-206" y="-312" width="412" height="82" rx="41" fill="url(#ar-beam)" stroke="${O}" stroke-width="5.5"/>`;
    s += `<path d="M -170 -298 H 170" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".35"/>`;
    // bare = HUD 标题卡在的时候：只去掉“会重复的赛事名”，
    // 起点/终点这块小吊牌必须留着（它说明的是“这是哪个门”，标题卡并不提供这个信息）
    if (!bare) {
      // 客户 2026-11-06：横梁上的字换成官方给的**字条图**（mainset/arch-white.png，1627×277，白字透明底）。
      //   横梁 −206..206、两端 41 圆角 ⇒ 可用的平直宽度 ~330 设计单位；字条按 5.874:1 缩到 330×56 居中，
      //   垂直居中在横梁中线 −271（梁 −312..−230）。没有素材时回落到原来的两行白字。
      const logo = (typeof globalThis !== 'undefined' && globalThis.__ASSETS && globalThis.__ASSETS.archLogo) || '';
      if (logo) {
        s += `<image href="${logo}" x="-165" y="-299" width="330" height="56" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        s += `<text x="0" y="-266" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="19" fill="#fff" letter-spacing=".5">${RACE_META.brand}</text>`;
        s += `<text x="0" y="-238" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="12.5" fill="#CFE6FF" letter-spacing="2.4">${RACE_META.en}</text>`;
      }
    }
    // 吊牌（永远画）
    s += `<path d="M -60 -230 V -212 M 60 -230 V -212" stroke="${O}" stroke-width="4"/>`;
    {
      const lw = Math.max(170, label.length * 26 + 40);
      s += `<rect x="${-lw / 2}" y="-214" width="${lw}" height="50" rx="12" fill="${GOLD}" stroke="${O}" stroke-width="4.5"/>`;
      s += `<text x="0" y="-180" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="30" fill="${O}">${label}</text>`;
    }
    if (time) s += `<g transform="translate(0 -136)"><rect x="-70" y="-22" width="140" height="44" rx="10" fill="#14284A" stroke="#fff" stroke-width="3"/><text x="0" y="11" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="30" fill="#7CFFB0">${time}</text></g>`;
  }
  if (part !== 'back') {
    // 柱子前沿的一道高光描边，制造“螃蟹从门里穿过”的前后关系
    for (const sx of [-1, 1]) {
      const x = sx * 172;
      s += `<path d="M ${x - 28} -2 V -120" stroke="${O}" stroke-width="5"/><path d="M ${x + 28} -2 V -120" stroke="${O}" stroke-width="5"/>`;
    }
  }
  return s;
}

/** 分区牌：A/B 第一枪（金），C 第二枪（青）。active: 'AB' | 'C' | '' 当前发枪的那组放大高亮 */
export function zoneBoards({ active = '', pop = 1 } = {}) {
  const Z = [
    { k: 'A', x: -130, c: '#F2453D', g: 1 },
    { k: 'B', x: 0, c: '#1A6FD8', g: 1 },
    { k: 'C', x: 130, c: '#16A88C', g: 2 },
  ];
  let s = '';
  for (const z of Z) {
    const on = (active === 'AB' && z.g === 1) || (active === 'C' && z.g === 2);
    const sc = (on ? 1.18 : 1) * pop;
    s += `<g transform="translate(${z.x} 0) scale(${sc.toFixed(3)})">` +
      `<path d="M 0 6 V 50" stroke="${O}" stroke-width="7"/>` +
      `<rect x="-50" y="-72" width="100" height="112" rx="16" fill="${O}"/><rect x="-46" y="-68" width="92" height="104" rx="13" fill="${z.c}"/><rect x="-40" y="8" width="80" height="26" rx="8" fill="#fff"/>` +
      `<path d="M -36 -60 h 50" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>` +
      `<text x="0" y="-14" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="50" fill="#fff">${z.k}</text>` +
      `<text x="0" y="28" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="18" fill="${O}">${z.g === 1 ? '第一枪' : '第二枪'}</text>` +
      (on ? `<rect x="-52" y="-74" width="104" height="116" rx="17" fill="none" stroke="${GOLD}" stroke-width="5"/>` : '') +
      `</g>`;
  }
  return s;
}

/** 发枪波纹：k = 0..1 */
export function gunRipple(k, color = '#FFC83D') {
  let s = '';
  for (let i = 0; i < 3; i++) {
    const t = k - i * 0.16;
    if (t <= 0 || t >= 1) continue;
    const r = 30 + t * 320, a = (1 - t) * 0.9;
    s += `<ellipse rx="${r.toFixed(1)}" ry="${(r * 0.42).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(10 * (1 - t) + 2).toFixed(1)}" opacity="${a.toFixed(2)}"/>`;
  }
  return s;
}
