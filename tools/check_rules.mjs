// 画面规则回归：母左公右 / 海拔窗常驻 / 桥面虚线 / 序列帧节拍恒定
import { launch, openPage } from './shot.mjs';

const file = process.argv[2] || 'dist/stage-B-导航地图.html';
const b = await launch();
const p = await openPage(b, file, 1920, 1080, 1);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

const probe = (t) => p.evaluate((tt) => {
  window.__seek(tt);
  const svg = document.querySelector('#stage svg');
  const txt = svg ? svg.textContent : '';
  // 螃蟹：素材图里带 data:image/webp 的 <image>，按屏幕 x 排序
  const imgs = [...document.querySelectorAll('image')]
    .filter((i) => (i.getAttribute('href') || '').startsWith('data:image/webp'))
    .map((i) => { const r = i.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), href: i.getAttribute('href').slice(-12) }; })
    .sort((a, c) => a.x - c.x);
  const dashed = [...document.querySelectorAll('path')].filter((pp) => (pp.getAttribute('stroke-dasharray') || '').startsWith('7 ')).length;
  return {
    hasElev: txt.includes('海拔剖面'),
    hasDeck: txt.includes('桥面'),
    dashed,
    crabs: imgs.filter((i) => i.w > 60),
  };
}, t).then((r) => ({ ...r, t }));

const rows = [];
for (const t of [4, 12, 20.4, 22.5, 29.4, 33, 40.9, 48.9, 56.6, 57.2, 66, 75.5]) {
  await new Promise((r) => setTimeout(r, 60));
  rows.push(await probe(t));
}
await b.close();

console.log(' t    海拔窗 桥面虚 虚线路径数 螃蟹(从左到右 x/宽/帧)');
for (const r of rows) {
  const crab = r.crabs.map((c) => `${c.x}/${c.w}/${c.href.slice(-4)}`).join('  ');
  console.log(`${String(r.t).padStart(5)}   ${r.hasElev ? '✓  ' : '✗  '}   ${r.hasDeck ? '✓  ' : '✗  '}   ${crab}`);
}
console.log('errors', errs.length, errs.slice(0, 2));
