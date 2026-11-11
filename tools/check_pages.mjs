// 用本机 Chrome 打开 http://127.0.0.1:8789/ 的几页，报标题与报错（验证服务器与页面都能跑）
import { launch } from './shot.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8789/';
const PAGES = ['', '字幕表.html', '设定集.html', '设定集-B-导航地图.html', 'stage-B-导航地图.html'];
const browser = await launch();
for (const p of PAGES) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const url = BASE + encodeURI(p);
  let st = 0;
  try {
    const r = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    st = r ? r.status() : 0;
    await page.evaluate(() => (window.__ready || Promise.resolve())).catch(() => {});
  } catch (e) {
    errs.push('nav: ' + e.message);
  }
  const info = await page.evaluate(() => ({
    title: document.title,
    h: document.documentElement.scrollHeight,
    imgs: document.images.length,
    broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
  })).catch(() => ({}));
  console.log(`${p || '(根)'}  HTTP ${st}  ${info.title || ''}  ${info.h || 0}px  img ${info.imgs || 0}/broken ${info.broken ?? '?'}  错误 ${errs.length}${errs.length ? ' → ' + errs.slice(0, 2).join(' ; ') : ''}`);
  await page.close();
}
await browser.close();
