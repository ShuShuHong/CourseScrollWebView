// 校验三套 stage：是否用到位图角色 / 是否有报错 / 画面是否真的不同
// 用法：node tools/check_stage.mjs [t1,t2...]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openPage } from './shot.mjs';
import { STYLES, STAGE_FILE } from './styles.mjs';
import { KEYFRAMES } from '../src/config/keyframes.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TS = process.argv[2]
  ? process.argv[2].split(',').map(Number)
  : [3, 10, 24, 34, 48, 61, 70, 80, 90].filter((t) => t < KEYFRAMES[KEYFRAMES.length - 1].t);
const browser = await launch();
const rows = [];
for (const s of STYLES) {
  const file = path.join(ROOT, 'dist', STAGE_FILE[s] + '.html');
  const page = await openPage(browser, file, 1920, 1080, 1, '?clean=1&t=0');
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  for (const t of TS) {
    await page.evaluate((t) => window.__seek(t), t);
    const info = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('#ov image')];
      const bmp = imgs.filter((i) => (i.getAttribute('href') || '').startsWith('data:image/webp')).length;
      const svgCrabs = document.querySelectorAll('#ov g[data-crab-svg]').length;
      const hasAssets = !!window.__ASSETS;
      const first = imgs[0]?.getAttribute('href') || '';
      return { imgs: imgs.length, bmp, hasAssets, first50: first.slice(0, 30), theme: document.body.dataset.theme || '' };
    });
    const png = await page.screenshot({ type: 'png' });
    rows.push({ style: s, t, ...info, bytes: png.length, errs: errs.slice(0, 2) });
  }
  await page.close();
}
await browser.close();
for (const r of rows) console.log(JSON.stringify(r));
