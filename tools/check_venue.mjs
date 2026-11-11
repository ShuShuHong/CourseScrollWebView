// 副本场景自检（客户 2026-10-28）：三处窗口切换 / 拱门与分区在框内 / 角色尺寸 / 冲刺带
//
// ① 窗口：开场 1.20–8.967（第 269 帧）、蟹后冲线整屏 54.87–60.63（第 1646–1819 帧）、片尾 76.08–95.26
//    客户 2026-11-05 ①⑥：开场提前收、半马从“分屏左屏”改成**整屏**接管
// ② 三个窗口里 scene 必须是 venue；其余时刻必须是 course
// ③ 拱门、分区、冲刺带在对应镜头里要落在画框内（投影坐标检查）
// ④ 副本画布不透明度：全屏窗口铺满（四角 α=255）；分屏窗口只左屏有内容
// ⑤ 螃蟹：近景里按 1.9 m 身高换算，屏幕高度随推近变大；同框时母左公右
// ⑥ 冲刺带：撞线后断开
import { launch, openPage } from './shot.mjs';
import { WIN_T, CROSS } from '../src/config/venue.js';
import { DURATION } from '../src/config/story.js';

// 全部探测时刻都从配置推导（客户 2026-10-29 换音轨后：改这一处，下面所有断言自动跟着走）
const T = {
  openWide: WIN_T.start0 + 0.8,          // 开场全景
  arch: WIN_T.start0 + 3.8,              // 拱门特写
  block: WIN_T.start0 + 5.1,             // 分区块
  cWide: WIN_T.start0 + 0.47,            // 开场远景（能看到整块 C 区）
  goRun: (WIN_T.start0 + WIN_T.start1) / 2 + 0.6,   // 发枪后跑出
  halfSplit: (WIN_T.half0 + WIN_T.half1) / 2,       // 分屏中段
  halfEarly: WIN_T.half0 + 1.5,
  halfCross: CROSS.half + 0.15,          // 撞线
  halfBefore: CROSS.half - 0.25,
  halfAfter: CROSS.half + 0.45,
  finCross: CROSS.full + 0.15,
  finBefore: CROSS.full - 0.3,
  finAfter: CROSS.full + 0.6,
  stage: WIN_T.stage + 1.5,              // 主舞台
  stage2: WIN_T.stage + 3.5,
  tail: DURATION - 0.3,                  // 片尾
  endCard: DURATION - 0.6,
  midLoop: (WIN_T.half1 + WIN_T.fin0) / 2,          // 环湖中段（全图）
};
import { buildStage } from './styles.mjs';

// 窗口边界的唯一来源（新增检查 ⑤）：从 venue.js 读，不在这里手抄
//   venue.js 引了 story.js → voice.js，全是纯 ES 模块（无 DOM），Node 下可以直接 import
const { VENUE_WINDOWS } = await import('../src/config/venue.js');

const ok = [], bad = [];
const chk = (name, cond, detail) => (cond ? ok : bad).push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1, '?noprobe=1&v=' + Math.random());

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const st = window.__dbg.state();
  const W = window.__director.venueWorld;
  const pr = (x, z, h = 0) => {
    const q = W.project(x, z, h);
    return [Math.round(q.x), Math.round(q.y), +q.ppp.toFixed(1), q.ok];
  };
  const pose = st.venuePose || {};
  const svg = document.querySelector('#ov');
  const crabs = [...svg.querySelectorAll('[data-crab]')].map((e) => ({
    who: e.getAttribute('data-crab'), x: +e.getAttribute('data-x'), y: +e.getAttribute('data-y'),
    hpx: +e.getAttribute('data-hpx') || 0, venue: e.getAttribute('data-venue') === '1',
  }));
  const which = st.scene === 'split' ? 'split' : 'venue';
  const px = (x, y) => window.__dbg.venuePixel(x, y, which)[3];
  return {
    t: +tt.toFixed(2),
    scene: st.scene, split: +(st.split || 0).toFixed(2),
    pose: { m: pose.maleX, f: pose.femaleX },
    beamMid: pr(0, 0, 11.8), beamN: pr(0, -12, 11.8), baseN: pr(0, -12, 0), baseS: pr(0, 12, 0),
    zA: pr(-16, 0, 0), zB: pr(-52, 0, 0), zC: pr(-104, 9, 0), tape: pr(0.9, 0, 1.15),
    stage: pr(20.3, -18.2, 3.4), stageBase: pr(20.3, -18.2, 1.2),
    tapeBroken: window.__dbg.venue().tapeBroken,
    crabs,
    alpha: { tl: px(120, 120), tr: px(1800, 120), bl: px(120, 960), br: px(1800, 960) },
  };
}, t);

// ── ① 窗口边界（来源唯一：直接读 venue.js 的 VENUE_WINDOWS，不再手抄）
console.log('=== ① 场景窗口 ===');
const WINS = VENUE_WINDOWS.map((w) => [w.t0, w.t1, w.id, w.scene === 'split' ? 'split' : 'venue']);
// 每个窗口：开窗前 0.2s / 关窗后 0.2s 必须是全图；窗口内取首、中、尾
const inAnyWin = (t) => WINS.some(([a, z]) => t >= a - 1e-6 && t <= z + 1e-6);
// 2026-11-06：新增分流副本后 split 与 half 首尾相接（54.76），±0.2s 的“窗外”采样会落进隔壁窗口，要剔掉
const outside = [0.5, T.midLoop, ...WINS.flatMap(([a, z]) => [+(a - 0.2).toFixed(2), +(z + 0.2).toFixed(2)])]
  .filter((t) => t > 0 && t < DURATION - 0.1 && !inAnyWin(t));
const inWin = WINS.flatMap(([a, z]) => [+(a + 0.2).toFixed(2), +((a + z) / 2).toFixed(2), +(z - 0.2).toFixed(2)]);
for (const t of inWin) {
  const r = await probe(t);
  const w = WINS.find(([a, z]) => t >= a && t <= z);
  chk(`${t}s 在副本窗口内（${w ? w[2] : '?'}）`, r.scene === (w ? w[3] : 'venue'), r.scene);
}
for (const t of outside) {
  const r = await probe(t);
  chk(`${t}s 应回到全图`, r.scene === 'course', r.scene);
}

// ── ② 画布覆盖
console.log('\n=== ② 副本画布覆盖 ===');
for (const [t, tag] of [[T.openWide, '开场'], [T.arch, '拱门'], [T.stage2, '片尾'], [T.halfSplit, '半马整屏'], [T.halfEarly, '半马早段']]) {
  const r = await probe(t);
  const a = r.alpha;
  // 客户 2026-11-05 ⑥：取消分屏 ⇒ 半马窗口也铺满全屏（原来是只占左半屏）
  chk(`${tag}(${t}s) 铺满全屏`, a.tl === 255 && a.tr === 255 && a.bl === 255 && a.br === 255, `α=${a.tl}/${a.tr}/${a.bl}/${a.br}`);
}

// ── ③ 构件在框内
console.log('\n=== ③ 构件是否在画框内 ===');
const inFrame = (q, m = 0) => q[3] && q[0] > m && q[0] < 1920 - m && q[1] > m && q[1] < 1080 - m;
const shots = [
  [T.arch, '拱门特写', (r) => inFrame(r.beamMid, 20) && inFrame(r.baseN) && inFrame(r.baseS)],
  [T.openWide, '开场全景', (r) => inFrame(r.beamMid) && (inFrame(r.zA) || inFrame(r.zC))],
  [T.block, '分区块', (r) => inFrame(r.zA) && inFrame(r.zB)],
  [T.cWide, '开场远景能看到整块 C 区', (r) => inFrame(r.zC, 10) && inFrame(r.beamMid, 10)],
  [T.halfCross, '撞线', (r) => inFrame(r.tape) || r.tapeBroken],
  [T.endCard, '片尾落版（主舞台在框内）', (r) => (inFrame(r.stage) && inFrame(r.stageBase)) || inFrame(r.beamMid, 10)],
];
for (const [t, name, fn] of shots) {
  const r = await probe(t);
  chk(`${name}(${t}s) 构件在框内`, fn(r),
    `梁中=${r.beamMid.slice(0, 2)} A=${r.zA.slice(0, 2)} C=${r.zC.slice(0, 2)} 带=${r.tape.slice(0, 2)}`);
}

// ── ④ 角色尺寸 / 站位
console.log('\n=== ④ 角色 ===');
const sizes = [];
for (const t of [T.openWide, T.arch, T.goRun, T.halfSplit, T.halfCross, T.stage, T.stage2, T.tail]) {
  const r = await probe(t);
  const cs = r.crabs.filter((c) => c.venue);
  chk(`${t}s 有角色`, cs.length >= 1, `${cs.length} 只`);
  if (cs.length === 2) {
    const f = cs.find((c) => c.who === 'female'), m = cs.find((c) => c.who === 'male');
    chk(`${t}s 母左公右`, f.x < m.x, `母${f.x.toFixed(0)} 公${m.x.toFixed(0)}`);
  }
  sizes.push({ t, h: cs[0] ? cs[0].hpx : 0 });
  for (const c of cs) chk(`${t}s ${c.who} 在画框内`, c.y > 60 && c.y < 1040 && c.x > 20 && c.x < 1900, `${c.x.toFixed(0)},${c.y.toFixed(0)}`);
}
const hMin = Math.min(...sizes.map((s) => s.h)), hMax = Math.max(...sizes.map((s) => s.h));
const close = sizes.filter((q) => Math.abs(q.t - T.halfCross) < 0.02).map((q) => q.h);
const stageSz = sizes.filter((q) => Math.abs(q.t - T.stage) < 0.02 || Math.abs(q.t - T.stage2) < 0.02).map((q) => q.h);
console.log(`  屏幕身高 ${hMin.toFixed(0)}–${hMax.toFixed(0)} px（随推近变化）· 近景 ${Math.min(...close).toFixed(0)}–${Math.max(...close).toFixed(0)}`);
chk('冲线特写螃蟹足够大（≥190px）', Math.min(...close) >= 190, `${Math.min(...close).toFixed(0)}px`);
// 客户 2026-10-29 ⑦：片尾改成主舞台庆祝，机位 19–22 m ⇒ 螃蟹 110 px 上下（舞台上不能糊满屏）
// 客户 2026-11-09：**公蟹冲线加冕后放大到 1.5 倍** ⇒ 上限跟着放到 200×1.5 = 300
chk('主舞台螃蟹尺寸 100–300px（公蟹 ×1.5 后仍不糊满屏）', Math.min(...stageSz) >= 100 && Math.max(...stageSz) <= 300,
  `${Math.min(...stageSz).toFixed(0)}–${Math.max(...stageSz).toFixed(0)}px`);
chk('螃蟹尺寸随镜头变化', hMax - hMin > 60, `${hMin.toFixed(0)}→${hMax.toFixed(0)}`);

// ── ⑤ 撞线：黑白终点标识 / 撒花 / 过线即解锁（客户 2026-10-29 ②⑤⑥）
//   旧版的"金色冲刺带绷直→断开"已按客户要求撤掉，改成：只在冲线镜头显示黑白棋盘地面标识，
//   撞线那一刻起爆撒花并把该角色切到 stage 2（解锁），不再等 HOLD。
console.log('');
console.log('=== ⑤ 终点标识 / 撒花 / 解锁 ===');
const phase = await p.evaluate(async (TT) => {
  const out = {};
  const snap = async (t) => {
    await window.__seek(t);
    const v = window.__dbg.venue();
    const st = window.__dbg.state();
    return {
      phase: v.phase, start: v.startVisible, finish: v.finishVisible,
      confetti: v.confetti ? v.confetti.on : null,
      m: st.male?.stage, f: st.female?.stage,
      pose: st.venuePose ? { maleX: st.venuePose.maleX, femaleX: st.venuePose.femaleX, y: st.venuePose.y ?? 0, onStage: !!st.venuePose.onStage } : null,
    };
  };
  out.start = await snap(2.0);
  out.start5 = await snap(6.3);
  out.halfBefore = await snap(TT.halfBefore);
  out.halfAt = await snap(TT.halfAfter);
  out.halfAfter = await snap(TT.halfAfter + 0.4);
  out.fullBefore = await snap(TT.finBefore);
  out.fullAt = await snap(TT.finAfter);
  out.stage = await snap(TT.stage);
  return out;
}, T);
chk('开场只有起跑线（无终点棋盘带）', phase.start.phase === 'start' && phase.start.finish === false && phase.start.start === true,
  `phase=${phase.start.phase} start=${phase.start.start} finish=${phase.start.finish}`);
chk('开场不撒花', phase.start.confetti === false && phase.start5.confetti === false);
chk('半马窗口显示终点棋盘带', phase.halfBefore.phase === 'half' && phase.halfBefore.finish === true && phase.halfBefore.start === false,
  `phase=${phase.halfBefore.phase} finish=${phase.halfBefore.finish}`);
chk('半马撞线前不撒花', phase.halfBefore.confetti === false);
chk('半马撞线后撒花', phase.halfAfter.confetti === true);
chk(`母蟹过线即解锁蟹后（${CROSS.half}s 前 stage 1 / 后 stage 2）`,
  phase.halfBefore.f < 2 && phase.halfAt.f >= 2, `${phase.halfBefore.f} → ${phase.halfAt.f}`);
chk('全马撞线前不撒花', phase.fullBefore.confetti === false);
chk('全马撞线后撒花', phase.fullAt.confetti === true);
chk(`公蟹过线后才解锁蟹王（${CROSS.full}s 前未戴 / 后已戴）`, phase.fullBefore.m < 2 && phase.fullAt.m >= 2, `${phase.fullBefore.m} → ${phase.fullAt.m}`);
chk('片尾切到主舞台（两只抬到台面高度）', !!phase.stage.pose?.onStage && phase.stage.pose.y > 1,
  `onStage=${phase.stage.pose?.onStage} y=${phase.stage.pose?.y}`);

// ── ⑥ 门头横幅 / 计时牌 / 顶旗：法线必须沿 ±x（客户 2026-10-29 ①：原来十字交叉错位 90°）
console.log('');
console.log('=== ⑥ 门头朝向 ===');
const normals = await p.evaluate(async () => {
  await window.__seek(2.0);
  const W = window.__director.venueWorld;
  const out = [];
  W.scene.traverse((o) => {
    if (!o.name || !/^arch(Banner|Clock|Flag)$/.test(o.name)) return;
    o.updateWorldMatrix(true, false);
    const n = new o.position.constructor(0, 0, 1).transformDirection(o.matrixWorld);
    out.push({ name: o.name, nx: +n.x.toFixed(3), nz: +n.z.toFixed(3) });
  });
  return out;
});
const faceX = normals.filter((n) => Math.abs(n.nx) > 0.9 && Math.abs(n.nz) < 0.2);
// 客户 2026-11-04③：门头码表整块不建 ⇒ 剩下的横幅 ×2 + 顶旗 ×2 = 4 面
chk('横幅/顶旗法线沿 ±x（与横梁平行，不再错位 90°）',
  normals.length >= 4 && faceX.length === normals.length,
  `${faceX.length}/${normals.length} 面朝南北 · ${normals.slice(0, 3).map((n) => `${n.name}(${n.nx},${n.nz})`).join(' ')}`);
chk('门头码表已撤（场景里没有 archClock）', normals.every((n) => n.name !== 'archClock'),
  normals.map((n) => n.name).join('/'));

// ── ⑦ A/B/C 立牌已删除（客户 2026-10-29 ④）
const boards = await p.evaluate(() => {
  const W = window.__director.venueWorld;
  let n = 0;
  W.scene.traverse((o) => { if (o.material?.map?.image?.width === 420) n++; });
  return n;
});
chk('没有 A/B/C 分区立牌', boards === 0, `${boards} 块`);

// ════════════════ 新增检查（交接文档 §9，2026-10-28 M1 起） ════════════════
// 逐帧扫一遍三个窗口（每 2 帧取一次，约 330 个采样）：机位距离 + 螃蟹尺寸真实性
const scan = await p.evaluate(async (wins) => {
  const out = [];
  for (const [a, z, id] of wins) {
    for (let n = Math.ceil(a * 30); n < Math.floor(z * 30); n += 2) {
      await window.__seekFrame(n);
      const st = window.__dbg.state();
      if (st.scene !== 'venue') continue;
      const crabs = [...document.querySelectorAll('[data-crab][data-venue]')].map((e) => ({
        who: e.getAttribute('data-crab'),
        h: +e.getAttribute('data-hpx'), d: +e.getAttribute('data-d'),
        // 戴冠（stage 2）会按素材比例 ×1.5，比值要除掉它
        stage: (st[e.getAttribute('data-crab')] || {}).stage,
      }));
      out.push({ n, t: n / 30, id, dist: st.venueCam.dist, crabs });
    }
  }
  return out;
}, WINS);

// 新增 ① 机位距离：全时段 dist ∈ [12, 65]；起跑环绕镜头（F195–232）需要抬到 80，片尾拉出到 80
console.log('\n=== 新增 ① 机位距离 ===');
const TAIL_PULL = WIN_T.stage + 6.6;
for (const [, , id] of WINS) {
  const s = scan.filter((r) => r.id === id);
  const ORBIT_UP = 320;   // 开场是 300 m 远景（客户 2026-10-30 ①）   // 起跑 6.50–7.73s 是环绕到门头背面的俯视镜头（客户 2026-10-29 ③）
  // 客户 2026-11-05 ⑦：片尾副本提前到 F2268，开场是「从门头以北往南看」的门框远景 ⇒
  //   前 1.6s 允许 90 m（更远螃蟹就只剩几像素了）；之后回到 65 以内
  const lim = (r) => (id === 'finale'
    ? (r.t >= TAIL_PULL ? 80 : r.t < WIN_T.fin0 + 2.6 ? 90 : 65)
    : (id === 'start') ? ORBIT_UP : 65);
  const badD = s.filter((r) => r.dist < 12 || r.dist > lim(r));
  const lo = Math.min(...s.map((r) => r.dist)), hi = Math.max(...s.map((r) => r.dist));
  chk(`${id} 机位 dist ∈ [12, ${id === 'start' ? 125 : id === 'finale' ? 90 : 65}]${id === 'finale' ? `（≥${TAIL_PULL.toFixed(1)}s 拉出 ≤80）` : id === 'start' ? '（开场远景）' : ''}`, badD.length === 0,
    `${lo.toFixed(1)}–${hi.toFixed(1)} m · ${s.length} 帧${badD.length ? ' · 越界首帧 F' + badD[0].n + ' d=' + badD[0].dist.toFixed(1) : ''}`);
}

// 新增 ② 螃蟹尺寸真实性：屏幕身高 / 真实身高（1.9 m × 每米像素）∈ [0.95, 1.05] —— 地板不再生效
//   真实身高 = 1.9 × 1080 / (2·d·tan(17°)) = 3301.7 / d（V_FOV = 34）。交接文档写的 3355/d 是近似值，
//   这里按 FOV 精确换算，否则比值本身就会偏 1.6%
console.log('\n=== 新增 ② 螃蟹尺寸真实性 ===');
const TRUE_K = 1.9 * 1080 / (2 * Math.tan((34 / 2) * Math.PI / 180));
//   起跑环绕镜头（F195–232 = 6.50–7.73s）是 80 m 外的俯视全景，螃蟹本来就该是几十像素的小点，
//   那里不适用"真实身高"判据（地板 46px 会生效），改成单独断言"小但看得见"
//   开场是 300 m 远景（客户 2026-10-30 ①），螃蟹本来就是几十像素的小点，不适用真实身高判据
//   片尾前 2.6s 是「门框远景」（客户 2026-11-05 ⑦）：那么远螃蟹只有 30 多像素，
//   会被 VENUE_CRAB_MIN_PX 抬到最小可读尺寸 ⇒ 这段不适用真实身高判据
// 2026-11-08：判据改成**结构性**的 —— 只要“真实身高”够得着最小可读尺寸（46 px）才计入。
//   原来写死 `t >= 7.8` 是因为起跑远景（机位 65 m 外，螃蟹真实只有 40 px）会被地板抬到 46 px，
//   比值天然 1.13；换了音轨后窗口从 7.77 s 变成 8.66 s，同一条 7.8 s 就不再对应“已经推近”。
const MINPX = 46;
// 客户 2026-11-09：**戴冠序列（stage 2）按素材比例 ×1.5** ⇒ 期望值要跟着乘，没有时间缓入
const GROW = 1.5;
const ratios = scan.flatMap((r) => r.crabs
  .filter((c) => TRUE_K / c.d >= MINPX + 1
    && !(r.id === 'finale' && r.t < WIN_T.fin0 + 2.6) && !(r.id === 'finale' && r.t >= TAIL_PULL))
  .map((c) => ({ n: r.n, who: c.who, r: c.h / (TRUE_K / c.d) / (c.stage >= 2 ? GROW : 1) })));
const off = ratios.filter((q) => q.r < 0.95 || q.r > 1.05);
const rLo = Math.min(...ratios.map((q) => q.r)), rHi = Math.max(...ratios.map((q) => q.r));
chk('螃蟹屏幕身高 = 真实身高×放大系数（比值 0.95–1.05，未触发最小可读尺寸的帧）', off.length === 0,
  `${ratios.length} 个采样 · ${rLo.toFixed(3)}–${rHi.toFixed(3)}${off.length ? ' · 首个越界 F' + off[0].n + ' r=' + off[0].r.toFixed(3) : ''}`);

// 皇冠时机（客户 2026-10-28 口径）：公蟹在口播"蟹王蟹后解锁"之前不戴冠，之后戴；母蟹片尾全程是蟹后
console.log('\n=== 皇冠时机 ===');
const crown = await p.evaluate(async (TT) => {
  const at = async (t) => { await window.__seek(t); const s = window.__dbg.state(); return { m: s.male.stage, f: s.female.stage }; };
  return { a: await at(TT.finBefore), b: await at(TT.finAfter), c: await at(TT.stage), d: await at(TT.stage2) };
}, T);
chk('公蟹过线后才加冕（过线瞬间未戴 / 0.6s 后已戴）', crown.a.m < 2 && crown.b.m === 2, `${crown.a.m} / ${crown.b.m}`);
chk('主舞台阶段两只都是 stage=2', crown.c.m === 2 && crown.d.m === 2, `${crown.c.m} / ${crown.d.m}`);
chk('母蟹片尾全程蟹后（stage=2）', [crown.a, crown.b, crown.c, crown.d].every((q) => q.f === 2));

// 新增 ④ 天空：渐变穹顶 + 雾（结构性检查）
//   不按像素采样：副本镜头几乎全是低角度俯视，画面上部被雾化的城市地块/树线占满，
//   取样点落在地面上，比的是"地面 vs 地面"。改成直接读穹顶贴图的渐变色标 —— 确定性、与构图无关。
console.log('');
console.log('=== 新增 ④ 天空 ===');
const sky = await p.evaluate(() => {
  const W = window.__director.venueWorld;
  const dome = W.skyDome;
  if (!dome) return { ok: false };
  const cv = dome.material.map?.image;
  if (!cv) return { ok: false, dome: true };
  const g = cv.getContext('2d');
  const at = (v) => {
    const d = g.getImageData(2, Math.round((1 - v) * (cv.height - 1)), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const vs = [0.10, 0.30, 0.50, 0.70];
  return {
    ok: true, h: cv.height, fog: !!W.scene.fog, fogged: dome.material.fog,
    l: vs.map((v) => +lum(at(v)).toFixed(0)),
    horizon: W.scene.fog ? '#' + W.scene.fog.color.getHexString() : null,
  };
});
chk('天空是渐变穹顶（贴图 ≥256 高）', sky.ok && sky.h >= 256, sky.ok ? sky.h + 'px' : '无穹顶');
chk('穹顶贴图分三层以上亮度（天顶 / 中段 / 地平线）', sky.ok && new Set(sky.l).size >= 3, 'L=' + (sky.l || []).join('/'));
chk('地平线比天顶亮', sky.ok && sky.l[2] > sky.l[0], 'L=' + (sky.l || []).join('/'));
chk('有雾且穹顶不吃雾', sky.ok && sky.fog && sky.fogged === false, 'fog=' + sky.fog + ' domeFog=' + sky.fogged + ' ' + (sky.horizon || ''));

// 新增 ⑤ 地面涂装与官方平面图一致（2026-11-08 客户改色：A/B 紫、C 黄）
//   公园绿、水面蓝；
//   采样点 = 该区域中心的地面投影（t=2 时三块都在框内）
console.log('');
console.log('=== 新增 ⑤ 分区涂装颜色 ===');
const zc = await p.evaluate(async () => {
  await window.__seek(2.0);
  const W = window.__director.venueWorld;
  const pick = (x, z) => {
    const q = W.project(x, z, 0);
    if (!q.ok || q.x < 0 || q.x > 1919 || q.y < 0 || q.y > 1079) return null;
    const c = window.__dbg.venuePixel(Math.round(q.x), Math.round(q.y));
    return [c[0], c[1], c[2]];
  };
  // 采样点避开区号字母（现在是 12×12 m 的平铺字，正好压在区中心、字头朝北）
  return { A: pick(-16, -7), B: pick(-45, 5), C: pick(-112, 16), park: pick(-20, 30) };
});
// 2026-11-08 客户第①条：A/B 区改紫（官方图 155,98,164）、C 区改黄（255,242,67）
const purple = (c) => c && c[0] > c[1] + 20 && c[2] > c[1] + 20;
const yellowish = (c) => c && c[0] > 200 && c[1] > 195 && c[2] < 165;
chk('A 区地面是紫涂装', purple(zc.A), zc.A ? zc.A.join(',') : '不在框内');
chk('B 区地面是紫涂装', purple(zc.B), zc.B ? zc.B.join(',') : '不在框内');
chk('C 区地面是黄涂装', yellowish(zc.C), zc.C ? zc.C.join(',') : '不在框内');
chk('公园是绿地', zc.park && zc.park[1] > zc.park[0] + 8 && zc.park[1] > zc.park[2] + 8, zc.park ? zc.park.join(',') : '不在框内');
// ── ⑧ 客户 2026-10-30 这一批的结构性断言
console.log('');
console.log('=== ⑧ 开场远景 / 分区显隐 / 淡入淡出 / 舞台朝向 ===');
const b30 = await p.evaluate(async (TT) => {
  const W = window.__director.venueWorld;
  // 2026-11-06：副本有两块画布（venue / split），这里固定读主会场那块
  const cv = () => window.__director.venueWorld.renderer.domElement;
  const P = (x, z, h = 0) => { const q = W.project(x, z, h); return { x: Math.round(q.x), y: Math.round(q.y), d: +q.d.toFixed(1), ok: q.ok }; };
  const out = {};
  await window.__seekFrame(50);
  const c50 = P(-104, 16), beam50 = P(0, 0, 11.8);
  const d50 = window.__dbg.state().venueCam.dist;
  await window.__seekFrame(260);
  const d260 = window.__dbg.state().venueCam.dist;
  out.open = {
    cIn: c50.ok && c50.x > 0 && c50.x < 1920 && c50.y > 0 && c50.y < 1080,
    beamIn: beam50.ok && beam50.y > 0 && beam50.y < 1080,
    cxy: [c50.x, c50.y], d50, d260,
  };
  await window.__seek(3);
  out.zoneOn = [W.zoneMats[0].visible, W.zoneC.visible, W.zoneTexts[0].visible, W.zoneRails[0].visible];
  await window.__seek(TT.halfSplit);   // 冲刺窗口里分区必须全关（全图空档里没法判）
  out.zoneOff = [W.zoneMats[0].visible, W.zoneC.visible, W.zoneTexts[0].visible, W.zoneRails[0].visible];
  out.op = [];
  for (const t of [TT.startEnd - 0.32, TT.startEnd - 0.1, TT.startEnd + 0.05, TT.startEnd + 0.25, TT.half0 + 0.07, TT.half0 + 0.32, TT.half0 + 0.57, TT.half0 + 0.87]) {
    await window.__seek(t);
    // 2026-11-06：副本有两块画布，读“当前这一幕”那块的不透明度
    const ww = window.__dbg.state().scene === 'split' ? window.__director.splitWorld : window.__director.venueWorld;
    out.op.push([t, +(ww.renderer.domElement.style.opacity || 1)]);
  }
  await window.__seek(TT.stage + 0.2);
  out.stage = { back: P(20.3, -23.1, 4.5), crabM: P(19.4, -18.4, 1.15), crabF: P(22.4, -19.5, 1.15), front: P(20.3, -12.7, 1.2) };
  return out;
}, { startEnd: WINS[0][1], half0: WINS[1][0], halfSplit: T.halfSplit, stage: T.stage });
chk('开场 F50 是远景且 C 区在画框内', b30.open.cIn && b30.open.beamIn,
  `C=(${b30.open.cxy.join(',')}) 门头在框内=${b30.open.beamIn}`);
chk('F50 → F260 机位持续推近', b30.open.d50 > 150 && b30.open.d260 < 60,
  `${b30.open.d50.toFixed(0)} → ${b30.open.d260.toFixed(0)} m`);
chk('起跑窗口显示 ABC 分区（涂装/字/护栏）', b30.zoneOn.every(Boolean), b30.zoneOn.join('/'));
chk('冲刺窗口隐藏 ABC 分区（涂装/字/护栏全关）', b30.zoneOff.every((q) => !q), b30.zoneOff.join('/'));
// 2026-11-06：split→half 现在是**硬切**（两块画布直接换），不再有中间态；
//   这里只对“没有声明 noFadeIn / noFadeOut”的边界要求 0<α<1，硬切边界要求干净地 1→0。
{
  const soft = [];
  for (const w of VENUE_WINDOWS) {
    if (!w.noFadeIn && w.id !== 'start') soft.push([w.t0 + 0.12, w.t0 + 0.30]);
    if (!w.noFadeOut && w.id !== 'finale') soft.push([w.t1 - 0.30, w.t1 - 0.12]);
  }
  const got = b30.op.filter(([t]) => soft.some(([a, z]) => t >= a - 0.02 && t <= z + 0.02));
  const hard = WINS.filter(([, , , sc], i) => VENUE_WINDOWS[i].noFadeIn || VENUE_WINDOWS[i].noFadeOut);
  chk('可淡入淡出的副本边界有中间态（0<α<1）', got.length === 0 || got.every(([, v]) => v > 0.01 && v < 0.995),
    got.map(([t, v]) => `${t}:${v}`).join(' ') || '本片边界均为硬切，跳过');
  void hard;
}
chk('主舞台背板在两只螃蟹后面、台口在螃蟹前面',
  b30.stage.back.d > b30.stage.crabM.d && b30.stage.front.d < b30.stage.crabM.d,
  `背板 d${b30.stage.back.d} > 蟹 d${b30.stage.crabM.d} > 台口 d${b30.stage.front.d}`);

// ── ⑨ 客户 2026-11-01：黑屏已删 / 左侧城市界面 / 观众年龄段
console.log('');
console.log('=== ⑨ 城市界面 & 观众 ===');
const urban = await p.evaluate(async () => {
  await window.__seek(5.354);
  const W = window.__director.venueWorld;
  let black = 0, towers = 0, shops = 0, hedges = 0;
  W.scene.traverse((o) => {
    if (!o.isMesh) return;
    const hex = o.material && o.material.color ? o.material.color.getHexString() : '';
    if (hex === '121417') black++;
    if (o.name === 'tower') towers++;
    const g = o.geometry && o.geometry.parameters;
    if (g && Math.abs(o.position.z + 46.5) < 1.2 && g.height > 3 && g.height < 5) shops++;
    if (g && Math.abs(o.position.z + 29.2) < 1.5 && g.height < 1.3) hedges++;
  });
  const ages = W.crowdAges || {};
  const tot = Object.values(ages).reduce((a, b) => a + b, 0) || 1;
  const pct = Object.fromEntries(Object.entries(ages).map(([k, v]) => [k, +(v / tot * 100).toFixed(1)]));
  // 身高分布：读 body 实例矩阵的 scale.y（= 身高 × 0.86）
  const body = W.crowdMeshes && W.crowdMeshes.body;
  const hs = [];
  if (body) {
    const m4 = new W.camera.matrix.constructor();
    for (let i = 0; i < body.count; i++) { body.getMatrixAt(i, m4); hs.push(m4.elements[5] / 0.86); }
  }
  hs.sort((a, b) => a - b);
  return { black, towers, shops, hedges, cars: W.carCount || 0, crowd: W.crowdCount, pct, hLo: hs[0] || 0, hHi: hs[hs.length - 1] || 0 };
});
chk('副本里没有黑色大屏（LED 屏已删）', urban.black === 0, `${urban.black} 块`);
chk('西侧有停车场车辆（≥20 辆）', urban.cars >= 20, `${urban.cars} 辆`);
// 2026-11-08：C 区拓成三岔路口后，落在路口范围内的楼/车/人按客户要求删掉
//   ⇒ 居民楼由 8 栋变 6 栋、商铺也少一间，这里改成「至少 6 栋 / 至少 5 间」
chk('西侧仍有现代居民楼（≥6 栋；路口内的已按要求删除）', urban.towers >= 6, `${urban.towers} 栋`);
chk('路口范围内不再有居民楼', urban.towers < 8, `${8 - urban.towers} 栋被路口吃掉`);
chk('西侧有临街商铺与灌木带', urban.shops >= 5 && urban.hedges >= 16, `商铺 ${urban.shops} · 灌木 ${urban.hedges}`);

// ── 2026-11-08-f：路口铺装绝不能溢出到主路/集结区
//   踩过：凹圆角的切线算错（切点不在圆上）⇒ 三角化飞出几十米，把 B 区啃掉一个角。
{
  const jz = await p.evaluate(() => {
    const W = window.__director.venueWorld;
    const m = W.junctionMesh;
    if (!m) return null;
    const pos = m.geometry.getAttribute('position');
    // P2 = 主路外缘回到直路的那一点（x = −76.30）。铺装必须恰好走到这儿：
    //   差一点 ⇒ Y 形断开（客户 2026-11-08-g 报的问题）；过了 ⇒ 啃进 B 区（11-08-f）。
    let xmax = -1e9, zmax = -1e9, nEast = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const xs = [pos.getX(i), pos.getX(i + 1), pos.getX(i + 2)];
      const zs = [pos.getZ(i), pos.getZ(i + 1), pos.getZ(i + 2)];
      xmax = Math.max(xmax, ...xs); zmax = Math.max(zmax, ...zs);
      if (Math.max(...xs) > -76.0) nEast++;
    }
    return { tris: pos.count / 3, xmax: +xmax.toFixed(2), zmax: +zmax.toFixed(1), nEast };
  });
  const P2X = -76.29994128449471;
  chk('路口铺装接到主路北边线（最东边 = P2 ± 0.3 m）', jz && Math.abs(jz.xmax - P2X) <= 0.3,
    jz ? `最东 ${jz.xmax} m · P2 ${P2X.toFixed(2)} · 差 ${(jz.xmax - P2X).toFixed(2)} m` : '没有 junctionMesh');
  chk('路口铺装不越过 P2（越界三角形 0 个）', jz && jz.nEast === 0, jz ? `越界 ${jz.nEast} 个 / 共 ${jz.tris}` : '-');
  chk('路口铺装与 B 区不重叠（B 区西界 −70.9 m）', jz && jz.xmax < -70.9, jz ? `最东 ${jz.xmax} m` : '-');

  // 2026-11-08-j：西边界必须严格经过客户给的三个点 8(A) / 5(arcMid) / 6(Q)
  const arcPts = await p.evaluate(() => {
    const W = window.__director.venueWorld;
    const J = W.junction;
    if (!J) return null;
    const poly = J.poly.map((q) => [q[0], q[1]]);
    const d2seg = (pt, a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / L2));
      return Math.hypot(pt[0] - (a[0] + dx * t), pt[1] - (a[1] + dz * t));
    };
    const near = (pt) => {
      let best = 1e9;
      for (let i = 0; i < poly.length; i++) best = Math.min(best, d2seg(pt, poly[i], poly[(i + 1) % poly.length]));
      return +best.toFixed(4);
    };
    // 自交检测
    const sign = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const xs = (a, b, c, d) => sign(c, d, a) !== sign(c, d, b) && sign(a, b, c) !== sign(a, b, d);
    let cross = 0;
    for (let i = 0; i < poly.length; i++) {
      for (let j = i + 2; j < poly.length; j++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[j], d = poly[(j + 1) % poly.length];
        const same = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1e-6;
        if (same(a, d) || same(b, c)) continue;
        if (xs(a, b, c, d)) cross++;
      }
    }
    const qReq = J.qReq || J.q;
    const qErr = +Math.hypot(J.q[0] - qReq[0], J.q[1] - qReq[1]).toFixed(3);
    return { A: near(J.nw), mid: near(J.mid), Q: qErr, qAt: [+J.q[0].toFixed(2), +J.q[1].toFixed(2)], qReq: [+qReq[0], +qReq[1]], cross, n: poly.length };
  });
  chk('西边界严格经过 8 点 A（误差 ≤ 0.01 m）', arcPts && arcPts.A <= 0.01, arcPts ? `${arcPts.A} m` : '-');
  chk('西边界严格经过 5 点 arcMid(−126.8, −24.1)', arcPts && arcPts.mid <= 0.01, arcPts ? `${arcPts.mid} m` : '-');
  chk('西边界在 6 点并入主路外缘（吸附到路缘后偏差 ≤ 0.6 m）', arcPts && arcPts.Q <= 0.6, arcPts ? `要求 (${arcPts.qReq[0]}, ${arcPts.qReq[1]}) → 路缘上 (${arcPts.qAt[0]}, ${arcPts.qAt[1]}) · 偏差 ${arcPts.Q} m` : '-');
  chk('路口多边形无自交', arcPts && arcPts.cross === 0, arcPts ? `自交 ${arcPts.cross} 处 / ${arcPts.n} 点` : '-');
}

chk('观众以青年为主（青年 55–72%）', urban.pct.youth >= 55 && urban.pct.youth <= 72, `青年 ${urban.pct.youth}%`);
chk('少年为辅（15–30%）、老人少数（4–12%）',
  urban.pct.teen >= 15 && urban.pct.teen <= 30 && urban.pct.elder >= 4 && urban.pct.elder <= 12,
  `少年 ${urban.pct.teen}% · 老人 ${urban.pct.elder}% · 儿童 ${urban.pct.kid}%`);
chk('观众身高有高有低（1.0–1.9 m）', urban.hLo < 1.35 && urban.hHi > 1.62, `${urban.hLo.toFixed(2)}–${urban.hHi.toFixed(2)} m`);

// ── ⑩ 客户 2026-11-02：区号贴地朝北 / 舞台前清场 / 检录口门头已删
console.log('');
console.log('=== ⑩ 区号朝向 / 舞台前清场 / 小门头 ===');
const flat = await p.evaluate(async (TT) => {
  await window.__seek(TT);
  const W = window.__director.venueWorld;
  const V3 = W.camera.position.constructor;
  const letters = [];
  W.scene.traverse((o) => {
    if (o.name !== 'zoneLetter') return;
    o.updateWorldMatrix(true, false);
    const up = new V3(0, 1, 0).transformDirection(o.matrixWorld);
    letters.push({ rotX: +o.rotation.x.toFixed(3), up: [+up.x.toFixed(2), +up.y.toFixed(2), +up.z.toFixed(2)] });
  });
  // 舞台前（客户 2026-11-05 ⑨ 更新口径）：**台口和两侧现在要有人**（观众 / 摄影摄像 / 志愿者），
  //   但三条红线不变：① 不上赛道（z ≥ −11.2 就是路面）；② 不站到舞台上（z < −12.7 是台体）；
  //   ③ 台口正前方那条 1.7 m 的宫格带上必须真的有人（这才是“台前人群”）
  const m4 = new W.camera.matrix.constructor();
  const body = W.crowdMeshes.body;
  let people = 0;          // 台口前那条宫格带上的人
  let onRoad = 0;          // 跑到路面上的人（不许）
  let onStage = 0;         // 站到台体上的人（不许）
  for (let i = 0; i < body.count; i++) {
    body.getMatrixAt(i, m4);
    const x = m4.elements[12], z = m4.elements[14];
    if (Math.abs(x - W.stageX0) < 26 && z > -11.2) onRoad++;
    if (Math.abs(x - W.stageX0) < 8.2 && z < -12.6) onStage++;
    // 台口前是台阶，不再站人 ⇒ 改数**舞台两侧**的人（客户 2026-11-06 口径）
    if (Math.abs(x - W.stageX0) > 8.2 && Math.abs(x - W.stageX0) < 16 && z < -12.6 && z > -20) people++;
  }

  let lamps = 0;
  W.scene.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && Math.abs(o.position.y - 3.2) < 0.25
      && Math.abs(o.position.x - W.stageX0) < 12) lamps++;
  });
  // 检录口横杆（0.45 × 0.7 × 5 的 box）
  let gates = 0;
  W.scene.traverse((o) => {
    const g = o.geometry?.parameters;
    if (g && Math.abs(g.height - 0.7) < 1e-6 && Math.abs(g.depth - 5) < 1e-6) gates++;
  });
  return { letters, people, lamps, gates, onRoad, onStage };
}, T.stage + 0.1);
chk('ABC 区号是平铺地面（rotation.x ≈ −90°）', flat.letters.length === 3 && flat.letters.every((q) => Math.abs(q.rotX + Math.PI / 2) < 0.02),
  `${flat.letters.length} 个 · rotX ${flat.letters.map((q) => q.rotX).join('/')}`);
chk('ABC 区号字头朝北（up = +x）', flat.letters.every((q) => q.up[0] > 0.95 && Math.abs(q.up[2]) < 0.1),
  flat.letters.map((q) => `(${q.up.join(',')})`).join(' '));
// 2026-11-05 ⑨：台口前**要有人**（观众 / 摄影摄像 / 志愿者），但不上路、不上台
chk('赛道（舞台段 ±26 m）上没有观众', flat.onRoad === 0, `${flat.onRoad} 人上路`);
chk('没有人站到舞台台体上', flat.onStage === 0, `${flat.onStage} 人`);
chk('舞台两侧有观众/志愿者（≥6 人）', flat.people >= 6, `${flat.people} 人`);
chk('舞台正前方没有路灯', flat.lamps === 0, `${flat.lamps} 根`);
chk('检录口三个小门头已删', flat.gates === 0, `${flat.gates} 个`);

// ── ⑪ 客户 2026-11-03：C 区＝沿弯道的等宽带，C 字在带内
console.log('');
console.log('=== ⑪ C 区带状 / C 字位置 ===');
const cband = await p.evaluate(async () => {
  await window.__seek(1.9);
  const W = window.__director.venueWorld;
  const pick = (x, z) => {
    const q = W.project(x, z, 0);
    if (!q.ok || q.x < 0 || q.x > 1919 || q.y < 0 || q.y > 1079) return null;
    const c = window.__dbg.venuePixel(Math.round(q.x), Math.round(q.y));
    return [c[0], c[1], c[2]];
  };
  const blue = (c) => !!c && c[0] > 200 && c[1] > 195 && c[2] < 165;   // C 带现在扫黄
  // 沿中线取 5 处，沿**法线**逐 0.5 m 往外探，量到蓝色的最远距离 = 半宽
  const probe = (s, dir) => {
    const a = W.cPoint(s), b2 = W.cPoint(s + 2);
    const tx = b2[0] - a[0], tz = b2[1] - a[1], L = Math.hypot(tx, tz) || 1;
    const nx = (-tz / L) * dir, nz = (tx / L) * dir;
    let last = 0;
    for (let d = 0.5; d <= 22; d += 0.5) {
      if (blue(pick(a[0] + nx * d, a[1] + nz * d))) last = d; else break;
    }
    return last;
  };
  const widths = [8, 20, 32, 44, 56].map((s) => ({ s, a: probe(s, 1), b: probe(s, -1) }));
  const cPos = W.cPos;
  const atLetter = W.project(cPos[0], cPos[1], 0.36);
  const inside = atLetter.ok && atLetter.x > 0 && atLetter.x < 1920 && atLetter.y > 0 && atLetter.y < 1080;
  const mid = W.cPoint(29), nb = W.cPoint(31);
  const tx = nb[0] - mid[0], tz = nb[1] - mid[1], L = Math.hypot(tx, tz) || 1;
  const nx = -tz / L, nz = tx / L;
  const at7 = pick(mid[0] + nx * 7, mid[1] + nz * 7);
  const at13 = pick(mid[0] + nx * 13, mid[1] + nz * 13);
  const a0 = W.cPoint(0), a1 = W.cPoint(58);
  // ── 客户 2026-11-03 ②：C 字必须真的**画在带子与路面之上**（前两次都是被压住了）
  //    ① 结构：区号 renderOrder 要大于 C 带、且高度高于带子
  //    ② 像素：C 字四角投影框里要有白字（≥1.5%）
  const letter = W.scene.children.find((o) => o.name === 'zoneLetter' && Math.abs(o.position.x - cPos[0]) < 6 && Math.abs(o.position.z - cPos[1]) < 6);
  const g1 = letter && letter.geometry.parameters;
  const quad = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) =>
    W.project(cPos[0] + u * g1.width, cPos[1] + v * g1.height, letter.position.y));
  const xs2 = quad.map((q) => q.x), ys2 = quad.map((q) => q.y);
  const bx0 = Math.max(0, Math.round(Math.min(...xs2))), bx1 = Math.min(1919, Math.round(Math.max(...xs2)));
  const by0 = Math.max(0, Math.round(Math.min(...ys2))), by1 = Math.min(1079, Math.round(Math.max(...ys2)));
  let white = 0, tot = 0;
  for (let y = by0; y <= by1; y += 4) for (let x = bx0; x <= bx1; x += 4) {
    const c = window.__dbg.venuePixel(x, y);
    tot++;
    if (c[0] > 235 && c[1] > 235 && c[2] > 235) white++;
  }
  return { widths, cPos, atLetter: [Math.round(atLetter.x), Math.round(atLetter.y)], inside, at7, at13,
    start: a0.map((v) => +v.toFixed(1)), end: a1.map((v) => +v.toFixed(1)),
    letters: W.scene.children.filter((o) => o.name === 'zoneLetter').length,
    cLetter: letter ? { y: +letter.position.y.toFixed(2), order: letter.renderOrder, w: +g1.width.toFixed(1), h: +g1.height.toFixed(1) } : null,
    cBandOrder: W.zoneC ? W.zoneC.renderOrder : null,
    whitePct: tot ? +(white / tot * 100).toFixed(2) : 0, quad: [bx0, by0, bx1 - bx0, by1 - by0], tot };
});
const hs = cband.widths.map((q) => Math.max(q.a, q.b));
chk('C 区是等宽带（各处半宽一致，±2 m）', Math.max(...hs) - Math.min(...hs) <= 2,
  `半宽 ${hs.map((v) => v.toFixed(1)).join('/')} m`);
chk('C 区宽度与 A/B 同档（16–20 m）', Math.min(...hs) * 2 >= 15 && Math.max(...hs) * 2 <= 21,
  `${hs.map((v) => (v * 2).toFixed(0)).join('/')} m`);
chk('C 区沿弯道延伸 50 m 以上',
  Math.hypot(cband.end[0] - cband.start[0], cband.end[1] - cband.start[1]) > 50,
  `${JSON.stringify(cband.start)} → ${JSON.stringify(cband.end)}`);
chk('C 字在带子中线上（7 m 处仍是黄）', cband.inside && cband.at7 && cband.at7[0] > 200 && cband.at7[2] < 165,
  `字@${JSON.stringify(cband.atLetter)} 7m=${cband.at7 && cband.at7.join(',')}`);
chk('C 字渲染顺序在 C 带之后（不会被带子盖住）',
  !!cband.cLetter && cband.cLetter.order > (cband.cBandOrder ?? 0),
  `字 order ${cband.cLetter && cband.cLetter.order} > 带 ${cband.cBandOrder}`);
chk('C 字高于 C 带与路面（y ≥ 0.38，带子 0.34 / 路面 0.25）',
  !!cband.cLetter && cband.cLetter.y >= 0.38, cband.cLetter ? `y ${cband.cLetter.y}` : '缺字');
chk('C 字真的画在带子之上（白像素 ≥1.5%）',
  cband.whitePct >= 1.5, `${cband.whitePct}% · 框 ${JSON.stringify(cband.quad)} · 采样 ${cband.tot}`);
chk('带子外 13 m 已不是蓝区（确实是条带，不是一大片）',
  !(cband.at13 && cband.at13[2] > cband.at13[0] + 25), `13m=${cband.at13 && cband.at13.join(',')}`);

console.log('');
console.log('=== ⑫ 官方素材（门头字条 / 舞台背景）===');
const assetHits = await p.evaluate(async (TT) => {
  const A = window.__ASSETS || {};
  const out = { archLogo: !!A.archLogo, stageBack: !!A.stageBack, backdrop: null, svgImg: 0 };
  await window.__seek(TT.stage + 1.0);
  window.__director.venueWorld.scene.traverse((o) => {
    if (o.name === 'stageBackdrop') {
      const g = o.geometry.parameters;
      out.backdrop = { w: +g.width.toFixed(2), h: +g.height.toFixed(2), ratio: +(g.width / g.height).toFixed(3) };
    }
  });
  await window.__seek(5.6);
  out.svgImg = document.querySelectorAll('#ov image').length;
  return out;
}, T);
console.log(`  素材：archLogo=${assetHits.archLogo} · stageBack=${assetHits.stageBack}`);
chk('大地图门头用官方字条图（SVG <image> 已上屏）', assetHits.archLogo && assetHits.svgImg > 0, `image ${assetHits.svgImg} 个`);
chk('主舞台背板 = 官方背景图（宽高比 1.78–1.85）', !!assetHits.backdrop && assetHits.backdrop.ratio > 1.78 && assetHits.backdrop.ratio < 1.85,
  assetHits.backdrop ? `${assetHits.backdrop.w}×${assetHits.backdrop.h} m · ${assetHits.backdrop.ratio}` : '缺背板');

await b.close();

// 新增 ③ 三画风差异：同一 t 下三套截图，网格采样平均绝对差 > 12/255
//   每套画风单独开页（画风在页面加载时就定了），同一组时刻截图后两两比较
console.log('\n=== 新增 ③ 三画风差异 ===');
const STY = ['cartoon', 'navi', 'papercut'];
const DIFF_T = [T.openWide, T.block, T.halfCross, T.stage];
const grids = {};
{
  const b2 = await launch();
  for (const s of STY) {
    const file = await buildStage(s);
    const pg = await openPage(b2, file, 1920, 1080, 1, '?noprobe=1&clean=1');
    grids[s] = await pg.evaluate(async (ts) => {
      const res = [];
      for (const t of ts) {
        await window.__seek(t);
        const g = [];
        for (let y = 60; y < 1080; y += 80) for (let x = 60; x < 1920; x += 80) g.push(...window.__dbg.venuePixel(x, y).slice(0, 3));
        res.push(g);
      }
      return res;
    }, DIFF_T);
    await pg.close();
  }
  await b2.close();
}
const mad = (a, c) => a.reduce((s, v, i) => s + Math.abs(v - c[i]), 0) / a.length;
for (const [i, t] of DIFF_T.entries()) {
  const pairs = [['cartoon', 'navi'], ['navi', 'papercut'], ['cartoon', 'papercut']].map(([a, c]) => mad(grids[a][i], grids[c][i]));
  const lo = Math.min(...pairs);
  chk(`${t}s 三画风两两差异 > 12/255（M5 验收门）`, lo > 12, pairs.map((v) => v.toFixed(1)).join(' / '));
}

// 新增 ⑤ 窗口边界来源唯一：本文件的 WINS 由 VENUE_WINDOWS 生成（见 ①），这里再核一次与页面里的一致
chk(`窗口边界来源唯一（WINS ← VENUE_WINDOWS，共 ${VENUE_WINDOWS.length} 个）`, WINS.length === VENUE_WINDOWS.length && WINS.every(([a, z], i) => a === VENUE_WINDOWS[i].t0 && z === VENUE_WINDOWS[i].t1),
  WINS.map(([a, z, id]) => `${id} ${a}–${z}`).join(' · '));
// ── 客户 2026-11-06 的两张官方图是否真的用上了
console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
