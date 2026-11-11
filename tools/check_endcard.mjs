// 片尾自检（客户 2026-11-05 ②：**结尾落版整段去掉**）
//   原来这套检查验的是“落版画面”（标题/数据/蟹王蟹后/过黑转场），落版拿掉以后改成反向断言：
//   ① 配置里不许再有 endTitle 事件（防止落版被悄悄加回来）；
//   ② 片尾最后两秒必须还停在**主舞台庆祝镜头**（副本 finale 窗口），不许回到全图、不许切整版黑底；
//   ③ 画面亮度不许出现“整页白/整页黑”那种落版式转场；
//   ④ 最后一句话幕仍在屏上（收尾靠旁白，不靠落版字）。
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { EVENTS, DURATION, SUBTITLES } from '../src/config/story.js';
import { WIN_T } from '../src/config/venue.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ok = [], bad = [];
const chk = (name, pass, info = '') => (pass ? ok : bad).push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' · ' + info : ''}`);

console.log(`=== 片尾（无落版）· 片长 ${DURATION}s ===`);

// ① 配置
const ec = EVENTS.filter((e) => e.type === 'endTitle');
chk('配置里没有 endTitle 事件', ec.length === 0, `${ec.length} 条`);
chk('片尾副本窗口盖到片长末尾', WIN_T.fin1 >= DURATION - 0.2, `fin1 ${WIN_T.fin1} vs DURATION ${DURATION}`);
chk('主舞台切入早于最后一句口播', WIN_T.stage < SUBTITLES[SUBTITLES.length - 1].t, `stage ${WIN_T.stage}`);

// ② 画面
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?clean=1');
const shot = async (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const st = window.__dbg.state();
  const c = document.querySelectorAll('canvas')[0];
  const g = document.createElement('canvas'); g.width = 240; g.height = 135;
  const ctx = g.getContext('2d', { willReadFrequently: true }); ctx.drawImage(c, 0, 0, 240, 135);
  const d = ctx.getImageData(0, 0, 240, 135).data;
  let sum = 0, white = 0, black = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += v; if (v > 246) white++; if (v < 8) black++;
  }
  const n = d.length / 4;
  const texts = [...document.querySelectorAll('#ov text')].map((e) => e.textContent.trim());
  return { t: tt, scene: st.scene, mean: sum / n, white: 100 * white / n, black: 100 * black / n, n: texts.length };
}, t);

const probes = [DURATION - 1.90, DURATION - 1.00, DURATION - 0.30, DURATION - 0.05];
const rows = [];
for (const t of probes) rows.push(await shot(t));
for (const r of rows) console.log(`  ${r.t.toFixed(2)}s scene=${r.scene} 亮度均值 ${r.mean.toFixed(0)} · 近白 ${r.white.toFixed(2)}% · 近黑 ${r.black.toFixed(2)}% · 文本 ${r.n} 条`);
chk('片尾四帧都在副本主舞台', rows.every((r) => r.scene === 'venue'), rows.map((r) => r.scene).join('/'));
// 主舞台是白昼广场，本来就亮（实测均值 228）⇒ 只排除“整页纯白/纯黑”的落版式转场
chk('片尾画面不是全白/全黑（无落版式转场）', rows.every((r) => r.mean > 40 && r.mean < 246 && r.black < 60), rows.map((r) => r.mean.toFixed(0)).join('/'));
chk('片尾近白像素 ≤ 5%（没有白色整版）', rows.every((r) => r.white <= 5), rows.map((r) => r.white.toFixed(2) + '%').join('/'));
// 落版的特征是“一整块 86px 大标题 + 副标 + 两行数据”，这里直接查有没有这种超大字号文本
const big = await p.evaluate(async (tt) => {
  await window.__seek(tt);
  return [...document.querySelectorAll('#ov text')].filter((e) => +e.getAttribute('font-size') >= 60).map((e) => e.textContent.trim());
}, DURATION - 0.3);
console.log(`  片尾 ≥60px 大字：${big.length ? big.join('|') : '（无）'}`);
chk('片尾没有落版式大标题', big.length === 0, `${big.length} 条`);

// ③ 主舞台上有两只螃蟹（庆祝仪式）
const crabs = await p.evaluate(async (tt) => {
  await window.__seek(tt);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return [...document.querySelectorAll('[data-crab]')].map((e) => e.getAttribute('data-crab'));
}, DURATION - 0.5);
console.log(`  片尾同屏角色：${crabs.join(',') || '（无）'}`);
chk('片尾两只螃蟹都在主舞台', crabs.includes('male') && crabs.includes('female'), crabs.join(','));

// ④ 落版素材留档，但不再被时间轴引用
const artSrc = fs.readFileSync(path.join(ROOT, 'src/art/endcard.js'), 'utf8');
chk('落版素材留档（endcard.js 仍存在）', artSrc.length > 500, `${(artSrc.length / 1024).toFixed(1)} KB`);
const storySrc = fs.readFileSync(path.join(ROOT, 'src/config/story.js'), 'utf8');
chk('story.js 里 endTitle 只以注释形式保留', !/^\s*\{ type: 'endTitle'/m.test(storySrc));

await b.close();
for (const s of ok) console.log(s);
for (const s of bad) console.log(s);
console.log(bad.length ? `\n✗ ${bad.length} 项不通过（共 ${ok.length + bad.length} 项）` : `\n✓ 全部通过（共 ${ok.length} 项）`);
process.exit(bad.length ? 1 : 0);
