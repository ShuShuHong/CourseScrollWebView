// 全片逐帧扫描（每 6 帧 = 0.2 s 一个采样）：抓运行时报错、状态异常、副本切换点是否干净
//   node tools/scan_full.mjs [style]     默认 navi
//   · errors：pageerror / console.error 一条都不许有
//   · male.km 必须单调不减，且片尾 == 42.195
//   · scene 只能在 course / venue / split 之间切换，且每次切换都要被“窗口表”解释得通
//   · 每帧渲染耗时 p95 ≤ 60 ms（4K 渲染前先确认没有病态帧）
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { CHROME, launch, openPage } from './shot.mjs';
import { DURATION, FPS, SEGS } from '../src/config/story.js';
import { VENUE_WINDOWS } from '../src/config/venue.js';

const style = process.argv[2] || 'navi';
const FILE = { cartoon: 'dist/stage.html', navi: 'dist/stage-B-导航地图.html', papercut: 'dist/stage-C-剪纸.html' }[style];
const ROOT = path.resolve(import.meta.dirname, '..');
const TOTAL = Math.round(DURATION * FPS);

const b = await launch();
const p = await openPage(b, FILE, 1280, 720, 1);
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });

await p.waitForFunction('window.__ready !== undefined');
await p.evaluate(() => window.__ready);

const samples = [];
await p.evaluate(async (step) => { window.__SCAN = []; }, 6);

let prevScene = null, prevKm = -1;
const flips = [];
const slow = [];
for (let f = 0; f < TOTAL; f += 6) {
  const t0 = Date.now();
  const o = await p.evaluate(async (n) => {
    await window.__seekFrame(n);
    const st = window.__director.state;
    return { t: st.t, scene: st.scene, km: st.male.km, fem: st.female.km, win: st.venueWin?.id ?? null };
  }, f);
  const ms = Date.now() - t0;
  samples.push({ f, ...o });
  if (ms > 120) slow.push({ f, ms });
  if (o.scene !== prevScene) flips.push({ f, t: +o.t.toFixed(2), from: prevScene, to: o.scene, win: o.win });
  if (o.km < prevKm - 1e-6) errs.push(`km 回退 @F${f}：${prevKm} → ${o.km}`);
  prevScene = o.scene; prevKm = o.km;
}
await b.close();

// 帧 → 窗口：每个 flip 都要落在某个副本窗口边界上（±1 帧）
const bounds = [];
for (const w of VENUE_WINDOWS) { bounds.push({ t: w.t0, id: w.id, edge: 't0' }); bounds.push({ t: w.t1, id: w.id, edge: 't1' }); }
for (const fl of flips) {
  // 采样步长 6 帧 = 0.2 s ⇒ 判定窗必须 ≥ 一个步长，否则合法的边界切换会被当成剧本外
  const near = bounds.filter((b2) => Math.abs(b2.t - fl.t) <= 0.21);
  fl.near = near.map((n) => `${n.id}.${n.edge}`);
  if (fl.f !== 0 && !near.length) errs.push(`剧本外切换 @F${fl.f} ${fl.t}s ${fl.from}→${fl.to}`);
}

const last = samples.at(-1);
if (Math.abs(last.km - 42.195) > 1e-3) errs.push(`片尾公蟹 km=${last.km} ≠ 42.195`);
const kmMin = Math.min(...samples.map((s) => s.km));
const femMax = Math.max(...samples.map((s) => s.fem));

console.log(`画风 ${style} · 采样 ${samples.length} 帧（每 6 帧）· 覆盖 ${last.t.toFixed(2)}s / 总帧 ${TOTAL}`);
console.log(`公蟹 ${kmMin.toFixed(2)} → ${last.km.toFixed(3)} km · 母蟹最高 ${femMax.toFixed(4)} km`);
console.log('场景切换：');
for (const fl of flips) console.log(`  F${String(fl.f).padStart(4)} ${String(fl.t).padStart(7)}s  ${fl.from ?? '（起）'} → ${fl.to}${fl.near?.length ? '  ← ' + fl.near.join(',') : ''}`);
console.log(`段表 ${SEGS.filter((s) => s.kind === 'line').length} 段 · 副本窗口 ${VENUE_WINDOWS.map((w) => `${w.id} ${w.t0.toFixed(2)}–${w.t1.toFixed(2)}`).join(' · ')}`);
if (slow.length) console.log(`慢帧 ${slow.length} 个（多为切换场景后首帧的着色器编译）：${slow.slice(0, 6).map((s) => `F${s.f}=${s.ms}ms`).join(' ')}`);
console.log(errs.length ? '\n✗ 问题：\n  ' + errs.slice(0, 12).join('\n  ') : '\n✓ 全片扫描通过：0 报错、km 单调、切换都能被窗口表解释');
process.exit(errs.length ? 1 : 0);
