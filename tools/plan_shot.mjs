// 副本场景俯视图出图：node tools/plan_shot.mjs [--scale 2]
//   → dist/俯视图.html（可在浏览器直接看）
//   → out/plan/副本俯视图-北朝上.png（2× 分辨率）
//   → out/plan/副本俯视图-北朝上.jpg（聊天/微信发的小图）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPage } from './build.mjs';
import { launch, openPage } from './shot.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const scale = +(argv[argv.indexOf('--scale') + 1] || 2);

const out = await buildPage('plan', { minify: false, outName: '俯视图' });

const browser = await launch();
const page = await openPage(browser, out, 1200, 900, 1);
const info = await page.evaluate(() => window.__plan);
console.log('sheet', info.W, '×', info.H, '·', info.px_per_m, 'px/m');

await page.setViewport({ width: info.W, height: info.H, deviceScaleFactor: scale });
await page.screenshot({ path: path.join(ROOT, 'out/plan/副本俯视图-北朝上.png'), type: 'png' });
await browser.close();

const png = path.join(ROOT, 'out/plan/副本俯视图-北朝上.png');
const jpg = path.join(ROOT, 'out/plan/副本俯视图-北朝上.jpg');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '3', jpg], { encoding: 'utf8' });
if (r.status !== 0) console.log('jpg 失败', r.stderr);

for (const f of [png, jpg]) console.log('  →', path.relative(ROOT, f), (fs.statSync(f).size / 1048576).toFixed(2), 'MB');
console.log('  预览：http://127.0.0.1:8789/' + encodeURIComponent('俯视图.html'));
