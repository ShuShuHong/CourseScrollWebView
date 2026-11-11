// 副本场景逐帧截图（给设计/审图用）
//   node tools/venue_shots.mjs            → 三套画风各 19 张
//   node tools/venue_shots.mjs navi       → 只做一套
// 输出：out/venue/<style>/<style>_<t>s.png（1280 宽 PNG，可直接看/贴进交接文档）
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { STYLES, LABEL, buildStage } from './styles.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const only = process.argv.slice(2).filter((a) => STYLES.includes(a));
const list = only.length ? only : STYLES;

// 三个副本窗口里会被观众看到的时刻（含每个窗口的首帧、中段、尾帧）
// 片尾窗口 2026-10-28 提前到 62.60s：补 62.8 / 63.8 两张（公蟹 230 m 冲刺段）
const TS = [2.0, 3.4, 4.6, 5.5, 6.5, 6.9, 7.35, 7.73, 8.3, 8.65, 8.9,
  41.4, 43.2, 44.8, 46.0, 47.5, 48.3, 49.2, 50.6, 51.4,
  62.8, 63.8, 64.5, 65.2, 66.0, 67.4, 69.0, 71.6, 74.0, 76.5];

const browser = await launch();
for (const style of list) {
  const dir = path.join(ROOT, 'out/venue', style);
  fs.mkdirSync(dir, { recursive: true });
  const out = await buildStage(style);
  const page = await openPage(browser, out, 1920, 1080, 1, '?clean=1&dpr=1');
  for (const t of TS) {
    await page.evaluate((tt) => window.__seek(tt), t);
    await page.screenshot({ type: 'png', path: path.join(dir, `${t.toFixed(1)}s.png`) });
    process.stdout.write(`  ${LABEL[style]} ${t.toFixed(1)}s\r`);
  }
  await page.close();
  console.log(`${LABEL[style]} → out/venue/${style}/  ${TS.length} 张`);
}
await browser.close();
