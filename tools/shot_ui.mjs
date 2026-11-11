import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { CHROME } from './shot.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/review/v21');
fs.mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
for (const [w, h, tag] of [[1920, 1080, '1920'], [1600, 900, '1600'], [1366, 768, '1366']]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto('file:///' + path.join(ROOT, 'dist/stage-B-导航地图.html').split(path.sep).join('/'), { waitUntil: 'load' });
  await p.waitForFunction('window.__ready !== undefined');
  await p.evaluate(() => window.__ready);
  await p.evaluate(() => window.__seek(53.5));
  await new Promise((r) => setTimeout(r, 320));
  const geo = await p.evaluate(() => {
    const wr = document.getElementById('wrap').getBoundingClientRect();
    const ur = document.getElementById('ui').getBoundingClientRect();
    const pr = document.getElementById('panel').getBoundingClientRect();
    return {
      videoTop: Math.round(wr.top), videoBottom: Math.round(wr.bottom),
      videoW: Math.round(wr.width), barTop: Math.round(ur.top),
      panelLeft: Math.round(pr.left), panelW: Math.round(pr.width),
      gapTop: Math.round(wr.top), gapBottom: Math.round(innerHeight - ur.bottom),
    };
  });
  console.log(`${tag}: 画面 ${geo.videoW}×${geo.videoBottom - geo.videoTop} @ y${geo.videoTop} · 走带 y${geo.barTop} · 上下留白 ${geo.gapTop}/${geo.gapBottom} · 栏 x${geo.panelLeft} 宽 ${geo.panelW}`);
  await p.screenshot({ path: path.join(OUT, `ui-${tag}.png`) });
  await p.close();
}
await b.close();
console.log('saved out/review/v21/ui-*.png');
