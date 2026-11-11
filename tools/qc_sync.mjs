// 音画同步核对：每条“带里程”的字幕，在它说出口的时候，公蟹是不是真的在那个位置
// 用法：node tools/qc_sync.mjs [style=navi]
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STAGE_FILE } from './styles.mjs';
import { SUBTITLES, DURATION } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const style = process.argv[2] || 'navi';
const browser = await launch();
const page = await openPage(browser, path.join(ROOT, 'dist', STAGE_FILE[style] + '.html'), 1920, 1080, 1, '?clean=1&t=0');

let worst = 0, n = 0;
console.log('  #  字幕                                   该说到   实际公蟹km  误差(m)  判定');
for (const [i, s] of SUBTITLES.entries()) {
  if (s.km === undefined) continue;
  // 2026-11-08：字幕整体后移了 30 帧 ⇒ 核对必须用**声音**的起点（tVoice），
  //   否则每条都会多算 1 s 的位移（0.8 km/s ⇒ 平地多 800 m 假偏差）
  // 客户 2026-11-01：「全马折返点掉头」的上屏时长被单独延长到 F2454（只是停留更久），
  //   所以核对中点必须用**声音**的时长 dVoice，不能用上屏时长 d —— 否则那句会被算成偏 173 m。
  const t = (s.tVoice ?? s.t) + (s.dVoice ?? s.d) * 0.5;
  const km = await page.evaluate((t) => { const st = window.__director.render(t); return st.male.km; }, t);
  const err = Math.abs(km - s.km) * 1000;
  // 公差：一行台词内螃蟹可以移动的量（约 0.3–1.5 km），这里按 1200 m 卡
  const ok = err < 1200;
  if (err > worst) worst = err;
  n++;
  console.log(`${String(i + 1).padStart(3)}  ${s.text.padEnd(30, '　')} ${String(s.km).padStart(7)}  ${km.toFixed(2).padStart(10)}  ${err.toFixed(0).padStart(7)}  ${ok ? 'ok' : '偏差大'}`);
}
await browser.close();
console.log(`\n共核对 ${n} 条 · 最大偏差 ${worst.toFixed(0)} m · 片长 ${DURATION}s`);
