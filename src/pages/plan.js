// 副本场景 · 俯视图（北朝上）—— 给客户改动用
//
//   node tools/plan_shot.mjs            → out/plan/副本俯视图-北朝上.png（2×）
//
// 三个北朝上的等比例分幅（x 是南北向＝画面纵向，z 是东西向＝画面横向）：
//   ① 南端：C 区弯道 + A/B 集结区 + 起终点拱门
//   ② 起终点：主舞台 / 帐篷带 / 检录口 / 饮水站
//   ③ 北段：冲刺直道（230→0 m 刻度）
// 所有几何都取自 src/config/venue.js（与 3D 场景同一份），弯道来自 config/bend.js（唯一来源）。
//
// 方位（本片自己的一套，与官方平面图只是旋转关系）：
//   +x = 北 = 跑进方向 ⇒ 画面向上
//   +z = 东 = 湖/公园一侧 ⇒ 画面向右
//   -z = 西 = 广场/主舞台/城市一侧 ⇒ 画面向左
//   官方平面图是「北在左、东在上」，把那张图顺时针转 90° 就是这张。
import { V } from '../config/venue.js';
import { bendPath, subPath, cPoint } from '../config/bend.js';
import { VENUE_WINDOWS, STAGE_T, WIN_T } from '../config/venue.js';
import { SPLIT, DURATION, T_GO, T_FEMALE_FINISH, T_MALE_FINISH, POINTS } from '../config/story.js';
import { RACE_META } from '../config/theme.js';
import { SPLIT_ROADS } from '../config/roads.js';

// 主会场名取自 story.js 的起点 POI（剥掉“起点 · ”前缀）
const VENUE_NAME = ((POINTS.find((p) => p.kind === 'start') || {}).name || '主会场').replace(/^(起点|终点)\s*·\s*/, '');

const S = 9.0;                       // px / m（三幅同一比例）
const Z0 = -30, Z1 = 42;             // 东西向覆盖：西 30 m … 东 42 m（场景实体的范围）
const PW = Math.round((Z1 - Z0) * S);   // 706
const PH = Math.round(150 * S);         // 1260
const MARGIN = 40, GAP = 72;

const PANELS = [
  { id: 'P1', x0: -160, x1: 10, title: '① 南端 · C 区弯道 / A·B 集结区 / 起终点拱门' },
  { id: 'P2', x0: 10, x1: 160, title: '② 起终点以北 · 主舞台 / 帐篷带 / 检录口 / 饮水站' },
  { id: 'P3', x0: 160, x1: 310, title: '③ 北段 · 冲刺直道（230→0 m 刻度）' },
];

// ── 颜色
const C = {
  paper: '#FBF9F4', ink: '#1F2D3D', ink2: '#55636F', line: '#C7CDD4',
  park: '#E3EEDC', pond: '#CFE3F1', water: '#BFDCEE',
  plaza: '#F2EFE9', city: '#E9E5DC', road: '#D6D3CB', roadEdge: '#B4AFA5',
  zoneA: '#ED1C24', zoneB: '#019EDB', zoneC: '#019EDB',
  stage: '#2E63C8', tent: '#F6B65A', util: '#9AA6B2', bldg: '#D8D3C8',
  red: '#D8232A',
};
const F = { cn: "'HMSans', 'Microsoft YaHei', sans-serif", num: "'FigtreeX', 'HMSans', sans-serif" };
const FONT = (sz, w = 700, fam = F.cn) => `font-family="${fam}" font-weight="${w}" font-size="${sz}"`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = (v) => Math.round(v * 10) / 10;

// ── 分幅
function panelSVG(p, px, py) {
  // 世界 → 画面：北（+x）向上，东（+z）向右
  const lx = (z) => (z - Z0) * S;
  const ly = (x) => (p.x1 - x) * S;
  const pt = ([x, z]) => `${r1(lx(z))},${r1(ly(x))}`;
  const pathPts = (pts) => pts.map((q, i) => `${i ? 'L' : 'M'} ${r1(lx(q[1]))} ${r1(ly(q[0]))}`).join(' ');

  const rect = (x0, x1, z0, z1, fill, opt = '') => {
    if (x1 <= p.x0 || x0 >= p.x1 || z1 <= z0 || x1 <= x0) return '';
    return `<rect x="${r1(lx(z0))}" y="${r1(ly(x1))}" width="${r1((z1 - z0) * S)}" height="${r1((x1 - x0) * S)}" fill="${fill}" ${opt}/>`;
  };

  let s = '';

  // ── 底子：公园 / 湖 / 广场 / 城市
  s += rect(V.park.x0, V.park.x1, V.park.z0, V.park.z1, C.park);
  s += rect(V.city.x0, V.city.x1, V.city.z0, V.city.z1, C.city);
  s += rect(V.plaza.x0, V.plaza.x1, V.plaza.z0, V.plaza.z1, C.plaza);
  // 湖（多边形，可能一半在框外，交给 clip）
  s += `<path d="${pathPts(V.pond)} Z" fill="${C.pond}"/>`;

  // ── 城市街区（底商）与街道
  for (const b of V.blocks) {
    s += rect(b.x, b.x + 10, -44.5, -31, C.bldg, `stroke="${C.line}" stroke-width="0.8"`);
  }
  for (const st of V.streets) {
    const w = st.diag ? 12 : 9;
    s += rect(st.x - w / 2, st.x + w / 2, -60, 60, '#F7F5F0', `stroke="${C.line}" stroke-width="0.8"`);
  }

  // ── 人行道 + 车行道（直线段）
  const R = V.road;
  s += rect(R.x0, R.x1, -R.halfW - V.walk.w, -R.halfW, '#EFE9DA');
  s += rect(R.x0, R.x1, R.halfW, R.halfW + V.walk.w, '#EFE9DA');
  s += rect(R.x0, R.x1, -R.halfW, R.halfW, C.road, `stroke="${C.roadEdge}" stroke-width="1"`);

  // ── 弯道路面（沿中心线 22 m 宽）
  const all = bendPath();
  const bp = all.slice(Math.max(0, all.findIndex(([x]) => x <= R.x0 + 1e-6) - 1));
  s += `<path d="${pathPts(bp)}" fill="none" stroke="${C.roadEdge}" stroke-width="${r1((R.halfW * 2 + 2.4) * S)}" stroke-linecap="butt"/>`;
  s += `<path d="${pathPts(bp)}" fill="none" stroke="${C.road}" stroke-width="${r1(R.halfW * 2 * S)}" stroke-linecap="butt"/>`;

  // ── C 区集结带（沿弯道 19 m 宽）
  const cz = V.zoneC;
  s += `<path d="${pathPts(subPath(cz.arc0, cz.arc1, 2))}" fill="none" stroke="${C.zoneC}" stroke-opacity=".38"
        stroke-width="${r1(cz.halfW * 2 * S)}" stroke-linecap="butt"/>`;
  s += `<path d="${pathPts(subPath(cz.arc0, cz.arc1, 2))}" fill="none" stroke="${C.zoneC}" stroke-opacity=".85"
        stroke-width="1.6" stroke-dasharray="7 5"/>`;

  // ── A/B 区
  for (const z of V.zones) {
    const col = z.id === 'A' ? C.zoneA : C.zoneB;
    s += rect(z.x0, z.x1, z.z0, z.z1, col, 'fill-opacity=".30"');
    s += rect(z.x0, z.x1, z.z0, z.z1, 'none', `stroke="${col}" stroke-width="2"`);
    const cx = r1(lx((z.z0 + z.z1) / 2)), cy = r1(ly((z.x0 + z.x1) / 2));
    if (cx > 8 && cx < PW - 8) s += `<text x="${cx}" y="${cy + 13}" text-anchor="middle" ${FONT(30, 900)} fill="${col}">${z.id}</text>`;
  }

  // ── 路面中线 + 跑进方向
  s += `<path d="M ${r1(lx(0))} ${r1(ly(R.x1))} L ${r1(lx(0))} ${r1(ly(R.x0))}" stroke="#FFFFFF" stroke-width="2.6" stroke-dasharray="14 12" opacity=".9"/>`;
  s += `<path d="${pathPts(bp)}" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-dasharray="14 12" opacity=".9"/>`;

  // ── 230/200/150/100/50 m 刻度牌
  for (const m of V.marks) {
    if (m < p.x0 - 4 || m > p.x1 + 4) continue;
    s += `<rect x="${r1(lx(R.halfW + 0.3))}" y="${r1(ly(m) - 3)}" width="${r1(2.2 * S)}" height="6" fill="${C.ink}" opacity=".55"/>`;
    s += `<text x="${r1(lx(R.halfW + 2.6) + 6)}" y="${r1(ly(m) + 5)}" ${FONT(11, 800, F.num)} fill="${C.ink2}">${m}m</text>`;
  }

  // ── 观众人墙
  s += rect(V.crowd.x0, V.crowd.x1, V.crowd.z0, V.crowd.z1, C.ink, 'fill-opacity=".10"');

  // ── 帐篷带 / LED / 饮水站 / WC / 存衣 / 候场 / 观众区 / 广告牌
  for (const t of V.tents) {
    s += rect(t.x0, t.x1, V.tentStrip.z0, V.tentStrip.z1, C.tent, 'stroke="#C98B2E" stroke-width="1.2"');
  }
  s += rect(V.led.x - V.led.w / 2, V.led.x + V.led.w / 2, V.led.z - V.led.h / 2, V.led.z + V.led.h / 2, C.ink, 'fill-opacity=".14" stroke="#2E63C8" stroke-width="1.4"');
  s += rect(V.water.x - V.water.w / 2, V.water.x + V.water.w / 2, V.water.z - V.water.d / 2, V.water.z + V.water.d / 2, C.water, 'stroke="#3C7FA8" stroke-width="1.2"');
  s += `<circle cx="${r1(lx(V.wc.z))}" cy="${r1(ly(V.wc.x))}" r="${r1(3.4 * S)}" fill="#E7EEF4" stroke="#3C7FA8" stroke-width="1.2"/>`;
  s += rect(V.storage.x0, V.storage.x1, V.storage.z - 4, V.storage.z + 4, C.util, 'fill-opacity=".35" stroke="#6B7885" stroke-width="1" stroke-dasharray="6 4"');
  s += rect(V.actor.x - V.actor.w / 2, V.actor.x + V.actor.w / 2, V.actor.z - V.actor.d / 2, V.actor.z + V.actor.d / 2, C.tent, 'fill-opacity=".55" stroke="#C98B2E" stroke-width="1.2" stroke-dasharray="6 4"');
  s += rect(V.viewer.x0, V.viewer.x1, V.viewer.z0, V.viewer.z1, '#8FB4E0', 'fill-opacity=".40" stroke="#4A7AB8" stroke-width="1.2" stroke-dasharray="6 4"');
  s += rect(V.sponsor.x0, V.sponsor.x1, V.sponsor.z - 1.2, V.sponsor.z + 1.2, '#ED7A2A', 'fill-opacity=".75"');

  // ── 主舞台（台口朝东 ⇒ 开口画在东侧边缘）
  const st = V.stage;
  s += rect(st.x - st.w / 2, st.x + st.w / 2, st.z - st.d / 2, st.z + st.d / 2, C.stage, 'fill-opacity=".88"');
  s += `<rect x="${r1(lx(st.z + st.d / 2) - 5)}" y="${r1(ly(st.x + st.w / 2))}" width="5" height="${r1(st.w * S)}" fill="#FFC83D"/>`;

  // ── 起终点拱门（跨 z，跨度 24 m）+ 门柱 + 起终点线
  const A = V.arch;
  s += `<rect x="${r1(lx(-A.span / 2 - 0.85))}" y="${r1(ly(A.depth / 2))}" width="${r1(1.7 * S)}" height="${r1(A.depth * S)}" fill="#2E63C8"/>`;
  s += `<rect x="${r1(lx(A.span / 2 - 0.85))}" y="${r1(ly(A.depth / 2))}" width="${r1(1.7 * S)}" height="${r1(A.depth * S)}" fill="#2E63C8"/>`;
  s += `<rect x="${r1(lx(-A.span / 2))}" y="${r1(ly(A.x + 1.2))}" width="${r1(A.span * S)}" height="${r1(2.4 * S)}" fill="#2E63C8" opacity=".92"/>`;
  // 起终点线（黑白格）
  const n = 22;
  for (let i = 0; i < n; i++) {
    s += `<rect x="${r1(lx(-R.halfW + (i * 2 * R.halfW) / n))}" y="${r1(ly(V.tape.x + V.finishLine.w / 2))}"
      width="${r1((2 * R.halfW / n) * S)}" height="${r1(V.finishLine.w * S)}" fill="${i % 2 ? '#1F2D3D' : '#FFFFFF'}"/>`;
  }

  // ── 检录口
  for (const g of V.gates) {
    s += `<circle cx="${r1(lx(g.z))}" cy="${r1(ly(g.x))}" r="5" fill="#FFFFFF" stroke="${C.red}" stroke-width="2"/>`;
  }

  // ── 框 + 刻度
  s += `<rect x="0" y="0" width="${PW}" height="${PH}" fill="none" stroke="${C.line}" stroke-width="1.5"/>`;
  for (let z = Math.ceil(Z0 / 20) * 20; z <= Z1; z += 20) {
    s += `<line x1="${r1(lx(z))}" y1="0" x2="${r1(lx(z))}" y2="${PH}" stroke="${C.line}" stroke-width=".7" stroke-dasharray="3 5" opacity=".75"/>`;
    s += `<text x="${r1(lx(z))}" y="${PH + 17}" text-anchor="middle" ${FONT(12, 600, F.num)} fill="${C.ink2}">${z}</text>`;
  }
  for (let x = Math.ceil(p.x0 / 20) * 20; x <= p.x1; x += 20) {
    s += `<line x1="0" y1="${r1(ly(x))}" x2="${PW}" y2="${r1(ly(x))}" stroke="${C.line}" stroke-width=".7" stroke-dasharray="3 5" opacity=".75"/>`;
    s += `<text x="-9" y="${r1(ly(x) + 4)}" text-anchor="end" ${FONT(12, 600, F.num)} fill="${C.ink2}">${x}</text>`;
  }
  s += `<text x="${PW / 2}" y="${PH + 40}" text-anchor="middle" ${FONT(12.5, 700)} fill="${C.ink2}">← 西（z 负）　　东西向 z 坐标（米）　　东（z 正）→</text>`;
  s += `<text x="${PW}" y="-8" text-anchor="end" ${FONT(12.5, 700)} fill="${C.ink2}">↑ 北（x 增大）</text>`;

  // ── 比例尺
  const sbx = PW - 20 - 50 * S, sby = PH - 26;
  s += `<g><rect x="${r1(sbx)}" y="${sby}" width="${r1(50 * S)}" height="7" fill="none" stroke="${C.ink}" stroke-width="1.4"/>
    <rect x="${r1(sbx)}" y="${sby}" width="${r1(25 * S)}" height="7" fill="${C.ink}"/>
    <text x="${r1(sbx)}" y="${sby - 6}" ${FONT(12, 800, F.num)} fill="${C.ink}">0</text>
    <text x="${r1(sbx + 50 * S)}" y="${sby - 6}" text-anchor="end" ${FONT(12, 800, F.num)} fill="${C.ink}">50 m</text></g>`;

  // ── 指北针
  const cxn = 46, cyn = 58;
  s += `<g transform="translate(${cxn} ${cyn})">
    <circle r="26" fill="#FFFFFF" fill-opacity=".92" stroke="${C.line}"/>
    <path d="M 0 -20 L 7 8 L 0 3 L -7 8 Z" fill="${C.red}"/>
    <text x="0" y="-30" text-anchor="middle" ${FONT(13, 900)} fill="${C.red}">北</text></g>`;

  return `<g transform="translate(${px} ${py})"><g clip-path="url(#clip-${p.id})">${s}</g>
    ${panelLabels(p, { lx, ly })}
    <text x="0" y="-26" ${FONT(17, 800)} fill="${C.ink}">${esc(p.title)}</text>
    <text x="${PW}" y="-26" text-anchor="end" ${FONT(12.5, 600, F.num)} fill="${C.ink2}">x ${p.x0} … ${p.x1} m</text>
  </g>`;
}

// ── 各幅的注记：图上一个编号圆点，图下一张对照表（不用引线，绝不压字）
const ITEMS = {
  P1: [
    [-16, 0, 'A 区 · 首发（19.9 × 19.0 m）'],
    [-52, 0, 'B 区 · 首发（19.7 × 18.8 m）'],
    [-120, 9, 'C 区 · 沿弯道 58 m 等宽带（19 m 宽，第二枪）'],
    [0, 0, '起终点拱门 · 跨度 24 m（起点向北、终点向南）'],
    [-21.3, 15.4, '检录口 ×3（A/B/C 各一）'],
    [-67.3, 38.9, 'WC'],
  ],
  P2: [
    [20.3, -18.2, '主舞台 15 × 11 m · 台面高 1.15 m（台口朝东）'],
    [47.7, -22.9, '演员候场区 21.5 × 8.6 m'],
    [50.6, -12.1, '观众观摩区（43.4–57.9 m × −15.6…−8.7 m）'],
    [102.5, -15.5, '观众人墙 3 排（沿路 −17.4…−13.6 m）'],
    [66, 18, '帐篷带 3 顶：加油助威 / 啦啦队 / 媒体（z 13.7–22.4 m）'],
    [15, 33, 'LED 屏 10 × 6 m'],
    [116.3, 30.2, '赛后饮水站 15.8 × 5.2 m'],
    [125, -26, '存衣车 ×5'],
  ],
  P3: [
    [230, 12.1, '距离刻度牌 230 / 200 / 150 / 100 / 50 m（距终点线）'],
    [170, 0, '吉泰路（横穿）'],
    [250, -11, '城市街区（背景楼）'],
    [210, 30, '公园 · 湖（东侧）'],
  ],
};

function panelLabels(p, { lx, ly }) {
  const items = ITEMS[p.id] || [];
  let s = '';
  const halo = 'paint-order="stroke" stroke="#FBF9F4" stroke-width="4.5" stroke-linejoin="round"';
  // 编号圆点
  items.forEach(([x, z], k) => {
    const cx = lx(z), cy = ly(x);
    if (cx < -30 || cx > PW + 30 || cy < -30 || cy > PH + 30) return;
    s += `<g><circle cx="${r1(cx)}" cy="${r1(cy)}" r="9.5" fill="#FFFFFF" stroke="${C.red}" stroke-width="1.8"/>`
      + `<text x="${r1(cx)}" y="${r1(cy + 4.2)}" text-anchor="middle" ${FONT(11.5, 900, F.num)} fill="${C.red}">${k + 1}</text></g>`;
  });
  // 固定在画面上的三处说明（都在本幅内的空地上，短句）
  if (p.id === 'P1') {
    s += `<text x="${r1(lx(-27))}" y="${r1(ly(-84))}" ${FONT(12, 700)} fill="${C.ink2}" ${halo}>${SPLIT_ROADS.half} 22 m</text>`;
    s += `<text x="${r1(lx(24))}" y="${r1(ly(-34))}" ${FONT(12.5, 800)} fill="${C.red}" ${halo}>↑ 跑进方向（北）</text>`;
    s += `<text x="${r1(lx(6))}" y="${r1(ly(-150))}" text-anchor="middle" ${FONT(12, 600)} fill="${C.ink2}" ${halo}>弯道 r 48 m · 转向 75°</text>`;
  }
  if (p.id === 'P2') {
    s += `<text x="${r1(lx(-6))}" y="${r1(ly(44))}" ${FONT(12, 700)} fill="${C.ink2}" ${halo}>终点直道 · 向北 230 m</text>`;
    s += `<text x="${r1(lx(30))}" y="${r1(ly(44))}" ${FONT(12, 600)} fill="${C.ink2}" ${halo}>公园侧（东）</text>`;
  }
  if (p.id === 'P3') {
    s += `<text x="${r1(lx(-22))}" y="${r1(ly(200))}" ${FONT(12, 700)} fill="${C.ink2}" ${halo}>广场 / 城市侧（西）</text>`;
    s += `<text x="${r1(lx(-10))}" y="${r1(ly(186))}" text-anchor="middle" ${FONT(12.5, 800)} fill="${C.red}" ${halo}>↑ 跑进方向（北）</text>`;
  }
  return s;
}

/** 图下的编号对照表（两栏） */
function panelList(p, y) {
  const items = ITEMS[p.id] || [];
  const colW = PW / 2 - 6;
  let s = '';
  items.forEach(([, , text], k) => {
    const col = k % 2, row = Math.floor(k / 2);
    const x = col * (colW + 12), yy = y + row * 21;
    s += `<circle cx="${x + 8}" cy="${yy - 4.2}" r="7.5" fill="#FFFFFF" stroke="${C.red}" stroke-width="1.4"/>`
      + `<text x="${x + 8}" y="${yy}" text-anchor="middle" ${FONT(10, 900, F.num)} fill="${C.red}">${k + 1}</text>`
      + `<text x="${x + 22}" y="${yy}" ${FONT(11.5, 600)} fill="${C.ink}">${esc(text)}</text>`;
  });
  return s;
}

// ── 时间条：主线 / 副本 的切换
function timelineSVG(y) {
  const X0 = MARGIN + 90, W = 1980, K = W / DURATION;
  const tx = (t) => X0 + t * K;
  const rows = [
    { y: y + 22, label: '全图（主线）', color: '#8EA3B8', segs: [[0, 1.20], [9.30, SPLIT.t0], [SPLIT.t1, 62.60], [76.90, DURATION]].filter(([a, b]) => b > a) },
    { y: y + 62, label: '副本（近景）', color: '#2E63C8', segs: [[1.20, 9.30], [SPLIT.t0, SPLIT.t1], [62.60, DURATION]] },
  ];
  let s = '';
  s += `<text x="${MARGIN}" y="${y + 4}" ${FONT(15, 800)} fill="${C.ink}">画面构成 · 主线 / 副本切换</text>`;
  for (const r of rows) {
    s += `<text x="${MARGIN}" y="${r.y + 22}" ${FONT(13, 700)} fill="${C.ink2}">${r.label}</text>`;
    for (const [a, b] of r.segs) {
      s += `<rect x="${r1(tx(a))}" y="${r.y}" width="${r1((b - a) * K)}" height="24" rx="4" fill="${r.color}" opacity=".85"/>`;
    }
  }
  // 分屏单独一条
  s += `<text x="${MARGIN}" y="${y + 114}" ${FONT(13, 700)} fill="${C.ink2}">分屏（左副本 + 右全图）</text>`;
  s += `<rect x="${r1(tx(SPLIT.t0))}" y="${y + 92}" width="${r1((SPLIT.t1 - SPLIT.t0) * K)}" height="24" rx="4" fill="#7A4FB5" opacity=".85"/>`;

  const marks = [
    [0, '0'], [T_GO, `发枪 ${T_GO.toFixed(2)}`], [SPLIT.t0, `开屏 ${SPLIT.t0.toFixed(2)}`],
    [T_FEMALE_FINISH, `半马 ${T_FEMALE_FINISH.toFixed(2)}`], [SPLIT.t1, `收屏 ${SPLIT.t1.toFixed(2)}`],
    [WIN_T.fin0, `片尾 ${WIN_T.fin0.toFixed(2)}`], [T_MALE_FINISH, `全马 ${T_MALE_FINISH.toFixed(2)}`],
    [STAGE_T, `主舞台 ${STAGE_T.toFixed(2)}`], [DURATION, DURATION.toFixed(2)],
  ];
  marks.forEach(([t, txt], i) => {
    s += `<line x1="${r1(tx(t))}" y1="${y + 16}" x2="${r1(tx(t))}" y2="${y + 124}" stroke="${C.ink}" stroke-width=".8" opacity=".45"/>`;
    const ty = y + (i % 2 ? 152 : 136);
    s += `<text x="${r1(tx(t))}" y="${ty}" text-anchor="middle" ${FONT(11.5, 600, F.num)} fill="${C.ink2}">${txt}</text>`;
  });
  return s;
}

function legendSVG(y) {
  const items = [
    [C.zoneA, 'A 区（首发）'], [C.zoneB, 'B 区（首发）'], ['#7FB3DC', 'C 区（第二枪）'],
    [C.stage, '主舞台'], [C.tent, '帐篷 / 候场'], [C.water, '饮水站'], [C.util, '存衣车'],
    ['#8FB4E0', '观众观摩区'], [C.ink, '观众人墙 / 广告牌'],
  ];
  let s = `<text x="${MARGIN}" y="${y}" ${FONT(15, 800)} fill="${C.ink}">图例</text>`;
  let x = MARGIN, yy = y + 26;
  for (const [col, txt] of items) {
    s += `<rect x="${x}" y="${yy - 11}" width="16" height="12" rx="2" fill="${col}"/>`;
    s += `<text x="${x + 23}" y="${yy}" ${FONT(13, 600)} fill="${C.ink}">${esc(txt)}</text>`;
    x += 23 + txt.length * 14 + 26;
  }
  s += `<text x="${MARGIN}" y="${yy + 30}" ${FONT(12.5, 500)} fill="${C.ink2}">`
    + '坐标：x＝南北向（+x 向北＝跑进方向）· z＝东西向（+z 向东＝湖/公园侧）· 三幅同一比例（1 m = 9 px，导出 2× = 18 px）。'
    + '官方平面图是「北在左、东在上」，把那张顺时针转 90° 就是这张。' + `</text>`;
  s += `<text x="${MARGIN}" y="${yy + 52}" ${FONT(12.5, 500)} fill="${C.ink2}">`
    + '改动请直接说「第几幅 + 往哪挪几米 / 改成多大 / 什么时候出现」，例如「主舞台往北挪 6 m、加宽到 20 m」。' + `</text>`;
  return s;
}

// ── 组装
const body = [];
let W = MARGIN * 2 + PW * 3 + GAP * 2;
const headerH = 152;
const panelsY = headerH;
const timelineY = panelsY + PH + 150;
const legendY = timelineY + 180;
const H = legendY + 96;

body.push(`<defs>${PANELS.map((p) => `<clipPath id="clip-${p.id}"><rect x="0" y="0" width="${PW}" height="${PH}"/></clipPath>`).join('')}</defs>`);
body.push(`<rect width="100%" height="100%" fill="${C.paper}"/>`);
body.push(`<text x="${MARGIN}" y="46" ${FONT(30, 900)} fill="${C.ink}">${RACE_META.brand} · 副本场景俯视图（北朝上）</text>`);
body.push(`<text x="${MARGIN}" y="76" ${FONT(14, 600)} fill="${C.ink2}">主会场（${VENUE_NAME} · ${SPLIT_ROADS.half}）· 三幅等比例分幅，x 是南北向、z 是东西向 · 尺寸单位：米</text>`);
body.push(`<text x="${MARGIN}" y="98" ${FONT(13, 500)} fill="${C.ink2}">几何与片子里的 3D 场景同一份数据（src/config/venue.js），弯道中心线来自 config/bend.js</text>`);

PANELS.forEach((p, i) => {
  const px = MARGIN + i * (PW + GAP);
  body.push(panelSVG(p, px, panelsY));
  body.push(`<g transform="translate(${px} ${panelsY + PH + 30})">${panelList(p, 0)}</g>`);
});
body.push(timelineSVG(timelineY));
body.push(legendSVG(legendY));

const sheet = document.getElementById('sheet');
sheet.style.width = W + 'px';
sheet.style.height = H + 'px';
sheet.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${body.join('')}</svg>`;

window.__plan = { W, H, panels: PANELS.length, px_per_m: S };
window.__ready = Promise.resolve();
