// 播放同步冒烟：点播放 → 等 2.5s → 三个时钟（画面 / 口播 / 音效床）互相比对
import { launch, openPage } from './shot.mjs';
import { AUDIO_OFFSET } from '../src/config/story.js';

const file = process.argv[2] || 'dist/stage-B-导航地图.html';
const b = await launch();
const p = await openPage(b, file, 1440, 900, 1);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

const has = await p.evaluate(() => ({
  vo: window.__audio?.duration ?? null, sfx: window.__sfx?.duration ?? null,
}));
await p.click('#play');
await new Promise((r) => setTimeout(r, 2600));
const s = await p.evaluate(() => ({
  tm: document.getElementById('p-sec')?.textContent,
  vo: window.__audio?.currentTime ?? null,
  sfx: window.__sfx?.currentTime ?? null,
  voPaused: window.__audio?.paused, sfxPaused: window.__sfx?.paused,
}));
await new Promise((r) => setTimeout(r, 3400));
const s2 = await p.evaluate(() => ({
  tm: document.getElementById('p-sec')?.textContent,
  vo: window.__audio?.currentTime ?? null,
  sfx: window.__sfx?.currentTime ?? null,
}));
await p.evaluate(() => window.__seek(41.13));
await new Promise((r) => setTimeout(r, 200));
const s3 = await p.evaluate(() => ({ vo: window.__audio?.currentTime ?? null, sfx: window.__sfx?.currentTime ?? null }));
await p.click('#play');
await new Promise((r) => setTimeout(r, 1500));
const s4 = await p.evaluate(() => ({ vo: window.__audio?.currentTime ?? null, sfx: window.__sfx?.currentTime ?? null }));
await b.close();

const tf = (txt) => {
  // 播放器显示 MM:SS.mmm
  const m = String(txt).match(/(\d+):(\d+\.\d+)/);
  return m ? +m[1] * 60 + +m[2] : parseFloat(String(txt));
};
console.log('内嵌：口播', has.vo?.toFixed(3), 's · 音效床', has.sfx?.toFixed(3), 's');
const d1 = tf(s.tm) - s.sfx, d2 = tf(s.tm) - (s.vo + AUDIO_OFFSET);
console.log(`播放 2.6s 后：画面 ${tf(s.tm).toFixed(2)} · 口播 ${s.vo?.toFixed(2)} · 音效 ${s.sfx?.toFixed(2)}`);
console.log(`  画面−音效 ${d1.toFixed(3)}s · 画面−(口播+偏置${AUDIO_OFFSET}) ${d2.toFixed(3)}s · 两轨都在播 ${!s.voPaused && !s.sfxPaused}`);
console.log(`再播 3.4s：画面 ${tf(s2.tm).toFixed(2)} · 口播 ${s2.vo?.toFixed(2)} · 音效 ${s2.sfx?.toFixed(2)} · 漂移 ${(tf(s2.tm) - s2.sfx).toFixed(3)}s`);
console.log(`seek 41.13 后：口播 ${s3.vo?.toFixed(2)}（应 ≈${(41.13 - AUDIO_OFFSET).toFixed(2)}）· 音效 ${s3.sfx?.toFixed(2)}（应 ≈41.13）`);
console.log(`再播放 1.5s：口播 ${s4.vo?.toFixed(2)} · 音效 ${s4.sfx?.toFixed(2)} · 差 ${(s4.sfx - s4.vo - AUDIO_OFFSET).toFixed(3)}s`);
console.log('errors', errs.length, errs.slice(0, 2));

const pass = Math.abs(d1) < 0.12 && Math.abs(d2) < 0.12 && !s.voPaused && !s.sfxPaused
  && Math.abs(tf(s2.tm) - s2.sfx) < 0.15
  && Math.abs((s3.sfx ?? -9) - 41.13) < 0.2 && Math.abs((s3.vo ?? -9) - (41.13 - AUDIO_OFFSET)) < 0.2
  && Math.abs((s4.sfx ?? -9) - (s4.vo ?? -9) - AUDIO_OFFSET) < 0.15
  && errs.length === 0;
console.log(pass ? '\n✓ 两轨同步播放通过' : '\n✗ 同步不合格');
process.exit(pass ? 0 : 1);
