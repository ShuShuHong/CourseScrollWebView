// 字幕在画面上的实际观感：按字幕表逐条跳到入点+中段截图，拼成一张审阅条
// 用法：node tools/shot_subs.mjs [style=navi] [step=0.55]
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STAGE_FILE } from './styles.mjs';
import { SUBTITLES } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const style = process.argv[2] || 'navi';
const out = path.join(ROOT, 'out/review', `subs_${style}`);
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const page = await openPage(browser, path.join(ROOT, 'dist', STAGE_FILE[style] + '.html'), 1920, 1080, 1, '?clean=1&t=0');
const subs = [...SUBTITLES].sort((a, b) => a.t - b.t);
const files = [];
for (const [i, s] of subs.entries()) {
  const t = s.t + Math.min(s.d * 0.55, 1.2);
  await page.evaluate((t) => window.__seek(t), t);
  const f = path.join(out, `s${String(i + 1).padStart(2, '0')}_${s.t.toFixed(1)}s.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();

// 拼 4 列缩略图，带序号与文字
const { default: sharp } = await import('sharp').catch(() => ({ default: null }));
if (!sharp) {
  console.log('screenshots:', files.length, '（未安装 sharp，跳过拼图）');
  console.log(files.map((f) => path.relative(ROOT, f)).join('\n'));
  process.exit(0);
}
const cols = 4, W = 640, H = 360;
const rows = Math.ceil(files.length / cols);
const composites = [];
for (const [i, f] of files.entries()) {
  const buf = await sharp(f).resize(W, H).toBuffer();
  composites.push({ input: buf, left: (i % cols) * W, top: Math.floor(i / cols) * H });
}
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#000' } })
  .composite(composites).jpeg({ quality: 88 }).toFile(path.join(ROOT, 'out/review', `subs_${style}_sheet.jpg`));
console.log('sheet saved');
