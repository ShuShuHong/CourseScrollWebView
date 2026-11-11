// ════════════════════════════════════════════════════════════════════════
//  分流丁字路口副本（客户 2026-11-06 第二批 · 全局改）
//
//  方位：图面上方 = **东**（+x 跑进方向）、右 = 南（+z，湖侧）、左 = 北（−z，主会场侧）
//  几何全部来自 src/config/split.js（唯一来源）：
//    · 环湖大道 18 m，过岔口往南弯 10°（R60 圆弧）
//    · 澜湾北路 18 m，与来路夹角 100°（出口 −80°），40 m 内收敛到正南
//    · 中分带从岔口往北 100 m：0–50 m 注水马、50–100 m 反光锥，北端立分流牌
//    · 两条车道中心线 ±5.05 m，岔口前 120 m 就已分开（母蟹北侧 / 公蟹南侧）
// ════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { THEME } from '../config/theme.js';
import {
  SP, roadZ, branchAt, BRANCH_PATH, DIVIDERS, ISLAND, ISLAND_TRI, ISLAND_ARCS, SIGN, bankZ, shoreZ, sampleAlong, femaleAt, maleAt,
} from '../config/split.js';
import { Batch, ribbon, extrude, poly, col, texSky, texAsphalt, texSign, texWater, texGlow } from './split3d_kit.js';
import { crabId } from '../art/sprites.js';

/** 角色身高（米）。和 viewlayer.js 的 VENUE_CRAB_M 是同一个数 —— 两套场景里螃蟹一样大 */
const CRAB_H = 1.9;

export const V_FOV = 34;

const VN = THEME.venue || { asphalt: '#CED1D6', plaza: '#F1F1EE', tent: '#F6B24B' };
const M = THEME.map || {};
const R = THEME.route;
const STY = THEME.key || 'navi';
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

const PAL = {
  asphalt: VN.asphalt || '#CED1D6',
  rut: mix(VN.asphalt || '#CED1D6', '#5E6670', 0.14),
  patch: mix(VN.asphalt || '#CED1D6', '#4A525C', 0.09),
  paint: '#FFFFFF',
  yellow: '#E9B420',
  granite: '#E8E3D6', graniteDark: '#CFC8B8',
  walk: VN.plaza || '#F1F1EE', walkJoint: mix(VN.plaza || '#F1F1EE', '#8A8578', 0.20),
  grass: mix(M.green || '#CDE9C3', '#6FA955', 0.55),
  grassDark: mix(M.greenDark || '#B5DDA8', '#4E8B3E', 0.55),
  hedge: mix(M.greenDark || '#B5DDA8', '#3E7A36', 0.62),
  tree: (M.tree || ['#A6D59A', '#97CC8B', '#B3DCA7']).map((c) => mix(c, '#3F7D3A', 0.45)),
  trunk: mix(M.trunk || '#B9A58C', '#6E5236', 0.35),
  reed: [mix(M.reed || '#DCCFA8', '#8FA85A', 0.55), mix(M.reed || '#DCCFA8', '#6E8C46', 0.6)],
  water: M.water || '#A6D3F7',
  stone: '#D3CBB9', stoneDark: '#B4AC9A', stoneWet: '#8E9AA0',
  metal: '#C9D0D6', metalDark: '#9AA3AC',
  cone: '#F4701E',
  fog: '#E6D8C4',
};

const HW = SP.roadW / 2, EW = SP.exitW / 2;
const Y_ROAD = 0.03, CROWN = 0.09, Y_WALK = 0.15, Y_WATER = -0.62, CURB_W = 0.22;
const crownY = (x, z) => { const u = (z - roadZ(x)) / HW; return Y_ROAD + CROWN * Math.max(0, 1 - u * u); };

// ── 平面几何小工具
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = (a) => Math.hypot(a[0], a[1]);
const unit2 = (a) => { const L = len2(a) || 1; return [a[0] / L, a[1] / L]; };
const dist2 = (a, b) => len2(sub2(a, b));
const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function offsetPts(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / L) * d, p[1] + (dx / L) * d];
  });
}

function crossPoly(A, B) {
  for (let i = 0; i < A.length - 1; i++) {
    const p = A[i], r = sub2(A[i + 1], p);
    for (let j = 0; j < B.length - 1; j++) {
      const q = B[j], s = sub2(B[j + 1], q);
      const den = r[0] * s[1] - r[1] * s[0];
      if (Math.abs(den) < 1e-12) continue;
      const qp = sub2(q, p);
      const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { p: [p[0] + r[0] * t, p[1] + r[1] * t], i, j };
    }
  }
  return null;
}

function walkAlong(pts, i, start, L) {
  let cur = start;
  for (let k = i; k < pts.length - 1; k++) {
    const nxt = pts[k + 1], d = dist2(cur, nxt);
    if (d >= L) { const u = unit2(sub2(nxt, cur)); return { p: [cur[0] + u[0] * L, cur[1] + u[1] * L], i: k }; }
    L -= d; cur = nxt;
  }
  return { p: pts[pts.length - 1], i: pts.length - 2 };
}

function roundWedge(C, a, b, r, n = 14) {
  const th = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
  const T = r / Math.tan(Math.max(0.05, th) / 2);
  const bis = unit2([a[0] + b[0], a[1] + b[1]]);
  const dO = r / Math.sin(Math.max(0.05, th) / 2);
  const O = [C[0] + bis[0] * dO, C[1] + bis[1] * dO];
  const aa = Math.atan2(C[1] + a[1] * T - O[1], C[0] + a[0] * T - O[0]);
  let d = Math.atan2(C[1] + b[1] * T - O[1], C[0] + b[0] * T - O[0]) - aa;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const arc = [];
  for (let k = 0; k <= n; k++) arc.push([O[0] + r * Math.cos(aa + (d * k) / n), O[1] + r * Math.sin(aa + (d * k) / n)]);
  return { arc, T };
}

function filletJoin(A, B, r) {
  const X = crossPoly(A, B);
  if (!X) return { curb: [...A], fill: [] };
  const a = unit2(sub2(A[X.i], X.p));
  let b = unit2(sub2(B[X.j + 1], X.p)), q = null, W = null;
  for (let it = 0; it < 3; it++) {
    W = roundWedge(X.p, a, b, r);
    q = walkAlong(B, X.j, X.p, W.T);
    b = unit2(sub2(q.p, X.p));
  }
  W = roundWedge(X.p, a, b, r);
  q = walkAlong(B, X.j, X.p, W.T);
  const Ain = A.slice(0, X.i + 1).filter((p) => dist2(p, X.p) > W.T + 1e-6);
  const Bout = B.slice(q.i + 1).filter((p) => dist2(p, X.p) > W.T + 1e-6);
  const Bmid = B.slice(X.j + 1, q.i + 1).filter((p) => dist2(p, X.p) < W.T);
  return { curb: [...Ain, ...W.arc, ...Bout], fill: [X.p, ...W.arc, ...Bmid.reverse()], corner: X.p, iArc: Ain.length, nArc: W.arc.length };
}

function along(pts, step, fn, s0 = 0) {
  let acc = 0, last = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = dist2(a, b);
    if (L < 1e-9) continue;
    const t = unit2(sub2(b, a)), n = [-t[1], t[0]];
    const k0 = Math.max(0, Math.ceil((acc - s0) / step - 1e-9));
    for (let k = k0; s0 + k * step <= acc + L; k++) {
      const s = s0 + k * step - acc;
      if (acc + s <= last + 1e-6) continue;      // 采样点正好落在折线节点上时会被前后两段各发一次
      last = acc + s;
      fn([a[0] + t[0] * s, a[1] + t[1] * s], t, n, acc + s);
    }
    acc += L;
  }
}

function runs(pts, pred, strict = false) {
  const out = []; let cur = null;
  pts.forEach((p, i) => {
    if (pred(p)) { if (!cur) cur = i > 0 && !strict ? [pts[i - 1]] : []; cur.push(p); }
    else if (cur) { if (!strict) cur.push(p); if (cur.length >= 2) out.push(cur); cur = null; }
  });
  if (cur && cur.length >= 2) out.push(cur);
  return out;
}

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + (h * h * k) / 4; };
const bankS = (x) => smax(shoreZ(x), bankZ(x), 6);

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const _tubeG = {};
function tube(batch, p0, p1, r, color, seg = 6) {
  const v = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const L = v.length();
  if (L < 1e-6) return;
  const g = _tubeG[seg] || (_tubeG[seg] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, false));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  batch.geo(g, color, { p: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], r: [e.x, e.y, e.z], s: [r, L, r] });
}
const _boxG = new THREE.BoxGeometry(1, 1, 1);
const box = (batch, c, s, ry, color) => batch.geo(_boxG, color, { p: c, r: [0, ry, 0], s });

function texArrow(dir) {
  const w = 256, h = 512, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#FFFFFF';
  g.fillRect(w / 2 - 16, h * 0.34, 32, h * 0.56);
  g.beginPath();
  if (dir === 'left') {
    g.moveTo(w / 2 - 16, h * 0.42); g.lineTo(w / 2 - 16, h * 0.30);
    g.quadraticCurveTo(w / 2 - 16, h * 0.20, w / 2 - 58, h * 0.20);
    g.lineTo(w * 0.26, h * 0.20); g.lineTo(w * 0.26, h * 0.07);
    g.lineTo(w * 0.05, h * 0.26); g.lineTo(w * 0.26, h * 0.45);
    g.lineTo(w * 0.26, h * 0.32); g.lineTo(w / 2 - 52, h * 0.32);
    g.quadraticCurveTo(w / 2, h * 0.32, w / 2, h * 0.42);
  } else {
    g.moveTo(w / 2 - 44, h * 0.24); g.lineTo(w / 2, h * 0.04); g.lineTo(w / 2 + 44, h * 0.24);
    g.lineTo(w / 2 + 17, h * 0.24); g.lineTo(w / 2 + 17, h * 0.36);
    g.lineTo(w / 2 - 17, h * 0.36); g.lineTo(w / 2 - 17, h * 0.24);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SplitWorld {
  constructor(canvas, { dpr = 1, w = 1920, h = 1080 } = {}) {
    this.W = w; this.H = h;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
    r.setPixelRatio(dpr); r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = false;
    const sc = this.scene = new THREE.Scene();
    sc.fog = new THREE.Fog(col(PAL.fog), 260, 940);
    this.camera = new THREE.PerspectiveCamera(V_FOV, w / h, 0.4, 5000);
    this.billboards = [];
    this._rect = { x: 0, y: 0, w, h };
    this._dist = 30;
    this.tt = 0;
    // 2026-11-08：角色改成场景内的真实精灵（不再画在 SVG 上层），详见 setCrabs()
    this.crabs = {};
    this._crabTex = new Map();
    this._crabImg = new Map();
    this.crabsReady = Promise.resolve();

    this.sunDir = new THREE.Vector3(0.86, 0.095, 0.32).normalize();
    const LIGHTS = {
      navi: { hemi: 2.55, sun: 2.4, fill: 0.55, exp: 1.12, sky: '#DCE8FF', gnd: '#D2CEC6', sunC: '#FFD9A8' },
      cartoon: { hemi: 3.4, sun: 2.9, fill: 0.55, exp: 0.86, sky: '#E0ECFF', gnd: '#D2CEC6', sunC: '#FFD9A8' },
      papercut: { hemi: 2.9, sun: 2.6, fill: 0.55, exp: 0.90, sky: '#FFF4EA', gnd: '#E0D2C2', sunC: '#FFD2A4' },
    };
    const LT = this.LIGHT = LIGHTS[STY] || LIGHTS.navi;
    this.hemi = new THREE.HemisphereLight(col(LT.sky), col(LT.gnd), LT.hemi);
    sc.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(col(LT.sunC), LT.sun);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    sc.add(sun, sun.target);
    this.fill = new THREE.DirectionalLight(col('#FFF1E2'), LT.fill);
    sc.add(this.fill, this.fill.target);
    this.setExposure(LT.exp ?? 1);

    const lam = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
    this.mats = {
      solid: lam(),
      solid2: lam({ side: THREE.DoubleSide }),
      asphalt: lam({ map: texAsphalt(PAL.asphalt) }),
      paint: lam({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      decal: lam({ transparent: true, opacity: 0.30, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      cast: lam({ side: THREE.DoubleSide }),
      far: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
    };
    this.B = { asphalt: new Batch(), paint: new Batch(), decal: new Batch(), solid: new Batch(), solid2: new Batch(), cast: new Batch(), far: new Batch() };

    this.buildLayout();
    this.buildSky();
    this.buildGround();
    this.buildRoad();
    this.buildCurbs();
    this.buildMarkings();
    this.buildMedian();
    this.buildSign();
    this.buildWest();
    this.buildEast();
    this.buildWater();
    this.buildFar();
    this.buildInstanced();
    this.flush();
    this.preloadCrabs();
    this.setCamera({ target: [-40, 0], dist: 30, az: 90, pitch: 6 }, this._rect);
    this.renderer.compile(this.scene, this.camera);
    this.renderView(this._rect);
    this.clear();
  }

  flush() {
    const { B, mats } = this;
    const add = (m) => { m.updateMatrix(); this.scene.add(m); return m; };
    add(B.asphalt.mesh(mats.asphalt, { uvScale: 6 }));
    add(B.paint.mesh(mats.paint));
    const d = add(B.decal.mesh(mats.decal)); d.renderOrder = 1;
    add(B.solid.mesh(mats.solid));
    add(B.solid2.mesh(mats.solid2));
    add(B.cast.mesh(mats.cast, { cast: true }));
    const f = add(B.far.mesh(mats.far, { receive: false })); f.renderOrder = -5;
  }

  buildLayout() {
    const L = this.L = {};
    L.main = sampleAlong(roadZ, SP.xMin, SP.xMax, 210);
    L.mainW = offsetPts(L.main, -HW);
    L.mainE = offsetPts(L.main, +HW);
    L.branch = BRANCH_PATH.pts.slice();
    L.branchL = offsetPts(L.branch, -EW);
    L.branchR = offsetPts(L.branch, +EW);
    const j1 = filletJoin(L.mainW.filter((p) => p[0] < SP.tipX + 60), L.branchL, 18);
    L.outerCurb = j1.curb; L.outerFill = j1.fill;
    // 2026-11-08：东侧那个岔口边也做成圆弧（客户：模仿西边那道圆角），
    //   原来是「支路东边线 与 主路北边线」硬碰硬的一个折角
    // 半径要小：18 m 的圆角会把整条支路口封死（实测弧形从 x=−6 一路扫到 z=−26）。
    //   8 m 正好是「人行道转角切一刀」的尺度，跟客户要的“圆润一点”对得上。
    const j2 = filletJoin(L.mainW.filter((p) => p[0] > -12), L.branchR.filter((p) => p[1] > -60), 10);
    L.innerCurb = j2.curb; L.innerFill = j2.fill; L.innerArc = j2.iArc; L.innerArcN = j2.nArc; L.innerCorner = j2.corner;
    L.bank = sampleAlong(bankS, SP.xMin, SP.xMax, 210);
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 40, 28),
      new THREE.MeshBasicMaterial({ map: texSky(this.sunDir), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    const glow = (size, c, op) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texGlow(c), transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(size, size, 1);
      sp.position.copy(this.sunDir).multiplyScalar(1700);
      this.scene.add(sp);
    };
    glow(560, 'rgba(255,226,170,0.85)', 0.45);
    glow(190, 'rgba(255,252,240,1)', 0.9);
  }

  buildGround() {
    const lawn = sampleAlong((x) => bankS(x), SP.xMin - 40, SP.xMax + 40, 130);
    ribbon(lawn, -900, 0, -0.12, PAL.grass, this.B.solid);
    ribbon(lawn, -3.2, 0, -0.115, PAL.grassDark, this.B.solid);
  }

  buildRoad() {
    const { L, B } = this, NJ = 8;
    for (let i = 0; i < L.main.length - 1; i++) {
      const x0 = L.main[i][0], x1 = L.main[i + 1][0];
      for (let j = 0; j < NJ; j++) {
        const d0 = -HW + (2 * HW * j) / NJ, d1 = -HW + (2 * HW * (j + 1)) / NJ;
        const P = (x, d) => [x, crownY(x, roadZ(x) + d), roadZ(x) + d];
        B.asphalt.quad(P(x0, d0), P(x0, d1), P(x1, d1), P(x1, d0), '#FFFFFF', true);
      }
    }
    ribbon(L.branch, -EW, EW, Y_ROAD - 0.006, '#F2F2F2', B.asphalt);
    if (L.outerFill.length > 2) poly(L.outerFill, Y_ROAD - 0.009, '#EAEAEA', B.asphalt);
    if (L.innerFill && L.innerFill.length > 2) poly(L.innerFill, Y_ROAD - 0.005, '#EAEAEA', B.asphalt);
    // 岔口内侧：两条腿之间那块楔形先铺沥青（导流岛坐在上面），再往外才是绿地
    {
      const gap = [];
      for (let s = 0; s <= 30; s += 1) {
        const q = branchAt(s), t2 = q.t, n2 = [-t2[1], t2[0]];
        gap.push([q.x + n2[0] * EW, q.z + n2[1] * EW]);
      }
      for (let x = SP.tipX + 30; x >= SP.tipX; x -= 1) {
        const h = 1;
        gap.push([x, roadZ(x) - HW]);
        void h;
      }
      if (gap.length > 3) { try { poly(gap, Y_ROAD - 0.008, '#F4F4F4', B.asphalt); } catch { /* 自交就跳过 */ } }
    }

    const yd = (x, z) => crownY(x, z) + 0.004;
    for (const c of [-5.05, 5.05]) for (const s of [-1.5, 1.5]) ribbon(offsetPts(L.main, c + s), -0.34, 0.34, yd, PAL.rut, B.decal);
    for (const c of [-4.5, 4.5]) for (const s of [-1.5, 1.5]) ribbon(offsetPts(L.branch, c + s), -0.34, 0.34, Y_ROAD + 0.004, PAL.rut, B.decal);
    const r = rng(5);
    for (const [x, d, w, l] of [[-60, -4.2, 2.6, 3.4], [-24, 4.0, 2.0, 2.6], [16, 6.2, 3.0, 4.2], [52, -3.4, 2.4, 3.0], [-88, 3.2, 2.8, 4.4]]) {
      const z = roadZ(x) + d, a = (r() - 0.5) * 0.1;
      const q = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]]
        .map(([u, v]) => [x + u * Math.cos(a) - v * Math.sin(a), z + u * Math.sin(a) + v * Math.cos(a)])
        .map(([qx, qz]) => [qx, yd(qx, qz) + 0.001, qz]);
      B.decal.quad(q[0], q[1], q[2], q[3], PAL.patch, true);
    }
  }

  curb(pts, side, walk = SP.walkW, ds = false) {
    const s = side, o = CURB_W + walk;
    const prof = [[0, Y_ROAD - 0.03], [0, Y_WALK - 0.03], [0.03 * s, Y_WALK], [CURB_W * s, Y_WALK]];
    const cols = [PAL.graniteDark, PAL.granite, PAL.granite];
    if (walk > 0) { prof.push([o * s, Y_WALK]); cols.push(PAL.walk); }
    prof.push([(walk > 0 ? o : CURB_W) * s, -0.03]); cols.push(PAL.graniteDark);
    extrude(pts, prof, cols, this.B.solid, { flip: s < 0, doubleSide: ds });
    if (walk > 0) along(pts, 1.6, (p, t, n) => {
      const A = [p[0] + n[0] * s * CURB_W, p[1] + n[1] * s * CURB_W], Q = [p[0] + n[0] * s * o, p[1] + n[1] * s * o];
      const y = Y_WALK + 0.004;
      this.B.paint.quad([A[0], y, A[1]], [Q[0], y, Q[1]], [Q[0] + t[0] * 0.05, y, Q[1] + t[1] * 0.05], [A[0] + t[0] * 0.05, y, A[1] + t[1] * 0.05], PAL.walkJoint, true);
    });
  }

  buildCurbs() {
    const L = this.L;
    this.curb(L.outerCurb, -1);
    // 2026-11-08：东侧内角要拆两段 —— 主路段（行进 +x，路在 +z 侧）该用 −1，
    //   支路段（行进 −z，路在 −x 侧）该用 +1；用同一个 side 会把其中一半挤到路面里去
    if (L.innerCurb && L.innerCurb.length > 2 && L.innerArc >= 0) {
      // 2026-11-08：东侧内角只铺「转角铺装」（innerFill 已经把折角改成圆弧了）。
      //   不再画路缘线 —— filletJoin 在反角（内角）上算出的弧会来回折，画成路缘就是一堆交叉白块；
      //   试过 extrude 分段、doubleSide、整段 ribbon，都会在拐点叠出多余的方块。
      //   铺装本身已经足够表达“转角被圆润地切了一刀”，客户在意的是转角形状，不是这条白线。
      void L.innerArc; void L.innerArcN;

    }
    this.curb(L.mainE, +1);
    const br = L.branchR.filter((p) => p[1] < -36);
    if (br.length > 2) this.curb(br, +1);
  }

  buildMarkings() {
    const { L, B } = this, C = PAL.paint;
    const ln = (pts, d0, d1) => ribbon(pts, d0, d1, (x, z) => crownY(x, z) + 0.006, C, B.paint);
    const dash = (pts, on, gap) => along(pts, on + gap, (p, t) => ln([p, [p[0] + t[0] * on, p[1] + t[1] * on]], -0.09, 0.09));
    // 普通双向车道：中间双黄实线（隔离设施是临时加装，就压在这条线上）
    const yl = (pts, d0, d1) => ribbon(pts, d0, d1, (x, z) => crownY(x, z) + 0.005, PAL.yellow, B.paint);
    yl(L.main, -0.225, -0.075);
    yl(L.main, 0.075, 0.225);
    yl(L.branch.filter((p) => p[1] < -0.5), -0.225, -0.075);
    yl(L.branch.filter((p) => p[1] < -0.5), 0.075, 0.225);

    ln(L.mainW.filter((p) => p[0] < SP.tipX + 4), 0.34, 0.54);
    ln(L.mainE, -0.54, -0.34);
    ln(L.branchL.filter((p) => p[1] < -8), 0.34, 0.54);
    ln(L.branchR.filter((p) => p[1] < -30), -0.54, -0.34);
    dash(offsetPts(L.main, -5.05).filter((p) => p[0] > -150), 5, 7);
    dash(offsetPts(L.main, 5.05).filter((p) => p[0] > -150), 5, 7);
    // 主路人行横道 + 停止线（在分流牌南侧 30 m 处，镜头起手可见）
    for (let z = roadZ(-130) - HW + 0.8; z <= roadZ(-130) + HW - 0.7; z += 1.05) {
      B.paint.quad([-133, Y_ROAD + 0.008, z], [-129.5, Y_ROAD + 0.008, z], [-129.5, Y_ROAD + 0.008, z + 0.5], [-133, Y_ROAD + 0.008, z + 0.5], C, true);
    }
    for (let z = roadZ(-135) - HW + 0.3; z <= roadZ(-135) + HW - 0.4; z += 1.0) {
      B.paint.quad([-135.2, Y_ROAD + 0.008, z], [-134.8, Y_ROAD + 0.008, z], [-134.8, Y_ROAD + 0.008, z + 0.55], [-135.2, Y_ROAD + 0.008, z + 0.55], C, true);
    }
    // 支路人行横道 + 停止线（s ≈ 62）
    const p0 = branchAt(62), p1 = branchAt(63);
    const t = unit2(sub2([p1.x, p1.z], [p0.x, p0.z])), n = [-t[1], t[0]];
    for (let v = -EW + 0.6; v <= EW - 0.5; v += 1.05) {
      const c = [p0.x + n[0] * v, p0.z + n[1] * v];
      B.paint.quad([c[0] - t[0] * 1.7, Y_ROAD + 0.008, c[1] - t[1] * 1.7], [c[0] + t[0] * 1.7, Y_ROAD + 0.008, c[1] + t[1] * 1.7],
        [c[0] + t[0] * 1.7 + n[0] * 0.5, Y_ROAD + 0.008, c[1] + t[1] * 1.7 + n[1] * 0.5], [c[0] - t[0] * 1.7 + n[0] * 0.5, Y_ROAD + 0.008, c[1] - t[1] * 1.7 + n[1] * 0.5], C, true);
    }
    // 导向箭头
    this.arrows = { left: { pos: [], uv: [] }, straight: { pos: [], uv: [] } };
    const arrowAt = (dir, s, lane) => {
      const q = lane === 'f' ? femaleAt(s) : maleAt(s);
      const len = 6.4, w = len / 2;
      const t2 = q.t, n2 = [-t2[1], t2[0]];
      const P = (u, v) => [q.x + t2[0] * u + n2[0] * v, Y_ROAD + 0.012, q.z + t2[1] * u + n2[1] * v];
      const quad = [P(-len / 2, -w / 2), P(-len / 2, w / 2), P(len / 2, w / 2), P(len / 2, -w / 2)];
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const A = this.arrows[dir];
      for (const k of [0, 2, 1, 0, 3, 2]) { A.pos.push(...quad[k]); A.uv.push(...uv[k]); }
    };
    arrowAt('left', -34, 'f'); arrowAt('left', -18, 'f');
    arrowAt('straight', -34, 'm'); arrowAt('straight', -18, 'm');
    for (const [dir, A] of Object.entries(this.arrows)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: texArrow(dir), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.receiveShadow = true; m.renderOrder = 2;
      this.scene.add(m);
    }
  }

  // ── 隔离设施（临时加装，坐在普通双黄线上）
  //    三条腿各 100 m：0–50 m 注水马、50–100 m 反光锥（每 4 m 一个）；
  //    导流岛不再铺装，改成沿三道内凹弧摆粉蓝相间的水马、由隔离栏本身围出三尖形
  buildMedian() {
    const bat = this.B;
    const boxW = 0.62, boxH = 0.86, unit = 2.0;
    // 主路有 9 cm 路拱、支路是平的 ⇒ 底座贴各自的真实路面（否则会陷进路里）
    const yGround = (x, z) => Math.max(crownY(x, z), Y_ROAD) + 0.012;
    for (const D of DIVIDERS) {
      const wEnd = (D.waterLen ?? SP.waterSeg) - 0.8;
      along(D.pts, unit, (p, t, n, s) => {
        if (s < 0.8 || s > wEnd) return;
        const ry = -Math.atan2(t[1], t[0]), yB = yGround(p[0], p[1]);
        box(bat.solid, [p[0], yB + boxH / 2, p[1]], [unit - 0.14, boxH, boxW], ry, '#F7F9FB');
        box(bat.solid, [p[0], yB + boxH * 0.62, p[1]], [unit - 0.12, 0.16, boxW + 0.02], ry, Math.round(s / unit) % 4 < 2 ? R.half : R.full);
        box(bat.solid, [p[0], yB + boxH + 0.03, p[1]], [unit - 0.32, 0.06, boxW * 0.7], ry, '#DDE4EA');
      });
    }
    // 反光锥：三条腿 50–100 m（每 4 m）+ 三尖形的三个尖（水马拐不了那么急的弯，改用锥）
    const conePos = [];
    for (const D of DIVIDERS) {
      // 最后一节让给分流牌（牌子就立在 100 m 处），别让锥筒穿进牌子里
      const c0 = (D.waterLen ?? SP.waterSeg) + 1;
      along(D.pts, 2.0, (p, t, n, sq) => { if (sq >= c0 && sq <= SP.medianLen - 1.6) conePos.push([p[0], p[1]]); });
    }
    const arcLen = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    const nCone = Math.max(1, conePos.length);
    const mtx = new THREE.Matrix4();
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.20, 0.62, 12), new THREE.MeshLambertMaterial({ color: col(PAL.cone) }), nCone);
    const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), new THREE.MeshLambertMaterial({ color: col('#2B2B2B') }), nCone);
    const band = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.117, 0.147, 0.10, 12), new THREE.MeshLambertMaterial({ color: col('#FFFFFF') }), nCone);
    for (let i = 0; i < conePos.length; i++) {
      const [x, z] = conePos[i], yB = yGround(x, z);
      mtx.makeTranslation(x, yB + 0.31, z); cone.setMatrixAt(i, mtx);
      mtx.makeTranslation(x, yB + 0.025, z); base.setMatrixAt(i, mtx);
      mtx.makeTranslation(x, yB + 0.42, z); band.setMatrixAt(i, mtx);
    }
    cone.castShadow = true;
    this.scene.add(cone, base, band);

    // ── 导流岛取消（客户 2026-11-07）：不铺花岗岩、不种灌木，
    //    改成沿 ISLAND 的三道内凹弧摆粉蓝相间的水马，用隔离栏本身围出三尖形。
    {
      // 客户 2026-11-08：水马/锥回到上一版的状态 —— 三道弧**全长**摆粉蓝水马（不再在尖上换锥），
      //   水马长度按弧长自适应，转到尖上会自动变短，不会像定长那样叠成一团。
      let k = 0;
      for (const arc of ISLAND_ARCS) {
        const L = arcLen(arc);
        along(arc, 1.9, (p, t, n, sq) => {
          const ry = -Math.atan2(t[1], t[0]), y0 = yGround(p[0], p[1]);
          const c = (k++ % 4) < 2 ? R.half : R.full;
          // 距两端越近、弧越弯 ⇒ 块越短；中间段保持 1.78 m 的标准身位
          const w = Math.min(1.78, Math.max(0.75, Math.min(sq, L - sq) * 1.35 + 0.62));
          box(bat.solid, [p[0], y0 + boxH / 2, p[1]], [w, boxH, boxW], ry, '#F7F9FB');
          box(bat.solid, [p[0], y0 + boxH * 0.62, p[1]], [w - 0.02, 0.16, boxW + 0.02], ry, c);
          box(bat.solid, [p[0], y0 + boxH + 0.03, p[1]], [Math.max(0.5, w - 0.26), 0.06, boxW * 0.7], ry, '#DDE4EA');
        });
      }
    }

  }

  // ── 分流牌：落地标识牌（客户 2026-11-07 改版）
  //    牌面下沿离地 S.y0，坐一圈矮底座；不再有立杆 / 龙门架 / 斜撑。
  //    面板法线朝 −x（跑者来向），背面另给一块素板，免得从后面看是空的。
  buildSign() {
    const S = SIGN, bat = this.B;
    const yMid = S.y0 + S.h / 2;
    const tex = texSign(THEME);

    const face = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshLambertMaterial({ map: tex }));
    face.material.emissiveMap = tex;
    face.material.emissive = col('#FFFFFF');
    face.material.emissiveIntensity = 0.26;
    face.position.set(S.x - 0.06, yMid, S.z);
    face.rotation.y = -Math.PI / 2;
    face.receiveShadow = true;
    this.scene.add(face);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshLambertMaterial({ color: col('#E6EAEE') }));
    back.position.set(S.x + 0.06, yMid, S.z);
    back.rotation.y = Math.PI / 2;
    // 背面朝太阳（+x）：让它投出真影子，牌子才不像悬空
    back.castShadow = true;
    this.scene.add(back);

    // 牌体（薄箱，给厚度和影子）
    box(bat.cast, [S.x, yMid, S.z], [0.10, S.h, S.w], 0, '#CDD4DA');
    // 上下铝型材压边
    box(bat.cast, [S.x, S.y0 + S.h + 0.035, S.z], [0.16, 0.07, S.w + 0.08], 0, '#C3CAD1');
    box(bat.cast, [S.x, S.y0 - 0.035, S.z], [0.16, 0.07, S.w + 0.08], 0, '#B7BEC5');
    // 落地底座（比路面深一档，才看得出“落在地上”）
    box(bat.cast, [S.x, S.y0 / 2, S.z], [0.72, S.y0, S.w + 0.30], 0, '#8E99A4');
    box(bat.cast, [S.x, S.y0 + 0.014, S.z], [0.64, 0.028, S.w + 0.18], 0, '#D9DFE4');
    // 背后两根矮斜撑（贴地，不外露到正面）
    for (const sd of [-1, 1]) {
      const zz = S.z + sd * (S.w / 2 - 0.30);
      tube(bat.cast, [S.x + 0.05, S.y0 + S.h * 0.42, zz], [S.x + 0.62, 0.02, zz], 0.035, PAL.metalDark, 6);
    }
  }


  buildWest() {
    const { L, B } = this, r = rng(7);
    const clearOf = (x, z, m = 5) => {
      let db = Infinity;
      for (const p of L.branch) db = Math.min(db, dist2(p, [x, z]));
      const dm = Math.abs(roadZ(x) - z) - HW;
      return db - EW > m && dm > m && z < bankS(x) - 2;
    };
    this.clearOf = clearOf;
    for (const RR of runs(offsetPts(L.outerCurb, -(CURB_W + SP.walkW + 3.6)), (p) => clearOf(p[0], p[1], CURB_W + SP.walkW + 3.2), true)) {
      if (RR.length < 3) continue;
      ribbon(RR, -0.2, 3.2, 0.05, PAL.grassDark, B.solid);
      extrude(RR, [[0, 0.06], [-0.8, 0.06], [-0.8, 0.92], [0, 0.92], [0, 0.06]], [PAL.hedge, PAL.hedge, mix(PAL.hedge, '#FFFFFF', 0.1), PAL.hedge], B.solid, { doubleSide: true });
    }
    for (const RR of runs(offsetPts(L.outerCurb, -(SP.walkW + 6.2)), (p) => clearOf(p[0], p[1], SP.walkW + 5.6), true)) {
      if (RR.length < 2) continue;
      for (let i = 0; i < RR.length - 1; i++) {
        const a = RR[i], b2 = RR[i + 1], L2 = dist2(a, b2);
        if (L2 < 0.1) continue;
        const nP = Math.max(1, Math.round(L2 / 2.4));
        for (let k = 0; k <= nP; k++) {
          const u = k / nP, p = [a[0] + (b2[0] - a[0]) * u, a[1] + (b2[1] - a[1]) * u];
          tube(B.solid, [p[0], 0, p[1]], [p[0], 1.1, p[1]], 0.028, PAL.metal);
        }
        for (const y of [0.12, 0.98]) tube(B.solid, [a[0], y, a[1]], [b2[0], y, b2[1]], 0.022, PAL.metal);
        const t = unit2(sub2(b2, a)), n2 = [-t[1], t[0]];
        for (const side of [-1, 1]) {
          const o = [n2[0] * side * 0.03, n2[1] * side * 0.03];
          const q = (pp, y2) => [pp[0] + o[0], y2, pp[1] + o[1]];
          const qd = (y0, y1, c) => side > 0 ? B.solid.quad(q(a, y0), q(a, y1), q(b2, y1), q(b2, y0), c) : B.solid.quad(q(a, y0), q(b2, y0), q(b2, y1), q(a, y1), c);
          qd(0.24, 0.94, R.half); qd(0.19, 0.24, '#FFFFFF'); qd(0.94, 0.99, '#FFFFFF');
        }
      }
    }
    this.trees = []; this.flags = []; this.people = [];   // flags / people 已停用（2026-11-07）
    const tents = [];
    for (let x = -66; x <= -30; x += 11) tents.push([x, roadZ(x) - HW - 16]);
    for (let x = -12; x <= 34; x += 12) tents.push([x, roadZ(x) - HW - 18]);
    for (let x = 62; x <= 130; x += 13) tents.push([x, roadZ(x) - HW - 20]);
    for (const [tx, tz] of tents) {
      if (!clearOf(tx, tz, 8)) continue;
      box(B.solid, [tx, 1.35, tz], [5.2, 2.7, 3.6], 0, '#F7F5EF');
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.2, 4), new THREE.MeshLambertMaterial({ color: col(VN.tent || '#F6B24B') }));
      roof.position.set(tx, 3.3, tz); roof.rotation.y = Math.PI / 4;
      this.scene.add(roof);
    }
    for (let x = -150; x <= 12; x += 8.4) {
      const z = roadZ(x) - HW - SP.walkW - 2.2;
      if (!clearOf(x, z, 3)) continue;
      this.trees.push({ p: [x, 0, z], h: 8.0 + r() * 3.2, c: Math.floor(r() * 3) });
    }
    for (let x = -60; x <= 20; x += 12) for (let z = roadZ(x) - HW - 22; z >= roadZ(x) - HW - 40; z -= 10) if (clearOf(x, z)) this.trees.push({ p: [x, 0, z], h: 7.4 + r() * 3.6, c: Math.floor(r() * 3) });
    for (let s = 26; s <= 150; s += 9) {
      const q = branchAt(s), z = q.z - EW - SP.walkW - 2.4;
      if (!clearOf(q.x, z, 3.4)) continue;
      this.trees.push({ p: [q.x, 0, z], h: 7.8 + r() * 3.2, c: Math.floor(r() * 3) });
    }
    for (let x = 60; x <= 160; x += 13) {
      const z = roadZ(x) - HW - SP.walkW - 5;
      if (!clearOf(x, z, 4)) continue;
      this.trees.push({ p: [x, 0, z], h: 8.2 + r() * 3.6, c: Math.floor(r() * 3) });
    }
    // 客户 2026-11-07：路边的旗子整排撤掉（远景里就是一堆彩色竖条，容易看成穿帮）
    // 客户 2026-11-07：人行道上的行人整排撤掉（远景里只是几个彩色胶囊，反而像穿帮）
    // 客户 2026-11-07：**主会场门架整座撤掉** —— 分流副本里它只是个远景道具，
    //   镜头一抬高就露出来当穿帮；道路保持干净。志愿者小棚与人群一并去掉。

  }

  buildEast() {
    const { L, B } = this, r = rng(13);
    const bank = L.bank;
    const prof = [[-3.4, 0.0], [-3.2, 0.06], [0, 0.06], [0, 0.12], [0.5, 0.12], [0.5, -0.1], [0.95, -0.1], [0.95, -0.3], [1.4, -0.3], [1.4, -0.5], [1.85, -0.5], [1.85, Y_WATER - 0.25]];
    extrude(bank, prof, [PAL.stoneDark, PAL.stone, PAL.stone, PAL.stone, PAL.stone, PAL.stoneDark, PAL.stoneDark, PAL.stoneDark, PAL.stoneDark, PAL.stoneDark, PAL.stoneWet], B.solid, { flip: true });
    ribbon(offsetPts(bank, -3.2), -0.2, 2.8, 0.075, PAL.walk, B.solid);
    this.lamps = [];
    for (let x = -120; x <= 150; x += 17) this.lamps.push([x, bankS(x) - 1.2]);
    this.reeds = [];
    for (let x = -140; x <= 160; x += 1.7) {
      const zs = bankS(x);
      for (let i = 0; i < 3; i++) {
        if (r() < 0.35) continue;
        this.reeds.push([x + r() * 1.2, zs + 1.6 + r() * 2.6, 0.55 + r() * 0.75, Math.floor(r() * 2)]);
      }
    }
  }

  buildWater() {
    const edge = sampleAlong((x) => bankS(x) + 1.85, SP.xMin - 60, SP.xMax + 60, 130);
    ribbon(edge, 0, 1500, Y_WATER, PAL.water, this.B.far);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col('#FFF0C8'), transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = -4;
    this.glitter = m;
    this.scene.add(m);
  }

  buildFar() {
    const treeLine = (x0, x1, z, h0, h1, color, op) => {
      const pos = [];
      for (let x = x0; x < x1; x += 12) {
        const hh = h0 + (h1 - h0) * (0.5 + 0.5 * Math.sin(x * 0.07 + z));
        pos.push([x, 0, z], [x + 12, 0, z], [x + 12, hh, z], [x, 0, z], [x + 12, hh, z], [x, hh, z]);
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3));
      gg.computeVertexNormals();
      this.scene.add(new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: col(color), side: THREE.DoubleSide, fog: false, transparent: true, opacity: op })));
    };
    treeLine(-900, 900, 640, 6, 22, '#A6B8C6', 0.55);
    treeLine(-900, 900, 900, 10, 40, '#93A9BC', 0.45);
  }

  buildInstanced() {
    const sc = this.scene, mtx = new THREE.Matrix4(), c = new THREE.Color();
    if (this.trees.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.26, 1, 6), new THREE.MeshLambertMaterial({ color: col(PAL.trunk) }), this.trees.length);
      const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 7), new THREE.MeshLambertMaterial(), this.trees.length * 2);
      this.trees.forEach((t, i) => {
        const th = t.h * 0.56;
        mtx.makeScale(1, th, 1).setPosition(t.p[0], th / 2, t.p[2]);
        trunk.setMatrixAt(i, mtx);
        for (let k = 0; k < 2; k++) {
          const rr = t.h * (0.34 - k * 0.07);
          mtx.makeScale(rr, rr * 0.78, rr).setPosition(t.p[0] + (k ? rr * 0.35 : -rr * 0.2), t.h * (0.62 + k * 0.16), t.p[2]);
          crown.setMatrixAt(i * 2 + k, mtx);
          crown.setColorAt(i * 2 + k, c.set(PAL.tree[(t.c + k) % 3]));
        }
      });
      trunk.castShadow = true; crown.castShadow = true;
      sc.add(trunk, crown);
    }
    if (this.reeds.length) {
      const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 1, 5), new THREE.MeshLambertMaterial(), this.reeds.length);
      this.reeds.forEach((rd, i) => {
        mtx.makeScale(1, rd[2], 1).setPosition(rd[0], rd[2] / 2 - 0.55, rd[1]);
        inst.setMatrixAt(i, mtx);
        inst.setColorAt(i, c.set(PAL.reed[rd[3]]));
      });
      sc.add(inst);
    }
    if (this.lamps) {
      const n = this.lamps.length;
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 6.4, 8), new THREE.MeshLambertMaterial({ color: col('#D8DDE2') }), n);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.16, 0.34), new THREE.MeshLambertMaterial({ color: col('#E9EDF0') }), n);
      this.lamps.forEach(([x, z], i) => {
        mtx.makeTranslation(x, 3.2, z); pole.setMatrixAt(i, mtx);
        mtx.makeTranslation(x - 0.55, 6.32, z); head.setMatrixAt(i, mtx);
      });
      sc.add(pole, head);
    }
  }

  setPhase() {}
  setConfetti() {}
  setGun() {}
  updateConfetti() {}
  setTapeBroken() {}

  // ── 角色（客户 2026-11-08：螃蟹要进到三维场景里，和物件有真实遮挡关系）
  //    做法：每只一个 THREE.Sprite（永远正对镜头），材质用 alphaTest + depthWrite，
  //    这样它走的是「不透明队列」、写深度 ⇒ 会被水马/反光锥/分流牌/行道树真正挡住，
  //    同时它也会挡住它身后的东西（以前画在 SVG 上层，永远是「浮在最上面」）。
  //    贴图直接吃 __ASSETS 里的 webp data URL（带 alpha），不用另做资产。

  /** 帧源：`id#帧号` → data URL */
  _crabSrc(id, idx = 0) {
    const c = globalThis.__ASSETS && globalThis.__ASSETS.crabs && globalThis.__ASSETS.crabs[id];
    if (!c) return null;
    return c.seq && c.seq.length ? (c.seq[Math.min(idx, c.seq.length - 1)] || c).src : c.src;
  }

  /**
   * 贴图缓存：`id#帧号` → Texture。
   * 解码是异步的 —— 没解完就渲染的话，sampler 采到全 0，alphaTest 会把整只螃蟹丢掉
   * （踩过：直接 seek 到 1559 帧截图，只看得见接地阴影、看不见螃蟹）。
   * 所以构造时就 preloadCrabs() 把 8 张图全部 decode 掉，并用同一个 Image 建纹理。
   */
  _crabTexFor(id, idx = 0) {
    const key = `${id}#${idx}`;
    if (this._crabTex.has(key)) return this._crabTex.get(key);
    const src = this._crabSrc(id, idx);
    if (!src) { this._crabTex.set(key, null); return null; }
    const img = this._crabImg.get(key);
    const t = img ? new THREE.Texture(img) : new THREE.TextureLoader().load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this._crabTex.set(key, t);
    return t;
  }

  /** 预解码两只背面角色的全部动画帧（4 帧 × 2 只）。窗口 1495 帧才用得到，肯定来得及 */
  preloadCrabs() {
    const jobs = [];
    for (const id of ['f1_back', 'm1_back']) {
      const c = globalThis.__ASSETS && globalThis.__ASSETS.crabs && globalThis.__ASSETS.crabs[id];
      if (!c) continue;
      const n = c.seq && c.seq.length ? c.seq.length : 1;
      for (let i = 0; i < n; i++) {
        const key = `${id}#${i}`, src = this._crabSrc(id, i);
        if (!src || this._crabImg.has(key)) continue;
        const img = new Image();
        img.src = src;
        this._crabImg.set(key, img);
        jobs.push(img.decode ? img.decode().catch(() => {}) : Promise.resolve());
      }
    }
    this.crabsReady = Promise.all(jobs);
    return this.crabsReady;
  }

  _ensureCrab(who) {
    if (this.crabs[who]) return this.crabs[who];
    const mat = new THREE.SpriteMaterial({
      transparent: false, alphaTest: 0.26, depthTest: true, depthWrite: true, fog: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0);                 // 原点 = 脚底
    sp.renderOrder = 8;
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({
        color: col('#0B2240'), transparent: true, opacity: 0.30, depthWrite: false, fog: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
    );
    sh.rotation.x = -Math.PI / 2;          // 摊平贴地
    sh.renderOrder = 3;
    this.scene.add(sp, sh);
    const a = { sp, sh };
    this.crabs[who] = a;
    return a;
  }

  /** 每帧把两只摆进去；传空 = 全部隐藏（切到别的场景时用） */
  setCrabs(pose, st, t) {
    const groundY = (x, z) => Math.max(crownY(x, z), Y_ROAD);
    for (const who of ['female', 'male']) {
      const A = this._ensureCrab(who);
      const x = who === 'male' ? pose && pose.maleX : pose && pose.femaleX;
      const z = who === 'male' ? pose && pose.maleZ : pose && pose.femaleZ;
      const c = st && st[who];
      const hide = () => { A.sp.visible = false; A.sh.visible = false; };
      if (x == null || z == null || !c) { hide(); continue; }
      const sex = who === 'male' ? 'm' : 'f';
      const id = crabId(sex, c.stage, c.mood, true) || `${sex}1_back`;
      const crab = globalThis.__ASSETS && globalThis.__ASSETS.crabs && globalThis.__ASSETS.crabs[id];
      if (!crab) { hide(); continue; }
      const cad = c.mood === 'cheer' || c.mood === 'win' ? 1.5 : 2.35;
      const phase = (t * cad + (who === 'female' ? 0.5 : 0)) % 1;
      const nF = crab.seq && crab.seq.length ? crab.seq.length : 1;
      const fi = Math.min(nF - 1, Math.floor(phase * nF));
      const tex = this._crabTexFor(id, fi);
      if (!tex) { hide(); continue; }
      if (A.sp.material.map !== tex) { A.sp.material.map = tex; A.sp.material.needsUpdate = true; }
      const frame = (crab.seq && crab.seq[fi]) || crab;
      const h = CRAB_H, w = h * (frame.w / frame.h);
      const gy = groundY(x, z);
      const still = who === 'male' ? (pose.maleStill ?? pose.still) : (pose.femaleStill ?? pose.still);
      const ph = phase * Math.PI * 2;
      // 跑动时的上下颠：和 SVG 版同一套公式（0.06×身高，序列帧幅度减半）
      const bob = still ? 0 : Math.abs(Math.sin(ph)) * CRAB_H * 0.06 * 0.55;
      A.sp.scale.set(w, h, 1);
      A.sp.position.set(x, gy + bob, z);
      const lean = (who === 'male' ? pose.maleLean : pose.femaleLean) || 0;
      A.sp.material.rotation = -lean * Math.PI / 180;   // SVG 是顺时针，three 的 sprite 是逆时针
      A.sp.visible = true;
      const r = w * 0.42 * (1 - bob / h * 0.8);
      A.sh.scale.set(r, 1, r * 0.22);
      A.sh.position.set(x, gy + 0.014, z);
      A.sh.visible = true;
    }
  }

  setExposure(k) {
    const LT = this.LIGHT;
    this.hemi.intensity = LT.hemi * k;
    this.sun.intensity = LT.sun * k;
    this.fill.intensity = LT.fill * k;
    this._exp = k;
  }

  setCamera(p2, rect) {
    const cam = this.camera;
    cam.aspect = rect.w / rect.h;
    const az = THREE.MathUtils.degToRad(p2.az ?? 90), pi = THREE.MathUtils.degToRad(p2.pitch ?? 4);
    const [tx, tz] = p2.target;
    const ty = p2.ty ?? 1.1;
    const hd = Math.cos(pi) * p2.dist;
    cam.position.set(tx - Math.sin(az) * hd, ty + Math.sin(pi) * p2.dist, tz + Math.cos(az) * hd);
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, ty, tz);
    cam.setViewOffset(rect.w, rect.h, 0, -(p2.frame || 0) * rect.h, rect.w, rect.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const S = Math.min(120, Math.max(36, p2.dist * 1.8));
    const sh = this.sun.shadow.camera;
    sh.left = -S; sh.right = S; sh.top = S; sh.bottom = -S; sh.near = 1; sh.far = 1000;
    sh.updateProjectionMatrix();
    const ox = tx + S * 0.35, oz = tz;
    this.sun.target.position.set(ox, 0, oz);
    this.sun.position.set(ox + this.sunDir.x * 400, this.sunDir.y * 400, oz + this.sunDir.z * 400);
    this.sun.target.updateMatrixWorld();
    this.fill.target.position.set(tx, 0, tz);
    this.fill.position.set(tx - 220, 150, tz - 70);
    this.fill.target.updateMatrixWorld();
    if (this.glitter) {
      const cx = cam.position.x, cz = cam.position.z;
      const L = Math.hypot(this.sunDir.x, this.sunDir.z) || 1, ux = this.sunDir.x / L, uz = this.sunDir.z / L;
      let t0 = 0;
      while (t0 < 600 && cz + uz * t0 < bankS(cx + ux * t0) + 3) t0 += 1;
      const t1 = t0 + 1400, nx = -uz, nz = ux, y = Y_WATER + 0.02;
      const w0 = 0.9 + t0 * 0.035, w1 = t1 * 0.035;
      const A = [cx + ux * t0 - nx * w0, y, cz + uz * t0 - nz * w0], Bq = [cx + ux * t0 + nx * w0, y, cz + uz * t0 + nz * w0];
      const Cc = [cx + ux * t1 + nx * w1, y, cz + uz * t1 + nz * w1], D = [cx + ux * t1 - nx * w1, y, cz + uz * t1 - nz * w1];
      const P = this.glitter.geometry.attributes.position;
      [A, Bq, Cc, A, Cc, D].forEach((p, i) => P.setXYZ(i, p[0], p[1], p[2]));
      P.needsUpdate = true;
    }
    this._rect = rect; this._dist = p2.dist;
  }

  renderView(rect) {
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
