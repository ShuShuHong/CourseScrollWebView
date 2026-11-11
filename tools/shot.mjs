// 截图工具：node tools/shot.mjs <html> <out.png|jpg> [w=1920] [h=1080] [dpr=1] [js-expression-before-shot]
// 用系统 Chrome（puppeteer-core，不下载浏览器）。页面若定义 window.__ready（Promise），会先等它。
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files', '--hide-scrollbars'],
  });
}

export async function openPage(browser, file, w = 1920, h = 1080, dpr = 1, query = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) console.log('[page]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(pathToFileURL(path.resolve(file)).href + query, { waitUntil: 'load' });
  await page.evaluate(() => (window.__ready || Promise.resolve()));
  return page;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, out, w = 1920, h = 1080, dpr = 1, expr, query = ''] = process.argv.slice(2);
  const b = await launch();
  const p = await openPage(b, file, +w, +h, +dpr, query);
  if (expr) await p.evaluate(expr);
  await new Promise((r) => setTimeout(r, 150));
  const type = out.endsWith('.jpg') ? 'jpeg' : 'png';
  await p.screenshot({ path: out, type, quality: type === 'jpeg' ? 88 : undefined, fullPage: +h === 0 });
  await b.close();
  console.log('saved', out);
}
