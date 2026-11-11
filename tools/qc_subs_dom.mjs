// 字幕上屏核对（DOM）：到每条字幕的中段，画面上必须“正好一条”字幕文字
//   · 判定方式：找 <text> 节点里文字与字幕表完全一致的；统计命中条数
// 用法：node tools/qc_subs_dom.mjs [style=navi]
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STAGE_FILE } from './styles.mjs';
import { SUBTITLES } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const style = process.argv[2] || 'navi';
const browser = await launch();
const page = await openPage(browser, path.join(ROOT, 'dist', STAGE_FILE[style] + '.html'), 1920, 1080, 1, '?clean=1&t=0');
const subs = [...SUBTITLES].sort((a, b) => a.t - b.t);
const norm = (s) => s.replace(/\s/g, '');

let bad = 0;
console.log('  #  入点   时长   字幕                           同屏字幕数  判定');
for (const [i, s] of subs.entries()) {
  const t = s.t + Math.min(s.d * 0.5, 1.0);
  const got = await page.evaluate((t) => {
    window.__seek(t);
    const rows = [];
    for (const n of document.querySelectorAll('#ov text')) {
      const g = n.closest('g');
      const tr = g && g.getAttribute('transform') ? g.getAttribute('transform') : '';
      rows.push({ text: n.textContent, tr, fs: +(n.getAttribute('font-size') || 0) });
    }
    return rows;
  }, t);
  // 字幕：父级 g 的 transform 里带 940（HUD 字幕基线）且字号 >= 34
  const subTexts = got.filter((r) => /translate\(\s*960\s+940/.test(r.tr) || (r.fs >= 40 && r.fs <= 56)).map((r) => r.text);
  const hit = subTexts.filter((x) => norm(x) === norm(s.text));
  const ok = hit.length === 1;
  if (!ok) bad++;
  console.log(`${String(i + 1).padStart(3)}  ${String(s.t).padEnd(6)} ${String(s.d).padEnd(5)} ${s.text.padEnd(28, '　')} ${String(subTexts.length).padEnd(10)} ${ok ? 'ok' : (hit.length ? '重复' : '缺字幕')}  ${ok ? '' : subTexts.join(' | ')}`);
}
await browser.close();
console.log(`\n问题：${bad}`);
if (bad) process.exitCode = 1;
