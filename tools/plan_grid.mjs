// 平面图第①步：把副本场景正交式俯拍成底图（相机放很高 + 窄视角 ⇒ 地面点严格等比），
// 同时把世界→像素的映射、图元清单、坐标表写成 JSON，交给 plan_grid.py 叠网格与标注。
//   node tools/plan_grid.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME } from './shot.mjs';
import { V } from '../src/config/venue.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/plan');
fs.mkdirSync(OUT, { recursive: true });
const GEO = JSON.parse(fs.readFileSync(path.join(ROOT, 'out/review/v10/geo.json'), 'utf8'));

const REGIONS = [
  { key: '总图', x0: -180, x1: 140, z0: -100, z1: 100, ppm: 10 },
  { key: '岔口', x0: -165, x1: -55, z0: -62, z1: 45, ppm: 28 },
];

// 编号清单（坐标与 3D 场景一致）
const ITEMS = [
  { n: '起跑门头', x: V.arch.x, z: 0 },
  { n: 'A 区', x: (V.zones[0].x0 + V.zones[0].x1) / 2, z: (V.zones[0].z0 + V.zones[0].z1) / 2 },
  { n: 'B 区', x: (V.zones[1].x0 + V.zones[1].x1) / 2, z: (V.zones[1].z0 + V.zones[1].z1) / 2 },
  { n: 'C 区集结带', x: -100, z: 22 },
  { n: '三岔口铺装', x: -110, z: -22 },
  { n: 'Q 西侧并入点', x: GEO.J1[0], z: GEO.J1[1] },
  { n: 'P2 东侧接点', x: GEO.J2[0], z: GEO.J2[1] },
  { n: 'A 支路口西角', x: GEO.nw[0], z: GEO.nw[1] },
  { n: 'B 支路口东角', x: GEO.east[0], z: GEO.east[1] },
  { n: '主舞台', x: V.stage.x, z: V.stage.z },
  { n: '演员候场', x: V.actor.x, z: V.actor.z },
  { n: '观众观摩区', x: (V.viewer.x0 + V.viewer.x1) / 2, z: (V.viewer.z0 + V.viewer.z1) / 2 },
  { n: '赛后饮水站', x: V.water.x, z: V.water.z },
  { n: '安保车辆区', x: (V.security.x0 + V.security.x1) / 2, z: (V.security.z0 + V.security.z1) / 2 },
  { n: '北停车场', x: (V.urban.lots[0].x0 + V.urban.lots[0].x1) / 2, z: (V.urban.lots[0].z0 + V.urban.lots[0].z1) / 2 },
  { n: '西停车场', x: (V.urban.lots[1].x0 + V.urban.lots[1].x1) / 2, z: (V.urban.lots[1].z0 + V.urban.lots[1].z1) / 2 },
  { n: '居民楼列', x: -60, z: V.urban.towerZ },
  { n: '临街商铺列', x: -60, z: V.urban.shopZ },
  { n: 'WC', x: V.wc.x, z: V.wc.z },
  { n: '存衣车', x: (V.storage.x0 + V.storage.x1) / 2, z: V.storage.z },
];

const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--hide-scrollbars'],
});

for (const R of REGIONS) {
  const W = Math.round((R.x1 - R.x0) * R.ppm);
  const H = Math.round((R.z1 - R.z0) * R.ppm);
  const CAMH = 900;                                    // 相机高度（越高越接近正交）
  const halfH = (R.z1 - R.z0) / 2;
  const fov = (2 * Math.atan(halfH / CAMH) * 180) / Math.PI;

  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const url = 'file:///' + path.join(ROOT, 'dist', 'stage-B-导航地图.html').split(path.sep).join('/') + '?clean=1';
  await p.goto(url, { waitUntil: 'load' });
  await p.evaluate(() => window.__ready || Promise.resolve());
  await p.evaluate(() => window.__seekFrame(62));
  // 停掉页面的渲染循环，否则它会在我们渲完之后又用导演的相机覆盖一遍（只覆盖顶部一条）
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });

  const ok = await p.evaluate(({ cx, cz, camh, fovDeg, W, H }) => {
    const Wd = window.__director.venueWorld;
    for (const c of document.querySelectorAll('canvas')) c.style.opacity = '0';
    const ov = document.getElementById('ov'); if (ov) ov.style.display = 'none';
    const ui = document.getElementById('ui'); if (ui) ui.style.display = 'none';
    document.body.style.background = '#FFFFFF';
    // 俯拍时关掉雾：相机升到 900 m，雾会把整片地面冲成奶白
    Wd.scene.fog = null;
    const cam = Wd.camera;
    cam.up.set(0, 0, -1);                              // 图面上 = 世界 −z（北）
    cam.fov = fovDeg; cam.aspect = W / H; cam.near = 1; cam.far = 4000;
    cam.position.set(cx, camh, cz);
    cam.lookAt(cx, 0, cz);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const cv = Wd.renderer.domElement;
    cv.style.opacity = '1';
    cv.style.position = 'fixed'; cv.style.left = '0'; cv.style.top = '0'; cv.style.zIndex = '50';
    Wd.renderer.setSize(W, H, true);                   // 第三个参数 true：连 CSS 尺寸一起改
    Wd.renderer.setViewport(0, 0, W, H);
    Wd.renderer.setScissorTest(false);
    // 绕过 renderView（它按 world.H=1080 翻 y，和这里的非标准尺寸对不上），直接清屏 + 渲染
    const r = Wd.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.setClearColor(0xF7F6F2, 1);
    r.clear(true, true, true);
    r.render(Wd.scene, cam);
    return true;
  }, { cx: (R.x0 + R.x1) / 2, cz: (R.z0 + R.z1) / 2, camh: CAMH, fovDeg: fov, W, H });

  await new Promise((r) => setTimeout(r, 120));
  const base = path.join(OUT, `_base-${R.key}.png`);
  const el = await p.evaluateHandle(() => window.__director.venueWorld.renderer.domElement);
  await el.asElement().screenshot({ path: base });
  console.log(`  _base-${R.key}.png  ${W}×${H}  ${ok ? 'ok' : 'FAIL'}`);
  fs.writeFileSync(path.join(OUT, `_meta-${R.key}.json`), JSON.stringify({
    x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, ppm: R.ppm, W, H, base, items: ITEMS,
    junction: { poly: GEO.poly, nw: GEO.nw, east: GEO.east, J1: GEO.J1, J2: GEO.J2 },
  }), 'utf8');
  await p.close();
}
await b.close();
console.log('底图完成');
