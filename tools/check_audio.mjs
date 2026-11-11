// 音画同步冒烟：点播放 → 等 2.5s → 读画面上显示的时间与音轨 currentTime，两者差值应 ≈ 片头留白
import { launch, openPage } from './shot.mjs';
import { AUDIO_OFFSET } from '../src/config/story.js';

const file = process.argv[2] || 'dist/stage-B-导航地图.html';
const b = await launch();
const p = await openPage(b, file, 1280, 800, 1);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

const has = await p.evaluate(() => ({ hasAudio: !!window.__audio, dur: window.__audio?.duration || null }));
await p.click('#play');
await new Promise((r) => setTimeout(r, 2600));
const s = await p.evaluate(() => ({
  tm: document.getElementById('p-sec')?.textContent,
  at: window.__audio?.currentTime ?? null,
  paused: window.__audio?.paused ?? null,
  readyState: window.__audio?.readyState ?? null,
}));
// 再跳一段，验证 seek 会同步音轨
await p.evaluate(() => window.__seek(40.0));
await new Promise((r) => setTimeout(r, 200));
const s2 = await p.evaluate(() => ({ at: window.__audio?.currentTime ?? null }));
await b.close();

console.log('内嵌音轨:', has.hasAudio, '时长', has.dur);
console.log('播放 2.6s 后 →', JSON.stringify(s));
console.log('seek 到 40.0s 后音轨 currentTime =', s2.at);
const t = parseFloat(String(s.tm));   // p-sec 形如 `2.567 s　(00:02.578)`
const off = AUDIO_OFFSET;             // 2026-11-08：整轨已对齐画面 ⇒ 偏置 0（不再写死 1.2）
console.log(`画面 ${t?.toFixed(2)}s · 音轨 ${s.at?.toFixed(2)}s · 期望画面 = 音轨 + ${off}s → 偏差 ${(t - s.at - off)?.toFixed(3)}s`);
console.log('errors', errs.length, errs.slice(0, 2));
