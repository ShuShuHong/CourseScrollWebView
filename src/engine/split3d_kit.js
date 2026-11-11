// ════════════════════════════════════════════════════════════════════════
//  分流副本的建模工具（2026-10-30 · 第 1 批置景）
//  · Batch：把同材质的静态几何攒成一个 mesh（顶点色），一次 draw call
//  · ribbon / extrude / poly：沿折线铺带子、扫截面、填多边形
//  · 贴图：天空（按仰角）、沥青细纹、软斑、分流牌、主会场门头字
// ════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

export const col = (c) => new THREE.Color(c);
const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _e = new THREE.Euler();

/** 同材质静态几何的累加器 */
export class Batch {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  get count() { return this.pos.length / 3; }
  /** 一个三角形（a/b/c = [x,y,z]），法线按绕序算；flipUp=true 时保证朝上 */
  tri(a, b, c, color, flipUp = false) {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (flipUp && ny < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    _c.set(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(_c.r, _c.g, _c.b);
    }
  }
  quad(a, b, c, d, color, flipUp = false) { this.tri(a, b, c, color, flipUp); this.tri(a, c, d, color, flipUp); }
  /** 合进一个 three 几何体（位置/旋转/缩放 → 世界） */
  geo(g, color, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const src = g._ni || (g._ni = g.index ? g.toNonIndexed() : g);
    if (!src.attributes.normal) src.computeVertexNormals();
    _m.compose(_p.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), _s.set(...s));
    const nm = new THREE.Matrix3().getNormalMatrix(_m);
    const P = src.attributes.position, N = src.attributes.normal;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    _c.set(color);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(_m);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z); this.nor.push(n.x, n.y, n.z); this.col.push(_c.r, _c.g, _c.b);
    }
  }
  /** 生成 mesh；uvScale>0 时按世界 xz 生成 uv（给沥青细纹） */
  mesh(material, { uvScale = 0, cast = false, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (uvScale > 0) {
      const uv = [];
      for (let i = 0; i < this.pos.length; i += 3) uv.push(this.pos[i] / uvScale, this.pos[i + 2] / uvScale);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    if (this.pos.length) g.computeBoundingSphere();         // 空批次不算（three 会对 NaN 半径报 error）
    const m = new THREE.Mesh(g, material);
    m.castShadow = cast; m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    return m;
  }
}

/**
 * 沿折线铺带（pts: [[x,z],…]；d0/d1: 侧向偏移，正 = 行进方向右侧（朝 +x 走时就是 +z / 东）；
 * y: 高度或 fn(x,z)）。法线恒朝上。
 */
export function ribbon(pts, d0, d1, y, color, batch) {
  const n = pts.length;
  const norm = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [-dz / L, dx / L];
  };
  const H = typeof y === 'function' ? y : () => y;
  const v = [];
  for (let i = 0; i < n; i++) {
    const [nx, nz] = norm(i);
    const [x0, z0] = pts[i];
    v.push([x0 + nx * d0, H(x0 + nx * d0, z0 + nz * d0), z0 + nz * d0], [x0 + nx * d1, H(x0 + nx * d1, z0 + nz * d1), z0 + nz * d1]);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = v[i * 2], b = v[i * 2 + 1], c = v[i * 2 + 2], d = v[i * 2 + 3];
    batch.quad(a, b, d, c, color, true);
  }
}

/**
 * 沿折线拉伸横截面（profile: [[d,y],…]，d 同 ribbon：正 = 行进方向右侧；colors: 每段一色或单色）。
 * 截面按 d 递增排列时，立面法线朝 −d、顶面朝上；按 d 递减排列（比如西侧路缘往西铺）要传 flip:true。
 */
export function extrude(pts, profile, colors, batch, { doubleSide = false, flip = false } = {}) {
  const n = pts.length;
  const norm = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [-dz / L, dx / L];
  };
  const rings = pts.map((p, i) => {
    const [nx, nz] = norm(i);
    return profile.map(([d, y]) => [p[0] + nx * d, y, p[1] + nz * d]);
  });
  const C = Array.isArray(colors) ? colors : Array(profile.length - 1).fill(colors);
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < profile.length - 1; j++) {
      const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j + 1], d = rings[i + 1][j];
      if (!flip || doubleSide) batch.quad(a, b, c, d, C[j]);
      if (flip || doubleSide) batch.quad(a, d, c, b, C[j]);
    }
  }
}

/** 填多边形（pts: [[x,z],…] 任意绕向、可凹，不自交；y: 高度；法线恒朝上） */
export function poly(pts, y, color, batch) {
  if (pts.length < 3) return;
  // triangulateShape 内部要调 .equals()，必须传 Vector2（2026-10-30 单测揪出：传普通对象会抛 TypeError）
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [i0, i1, i2] of tris) {
    batch.tri([pts[i0][0], y, pts[i0][1]], [pts[i1][0], y, pts[i1][1]], [pts[i2][0], y, pts[i2][1]], color, true);
  }
}

/**
 * 天空（贴 SphereGeometry 内壁）：按仰角梯度 + 太阳方位暖晕；sunDir = (x,y,z)。
 * 映射：SphereGeometry uv.y = 1 − θ/π，CanvasTexture flipY ⇒ 画布第 row 行 = 天顶角 θ = row/h·π，
 *       **地平线在 h/2**，下半张图被地面挡住永远看不见（旧版暖带和光晕都画在 0.88h–1.0h，所以从没出现过）。
 * 暖带只占地平线上方 ~7°（≈ 4% 画布高），再往上 14° 起转中蓝。
 */
export function texSky(sunDir) {
  const w = 1024, h = 512, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const row = (elevDeg) => h * (0.5 - elevDeg / 180);       // 仰角 → 画布行
  const gr = g.createLinearGradient(0, 0, 0, h);
  const stop = (elevDeg, c) => gr.addColorStop(Math.min(1, Math.max(0, row(elevDeg) / h)), c);
  stop(90, '#2F6FB4');
  stop(40, '#4F8CCB');
  stop(14, '#86B4DE');
  stop(7, '#C9D6DE');
  stop(3, '#F3D9B8');
  stop(0.8, '#FFCB94');
  stop(0, '#FFD7A8');
  stop(-90, '#E9D6BE');                                        // 地平线以下（雾色，只在远处露缝时看到）
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // 太阳方位暖晕：横向拉长、纵向压扁，中心在太阳仰角
  const sunAz = Math.atan2(sunDir.z, -sunDir.x) / (Math.PI * 2);
  const sunEl = Math.asin(Math.max(-1, Math.min(1, sunDir.y / (Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1)))) * 180 / Math.PI;
  const cx = w * (sunAz + (sunAz < 0 ? 1 : 0)), cy = row(sunEl);
  for (const off of [-w, 0, w]) {                              // u 方向首尾相接，跨缝也要连上
    g.save();
    g.translate(cx + off, cy);
    g.scale(1, 0.32);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 260);
    rg.addColorStop(0, 'rgba(255,214,150,0.90)');
    rg.addColorStop(0.45, 'rgba(255,200,140,0.40)');
    rg.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = rg; g.fillRect(-260, -260, 520, 520);
    g.restore();
  }
  // 薄云：仰角 4–16°（真正在画面里），靠太阳一侧更亮
  for (let i = 0; i < 14; i++) {
    const y = row(4 + (i % 7) * 1.8), len = 150 + (i % 5) * 110, x = ((i * 233) % w);
    const cg = g.createLinearGradient(x, 0, x + len, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0)');
    cg.addColorStop(0.5, `rgba(255,238,214,${0.16 + (i % 3) * 0.07})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.fillRect(x, y, len, 2 + (i % 3) * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 沥青：base 底色 + 明暗细石斑（确定性随机，同一 base 每次同一张图） */
export function texAsphalt(base = '#D8DAE0') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const light = rnd() < 0.5;
    g.fillStyle = light ? `rgba(255,255,255,${(0.05 + rnd() * 0.10).toFixed(3)})` : `rgba(40,46,56,${(0.04 + rnd() * 0.09).toFixed(3)})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 分流牌：沿用原图 */
/**
 * 分流牌（2026-11-07 客户改版）：**落地标识牌**，不是高架子。
 * 参考客户发的那张：白色圆角牌 + 左右两块色区（半马粉 / 全马蓝），
 * 上半是白色转向箭头（半马左转、全马直行），下面「半马 / 全马」+ 公里数，
 * 底部一道波浪。**不画螃蟹**，**不写「主会场」「继续北行」**。
 */
export function texSign(THEME) {
  const w = 900, h = 1060, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const CN = THEME.font.cn, NUM = THEME.font.num;
  const PINK = THEME.route.half, BLUE = THEME.route.full;
  const rr = (x, y, ww, hh, r) => {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r);
    g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath();
  };
  // 牌体外圈（铝型材灰）
  g.fillStyle = '#D3DAE0'; g.fillRect(0, 0, w, h);
  rr(8, 8, w - 16, h - 16, 36); g.fillStyle = '#FBFCFD'; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(20,40,70,.14)'; rr(8, 8, w - 16, h - 16, 36); g.stroke();

  const PT = 34, PB = h - 34, mid = w / 2;
  g.save();
  rr(PT - 4, PT - 4, w - (PT - 4) * 2, (PB + 4) - (PT - 4), 20); g.clip();
  g.fillStyle = PINK; g.fillRect(PT, PT, mid - PT, PB - PT);
  g.fillStyle = BLUE; g.fillRect(mid, PT, w - mid - PT, PB - PT);
  // 底部波浪（三层白，越往下越亮）
  for (const [yTop, amp, al] of [[818, 22, 0.09], [890, 28, 0.13], [968, 34, 0.17]]) {
    for (const [x0, x1] of [[PT, mid], [mid, w - PT]]) {
      g.beginPath(); g.moveTo(x0, PB);
      for (let x = x0; x <= x1 + 1e-6; x += 8) {
        g.lineTo(x, yTop + Math.sin((x - x0) / 92) * amp + Math.sin((x - x0) / 41) * amp * 0.36);
      }
      g.lineTo(x1, PB); g.closePath();
      g.fillStyle = '#FFFFFF'; g.globalAlpha = al; g.fill(); g.globalAlpha = 1;
    }
  }
  g.restore();
  // 中缝
  g.fillStyle = '#FFFFFF'; g.fillRect(mid - 4, PT, 8, PB - PT);

  // 箭头：左 = 左转弯，右 = 直行
  const arrow = (cx, kind) => {
    g.save();
    g.strokeStyle = '#FFFFFF'; g.fillStyle = '#FFFFFF';
    g.lineWidth = 44; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (kind === 'left') {
      g.moveTo(cx + 74, 452);
      g.lineTo(cx + 74, 312);
      g.quadraticCurveTo(cx + 74, 214, cx - 14, 214);
      g.lineTo(cx - 62, 214);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 186, 214); g.lineTo(cx - 84, 140); g.lineTo(cx - 84, 288);
      g.closePath(); g.fill();
    } else {
      g.moveTo(cx, 458); g.lineTo(cx, 226); g.stroke();
      g.beginPath();
      g.moveTo(cx, 128); g.lineTo(cx - 78, 240); g.lineTo(cx + 78, 240);
      g.closePath(); g.fill();
    }
    g.restore();
  };
  arrow(mid / 2 + PT / 2, 'left');
  arrow(mid + (w - mid) / 2 + PT / 2 - PT / 2, 'right');

  // 文字：半马 / 全马 + 公里数
  const label = (cx, title, km) => {
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#FFFFFF';
    const pw = (w - PT * 2) / 2;
    let fs = Math.round(h * 0.140);
    g.font = `900 ${fs}px ${CN}`;
    const tw = g.measureText(title).width;
    if (tw > pw * 0.80) { fs = Math.floor(fs * pw * 0.80 / tw); g.font = `900 ${fs}px ${CN}`; }
    g.fillText(title, cx, 706);
    let fn = Math.round(h * 0.066);
    g.font = `800 ${fn}px ${NUM}`;
    const nw = g.measureText(km).width;
    if (nw > pw * 0.86) { fn = Math.floor(fn * pw * 0.86 / nw); g.font = `800 ${fn}px ${NUM}`; }
    g.fillText(km, cx, 796);
  };
  label(PT + (w - PT * 2) / 4, '半马', '21.0975km');
  label(w - PT - (w - PT * 2) / 4, '全马', '42.195km');

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 水面：渐变 + 细纹 + 右侧太阳倒影 */
export function texWater() {
  const w = 1024, h = 512, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  // 近白底（颜色由顶点色给）+ 细波纹：可无缝平铺，不再烘焙太阳带（会随平铺重复成条纹）
  g.fillStyle = '#F4F7F9'; g.fillRect(0, 0, w, h);
  let s = 777;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 320; i++) {
    const y = rnd() * h, x0 = rnd() * w, len = 30 + rnd() * 140, light = rnd() < 0.55;
    g.strokeStyle = light ? `rgba(255,255,255,${(0.35 + rnd() * 0.4).toFixed(3)})` : `rgba(70,110,140,${(0.06 + rnd() * 0.10).toFixed(3)})`;
    g.lineWidth = 1 + rnd() * 2;
    for (const dx of [0, -w]) { g.beginPath(); g.moveTo(x0 + dx, y); g.lineTo(x0 + dx + len, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 柔光斑（水渍 / 太阳光晕）*/
export function texGlow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

