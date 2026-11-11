// 播放器自检（2026-11-08：信息挪到画面右侧信息栏，一行一个数据）
//   ① 常量：30fps / 总帧数 / 片长（都从 story.js 读）
//   ② 帧号 ↔ 时间互逆；任意 seek 都吸附到帧网格（显示帧号 = 这一帧的真实帧号）
//   ③ ◀帧 / 帧▶ 连点严格 ±1 帧，不累积浮点误差
//   ④ 越界夹紧（-1 / 999 都不该出现负数时刻或超片长）
//   ⑤ 右侧栏：10 个字段全部有值、9 个分段按钮三列排布不被压扁、1920/1600/1366 三宽度不重叠画面
//   ⑥ ?t= 深链接也吸附到帧网格
import { launch, openPage } from './shot.mjs';

import { DURATION as DUR_CFG, FPS as FPS_CFG, SUBTITLES } from '../src/config/story.js';
const FPS = FPS_CFG, DUR = DUR_CFG, TOTAL = Math.round(DUR * FPS);
const ok = [], bad = [];
const chk = (name, cond, detail) => (cond ? ok : bad).push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
const P = (p, id) => p.evaluate((i) => (document.getElementById(i)?.textContent || '').trim(), id);

const b = await launch();

// ① 常量
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);
const c = await p.evaluate(() => ({ fps: window.__dbg.fps, frames: window.__dbg.frames, dur: window.__dbg.dur }));
console.log('=== ① 常量 ===');
console.log(`  fps ${c.fps} · 总帧 ${c.frames} · 片长 ${c.dur}s`);
chk('fps = 30', c.fps === 30);
chk('总帧数 = round(片长×30)', c.frames === TOTAL, `${c.frames} vs ${TOTAL}`);

// ② 帧号 ↔ 时间
console.log('\n=== ② 帧号 ↔ 时间 ===');
const bad2 = await p.evaluate(() => {
  const out = [];
  for (const n of [0, 1, 37, 307, 1008, 1453, 2219, 2303]) {
    const tt = window.__dbg.tOfFrame(n);
    if (Math.round(tt * window.__dbg.fps) !== n) out.push([n, tt]);
  }
  return out;
});
console.log('  互逆误差项:', bad2.length ? JSON.stringify(bad2) : '无');
chk('帧号 ↔ 时间互逆', bad2.length === 0);

const snaps = [];
for (const t of [12.5, 33.6, 48.44, 61.111]) {
  const r = await p.evaluate(async (tt) => {
    await window.__seek(tt);
    const n = window.__dbg.frame();
    return { t: tt, n, tOf: window.__dbg.tOfFrame(n), shown: document.getElementById('p-frame').textContent };
  }, t);
  snaps.push(r);
  const aligned = Math.abs(r.tOf - r.n / FPS) < 1e-3 && Math.abs(r.n / FPS - r.t) <= 1 / FPS;
  console.log(`  seek(${t}) → 第 ${r.n} 帧（${r.tOf}s）· 栏内显示 ${r.shown}`);
  chk(`seek(${t}) 吸附到帧网格`, aligned, `${r.tOf}s = ${r.n}/30`);
  chk(`seek(${t}) 栏内帧号 = 实际帧`, +r.shown === r.n, `${r.shown} vs ${r.n}`);
}

// ③ 帧步进
console.log('\n=== ③ 帧步进 ===');
await p.evaluate(async () => { await window.__seekFrame(100); });
const fwd = [];
for (let i = 0; i < 6; i++) fwd.push(await p.evaluate(async () => {
  document.getElementById('fnext').click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return window.__dbg.frame();
}));
const bwd = [];
for (let i = 0; i < 4; i++) bwd.push(await p.evaluate(async () => {
  document.getElementById('fprev').click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return window.__dbg.frame();
}));
console.log('  ▶ ×6:', fwd.join(' → '));
console.log('  ◀ ×4:', bwd.join(' → '));
chk('帧▶ 连点严格 +1', fwd.join(',') === '101,102,103,104,105,106', fwd.join(','));
chk('帧◀ 连点严格 -1', bwd.join(',') === '105,104,103,102', bwd.join(','));

// ④ 越界
console.log('\n=== ④ 越界夹紧 ===');
for (const x of [-1, 0, DUR, 999]) {
  const r = await p.evaluate(async (tt) => {
    await window.__seek(tt);
    return { n: window.__dbg.frame(), sec: document.getElementById('p-sec').textContent };
  }, x);
  console.log(`  seek(${x}) → 帧 ${r.n} · ${r.sec}`);
  if (x === -1) chk('负时间被夹到 0（不显示负数秒）', !/^\s*-/.test(r.sec), r.sec);
  if (x === 999) chk('超片长夹到最后一帧', r.n === TOTAL - 1, `帧 ${r.n}`);
}

// ⑤ 右侧栏：字段齐全 + 三宽度布局
console.log('\n=== ⑤ 右侧栏 ===');
const FIELDS = ['p-frame', 'p-total', 'p-sec', 'p-cue', 'p-cuedur', 'p-kmm', 'p-kmf', 'p-scene',
  'p-evsub', 'p-evsub-n', 'p-evin', 'p-evin-n', 'p-evout', 'p-evout-n'];
const vals = await p.evaluate(async (ids) => {
  await window.__seek(53.5);
  return ids.map((i) => ({ id: i, v: (document.getElementById(i)?.textContent || '').trim() }));
}, FIELDS);
for (const f of vals) console.log(`  ${f.id.padEnd(9)} ${f.v}`);
chk('右侧栏 14 个读数全部有值（无占位 —）', vals.every((f) => f.v && f.v !== '—'),
  vals.filter((f) => !f.v || f.v === '—').map((f) => f.id).join(',') || '全有值');
// 三个事件框：数值里必须带「秒 · F###」（字幕框在空档时会写“无（空档…）”，那时不要求）
// 2026-11-09：字幕整体提前 25 帧后，53.5 s 正好落在两句之间的空档 ⇒ 字幕框单独抽一条有字幕的时刻来校
const SUB_SAMPLE = SUBTITLES[25];
const vSub = await p.evaluate(async (t) => {
  await window.__seek(t);
  return { v: (document.getElementById('p-evsub')?.textContent || '').trim(), t };
}, SUB_SAMPLE.t + SUB_SAMPLE.d * 0.5);
vals.find((f) => f.id === 'p-evsub').v = vSub.v;
chk('字幕事件框带时间窗与帧号', /F\d+/.test(vSub.v), `${vSub.t.toFixed(2)}s → ${vSub.v}`);
chk('图卡入场框带时间与帧号', /\d+s · F\d+/.test(vals.find((f) => f.id === 'p-evin').v), vals.find((f) => f.id === 'p-evin').v);
chk('图卡出场框带时间与帧号', /\d+s · F\d+/.test(vals.find((f) => f.id === 'p-evout').v), vals.find((f) => f.id === 'p-evout').v);
const cueV = vals.find((f) => f.id === 'p-cue').v;
chk('口播条目含序号/总数与文本', cueV.includes(`／${SUBTITLES.length}`) && cueV.length > 8, cueV);
chk('里程带单位 km', /km$/.test(vals.find((f) => f.id === 'p-kmm').v) && /km$/.test(vals.find((f) => f.id === 'p-kmf').v));

for (const [w, h] of [[1920, 1080], [1600, 900], [1366, 768]]) {
  const q = await openPage(b, 'dist/stage-B-导航地图.html', w, h, 1);
  await q.evaluate(async () => { await window.__seekFrame(1453); });
  const r = await q.evaluate(() => {
    const panel = document.getElementById('panel');
    const wrap = document.getElementById('wrap');
    const ui = document.getElementById('ui');
    const btns = [...document.getElementById('marks').children];
    const pr = panel.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), ur = ui.getBoundingClientRect();
    const rowsY = [...new Set(btns.map((e) => Math.round(e.getBoundingClientRect().top)))];
    const clipped = [...panel.querySelectorAll('.v')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id);
    return {
      panelW: Math.round(pr.width), panelRight: Math.round(pr.right),
      wrapRight: Math.round(wr.right), uiBottom: Math.round(ur.bottom),
      overlap: wr.right > pr.left + 0.5,
      docOver: document.documentElement.scrollWidth > innerWidth + 1,
      squeezed: btns.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      btnRows: rowsY.length, perRow: btns.length / rowsY.length,
      clipped,
      videoH: Math.round(wr.height),
    };
  });
  console.log(`  ${w}×${h}: 栏 ${r.panelW}px · 画面宽 ${r.wrapRight} / 栏左沿 ${r.panelRight - r.panelW} · 画面高 ${r.videoH} · 走带底 ${r.uiBottom}`);
  chk(`${w}px 画面不被信息栏压住`, !r.overlap);
  chk(`${w}px 无横向溢出`, !r.docOver);
  chk(`${w}px 分段按钮 3 个一行（共 ${r.btnRows} 行）`, r.perRow === 3 && r.btnRows === 3, `${r.btnRows} 行 × ${r.perRow}`);
  chk(`${w}px 分段按钮不被压扁`, r.squeezed === 0);
  chk(`${w}px 栏内数值不被截断`, r.clipped.length === 0, r.clipped.join(','));
  await q.close();
}

// ⑤b 三个事件框：全片均匀取样，任何时刻都不能出现空值
console.log('\n=== ⑤b 事件框全片取样 ===');
const EV = ['p-evsub', 'p-evsub-n', 'p-evin', 'p-evin-n', 'p-evout', 'p-evout-n'];
const empty = [];
for (let i = 0; i < 40; i++) {
  const n = Math.round((TOTAL - 1) * i / 39);
  const r = await p.evaluate(async (f, ids) => {
    await window.__seekFrame(f);
    return ids.map((id) => ({ id, v: (document.getElementById(id)?.textContent || '').trim() }));
  }, n, EV);
  for (const it of r) if (!it.v || it.v === '—') empty.push(`F${n} ${it.id}`);
}
console.log(`  40 个取样点 × 6 个字段 = 240 个值，空值 ${empty.length} 处`);
chk('三个事件框全片无空值', empty.length === 0, empty.slice(0, 6).join(',') || '240/240 有值');

// ⑥ ?t= 深链接
const q2 = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?t=48.44');
await q2.evaluate(() => window.__ready);
const deep = await q2.evaluate(() => ({ n: window.__dbg.frame(), sec: document.getElementById('p-sec').textContent }));
console.log(`\n=== ⑥ 深链接 ?t=48.44 → 第 ${deep.n} 帧 · ${deep.sec}`);
chk('?t= 吸附到帧网格', deep.n === Math.round(48.44 * FPS), `第 ${deep.n} 帧`);
await q2.close();

// clean=1 不应崩
const q3 = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?clean=1');
const cleanOk = await q3.evaluate(async () => { await window.__seek(10); return document.getElementById('ui').style.display === 'none'; });
chk('?clean=1 隐藏控件且不报错', cleanOk);
await q3.close();

await b.close();
console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
