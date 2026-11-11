// 验证成片里螃蟹真的在播序列帧：同一时刻附近取两帧，比较蟹 image 的 href 是否变化
import { launch } from './shot.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8789/';
const FILE = process.env.FILE || 'stage-B-导航地图.html';
const browser = await launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const readings = [];
for (const t of [14.0, 14.15, 14.3, 14.45, 30.0, 30.15, 30.3]) {
  const url = BASE + encodeURI(FILE) + '?t=' + t;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 350));
  const sig = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('image')].filter((i) => (i.getAttribute('href') || '').startsWith('data:image/webp'));
    return imgs.map((i) => i.getAttribute('href').slice(-20));
  });
  readings.push({ t, sig });
}
let changes = 0, pairs = 0;
for (let i = 1; i < readings.length; i++) {
  if (Math.abs(readings[i].t - readings[i - 1].t) > 1) continue;   // 跨镜头不算
  pairs++;
  if (readings[i].sig.join('|') !== readings[i - 1].sig.join('|')) changes++;
}
console.log(`采样 ${readings.length} 次；同镜头相邻采样 ${pairs} 对，其中换帧 ${changes} 对`);
for (const r of readings) console.log(`  t=${r.t}  蟹图 ${r.sig.length} 张: ${r.sig.map((s) => s.slice(0, 8)).join(' ')}`);
console.log(`错误 ${errs.length}${errs.length ? ' → ' + errs.slice(0, 2).join(' ; ') : ''}`);
await browser.close();
