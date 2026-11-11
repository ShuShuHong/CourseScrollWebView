// 地标贴纸：插画场景（240×150）+ 贴纸外框 + 名牌。
// 脚本要求“把地标图片做成贴纸”。默认用插画（无版权风险、风格统一）；
// 若项目方提供实拍照片，在 PHOTOS 里填 dataURL / 相对路径即可替换插画，外框与动画不变。
import { THEME } from '../config/theme.js';

const O = THEME.crab.outline;
export const PHOTOS = {
  // museum: 'assets/photos/museum.jpg',
};

const sky = (a, b) => `<rect width="240" height="150" fill="url(#sk-${a.slice(1)}${b.slice(1)})"/>`;
const skyDef = (a, b) => `<linearGradient id="sk-${a.slice(1)}${b.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const cloud = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M 0 10 a 9 9 0 0 1 9 -10 a 12 12 0 0 1 22 2 a 8 8 0 0 1 9 8 Z" fill="#fff" opacity=".95"/></g>`;
const tree = (x, y, s = 1, c = '#5DB862') => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.5" y="-6" width="5" height="12" fill="#8A5A36"/><circle cx="0" cy="-14" r="11" fill="${c}" stroke="${O}" stroke-width="2"/><circle cx="-4" cy="-18" r="3.5" fill="#fff" opacity=".25"/></g>`;
const cone = (x, y, h, c) => `<g transform="translate(${x} ${y})"><rect x="-1.5" y="-4" width="3" height="6" fill="#7A4A2A"/><path d="M 0 ${-h} L ${h * 0.24} -3 L ${-h * 0.24} -3 Z" fill="${c}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/></g>`;
const flower = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-3" r="3" fill="${c}"/><circle cx="3" cy="0" r="3" fill="${c}"/><circle cx="0" cy="3" r="3" fill="${c}"/><circle cx="-3" cy="0" r="3" fill="${c}"/><circle r="2" fill="#FFE27A"/></g>`;

// ── 白模（massing model）画法：只用白/灰，不上一色；体块带 3/4 侧面与灰描边 ──
//    客户 2026-11-03：文渊寺先上“白模佛塔”占位，实拍/AI 图到位后整段替换 SCENES.baosi 即可
const WM = { line: '#B2BECE', face: '#FCFDFF', side: '#DDE4EF', top: '#F4F7FB', shade: '#D6DEEA' };
/** 3/4 视角体块：底面中心 (cx, y0)，宽 w、高 h、进深 d（进深朝右上方） */
const wmBox = (cx, y0, w, h, d) => {
  const x0 = cx - w / 2, sx = d * 0.55, sy = d * 0.40;
  return `<path d="M ${x0} ${y0 - h} L ${x0 + w} ${y0 - h} L ${x0 + w} ${y0} L ${x0} ${y0} Z" fill="${WM.face}" stroke="${WM.line}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M ${x0 + w} ${y0 - h} L ${x0 + w + sx} ${y0 - h - sy} L ${x0 + w + sx} ${y0 - sy} L ${x0 + w} ${y0} Z" fill="${WM.side}" stroke="${WM.line}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M ${x0} ${y0 - h} L ${x0 + sx} ${y0 - h - sy} L ${x0 + w + sx} ${y0 - h - sy} L ${x0 + w} ${y0 - h} Z" fill="${WM.top}" stroke="${WM.line}" stroke-width="1.5" stroke-linejoin="round"/>`;
};
/** 四坡顶：底边中心 (cx, y)，宽 w、高 h */
const wmPyr = (cx, y, w, h) => {
  const x0 = cx - w / 2, sx = w * 0.55, sy = w * 0.40;
  const ax = cx + sx / 2, ay = y - h - sy / 2;                       // 攒尖顶
  const A = [x0, y], B = [x0 + w, y], C = [x0 + w + sx, y - sy], D = [x0 + sx, y - sy];
  const f = (p, q, fill) => `<path d="M ${p[0]} ${p[1]} L ${q[0]} ${q[1]} L ${ax} ${ay} Z" fill="${fill}" stroke="${WM.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
  return f(C, D, WM.side) + f(D, A, WM.top) + f(A, B, WM.face) + f(B, C, WM.side);
};
/** 白模树：两层四棱锥 + 树干 */
const wmTree = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">` +
  `<rect x="-1.6" y="-6" width="3.2" height="7" fill="${WM.side}" stroke="${WM.line}" stroke-width="1.2"/>` +
  `<path d="M 0 -30 L 8 -11 L -8 -11 Z" fill="${WM.top}" stroke="${WM.line}" stroke-width="1.4" stroke-linejoin="round"/>` +
  `<path d="M 0 -22 L 10 -4 L -10 -4 Z" fill="${WM.face}" stroke="${WM.line}" stroke-width="1.4" stroke-linejoin="round"/></g>`;

const SCENES = {
  // 文渊寺（塔）：方形五级砖塔 + 须弥座 + 塔刹，白模占位（矢量）
  baosi: {
    defs: skyDef('#E4ECF8', '#FDFEFF'),
    body: () => {
      let s = sky('#E4ECF8', '#FDFEFF');
      s += `<rect y="96" width="240" height="54" fill="#E9EEF6"/><path d="M 0 96 H 240" stroke="${WM.line}" stroke-width="1.6"/>`;
      s += `<ellipse cx="126" cy="111" rx="56" ry="8" fill="${WM.shade}" opacity=".55"/>`;
      // 台基两级
      s += wmBox(120, 110, 52, 5, 20) + wmBox(120, 104.5, 40, 4, 15);
      // 五级塔身：身 7 高 + 檐 2.2 高，层层收分
      const W = [33, 29, 25, 21, 17];
      let yb = 100.5;
      for (const w of W) {
        s += wmBox(120, yb, w, 7, w);
        s += wmBox(120, yb - 7, w + 8, 2.2, w + 8);      // 出檐
        // 每层正面的小佛龛
        s += `<rect x="${120 - w * 0.11}" y="${yb - 5.6}" width="${w * 0.22}" height="3.6" rx="1.4" fill="${WM.side}" stroke="${WM.line}" stroke-width="1"/>`;
        yb -= 9.2;
      }
      // 攒尖顶 + 塔刹（顶在 y≈34，正好落在卡片 200px 图窗的可见带里）
      s += wmPyr(120, yb, 26, 6.5);
      const apexY = yb - 6.5 - 26 * 0.40 / 2, apexX = 120 + 26 * 0.55 / 2;
      s += `<path d="M ${apexX} ${apexY} V ${apexY - 8.6}" stroke="${WM.line}" stroke-width="2"/>`;
      s += [1.2, 2.8, 4.4].map((d) => `<ellipse cx="${apexX}" cy="${apexY - d}" rx="2.7" ry="1.1" fill="${WM.face}" stroke="${WM.line}" stroke-width="1"/>`).join('');
      s += `<circle cx="${apexX}" cy="${apexY - 7.4}" r="1.8" fill="${WM.face}" stroke="${WM.line}" stroke-width="1.2"/>`;
      // 两侧白模树 + 两个小体块，坐实“模型沙盘”语感
      s += wmTree(44, 108, 1.05) + wmTree(198, 110, 1.15) + wmTree(70, 112, 0.75) + wmTree(174, 113, 0.7);
      s += wmBox(30, 112, 12, 7, 10) + wmBox(212, 108, 10, 9, 9);
      return s;
    },
  },
  museum: {
    defs: skyDef('#8FD3FF', '#DDF3FF'),
    body: () => sky('#8FD3FF', '#DDF3FF') + cloud(150, 18, 1.1) + cloud(30, 30, 0.8) +
      `<rect y="112" width="240" height="38" fill="#BFE39A"/><path d="M 0 124 H 240 V 150 H 0 Z" fill="#E9E1CF"/>` +
      `<path d="M 44 112 V 58 H 196 V 112 Z" fill="#F7F7F2" stroke="${O}" stroke-width="2.5"/>` +
      `<path d="M 30 58 H 210 L 200 44 H 40 Z" fill="#D9D4C7" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M 62 70 H 178 V 80 H 62 Z M 62 88 H 178 V 98 H 62 Z" fill="#5AB6E8" stroke="${O}" stroke-width="2"/>` +
      `<path d="M 72 70 V 80 M 92 70 V 80 M 112 70 V 80 M 132 70 V 80 M 152 70 V 80 M 172 70 V 80 M 72 88 V 98 M 92 88 V 98 M 112 88 V 98 M 132 88 V 98 M 152 88 V 98" stroke="#2C7DB4" stroke-width="1.5"/>` +
      `<path d="M 106 112 V 100 H 134 V 112 Z" fill="#2C5D85" stroke="${O}" stroke-width="2"/><path d="M 96 112 H 144 L 150 124 H 90 Z" fill="#D6CDB8" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>` +
      `<rect x="96" y="49" width="48" height="7" rx="2" fill="#B7802F"/>` + tree(26, 118, 1.1) + tree(214, 118, 1.2, '#4FA65A') + tree(230, 122, 0.8),
  },
  oldstreet: {
    defs: skyDef('#FFD9A8', '#FFF4E0'),
    body: () => sky('#FFD9A8', '#FFF4E0') + cloud(170, 14, 0.9) +
      `<path d="M 92 150 L 112 74 H 128 L 148 150 Z" fill="#C9C1B3"/><path d="M 100 130 H 140 M 104 112 H 136 M 108 96 H 132 M 110 84 H 130" stroke="#A89F90" stroke-width="2"/>` +
      // 左侧徽派民居（马头墙）
      `<path d="M 0 150 V 70 H 14 V 60 H 30 V 52 H 50 V 62 H 64 V 72 H 92 V 150 Z" fill="#FBF8F1" stroke="${O}" stroke-width="2.4"/>` +
      `<path d="M 0 70 H 16 M 12 60 H 32 M 28 52 H 52 M 48 62 H 66 M 62 72 H 94" stroke="#33384A" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M 0 112 H 92 L 86 104 H 0 Z" fill="#3C4152"/><rect x="12" y="118" width="22" height="32" fill="#8E4B2C" stroke="${O}" stroke-width="2"/><rect x="50" y="118" width="22" height="32" fill="#8E4B2C" stroke="${O}" stroke-width="2"/>` +
      // 右侧
      `<path d="M 240 150 V 66 H 226 V 56 H 206 V 64 H 190 V 74 H 148 V 150 Z" fill="#FBF8F1" stroke="${O}" stroke-width="2.4"/>` +
      `<path d="M 240 66 H 224 M 228 56 H 204 M 208 64 H 188 M 192 74 H 146" stroke="#33384A" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M 148 112 H 240 V 104 H 154 Z" fill="#3C4152"/><rect x="166" y="118" width="22" height="32" fill="#8E4B2C" stroke="${O}" stroke-width="2"/><rect x="204" y="118" width="22" height="32" fill="#8E4B2C" stroke="${O}" stroke-width="2"/>` +
      // 远处牌坊
      `<g transform="translate(120 74)"><rect x="-22" y="-30" width="5" height="30" fill="#5D6170"/><rect x="17" y="-30" width="5" height="30" fill="#5D6170"/><rect x="-7" y="-26" width="4" height="26" fill="#5D6170"/><rect x="3" y="-26" width="4" height="26" fill="#5D6170"/><path d="M -30 -30 H 30 L 26 -38 H -26 Z" fill="#33384A"/><path d="M -16 -38 H 16 L 12 -46 H -12 Z" fill="#33384A"/><rect x="-10" y="-34" width="20" height="5" fill="#E7B54A"/></g>` +
      // 灯笼
      [40, 76, 166, 202].map((x, i) => `<g transform="translate(${x} ${96 + (i % 2) * 2})"><path d="M 0 -10 V -4" stroke="${O}" stroke-width="1.5"/><ellipse rx="6" ry="7.5" fill="#E8382E" stroke="${O}" stroke-width="1.6"/><rect x="-3" y="6.5" width="6" height="3" fill="#E7B54A"/></g>`).join(''),
  },
  hospital: {
    defs: skyDef('#A9E0FF', '#EAF8FF'),
    body: () => sky('#A9E0FF', '#EAF8FF') + cloud(24, 18) + cloud(170, 26, 0.8) +
      `<rect y="114" width="240" height="36" fill="#BFE39A"/>` +
      `<path d="M 54 114 V 46 H 186 V 114 Z" fill="#fff" stroke="${O}" stroke-width="2.5"/>` +
      Array.from({ length: 3 }, (_, r) => Array.from({ length: 5 }, (_, c) => `<rect x="${66 + c * 23}" y="${58 + r * 17}" width="14" height="10" rx="2" fill="#7CC8F0"/>`).join('')).join('') +
      `<rect x="104" y="96" width="32" height="18" fill="#2C5D85" stroke="${O}" stroke-width="2"/>` +
      `<g transform="translate(120 30)"><circle r="17" fill="#fff" stroke="${O}" stroke-width="2.5"/><path d="M -4.5 -12 h 9 v 7.5 h 7.5 v 9 h -7.5 v 7.5 h -9 v -7.5 h -7.5 v -9 h 7.5 z" fill="#ED1C24"/></g>` +
      tree(30, 120, 1.15) + tree(210, 120, 1.2),
  },
  sequoia: {
    defs: skyDef('#FFB55A', '#FFE7B8'),
    body: () => sky('#FFB55A', '#FFE7B8') + `<circle cx="120" cy="54" r="20" fill="#FFF3C4" opacity=".9"/>` +
      `<path d="M 0 150 L 0 92 L 240 92 L 240 150 Z" fill="#E6B566"/><path d="M 84 150 L 116 92 H 124 L 156 150 Z" fill="#B9AFA1"/><path d="M 120 150 V 92" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/>` +
      [[108, 94, 26], [96, 100, 34], [80, 110, 46], [58, 124, 62], [30, 142, 82]].map(([x, y, h], i) => cone(x, y, h, ['#E9952E', '#F2B33D', '#D9762A', '#E9952E', '#C9631F'][i])).join('') +
      [[132, 94, 26], [144, 100, 34], [160, 110, 46], [182, 124, 62], [210, 142, 82]].map(([x, y, h], i) => cone(x, y, h, ['#F2B33D', '#E9952E', '#F2B33D', '#D9762A', '#E9952E'][i])).join('') +
      [[40, 40], [200, 30], [170, 70], [70, 70], [120, 110]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="1.6" fill="#D9762A" transform="rotate(${i * 40} ${x} ${y})"/>`).join(''),
  },
  watertown: {
    defs: skyDef('#9FDBFF', '#E6F7FF'),
    body: () => sky('#9FDBFF', '#E6F7FF') + cloud(30, 16, 0.9) + cloud(180, 22) +
      `<path d="M 0 80 Q 120 70 240 80 V 112 H 0 Z" fill="#4CC3E6"/><path d="M 30 92 h 30 M 150 98 h 40 M 90 104 h 24" stroke="#BDF0FF" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M 0 78 Q 60 64 110 76 L 110 80 Q 60 70 0 82 Z" fill="#7CB95A"/>` +
      // 楼阁（官方图标即为楼阁）
      `<g transform="translate(150 80)"><rect x="-26" y="-6" width="52" height="6" fill="#B9AFA1" stroke="${O}" stroke-width="1.8"/><rect x="-18" y="-24" width="36" height="18" fill="#E8382E" stroke="${O}" stroke-width="1.8"/><path d="M -30 -24 H 30 Q 22 -30 0 -32 Q -22 -30 -30 -24 Z" fill="#33384A"/><rect x="-11" y="-42" width="22" height="11" fill="#E8382E" stroke="${O}" stroke-width="1.8"/><path d="M -20 -42 H 20 Q 14 -48 0 -52 Q -14 -48 -20 -42 Z" fill="#33384A"/><path d="M 0 -52 V -58" stroke="#E7B54A" stroke-width="2.5"/></g>` +
      `<path d="M 0 112 H 240 V 150 H 0 Z" fill="#9ED37A"/>` +
      Array.from({ length: 34 }, (_, i) => flower(6 + (i * 37) % 236, 120 + ((i * 13) % 28), ['#FF6FA3', '#FFC93C', '#B58CFF', '#fff', '#FF8C5A'][i % 5], 1 + (i % 3) * 0.15)).join(''),
  },
  lakepark: {
    defs: skyDef('#8ED6FF', '#E8F8FF'),
    body: () => sky('#8ED6FF', '#E8F8FF') + `<circle cx="196" cy="32" r="14" fill="#FFE27A"/>` + cloud(40, 20) +
      `<path d="M 0 70 H 240 V 150 H 0 Z" fill="#4CC3E6"/><path d="M 0 70 H 240 V 74 H 0 Z" fill="#9AD2E8"/>` +
      `<path d="M 20 96 h 40 M 170 88 h 30 M 110 82 h 26" stroke="#BDF0FF" stroke-width="2.5" stroke-linecap="round"/>` +
      `<g transform="translate(150 78)"><path d="M -12 0 H 12 L 8 5 H -8 Z" fill="#fff" stroke="${O}" stroke-width="1.6"/><path d="M 0 0 V -22 L 12 -2 Z" fill="#FFC83D" stroke="${O}" stroke-width="1.6"/></g>` +
      `<path d="M 0 150 C 40 128 80 118 130 116 C 170 115 200 120 240 112 V 150 Z" fill="#9ED37A"/>` +
      `<path d="M 60 150 C 80 132 110 124 150 122" fill="none" stroke="#C99A62" stroke-width="12" stroke-linecap="round"/><path d="M 60 150 C 80 132 110 124 150 122" fill="none" stroke="#E0B887" stroke-width="7" stroke-linecap="round"/>` +
      // 柳树
      `<g transform="translate(38 124)"><rect x="-3" y="-30" width="6" height="30" fill="#8A5A36"/><circle cy="-38" r="18" fill="#7CC36A" stroke="${O}" stroke-width="2"/>${Array.from({ length: 7 }, (_, i) => `<path d="M ${-14 + i * 4.6} -30 q 2 14 -1 26" stroke="#5DA64F" stroke-width="2" fill="none"/>`).join('')}</g>` +
      tree(212, 120, 1.1),
  },
  wetland: {
    defs: skyDef('#B4E2F5', '#F1FAFF'),
    body: () => sky('#B4E2F5', '#F1FAFF') + cloud(150, 18, 1.1) +
      `<path d="M 0 74 H 240 V 150 H 0 Z" fill="#6CCBE6"/><path d="M 0 74 Q 60 62 120 72 T 240 70 V 76 H 0 Z" fill="#7CB95A"/>` +
      `<path d="M 30 98 h 40 M 150 104 h 36" stroke="#D6F6FF" stroke-width="2.5" stroke-linecap="round"/>` +
      // 白鹭
      `<g transform="translate(150 44)"><path d="M -20 0 Q -6 -14 4 -2 Q 14 -12 26 -4 Q 12 -2 4 4 Q -6 8 -20 0 Z" fill="#fff" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/><path d="M 4 -2 q 8 -6 12 -2" fill="none" stroke="${O}" stroke-width="1.6"/><path d="M 16 -4 l 6 1" stroke="#E7B54A" stroke-width="2"/></g>` +
      `<g transform="translate(70 34) scale(.6)"><path d="M -20 0 Q -6 -14 4 -2 Q 14 -12 26 -4 Q 12 -2 4 4 Q -6 8 -20 0 Z" fill="#fff" stroke="${O}" stroke-width="2.4"/></g>` +
      // 芦苇
      Array.from({ length: 26 }, (_, i) => {
        const x = 4 + i * 9.2, h = 36 + ((i * 17) % 22), b = 150;
        return `<path d="M ${x} ${b} Q ${x + 3} ${b - h / 2} ${x + 5} ${b - h}" stroke="#A4884E" stroke-width="2.2" fill="none"/><ellipse cx="${x + 5}" cy="${b - h - 5}" rx="2.6" ry="7" fill="#D8C08A" transform="rotate(14 ${x + 5} ${b - h - 5})"/>`;
      }).join(''),
  },
  bridge: {
    defs: skyDef('#7FCBFF', '#E2F5FF'),
    body: () => sky('#7FCBFF', '#E2F5FF') + cloud(30, 20) + cloud(180, 14, 0.8) +
      `<path d="M 0 96 H 240 V 150 H 0 Z" fill="#4CC3E6"/><path d="M 30 126 h 50 M 150 134 h 40" stroke="#BDF0FF" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M 0 96 Q 120 52 240 96 L 240 106 Q 120 62 0 106 Z" fill="#2F8CF0" stroke="${O}" stroke-width="2.5"/>` +
      `<path d="M 0 94 Q 120 50 240 94" fill="none" stroke="#fff" stroke-width="2.5"/>` +
      [40, 80, 120, 160, 200].map((x) => { const y = 96 - (1 - Math.pow((x - 120) / 120, 2)) * 44; return `<rect x="${x - 4}" y="${y + 8}" width="8" height="${150 - y}" fill="#DCE6EE" stroke="${O}" stroke-width="2"/>`; }).join(''),
  },
};
export const STICKER_ARTS = Object.keys(SCENES);

import { landmarkSrc } from './sprites.js';

let uid = 0;
// 剪纸外框：沿矩形外缘做波浪花边，模拟剪刀剪出的纸边
function scallop(x0, y0, w, h, r = 9) {
  let d = '';
  const step = r * 2;
  const edge = (ax, ay, bx, by, nx, ny, first) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(L / step));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, tm = (i + 0.5) / n, t1 = (i + 1) / n;
      const p0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0];
      const pm = [ax + (bx - ax) * tm + nx * r, ay + (by - ay) * tm + ny * r];
      const p1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
      if (first && i === 0) d += `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} `;
      d += `Q ${pm[0].toFixed(1)} ${pm[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} `;
    }
  };
  edge(x0, y0, x0 + w, y0, 0, -1, true);
  edge(x0 + w, y0, x0 + w, y0 + h, 1, 0);
  edge(x0 + w, y0 + h, x0, y0 + h, 0, 1);
  edge(x0, y0 + h, x0, y0, -1, 0);
  return d + 'Z';
}

/** 贴纸（中心对齐，约 284×226）。图片优先级：photo 参数 > 实拍 PHOTOS > AI 插画（按画风）> SVG 兜底插画 */
export function stickerSVG({ art, name, tag, photo } = {}) {
  const sc = SCENES[art];
  const id = `st${++uid}`;
  const img = photo || PHOTOS[art] || landmarkSrc(art);
  const H = THEME.hud, frame = THEME.sticker?.frame || 'card';
  // 客户 2026-10-27 口径：卡片放大到原来的约两倍（560×286，仍锚在右上角，向上长不动、向下长）
  const w = 560, h = 286, x0 = -w / 2, y0 = -h / 2;
  const pad = 14, ix = x0 + pad, iy = y0 + pad, iw = w - pad * 2, ih = 200;
  // 插画是 240×150 的场景：按 cover 缩放（裁上下、不拉变形），否则拉成 2.66:1 会把房子压扁
  const k = Math.max(iw / 240, ih / 150);
  const pic = (rx) => `<defs>${sc ? sc.defs : ''}<clipPath id="${id}"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${rx}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">` + (img
      ? `<image href="${img}" x="${ix}" y="${iy}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid slice"/>`
      : `<g transform="translate(${ix + iw / 2} ${iy + ih / 2}) scale(${k.toFixed(4)}) translate(-120 -75)">${sc.body()}</g>`) + '</g>';
  const fs = name.length > 9 ? 32 : name.length > 6 ? 36 : 40;
  // 名称行的基线：卡片下沿往上 29px（客户 2026-10-27：蓝点和黑字再往下挪一点——原来 42px 时
  // 字顶离图片只剩 3px，读起来像贴着照片）
  const nameY = y0 + h - 29;
  let s = '';
  if (frame === 'navi') {
    // 导航风：白底大圆角卡片 + 柔和投影；名称左对齐带定位点
    // （客户 2026-10-27 口径：去掉卡片下沿的小尖角——它只是装饰，却像“指错了地方”的定位尖）
    s += `<rect x="${x0}" y="${y0 + 10}" width="${w}" height="${h}" rx="26" fill="rgba(30,50,90,.16)"/>`;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="26" fill="#fff"/>`;
    s += pic(18);
    s += `<circle cx="${x0 + 36}" cy="${nameY - 13}" r="10" fill="${THEME.route.full}"/><circle cx="${x0 + 36}" cy="${nameY - 13}" r="4.2" fill="#fff"/>`;
    s += `<text x="${x0 + 58}" y="${nameY}" font-family="${THEME.font.cn}" font-weight="700" font-size="${fs - 2}" fill="${H.ink}">${name}</text>`;
  } else if (frame === 'paper') {
    // 剪纸风：红纸花边外框 + 米色内衬 + 纸影
    s += `<path d="${scallop(x0 + 6, y0 + 10, w, h)}" fill="rgba(60,15,10,.35)"/>`;
    s += `<path d="${scallop(x0, y0, w, h)}" fill="${H.panel}"/>`;
    s += `<rect x="${x0 + 10}" y="${y0 + 10}" width="${w - 20}" height="${h - 20}" fill="${H.card}"/>`;
    s += pic(2);
    s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="none" stroke="${H.panel}" stroke-width="2"/>`;
    s += `<text x="0" y="${nameY}" text-anchor="middle" font-family="${THEME.font.title}" font-weight="700" font-size="${fs}" fill="${H.panel}">${name}</text>`;
  } else {
    // 卡通风：粗黑描边白卡
    s += `<rect x="${x0 + 8}" y="${y0 + 12}" width="${w}" height="${h}" rx="30" fill="rgba(10,25,50,.28)"/>`;
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="30" fill="#fff" stroke="${O}" stroke-width="6"/>`;
    s += pic(18);
    s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="18" fill="none" stroke="${O}" stroke-width="3"/>`;
    s += `<text x="0" y="${nameY}" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="${fs}" fill="${H.ink}">${name}</text>`;
  }
  if (tag) {
    const tw = tag.length * 30 + 34;
    const tf = frame === 'navi' ? '#FF8A3D' : H.gold;
    const tc = frame === 'navi' ? '#fff' : frame === 'paper' ? H.ink : O;
    const stroke = frame === 'card' ? `stroke="${O}" stroke-width="4"` : '';
    s += `<g transform="translate(${-x0 - tw / 2 - 6} ${y0 + 8}) rotate(${frame === 'navi' ? 0 : 8})"><rect x="${-tw / 2}" y="-22" width="${tw}" height="44" rx="${frame === 'paper' ? 5 : 22}" fill="${tf}" ${stroke}/><text x="0" y="10" text-anchor="middle" font-family="${THEME.font.cn}" font-weight="700" font-size="27" fill="${tc}">${tag}</text></g>`;
  }
  return s;
}
