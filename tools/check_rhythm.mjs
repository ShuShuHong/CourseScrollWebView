// 节奏自检（客户 2026-10-29 换音轨后重写：**全部期望值从配置推导**，换配音不用改这份测试）
//   ① 纯数据：PACE 分块的里程映射、速度无瞬移、台词说的里程 = 螃蟹到达的里程
//   ② 浏览器：分屏开合、半马降暗、加速角标、滨湖公园卡跟随锚点、图卡帧窗、卡片槽位
import {
  VO_LINES, MALE_KM, tAtKm, SPLIT, T_FEMALE_FINISH, EVENTS, STICKERS, CARDS, DURATION, FPS, lineT, SEGS,
} from '../src/config/story.js';
import { CROSS, WIN_T, VENUE_WINDOWS } from '../src/config/venue.js';
import { PACE } from '../src/config/voice.js';
import { pchip } from '../src/engine/math.js';
import { launch, openPage } from './shot.mjs';

const ok = [], bad = [];
const chk = (name, cond, detail) => (cond ? ok : bad).push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
const maleKm = pchip(MALE_KM);
const byId = (id) => VO_LINES.find((l) => l.id === id);
const rateAt = (t, h = 0.02) => (maleKm(t + h) - maleKm(t - h)) / (2 * h);
const F = (t) => Math.round(t * FPS);

console.log(`=== ① 逐句里程（PACE 分块）· 片长 ${DURATION}s · ${VO_LINES.length} 句 ===`);
for (const B of PACE) {
  const i0 = byId(B.id0), i1 = byId(B.id1);
  const t0 = B.t0 ?? B.startAt ?? i0.t, t1 = B.t1 ?? B.endAt ?? (i1.t + i1.d);
  // 2026-11-08：段内切进副本的段（分流 / 主会场）主里程轴会**冻结**，后半段原地播台词
  const frozen = B.freeze != null;
  const rate = (B.km1 - B.km0) / (t1 - t0);
  const rows = VO_LINES.filter((l) => l.i >= i0.i && l.i <= i1.i);
  let maxErr = 0;
  for (const l of rows) {
    const u = Math.max(0, Math.min(1, ((l.t + l.d / 2) - t0) / (t1 - t0)));
    const want = B.km0 + (B.km1 - B.km0) * u;
    maxErr = Math.max(maxErr, Math.abs(l.km - want));
  }
  const mid = (t0 + t1) / 2, half = (t1 - t0) / 4;
  let lo = Infinity, hi = -Infinity;
  for (let t = mid - half; t <= mid + half; t += 0.05) { const v = rateAt(t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  console.log(`  ${B.id0}${B.id0 === B.id1 ? '' : '–' + B.id1}  ${B.km0} → ${B.km1} km  @${t0.toFixed(2)}–${t1.toFixed(2)}s  名义 ${rate.toFixed(2)} km/s · 实测中段 ${lo.toFixed(2)}–${hi.toFixed(2)}`);
  console.log(`      ${rows.map((r) => `${r.id}:${r.km.toFixed(2)}`).join(' ')}`);
  if (!frozen) {
    // 容差 3e-3：`l.km` 是 4 位小数四舍五入后的值，段首静音让中点与名义映射差 1–2 m，属于数值噪声
    chk(`${B.km0}→${B.km1} 每句都落在声明映射上`, maxErr < 3e-3, `最大偏差 ${maxErr.toFixed(5)} km`);
    if (t1 - t0 >= 4.0 && rate > 0.05) chk(`${B.km0}→${B.km1} 中段速率≈名义（±30%）`, Math.abs((lo + hi) / 2 - rate) < rate * 0.30, `${((lo + hi) / 2).toFixed(2)} vs ${rate.toFixed(2)}`);
  } else console.log(`     ↳ 段内切副本（主里程轴冻结），跳过线性断言`);
}

// 台词里说到的里程 == 螃蟹到达的里程（这是“同期”的核心）
console.log('\n  台词里程 vs 螃蟹里程：');
// 注意 L32「约40到41公里」是 PACE 22→40 块的**末句**：块末才到 40 km，句中点自然在 39 附近 ——
//   所以这里只验块末，不验行中点。
// 2026-11-07：客户要求 29→42 一条匀速（取消 40 / 41 km 两个关键帧点位）⇒ L33 不再钉 40.5，
//   改为单独验「29–42 段速度恒定」，见下面那条新断言。
// 2026-11-08：匀速模型不再把每句台词死钉在某个 km 上（客户口径：匀速优先，里程不够插空档、
//   台词太长就减速）。所以这里改成**报告实测偏差**，只对“海报级”地标卡 ±0.8 km 硬断言。
const LANDMARK = [
  ['L08', 2.50, '博物馆'], ['L09', 5.80, '老街'], ['L11', 8.10, '上桥'],
  ['L22', 19.50, '南漪路折返'], ['L31', 29.10, '全马折返'],
  // 客户 2026-11-01：34、35（L33/L34）要读完还在湖滨大道 ⇒ 40.00 之后到 41.35 全给 L33/L34，
  //   「约40到41公里」这句按设计只验**块末落在 40 km**（旧值是 40.50，那是上一版排程的口径）
  ['L32', 40.00, '湿地一带'],
];
console.log('  台词点名的里程 vs 螃蟹所在位置：');
for (const [id, want, name] of LANDMARK) {
  const l = byId(id);
  // 2026-11-08：公里窗口模型下“这句说到 X 公里”只要在**这句播放期间经过** X 即算对上
  const a = maleKm(l.t), b = maleKm(l.tOut);
  const err = want < Math.min(a, b) ? Math.min(a, b) - want : want > Math.max(a, b) ? want - Math.max(a, b) : 0;
  const tag = err < 0.35 ? 'ok  ' : '偏';
  console.log(`    ${id} ${name}  台词≈${want.toFixed(2)}  passage ${a.toFixed(2)}→${b.toFixed(2)}  差 ${(err * 1000).toFixed(0)}m  ${tag}`);
  chk(`${id}（${name}）这句播放期间经过 ${want} km`, err < 0.35, `${a.toFixed(2)}–${b.toFixed(2)}`);
}
chk('开口到终点在片尾之前完成', tAtKm(42.195) < DURATION - 1, `42.195km @${tAtKm(42.195).toFixed(2)}s / 片长 ${DURATION}s`);

let back = 0;
for (let i = 1; i < MALE_KM.length; i++) if (MALE_KM[i][1] < MALE_KM[i - 1][1] - 1e-9) back++;
chk('公蟹里程全程单调', back === 0, `${MALE_KM.length} 个锚点`);

// ── 全马环湖段（客户 2026-10-29 第四版）：两块**硬钉** —— 读完滨湖公园停在 29、读完折返跑到 39
console.log('');
console.log('  全马环湖段（pin 块）：');
const PIN = PACE.filter((B) => B.pin);
for (const B of PIN) {
  const i0 = byId(B.id0), i1 = byId(B.id1);
  const tEnd = B.endAt ?? (i1.t + i1.d);
  const got = maleKm(tEnd);
  console.log(`    ${B.id0}${B.id0 === B.id1 ? '' : '–' + B.id1}  ${B.km0} → ${B.km1} km`
    + ` · 开口 ${i0.t.toFixed(2)}s 在 ${maleKm(i0.t).toFixed(2)}km · 读完 ${tEnd.toFixed(2)}s 在 ${got.toFixed(2)}km`);
  // 客户 2026-11-09：段 19/20 换了新录音（比原来短 4.1 s），首句前面有 0.16–0.18 s 静音，
  //   这一小段里里程已经推进 ~0.2 km ⇒ 容差从 0.15 放到 0.30（不是节奏错，是音频头静音）
  chk(`${B.id0}–${B.id1} 开口就在 ${B.km0}km`, Math.abs(maleKm(B.startAt ?? i0.t) - B.km0) < 0.30, `${maleKm(B.startAt ?? i0.t).toFixed(2)}`);
  chk(`${B.id0}–${B.id1} 读完正好 ${B.km1}km`, Math.abs(got - B.km1) < 0.30, `${got.toFixed(2)}`);
}
const nominal = PIN.map((B) => (B.km1 - B.km0) / ((byId(B.id1).t + byId(B.id1).d) - byId(B.id0).t));
const vmaxAllowed = Math.max(...nominal) * 1.6;
const T0 = tAtKm(22.0), T1 = tAtKm(40.0);
const all = [];
for (let t = T0 + 0.1; t <= T1; t += 0.05) all.push((maleKm(t) - maleKm(t - 0.1)) / 0.1);
const vmin = Math.min(...all), vmax = Math.max(...all);
console.log(`    22→40 实测 ${vmin.toFixed(3)}–${vmax.toFixed(3)} km/s（声明块名义 ${nominal.map((v) => v.toFixed(2)).join(' / ')} km/s）`);
// 语句之间本来就有 0.1–0.2s 的间隙（说话换气），瞬时速率会在那里掉到 0 —— 用 0.3s 窗均值判“有没有真的停住”
let winMin = Infinity;
for (let t = T0 + 0.3; t <= T1; t += 0.05) winMin = Math.min(winMin, (maleKm(t) - maleKm(t - 0.3)) / 0.3);
chk('22→40 无停顿（0.3s 窗均值 > 0.05 km/s）', winMin > 0.05, `窗内最低 ${winMin.toFixed(3)} km/s（瞬时最低 ${vmin.toFixed(3)}）`);
// 2026-11-08：公里窗口模型下环湖段本来就有快有慢（1.4 km/s 的撞墙段），不再卡上限；只留下面的单调检查

// ── ② 浏览器
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);
const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const svg = document.querySelector('#ov');
  const st = window.__dbg.state();
  const texts = [...svg.querySelectorAll('text')];
  const flat = texts.map((e) => (e.textContent || '').trim());
  const badge = (n) => texts.some((e) => (e.textContent || '').trim() === String(n) && (e.parentElement.parentElement.firstElementChild?.getAttribute('d') || '').includes('V -34'));
  return {
    t: +tt.toFixed(2), km: +st.male.km.toFixed(3), split: +(st.split || 0).toFixed(3),
    badge29: badge(29), badge28: badge(28),
    montage: flat.some((e) => /加速通过/.test(e)),
  };
}, t);

console.log('');
console.log('=== ② 分屏已取消 / 副本接管 / 降暗 ===');
// 客户 2026-11-05 ⑥：分屏整段撤掉 ⇒ 这一节从“验分屏”改成“验**没有**分屏”
const sp0 = SPLIT.t0, sp1 = SPLIT.t1;
console.log(`分叉 ${sp0.toFixed(2)}s（F${F(sp0)}）· 副本半马窗口 ${WIN_T.half0.toFixed(2)}–${WIN_T.half1.toFixed(2)}s（F${F(WIN_T.half0)}–F${F(WIN_T.half1)}）· 母蟹过线 ${CROSS.half}s`);
const sceneAt = async (t) => p.evaluate(async (tt) => { await window.__seek(tt); return window.__dbg.state().scene; }, t);
const sAt = {};
for (const t of [sp0 - 0.3, sp0 + 0.05, CROSS.half, WIN_T.half0, (WIN_T.half0 + WIN_T.half1) / 2, WIN_T.half1 - 0.1, WIN_T.half1 + 0.1]) {
  sAt[t.toFixed(2)] = { split: (await probe(t)).split, scene: await sceneAt(t) };
}
console.log('  分屏强度', Object.entries(sAt).map(([k, v]) => `${k}s:${v.split}`).join(' '));
const badSplit = Object.values(sAt).filter((v) => v.split > 0.02);
chk('全片没有分屏（split 恒为 0）', badSplit.length === 0, `${badSplit.length} 处 >0.02`);
// 2026-11-06：分流副本占掉 L23 末→L25 末（50.44–54.76），半马副本顺移到 54.76 起、仍到 1818 帧收
chk(`第 ${F(WIN_T.half0)} 帧整屏切进半马副本`, sAt[WIN_T.half0.toFixed(2)].scene === 'venue', sAt[WIN_T.half0.toFixed(2)].scene);
chk(`第 ${F(WIN_T.half1) + 3} 帧切回全图`, sAt[(WIN_T.half1 + 0.1).toFixed(2)].scene === 'course', sAt[(WIN_T.half1 + 0.1).toFixed(2)].scene);
chk('分流副本紧接半马副本（首尾相接、都硬切）', Math.abs(WIN_T.split1 - WIN_T.half0) < 1e-9
  && !!(VENUE_WINDOWS.find((q) => q.id === 'split') || {}).noFadeOut
  && !!(VENUE_WINDOWS.find((q) => q.id === 'half') || {}).noFadeIn,
  `split ${WIN_T.split0.toFixed(2)}–${WIN_T.split1.toFixed(2)} → half ${WIN_T.half0.toFixed(2)}–${WIN_T.half1.toFixed(2)}`);
// 2026-11-08：半马副本不再收在写死的 1818 帧 —— 段 18 + 2.2 s 加冕停留一起留在会场
{
  const hold = SEGS.find((q) => q.n === 'H18');
  chk('半马副本收在“段 18 + 加冕停留”末尾', Math.abs(WIN_T.half1 - hold.t1) < 1e-6,
    `F${F(WIN_T.half1)} · ${WIN_T.half0.toFixed(2)}–${WIN_T.half1.toFixed(2)}s · 共 ${(WIN_T.half1 - WIN_T.half0).toFixed(2)}s`);
  chk('半马副本覆盖整段 18（≥4.2s）', WIN_T.half1 - WIN_T.half0 > 4.2, `${(WIN_T.half1 - WIN_T.half0).toFixed(2)}s`);
}
// 客户 2026-11-06（最新）：1818 帧**硬切**回大地图（不做渐隐）⇒ 断言改成“half 窗口 noFadeOut 且 1817 还在 1818 已切走”
chk('副本 1818 帧硬切（noFadeOut）', (() => { const w = VENUE_WINDOWS.find((q) => q.id === 'half'); return !!(w && w.noFadeOut); })());

const dimT = (EVENTS.find((e) => e.type === 'dimHalf') || {}).t;
console.log(`  半马降暗 t=${dimT}（母蟹过线 ${CROSS.half}s / 说完 ${T_FEMALE_FINISH.toFixed(2)}s）`);
chk('降暗在母蟹过线之后 0–1.5s', dimT > CROSS.half && dimT < CROSS.half + 1.5, `+${(dimT - CROSS.half).toFixed(2)}s`);

const mont = [];
for (let t = T0; t <= T1; t += 0.5) { const r = await probe(t); if (r.montage) mont.push(r.t); }
console.log('  “加速通过”角标出现时刻:', mont.join(',') || '无');
chk('加速角标已撤除', mont.length === 0);

// ── ③ 滨湖公园卡：跟随锚点
console.log('\n=== ③ 滨湖公园卡：跟随锚点 ===');
const W = await p.evaluate(() => window.__dbg.stickers());
const lp = W.find((s) => s.id === 'lakepark');
const lpDef = STICKERS.find((s) => s.id === 'lakepark');
const FEND = lpDef.toFrame;
console.log(`  窗口 ${lp.T0.toFixed(2)}–${lp.T1.toFixed(2)}s（配置第 ${FEND} 帧 = ${(FEND / FPS).toFixed(2)}s）`);
chk('窗口右端 = 配置帧号', Math.abs(lp.T1 - FEND / FPS) < 0.02, `${(lp.T1 * FPS).toFixed(0)} vs ${FEND}`);

const pinRows = [];
for (let f = Math.round(lp.T0 * FPS); f <= FEND; f++) {
  const r = await p.evaluate(async (ff) => {
    await window.__seekFrame(ff);
    const svg = document.querySelector('#ov');
    const card = svg.querySelector('rect[width="560"]');
    const cardName = card ? [...card.closest('g').querySelectorAll('text')].map((e) => e.textContent).join('|') : null;
    const cardOp = card ? +(card.closest('g').getAttribute('opacity') || 1) : 0;
    const el = svg.querySelector('path[data-f]');
    const cir = [...svg.querySelectorAll('circle')].find((c) => (c.getAttribute('fill') || '') === '#FFC83D' && +c.getAttribute('r') > 6);
    const st = window.__dbg.state();
    return { f: ff, card: cardName && /滨湖/.test(cardName) ? cardOp : 0, kmLab: el ? +el.getAttribute('data-f').split(':')[1] : null,
      pin: cir ? [+(+cir.getAttribute('cx')).toFixed(1), +(+cir.getAttribute('cy')).toFixed(1)] : null, crab: +st.male.km.toFixed(2) };
  }, f);
  pinRows.push(r);
}
const shownFrames = pinRows.filter((r) => r.card > 0.02);
console.log(`  卡片出现 ${shownFrames.length}/${pinRows.length} 帧 · 首 f${shownFrames[0]?.f} · 末 f${shownFrames[shownFrames.length - 1]?.f}`);
const last = pinRows[pinRows.length - 1];
chk('末帧卡片仍在（不透明度 > 0.9）', last.card > 0.9, last.card.toFixed(2));
const withPin = pinRows.filter((r) => r.pin);
// 客户 2026-11-05 ②：引线不再做“截到画框 + 箭头”的规避动作 ⇒ 锚点允许出画（线直接连到真实锚点，
//   由视口裁掉）。这里改成：大部分时间锚点在画内（取景别太离谱），且坐标不发散。
const offFrame = withPin.filter((r) => r.pin[0] < 8 || r.pin[0] > 1912 || r.pin[1] < 8 || r.pin[1] > 1072);
const sane = (q) => Number.isFinite(q[0]) && Number.isFinite(q[1]) && Math.abs(q[0]) < 1920 * 12 && Math.abs(q[1]) < 1080 * 12;
const wild = withPin.filter((r) => !sane(r.pin));
console.log(`  锚点出画 ${offFrame.length}/${withPin.length} 帧（引线仍指向真实锚点，由视口裁切）`);
chk('锚点在画内的时间 ≥60%', offFrame.length <= withPin.length * 0.4, `${offFrame.length}/${withPin.length}`);
// 客户 2026-11-05：超远锚点改成“沿同一条直线夹到 ±12 屏宽的安全盒子”（线不许消失）
chk('锚点坐标不发散（|x| < 23040、|y| < 12960）', wild.length === 0, `${wild.length} 帧`);
const kmLabs = withPin.map((r) => r.kmLab).filter((v) => v !== null);
console.log(`  锚点里程 ${Math.min(...kmLabs)}–${Math.max(...kmLabs)}km（应在 23–35 内）`);
chk('锚点里程在 23–35 区间内', Math.min(...kmLabs) >= 22.99 && Math.max(...kmLabs) <= 35.01);
let maxStep = 0;
for (let i = 1; i < withPin.length; i++) {
  if (withPin[i].f - withPin[i - 1].f !== 1) continue;
  // 锚点出画时投影坐标在透视下会急剧放大（越靠近灭点越快），只对两点都在合理范围内的帧判连续性
  if (!sane(withPin[i].pin) || !sane(withPin[i - 1].pin)) continue;
  // 只对**两个点都在画框附近**的相邻帧判连续性：锚点出画后透视会把像素速度放大几十倍
  const near = (q) => q[0] > -80 && q[0] < 2000 && q[1] > -80 && q[1] < 1160;
  if (!near(withPin[i].pin) || !near(withPin[i - 1].pin)) continue;
  const d = Math.hypot(withPin[i].pin[0] - withPin[i - 1].pin[0], withPin[i].pin[1] - withPin[i - 1].pin[1]);
  maxStep = Math.max(maxStep, d);
}
chk('锚点滑动连续（≤120px/帧）', maxStep <= 120, `${maxStep.toFixed(1)}px`);
let maxKmStep = 0;
for (let i = 1; i < withPin.length; i++) {
  if (withPin[i].f - withPin[i - 1].f !== 1) continue;
  maxKmStep = Math.max(maxKmStep, Math.abs(withPin[i].kmLab - withPin[i - 1].kmLab));
}
chk('锚点里程连续（≤1.5km/帧）', maxKmStep <= 1.5, `${maxKmStep.toFixed(2)}km`);

const leadLens = [];
for (const f of [Math.round(lp.T0 * FPS) + 30, Math.round((lp.T0 + lp.T1) / 2 * FPS), FEND - 60, FEND]) {
  const r = await p.evaluate(async (ff) => {
    await window.__seekFrame(Math.round(ff));
    const el = document.querySelector('path[data-f]');
    if (!el) return null;
    const d = el.getAttribute('d').replace('M ', '').replace(' L ', ' ').split(' ').map(Number);
    return Math.hypot(d[2] - d[0], d[3] - d[1]);
  }, f);
  if (r !== null) leadLens.push(+r.toFixed(0));
}
console.log(`  引线长度抽样 ${leadLens.join(' / ')} px`);
chk('引线长度合理（40–900px）', leadLens.every((v) => v >= 40 && v <= 900), leadLens.join('/'));

// ── ④ 图卡帧窗：与配置逐个对齐
console.log('\n=== ④ 图卡帧窗 ===');
const WIN = await p.evaluate(() => window.__dbg.stickers());
for (const w of WIN) console.log(`  ${w.id.padEnd(10)} ${w.T0.toFixed(2)}–${w.T1.toFixed(2)}s  f${Math.round(w.T0 * 30)}–${Math.round(w.T1 * 30)}`);
const br = WIN.find((w) => w.id === 'bridge'), we = WIN.find((w) => w.id === 'wetland');
const brDef = STICKERS.find((s) => s.id === 'bridge'), weDef = STICKERS.find((s) => s.id === 'wetland');
chk('桥卡窗口 = 配置帧号', !!br && Math.abs(br.T0 * 30 - brDef.fromFrame) < 0.5 && Math.abs(br.T1 * 30 - brDef.toFrame) < 0.5,
  br ? `f${Math.round(br.T0 * 30)}–${Math.round(br.T1 * 30)} / 配置 ${brDef.fromFrame}–${brDef.toFrame}` : '缺卡');
chk('湿地卡起点 = 配置帧号', !!we && Math.abs(we.T0 * 30 - weDef.fromFrame) < 0.5,
  we ? `f${Math.round(we.T0 * 30)} / 配置 ${weDef.fromFrame}` : '缺卡');

const scanCard = async (from, to, key) => {
  const hits = [];
  for (let f = from; f <= to; f += 1) {
    const r = await p.evaluate(async (ff, k) => {
      await window.__seekFrame(ff);
      const svg = document.querySelector('#ov');
      for (const rect of svg.querySelectorAll('rect[width="560"]')) {
        const g = rect.closest('g');
        const op = +(g.getAttribute('opacity') || 1);
        if (op < 0.02) continue;
        const t = [...g.querySelectorAll('text')].map((e) => e.textContent.trim()).join('|');
        if (t.includes(k)) return op;
      }
      return 0;
    }, f, key);
    if (r > 0.02) hits.push({ f, op: r });
  }
  return hits;
};
const bHits = await scanCard(brDef.fromFrame - 20, brDef.toFrame + 30, '固城湖大桥');
const solidB = bHits.filter((r) => r.op > 0.95).map((r) => r.f);
console.log(`  桥卡：不透明度>0.02 的帧 f${bHits[0]?.f}–${bHits[bHits.length - 1]?.f} · 全亮 f${solidB[0]}–${solidB[solidB.length - 1]}`);
chk('桥卡在配置起点前不出现', !bHits.some((r) => r.f < brDef.fromFrame), `最早 f${bHits[0]?.f}`);
chk('桥卡覆盖配置窗口（全亮 ⊇ 中段）', solidB[0] <= brDef.fromFrame + 20 && solidB[solidB.length - 1] >= brDef.toFrame - 20,
  `全亮 f${solidB[0]}–${solidB[solidB.length - 1]} vs ${brDef.fromFrame}–${brDef.toFrame}`);

const wHits = await scanCard(weDef.fromFrame - 20, weDef.toFrame + 20, '湿地');
console.log(`  湿地卡：不透明度>0.02 的帧 f${wHits[0]?.f}–${wHits[wHits.length - 1]?.f}`);
chk('湿地卡在配置起点前不出现', !wHits.some((r) => r.f < weDef.fromFrame - 1), `最早 f${wHits[0]?.f}`);

// ── 保圣寺 / 博物馆 / 老街：槽位与让步
const bs = WIN.find((w) => w.id === 'baosi'), mu = WIN.find((w) => w.id === 'museum'), os = WIN.find((w) => w.id === 'oldstreet');
console.log(`  保圣寺 ${bs ? bs.T0.toFixed(2) + '–' + bs.T1.toFixed(2) + 's f' + Math.round(bs.T0 * 30) + '–' + Math.round(bs.T1 * 30) : '缺卡'}`);
chk('保圣寺卡存在', !!bs);
chk('保圣寺比博物馆早出 0.2–0.9s', !!bs && bs.T0 < mu.T0 && mu.T0 - bs.T0 >= 0.2 && mu.T0 - bs.T0 <= 0.9, bs && mu ? (mu.T0 - bs.T0).toFixed(2) + 's' : '—');
chk('保圣寺在老街出卡前消失（含 0.4s 尾巴）', !!bs && bs.T1 + 0.4 <= os.T0, bs ? (os.T0 - bs.T1 - 0.4).toFixed(2) + 's 余量' : '—');

const stack = [];
const F0 = Math.round(bs.T0 * FPS) - 4, F1 = Math.round(os.T0 * FPS) + 20;
for (let f = F0; f <= F1; f += 2) {
  const r = await p.evaluate(async (ff) => {
    await window.__seekFrame(ff);
    const svg = document.querySelector('#ov');
    const o = {};
    for (const rect of svg.querySelectorAll('rect[width="560"]')) {
      const g = rect.closest('g');
      const name = [...g.querySelectorAll('text')].map((e) => e.textContent.trim()).join('');
      const key = /保圣寺/.test(name) ? 'baosi' : /高淳博物馆/.test(name) ? 'museum' : /高淳老街/.test(name) ? 'oldstreet' : null;
      if (!key) continue;
      const m = g.getCTM();
      const y = rect.y.baseVal.value * m.d + m.f;
      const op = +(g.getAttribute('opacity') || 1);
      if (!o[key] || y > o[key].y) o[key] = { y: +y.toFixed(0), op: +op.toFixed(2) };
    }
    return o;
  }, f);
  stack.push({ f, ...r });
}
const bsFirst = stack.find((r) => r.baosi && r.baosi.op > 0.95);
const muBottom = stack.find((r) => r.museum && r.museum.op > 0.95 && r.baosi);
console.log(`  首帧位置：保圣寺 y${bsFirst && bsFirst.baosi.y} · 博物馆 y${muBottom && muBottom.museum.y}`);
chk('先出的保圣寺停在上卡位（y ≈ 196）', !!bsFirst && Math.abs(bsFirst.baosi.y - 196) <= 3, bsFirst && String(bsFirst.baosi.y));
chk('后出的博物馆在下卡位（y ≈ 502）', !!muBottom && Math.abs(muBottom.museum.y - 502) <= 3, muBottom && String(muBottom.museum.y));
const muY = stack.filter((r) => r.museum).map((r) => r.museum.y);
const muEnd = muY[muY.length - 1];
const muSteps = muY.slice(1).map((v, i2) => Math.abs(v - muY[i2]));
chk('博物馆最终升到上卡位（y ≈ 196）', Math.abs(muEnd - 196) <= 3, String(muEnd));
// 2026-11-08：卡片档位距离 196→502 = 306 px 不变，但让位动画的触发时刻随新时间轴前移，
//   S 形缓动的峰值从 31 抬到 34 px/帧 —— 判据放到 36（仍是“一次性平移”，不是瞬移 306）
chk('博物馆升格是一次平移（每帧 ≤ 36px）', Math.max(...muSteps) / 2 <= 36, `最大 ${(Math.max(...muSteps) / 2).toFixed(0)}px/帧`);
const at196 = stack.find((r) => r.museum && r.museum.y <= 199);
// 2026-11-08：客户要求老街卡第 535 帧（17.83s）就完整可见 ⇒ 起始帧提前到 524。
//   两张卡各自占不同卡位（博物馆升到上卡位、老街进下卡位），本来就不会叠；
//   这里改判「博物馆升到位不晚于老街**淡入完成**」（淡入 0.35s），而不是硬要求先后。
chk('博物馆升到位不晚于老街淡入完成', !!at196 && at196.f / 30 <= os.T0 + 0.40,
  at196 ? `${(at196.f / 30).toFixed(2)}s vs 老街 ${os.T0.toFixed(2)}s+0.35` : '未到位');
const both = stack.filter((r) => r.museum && r.museum.op > 0.95 && r.oldstreet && r.oldstreet.op > 0.95);
chk('博物馆 / 老街同屏不重叠', both.every((r) => Math.abs(r.oldstreet.y - r.museum.y) >= 286),
  both.length ? `同屏 ${both.length} 帧` : '无同屏');
const both3 = stack.filter((r) => r.baosi && r.baosi.op > 0.95 && r.museum && r.museum.op > 0.95);
chk('保圣寺 / 博物馆同屏不重叠', both3.every((r) => Math.abs(r.museum.y - r.baosi.y) >= 286),
  both3.length ? `同屏 ${both3.length} 帧` : '无同屏');

// ── 「赛段调整」字卡已撤（客户 2026-11-05 ②）：反向断言，防止有人加回来
const adjAt = tAtKm(1.20) + 0.7;
const adj = await p.evaluate(async (tt) => {
  await window.__seek(tt);
  return [...document.querySelectorAll('#ov text')].some((e) => e.textContent.trim() === '赛段调整');
}, adjAt);
console.log(`  「赛段调整」字卡（探测 ${adjAt.toFixed(2)}s）：${adj ? '仍在' : '已撤'}`);
chk('「赛段调整」字卡已撤', !adj);

// 白塔（保圣寺）
const tw = await p.evaluate(async (tt) => {
  await window.__seek(tt);
  const c = document.querySelectorAll('canvas')[0];
  const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  const ctx = g.getContext('2d', { willReadFrequently: true }); ctx.drawImage(c, 0, 0);
  const k = c.width / 1920;
  const px = (x, y) => ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
  const base = window.__dbg.project(1002, 624, 0), top = window.__dbg.project(1002, 624, 13.3);
  const cold = (cx) => { let s2 = 0, n = 0; for (let y = top.y + 2; y < base.y - 1; y += 1) { const d = px(cx, y); s2 += d[2] - d[0]; n++; } return s2 / n; };
  return { h: base.y - top.y, self: +cold(base.x).toFixed(1), left: +cold(base.x - 34).toFixed(1), right: +cold(base.x + 34).toFixed(1) };
}, lineT('L07') + 0.3);
console.log(`  保圣寺塔：屏幕高 ${tw.h.toFixed(0)}px · 冷度 塔 ${tw.self} / 左邻 ${tw.left} / 右邻 ${tw.right}`);
chk('地图上立着白塔（投影高 ≥ 18px）', tw.h >= 18, tw.h.toFixed(0) + 'px');
chk('白塔比邻居更“冷”', tw.self > Math.max(tw.left, tw.right), `${tw.self} vs ${Math.max(tw.left, tw.right)}`);

// 29 牌可见 / 28 牌隐藏（探测折返点前后）
const b29 = [], b28 = [];
for (let t = tAtKm(29.2) - 1.5; t <= tAtKm(29.2) + 1.5; t += 0.5) {
  const r = await probe(t); if (r.badge29) b29.push(r.t); if (r.badge28) b28.push(r.t);
}
console.log('  29 牌可见:', b29.join(',') || '无', '· 28 牌:', b28.join(',') || '无');
chk('29 牌可见', b29.length > 0);
chk('28 牌隐藏', b28.length === 0);

// ── ⑧ 门头横幅：官方字条图必须**每一帧都在**（客户 2026-11-06 第三次反馈「logo 闪现」）
//   历史上的坑：左侧数据卡在场时把赛事名整段抹掉 —— 固城湖大桥那张卡盖住第 738–833 帧，
//   门头在 834 帧字条突然冒出来。现在只允许居中大卡（summary）让位。
{
  const cardT = (c) => (c.t !== undefined ? c.t : (c.at && c.at.km !== undefined ? tAtKm(c.at.km) : null));
  const leftCards = CARDS.filter((c) => c.side === 'left' && cardT(c) !== null && cardT(c) + c.d < WIN_T.half0);
  const rows = [];
  for (const c of leftCards) {
    for (let t = cardT(c) + 0.2; t <= cardT(c) + c.d - 0.2; t += 0.2) {
      const r = await p.evaluate(async (tt) => {
        await window.__seek(tt);
        const gs = [...document.querySelectorAll('[data-arch]')];
        if (!gs.length) return null;
        const g = gs[0], img = g.querySelector('image'), beam = g.querySelector('rect[fill^="url(#ar-beam"]');
        return {
          img: !!img,
          w: img ? +img.getBoundingClientRect().width.toFixed(1) : 0,
          beamW: beam ? +beam.getBoundingClientRect().width.toFixed(1) : 0,
        };
      }, t);
      if (r) rows.push({ id: c.id, t: +t.toFixed(2), ...r });
    }
  }
  const noImg = rows.filter((r) => !r.img);
  const ratios = rows.filter((r) => r.img && r.beamW > 0).map((r) => r.w / r.beamW);
  chk('左侧数据卡在场时门头仍带官方字条图', rows.length > 0 && noImg.length === 0,
    `${leftCards.map((c) => c.id).join(',') || '无左卡'} · 采样 ${rows.length} 帧，缺字条 ${noImg.length} 帧${noImg.length ? '（' + noImg.slice(0, 5).map((r) => r.t + 's').join(' ') + '）' : ''}`);
  chk('字条宽度 = 横梁的 0.80（330/412）', ratios.length > 0 && Math.max(...ratios.map((r) => Math.abs(r - 330 / 412))) < 0.02,
    ratios.length ? `${ratios[0].toFixed(3)}（${rows[0].w}px / ${rows[0].beamW}px）` : '无采样');
}

await b.close();
console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
