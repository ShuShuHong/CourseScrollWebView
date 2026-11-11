// 检查“动作序列”页：是否能播（帧会变）、有没有报错、是否缺序列
import { launch } from './shot.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8789/';
const FILE = process.env.FILE || '动作序列-B-导航地图.html';
const browser = await launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('requestfailed', (rq) => errs.push('reqfail: ' + rq.url().slice(0, 120)));
page.on('response', (rs) => { if (rs.status() >= 400) errs.push('http ' + rs.status() + ' ' + rs.url().slice(0, 120)); });
const url = BASE + encodeURI(FILE);
const r = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await new Promise((r) => setTimeout(r, 400));
const cards = await page.evaluate(() => document.querySelectorAll('.card').length);
const seen = new Set();
for (let k = 0; k < 10; k++) {
  const sig = await page.evaluate(() => {
    const im = document.querySelector('.card .stage img');
    return im ? im.getAttribute('src').slice(-24) : null;
  });
  if (sig) seen.add(sig);
  await new Promise((r) => setTimeout(r, 90));
}
const sizes = await page.evaluate(() => [...document.querySelectorAll('.card .stage img')].slice(0, 3).map((i) => `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`));
const rows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
console.log(`${FILE}  HTTP ${r.status()}  卡片 ${cards}  表格行 ${rows}  尺寸 ${sizes.join(' ')}`);
console.log(`实测变化帧数：${seen.size}${seen.size > 1 ? ' ✔ 在播' : ' ✘ 没在播'}`);
console.log(`错误 ${errs.length}${errs.length ? ' → ' + errs.slice(0, 3).join(' ; ') : ''}`);
await page.screenshot({ path: 'out/review/seq_page.png', fullPage: false });
await browser.close();
