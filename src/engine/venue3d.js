// ════════════════════════════════════════════════════════════════════════
//  副本场景渲染器：主会场近景舞台（three.js）
//
//  几何全部来自官方「主会场平面图（起跑前）」的实测 pt 坐标（见 venue.js 顶注）：
//    页面 左=北 右=南 上=东 下=西  →  世界 +x = 北（跑进方向）、+z = 西（广场/主舞台侧）
//  与 World（全图）接口一致：setCamera / renderView / clear / project / probe*
//  渲染到独立 canvas（透明背景），由 director 决定哪个视口用哪套世界。
//
//  2026-10-29 客户 7 条修正：
//    ① 门头横幅/计时牌/顶旗 转正 90°（原来与拱门十字交叉）
//    ② 开场不放终点线/冲刺带 → setPhase('start') 只有起跑线；终点标识只给冲线镜头
//    ③ 南端补道路弯折（半径 46 m 向西转 62°），C 区沿弯道东侧展开
//    ④ 删掉 A/B/C 立牌
//    ⑤⑥ 冲线改黑白地面终点标识 + 撒花，过线即解锁
//    ⑦ 主舞台庆祝仪式（片尾换视角）+ 落版字卡
// ════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { THEME, BRAND, RACE_META } from '../config/theme.js';
import { V } from '../config/venue.js';
import { bendPath, subPath, cPoint, arcPoints, bendLen } from '../config/bend.js';

const M = THEME.map;
// 区号描边色（深藏青）：白字压在浅灰路面上也能读，压在蓝带上也不脏
const ZL_INK = '#0E3A52';
const VN = THEME.venue || { asphalt: '#8E949B', asphaltOp: 0.55, plaza: '#F1F1EE', city: '#E6E4DE', tent: '#FBB040', stage: '#1F63E0', bldg: '#DCDDE3' };
const col = (c) => new THREE.Color(c);

/** 地标剪影横条（2026-11-05 客户 ⑧）：文渊寺塔 / 云澜大桥 / 银杏 / 湖浪，
 *  纯白半透明压在舞台背板下沿，做装饰用 —— 不画细节，只要剪影轮廓认得出。 */
function texSilhouette(w = 2048, h = 262) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.30)';
  g.strokeStyle = 'rgba(255,255,255,0.30)';
  const base = h - 12;
  // ① 文渊寺塔（五级方塔 + 攒尖顶 + 塔刹）
  {
    const cx = w * 0.10, bw = 128;
    for (let i = 0; i < 5; i++) {
      const bwI = bw * (1 - i * 0.13), hh = 26, y = base - i * (hh + 4);
      g.fillRect(cx - bwI / 2, y - hh, bwI, hh);
      g.fillRect(cx - bwI / 2 - 12, y - hh - 5, bwI + 24, 6);   // 檐
    }
    g.beginPath(); g.moveTo(cx - 44, base - 5 * 30); g.lineTo(cx, base - 5 * 30 - 54); g.lineTo(cx + 44, base - 5 * 30); g.fill();
    g.fillRect(cx - 4, base - 5 * 30 - 74, 8, 22);
  }
  // ② 云澜大桥（H 塔 + 桥面 + 斜拉索）
  {
    const cx = w * 0.40, half = 250;
    g.fillRect(cx - half, base - 16, half * 2, 12);                     // 桥面
    for (const s of [-1, 1]) {
      const lx = cx + s * 62;
      g.fillRect(lx - 9, base - 168, 18, 156);                          // 塔腿
      g.beginPath(); g.moveTo(lx, base - 168); g.lineTo(cx + s * 210, base - 22); g.lineTo(cx + s * 210 - s * 10, base - 22); g.closePath(); g.fill();
    }
    g.fillRect(cx - 72, base - 134, 144, 12);                           // 横梁
  }
  // ③ 银杏（三棵尖塔树 + 树干）
  {
    for (let i = 0; i < 3; i++) {
      const cx = w * 0.60 + i * 62, hh = 168 - i * 16;
      g.fillRect(cx - 4, base - hh * 0.28, 8, hh * 0.28);
      g.beginPath(); g.moveTo(cx, base - hh); g.lineTo(cx + 30, base - hh * 0.26); g.lineTo(cx - 30, base - hh * 0.26); g.fill();
    }
  }
  // ④ 湖浪（四道波纹）
  for (let i = 0; i < 4; i++) {
    g.lineWidth = 7; g.beginPath();
    for (let x = w * 0.72; x <= w - 20; x += 6) {
      const y = base - 18 - i * 22 + Math.sin((x - w * 0.72) / 26) * 7;
      x === w * 0.72 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export const V_FOV = 34;

// ── 画布文字 → 贴图（横幅、分区牌、地面字）
function texText({ text = '', sub = '', w = 1024, h = 256, bg = '#1F63E0', color = '#fff', subColor = '#CFE6FF', size = 0.52, weight = 900, font = null, radius = 0, outline = null, outlineW = 0.09 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    if (radius > 0) {
      const r = radius;
      g.beginPath();
      g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r);
      g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
      g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r);
      g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.fill();
    } else g.fillRect(0, 0, w, h);
  }
  const F = font || THEME.font.cn;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // 2026-11-08：赛事名换成带冠名的全称后比原来长一倍多 ⇒ 按画布宽度自动收缩，
  //   否则「2026「澜湾银行」澜湾马拉松」会直接冲出纹理边界（门头横幅 / 舞台背板都中招）
  let fs = Math.round(h * size);
  g.font = `${weight} ${fs}px ${F}`;
  const maxW = w * 0.92;
  while (fs > 8 && g.measureText(text).width > maxW) { fs -= 2; g.font = `${weight} ${fs}px ${F}`; }
  // 描边（客户 2026-11-03）：区号压在半透明的蓝带和浅灰路面上，纯白在浅灰上会糊掉 ⇒ 加一圈深色描边
  if (outline) {
    g.strokeStyle = outline;
    g.lineWidth = Math.max(2, Math.round(fs * outlineW));
    g.lineJoin = 'round';
    g.strokeText(text, w / 2, sub ? h * 0.42 : h * 0.5);
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, sub ? h * 0.42 : h * 0.5);
  if (sub) {
    g.font = `700 ${Math.round(h * 0.13)}px ${THEME.font.num}`;
    g.fillStyle = subColor;
    g.fillText(sub, w / 2, h * 0.78);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color: col(color), ...o });

/** 路面质感贴图（按画风）：none=纯色，blob=卡通笔触，fibre=剪纸纸纹 */
function makeAsphalt(base, kind, seed = 7) {
  if (!kind || kind === 'none') return null;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (kind === 'blob') {
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 3 + rnd() * 16;
      g.globalAlpha = 0.05 + rnd() * 0.09;
      g.fillStyle = rnd() > 0.5 ? '#FFFFFF' : '#1B2430';
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.7), rnd() * 3.14, 0, 6.283); g.fill();
    }
  } else {
    for (let i = 0; i < 900; i++) {
      const y = rnd() * 256, x = rnd() * 256, w = 6 + rnd() * 46;
      g.globalAlpha = 0.04 + rnd() * 0.10;
      g.fillStyle = rnd() > 0.45 ? '#FFFFFF' : '#2A2118';
      g.fillRect(x, y, w, 1 + rnd() * 1.6);
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 沿折线从首端裁掉 d 米（超出长度就只剩末点） */
function trimHead(pts, d) {
  if (!(d > 0)) return pts.slice();
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L >= d) {
      const k = (d - acc) / (L || 1);
      const p = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      return [p, ...pts.slice(i)];
    }
    acc += L;
  }
  return [pts[pts.length - 1].slice()];
}

/** 沿折线从末端裁掉「离末点不到 d 米」的所有点（在圆弧上按弧长裁会偏，按直线距离裁更稳） */
function trimTailNear(pts, d) {
  const last = pts[pts.length - 1];
  let i = pts.length - 1;
  while (i > 0 && Math.hypot(pts[i - 1][0] - last[0], pts[i - 1][1] - last[1]) < d) i--;
  return pts.slice(0, i + 1);
}

/** 沿折线从末端裁掉 d 米 */
function trimTail(pts, d) { return trimHead(pts.slice().reverse(), d).reverse(); }

/** 二次贝塞尔圆角：A → 控制点 C → B（含两端点） */
function quadArc(A, C, B, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * A[0] + 2 * s * t * C[0] + t * t * B[0], s * s * A[1] + 2 * s * t * C[1] + t * t * B[1]]);
  }
  return out;
}

/** 三个点里 A→C 的单位方向（C 为角点） */
function dirInto(A, C) {
  const dx = C[0] - A[0], dz = C[1] - A[1], L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
}

/**
 * 过 A 点、并在 Q 点与方向 e **相切**的圆弧（用来把支路西边界平滑地并进主路外缘）。
 *   圆心 O = Q + n·t（n 为 e 的左法线），由 |OA| = |t| 解出 t = |AQ|² / (2·n·AQ)。
 *   返回值从 A 走到 Q；t 为负说明圆心在另一侧。
 */
function arcThrough(A, Q, e, n = 40) {
  const nx = -e[1], nz = e[0];
  const ax = A[0] - Q[0], az = A[1] - Q[1];
  const den = 2 * (nx * ax + nz * az);
  if (Math.abs(den) < 1e-6) return null;
  const t = (ax * ax + az * az) / den;
  const O = [Q[0] + nx * t, Q[1] + nz * t];
  const R = Math.abs(t);
  const a0 = Math.atan2(A[1] - O[1], A[0] - O[0]);      // 从 A 出发
  const a1 = Math.atan2(Q[1] - O[1], Q[0] - O[0]);      // 到 Q 收口
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const pts = [];
  const nn = Math.max(n, Math.ceil(Math.abs(da) / 0.06));
  for (let i = 0; i <= nn; i++) {
    const a = a0 + (da * i) / nn;
    pts.push([O[0] + Math.cos(a) * R, O[1] + Math.sin(a) * R]);
  }
  return { pts, R, t, sweep: da };
}

/**
 * 经过若干指定点、两端切线可控的平滑曲线（分段 Hermite）。
 *   客户 2026-11-08-j 给的三个点必须严格落在边界上，而且两端都要和相邻边**相切**：
 *     过 A 的切线 = 支路口那条直线（不翻折），过 Q 的切线 = 主路外缘切线（不交叉）。
 *   用圆弧做不到 —— 三点定圆的弧在 Q 处与路缘成一定角度，会在接点前来回穿一次（实测自交 2 处）。
 */
function hermitePath(pts, tanA, tanZ, n = 70) {
  const k = pts.length - 1;
  const tang = new Array(pts.length);
  tang[0] = tanA;
  tang[k] = tanZ;
  for (let i = 1; i < k; i++) {
    const d = V2.sub(pts[i + 1], pts[i - 1]);
    const L = V2.len(d) || 1;
    const sc = (V2.len(V2.sub(pts[i], pts[i - 1])) + V2.len(V2.sub(pts[i + 1], pts[i]))) / 2;
    tang[i] = [(d[0] / L) * sc, (d[1] / L) * sc];
  }
  const out = [];
  for (let i = 0; i < k; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const m0 = tang[i], m1 = tang[i + 1];
    for (let j = i === 0 ? 0 : 1; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([
        h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
        h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
      ]);
    }
  }
  return out;
}

const V2 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  len: (a) => Math.hypot(a[0], a[1]),
  unit: (a) => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; },
};

/**
 * 真·圆角（圆，不是二次贝塞尔近似）。
 *   P = 角点；u = 从角点指回上一个点的单位向量；v = 从角点指向下一个点的单位向量。
 *   切线长 t = R / tan(θ/2) —— **这里必须是 tan，不是 R**：
 *   夹角很缓的时候 t 会远大于 R，若直接按 R 裁剪，贝塞尔的端点会落在切点之外，
 *   弧线就会朝外鼓成一个尖嘴（客户 2026-11-08 说的「弧线画反了」就是这个）。
 *   返回 { t, pts }；pts 从切点 T1 到切点 T2，两端分别落在两条边上。
 */
function filletArc(P, u, v, R, n = 14) {
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
  const th = Math.acos(dot);                       // 内角
  if (!(th > 0.06) || th > Math.PI - 0.06) return null;   // 共线 / 折回：没法做圆角
  const t = R / Math.tan(th / 2);
  const T1 = [P[0] + u[0] * t, P[1] + u[1] * t];
  const T2 = [P[0] + v[0] * t, P[1] + v[1] * t];
  const w = (() => { const dx = u[0] + v[0], dz = u[1] + v[1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; })();
  const d = R / Math.sin(th / 2);
  const O = [P[0] + w[0] * d, P[1] + w[1] * d];
  const a0 = Math.atan2(T1[1] - O[1], T1[0] - O[0]);
  const a1 = Math.atan2(T2[1] - O[1], T2[0] - O[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (da * i) / n;
    pts.push([O[0] + Math.cos(a) * R, O[1] + Math.sin(a) * R]);
  }
  return { t, pts, th };
}

/**
 * 凹圆角（喇叭口）：交汇处是**反角**，路面要往外「补料」。
 *   圆心和凸圆角一样在角平分线上、距 P 为 d = R/sin(θ/2)，切点也在 P + u·t / P + v·t
 *   （t = R/tan(θ/2)）—— 唯一区别是弧要**绕远路**：跨 2π−θ 而不是 θ。
 *   2026-11-08-f 修正：之前把圆心放到反侧还取了近弧，切点压根不在圆上，
 *   三角化出来的三角形会飞出几十米，把 B 区一角啃掉（客户报的「B 区被侵蚀」）。
 */
function flareArc(P, u, v, R, n = 20) {
  const f = filletArc(P, u, v, R, n);
  if (!f) return null;
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
  const th = Math.acos(dot);
  const t = R / Math.tan(th / 2);
  const T1 = [P[0] + u[0] * t, P[1] + u[1] * t];
  const T2 = [P[0] + v[0] * t, P[1] + v[1] * t];
  const w = V2.unit([u[0] + v[0], u[1] + v[1]]);
  const d = R / Math.sin(th / 2);
  const O = [P[0] + w[0] * d, P[1] + w[1] * d];
  const a0 = Math.atan2(T1[1] - O[1], T1[0] - O[0]);
  const a1 = Math.atan2(T2[1] - O[1], T2[0] - O[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  da += da > 0 ? -Math.PI * 2 : Math.PI * 2;      // 取远弧（凹圆角）
  const pts = [];
  const nn = Math.max(n, Math.ceil(Math.abs(da) / 0.12));
  for (let i = 0; i <= nn; i++) {
    const a = a0 + (da * i) / nn;
    pts.push([O[0] + Math.cos(a) * R, O[1] + Math.sin(a) * R]);
  }
  return { t, pts, th, R, far: Math.hypot(O[0] - P[0], O[1] - P[1]) + R };
}

export class VenueWorld {
  constructor(canvas, { dpr = 1, w = 1920, h = 1080 } = {}) {
    this.W = w; this.H = h;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(dpr); r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = false;
    const sc = this.scene = new THREE.Scene();
    sc.background = col(M.backdrop);
    this.camera = new THREE.PerspectiveCamera(V_FOV, w / h, 0.6, 4000);

    sc.add(new THREE.HemisphereLight(0xffffff, 0xDCD3C4, 2.3));
    const sun = this.sun = new THREE.DirectionalLight(0xfff6e8, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.06;          // setCamera() 里按视锥大小重算（见 buildShadow）
    sc.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.45, 0.82, 0.36).normalize();

    this.uTime = { value: 0 };
    this.phase = 'start';
    this.tt = 0;
    this._rect = { x: 0, y: 0, w, h };
    this._dist = 100;
    this.confetti = null;

    this.planJunction();
    this.buildSky();
    this.buildGround();
    this.buildJunction();
    this.buildRoadMarks();
    this.buildArch();
    this.buildCorrals();
    this.buildBarriers();
    this.buildProps();
    this.buildUrban();
    this.buildCrowd();
    this.buildFinishMarks();
    this.buildConfetti();
    this.buildGuns();
  }

  // ── 地面工具
  plane(x0, x1, z0, z1, y, color, order = 0, opts = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(color, opts));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  poly(pts, y, color, order = 0, opts = {}) {
    // 2026-11-08：原来用 THREE.Shape + ShapeGeometry，对 C 区路口这种长凹多边形
    //   三角化会失败（实测上半截整块没填）。改成显式 ShapeUtils.triangulateShape。
    //   opts.uvScale：给顶点写世界坐标 uv，用来贴和主路同一张沥青图（材质一致性）。
    const v2 = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    const pos = [], uv = [];
    const us = opts.uvScale || 0, uvf = opts.uvFn || null;
    for (const [a, b, c] of tris) {
      // 绕序归一：y 分量朝上才是正面。DoubleSide 下背面会把法线翻成 (0,−1,0)，
      //   整块路面就吃不到上方灯光，渲染出来比主路暗两档（踩过）。
      const ax = pts[a][0], az = pts[a][1], bx = pts[b][0], bz = pts[b][1], cx = pts[c][0], cz = pts[c][1];
      const ny = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const tri = ny > 0 ? [a, c, b] : [a, b, c];   // ny = −(法线 y)，所以 >0 才是背面
      for (const k of tri) {
        pos.push(pts[k][0], 0, pts[k][1]);
        if (uvf) uv.push(uvf[0](pts[k][0], pts[k][1]), uvf[1](pts[k][0], pts[k][1]));
        else if (us) uv.push(pts[k][0] / us, pts[k][1] / us);
      }
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
    if (us || uvf) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide, ...opts }));
    m.position.y = y;
    m.receiveShadow = opts.receiveShadow !== false;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }




/** 沿中心线两侧偏移 d0..d1 的铺装带（d<0 = 行进方向的东/右一侧） */
  strip(pts, d0, d1, y, color, order = 0, opts = {}) {
    const n = pts.length;
    const pos = [];
    const norm = (i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      return [-dz / L, dx / L];
    };
    const verts = [];
    for (let i = 0; i < n; i++) {
      const [nx, nz] = norm(i);
      verts.push([pts[i][0] + nx * d0, pts[i][1] + nz * d0]);
      verts.push([pts[i][0] + nx * d1, pts[i][1] + nz * d1]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = verts[i * 2], b = verts[i * 2 + 1], c = verts[i * 2 + 2], d = verts[i * 2 + 3];
      pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
      pos.push(b[0], y, b[1], d[0], y, d[1], c[0], y, c[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide, ...opts }));
    m.receiveShadow = true;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  /** 多边形铺装（以质心扇形三角化；ShapeGeometry 对 C 区这种细长形会失败） */
  fanPoly(pts, y, color, order = 0, opts = {}) {
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
    const cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const pos = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pos.push(cx, y, cz, a[0], y, a[1], b[0], y, b[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide, ...opts }));
    m.receiveShadow = true;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  /** 两条边界之间的铺装带（比 ShapeGeometry 稳：C 区这种细长凹多边形三角化会失败） */
  belt(A, B, y, color, order = 0, opts = {}) {
    const rs = (pts, n) => {
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const tot = L[L.length - 1] || 1, out = [];
      for (let k = 0; k <= n; k++) {
        const d = (tot * k) / n;
        let i = 1;
        while (i < L.length - 1 && L[i] < d) i++;
        const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
      }
      return out;
    };
    const N = 16, a = rs(A, N), b = rs(B, N);
    const pos = [];
    for (let i = 0; i < N; i++) {
      pos.push(a[i][0], y, a[i][1], b[i][0], y, b[i][1], a[i + 1][0], y, a[i + 1][1]);
      pos.push(b[i][0], y, b[i][1], b[i + 1][0], y, b[i + 1][1], a[i + 1][0], y, a[i + 1][1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, opts.material || mat(color, { side: THREE.DoubleSide, ...opts }));
    m.receiveShadow = true;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  /** 澜湾北路中心线：直线段 → 南端圆弧 → 直出 */
  /** 中心线（几何在 config/bend.js，俯视图与 3D 共用同一份） */
  roadPath() { return bendPath(V); }

  /** 沿中心线按弧长取子路径 */
  subPath(s0, s1, step = 2) { return subPath(s0, s1, step, V); }

  /** 弯道上弧长 s 处的点（C 区的字 / 发枪点都按它落位） */
  cPoint(s) { return cPoint(s, V); }

  /** 点到中心线的最短距离（绿化避让用） */
  distToPath(x, z) {
    const all = this.path || (this.path = this.roadPath());
    let best = 1e9;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      best = Math.min(best, Math.hypot(x - (a[0] + dx * k), z - (a[1] + dz * k)));
    }
    return best;
  }

  /** 中心线上 t∈[0,1] 处的点与偏移 */
  pathAt(u, d = 0) {
    const p = this.path || (this.path = this.roadPath());
    const f = u * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), k = f - i;
    const a = p[i], b = p[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    return [a[0] + dx * k + nx * d, a[1] + dz * k + nz * d];
  }

  /** 面向镜头的文字（区号 A/B/C）：每帧抄一次相机四元数，无论从哪个角度看都是正的 */
  billboardText(text, x, z, y, sizeM, color, opacity = 0.95) {
    const t = texText({ text, w: 256, h: 256, bg: null, color, size: 0.82, weight: 900 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sizeM, sizeM),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.renderOrder = 7;
    m.userData.billboard = true;
    this.scene.add(m);
    (this.billboards || (this.billboards = [])).push(m);
    return m;
  }

  /** 贴地文字：up='north' 给朝北跑的人读，'south' 给冲向终点的人读 */
  groundText(text, x, z, color, { up = 'north', y = 0.2, w = 8, h = 4, bg = null, opacity = 0.95, sub = '', size = 0.72, name = '', order = 3, outline = null, outlineW = 0.09 } = {}) {
    const t = texText({ text, sub, w: 512, h: 256, bg, color, size, weight: 900, outline, outlineW });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = up === 'north' ? -Math.PI / 2 : up === 'south' ? Math.PI / 2 : up;
    m.position.set(x, y, z);
    m.renderOrder = order;          // 客户 2026-11-03：区号必须画在所有地面涂装**之后**
    if (name) m.name = name;
    this.scene.add(m);
    return m;
  }

  // ── 天空：竖直渐变穹顶 + 雾
  buildSky() {
    const { zenith, mid, horizon } = this.skyColors();
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 512;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    // 球体 v=0 在顶部（天顶），地平线在 v≈0.5
    grd.addColorStop(0.00, zenith);
    grd.addColorStop(0.24, zenith);
    grd.addColorStop(0.34, mid);
    grd.addColorStop(0.44, mid);
    grd.addColorStop(0.497, horizon);
    grd.addColorStop(0.512, horizon);
    grd.addColorStop(0.56, mid);
    grd.addColorStop(0.70, zenith);
    grd.addColorStop(1.00, zenith);
    g.fillStyle = grd; g.fillRect(0, 0, 8, 512);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 32, 20),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.scene.add(dome);
    this.skyDome = dome;
    this.scene.fog = new THREE.Fog(col(horizon), 300, 1100);
  }

  skyColors() {
    const b = M.backdrop;
    const mix = (a, c, k) => '#' + [0, 2, 4].map((i) => Math.round(
      parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(c.slice(1 + i, 3 + i), 16) * k,
    ).toString(16).padStart(2, '0')).join('');
    return { zenith: b, mid: mix(b, '#FFF1D6', 0.34), horizon: mix(b, '#FFF1D6', 0.62) };
  }

  // ── 地面
  buildGround() {
    this.plane(V.park.x0, V.park.x1, V.park.z0, V.park.z1, -0.10, M.greenDark, -7);
    this.plane(V.park.x0, V.park.x1, V.park.z0, V.park.z1, -0.06, M.green, -6);
    this.pondMesh = this.poly(V.pond, -0.02, M.water, -5);
    this.pondMesh.name = 'pond';
    this.plane(V.plaza.x0, V.plaza.x1, V.plaza.z0, V.plaza.z1, 0.0, VN.plaza, -4);
    this.plane(V.city.x0, V.city.x1, V.city.z0, V.city.z1, 0.0, VN.city, -4);
    // 人行道
    const R = V.road;
    this.plane(R.x0, R.x1, -R.halfW - V.walk.w, -R.halfW, 0.05, M.sand, -3);
    this.plane(R.x0, R.x1, R.halfW, R.halfW + V.walk.w, 0.05, M.sand, -3);
    // 弯道铺装（C 区所在的转角）
    // 转角铺装缩小到 C 区之外（原来 -150..-70 × -12..74 的一大块灰色把 C 区边上一半路面涂灰了）
    this.plane(-165, -128, -30, 74, 0.02, M.sand, -3.5);
    // 2026-11-08-h：西侧地块之间漏了一块（x −128…−76, z −30…13）—— 城/广场/沙色铺装谁都不覆盖，
    //   渲染出来直接看到背景色（浅蓝）。客户圈的那条"浅蓝带"就是这块洞。
    // 2026-11-08-i：**必须和停车场铺面错开**。停车场铺面在 y = 0.015、范围 z −45…−32，
    //   上一版把补丁也铺在 0.015 并压到 z = −34；两块不透明面深度值完全相等 ⇒
    //   谁先画谁赢，交界处就是一圈锯齿（客户说的「黄色矩形和灰色共面」）。
    //   现在补丁从 z = −30 起（城/停车场都在 −30 以北），只跟沙色铺装边对边相邻，绝不重叠。
    //   颜色/高度都用**城地坪**那一套（VN.city @ y=0），接缝处看不出补丁；
    //   与城地坪、广场都是边对边相邻，没有一处重叠。
    this.plane(-128, -86, -30, 13, 0.0, VN.city, -4);        // 西块
    this.plane(-86, -76, -11, 13, 0.0, VN.city, -4);         // 东窄条（避开广场 z −30…−11）
    // 车行道：直线段
    const road = this.plane(R.x0, R.x1, -R.halfW, R.halfW, 0.10, M.roadCasing, -2);
    road.name = 'road';
    this.roadMesh = road;
    const tex = makeAsphalt(VN.asphalt, VN.roadTex);
    if (tex) tex.repeat.set(48, 3);
    const asp = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.halfW * 2),
      new THREE.MeshLambertMaterial({ color: col(tex ? '#FFFFFF' : (VN.road || VN.asphalt)), map: tex || null }));
    asp.rotation.x = -Math.PI / 2;
    asp.position.set((R.x0 + R.x1) / 2, 0.11, 0);
    asp.receiveShadow = true;
    asp.renderOrder = -1;
    this.scene.add(asp);
    this.aspMat = asp.material;          // 2026-11-08：C 区路口要跟它用同一个材质实例，颜色才不会差一档
    // C 区：沿弯道的**等宽集结带**（客户 2026-11-03）—— 与 A/B 同宽 19 m，
    //   从弯道起点往南铺 58 m，路面跟着它一起拐
    const CZ = V.zoneC;
    this.zoneC = this.strip(this.subPath(CZ.arc0, CZ.arc1, 2), -CZ.halfW, CZ.halfW, 0.34, CZ.color, 6,
      { transparent: true, opacity: 0.62 });
    // 弯道：中心线 ribbon —— 路面 / 边线都沿同一条路径，且抬高到 C 区涂装之上，
    // 让它从 C 区中间穿过去（C 区是拐角处的集结带，路面不能被涂装盖住）
    const p = this.path = this.roadPath();
    // 只画弯道那一段（直线段已有自己的路面；整条画会把 A/B 分区涂装盖掉）
    const i0 = p.findIndex(([x]) => x <= R.x0 + 0.01);
    const pb = p.slice(Math.max(0, i0 - 1));
    this.strip(pb, -R.halfW, R.halfW, 0.24, M.roadCasing, 4);
    this.roadSurfMat = this.strip(pb, -R.halfW, R.halfW, 0.25, VN.road || VN.asphalt, 4).material;
    for (const s of [-1, 1]) this.strip(pb, s * (R.halfW - 0.78), s * (R.halfW - 0.52), 0.255, '#FFFFFF', 4, { transparent: true, opacity: 0.92 });
  }

  // ── C 区三岔路口
  //    结构：支路从西北进来（A→Q 斜边），在 Q 处以**凹喇叭口**并到主路西侧；
  //          主路外缘从 Q 走到 P2；P2 处再一个**凹喇叭口**接支路东边；东边直线到 B；
  //          B、A 两个「口角」用普通凸圆角收头。
  //    客户 2026-11-08-b：「弧线画反了」= 交汇处那两个角是反角，圆角要往外补料；
  //          按普通圆角往里切，就会切出一个缺口，看起来就是弧线反了。
  planJunction() {
    const JG = V.junction;
    if (!JG) { this.junction = null; return; }
    const H = V.road.halfW;
    const arcP = arcPoints(0, bendLen(V), 240, V);
    const edge = [];
    for (let i = 0; i < arcP.length; i++) {
      const a = arcP[Math.max(0, i - 1)], b = arcP[Math.min(arcP.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      edge.push([arcP[i][0] - (dz / L) * H, arcP[i][1] + (dx / L) * H]);
    }
    const A = [JG.nw[0], JG.nw[1]];               // 支路口西角
    const B = [JG.east[0], JG.east[1]];           // 支路口东角
    const P2 = edge[0];                           // 主路外缘回到直路的那一端
    // Q（平面图 6 点）：客户给的是近似坐标，吸附到主路外缘上最近的那一点，接缝才严丝合缝
    const QG = JG.q || [-131.5, 27.4];
    let iQ = 0, bd = 1e9;
    for (let i = 0; i < edge.length; i++) {
      const d = Math.hypot(edge[i][0] - QG[0], edge[i][1] - QG[1]);
      if (d < bd) { bd = d; iQ = i; }
    }
    const Q = edge[iQ];
    const chain = [Q];
    for (let i = iQ - 1; i >= 1; i--) chain.push(edge[i]);
    chain.push(P2);
    if (chain.length < 3) { this.junction = null; return; }

    // 四个角
    // 西边界：严格经过 A(8) → arcMid(5) → Q(6) 三点，两端切线对齐相邻边
    //   过 A 的切线 = 支路口那条直线方向（朝 B），所以 A 处不翻折；
    //   过 Q 的切线 = 主路外缘在 Q 处的切线，所以并线处不交叉。
    const MID = JG.arcMid || [-126.8, -24.1];
    const tA = V2.sub(B, A);
    const tQ = V2.sub(edge[Math.max(0, iQ - 1)], Q);
    const westArc = { pts: hermitePath([A, MID, Q], [tA[0] * 0.55, tA[1] * 0.55], [tQ[0] * 0.45, tQ[1] * 0.45], 70) };
    // A 角**不做圆角**：它是反角（内角 246°），往里切会翻折出一个小环（实测多边形自交）。
    //   这个角在路口西北口，本来就在画面外/边缘，直边直角的观感最干净。
    const fA = null;
    const fB = filletArc(B, V2.unit(V2.sub(P2, B)), V2.unit(V2.sub(A, B)), 11, 14);   // 口角
    // P2 处**不做圆角**（客户 2026-11-08-g）：P2 是主路外缘回到直路的那一点，
    //   在这里切一刀就等于把铺装从 Y 形的第三个叉口上切开 13 m，
    //   中间露出一条奶油色楔子 —— 客户说的「Y 字形又没连在一起」就是它。
    //   铺装必须精确走到 P2（x = −76.3），在那儿直接并入主路北边线。
    const westRaw = westArc ? westArc.pts : [A, Q];
    const westT = trimHead(westRaw, fA ? fA.t : 0);           // 尾端就是 Q，不裁
    const chainT = chain;                                     // 末端必须停在 P2，不许裁
    const neRaw = [P2, B];
    const neT = trimTail(neRaw, fB ? fB.t : 0);
    const topRaw = [B, A];
    const topT = trimTail(trimHead(topRaw, fB ? fB.t : 0), fA ? fA.t : 0);

    const pieces = [
      { key: 'west', pts: westT },
      { key: 'edge', pts: chainT },
      { key: 'ne', pts: neT },
      fB ? { key: 'fB', pts: fB.pts } : null,
      { key: 'top', pts: topT },
      fA ? { key: 'fA', pts: fA.pts } : null,
    ].filter(Boolean);
    const dedupe = (dst, pts) => {
      for (const q of pts) {
        const last = dst[dst.length - 1];
        if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.02) dst.push(q);
      }
    };
    const loop = [];
    for (const pc of pieces) dedupe(loop, pc.pts);
    // 白线：只描「不在主路路面上」的段（铺装压在主路下面，压进去的部分本来就看不见）
    const raw = [];
    for (const k of ['ne', 'fB', 'top', 'fA', 'west']) {
      const pc = pieces.find((q) => q.key === k);
      if (pc) dedupe(raw, pc.pts);
    }
    // 白线的收口：一直画到主路自己那条边线上（halfW − 0.20）。
    //   之前用 halfW + 0.15，会在合并处提前断掉，留下一个灰白色的小台阶（客户圈过）。
    const HW = V.road.halfW - 0.20;
    const runs = [];
    let cur = null;
    for (const q of raw) {
      if (this.distToPath(q[0], q[1]) > HW) { if (!cur) { cur = []; runs.push(cur); } cur.push(q); } else cur = null;
    }
    let line = runs.reduce((a, b) => (b.length > a.length ? b : a), []);
    // 末端（并进主路的那一头）再退 2 m：主路自己那条边线就在旁边 0.1 m 处，
    //   退开之后两头自然对接，不会在 C 带上留下一小段"白色刀尖"。
    line = trimTailNear(line, 2.0);
    const spans = {};
    let acc = 0;
    for (const pc of pieces) { spans[pc.key] = [acc, acc + pc.pts.length]; acc += pc.pts.length; }
    this.junction = {
      poly: loop, line, nw: A, east: B, J1: Q, J2: P2, spans,
      th: { A: fA && +fA.th.toFixed(3), B: fB && +fB.th.toFixed(3) },
      mid: MID, q: Q, qReq: QG,
    };
  }

  /** 点是否落在路口（含 pad 米余量）—— 楼 / 车 / 人 / 景物用它做剔除 */
  inJunction(x, z, pad = 0) {
    const J = this.junction;
    if (!J) return false;
    const P = J.poly;
    let inside = false;
    for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
      const a = P[i], b = P[k];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1] || 1e-9) + a[0]) inside = !inside;
    }
    if (inside) return true;
    if (pad <= 0) return false;
    for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
      const a = P[i], b = P[k];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      if (Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) <= pad) return true;
    }
    return false;
  }

  buildJunction() {
    const J = this.junction;
    if (!J) return;
    // 材质与主路一致：同一张沥青图 + 同样的 uv 尺度（主路 349 m / 48 次重复 ≈ 7.3 m 一格）
    // 客户 2026-11-08：路面颜色必须和主路一致 ⇒ 直接用主路车行道那个颜色（VN.road），不另起贴图。
    //   （之前用 makeAsphalt 的贴图，实际渲染出来偏暖一档，和主路的冷灰对不上）
    // 客户 2026-11-08：材质必须和主路完全一致 ⇒ 直接复用弯道那块路面的**材质实例**
    this.junctionMesh = this.poly(J.poly, 0.246, '#CED1D6', 5, { material: this.roadSurfMat, receiveShadow: false });
    // 沿铺装外沿描一条白线（不吃主路那一段，见 planJunction 里的说明）
    const P = J.poly;
    let area2 = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area2 += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area2 > 0 ? 1 : -1;             // 保证往里缩，不会描到铺装外面的米色地上
    const L = J.line || P;
    const closed = L.map((q, i) => {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      return [q[0] - (dz / len) * 0.42 * sgn, q[1] + (dx / len) * 0.42 * sgn];
    });
    this.strip(closed, -0.22, 0.22, 0.268, '#FFFFFF', 6, { transparent: true, opacity: 0.92 });
  }
  /** 舞台 + 台阶的占地（水马 / 反光锥不能摆进来，否则会和台阶立面穿模）。
   *  注意台阶只有 6 m 宽（x = stage.x+1 ± 3），比台面窄得多 ——
   *  统一按台面宽度排除会把台面左右两侧的锥一起误删（踩过）。 */
  stageFoot(pad = 0) {
    const S = V.stage;
    const stepZ = S.z + S.d / 2 + 0.6 + 2 * 1.1 + 0.55;      // 第三级台阶的外沿 ≈ z −9.35
    const sx = S.x + 1;
    return [
      { x0: S.x - S.w / 2 - pad, x1: S.x + S.w / 2 + pad, z0: S.z - S.d / 2 - pad, z1: S.z + S.d / 2 + pad },  // 台面
      { x0: sx - 3 - pad, x1: sx + 3 + pad, z0: S.z + S.d / 2 - pad, z1: stepZ + pad },                        // 三级台阶
    ];
  }

  inStageFoot(x, z, pad = 0) {
    return this.stageFoot(pad).some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);
  }

  // ── 冲刺阶段的赛道陈设（客户 2026-11-08）：不要 A/B/C 分区，要水马 + 反光锥
  buildBarriers() {
    const R = V.road;
    const g = new THREE.Group();
    g.visible = false;
    this.scene.add(g);
    this.barrierGroup = g;
    const boxW = 0.62, boxH = 0.86, unit = 2.0, y0 = 0.25;
    const bodyMat = mat('#F7F9FB');
    const beltH = mat(THEME.route.half), beltF = mat(THEME.route.full);
    const coneMat = mat('#F4701E'), baseMat = mat('#2B2B2B'), bandMat = mat('#FFFFFF');
    let k = 0;
    for (const sd of [-1, 1]) {
      const z = sd * (R.halfW - 1.0);
      for (let x = -76; x <= 8; x += unit) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(unit - 0.14, boxH, boxW), bodyMat);
        b.position.set(x + unit / 2, y0 + boxH / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        g.add(b);
        const belt = new THREE.Mesh(new THREE.BoxGeometry(unit - 0.12, 0.16, boxW + 0.02), (k++ % 4) < 2 ? beltH : beltF);
        belt.position.set(x + unit / 2, y0 + boxH * 0.62, z);
        g.add(belt);
      }
      for (let x = 12; x <= 70; x += 4) {
        // 客户 2026-11-08-d：舞台台前的三级台阶一直铺到 z≈−9.35，而锥筒正好在 z=±10 的线上，
        //   有两个锥（x=20 / x=24）直接插进台阶立面 —— 跳过舞台占地，别穿模。
        if (this.inStageFoot(x, z, 0.9)) continue;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.62, 10), coneMat);
        c.position.set(x, y0 + 0.31, z); c.castShadow = true; g.add(c);
        const bs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), baseMat);
        bs.position.set(x, y0 + 0.025, z); g.add(bs);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.117, 0.147, 0.10, 10), bandMat);
        band.position.set(x, y0 + 0.42, z); g.add(band);
      }
    }
  }

  /** 'start' = 显示 A/B/C 分区涂装；其它 = 显示水马 + 反光锥
   *  注意：不要叫 setPhase —— 那个名字已经被「起跑/终点标识切换」占了，重名会被后者覆盖掉 */
  setCorralPhase(kind) {
    const start = kind === 'start';
    for (const m of this.zoneMats || []) m.visible = start;
    for (const m of this.zoneRails || []) m.visible = start;
    for (const m of this.zoneTexts || []) m.visible = start;
    if (this.zoneC) this.zoneC.visible = start;
    if (this.barrierGroup) this.barrierGroup.visible = !start;
  }


  buildRoadMarks() {
    const sc = this.scene;
    const white = new THREE.MeshLambertMaterial({ color: col('#FFFFFF'), transparent: true, opacity: 0.92 });
    const stripe = (x, z, w, d, y = 0.13, m = white) => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      q.rotation.x = -Math.PI / 2;
      q.position.set(x, y, z);
      q.renderOrder = 0;
      sc.add(q);
      return q;
    };
    const R = V.road;
    const inZone = (x) => V.zones.some((z) => x <= z.x1 + 1 && x >= z.x0 - 1);
    for (let x = R.x0 + 6; x < R.x1; x += 9) if (!inZone(x)) stripe(x, 0, 3.6, 0.28);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, 0.26), white);
      m.rotation.x = -Math.PI / 2; m.position.set((R.x0 + R.x1) / 2, 0.13, s * (R.halfW - 0.7));
      m.renderOrder = 0; sc.add(m);
    }
    for (const z of [-7.2, -3.6, 3.6, 7.2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, 0.14),
        new THREE.MeshLambertMaterial({ color: col('#FFFFFF'), transparent: true, opacity: 0.42 }));
      m.rotation.x = -Math.PI / 2; m.position.set((R.x0 + R.x1) / 2, 0.128, z);
      m.renderOrder = 0; sc.add(m);
    }
    // 230 m 刻度：地面数字（给冲向终点的人读）+ 路缘立牌
    for (const d of V.marks) {
      this.groundText(String(d), d, 0, '#FFFFFF', { up: 'south', y: 0.19, w: 4.4, h: 2.75, opacity: 0.8, size: 0.62 });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1),
        new THREE.MeshBasicMaterial({ map: texText({ text: `${d}m`, w: 320, h: 160, bg: '#14284A', color: '#FFFFFF', sub: '', size: 0.5, font: THEME.font.num }), transparent: true, side: THREE.DoubleSide }));
      board.position.set(d, 1.5, R.halfW + 1.1);
      board.renderOrder = 2;
      sc.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), mat('#5B6570'));
      post.position.set(d, 0.75, R.halfW + 1.1);
      post.castShadow = true;
      sc.add(post);
    }
    // 公园里的树
    for (let i = 0; i < 46; i++) {
      const x = V.park.x0 + 20 + ((V.park.x1 - V.park.x0 - 40) * i) / 45;
      const z = 26 + ((i * 37) % 13);
      if (this.distToPath(x, z) < 15) continue;      // 弯道与 C 带上不种树
      if (x < -70) continue;                             // 转角广场与弯道留空
      const h = 5.5 + ((i * 13) % 4);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, h * 0.45, 6), mat(M.trunk));
      trunk.position.set(x, h * 0.22, z);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(h * 0.46, h * 0.95, 7), mat(M.tree[i % M.tree.length]));
      crown.position.set(x, h * 0.45 + h * 0.4, z);
      crown.castShadow = true;
      sc.add(trunk, crown);
    }
    // 客户 2026-10-31 ①：右侧那道 7.5 m 高的绿坝去掉（改成低矮的树冠带，不再是一条高墙）
    for (let i = 0; i < 26; i++) {
      const x = V.park.x0 + 30 + ((V.park.x1 - V.park.x0 - 60) * i) / 25;
      const h = 4.2 + ((i * 17) % 3);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, h, 7), mat(M.tree[i % M.tree.length]));
      crown.position.set(x, h / 2, 74);
      sc.add(crown);
    }
    // 城市地块
    for (const b of V.blocks) {
      // 客户 2026-10-31 ⑤：原来这几栋 11–20 m 的灰盒子会从舞台背板后面穿出来，整块删掉，
      //   只留地面上的地块名（远景靠雾收掉，不再有体块）
      this.groundText(b.name, b.x, -31.4, '#FFFFFF', { up: 'north', w: Math.min(b.w * 0.8, 22), h: 4.6, opacity: 0.9, size: 0.55 });
    }
    for (const s of V.streets) {
      if (s.diag) continue;
      this.plane(s.x - 4, s.x + 4, V.city.z0, V.city.z1, 0.02, M.roadCasing, -3.2);
      const q = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 13), new THREE.MeshBasicMaterial({
        map: texText({ text: s.name, w: 160, h: 512, bg: null, color: '#FFFFFF', size: 0.72 }), transparent: true, opacity: 0.75, depthWrite: false,
      }));
      q.rotation.x = -Math.PI / 2;
      q.position.set(s.x, 0.09, -38);
      q.renderOrder = 1;
      sc.add(q);
    }
    // 沿路彩旗（西侧广场边一排）
    const flagCols = THEME.route ? [THEME.route.full, THEME.route.half, THEME.hud.gold] : ['#2E7BFF'];
    let fi = 0;
    for (let x = -60; x <= 250; x += V.flagStep) {
      if (Math.abs(x - V.stage.x) < 20) { fi++; continue; }   // 舞台正前方不立旗（近景会横穿画面）
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 6), mat('#B9BEC4'));
      pole.position.set(x, 2.3, -(V.road.halfW + 2.9));
      pole.castShadow = true;
      sc.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0),
        new THREE.MeshLambertMaterial({ color: col(flagCols[fi % flagCols.length]), side: THREE.DoubleSide }));
      flag.position.set(x + 0.78, 4.0, -(V.road.halfW + 2.9));
      flag.rotation.y = Math.PI / 2;
      sc.add(flag);
      fi++;
    }
  }

  // ── 起终点拱门（2 柱 + 横梁 + 横幅 + 计时牌）
  buildArch() {
    const sc = this.scene;
    const { x, span, clear, depth } = V.arch;
    const postW = 1.7;
    const postMat = mat(THEME.arch.post[2]);
    this.archPillars = [];
    for (const s of [-1, 1]) {
      const h = clear + 1.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(depth, h, postW), postMat);
      m.position.set(x, h / 2, s * (span / 2));
      m.castShadow = true; m.receiveShadow = true;
      sc.add(m);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.1, 0.55, postW + 1.1), mat('#3A4652'));
      foot.position.set(x, 0.28, s * (span / 2));
      foot.receiveShadow = true;
      sc.add(foot);
      this.archPillars.push(m);
    }
    const beamH = 2.5;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, beamH, span + postW + 1.4), mat(THEME.arch.post[0]));
    beam.position.set(x, clear + 1.2 + beamH / 2, 0);
    beam.castShadow = true;
    sc.add(beam);
    // 横幅：平面默认朝 +z，必须绕 y 转 90° 才与横梁平行（客户 2026-10-29 ①：原来错位 90°）
    // 客户 2026-11-05 ⑤：门头正面**用客户给的 logo + 标题图**，不再用程序画的白字。
    //   assets 里没有这张图时自动回落到原来的白字横幅（离线包/其它画风也照样能跑）。
    const bannerW = span + 1.2;
    const logoSrc = (globalThis.__ASSETS && globalThis.__ASSETS.venueLogo) || null;
    let bannerTex, bannerH = 2.6;
    if (logoSrc) {
      const L = globalThis.__ASSETS.venueLogoRatio || 6578 / 409;   // 原图 6578×409
      bannerH = Math.min(2.9, bannerW / L);
      bannerTex = new THREE.TextureLoader().load(logoSrc);
      bannerTex.colorSpace = THREE.SRGBColorSpace;
      bannerTex.anisotropy = 8;
    } else {
      bannerTex = texText({ text: BRAND, sub: RACE_META.en, w: 1600, h: 340, bg: THEME.arch.post[0], color: '#FFFFFF', subColor: '#CFE6FF', size: 0.44 });
    }
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(logoSrc ? bannerW : span + 1.2, logoSrc ? bannerH : 2.6),
        new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, side: THREE.FrontSide }));
      b.position.set(x + (logoSrc ? s * 1.35 : s * 1.28), clear + 1.2 + beamH / 2, 0);
      b.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      b.name = 'archBanner';
      sc.add(b);
    }
    // ── 计时牌（挂在横梁下，同样转 90°）
    //    客户 2026-11-04③：「门头的码表全部去掉，干脆不出现」⇒ 整块牌子不建（连同贴图也不生成）。
    //    要恢复：把下面这段的注释去掉即可（贴图/尺寸/位置都没改动过，恢复后立即可用）。
    //    注意：props.js 的拱门也留了一个 `time` 位置（全图那座拱门），调用方目前传空串，同样不画。
    // this.clockTex = texText({ text: '00:00:00', w: 640, h: 200, bg: '#14284A', color: '#7CFFB0', sub: '', size: 0.52, font: THEME.font.num });
    // for (const s of [-1, 1]) {
    //   const c = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.0), new THREE.MeshBasicMaterial({ map: this.clockTex, transparent: true }));
    //   c.position.set(x + s * 1.3, clear + 0.1, 0);
    //   c.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    //   c.name = 'archClock';
    //   sc.add(c);
    // }
    // 顶旗
    const flagTex = texText({ text: '起点 · 终点', w: 512, h: 128, bg: THEME.hud.gold, color: THEME.hud.ink, sub: '', size: 0.5 });
    for (const s of [-1, 1]) {
      // 客户 2026-10-30 ⑤：DoubleSide 会让背面直接镜像 ⇒ 两面各一块 FrontSide
      const f = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: flagTex, transparent: true, side: THREE.FrontSide }));
      f.position.set(x + s * 1.6, clear + 1.2 + beamH + 1.0, 0);
      f.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.name = 'archFlag';
      sc.add(f);
    }
  }

  // ── A/B/C 分区：地面涂装 + 大字母 + 护栏（客户 2026-10-29 ④：立牌全去掉）
  buildCorrals() {
    const sc = this.scene;
    this.zoneMats = [];
    this.zoneRails = [];
    this.zoneTexts = [];
    for (const z of V.zones) {
      const len = z.x1 - z.x0;
      const cx = (z.x0 + z.x1) / 2;
      const isC = z.id === 'C';
      const paint = isC ? null : this.plane(z.x0, z.x1, z.z0, z.z1, 0.2, z.color, 2, { transparent: true, opacity: 0.55 });
      if (paint) { paint.name = `zone${z.id}`; this.zoneMats.push(paint); }
      const cz = isC ? 32 : (z.z0 + z.z1) / 2;
      const gx = isC ? -96 : cx;
      // 客户 2026-11-02：区号**平铺在地面上**，字头朝北（+x）、字脚朝南 —— 不再做 billboard
      // 区号压在分区涂装（order 2）**之上**：order 8 + y 0.40（涂装 0.20 / 路面 0.25 / C 带 0.34）
      this.zoneTexts.push(this.groundText(z.id, gx, cz, '#FFFFFF',
        { up: 'north', y: 0.40, w: 12, h: 12, opacity: 0.95, size: 0.8, name: 'zoneLetter', order: 8, outline: ZL_INK, outlineW: 0.10 }));
      if (isC) continue;                                  // C 区在弯道里，不画直护栏
      for (const s of [-1, 1]) {
        const zz = s * (V.road.halfW - 0.7);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), mat('#CFD4D9'));
        rail.position.set(cx, 1.02, zz);
        sc.add(rail);
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), mat('#B7BDC4'));
        rail2.position.set(cx, 0.55, zz);
        sc.add(rail2);
        this.zoneRails.push(rail, rail2);
        for (let k = 0; k <= 6; k++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), mat('#9EA6AE'));
          post.position.set(z.x0 + (len * k) / 6, 0.52, zz);
          sc.add(post);
        }
      }
    }
    // C 区在弯道里（多边形），不在 zones 里：单独放一个字 + 发枪点
    // C 字：落在带子**中线**上（按弧长取中点），与 B 字一样大小、平铺贴地
    const cp = this.cPoint(((V.zoneC.arc0 + V.zoneC.arc1) / 2));
    this.cPos = cp;
    this.zoneTexts.push(this.groundText('C', cp[0], cp[1], '#FFFFFF', { up: 'north', y: 0.40, w: 12, h: 12, opacity: 0.95, size: 0.8, name: 'zoneLetter', order: 8, outline: ZL_INK, outlineW: 0.10 }));
    // 客户 2026-11-02：三个检录口小门头（蓝色横杆）去掉 —— 远景里像三道多余的门框
    void this.gate;
  }

  gate(x, z) {
    const sc = this.scene;
    const w = 5.0;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), mat('#C7CED5'));
      post.position.set(x, 1.3, z + s * w / 2);
      sc.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, w), mat('#2C55A6'));
    bar.position.set(x, 2.75, z);
    sc.add(bar);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.62), new THREE.MeshBasicMaterial({
      map: texText({ text: '检录口', w: 512, h: 88, bg: '#2C55A6', color: '#FFFFFF', size: 0.6 }), transparent: true, side: THREE.DoubleSide,
    }));
    lb.position.set(x, 2.75, z);
    lb.rotation.y = Math.PI / 2;
    sc.add(lb);
  }

  // ── 帐篷 / LED / 饮水站 / 主舞台 / 候场 / 广告牌 / 存衣车 / WC
  buildProps() {
    const sc = this.scene;
    const box = (w, h, d, color, x, y, z, cast = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      m.castShadow = cast; m.receiveShadow = true;
      sc.add(m);
      return m;
    };
    const { z0, z1 } = V.tentStrip;
    for (const t of V.tents) {
      const w = t.x1 - t.x0, cx = (t.x0 + t.x1) / 2, d = z1 - z0, cz = (z0 + z1) / 2;
      box(w, 0.3, d, '#FFFFFF', cx, 2.35, cz, false);
      box(w - 0.3, 0.1, d - 0.3, VN.tent, cx, 2.53, cz, false);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(0.14, 2.3, 0.14, '#C7CED5', cx + sx * (w / 2 - 0.3), 1.15, cz + sz * (d / 2 - 0.3));
      }
      const lb = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, 1.0), new THREE.MeshBasicMaterial({
        map: texText({ text: t.text, w: 512, h: 128, bg: VN.tent, color: '#FFFFFF', size: 0.52 }), transparent: true, side: THREE.DoubleSide,
      }));
      lb.position.set(cx, 1.7, cz - d / 2 + 0.1);
      sc.add(lb);
    }
    // ── 安保车辆停车区（客户 2026-11-05 ⑥）：官方平面图东北角那块黄底 + 三辆执勤车
    const SC = V.security;
    if (SC) {
      const cx = (SC.x0 + SC.x1) / 2, cz = (SC.z0 + SC.z1) / 2;
      this.plane(SC.x0, SC.x1, SC.z0, SC.z1, 0.18, SC.color, 2, { transparent: true, opacity: 0.55 });
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1.7), new THREE.MeshBasicMaterial({
        map: texText({ text: '安保车辆停车区', w: 512, h: 96, bg: SC.color, color: '#8A5A00', size: 0.5 }), transparent: true, side: THREE.DoubleSide,
      }));
      lbl.rotation.x = -Math.PI / 2; lbl.rotation.z = Math.PI / 2;
      lbl.position.set(cx, 0.42, cz);
      sc.add(lbl);
      for (let i = 0; i < 3; i++) {
        const car = box(4.6, 1.5, 2.0, i === 0 ? '#FFFFFF' : '#E7E9EC', SC.x0 + 6 + i * 12, 0.85, cz + 1.4);
        car.castShadow = true;
      }
    }
    // LED 大屏：客户 2026-11-01 ① 整块删掉（远景里就是一块黑板，且挡住了树）
    // 赛后饮水站
    const W = V.water;
    box(W.w, 0.35, W.d, '#019EDB', W.x, 2.2, W.z, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(0.14, 2.1, 0.14, '#C7CED5', W.x + sx * (W.w / 2 - 0.4), 1.05, W.z + sz * (W.d / 2 - 0.4));
    }
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(W.w * 0.8, 0.9), new THREE.MeshBasicMaterial({
      map: texText({ text: '赛后饮水站', w: 512, h: 96, bg: '#019EDB', color: '#FFFFFF', size: 0.55 }), transparent: true, side: THREE.DoubleSide,
    }));
    wl.position.set(W.x, 1.6, W.z + W.d / 2 + 0.05);
    sc.add(wl);
    // ── 主舞台（台口朝东，面对终点直道；片尾庆祝仪式用）
    const S = V.stage;
    box(S.w, S.top, S.d, VN.stage, S.x, S.top / 2, S.z);                  // 台裙（同画风主色）
    box(S.w, 0.12, S.d, '#EFE9DD', S.x, S.top + 0.06, S.z, false);         // 台面（浅色，不然近景一大块深蓝）
    box(2.4, 0.04, S.d - 1.0, '#B4232A', S.x + 1, S.top + 0.13, S.z, false);  // 红毯（台阶→背板）
    // 客户 2026-10-30 ⑥⑦：舞台原来反了（镜头在台后拍）⇒ 背板挪到**西侧**（远离赛道），台口朝东
    // 客户 2026-11-06：背板整体换成官方给的**主舞台背景图**（mainset/stage-back.png，2952×1637 ≈ 1.803:1）。
    //   原来是一块 4.6 m 高的横条 + 文字，现在按图片比例做成一面 13.8 × 7.65 m 的大屏，
    //   背后再加一圈深色边框，看起来像真的搭起来的舞台背板。
    const stageBack = (globalThis.__ASSETS && globalThis.__ASSETS.stageBack) || null;
    const WB = S.w * 0.92;                       // 屏宽 13.8 m
    const HB = WB / (2952 / 1637);               // 16:9 类 ⇒ 7.65 m
    const baseY = S.top + 0.22;                  // 屏底离台面 0.22 m
    if (stageBack) {
      // 背板箱体（深色，比屏幕大一圈，边缘才不像“贴纸”）
      box(WB + 0.36, HB + 0.36, 0.5, '#12233A', S.x, baseY + HB / 2, S.z - S.d / 2 + 0.18);
      const tex = new THREE.TextureLoader().load(stageBack);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(WB, HB),
        new THREE.MeshBasicMaterial({ map: tex, transparent: false, side: THREE.FrontSide }));
      scr.position.set(S.x, baseY + HB / 2, S.z - S.d / 2 + 0.44);
      scr.name = 'stageBackdrop';
      sc.add(scr);
      // 屏幕下沿一条灯带（舞台照明的感觉）
      box(WB, 0.12, 0.12, '#FFD34D', S.x, baseY - 0.06, S.z - S.d / 2 + 0.46, false);
    }
    let banner = null;
    if (!stageBack) {
      // 没有素材时退回旧版：深色台背 + 文字横幅
      box(S.w, 4.6, 0.6, VN.stage, S.x, S.top + 2.3 + 0.6, S.z - S.d / 2 + 0.3);
      banner = new THREE.Mesh(new THREE.PlaneGeometry(S.w * 0.9, 3.2), new THREE.MeshBasicMaterial({
        map: texText({ text: BRAND, sub: RACE_META.en, w: 1200, h: 400, bg: VN.stage, color: '#FFFFFF', subColor: '#FFD34D', size: 0.3 }), transparent: true, side: THREE.DoubleSide,
      }));
      banner.position.set(S.x, S.top + 3.0, S.z - S.d / 2 + 0.62);
    }
    if (banner) { banner.rotation.y = 0; sc.add(banner); }   // 默认法线 +z = 朝东（赛道侧）
    // 台阶（台前东侧）
    for (let i = 0; i < 3; i++) box(6, 0.38, 1.1, '#4A5A72', S.x + 1, S.top - 0.19 - i * 0.38, S.z + S.d / 2 + 0.6 + i * 1.1);   // 台阶在台口（东）
    // 演员候场区
    const A = V.actor;
    box(A.w, 0.3, A.d, VN.tent, A.x, 2.15, A.z, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(0.14, 2.1, 0.14, '#C7CED5', A.x + sx * (A.w / 2 - 0.3), 1.05, A.z + sz * (A.d / 2 - 0.3));
    }
    const al = new THREE.Mesh(new THREE.PlaneGeometry(A.w * 0.6, 0.9), new THREE.MeshBasicMaterial({
      map: texText({ text: '演员候场区', w: 512, h: 96, bg: VN.tent, color: '#FFFFFF', size: 0.5 }), transparent: true, side: THREE.DoubleSide,
    }));
    al.position.set(A.x, 1.5, A.z - A.d / 2 - 0.05);
    sc.add(al);
    // 观众观摩区
    const Vv = V.viewer;
    this.groundText('观众观摩区', (Vv.x0 + Vv.x1) / 2, (Vv.z0 + Vv.z1) / 2 + 1.2, '#FFFFFF', { up: 'north', y: 0.14, w: 12, h: 3, opacity: 0.85, size: 0.5 });
    for (let x = Vv.x0; x <= Vv.x1; x += 3.6) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), mat('#9EA6AE'));
      post.position.set(x, 0.48, Vv.z0 + 0.3);
      sc.add(post);
    }
    // 企业广告牌
    const Sp = V.sponsor;
    for (let x = Sp.x0; x <= Sp.x1; x += 6.2) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.9), new THREE.MeshBasicMaterial({
        map: texText({ text: '赞助商', sub: 'SPONSOR', w: 512, h: 176, bg: '#F4F6F8', color: '#1F2D3D', subColor: '#7A8799', size: 0.42 }), transparent: true, side: THREE.DoubleSide,
      }));
      b.position.set(x, 1.35, Sp.z);
      b.rotation.y = -Math.PI / 2;
      sc.add(b);
      box(0.12, 1.4, 0.12, '#5B6570', x - 2.4, 0.7, Sp.z);
      box(0.12, 1.4, 0.12, '#5B6570', x + 2.4, 0.7, Sp.z);
    }
    for (let i = 0; i < 4; i++) box(1.2, 2.2, 1.2, '#019EDB', V.wc.x - i * 1.5, 1.1, V.wc.z);
    for (let i = 0; i < V.storage.n; i++) {
      const x = V.storage.x0 + ((V.storage.x1 - V.storage.x0) * i) / Math.max(1, V.storage.n - 1);
      box(9.5, 3.0, 2.6, '#FFFFFF', x, 1.6, V.storage.z);
      box(3.2, 2.4, 2.5, '#E7EAEE', x - 6.1, 1.3, V.storage.z);
      box(9.0, 0.5, 2.7, '#2E7BFF', x, 3.15, V.storage.z, false);
    }
  }

  // ── 起跑线 / 终点标识（客户 2026-10-29 ②⑤：开跑镜头不要终点线，冲线镜头改黑白地面标识）
  buildFinishMarks() {
    const sc = this.scene;
    const R = V.road;
    // 起跑线：白粗线 + 两侧红块（只在 start 阶段显示）
    const g0 = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: col('#FFFFFF') });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.6, R.halfW * 2 - 1.4), white);
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.20, 0); line.renderOrder = 3;
    g0.add(line);
    for (const s of [-1, 1]) {
      const red = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.2), mat(THEME.hud.red));
      red.rotation.x = -Math.PI / 2; red.position.set(0, 0.202, s * (R.halfW - 2.6)); red.renderOrder = 3;
      g0.add(red);
    }
    sc.add(g0);
    this.startMarks = g0;

    // 终点标识：黑白棋盘带（3.2 m 深）+ 中线（只在冲线阶段显示）
    const g1 = new THREE.Group();
    const sq = 1.1, cols = Math.floor((R.halfW * 2 - 1.2) / sq);
    const black = new THREE.MeshLambertMaterial({ color: col('#14181C') });
    const wht = new THREE.MeshLambertMaterial({ color: col('#FFFFFF') });
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 3; j++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sq, sq), (i + j) % 2 ? black : wht);
        m.rotation.x = -Math.PI / 2;
        m.position.set(0.9 + (j - 1) * sq + sq / 2, 0.205, -R.halfW + 0.6 + i * sq + sq / 2);
        m.renderOrder = 3;
        g1.add(m);
      }
    }
    sc.add(g1);
    this.finishMarks = g1;
    this.setPhase('start');
  }

  /** 'start' → 起跑线 + 分区涂装；'half' | 'finale' → 终点棋盘带、**不显示分区**（客户 2026-10-30 ③） */
  setPhase(kind) {
    const fin = kind !== 'start';
    if (this.phase === kind && this.startMarks) return;
    this.phase = kind;
    if (this.startMarks) this.startMarks.visible = !fin;
    if (this.finishMarks) this.finishMarks.visible = fin;
    for (const m of this.zoneMats || []) m.visible = !fin;
    for (const m of this.zoneRails || []) m.visible = !fin;
    for (const m of this.zoneTexts || []) m.visible = !fin;
    if (this.zoneC) this.zoneC.visible = !fin;
  }

  /** 撒花：origin = [x,z]，t0 = 起爆时刻（秒）。由 director 在撞线时调用 */
  buildConfetti() {
    const N = 260;
    const geo = new THREE.PlaneGeometry(0.34, 0.2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const palette = [THEME.hud.gold, THEME.route.full, THEME.route.half, '#FFFFFF', '#42C08A'];
    const c = new THREE.Color();
    const seeds = [];
    for (let i = 0; i < N; i++) {
      seeds.push({
        x: (Math.sin(i * 12.9898) * 43758.5453 % 1) * 2 - 1,
        z: (Math.sin(i * 78.233) * 43758.5453 % 1) * 2 - 1,
        vy: 2.4 + ((i * 37) % 13) / 4,
        sp: 0.6 + ((i * 53) % 11) / 6,
        ph: (i * 0.37) % (Math.PI * 2),
        rz: (i % 7) * 0.9,
        la: -0.02 + ((i % 5) * 0.004),
        dl: 3.6 + (i % 6) * 0.28,
      });
      mesh.setColorAt(i, c.set(palette[i % palette.length]));
    }
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = false;
    this.scene.add(mesh);
    this.confetti = { mesh, seeds, N, origin: [0, 0], t0: -99, life: 4.6, spread: 5.5 };
    this.updateConfetti(0);
  }

  setConfetti(origin, t0) {
    if (!this.confetti) return;
    this.confetti.origin = origin;
    this.confetti.t0 = t0;
  }

  updateConfetti(t) {
    const cf = this.confetti;
    if (!cf) return;
    const dt = t - cf.t0;
    if (!(dt >= 0) || dt > cf.life) { cf.mesh.visible = false; return; }
    cf.mesh.visible = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    const g = 3.4;
    for (let i = 0; i < cf.N; i++) {
      const s = cf.seeds[i];
      // 客户 2026-11-05 ④：纸屑原来从 9 m 起落 —— 冲线机位贴到 17 m，画幅上沿只到约 5 m，
      //   整场“下在画外”。改成从 4 m 起落，戴冠那一刻就能看见。
      const y0 = 2.6 + (s.vy % 2) * 0.5;
      const y = y0 - 0.5 * g * dt * dt * 0.45 - s.vy * dt * 0.35;
      const k = Math.min(1, dt * s.sp);
      pos.set(cf.origin[0] + s.x * cf.spread * k, Math.max(0.15, y), cf.origin[1] + s.z * cf.spread * 0.7 * k);
      e.set(s.ph + dt * 3.1, s.rz + dt * 2.3, s.ph * 0.5 + dt * 1.7);
      q.setFromEuler(e);
      const fade = dt > cf.life - 0.8 ? Math.max(0, (cf.life - dt) / 0.8) : 1;
      scl.setScalar(fade);
      m4.compose(pos, q, scl);
      cf.mesh.setMatrixAt(i, m4);
    }
    cf.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 西侧城市界面（客户 2026-11-01 ②③④）：停车场+充电桩 / 指挥中心 / 电视转播区 / 现代居民楼 */
  buildUrban() {
    const sc = this.scene;
    const U = V.urban;
    const box = (w, h, d, color, x, y, z, cast = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      m.castShadow = cast; m.receiveShadow = true;
      sc.add(m);
      return m;
    };
    // ── 停车场（两处）：沥青地 + 车位白线 + 两排车
    const lineMat = new THREE.MeshLambertMaterial({ color: col('#FFFFFF'), transparent: true, opacity: 0.8 });
    const carSeeds = [];
    for (const P of U.lots) {
      // 2026-11-08-i：停车场铺面抬到 0.06（原来 0.015）。它整块压在城地坪（y=0）上面，
      //   15 mm 的间距在斜视角下仍然会跟城地坪抢深度 ⇒ 铺面边缘出现锯齿/细纹。
      //   现在留 60 mm，远大于深度缓冲在 40 m 处的分辨率（0.16 mm），彻底分开。
      this.plane(P.x0, P.x1, P.z0, P.z1, 0.06, VN.asphalt, -3.7);
      const bayW = (P.x1 - P.x0 - 4) / P.bays;
      const zc0 = (P.z0 + P.z1) / 2 - 3.6, zc1 = (P.z0 + P.z1) / 2 + 3.6;
      for (let i = 0; i <= P.bays; i++) {
        const x = P.x0 + 2 + i * bayW;
        for (const zc of [zc0, zc1]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 5.0), lineMat);
          m.rotation.x = -Math.PI / 2; m.position.set(x, 0.075, zc);   // 跟着铺面一起抬（0.06 + 15 mm）
          m.renderOrder = 2; sc.add(m);
        }
      }
      for (let i = 0; i < P.bays; i++) {
        const x = P.x0 + 2 + (i + 0.5) * bayW;
        if (Math.abs(x - (P.x0 + P.x1) / 2) < 5) continue;      // 入口留空
        if (!this.inJunction(x, zc0, 6)) carSeeds.push({ x, z: zc0, a: 0 });
        if (i % 3 !== 1 && !this.inJunction(x, zc1, 6)) carSeeds.push({ x, z: zc1, a: Math.PI });
      }
    }
    const carCols = ['#FFFFFF', '#E8ECF1', '#2F3A4A', '#C8102E', '#1F63E0', '#8A939E', '#F2C14E'];
    const bodyGeo = new THREE.BoxGeometry(1.82, 0.62, 4.3);
    const cabGeo = new THREE.BoxGeometry(1.62, 0.55, 2.2);
    const bodies = new THREE.InstancedMesh(bodyGeo, mat('#FFFFFF'), carSeeds.length);
    const cabs = new THREE.InstancedMesh(cabGeo, mat('#FFFFFF'), carSeeds.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
    const cc = new THREE.Color();
    carSeeds.forEach((c, i) => {
      q4.setFromEuler(new THREE.Euler(0, c.a, 0));
      m4.compose(v3.set(c.x, 0.42, c.z), q4, s3);
      bodies.setMatrixAt(i, m4);
      bodies.setColorAt(i, cc.set(carCols[i % carCols.length]));
      m4.compose(v3.set(c.x, 0.98, c.z - Math.cos(c.a) * 0.1), q4, s3);
      cabs.setMatrixAt(i, m4);
      cabs.setColorAt(i, cc.set(i % 4 === 0 ? '#E8ECF1' : '#AEB6C0'));
    });
    bodies.instanceMatrix.needsUpdate = true; cabs.instanceMatrix.needsUpdate = true;
    bodies.instanceColor.needsUpdate = true; cabs.instanceColor.needsUpdate = true;
    bodies.castShadow = cabs.castShadow = true;
    sc.add(bodies, cabs);
    this.carCount = carSeeds.length;

    // ── 充电桩：停车场北缘一排绿色小桩
    const C = U.charger;
    for (let i = 0; i < C.n; i++) {
      const x = C.x0 + ((C.x1 - C.x0) * i) / (C.n - 1);
      if (this.inJunction(x, C.z, 5)) continue;
      box(0.42, 1.35, 0.34, '#20B86A', x, 0.68, C.z);
      box(0.42, 0.16, 0.34, '#0E7A46', x, 1.42, C.z, false);
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), new THREE.MeshBasicMaterial({ color: col('#0B2A1C') }));
      hole.position.set(x, 0.95, C.z + 0.18);
      sc.add(hole);
    }

    // ── 指挥中心：白色集装箱 + 顶灯 + 天线
    const K = U.command;
    box(K.w, K.h, K.d, '#F2F4F7', K.x, K.h / 2, K.z);
    box(K.w + 0.6, 0.22, K.d + 0.6, '#D7DCE3', K.x, K.h + 0.1, K.z, false);
    const km = new THREE.Mesh(new THREE.PlaneGeometry(K.w * 0.7, 0.9), new THREE.MeshBasicMaterial({
      map: texText({ text: '指挥中心', w: 512, h: 110, bg: VN.stage, color: '#FFFFFF', size: 0.56 }), transparent: true, side: THREE.DoubleSide,
    }));
    km.position.set(K.x, 2.7, K.z + K.d / 2 + 0.02);
    sc.add(km);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.0, 6), mat('#9AA4B2'));
    mast.position.set(K.x + K.w / 2 - 1.2, K.h + 2.5, K.z - 1.0); sc.add(mast);

    // ── 电视转播区：两间转播舱 + 一口卫星锅
    const B = U.broadcast;
    box(B.w, B.h, B.d, '#E9EDF2', B.x, B.h / 2, B.z);
    box(B.w + 0.5, 0.2, B.d + 0.5, '#CBD3DC', B.x, B.h + 0.1, B.z, false);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(B.w * 0.72, 0.9), new THREE.MeshBasicMaterial({
      map: texText({ text: '电视转播', w: 512, h: 110, bg: VN.tent, color: '#FFFFFF', size: 0.56 }), transparent: true, side: THREE.DoubleSide,
    }));
    bm.position.set(B.x, 2.6, B.z + B.d / 2 + 0.02);
    sc.add(bm);
    if (B.dish) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), mat('#F4F6F8', { side: THREE.DoubleSide }));
      dish.position.set(B.x - B.w / 2 + 2.2, 1.6, B.z - B.d / 2 - 1.6);
      dish.rotation.set(-0.9, 0.6, 0);
      sc.add(dish);
      const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), mat('#9AA4B2'));
      pt.position.set(B.x - B.w / 2 + 2.2, 0.8, B.z - B.d / 2 - 1.6);
      sc.add(pt);
    }

    // ── 临街低层商铺：把近处那条灰带填满（雨棚 + 招牌色带）
    for (const sh of U.shops) {
      if (this.inJunction(sh.x, U.shopZ, sh.w / 2 + 2)) continue;   // 客户 2026-11-08：路口里的楼要去掉
      box(sh.w, sh.h, 9, '#F6F3EC', sh.x, sh.h / 2, U.shopZ);
      box(sh.w + 0.8, 0.3, 10, '#D8D2C6', sh.x, sh.h + 0.15, U.shopZ, false);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(sh.w * 0.92, 0.18, 2.2), mat(THEME.route.full));
      awn.position.set(sh.x, sh.h - 0.55, U.shopZ + 5.3);
      awn.rotation.x = 0.18;
      sc.add(awn);
    }

    // ── 现代居民楼：淡色方塔 + 窗格（canvas 贴图，远景靠雾收）
    for (const b of U.towers) {
      if (this.inJunction(b.x, U.towerZ, b.w / 2 + 2)) continue;
      const tower = box(b.w, b.h, b.d, VN.bldg, b.x, b.h / 2, U.towerZ);
      tower.name = 'tower';
      const winCv = document.createElement('canvas');
      winCv.width = 128; winCv.height = 256;
      const g2 = winCv.getContext('2d');
      g2.fillStyle = VN.bldg; g2.fillRect(0, 0, 128, 256);
      const cols = 6, rows = 14;
      for (let c2 = 0; c2 < cols; c2++) for (let r2 = 0; r2 < rows; r2++) {
        const lit = (c2 * 7 + r2 * 13 + b.x) % 5;
        g2.fillStyle = lit === 0 ? '#BFD7EC' : lit === 1 ? '#9FB4C7' : '#DCE6F0';
        g2.fillRect(6 + c2 * 19, 8 + r2 * 17, 13, 10);
      }
      const wt = new THREE.CanvasTexture(winCv);
      wt.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.96, b.h * 0.94),
        new THREE.MeshBasicMaterial({ map: wt, transparent: true }));
      face.position.set(b.x, b.h / 2, U.towerZ + b.d / 2 + 0.03);
      face.rotation.y = Math.PI;            // 朝东（赛道侧）
      sc.add(face);
      box(b.w + 1.2, 0.5, b.d + 1.2, '#CBD3DC', b.x, b.h + 0.2, U.towerZ, false);   // 女儿墙
    }

    // ── 绿化：广场边灌木带 + 路西行道树 + 路灯
    const H = U.hedge;
    for (let x = H.x0; x <= H.x1; x += 3.2) {
      if (this.inJunction(x, H.z, 4)) continue;
      const hh = 0.9 + ((Math.abs(x) * 7) % 3) * 0.12;
      box(3.0, hh, 1.5, M.greenDark, x, hh / 2, H.z, false);
    }
    for (let x = U.lamp.x0; x <= U.lamp.x1; x += U.lamp.step) {
      // 客户 2026-11-02：舞台正前方那根路灯正好立在台前，去掉
      if (Math.abs(x - V.stage.x) < 26) continue;
      if (this.inJunction(x, U.lamp.z, 5)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6.4, 6), mat('#B9BEC4'));
      pole.position.set(x, 3.2, U.lamp.z); sc.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), mat('#B9BEC4'));
      arm.position.set(x + 0.7, 6.35, U.lamp.z); sc.add(arm);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.34), new THREE.MeshBasicMaterial({ color: col('#FFF3D0') }));
      lamp.position.set(x + 1.3, 6.26, U.lamp.z); sc.add(lamp);
    }
  }

  // ── 观众：头身分离的实例化人群（青年为主、少年为辅、少数老人）
  buildCrowd() {
    const C = V.crowd;
    const items = [];
    // 年龄段：青年 0.62 / 少年 0.22 / 儿童 0.07 / 老人 0.09（客户 2026-11-01 ⑤⑥）
    const AGES = [
      { k: 'youth', w: 0.62, h0: 1.64, h1: 1.82 },
      { k: 'teen', w: 0.22, h0: 1.42, h1: 1.62 },
      { k: 'kid', w: 0.07, h0: 1.05, h1: 1.30 },
      { k: 'elder', w: 0.09, h0: 1.52, h1: 1.64 },
    ];
    const TOTAL = AGES.reduce((a, q) => a + q.w, 0);
    const pickAge = (u) => {
      let acc = 0;
      for (const a of AGES) { acc += a.w / TOTAL; if (u <= acc) return a; }
      return AGES[0];
    };
    // 衣服：青年偏冷色/亮色，少年偏浅色，老人偏深色与米灰
    const CLOTH = {
      youth: ['#FFFFFF', '#2E7BFF', '#FF4FA0', '#42C08A', '#F2C14E', '#E8E8EC', '#F2724E', '#1F2D3D'],
      teen: ['#FFFFFF', '#BFE3FF', '#FFD9E8', '#CDEFDA', '#FFF1C2', '#E4E9F2'],
      kid: ['#FF7AA2', '#5FC8FF', '#FFC83D', '#7BE0A8', '#FFFFFF'],
      elder: ['#8A939E', '#B7A99A', '#6F7B8A', '#D8D2C6', '#4A5568'],
    };
    const SKIN = ['#F6D2B4', '#EFC09B', '#E3AE86', '#D79A72'];
    const HAIR = ['#2B2B2B', '#4A3A2E', '#6B6156', '#C9CBCE'];
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const push = (x, z, tag) => {
      if (this.inJunction(x, z, 3)) return;        // 客户 2026-11-08：路口里不许站人
      const a = pickAge(rnd());
      const h = a.h0 + (a.h1 - a.h0) * rnd();
      const wide = a.k === 'elder' ? 1.16 : a.k === 'kid' ? 0.8 : 0.92 + rnd() * 0.2;
      // 志愿者黄马甲；台前观众按普通人群配色（2026-11-05 撤掉摄影/摄像后不再有深色冲锋衣）
      const cloth = tag === 'volunteer' ? ['#FFC83D', '#FFB020', '#FFD34D'] : CLOTH[a.k];
      items.push({
        x: x + (rnd() - 0.5) * 0.9, z: z + (rnd() - 0.5) * 0.9,
        h, wide, age: a.k,
        c: cloth[Math.floor(rnd() * cloth.length)],
        skin: SKIN[Math.floor(rnd() * SKIN.length)],
        hair: a.k === 'elder' && rnd() < 0.6 ? HAIR[3] : HAIR[Math.floor(rnd() * 3)],
        bob: (rnd() - 0.5) * 0.12,      // 老人略微驼背（重心前后偏移）
        tag,
      });
    };
    // 西侧沿路观众带（第一排从路缘外站起，主舞台正前方空着）
    const cz0 = -(V.road.halfW + 1.3);
    for (let x = C.x0; x <= C.x1; x += 1.35) {
      if (Math.abs(x - V.stage.x) < 20) continue;
      const near = Math.abs(x - V.arch.x) < 30 ? 4 : Math.abs(x - V.arch.x) < 90 ? 3 : 2;
      for (let r = 0; r < near; r++) push(x, cz0 - r * 1.75, 'band');
    }
    // 观众观摩区（舞台两侧的看台位）
    for (let x = V.viewer.x0; x <= V.viewer.x1; x += 1.5) for (let r = 0; r < 2; r++) push(x, V.viewer.z0 + 0.9 + r * 1.7, 'viewer');
    // 东侧帐篷前零星
    for (let x = 24; x <= 74; x += 3.0) { if (Math.abs(x - V.stage.x) < 26) continue; push(x, 13.1, 'tent'); }
    // ── 客户 2026-11-05 ⑨：**主舞台前（台口）和两侧**补上人群、摄影/摄像、志愿者
    //    台口朝东（+z），舞台前只有 1.7 m 宽的宫格带（z −12.7…−11），人就贴在这条带上
    const ST = V.stage;
    // 客户 2026-11-06：**台上不许有人**。台体占 z ∈ [ST.z−d/2, ST.z+d/2] = −23.7…−12.7，
    //   上一版把人放在 −13.2 / −16，正好插在台子里（客户圈出来的那 4 个“穿模的人”）。
    //   现在所有人只站在**台体以北**那条 1.7 m 的宫格带上（z > −12.6），两侧的人沿台宽外侧往前排。
    //   宫格带只有 z ∈ (−12.6, −11.2) 这 1.4 m；push() 自带 ±0.45 抖动，所以站位取带心 −11.9，
    //   并在 pushStage 里做硬夹，保证谁都不会落到台体上或路面上。
    //   客户 2026-11-06：台口正前方是**三级台阶**（z −12.1…−9.35，还压到路缘上），
    //   站那儿的人腿必然被台阶立面切掉 —— 所以台前不再放人，人群**只放在舞台两侧**的空地上
    //   （x 在台宽之外，z 落 −13…−19，谁也不碰台阶、不上台、不上路）。
    const pushSide = (x, z, tag) => {
      const before = items.length;
      push(x, z, tag);
      const it = items[before];
      it.x = x + (it.x - x) * 0.4;
      it.z = z + (it.z - z) * 0.4;
    };
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) pushSide(ST.x + sd * (ST.w / 2 + 2.4 + (k % 2) * 1.3), -13.4 - k * 1.5, 'fan');
      for (let k = 0; k < 2; k++) pushSide(ST.x + sd * (ST.w / 2 + 1.4), -12.9 - k * 1.6, 'volunteer');
    }

    // 三层实例化：身体（圆柱，读起来不像方柱）+ 头（球）+ 头发（小球帽）
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.24, 1, 10);
    const headGeo = new THREE.SphereGeometry(0.145, 10, 8);
    const hairGeo = new THREE.SphereGeometry(0.152, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const body = new THREE.InstancedMesh(bodyGeo, mat('#FFFFFF'), items.length);
    const head = new THREE.InstancedMesh(headGeo, mat('#FFFFFF'), items.length);
    const hair = new THREE.InstancedMesh(hairGeo, mat('#FFFFFF'), items.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    const cc = new THREE.Color();
    items.forEach((it, i) => {
      q4.identity();
      s3.set(it.wide, it.h * 0.86, it.wide);
      m4.compose(v3.set(it.x, (it.h * 0.86) / 2, it.z), q4, s3);
      body.setMatrixAt(i, m4); body.setColorAt(i, cc.set(it.c));
      s3.set(it.wide, it.wide, it.wide);
      m4.compose(v3.set(it.x, it.h * 0.86 + 0.15 * it.wide, it.z + it.bob), q4, s3);
      head.setMatrixAt(i, m4); head.setColorAt(i, cc.set(it.skin));
      m4.compose(v3.set(it.x, it.h * 0.86 + 0.17 * it.wide, it.z + it.bob), q4, s3);
      hair.setMatrixAt(i, m4); hair.setColorAt(i, cc.set(it.hair));
    });
    for (const m of [body, head, hair]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
    }
    body.castShadow = true;
    head.castShadow = false; hair.castShadow = false;
    this.crowdMeshes = { body, head, hair };
    this.crowdItems = items;
    this.crowdCount = items.length;
    this.stageX0 = V.stage.x;
    this.crowdAges = items.reduce((a, q) => { a[q.age] = (a[q.age] || 0) + 1; return a; }, {});
  }

  // ── 发枪波纹
  buildGuns() {
    const sc = this.scene;
    const mk = (x, z) => {
      const g = new THREE.RingGeometry(0.55, 1.0, 48);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(THEME.hud.gold), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.3, z);
      m.renderOrder = 6;
      sc.add(m);
      return m;
    };
    this.gunAB = mk(-16, 0);
    const gp = this.cPoint(V.zoneC.arc0 + 9);
    this.gunC = mk(gp[0], gp[1]);
    this.gunT = { AB: -99, C: -99 };
  }

  setGun(zones, k) {
    const m = zones === 'C' ? this.gunC : this.gunAB;
    if (!m) return;
    if (k < 0 || k > 1) { m.material.opacity = 0; return; }
    const s = 2 + 34 * k;
    m.scale.set(s, s, s);
    m.material.opacity = Math.max(0, 0.85 * (1 - k) * (1 - k));
  }

  /** 兼容旧接口（冲刺带已按客户要求撤掉） */
  setTapeBroken() {}

  // ── 相机 / 渲染
  setCamera(p, rect) {
    const cam = this.camera;
    cam.aspect = rect.w / rect.h;
    const az = THREE.MathUtils.degToRad(p.az || 0), pi = THREE.MathUtils.degToRad(p.pitch || 30);
    const [tx, tz] = p.target;
    const ty = p.ty || 0;                       // 看向的高度（舞台段要抬头）
    const hd = Math.cos(pi) * p.dist;
    cam.position.set(tx - Math.sin(az) * hd, ty + Math.sin(pi) * p.dist, tz + Math.cos(az) * hd);
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, ty, tz);
    cam.setViewOffset(rect.w, rect.h, 0, -(p.frame || 0) * rect.h, rect.w, rect.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // 区号永远正着读（客户 2026-10-29）：直接抄相机姿态
    if (this.billboards) for (const b of this.billboards) b.quaternion.copy(cam.quaternion);
    const S = Math.min(160, Math.max(24, p.dist * 0.85));
    const sh = this.sun.shadow.camera;
    sh.left = -S; sh.right = S; sh.top = S; sh.bottom = -S; sh.near = 1; sh.far = 900;
    sh.updateProjectionMatrix();
    // 2026-11-08-i：normalBias 必须 ≥ 影子贴图的一个 texel（2S/2048），
    //   否则平面上会出现扇形自遮蔽细纹（客户圈出来的那一片）。
    this.sun.shadow.normalBias = Math.max(0.10, (S * 2 / 2048) * 1.3);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 300, this.sunDir.y * 300, tz + this.sunDir.z * 300);
    this.sun.target.updateMatrixWorld();
    this._rect = rect; this._dist = p.dist;
    this.updateConfetti(this.tt);
  }

  renderView(rect) {
    if (this.tt != null) this.updateConfetti(this.tt);
    const r = this.renderer;
    r.setViewport(rect.x, this.H - rect.y - rect.h, rect.w, rect.h);
    r.setScissor(rect.x, this.H - rect.y - rect.h, rect.w, rect.h);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
  }

  clear() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.W, this.H);
    r.setClearAlpha(0);
    r.clear();
  }

  project(x, y, h = 0, rect = this._rect) {
    const v = new THREE.Vector3(x, h, y);
    const d = v.distanceTo(this.camera.position);
    v.project(this.camera);
    const ppp = rect.h / (2 * d * Math.tan(THREE.MathUtils.degToRad(V_FOV / 2)));
    return { x: rect.x + (v.x + 1) / 2 * rect.w, y: rect.y + (1 - v.y) / 2 * rect.h, z: v.z, d, ppp, ok: v.z < 1 && v.z > -1 };
  }

  probeEnabled() {}
  renderProbe() {}
  probeZ() { return 1; }
  occluded() { return false; }
  viewDist() { return 0; }
}