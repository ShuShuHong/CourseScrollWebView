// ════════════════════════════════════════════════════════════════════════
//  Q 版奔跑小人（蓝蓝 = 全马 42.195 / 湾湾 = 半马 21.0975）· 虚构案例角色
//  纯参数化 SVG：同一函数供设定集与成片使用。
//  坐标：原点 = 两脚中点的地面，y 向下为正（角色在 y<0 区域），高约 170 单位。
//
//  crabSVG({ sex:'m'|'f', stage:0|1|2, mood:'run'|'cheer'|'tired'|'win',
//            phase:0..1, facing:1|-1, palette:'qing'|'red', ring:true, label })
//    stage 0 新手：头带
//    stage 1 升级（第一次过桥后）：金色头带 + 护腕 + 号码布金边 + 速度纹
//    stage 2 湖王 / 湖后（冲线后）：王冠/后冠 + 披风
// ════════════════════════════════════════════════════════════════════════
// 赛事包内路径：races/<id>/art/ → src/config/theme.js
import { THEME } from '../../../src/config/theme.js';

const O = THEME.crab.outline;
// 两套队服配色：qing = 青绿（默认）；red = 喜庆红（备选）。key 沿用 qing/red 以便兼容旧调用。
export const PALETTES = {
  qing: { suit: '#3F7F6A', suitLight: '#7CC2A0', suitDark: '#22504A', skin: '#FFD9B0', shoe: '#2A3550', sock: '#fff' },
  red:  { suit: '#E0573B', suitLight: '#FF9A6C', suitDark: '#A53222', skin: '#FFD9B0', shoe: '#3A2A2A', sock: '#fff' },
};
const SEX = {
  m: { band: THEME.crab.male, bandLight: '#6FC2FF', label: '42.195', cape: '#D7263D', capeDark: '#9E1529', hair: 'm' },
  f: { band: THEME.crab.female, bandLight: '#FF9ACD', label: '21.0975', cape: '#8F57E8', capeDark: '#5E33A8', hair: 'f' },
};
const GOLD = '#FFC83D', GOLD_D = '#D89A12';

const f1 = (n) => Math.round(n * 10) / 10;

/** 共享渐变定义（放进任意 <svg><defs> 一次即可） */
export function crabDefs() {
  let s = '';
  for (const [k, p] of Object.entries(PALETTES)) {
    s += `<radialGradient id="cg-sh-${k}" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="${p.suitLight}"/><stop offset=".6" stop-color="${p.suit}"/><stop offset="1" stop-color="${p.suitDark}"/></radialGradient>`;
    s += `<linearGradient id="cg-cl-${k}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${p.suitDark}"/><stop offset="1" stop-color="${p.suit}"/></linearGradient>`;
  }
  s += `<radialGradient id="cg-shadow"><stop offset="0" stop-color="#0b2240" stop-opacity=".45"/><stop offset="1" stop-color="#0b2240" stop-opacity="0"/></radialGradient>`;
  return s;
}

/** 一段肢体：粗黑描边 + 内芯色（膝盖处一个小色点） */
function limb(x1, y1, x2, y2, x3, y3, w, color) {
  const d = `M ${f1(x1)} ${f1(y1)} L ${f1(x2)} ${f1(y2)} L ${f1(x3)} ${f1(y3)}`;
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function crabSVG(o = {}) {
  const sex = o.sex === 'f' ? 'f' : 'm';
  const X = SEX[sex];
  const stage = o.stage ?? 0;
  const mood = o.mood || 'run';
  const pk = o.palette || 'qing';
  const P = PALETTES[pk];
  const ph = (o.phase || 0) * Math.PI * 2;
  const f = Math.max(-1, Math.min(1, o.facing ?? 1)); // 连续值：0 = 正对镜头
  const running = mood === 'run' || mood === 'tired';
  const amp = o.still ? 0 : mood === 'tired' ? 0.62 : 1;
  const hop = (mood === 'cheer' || mood === 'win') && !o.still;
  const bob = running ? -Math.abs(Math.sin(ph)) * 6 * amp + (mood === 'tired' ? 6 : 0)
    : hop ? -Math.abs(Math.sin(ph)) * 11 : 0;
  // 身体前倾：跑时沿 facing 前倾，累时直不起腰再低一点
  const leanDeg = running ? f * (mood === 'tired' ? 16 : 10) : 0;
  const B = 8; // 基准下沉：脚底到髋关节的腿长空间

  let s = '';
  // ── 地面：阴影 + 识别圈（蓝 = 全马，粉 = 半马）
  s += `<ellipse cx="0" cy="0" rx="70" ry="14" fill="url(#cg-shadow)"/>`;
  if (o.ring !== false) s += `<ellipse cx="0" cy="0" rx="58" ry="12" fill="${X.band}" fill-opacity=".22" stroke="${X.band}" stroke-width="4"/>`;

  s += `<g>`; // 整体组（披风/腿/躯干/头按序入栈，披风最后画到躯干下面）
  // 髋部基准（身体上端随 bob 动，腿只受相位影响）
  const hip = { x: 0, y: -96 + bob + B };
  const sh  = { x: 0, y: -138 + bob + B }; // 肩
  const hy  = hip.y, sy = sh.y;

  // ── 披风（stage 2）：最后面，向行进反方向飘
  if (stage >= 2) {
    const w = Math.sin(ph * 2) * 5, d = -f * 20;
    const cape = `M ${-22} ${sy + 6} C ${-52 + d * 0.6} ${sy + 20} ${-64 + d} ${sy + 70} ${-58 + d * 1.4} ${sy + 104} Q ${-24 + d} ${sy + 116 + w} ${d} ${sy + 112} Q ${24 + d} ${sy + 116 - w} ${58 + d * 1.4} ${sy + 104} C ${64 + d} ${sy + 70} ${52 + d * 0.6} ${sy + 20} ${22} ${sy + 6} Z`;
    s += `<path d="${cape}" fill="${X.cape}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<path d="M ${-58 + d * 1.4} ${sy + 104} Q ${-24 + d} ${sy + 116 + w} ${d} ${sy + 112} Q ${24 + d} ${sy + 116 - w} ${58 + d * 1.4} ${sy + 104}" fill="none" stroke="${GOLD}" stroke-width="4.5" stroke-linecap="round"/>`;
  }

  // ── 腿：跑步时前后交替（一侧前跨一侧后蹬），跳/立时并拢微屈
  const legPh = ph;                      // 步频
  const sw = Math.sin(legPh), sw2 = Math.sin(legPh + Math.PI);
  const mkLeg = (u) => {                 // u: -1 后蹬 … +1 前跨
    const swing = running ? u * 34 * amp : u * 10;
    const lift = running ? Math.max(0, u) * 22 * amp : 0;   // 前跨腿抬膝
    const hx = f * swing * 0.2;
    const kx = hip.x + f * (swing * 0.62 + 6), ky = hy + 44 - lift * 0.85;
    const fx2 = hip.x + hx + f * swing, fy2 = -Math.max(0, lift - 4);
    return { kx, ky, fx: fx2, fy: fy2 };
  };
  const legA = mkLeg(sw), legB = mkLeg(sw2);
  for (const L of [legB, legA]) { // 先画远侧
    s += limb(hip.x, hy, L.kx, L.ky, L.fx, L.fy, 13, sex === 'f' ? P.skin : P.suitDark);
    // 白袜 + 跑鞋
    s += `<g transform="translate(${f1(L.fx)} ${f1(L.fy)}) rotate(${f1(f * 8)})"><ellipse rx="14" ry="8" cx="${f * 3}" cy="-4" fill="${P.sock}" stroke="${O}" stroke-width="3.2"/>` +
      `<path d="M ${f * -8} -3 q ${f * 12} 8 ${f * 24} 2" fill="none" stroke="${P.shoe}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M ${f * -8} -3 q ${f * 12} 8 ${f * 24} 2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".65"/></g>`;
  }

  // ── 躯干组（前倾）
  s += `<g transform="rotate(${f1(leanDeg)} 0 ${f1(hy)})">`;
  // 速度纹（stage≥1 跑动时）
  if (stage >= 1 && running) {
    const vx = -f * 52;
    s += `<path d="M ${vx} ${sy + 10} h ${-f * 26} M ${vx} ${sy + 34} h ${-f * 34} M ${vx} ${sy + 58} h ${-f * 24}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`;
  }
  // 手臂：跑时摆臂（与腿反向），cheer/win 举拳
  // 2026-11-09：手/肘必须甩出躯干轮廓（|x| > 34），否则手臂压在队服同色上完全看不见
  const mkArm = (u) => {
    if (!running) {
      const lift = hop ? 46 : 20;
      return { ex: u * 26, ey: sy + 28, hx: u * 40, hy2: sy - lift };
    }
    // u=+1 → 后摆（手 -38f，低）；u=-1 → 前摆（手 +50f，抬高到胸口旁）
    return { ex: -f * u * 20, ey: sy + 36, hx: -f * u * 44 * amp + f * 6, hy2: sy + 48 - Math.max(0, -u) * 10 * amp };
  };
  // 身体（圆角队服）
  const suit = `M -30 ${sy + 2} C -38 ${sy + 40} -34 ${hy - 14} -24 ${hy + 2} L 24 ${hy + 2} C 34 ${hy - 14} 38 ${sy + 40} 30 ${sy + 2} Q 0 ${sy - 10} -30 ${sy + 2} Z`;
  s += `<path d="${suit}" fill="url(#cg-sh-${pk})" stroke="${O}" stroke-width="4.5" stroke-linejoin="round"/>`;
  s += `<path d="M -30 ${hy - 24} L 30 ${hy - 24} L 28 ${hy - 6} L -28 ${hy - 6} Z" fill="${P.suitDark}"/>`; // 短裤
  // 号码布
  const label = o.label || X.label;
  const bibStroke = stage >= 1 ? GOLD : O;
  s += `<rect x="-27" y="${sy + 26}" width="54" height="26" rx="6" fill="#fff" stroke="${bibStroke}" stroke-width="3"/>`;
  s += `<text x="0" y="${sy + 45}" text-anchor="middle" font-family="${THEME.font.num}" font-weight="900" font-size="17" fill="#1F2D3D" letter-spacing=".4">${label}</text>`;
  // 手臂（画在身体之上）：跑时摆臂（与腿反向），cheer/win 举拳
  const armA = mkArm(sw), armB = mkArm(sw2);
  for (const A of [armB, armA]) {
    s += limb(sh.x, sy + 6, A.ex, A.ey, A.hx, A.hy2, 11, P.suit);
    if (stage >= 1) s += `<circle cx="${f1(A.hx)}" cy="${f1(A.hy2)}" r="10" fill="${X.band}" stroke="${O}" stroke-width="3.2"/>`; // 护腕
    s += `<circle cx="${f1(A.hx)}" cy="${f1(A.hy2)}" r="7.5" fill="${P.skin}" stroke="${O}" stroke-width="3.2"/>`;              // 拳头
  }

  // ── 头
  const hyy = sy - 34;                    // 头中心
  // 脸
  s += `<circle cx="0" cy="${hyy}" r="26" fill="${P.skin}" stroke="${O}" stroke-width="4.2"/>`;
  // 头发：男短寸 / 女马尾（向身后飘）
  if (X.hair === 'm') {
    s += `<path d="M -24 ${hyy - 10} Q -20 ${hyy - 34} 4 ${hyy - 34} Q 26 ${hyy - 32} 25 ${hyy - 8} Q 14 ${hyy - 22} -2 ${hyy - 20} Q -16 ${hyy - 18} -24 ${hyy - 10} Z" fill="${P.suitDark}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;
  } else {
    const pw = Math.sin(ph * 2) * 4 * (running ? 1 : 0.4);
    s += `<path d="M -24 ${hyy - 8} Q -22 ${hyy - 34} 4 ${hyy - 34} Q 26 ${hyy - 30} 24 ${hyy - 6} Q 10 ${hyy - 24} -6 ${hyy - 20} Q -20 ${hyy - 16} -24 ${hyy - 8} Z" fill="${P.suitDark}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<path d="M ${-f * 12} ${hyy - 24} q ${-f * 26} 6 ${-f * 30 + pw} 30 q ${f * 8} 8 ${f * 16} -2 q ${-f * 14 - pw} -16 ${f * 2} -28 z" fill="${P.suitDark}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<circle cx="${-f * 12}" cy="${hyy - 22}" r="5.5" fill="${X.band}" stroke="${O}" stroke-width="2.6"/>`;
  }
  // 头带（stage 1 起金色滚边）
  s += `<path d="M -25 ${hyy - 12} Q 0 ${hyy - 24} 25 ${hyy - 12} L 24 ${hyy - 3} Q 0 ${hyy - 14} -24 ${hyy - 3} Z" fill="${X.band}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;
  if (stage >= 1) s += `<path d="M -25 ${hyy - 11} Q 0 ${hyy - 23} 25 ${hyy - 11}" fill="none" stroke="${GOLD}" stroke-width="2.4"/>`;
  // 眼睛（朝 facing 方向看）
  for (const sd of [-1, 1]) {
    const ex = sd * 10 + f * 3, ey = hyy + 2;
    if (mood === 'win' || (mood === 'cheer' && !o.still)) {
      s += `<path d="M ${ex - 5} ${ey + 1} Q ${ex} ${ey - 6} ${ex + 5} ${ey + 1}" fill="none" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/>`;
    } else if (mood === 'tired') {
      s += `<circle cx="${ex}" cy="${ey + 2}" r="4.2" fill="${O}"/><path d="M ${ex - 6} ${ey - 3} h 12" stroke="${O}" stroke-width="3" stroke-linecap="round"/>`;
    } else {
      s += `<circle cx="${ex}" cy="${ey}" r="4.6" fill="${O}"/><circle cx="${ex + 1.6}" cy="${ey - 1.6}" r="1.5" fill="#fff"/>`;
    }
  }
  // 腮红 + 嘴
  const blushA = sex === 'f' ? 0.85 : 0.5;
  s += `<ellipse cx="${-15 + f * 2}" cy="${hyy + 11}" rx="5.5" ry="3.4" fill="${THEME.crab.blush}" opacity="${blushA}"/><ellipse cx="${15 + f * 2}" cy="${hyy + 11}" rx="5.5" ry="3.4" fill="${THEME.crab.blush}" opacity="${blushA}"/>`;
  if (mood === 'run') s += `<path d="M -5 ${hyy + 12} Q 0 ${hyy + 17} 5 ${hyy + 12}" fill="none" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/>`;
  else if (mood === 'tired') {
    s += `<path d="M -7 ${hyy + 15} Q -3 ${hyy + 11} 0 ${hyy + 15} Q 3 ${hyy + 19} 7 ${hyy + 15}" fill="none" stroke="${O}" stroke-width="3.2" stroke-linecap="round"/>`;
    const drop = 'M 0 -8 C 4 -2 5 2 0 4 C -5 2 -4 -2 0 -8 Z';
    const dy = ((o.phase || 0) * 2 % 1) * 7;
    s += `<path d="${drop}" transform="translate(${f * 26} ${hyy - 6 + dy})" fill="#9FE3FF" stroke="${O}" stroke-width="2.2"/>`;
  } else s += `<path d="M -8 ${hyy + 9} Q 0 ${hyy + 21} 8 ${hyy + 9} Z" fill="#B3263B" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`;

  // 王冠（stage 2）
  if (stage >= 2) {
    if (sex === 'm') {
      s += `<g transform="translate(0 ${hyy - 32})"><path d="M -12 0 L -14 -20 L -6 -11 L 0 -26 L 6 -11 L 14 -20 L 12 0 Z" fill="${GOLD}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>` +
        `<circle cx="0" cy="-8" r="3.4" fill="${X.band}" stroke="${O}" stroke-width="1.5"/><circle cx="0" cy="-28" r="3" fill="${THEME.hud.red}" stroke="${O}" stroke-width="1.5"/></g>`;
    } else {
      s += `<g transform="translate(0 ${hyy - 32})"><path d="M -12 0 C -11 -10 -5 -17 0 -22 C 5 -17 11 -10 12 0 Z" fill="${GOLD}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M 0 -5 C -5 -10 -5 -15 0 -12 C 5 -15 5 -10 0 -5 Z" fill="${X.band}" stroke="${O}" stroke-width="1.5"/><circle cx="0" cy="-24" r="2.8" fill="#fff" stroke="${O}" stroke-width="1.3"/></g>`;
    }
  }
  s += `</g>`; // 躯干组
  s += `</g>`;
  return s;
}

export const CRAB_VIEWBOX = '-140 -190 280 208';

/** 独立 <svg> 字符串（设定集用） */
export function crabStandalone(o = {}, attrs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CRAB_VIEWBOX}" ${attrs}><defs>${crabDefs()}</defs>${crabSVG(o)}</svg>`;
}
