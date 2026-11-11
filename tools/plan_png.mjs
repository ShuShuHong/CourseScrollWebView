// 把 plan_grid.mjs 生成的 SVG 栅格化成 PNG（直接用 Chrome 渲染，字体和 SVG 完全一致）
//   node tools/plan_png.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME } from './shot.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/plan');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars', '--font-render-hinting=none'] });
for (const key of ['总图', '岔口']) {
  const svgPath = path.join(OUT, `平面图-${key}.svg`);
  const svg = fs.readFileSync(svgPath, 'utf8');
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  const W = +m[1], H = +m[2];
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>${svg}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 250));
  const png = path.join(OUT, `平面图-${key}.png`);
  await p.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`  平面图-${key}.png  ${W}×${H}  ${(fs.statSync(png).size / 1024).toFixed(0)} KB`);
  await p.close();
}
await b.close();
