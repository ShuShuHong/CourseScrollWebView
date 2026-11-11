// 屏幕层 HUD（1920×1080 设计坐标）：品牌、图例、体力、字幕、信息卡、海拔窗、进度条、加载、片尾
// 颜色全部取 THEME.hud：卡通 = 藏青面板白字；导航 = 白面板深字；剪纸 = 红纸面板米字
import { THEME, BRAND, RACE_META } from '../config/theme.js';
import { ELEV_MODE, ELEV_WIN, BRIDGE_ELEV, ENDCARD_T } from '../config/story.js';
import { crabSVG } from '../art/crab.js';
import { crabIcon, hasSprites } from '../art/sprites.js';
import { endcardSVG, hasEndcard } from '../art/endcard.js';
import { heart, levelBadge } from '../art/icons.js';
import { easeOutBack, clamp, smooth, esc } from '../art/svg.js';
import { COURSE } from './course.js';
import { activeEvents, subtitleAt, cardsAt, DURATION } from './timeline.js';
import { pill, textW, grp, T, f, OUT, HUD, FONT, panel } from './ui.js';

const R = THEME.route;
const W = 1920, H = 1080;
const NAVI = THEME.key === 'navi', PAPER = THEME.key === 'papercut';
const colorOf = (c) => (c === 'half' ? R.half : c === 'full' ? R.full : NAVI ? R.full : HUD.panel);
const TXT = HUD.text, SUB = HUD.sub;
const SUBBG = HUD.card;                          // 字幕条底色
const SUBLINE = NAVI ? 'none' : OUT;             // 字幕条描边

/** 角色头像：有位图用位图，否则退回矢量 */
function face(sex, stage, mood, size) {
  if (hasSprites()) return crabIcon(sex, stage, mood, size);
  return `<g transform="scale(${(size / 220).toFixed(3)})">${crabSVG({ sex, stage, mood, still: true, ring: false })}</g>`;
}

// ── 海拔：路线本身用官方 AI 路线图的剖面（每公里一点，2–20m）；桥面另画一条虚线到 26m
const PROF = COURSE.elevation.profile;
const ELEV = ELEV_MODE === 'script' ? PROF.map((v) => 4 + (v - 2) * (22 / 18)) : PROF;
// 官方剖面最高 20m，但桥面虚线要上到 26m ⇒ 纵轴留出余量（否则虚线会被裁掉）
const E_MAX = ELEV_MODE === 'script' ? 32 : 32;   // 留余量：桥面 26m 的虚线不能被裁掉，也不能顶到标题
const E_GRID = ELEV_MODE === 'script' ? [0, 10, 20, 30] : [0, 10, 20];
const E_LABEL = ELEV_MODE === 'script' ? { hi: '最高点', lo: '最低点' } : { hi: '最高点', lo: '湖面' };
const BR = COURSE.bridge || {};
const BR_RANGES = [BR.pass1_km, BR.pass2_km].filter(Boolean);
const elevAt = (km) => { const i = Math.min(41, Math.floor(km)), t = km - i; return ELEV[i] + (ELEV[i + 1] - ELEV[i]) * t; };

function brand() {
  const fill = NAVI ? R.full : HUD.panel;
  return `<g transform="translate(46 40)"><rect x="4" y="6" width="452" height="64" rx="${PAPER ? 8 : 32}" fill="${HUD.shadow}"/><rect width="452" height="64" rx="${PAPER ? 8 : 32}" fill="${fill}" stroke="${HUD.stroke}" stroke-width="4"/>` +
    `<text x="226" y="41" text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="24" letter-spacing=".3" fill="${NAVI ? '#fff' : TXT}">${BRAND}</text></g>`;
}
function legend(dimHalf) {
  const row = (y, c, t, op = 1) => `<g transform="translate(0 ${y})" opacity="${op}"><path d="M 0 0 H 52" stroke="${R.edge}" stroke-width="14" stroke-linecap="round"/><path d="M 0 0 H 52" stroke="${c}" stroke-width="8" stroke-linecap="round"/><text x="68" y="10" font-family="${FONT.cn}" font-weight="700" font-size="26" fill="${TXT}">${t}</text></g>`;
  return `<g transform="translate(${W - 352} 40)">${panel(0, 0, 306, 108, { r: PAPER ? 8 : 20 })}<g transform="translate(26 34)">${row(0, R.full, '全马 42.195km')}${row(40, R.half, '半马 21.0975km', dimHalf ? 0.45 : 1)}</g></g>`;
}
function hpBlock(x, y, who, n, stage, flash, op = 1) {
  const sex = who === 'male' ? 'm' : 'f', c = who === 'male' ? R.full : R.half;
  let s = `<g transform="translate(${x} ${y})" opacity="${op}">${panel(0, 0, 300, 70, { r: PAPER ? 8 : 35, sw: 3.5 })}`;
  s += `<g transform="translate(40 66)">${face(sex, stage, 'run', 62)}</g>`;
  s += `<g transform="translate(92 35) scale(.8)">${levelBadge(stage + 1, c)}</g>`;
  for (let i = 0; i < 5; i++) {
    const lost = i >= n, fl = lost && i === n && flash > 0;
    s += `<g transform="translate(${130 + i * 34} 36) scale(${fl ? 1 + flash * 0.5 : 0.95})">${heart(!lost || fl, fl ? '#fff' : HUD.red)}</g>`;
  }
  return s + '</g>';
}

function subtitle(t) {
  let s = '';
  for (const sub of subtitleAt(t)) {
    const k = clamp(sub.dt / 0.25), op = Math.min(k, clamp(sub.rem / 0.25));
    let fs = 50; while (textW(sub.text, fs) > 1500 && fs > 34) fs -= 2;
    const w = textW(sub.text, fs) + 90, y = 940;
    const c = colorOf(sub.color);
    const rx = PAPER ? 10 : 44;
    let g = `<rect x="${f(-w / 2 + 6)}" y="${f(-44 + 8)}" width="${f(w)}" height="88" rx="${rx}" fill="${HUD.shadow}"/>` +
      `<rect x="${f(-w / 2)}" y="-44" width="${f(w)}" height="88" rx="${rx}" fill="${SUBBG}" stroke="${PAPER ? HUD.panel : SUBLINE}" stroke-width="${NAVI ? 0 : 5}"/>` +
      `<rect x="${f(-w / 2 + 14)}" y="-30" width="18" height="60" rx="${PAPER ? 3 : 9}" fill="${c}"/>` +
      `<text x="12" y="${f(fs * 0.36)}" text-anchor="middle" font-family="${FONT.cn}" font-weight="700" font-size="${fs}" fill="${HUD.ink}">${esc(sub.text)}</text>`;
    if (sub.tag) g += `<g transform="translate(${f(w / 2 - 30)} -54) rotate(${NAVI ? 0 : 4})">${pill(0, 0, sub.tag, { fs: 28, fill: HUD.gold, color: PAPER ? HUD.ink : NAVI ? '#fff' : OUT, stroke: NAVI ? '#fff' : PAPER ? HUD.card : OUT, sw: 3.5, anchor: 'end' })}</g>`;
    s += grp(T(W / 2, y + (1 - easeOutBack(k)) * 30), g, op);
  }
  return s;
}

function cards(t, st) {
  let s = '';
  for (const c of cardsAt(t)) {
    const kin = smooth(clamp(c.dt / 0.5)), kout = smooth(clamp(c.rem / 0.35));
    const k = Math.min(kin, kout), op = k;
    const col = colorOf(c.color);
    if (c.kind === 'summary') { s += summary(c, k, op, st); continue; }
    const fs = 30, lw = Math.max(textW(c.title, 40) + 70, ...c.lines.map((l) => textW(l, fs) + 90));
    const h = 92 + c.lines.length * 46, r = PAPER ? 8 : 22;
    // 右侧信息卡默认下移到 500：右上角 186–472 是地标照片卡的固定站位（卡片放大后的口径），
    // 两者时间上确实会重叠（起跑分区卡 3.1–7.0s vs 博物馆卡 3.4–6.0s），只能错开
    const x = c.side === 'left' ? 46 : W - lw - 46, y = c.y !== undefined ? c.y : (c.side === 'left' ? 250 : 500);
    let g = panel(0, 0, lw, h, { r }) + `<rect x="0" y="0" width="${f(lw)}" height="70" rx="${r}" fill="${col}"/><rect x="0" y="48" width="${f(lw)}" height="22" fill="${col}"/>` +
      `<rect x="0" y="0" width="${f(lw)}" height="${h}" rx="${r}" fill="none" stroke="${HUD.stroke}" stroke-width="4"/>` +
      `<text x="34" y="50" font-family="${c.title.match(/^\d/) ? FONT.num : FONT.title}" font-weight="900" font-size="40" fill="#fff">${esc(c.title)}</text>`;
    c.lines.forEach((l, i) => {
      const li = clamp((c.dt - 0.25 - i * 0.18) / 0.25);
      g += grp(T(34 + (1 - li) * 30, 116 + i * 46), `<circle cx="0" cy="-10" r="7" fill="${HUD.gold}"/><text x="20" y="0" font-family="${FONT.cn}" font-weight="700" font-size="${fs}" fill="${TXT}">${esc(l)}</text>`, li);
    });
    s += grp(T(x + lw / 2, y + h / 2 + (1 - kin) * 40) + ` translate(${f(-lw / 2)} ${f(-h / 2)})`, g, op);
  }
  return s;
}

function summary(c, k, op, st) {
  const w = 1000, h = 540, x = (W - w) / 2, y = 140;
  let g = `<rect x="-${W}" y="-${H}" width="${W * 3}" height="${H * 3}" fill="${NAVI ? '#1F2D3D' : '#0B2440'}" opacity="${NAVI ? 0.25 : 0.45}"/>`;
  g += panel(x, y, w, h, { r: PAPER ? 10 : 34, sw: 5 });
  g += `<text x="${W / 2}" y="${y + 78}" text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="54" fill="${NAVI ? R.full : HUD.gold}">${esc(c.title)}</text>`;
  const [m, fm, ...rest] = c.lines;
  // 头像跟角色当前形态走：公蟹在口播"蟹王蟹后解锁"(L40)之前还没戴冠，卡上也不能先戴
  const stageOf = (sex) => (st && st[sex === 'm' ? 'male' : 'female'] ? st[sex === 'm' ? 'male' : 'female'].stage : 2);
  const moodOf = (sex) => (stageOf(sex) >= 2 ? 'win' : 'run');
  const big = (cx, label, color, sex) => `<g transform="translate(${cx} ${y + 290})">${face(sex, stageOf(sex), moodOf(sex), 190)}` +
    `<g transform="translate(0 40)">${pill(0, 0, label, { fs: 34, fill: color, sw: 4, font: FONT.cn, color: '#fff' })}</g></g>`;
  g += big(W / 2 - 220, fm, R.half, 'f') + big(W / 2 + 220, m, R.full, 'm');   // 母左公右
  rest.forEach((l, i) => { g += `<text x="${W / 2}" y="${y + 398 + i * 46}" text-anchor="middle" font-family="${FONT.cn}" font-weight="700" font-size="32" fill="${TXT}">${esc(l)}</text>`; });
  return grp(T(W / 2, H / 2, 0.6 + 0.4 * k) + ` translate(${-W / 2} ${-H / 2})`, g, op * clamp(k * 2));
}

function elevWin(t, mk) {
  // 常驻：片头（加载条还在）与片尾题字之外，左下角一直挂着；进出各 0.45s 柔和上滑
  // 客户 2026-10-27 口径：整块再往左下压到 x=12 / y=750，压在同一条字幕之下（字幕长句会盖住它右下角）
  const kin = smooth(clamp((t - ELEV_WIN.t0) / 0.45));
  const kout = smooth(clamp((ELEV_WIN.t1 - t) / 0.45));
  const k = Math.min(kin, kout);
  if (k <= 0.001) return '';
  return grp(T(12, 750 + (1 - k) * 300), `<g data-elev="1">${elevPanel(mk, t)}</g>`, k);
}
/** 海拔小窗本体（580×240），设定集也直接调用
 *  排版原则（终版）：图上不放任何文字，全部收进顶部一行图例；图里只有线、点、条。
 *  低点在左侧坐标轴上钉一个绿色三角 + 一条极淡的值线，保证“湖面 2m”始终在图里有对应物。 */
export function elevPanel(mk, t = -1) {
  const w = 580, h = 240;
  const px = (km) => 60 + km / 42.195 * (w - 90), py = (m) => h - 46 - m / E_MAX * (h - 110);
  const grid = NAVI ? 'rgba(31,45,61,.12)' : 'rgba(255,255,255,.16)';
  const curve = NAVI ? R.full : PAPER ? HUD.gold : '#6FC2FF';
  const done = NAVI ? '#FF8A3D' : HUD.gold;
  const iHi = ELEV.indexOf(Math.max(...ELEV)), iLo = ELEV.indexOf(Math.min(...ELEV));
  const y26 = py(BRIDGE_ELEV.deck), yHi = py(ELEV[iHi]), yLo = py(ELEV[iLo]);
  let g = panel(0, 0, w, h, { r: PAPER ? 8 : 20 });

  // ── 标题 + 图例
  g += `<text x="22" y="40" font-family="${FONT.title}" font-weight="700" font-size="26" fill="${TXT}">海拔剖面</text>`;
  {
    let x = 22 + textW('海拔剖面', 26) + 22;
    const yb = 39;
    const mast = (color) => `<path d="M ${f(x + 1)} ${f(yb - 1)} Q ${f(x + 7)} ${f(yb - 18)} ${f(x + 13)} ${f(yb - 1)}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 2"/>`;
    // 客户 2026-11-03 ③：图例只留一条 —— 最高点就是桥面，不把“最高点 / 湖面”拆成两个色点
    const items = [[mast(HUD.red), `${E_LABEL.hi}：桥面 ${BRIDGE_ELEV.deck}m`]];
    for (const [glyph, label] of items) {
      g += glyph + `<text x="${f(x + 17)}" y="${yb}" font-family="${FONT.cn}" font-weight="700" font-size="16" fill="${TXT}">${label}</text>`;
      x += 17 + textW(label, 16) + 18;
    }
  }
  // 数据出处：挪到卡片**左下角**（客户 2026-10-27 口径）——右下角会被同期的长句字幕压住
  g += `<text x="22" y="${h - 9}" font-family="${FONT.cn}" font-weight="500" font-size="13" fill="${SUB}">官方路线图 · 1985 国家高程基准</text>`;

  // ── 网格 0/10/20（26 只在图例里交代，不再塞进刻度）
  for (const m of E_GRID) {
    g += `<path d="M 60 ${f(py(m))} H ${w - 30}" stroke="${grid}" stroke-width="2"/>`;
    g += `<text x="50" y="${f(py(m) + 7)}" text-anchor="end" font-family="${FONT.num}" font-weight="900" font-size="18" fill="${SUB}">${m}</text>`;
  }
  // 低点值线（极淡）+ 轴向绿三角：图例“湖面 2m”的落点
  g += `<path d="M 60 ${f(yLo)} H ${w - 30}" stroke="${HUD.green}" stroke-width="1.6" stroke-dasharray="2 8" opacity=".45"/>`;
  g += `<path d="M 60 ${f(yLo)} l -9 -5 v 10 Z" fill="${HUD.green}" stroke="#fff" stroke-width="1.6"/>`;

  // ── 剖面（官方数据）+ 已跑过的同一路径裁剪
  let line = '', area = `M ${f(px(0))} ${f(py(0))}`;
  for (let km = 0; km <= 42.195; km += 0.25) {
    const pt = `${f(px(km))} ${f(py(elevAt(km)))}`;
    line += (line ? ' L ' : 'M ') + pt; area += ' L ' + pt;
  }
  area += ` L ${f(px(42.195))} ${f(py(0))} Z`;
  g += `<path d="${area}" fill="${curve}" fill-opacity="${NAVI ? 0.18 : 0.32}"/><path d="${line}" fill="none" stroke="${curve}" stroke-width="4" stroke-linejoin="round"/>`;
  const cut = Math.max(0, Math.min(42.195, mk));
  const cid = 'ev-clip-' + Math.round(cut * 100);
  g += `<clipPath id="${cid}"><rect x="0" y="0" width="${f(px(cut))}" height="${h}"/></clipPath><path d="${line}" clip-path="url(#${cid})" fill="none" stroke="${done}" stroke-width="5.5" stroke-linejoin="round"/>`;

  // ── 桥面 26m：两条虚线**引桥弧**（客户 2026-10-27 口径）
  //    上桥 8.0 / 下桥 8.54（第二座 18.31–18.85），弧的两脚就压在这两个里程上；
  //    形状要“像两个尖峰”而不是宽而圆的正弦 ⇒ 指数压到 0.30，横向几乎不夸张
  //    （真实 0.54 km 在这张 42 km 横轴上只有 6 px，再宽就与公里轴对不上了）。
  const DECK = BRIDGE_ELEV.deck;
  const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.pow(Math.sin(Math.PI * u), 0.30));
  const deckM = (km) => {
    for (const [k0, k1] of BR_RANGES) {
      if (km >= k0 && km <= k1) return elevAt(km) + (DECK - elevAt(km)) * bump((km - k0) / (k1 - k0));
    }
    return elevAt(km);
  };
  const bridgeOf = (km) => BR_RANGES.find(([k0, k1]) => km >= k0 && km <= k1) || null;
  for (const [k0, k1] of BR_RANGES) {
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const km = k0 + (k1 - k0) * (i / 32);
      pts.push(`${f(px(km))} ${f(py(deckM(km)))}`);
    }
    const d = 'M ' + pts.join(' L ');
    g += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-dasharray="5 4" stroke-linecap="round" opacity=".9"/>`;
    g += `<path d="${d}" fill="none" stroke="${HUD.red}" stroke-width="2.6" stroke-dasharray="5 4" stroke-linecap="round"/>`;
    g += `<circle cx="${f(px((k0 + k1) / 2))}" cy="${f(y26)}" r="4.6" fill="${HUD.red}" stroke="#fff" stroke-width="2"/>`;
  }

  // ── 最高点在曲线上的红点（低点已由轴向三角承担，不必再点）
  const cx0 = px(cut), cy0 = py(elevAt(cut));
  let cx = cx0, cy = cy0;
  {
    // 在桥区间内：进度点**跟着那条虚线弧走**（y 取桥面高程；x 就是真实里程，弧不再横移）
    const br = bridgeOf(cut);
    if (br) { cx = cx0; cy = py(deckM(cut)); }
  }
  if (Math.abs(cx0 - px(iHi)) > 18) g += `<circle cx="${f(px(iHi))}" cy="${f(yHi)}" r="6" fill="${HUD.red}" stroke="#fff" stroke-width="2.6"/>`;

  // ── 当前进度：短引线 + 圆点，画在最上层
  g += `<path d="M ${f(cx)} ${f(cy - 15)} V ${f(cy + 15)}" stroke="${done}" stroke-width="3" stroke-dasharray="4 4" opacity=".9"/>`;
  g += `<circle cx="${f(cx)}" cy="${f(cy)}" r="8" fill="${done}" stroke="${NAVI ? '#fff' : OUT}" stroke-width="3.5"/>`;

  for (const tg of activeEvents(t, 'elevTag')) {
    const tk = easeOutBack(clamp(tg.dt / 0.35)) * clamp((tg.d - tg.dt) / 0.3);
    g += grp(T(cx, cy - 40, tk), pill(0, 0, tg.text, { fs: 22, fill: HUD.green, sw: 3, pad: 12, color: '#fff' }));
  }
  return g;
}

/** 底部进度条：只有游标与走过的颜色，不显示公里数字（制作口径 v2） */
function progress(st, dimHalf) {
  const x0 = 1400, x1 = 1860, y = 1046;
  const track = NAVI ? 'rgba(31,45,61,.18)' : 'rgba(11,36,64,.55)';
  const bar = (yy, c, frac, op, who, stage) => {
    let s = `<g opacity="${op}"><rect x="${x0}" y="${yy - 7}" width="${x1 - x0}" height="14" rx="7" fill="${track}" stroke="#fff" stroke-width="2.5"/>` +
      `<rect x="${x0}" y="${yy - 7}" width="${f((x1 - x0) * frac)}" height="14" rx="7" fill="${c}"/>` +
      `<path d="M ${x1} ${yy - 14} v 28" stroke="#fff" stroke-width="4"/><path d="M ${x1} ${yy - 14} h 16 v 10 h -16" fill="#fff"/>`;
    s += `<g transform="translate(${f(x0 + (x1 - x0) * frac)} ${yy + 6})">${face(who, stage, 'run', 34)}</g></g>`;
    return s;
  };
  return bar(y - 26, R.half, clamp(st.female.km / 21.0975), dimHalf ? 0.45 : 1, 'f', st.female.stage) +
    bar(y, R.full, clamp(st.male.km / 42.195), 1, 'm', st.male.stage);
}

function loading(t) {
  let s = '';
  for (const e of activeEvents(t, 'loading')) {
    const op = clamp((e.d - e.dt) / 0.4);
    const p = clamp(e.dt / (e.d - 0.5));
    const bg = NAVI ? '#F3F1EC' : PAPER ? '#6E1B17' : '#06111F', fg = NAVI ? HUD.ink : PAPER ? '#FFF6E0' : '#fff';
    let g = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
    const bob = -Math.abs(Math.sin(t * 2.4 * Math.PI)) * 14;
    g += `<g transform="translate(${W / 2} ${520 + bob})">${face('m', 0, 'run', 230)}</g>`;
    g += `<rect x="660" y="560" width="600" height="34" rx="17" fill="none" stroke="${fg}" stroke-width="4"/><rect x="668" y="568" width="${f(584 * p)}" height="18" rx="9" fill="${NAVI ? R.full : HUD.gold}"/>`;
    g += `<text x="${W / 2}" y="660" text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="40" fill="${fg}">${RACE_META.short}地图加载中 <tspan font-family="${FONT.num}" fill="${NAVI ? R.full : HUD.gold}">${Math.round(p * 100)}%</tspan></text>`;
    s += grp('', g, op);
  }
  return s;
}

function autumn(t) {
  let s = '';
  for (const e of activeEvents(t, 'autumn')) {
    const k = smooth(clamp(e.dt / 0.6)) * smooth(clamp((e.d - e.dt) / 0.6));
    s += `<rect width="${W}" height="${H}" fill="url(#hud-autumn)" opacity="${f(k)}"/>`;
    // 客户 2026-10-27 口径：右上角那张白描边的“秋日限定”字卡去掉。
    // 卡片放大约两倍后，它会和地标照片卡的角标叠成两张同样的字；暖色氛围光保留。
  }
  return s;
}
function montage(t) {
  let s = '';
  for (const e of activeEvents(t, 'montage')) {
    const k = smooth(clamp(e.dt / 0.3)) * smooth(clamp((e.d - e.dt) / 0.3));
    for (let i = 0; i < 16; i++) {
      const y = 210 + ((i * 149) % 660), x = ((i * 331 + t * 2300) % (W + 480)) - 240;
      const len = 74 + (i % 4) * 26;
      // 让开左下角的海拔窗（现在压到 x<600 / y>735，速度线不要在它上面扫）
      if (x < 620 && y > 730) continue;
      s += `<path d="M ${f(x)} ${y} l ${len} ${-len * 0.27}" stroke="${NAVI ? R.full : '#fff'}" stroke-width="${3.5 + (i % 3)}" stroke-linecap="round" opacity="${f((NAVI ? 0.6 : 0.55) * k)}"/>`;
    }
    s += grp(T(W / 2, 200), pill(0, 0, e.text + '  >>', { fs: 36, fill: R.full, sw: 4, color: '#fff' }), k);
  }
  return s;
}
function endTitle(t, st) {
  let s = '';
  const venue = !!(st && st.scene === 'venue');
  // 客户 2026-10-31 ⑥：副本里平时不放浮层文字（主舞台背板本身就是标题）
  // 客户 2026-11-04：片尾改成**落版画面**（AI 底图 + 矢量字 + 蟹王蟹后），
  //   从 ENDCARD_T.t0 起与主舞台交叉溶解到片尾，A/C 没有底图时仍走下面的老题字。
  if (venue) {
    if (!hasEndcard()) return '';
    for (const e of activeEvents(t, 'endTitle')) {
      const k = clamp(e.dt / ENDCARD_T.fade);
      if (k > 0.002) s += endcardSVG({ k, dt: e.dt, fade: ENDCARD_T.fade });
    }
    return s;
  }
  for (const e of activeEvents(t, 'endTitle')) {
    const k = smooth(clamp(e.dt / 0.6));
    if (venue) {
      // 落版（客户 2026-10-29 ⑦）：压深下半屏，保留上方主舞台与两只螃蟹，
      //   「2026 澜湾马拉松」+ 金色细线 + 「赛道见」+ 一行赛道信息
      s += `<defs><linearGradient id="lgEnd" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0" stop-color="${HUD.ink}" stop-opacity="0"/></linearGradient></defs>`
        .replace('</linearGradient></defs>', `<stop offset="0.06" stop-color="${HUD.ink}" stop-opacity="0"/>` +
          `<stop offset="0.62" stop-color="${HUD.ink}" stop-opacity="0.74"/>` +
          `<stop offset="1" stop-color="${HUD.ink}" stop-opacity="0.94"/></linearGradient></defs>`);
      const gy = H * 0.44;
      s += `<rect y="${f(gy)}" width="${W}" height="${f(H - gy)}" fill="url(#lgEnd)" opacity="${f(k)}"/>`;
      s += grp(T(W / 2, H * 0.635 + (1 - k) * 26, 1),
        `<text text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="60" fill="#FFFFFF" opacity="${f(clamp(e.dt / 0.5))}">${BRAND}</text>`
        + `<rect x="-96" y="52" width="192" height="4" rx="2" fill="${HUD.gold}" opacity="${f(k)}"/>`
        + `<text y="140" text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="62" fill="${HUD.gold}" opacity="${f(clamp((e.dt - 0.25) / 0.5))}">赛道见</text>`
        + `<text y="206" text-anchor="middle" font-family="${FONT.cn}" font-weight="600" font-size="28" fill="${HUD.sub}" opacity="${f(clamp((e.dt - 0.45) / 0.5))}">全马 42.195km · 半马 21.0975km · 累计爬升 61m</text>`,
        1);
      continue;
    }
    const bg = NAVI ? '#FFFFFF' : PAPER ? '#6E1B17' : '#06111F', fg = NAVI ? HUD.ink : PAPER ? '#FFF6E0' : '#fff';
    s += `<rect width="${W}" height="${H}" fill="${bg}" opacity="${f(k * 0.86)}"/>`;
    s += grp(T(W / 2, H / 2 - 20, 0.9 + 0.1 * k), `<text text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="62" fill="${fg}">${BRAND}</text><text y="96" text-anchor="middle" font-family="${FONT.title}" font-weight="700" font-size="60" fill="${NAVI ? R.full : HUD.gold}">赛道见</text>`, k);
  }
  return s;
}

/** 分屏中缝与半屏标题 */
function splitChrome(split, titles, dist = 900) {
  if (split <= 0) return '';
  const x = W / 2;
  let s = `<rect x="${f(x - 7)}" y="0" width="14" height="${H}" fill="${NAVI ? '#fff' : OUT}"/><rect x="${f(x - 2)}" y="0" width="4" height="${H}" fill="${NAVI ? R.full : HUD.gold}"/>`;
  // 分屏标题固定在高处（y=172）：以前按距离下移到 286，正好压住终点拱门横楣的英文副标，
  // 右侧只剩一个“THON”残字。近景时拱门更高，标题必须更靠上，不能更靠下。
  void dist;
  const ty = 120;   // 再抬 52px：即使拱门横幅被 bare 逻辑抹空，标题也不该压在门楣色带上
  s += grp(T(W / 4, ty), pill(0, 0, titles[0], { fs: 32, fill: R.half, sw: 4, color: '#fff' }));
  s += grp(T(W * 3 / 4, ty), pill(0, 0, titles[1], { fs: 32, fill: R.full, sw: 4, color: '#fff' }));
  return grp('', s, split);
}

export function hudDefs() {
  return `<radialGradient id="hud-autumn" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#FF9E3D" stop-opacity="0"/><stop offset="1" stop-color="#E9762E" stop-opacity=".45"/></radialGradient>`;
}

export function drawHUD(st, opt) {
  const t = st.t;
  const dimHalf = activeEvents(t, 'dimHalf').length > 0;
  const shown = t > 1.6;
  let s = '';
  if (shown && !opt.clean) {
    // 副本场景（主会场近景 / 分流路口）：只保留分屏框架 + 字幕 + 信息卡；
    // 图例 / 体力条 / 海拔窗 / 进度条 / 秋日限定 都属于“全图视角”的仪表，近景里没有意义
    // 2026-11-06：分流副本（st.scene = 'split'）同样算副本 —— 这里漏了 'split'，
    //   结果 50.44–54.76 那 130 帧在近景上压了整套全图仪表（图例/心率/海拔/进度条），
    //   和主会场副本的干净画面不一致。
    if (st.scene === 'venue' || st.scene === 'split') {
      s += splitChrome(st.split, opt.splitTitles, st.cam?.dist);
      s += cards(t, st) + subtitle(t) + endTitle(t, st);
      return s;
    }
    s += splitChrome(st.split, opt.splitTitles, st.cam?.dist);
    // 分屏时左上品牌条会压住“起点/终点”拱门标题，让位
    s += (st.split > 0.35 ? '' : brand()) + legend(dimHalf);
    const hp = st.hp, fl = clamp(1 - (t - hp.fxT) / 0.6);
    const hk = 1 - st.split;   // 分屏时让位给半屏标题与信息卡
    s += hpBlock(46, 122, 'male', hp.male, st.male.stage, fl, hk);
    s += hpBlock(46, 204, 'female', hp.female, st.female.stage, fl, (dimHalf ? 0.55 : 1) * hk);
    s += elevWin(t, st.male.km);
    s += progress(st, dimHalf);
    s += autumn(t) + montage(t) + cards(t, st) + subtitle(t);
  }
  s += endTitle(t, st) + loading(t);
  return s;
}
export { DURATION };
