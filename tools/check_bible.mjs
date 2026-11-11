// 校验设定集：图片是否全部加载、缺图占位是否出现、章节是否齐全、是否有报错
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STYLES, BIBLE_FILE } from './styles.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const browser = await launch();
for (const s of STYLES) {
  const file = path.join(ROOT, 'dist', BIBLE_FILE[s] + '.html');
  if (!fs.existsSync(file)) { console.log(JSON.stringify({ style: s, missing: file })); continue; }
  const errs = [];
  const page = await openPage(browser, file, 1440, 900, 1, '');
  page.on('pageerror', (e) => errs.push(e.message));
  const info = await page.evaluate(() => {
    const imgs = [...document.images];
    return {
      sections: document.querySelectorAll('section').length,
      icons: document.querySelectorAll('.card svg .ico, .card svg').length,
      imgs: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
      miss: [...document.querySelectorAll('.miss')].map((n) => n.textContent.trim()).slice(0, 8),
      svgImages: [...document.querySelectorAll('.card svg image')].length,
      kb: Math.round(document.documentElement.scrollHeight / 100),
      tabs: [...document.querySelectorAll('#tabs a')].map((a) => a.textContent),
      badge: document.querySelector('#badge')?.textContent,
    };
  });
  console.log(JSON.stringify({ style: s, ...info, errs: errs.slice(0, 3) }));
  await page.screenshot({ path: path.join(ROOT, '_work', `bible_${s}_top.png`) });
  await page.close();
}
await browser.close();
