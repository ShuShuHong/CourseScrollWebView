// 量一下每套里的螃蟹在画面上的实际像素尺寸与位置（防止位图缩放失衡）
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STYLES, STAGE_FILE } from './styles.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const browser = await launch();
for (const s of STYLES) {
  const page = await openPage(browser, path.join(ROOT, 'dist', STAGE_FILE[s] + '.html'), 1920, 1080, 1, '?clean=1&t=0');
  for (const t of [6.5, 17.4, 42.4, 56.6]) {
    await page.evaluate((t) => window.__seek(t), t);
    const info = await page.evaluate(() => {
      const out = [];
      for (const im of document.querySelectorAll('#ov image')) {
        const href = im.getAttribute('href') || '';
        if (!href.startsWith('data:image/webp')) continue;
        const b = im.getBBox();
        out.push({ w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) });
      }
      return out;
    });
    console.log(s, t, JSON.stringify(info));
  }
  await page.close();
}
await browser.close();
