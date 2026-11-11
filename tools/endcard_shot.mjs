// 落版画面出图：把 AI 底图装进 assets/endcard/<style>.jpg → 打包单页 → 4K 截图
//
//   node tools/endcard_shot.mjs --src out/endcard/raw/bg_1.png --install
//   node tools/endcard_shot.mjs --install=false           （只出图，不动素材）
//   node tools/endcard_shot.mjs --t 75.4                  （按成片时刻取入场进度）
//
// 产物：
//   assets/endcard/<style>.jpg          底图（3840×2160，Lanczos + 轻锐化）
//   out/endcard/落版-3840x2160.png      落版画面（海报级，矢量文字 1:1）
//   out/endcard/落版-1920x1080.png      网页/微信用的小图
//   dist/落版.html                       可在浏览器里直接看的单页
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPage } from './build.mjs';
import { launch, openPage } from './shot.mjs';
import { assetsJs, STYLES } from './styles.mjs';
import { ENDCARD_T } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = (n) => !argv.includes('--' + n + '=false') && argv.includes('--' + n);

const style = argv.find((a) => STYLES.includes(a)) || 'navi';
const src = path.resolve(ROOT, opt('src', 'out/endcard/raw/bg_1.png'));
const t = +opt('t', ENDCARD_T.t0 + 3);
const install = flag('install') || !argv.includes('--install=false');

// ── ① 底图：放大到 3840×2160（seedream 单张面积上限 4.19M px，只能给 2688×1512）
const artDir = path.join(ROOT, 'assets', 'endcard');
fs.mkdirSync(artDir, { recursive: true });
const artDest = path.join(artDir, `${style}.jpg`);
if (install) {
  const py = `
from PIL import Image, ImageFilter
im = Image.open(r"${src}").convert('RGB')
im = im.resize((3840, 2160), Image.LANCZOS)
im = im.filter(ImageFilter.UnsharpMask(radius=2.0, percent=58, threshold=3))
im.save(r"${artDest}", quality=92, subsampling=1)
print('art', im.size, round(__import__('os').path.getsize(r"${artDest}")/1048576, 2), 'MB')
`;
  const r = spawnSync('uv', ['run', '--with', 'pillow', 'python', '-c', py], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('底图处理失败：' + (r.stderr || r.stdout));
  process.stdout.write(r.stdout);
} else if (!fs.existsSync(artDest)) {
  throw new Error(`没有 ${path.relative(ROOT, artDest)}：先加 --install 装一次底图`);
}

// ── ② 重打素材包（含 endcard）+ 单页
const pack = spawnSync('uv', ['run', '--with', 'pillow', 'python', 'tools/pack_assets.py', style], { encoding: 'utf8' });
if (pack.status !== 0) throw new Error('pack_assets 失败：' + (pack.stderr || pack.stdout));
process.stdout.write(pack.stdout);

const boot = `<script>${assetsJs(style)};window.__STYLE=${JSON.stringify(style)};</script>`;
await buildPage('endcard', { minify: false, outName: '落版', slots: { ASSETS: boot } });

// ── ③ 4K 截图（1920 设计 × dpr 2）
const browser = await launch();
const page = await openPage(browser, path.join(ROOT, 'dist', '落版.html'), 1920, 1080, 1, `?t=${t}`);
const info = await page.evaluate(() => window.__endcard);
console.log(`  底图 ${info.hasArt ? '✓' : '✗'} · 角色 ${info.crabs} 张 · t=${info.t}s · k=${info.k}`);
if (!info.hasArt) { await browser.close(); throw new Error('页面里没有落版底图'); }

// 海报用更高的底图：直接把 3840 的 dataURL 换进去再画一次
const hi = 'data:image/jpeg;base64,' + fs.readFileSync(artDest).toString('base64');
await page.evaluate((url) => { window.__ASSETS.endcard = url; window.__redraw(); }, hi);
await new Promise((r) => setTimeout(r, 260));

const big = path.join(ROOT, 'out', 'endcard', '落版-3840x2160.png');
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await page.screenshot({ path: big, type: 'png' });
const small = path.join(ROOT, 'out', 'endcard', '落版-1920x1080.png');
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.screenshot({ path: small, type: 'png' });
await browser.close();

// ── ④ 报数（文字块亮度必须压得住，不然白字会飘）
const probe = spawnSync('uv', ['run', '--with', 'pillow', 'python', '-c', `
from PIL import Image
import numpy as np
im = np.asarray(Image.open(r"${big}").convert('RGB')).astype(float)
lum = 0.2126*im[:,:,0] + 0.7152*im[:,:,1] + 0.0722*im[:,:,2]
band = lum[int(0.70*im.shape[0]):, :]
print('lum_all %.1f  lum_底部文字带 %.1f (min %.0f / max %.0f)' % (lum.mean(), band.mean(), band.min(), band.max()))
`], { encoding: 'utf8' });
process.stdout.write(probe.stdout);
for (const f of [big, small]) console.log('  →', path.relative(ROOT, f), (fs.statSync(f).size / 1048576).toFixed(2), 'MB');
console.log('  预览：http://127.0.0.1:8789/' + encodeURIComponent('落版.html'));
