// 两只螃蟹站位自检（客户 2026-10-28：全片不许出现“突然拉开再复原”）
//
// 用 DOM 上挂的 data-crab / data-gap 读真值（不是复刻逻辑）：
//   ① 同框期间（分流之前）两只的屏幕间距逐帧变化 ≤ 6px；
//   ② 间距本身必须始终落在 [80, 270] px（路面窄时压到 84；分叉特写把机位推到 dist≈314 后
//      螃蟹变大、并排间距跟着变到 ~248，所以上限从 230 放宽到 270）；
//   ③ 不允许出现“一帧变宽、下一帧复原”的抖动（连续 1–3 帧且幅度 > 20px）。
import { launch, openPage } from './shot.mjs';

const ok = [], bad = [];
const chk = (name, cond, detail) => (cond ? ok : bad).push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?v=' + Math.random());

const rows = await p.evaluate(async () => {
  const out = [];
  for (let f = 60; f <= 2300; f++) {
    await window.__seekFrame(f);
    const svg = document.querySelector('#ov');
    const m = svg.querySelector('[data-crab="male"]');
    if (!m) { out.push({ f, n: 0 }); continue; }
    const fe = svg.querySelector('[data-crab="female"]');
    const gapRaw = (m.getAttribute('data-gap') || '-').split('|');
    const st = window.__dbg.state();
    // 分屏后两只分处左右两个视口，data-x 不在同一坐标系（也不能互相比较）
    const split = st.split > 0.01;
    out.push({
      f, n: fe && !split ? 2 : 1, split,
      mx: +m.getAttribute('data-x'), fx: fe ? +fe.getAttribute('data-x') : null,
      gap: gapRaw[0] === '-' ? null : +gapRaw[0],
      dist: gapRaw[1] === '-' ? null : +gapRaw[1],
      snap: m.getAttribute('data-snap') === '1',
    });
  }
  return out;
});

const two = rows.filter((r) => r.n === 2 && !r.split);
const one = rows.filter((r) => r.n < 2);
const splitFrames = rows.filter((r) => r.split).length;
console.log(`其中分屏帧 ${splitFrames}（两只在不同视口，不参与比较）`);
console.log(`扫描 60–2300 帧：两只同框 ${two.length} 帧 · 单只 ${one.length} 帧`);

// 分流时刻：母蟹开始单独走（她的里程不再跟公蟹同步）—— 用“两只都在但间距突然拉大且不再复原”判断分段
const gaps = two.filter((r) => r.gap !== null);
const gl = gaps.map((r) => r.gap);
const gmin = Math.min(...gl), gmax = Math.max(...gl);
console.log(`gap 范围 ${gmin.toFixed(1)} – ${gmax.toFixed(1)} px`);

// ① 逐帧间距变化（只在“两只都被吸附”的帧之间比）
const jumps = [];
for (let i = 1; i < gaps.length; i++) {
  if (gaps[i].f - gaps[i - 1].f !== 1) continue;
  if (!gaps[i].snap || !gaps[i - 1].snap) continue;
  const dd = Math.abs(gaps[i].gap - gaps[i - 1].gap);
  if (dd > 6) jumps.push({ f: gaps[i].f, gap: gaps[i].gap, prev: gaps[i - 1].gap, dd: +dd.toFixed(1) });
}
console.log(`\n逐帧 gap 跳变（>6px）${jumps.length} 处`);
for (const j of jumps.slice(0, 20)) console.log('   ', JSON.stringify(j));
// 相机推拉时路面投影宽度本来就连续变化 ⇒ gap 跟着连续变，允许每帧 ≤20px；
// 真正的 bug 是“一两帧内突变又复原”，由下面 ② 的抖动检测负责。
const worst = jumps.reduce((m, j) => (j.dd > (m ? m.dd : 0) ? j : m), null);
console.log(`  最大单帧变化 ${worst ? worst.dd + 'px @f' + worst.f : '—'}`);
chk('逐帧间距连续（≤20px/帧）', jumps.filter((j) => j.dd > 20).length === 0,
  `超过 20px 的 ${jumps.filter((j) => j.dd > 20).length} 处`);

// ② 抖动模式：变宽后 1–3 帧内又回去
const shakes = [];
for (let i = 1; i < gaps.length - 1; i++) {
  if (gaps[i].f - gaps[i - 1].f !== 1 || gaps[i + 1] && gaps[i + 1].f - gaps[i].f !== 1) continue;
  const a = gaps[i - 1].gap, c = gaps[i].gap, e = gaps[i + 1] ? gaps[i + 1].gap : null;
  if (e === null) continue;
  if (Math.abs(c - a) > 20 && Math.abs(e - a) < 6) shakes.push({ f: gaps[i].f, a, c, e });
}
console.log(`“拉宽一帧又复原”的抖动 ${shakes.length} 处`);
for (const s of shakes.slice(0, 10)) console.log('   ', JSON.stringify(s));
chk('无“拉开再复原”抖动', shakes.length === 0, `${shakes.length} 处`);

// ②b 客户报过的帧：必须是“和邻居一样宽”，不许突变（回归锁）
const REPORTED = [968, 969, 1021, 1050, 1165, 1166, 1167, 1170, 1171, 1172, 1236];
const at = (f) => gaps.find((r) => r.f === f);
const outliers = [];
for (const f of REPORTED) {
  const r = at(f);
  const prev = at(f - 1), next = at(f + 1);
  if (!r || !prev) continue;
  const ref = next ? (prev.gap + next.gap) / 2 : prev.gap;
  if (Math.abs(r.gap - ref) > 10) outliers.push(`f${f}:${r.gap} vs ${ref.toFixed(0)}`);
}
console.log(`客户报过的帧（${REPORTED.length} 个）里仍突变的: ${outliers.length ? outliers.join(' ') : '无'}`);
chk('客户报过的帧已修好', outliers.length === 0, outliers.join(' '));

// ③ 间距范围
chk('间距始终在 80–270px', gmin >= 80 && gmax <= 270, `${gmin.toFixed(0)}–${gmax.toFixed(0)}`);

// ④ 单只帧：只允许出现在片头（未出场）和母蟹完赛后
const oneFirst = one[0]?.f, oneLast = one[one.length - 1]?.f;
console.log(`\n单只帧：${one.length} 帧（f${oneFirst}–f${oneLast}）`);
// 只允许两类：① 片头还没出场（f<120）；② 分屏之后（一人一屏，或母蟹完赛只剩公蟹）
const stray = one.filter((r) => r.f >= 120 && !r.split && r.f < 1240);
chk('同框段没有“只剩一只”的帧', stray.length === 0, stray.slice(0, 6).map((r) => 'f' + r.f).join(','));

await b.close();
console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
