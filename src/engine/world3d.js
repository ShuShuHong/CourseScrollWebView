// ════════════════════════════════════════════════════════════════════════
//  三维地图层（three.js）
//  坐标：world.x = 图上 x(pt)，world.z = 图上 y(pt)，world.y = 高度(pt)。北在上（az=0 时）。
//  地面各层（水/绿地/道路）不写深度、按 renderOrder 叠放，像一张印刷地图；
//  树、楼、桥、赛道线为真三维，正常做深度测试与投影。
// ════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import W from '../../data/world.json';
import { THEME } from '../config/theme.js';
import { COURSE, FULL, HALF, BRIDGE_RANGES, BRIDGE_H, HALF_OFF, bridgeBump, fullToHalf } from './course.js';

const M = THEME.map;
const col = (c) => new THREE.Color(c);
export const FOV = 30;

function shapesOf(polys) {
  return polys.map(([outer, holes]) => {
    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return s;
  });
}
/** 平面多边形 → 水平网格（x→x，y→z），法线朝上 */
function flatGeom(polys, y) {
  const g = new THREE.ShapeGeometry(shapesOf(polys), 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getY(i); p.setXYZ(i, x, y, z); }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  p.needsUpdate = true;
  return g;
}

const RIBBON_VS = /* glsl */`
  attribute float aKm; attribute float aSide; attribute vec2 aNrm;
  uniform float uHalfW, uY, uLift, uBH; uniform vec4 uBr;
  varying float vKm; varying float vSide;
  float bump(float u){ return (u <= 0.0 || u >= 1.0) ? 0.0 : pow(sin(3.14159265 * u), 0.75); }
  void main(){
    vKm = aKm; vSide = aSide;
    float h = max(bump((aKm - uBr.x) / (uBr.y - uBr.x)), bump((aKm - uBr.z) / (uBr.w - uBr.z))) * uLift * uBH;
    vec3 p = vec3(position.x + aNrm.x * aSide * uHalfW, uY + h, position.z + aNrm.y * aSide * uHalfW);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const RIBBON_FS = /* glsl */`
  uniform vec3 uColor, uGlow, uEdge; uniform float uProg, uReveal, uDim, uChev, uWhite, uTime, uGray;
  varying float vKm; varying float vSide;
  void main(){
    if (vKm > uReveal) discard;
    float a = abs(vSide);
    vec3 c;
    if (vKm <= uProg) {
      c = mix(uColor, uGlow, smoothstep(0.55, 0.0, a) * 0.55);       // 已跑：饱和 + 中心高光
      // 导航风：已走过的路线变灰。分界必须**正好落在螃蟹脚下**（uProg），
      // 不能再留 0.25 km 的“高光尾”——那会让粉色/蓝色看起来整段落后螃蟹一个固定值（客户 2026-10-27）
      c = mix(c, vec3(0.72, 0.75, 0.80), uGray * step(vKm, uProg));
    } else {
      c = mix(uColor, vec3(1.0), uWhite);                                // 未跑：浅色。两条线同为 0.36 —— 实测“双主线”读感最好（压暗蓝色会变成主次关系）
      // 箭头方向（客户 2026-10-27）：chevron 必须“尖朝行进方向”。
      // 波段位置 km = uChev * (k + t*0.7 ∓ a*0.45)；原来用 -a*0.45 ⇒ 两侧（a 大）比中线更靠前，
      // 于是尖角落在中线、开口朝前，读起来是倒着流。改成 +a*0.45：中线领先、两侧拖后，
      // 就是 > 形尖朝前，并且随时间向 +km 平移（与跑步方向一致）。
      float f = fract(vKm / uChev + a * 0.45 - uTime * 0.7);
      c = mix(c, uColor, step(f, 0.26) * step(a, 0.66) * 0.85);
    }
    c = mix(c, uEdge, step(0.7, a));                                   // 白描边
    c = mix(c, mix(vec3(dot(c, vec3(.3,.59,.11))), vec3(1.0), 0.35), uDim);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

function ribbonGeom(route, off = 0) {
  const P = route.p, n = P.length;
  const pos = new Float32Array(n * 2 * 3), km = new Float32Array(n * 2), side = new Float32Array(n * 2), nrm = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 2)], b = P[Math.min(n - 1, i + 2)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const k = Math.min(i * route.step, route.len);
    for (let s = 0; s < 2; s++) {
      const j = i * 2 + s;
      const ox = off ? -dy * off : 0, oy = off ? dx * off : 0;
      pos.set([P[i][0] + ox, 0, P[i][1] + oy], j * 3); km[j] = k; side[j] = s ? 1 : -1;
      nrm.set([-dy, dx], j * 2);
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aKm', new THREE.BufferAttribute(km, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aNrm', new THREE.BufferAttribute(nrm, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(1800, 0, 1400), 4000);
  return g;
}

export class World {
  constructor(canvas, { dpr = 1, w = 1920, h = 1080 } = {}) {
    this.W = w; this.H = h;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(dpr); r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = false;
    const sc = this.scene = new THREE.Scene();
    sc.background = col(M.backdrop);
    this.camera = new THREE.PerspectiveCamera(FOV, w / h, 5, 30000);

    sc.add(new THREE.HemisphereLight(0xffffff, 0xE8DCC0, M.hemi ?? 2.05));
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e0, M.sun ?? 1.45);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    sc.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.78, 0.32).normalize();   // 西南偏上，影子投向东北（画面右上）

    this.uTime = { value: 0 };
    this.buildBoard();
    this.buildGround();
    this.buildFlora();
    this.buildBuildings();
    this.buildBaosheng();
    this.buildRoutes();
    this.buildBridge();
  }

  // ── 板块：一块有厚度的“桌游地图”
  buildBoard() {
    const [x0, y0, x1, y1] = W.board, T = 46;
    const g = new THREE.BoxGeometry(x1 - x0, T, y1 - y0);
    const side = new THREE.MeshLambertMaterial({ color: M.boardSide });
    const top = new THREE.MeshLambertMaterial({ color: M.board });
    const m = new THREE.Mesh(g, [side, side, top, side, side, side]);
    m.position.set((x0 + x1) / 2, -T / 2, (y0 + y1) / 2);
    m.receiveShadow = true; m.renderOrder = -10;
    this.scene.add(m);
    // 板块下方深色托盘
    const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 60, 12, y1 - y0 + 60), new THREE.MeshLambertMaterial({ color: M.boardSideDark }));
    base.position.set((x0 + x1) / 2, -T - 6, (y0 + y1) / 2); base.renderOrder = -11;
    this.scene.add(base);
  }

  buildGround() {
    let order = 0;
    const layer = (polys, color, y, opts = {}) => {
      if (!polys.length) return null;
      const mat = opts.mat || new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      mat.side = THREE.DoubleSide;
      mat.depthTest = false; mat.depthWrite = false;
      const m = new THREE.Mesh(flatGeom(polys, y), mat);
      m.renderOrder = order++; m.receiveShadow = true; m.frustumCulled = false;
      this.scene.add(m); return m;
    };
    // 剪纸风：每层纸下面垫一层错位的深色“纸影”
    const paperShadow = (polys, y) => {
      if (!M.layerShadow) return;
      const m = layer(polys, '#000', y, { mat: new THREE.MeshBasicMaterial({ color: 0x3a1a0a, transparent: true, opacity: 0.22 }) });
      if (m) m.position.set(M.layerShadow, 0, M.layerShadow * 1.3);
    };
    layer(W.water_outer, M.sand, 0.1);
    paperShadow(W.green, 0.15);
    layer(W.green, M.green, 0.2);
    paperShadow(W.water, 0.25);
    layer(W.water, M.water, 0.3);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: col(M.waterDeep) }, uB: { value: col(M.waterLine) }, uTime: this.uTime },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uA, uB; uniform float uTime; varying vec2 vP;
        void main(){
          float w = sin(vP.x * 0.045 + sin(vP.y * 0.021) * 2.2 + uTime * 0.9) * sin(vP.y * 0.05 - uTime * 0.6);
          float line = smoothstep(0.86, 0.97, w);
          gl_FragColor = vec4(mix(uA, uB, line * 0.55), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    layer(W.water_deep, null, 0.4, { mat: waterMat });
    // 道路：按中心线描边成条带（外描边一层 + 路面一层），节点补圆，避免大多边形三角化出错
    const strokes = (extra, color, y) => {
      const pos = [], idx = []; const discs = [];
      for (const r of W.road_lines) {
        const P = r.pts, hw = r.w / 2 + extra;
        for (let i = 0; i < P.length - 1; i++) {
          const [ax, ay] = P[i], [bx, by] = P[i + 1];
          let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy); if (L < 1e-3) continue; dx /= L; dy /= L;
          const nx = -dy * hw, ny = dx * hw, b = pos.length / 3;
          pos.push(ax + nx, y, ay + ny, ax - nx, y, ay - ny, bx + nx, y, by + ny, bx - nx, y, by - ny);
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
        for (const p of P) discs.push([p[0], p[1], hw]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      const m = new THREE.Mesh(g, mat); m.renderOrder = order++; m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m);
      const cg = new THREE.CircleGeometry(1, 14); cg.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(cg, mat, discs.length); const d = new THREE.Object3D();
      discs.forEach(([x, z, r], i) => { d.position.set(x, y, z); d.scale.setScalar(r); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.renderOrder = m.renderOrder; im.receiveShadow = true; im.frustumCulled = false; this.scene.add(im);
    };
    strokes(1.4, M.roadCasing, 0.5);
    strokes(0, M.road, 0.6);
    this.groundOrder = order;
  }

  buildFlora() {
    const dummy = new THREE.Object3D();
    const inst = (geom, mat, list, fn, shadow = true) => {
      const m = new THREE.InstancedMesh(geom, mat, list.length);
      list.forEach((it, i) => { fn(it, i, dummy); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      m.castShadow = shadow; m.receiveShadow = false;
      this.scene.add(m); return m;
    };
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    // 普通树：棒棒糖造型（低面球冠 + 树干）
    const crownG = new THREE.IcosahedronGeometry(1, 1); crownG.translate(0, 0, 0);
    const crown = inst(crownG, new THREE.MeshLambertMaterial({ flatShading: true }), W.trees, ([x, y, s], i, d) => {
      const ts = M.treeScale ?? 1; d.position.set(x, 6.4 * s * ts, y); d.scale.setScalar(4.6 * s * ts); d.rotation.set(0, rnd(i, 1) * 6, 0);
    });
    const tc = M.tree.map(col);
    W.trees.forEach((_, i) => crown.setColorAt(i, tc[i % tc.length]));
    const trunkG = new THREE.CylinderGeometry(0.7, 0.9, 1, 5); trunkG.translate(0, 0.5, 0);
    inst(trunkG, new THREE.MeshLambertMaterial({ color: M.trunk }), W.trees, ([x, y, s], i, d) => {
      const ts = M.treeScale ?? 1; d.position.set(x, 0, y); d.scale.set(s * ts, 3.6 * s * ts, s * ts); d.rotation.set(0, 0, 0);
    }, false);
    // 银杏：金橙尖塔
    const coneG = new THREE.ConeGeometry(1, 1, 7); coneG.translate(0, 0.5, 0);
    const seq = inst(coneG, new THREE.MeshLambertMaterial({ flatShading: true }), W.sequoia, ([x, y, s], i, d) => {
      d.position.set(x, 1.5, y); d.scale.set(3.4 * s, 15 * s, 3.4 * s); d.rotation.set(0, rnd(i, 2) * 6, 0);
    });
    const sc = M.sequoia.map(col);
    W.sequoia.forEach((_, i) => seq.setColorAt(i, sc[i % sc.length]));
    inst(trunkG, new THREE.MeshLambertMaterial({ color: M.trunk }), W.sequoia, ([x, y, s], i, d) => {
      d.position.set(x, 0, y); d.scale.set(0.8, 2.2, 0.8);
    }, false);
    // 花海
    const flG = new THREE.IcosahedronGeometry(1, 0);
    const fl = inst(flG, new THREE.MeshLambertMaterial({ flatShading: true }), W.flowers, ([x, y], i, d) => {
      d.position.set(x, 1.1, y); d.scale.setScalar(1.25 + rnd(i, 3) * 0.6); d.rotation.set(rnd(i, 4), rnd(i, 5), 0);
    }, false);
    const fc = M.flowers.map(col);
    W.flowers.forEach((f, i) => fl.setColorAt(i, fc[f[2]]));
    // 芦苇
    const reedG = new THREE.ConeGeometry(0.55, 1, 4); reedG.translate(0, 0.5, 0);
    inst(reedG, new THREE.MeshLambertMaterial({ color: M.reed, flatShading: true }), W.reeds, ([x, y], i, d) => {
      d.position.set(x, 0, y); d.scale.set(1, 5 + rnd(i, 6) * 4, 1); d.rotation.set(rnd(i, 7) * 0.3 - 0.15, 0, rnd(i, 8) * 0.3 - 0.15);
    }, false);
  }

  buildBuildings() {
    const dummy = new THREE.Object3D();
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    // 顶面亮、立面略暗（配合实例色）
    const cAttr = new Float32Array(box.attributes.position.count * 3);
    for (let i = 0; i < box.attributes.position.count; i++) {
      const top = box.attributes.normal.getY(i) > 0.5;
      const v = top ? 1.0 : 0.9; cAttr.set([v, v, v], i * 3);
    }
    box.setAttribute('color', new THREE.BufferAttribute(cAttr, 3));
    // 文渊寺塔占的那块楼基要撤掉，否则白塔会从楼里长出来（客户 2026-11-03）
    const [bsx, bsz] = COURSE.pois.baosheng_temple.pt;
    const B = W.buildings.filter(([x, y]) => Math.hypot(x - bsx, y - bsz) > 13);   // 塔放大到 2× 后占地半径约 9，剔除半径跟着收到 13
    const m = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ vertexColors: true }), B.length);
    const pal = M.buildings.map(col);
    B.forEach(([x, y, w, d, h, rot, ci], i) => {
      dummy.position.set(x, 0, y); dummy.scale.set(w, h * (M.bldH ?? 1), d); dummy.rotation.set(0, rot, 0); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, pal[ci % pal.length]);
    });
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    // 约三成楼加坡屋顶
    const roofG = new THREE.ConeGeometry(0.72, 1, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.5, 0);
    const roofs = M.roofs === false ? [] : B.filter((b, i) => b[6] % 3 === 0 && b[4] < 14);
    const rm = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({ color: M.roof, flatShading: true }), roofs.length);
    roofs.forEach(([x, y, w, d, h, rot], i) => {
      dummy.position.set(x, h * (M.bldH ?? 1), y); dummy.scale.set(w, Math.min(w, d) * 0.55, d); dummy.rotation.set(0, rot, 0); dummy.updateMatrix();
      rm.setMatrixAt(i, dummy.matrix);
    });
    rm.castShadow = true;
    if (roofs.length) this.scene.add(rm);
  }

  // ── 文渊寺塔（客户 2026-11-03）：官方图红框处立一座“白模佛塔”占位
  //    造型按实景：方形五级砖塔 + 须弥座 + 攒尖顶 + 塔刹；纯白体块、只靠明暗与影子，不上贴图
  //    位置 = data/course.json 的 baosheng_temple（图上 pt），与图卡的定位点同源
  buildBaosheng() {
    const [bx, bz] = COURSE.pois.baosheng_temple.pt;
    const K = 0.60 + 0.40 * (M.bldH ?? 1);           // 高度跟各画风的楼高倍率走（卡通 1.0 / 导航 0.82 / 剪纸 0.92）
    const white = new THREE.MeshLambertMaterial({ color: 0xfafbfe, flatShading: true });
    const slab = new THREE.MeshLambertMaterial({ color: 0xe4eaf4, flatShading: true });
    const gray = new THREE.MeshLambertMaterial({ color: 0xcdd7e4, flatShading: true });
    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    const put = (geo, mat, y, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // 须弥座两级
    put(new THREE.BoxGeometry(8.4, 0.5, 8.4), slab, 0.25);
    put(new THREE.BoxGeometry(6.6, 0.4, 6.6), white, 0.70);
    let y = 0.90;
    // 五级塔身：身 1.55 + 檐 0.28，逐层收分（宽度按实景 5.4m 起，地图上略微放大以便看清）
    for (let i = 0; i < 5; i++) {
      const w = 4.0 - i * 0.44;
      put(new THREE.BoxGeometry(w, 1.55, w), white, y + 0.775);
      const ew = w + 0.95;
      put(new THREE.BoxGeometry(ew, 0.28, ew), gray, y + 1.55 + 0.14);
      y += 1.83;
    }
    // 攒尖顶（四角攒尖）+ 塔刹
    const roofR = (2.24 + 0.95) * 0.7071;
    put(new THREE.ConeGeometry(roofR, 1.25, 4), white, y + 0.62, Math.PI / 4);
    y += 1.25;
    put(new THREE.CylinderGeometry(0.075, 0.075, 1.9, 6), gray, y + 0.95);
    for (const d of [0.35, 0.75, 1.15]) put(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 10), slab, y + d);
    put(new THREE.SphereGeometry(0.15, 8, 6), gray, y + 1.95);
    // 客户 2026-11-06：**佛塔要比周边建筑高一倍以上**。周边楼实测中位 7.0、最高 10.6 世界单位，
    //   塔现在 10.99 —— 只比楼略高，远景里和普通楼房分不出来。
    //   ⇒ 平面放大 2.0×、竖向再乘 2.4（总高 ≈ 26.4，是周边最高那栋的 2.5 倍），
    //     并且把塔周建筑剔除半径从 8 pt 收到 12 pt，免得新占地插进邻居家。
    g.scale.set(2.0, K * 2.4, 2.0);
    this.tower = g;
    this.scene.add(g);
  }

  buildRoutes() {
    this.ribbons = {};
    const mk = (key, route, color, glow, y) => {
      const br = BRIDGE_RANGES[key];
      const u = {
        uHalfW: { value: 3 }, uY: { value: y }, uLift: { value: 0 }, uBH: { value: BRIDGE_H },
        uBr: { value: new THREE.Vector4(br[0][0], br[0][1], br[1][0], br[1][1]) },
        uColor: { value: col(color) }, uGlow: { value: col(glow) }, uEdge: { value: col(THEME.route.edge || '#FFFFFF') }, uGray: { value: THEME.route.passedGray ? 1 : 0 },
        uProg: { value: 0 }, uReveal: { value: 99 }, uDim: { value: 0 }, uChev: { value: 0.14 }, uWhite: { value: 0.36 }, uTime: this.uTime,
      };
      // 共线段两条线本来就几乎重合：把半马线做成更窄的一条“骑马线”，
      // 抬高 0.15pt 并后画，于是粉色压在蓝色中间，两条线都能看见（否则粉线整段被蓝线盖住）
      u.uHalfW.value = key === 'half' ? 2.1 : 3.2;
      const m = new THREE.Mesh(ribbonGeom(route, key === 'half' ? HALF_OFF : 0), new THREE.ShaderMaterial({ uniforms: u, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS }));
      m.renderOrder = this.groundOrder + (key === 'full' ? 2 : 3); m.frustumCulled = false;
      this.scene.add(m);
      this.ribbons[key] = u;
    };
    mk('half', HALF, THEME.route.half, THEME.route.halfGlow, 2.05);
    mk('full', FULL, THEME.route.full, THEME.route.fullGlow, 1.8);
  }

  // ── 云澜大桥：两次通过各一段桥面（顺着全/半马两条线的中线），随 lift 隆起
  buildBridge() {
    this.decks = [];
    const N = 40;
    for (const [k0, k1] of BRIDGE_RANGES.full) {
      const ctr = [], nrm = [];
      for (let i = 0; i <= N; i++) {
        const k = k0 + (k1 - k0) * i / N;
        const a = FULL.pos(k), b = HALF.pos(fullToHalf(k));
        ctr.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
      for (let i = 0; i <= N; i++) {
        const a = ctr[Math.max(0, i - 1)], b = ctr[Math.min(N, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / L, dx / L]);
      }
      const g = new THREE.BufferGeometry();
      const vpr = 8; // 每个截面 8 个顶点：左外底、左外顶(护栏顶)、左内顶、右内顶、右外顶、右外底 + 两个底
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * vpr * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((N + 1) * vpr * 3), 3));
      const idx = [];
      const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
      for (let i = 0; i < N; i++) {
        const A = i * vpr, Bn = (i + 1) * vpr;
        for (let s = 0; s < vpr - 1; s++) quad(A + s, Bn + s, Bn + s + 1, A + s + 1);
      }
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.renderOrder = this.groundOrder;
      this.scene.add(mesh);
      // 桥墩
      const pierG = new THREE.CylinderGeometry(1.6, 2.0, 1, 8); pierG.translate(0, 0.5, 0);
      const piers = new THREE.InstancedMesh(pierG, new THREE.MeshLambertMaterial({ color: '#E7ECF1' }), 9);
      piers.castShadow = true; this.scene.add(piers);
      this.decks.push({ ctr, nrm, g, N, vpr, piers });
    }
    // 独塔双索面斜拉桥：塔立在第一次过桥那段的中跨上（第二次过桥用的是同一座桥的另一段）
    this.tower = this.makeTower(this.decks[0]);
    this.setBridge(0.1, THEME.route.bridge1, 0);
  }

  /**
   * H 型独塔 + 双索面斜拉索。局部 +X = 桥面法向（两个索面方向），+Z = 桥面走向。
   * 世界单位（1 pt ≈ 3.34 m）：桥面半宽 18、腿中心 ±12、腿宽 8、塔高 H、
   * 只有一道横梁在 0.62H（客户 2026-11-06：塔顶那道横向连接已去掉）。
   */
  makeTower(deck) {
    const N = deck.N, i = Math.round(N * 0.58);   // 略偏中跨：螃蟹经过时不会正好站在塔腿正前方（H 形被压成"单脚"）
    const [x, z] = deck.ctr[i], [nx, nz] = deck.nrm[i];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-nz, nx);
    // 塔与横梁要比米白地图深一档，纯白会整根隐形（实测连横梁都看不见）
    const white = new THREE.MeshLambertMaterial({ color: '#A9BACD' });
    const grey = new THREE.MeshLambertMaterial({ color: '#7F93AA' });
    // 客户 2026-11-05 ③：塔太高（96 单位 ≈ 320 m）⇒ 先砍半到 48，客户再要求**降到原来的三分之一** = 32。
    //   腿宽/腿距/横梁高度都是 H 的比例量，按比例收，造型不变，只是整座塔矮掉 2/3。
    // 客户 2026-11-05：桥塔再高一倍（32 → 64）
    const H = 64, LEG_X = 24.6, LEG_W = 8.0, BEAM_Y = 0.62, CAP_Y = 0.93;   // 横梁在 0.62H、腿继续伸到锚台底 ⇒ H 型（不是门式 Π）
    const legs = [], beams = [];
    for (const sd of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(LEG_W, 1, 9.4), white);
      leg.position.x = sd * LEG_X;          // 立在桥面边梁上（半宽 18），不插进车行道
      leg.castShadow = true; leg.receiveShadow = true;
      g.add(leg); legs.push(leg);
    }
    // 只做上部一道横梁：H 的横杆在顶上，桥面高度不横切车道
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * (LEG_X + LEG_W / 2) - 1.2, 6.4, 5.6), grey);  // 加厚：让塔头与横梁咬合 ≥1，不出 1px 缝
    beam.castShadow = true; g.add(beam); beams.push({ mesh: beam, f: BEAM_Y });
    // 客户 2026-11-06：**塔顶那道横向连接（四棱台锚台）去掉**，全桥只保留 0.62H 那一道横梁。
    //   于是两片立腿从水面一直长到塔顶 H，中间只有一道横杆 —— 就是 H 型的下半截。
    //   拉索仍挂在两腿内侧的上部（0.86–0.94H），从腿身里出来，不再需要一个塔头箱子。
    const cap = null;

    // 索面：两个竖直平面（过两侧立腿）× 每侧 8 根
    const PER = 8, NC = 2 * 2 * PER;
    // 每根索 = 两个互相垂直的薄四边形（“十”字截面），任何机位下都有可见宽度；
    // 纯 LineSegments 在 Windows/ANGLE 下 linewidth 被忽略，永远只有 1px，成片里像划痕
    const VPC = 8, TPC = 12;                       // 每根索 8 顶点 / 12 个索引
    const pos = new Float32Array(NC * VPC * 3);
    const idx = [];
    for (let c = 0; c < NC; c++) {
      const b = c * VPC;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 4, b + 5, b + 6, b + 4, b + 6, b + 7);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cg.setIndex(idx);
    const cableMat = new THREE.MeshBasicMaterial({ color: '#5E748D', transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
    const cables = new THREE.Mesh(cg, cableMat);
    cables.frustumCulled = false;
    g.add(cables);
    let span = 0;
    for (let k = 1; k <= N; k++) span += Math.hypot(deck.ctr[k][0] - deck.ctr[k - 1][0], deck.ctr[k][1] - deck.ctr[k - 1][1]);
    span /= 2;

    // 底图各层是 depthTest:false 的“印刷地图”叠法：塔正常测深度会被路网画穿。
    // 塔也改成同样叠法并抬到地面层之上，塔身才是一块实的。
    g.traverse((o) => {
      if (!o.isMesh || o === cables) return;      // 拉索是实体薄带，不能跟底图一样关深度测试
      o.material.depthTest = false; o.material.depthWrite = false;
      o.renderOrder = this.groundOrder + 60;
    });
    // 拉索：开深度测试（被桥面、塔身正确遮挡）、关深度写入（细带不写深度，避免自遮挡锯齿）
    cableMat.depthTest = true; cableMat.depthWrite = false;
    cables.renderOrder = this.groundOrder + 58;
    // 索底锚固块：每根索在桥面上的落点放一个小方块，末端才不像被剪断
    const anchorMat = new THREE.MeshLambertMaterial({ color: '#7F93AA' });
    const anchors = [];
    for (let k = 0; k < NC; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), anchorMat);
      m.visible = false; g.add(m); anchors.push(m);
      anchors[k].renderOrder = this.groundOrder + 59;
    }
    this.scene.add(g);
    return { anchors,
      g, legs, beams, cap, cables, pos, cg, cableMat, span, deck,
      H, per: PER, legX: LEG_X, legW: LEG_W, beamY: BEAM_Y, capY: CAP_Y, cableW: 0.9,     // 世界宽：在 d≈560 时约 2.5px，比相邻索间距（~18px）窄，一根根分得开
      topX: LEG_X - 1.6,                // 上锚点收在立腿内侧，索从塔身里出来
      deckX: 22.0,                      // 锚点推到腿线内侧：两个索面各落一条腿下，不在中间交叉成 X
    };
  }

  setBridge(lift, color, build = 1) {
    const c = col(color), top = col('#F4F1EA'), dark = c.clone().multiplyScalar(0.72);
    const HW = 9 + 9 * Math.min(1, lift * 1.4), RAIL = 3.4, TH = 3.6;
    const dummy = new THREE.Object3D();
    for (const d of this.decks) {
      const P = d.g.attributes.position, Cc = d.g.attributes.color;
      for (let i = 0; i <= d.N; i++) {
        const u = i / d.N, h = bridgeBump(u) * lift * BRIDGE_H + 1.0;
        const [x, z] = d.ctr[i], [nx, nz] = d.nrm[i];
        const L = [x - nx * HW, z - nz * HW], R = [x + nx * HW, z + nz * HW];
        const bot = Math.max(0.2, h - TH);
        const pts = [[L, bot], [L, h + RAIL], [L, h], [L, h], [R, h], [R, h], [R, h + RAIL], [R, bot]];
        const cols = [dark, c, c, top, top, c, c, dark];
        pts.forEach(([[px, pz], py], s) => { P.setXYZ(i * d.vpr + s, px, py, pz); Cc.setXYZ(i * d.vpr + s, cols[s].r, cols[s].g, cols[s].b); });
      }
      P.needsUpdate = true; Cc.needsUpdate = true; d.g.computeVertexNormals();
      for (let j = 0; j < 9; j++) {
        const u = (j + 1) / 10, i = Math.round(u * d.N), h = bridgeBump(u) * lift * BRIDGE_H + 1.0 - TH;
        dummy.position.set(d.ctr[i][0], 0, d.ctr[i][1]); dummy.scale.set(1, Math.max(0.01, h), 1); dummy.updateMatrix();
        d.piers.setMatrixAt(j, dummy.matrix);
      }
      d.piers.instanceMatrix.needsUpdate = true;
      d.piers.visible = lift > 0.2;
    }
    // ── 桥塔与斜拉索
    const T = this.tower;
    if (T) {
      const uMid = 0.58;
      const deckMid = bridgeBump(uMid) * lift * BRIDGE_H + 1.0;
      const grow = Math.max(0, Math.min(1, build));
      T.g.visible = grow > 0.004;
      T.g.position.y = deckMid;
      const H = T.H * grow;
      // 立腿到锚台底为止：原来腿顶高过锚台 1.6，看着像“两根柱子顶一块板”
      // 腿从水面（世界 y=0 ⇒ 局部 y=-deckMid）一直长到塔头下沿：塔是跨在桥面两侧的墩身，
      // 不是立在路面上的两根柱子（腿心 ±22.4 已在桥面半宽 18 之外）
      // 腿顶收到上横梁顶面（0.879H）：再往上会长出锚台两侧的“小耳朵”
      // 客户 2026-11-06：没有塔顶锚台了 ⇒ 立腿直接长到塔顶 H（原来只到 0.896H，是为了给锚台让位）
      const lh = Math.max(0.001, H + deckMid);
      for (const leg of T.legs) { leg.scale.y = lh; leg.position.y = lh / 2 - deckMid; }
      for (const b of T.beams) { b.mesh.position.y = H * b.f; b.mesh.visible = grow > 0.35; }
      if (T.cap) { T.cap.position.y = H * T.capY; T.cap.visible = grow > 0.8; }
      // 拉索：从塔顶（不同高度）连到桥面锚点；grow<0.55 时不出现，之后逐根“射”出去
      const cableK = Math.max(0, Math.min(1, (grow - 0.45) / 0.55));
      T.cableMat.opacity = 0.9 * cableK;
      T.cables.visible = cableK > 0.01;
      if (cableK > 0.01) {
        const P = T.pos;
        let n = 0;
        for (const plane of [-1, 1]) {
          const pxTop = plane * T.topX, pxDeck = plane * T.deckX;
          for (const side of [-1, 1]) {
            for (let k = 0; k < T.per; k++) {
              // 桥面锚点只落在“隆起的桥面”上（u∈0.19–0.51 / 0.81–0.49）：
              // 桥是拱形，锚点若铺到 u≈0.05（桥面已贴地），索会拉成一张大帐篷
              // 桥面锚点从“塔脚外侧”向两端铺开（0.40→0.13 / 0.60→0.87）：
              // 不再铺到 0.49/0.51，否则两束索在门洞里交叉成蜘蛛网
              const u = side < 0 ? 0.400 - 0.0385 * k : 0.600 + 0.0385 * k;
              // 塔上锚点 0.60H→0.83H：全在锚台底面（0.855H）之下，不冒出塔顶
              const topF = 0.86 + 0.08 * (k / (T.per - 1));   // 一小簇，全在两片立腿内侧（0.86–0.94H），不需要塔头箱子
              const dz = (u - 0.5) * 2 * T.span;
              const dy = (bridgeBump(u) * lift * BRIDGE_H + 1.0) - deckMid;
              const t0 = [pxTop, H * topF, 0];
              const t1 = [pxDeck, dy - 1.2, dz];          // 插进桥面 1.2：原来悬在面上 2.2，远看像索头断在空中
              const kk = cableK;
              const A = [t0[0], t0[1], t0[2]];
              const B = [t0[0] + (t1[0] - t0[0]) * kk, t0[1] + (t1[1] - t0[1]) * kk, t0[2] + (t1[2] - t0[2]) * kk];
              // 索方向 → 两条互相垂直的宽度方向（X 向与 Z 向），拼成“十”字截面
              let dx2 = B[0] - A[0], dy2 = B[1] - A[1], dz2 = B[2] - A[2];
              const L2 = Math.hypot(dx2, dy2, dz2) || 1; dx2 /= L2; dy2 /= L2; dz2 /= L2;
              // e1 = normalize(dir × (1,0,0))，e2 = normalize(dir × (0,0,1))；退化时退回坐标轴
              const mk = (ux, uy, uz) => {
                let ex = dy2 * uz - dz2 * uy, ey = dz2 * ux - dx2 * uz, ez = dx2 * uy - dy2 * ux;
                const L = Math.hypot(ex, ey, ez);
                if (L < 1e-4) return [1, 0, 0];
                return [ex / L, ey / L, ez / L];
              };
              const e1 = mk(1, 0, 0), e2 = mk(0, 0, 1);
              const hw = T.cableW / 2;
              const quad = (E, base) => {
                const ex = E[0] * hw, ey = E[1] * hw, ez = E[2] * hw;
                P.set([A[0] - ex, A[1] - ey, A[2] - ez,
                       B[0] - ex, B[1] - ey, B[2] - ez,
                       B[0] + ex, B[1] + ey, B[2] + ez,
                       A[0] + ex, A[1] + ey, A[2] + ez], base * 3);
              };
              quad(e1, n * 8); quad(e2, n * 8 + 4);
              const an = T.anchors[n];
              if (an) {
                an.visible = cableK > 0.5;
                an.position.set(B[0], B[1] - 0.4, B[2]);
                an.scale.setScalar(1);
              }
              n++;
            }
          }
        }
        for (let k = n; k < P.length / 24; k++) P.set(new Array(24).fill(-999), k * 24);
        T.cg.attributes.position.needsUpdate = true;
      }
    }
    for (const r of Object.values(this.ribbons)) r.uLift.value = lift;
    this.lift = lift;
  }

  /** 设置相机。p = {target:[x,z,h], dist, az, pitch, frame}；rect = 视口（CSS px） */
  setCamera(p, rect) {
    const cam = this.camera;
    cam.aspect = rect.w / rect.h;
    const az = THREE.MathUtils.degToRad(p.az), pi = THREE.MathUtils.degToRad(p.pitch);
    const [tx, tz, ty] = p.target;
    const hd = Math.cos(pi) * p.dist;
    cam.position.set(tx - Math.sin(az) * hd, ty + Math.sin(pi) * p.dist, tz + Math.cos(az) * hd);
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, ty, tz);
    cam.setViewOffset(rect.w, rect.h, 0, -p.frame * rect.h, rect.w, rect.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // 赛道线宽随距离变化，近看不粗、远看不细
    const hw = Math.min(9, Math.max(2.9, p.dist * 0.0034));
    for (const r of Object.values(this.ribbons)) { r.uHalfW.value = hw; r.uChev.value = Math.max(0.1, p.dist * 0.00016); }
    // 阴影相机跟随
    const S = Math.min(2300, Math.max(320, p.dist * 0.8));
    const sh = this.sun.shadow.camera;
    sh.left = -S; sh.right = S; sh.top = S; sh.bottom = -S; sh.near = 10; sh.far = 6000; sh.updateProjectionMatrix();
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 2500, this.sunDir.y * 2500, tz + this.sunDir.z * 2500);
    this.sun.target.updateMatrixWorld();
    this._rect = rect; this._dist = p.dist;
  }

  /** 世界点（图上 x, y, 高 h）→ 当前视口屏幕坐标（CSS px）与该点的 px/pt */
  project(x, y, h = 0, rect = this._rect) {
    const v = new THREE.Vector3(x, h, y);
    const d = v.distanceTo(this.camera.position);
    v.project(this.camera);
    const ppp = rect.h / (2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    return { x: rect.x + (v.x + 1) / 2 * rect.w, y: rect.y + (1 - v.y) / 2 * rect.h, z: v.z, d, ppp, ok: v.z < 1 && v.z > -1 };
  }

  /**
   * 锚点安全投影（客户 2026-11-06 ④）：图卡引线在桥段会“断断续续消失”，
   * 原因是锚点被镜头甩到相机平面附近/背后时 `project()` 的 ok 变 false、甚至 NDC 翻号，
   * 引线就整帧不画。这里把点先转到相机空间、把 z 夹到相机前方 1 单位再投影 ⇒
   * **方向永远是对的**，线只会从画面边缘出画，不会消失。
   */
  projectSafe(x, y, h = 0, rect = this._rect) {
    const v = new THREE.Vector3(x, h, y).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -1) v.z = -1;                       // 相机朝 −z；夹到前方 1 单位
    const d = Math.max(1, -v.z);
    v.applyMatrix4(this.camera.projectionMatrix);  // Vector3.applyMatrix4 会做 ÷w
    const ppp = rect.h / (2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    return { x: rect.x + (v.x + 1) / 2 * rect.w, y: rect.y + (1 - v.y) / 2 * rect.h, z: v.z, d, ppp, ok: true };
  }

  // ── 深度探针：把整个场景按“深度色”渲到 1/4 分辨率的小图上，读一次像素缓冲。
  //    每个贴在地图上的标注拿自己的 NDC z 跟这里的场景 z 比，就知道它是不是被
  //    大桥 / 楼 / 树挡在后面 —— 这就是“固定在地图上的东西按机位算遮挡”的实现方式。
  initProbe() {
    // 1/3 分辨率：1/4 时一个纹素=4 屏幕像素，斜视下相邻纹素能差 50+ 世界单位，
    // 会让“就贴在路面上的牌子”被判成被挡住（实测 42km 牌误判 8 单位）
    const w = Math.max(2, Math.round(this.W / 3)), h = Math.max(2, Math.round(this.H / 3));
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    rt.texture.colorSpace = THREE.NoColorSpace;
    this._probe = { w, h, rt, buf: new Uint8Array(w * h * 4), mat: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), ready: false, on: true };
  }

  /** 每帧一次：按深度渲一遍 + 回读。相机之外的场景状态（桥隆起到哪）已是本帧的 */
  /** 关掉深度探针（?noprobe=1）：预览机性能不够或只需要画面时用 */
  probeEnabled(v) { this._probeOff = !v; if (this._probe) this._probe.on = !!v; if (!v && this._probe) this._probe.ready = false; }

  renderProbe() {
    if (this._probeOff) return;
    if (!this._probe) this.initProbe();
    const p = this._probe;
    if (!p.on) { p.ready = false; return; }
    const r = this.renderer, sc = this.scene;
    const oldMat = sc.overrideMaterial, oldBg = sc.background;
    sc.overrideMaterial = p.mat; sc.background = null;
    r.setRenderTarget(p.rt);
    r.setScissorTest(false);
    r.setViewport(0, 0, p.w, p.h);
    // 清成白色（打包深度 = 1 = 最远）：没有几何的像素不能被当成“贴脸的前景”
    r.setClearColor(0xffffff, 1); r.clear(true, true, true);
    r.render(sc, this.camera);
    r.readRenderTargetPixels(p.rt, 0, 0, p.w, p.h, p.buf);
    r.setRenderTarget(null);
    sc.overrideMaterial = oldMat; sc.background = oldBg;
    p.ready = true;
  }

  /** 屏幕点处的场景 NDC z（越小越近）；越界或无数据返回 1（最远） */
  probeZ(sx, sy) {
    const p = this._probe;
    if (!p || !p.ready) return 1;
    const ix = Math.round(sx / this.W * p.w), iy = Math.round((1 - sy / this.H) * p.h);
    if (ix < 1 || iy < 1 || ix >= p.w - 1 || iy >= p.h - 1) return 1;
    // 3×3 取**中值**（不是最大值）：单个更远的邻像素不会把整块拉远，
    // 斜视下的采样噪声被抵消掉，贴地的图元不会再被误判成“被挡住”。
    // 解码（实测标定，不是猜的）：depth = r/256 + g/256² + b/256³；白 = 1 = 没有几何
    const b = p.buf, w = p.w, a = [];
    for (let dy = -1; dy <= 1; dy++) for (const dx of [-1, 0, 1]) {
      const i = ((iy + dy) * w + (ix + dx)) * 4;
      a.push((b[i] / 256 + b[i + 1] / 65536 + b[i + 2] / 16777216) * 2 - 1);
    }
    a.sort((x, y) => x - y);
    return Math.max(-1, Math.min(1, a[4]));
  }

  /** NDC z → 相机距离（世界单位）。深度缓冲只有 24 位精度，比“距离”比“NDC”差别大得多 */
  viewDist(ndc) {
    const n = this.camera.near, f = this.camera.far;
    return (2 * f * n) / ((f + n) - Math.max(-0.9999, Math.min(0.9999, ndc)) * (f - n));
  }

  /** 地图点（NDC z = nz）是否被场景里的实体挡在后面。
   *  容差按**距离比例**给（3.5%）：深度缓冲 + 分辨率采样在远处本就有几十单位的误差，
   *  而真正挡在前面的东西（桥面、桥塔、楼）都有几百单位，不会因此漏判。约 3.3 m/pt */
  occluded(sx, sy, nz, rel = 0.035, minEps = 6) {
    const z = this.probeZ(sx, sy);
    if (z >= 1) return false;                 // 该像素没有几何 = 背景
    const d = this.viewDist(nz);
    return this.viewDist(z) < d - Math.max(minEps, d * rel);
  }

  clear() {
    const r = this.renderer;
    r.setScissorTest(false); r.setViewport(0, 0, this.W, this.H); r.setClearColor(M.backdrop); r.clear();
  }
  renderView(rect) {
    const r = this.renderer;
    r.setViewport(rect.x, this.H - rect.y - rect.h, rect.w, rect.h);
    r.setScissor(rect.x, this.H - rect.y - rect.h, rect.w, rect.h);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
  }
}
