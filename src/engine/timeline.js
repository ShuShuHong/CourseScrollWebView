// 时间轴求值：state(t) 是 t 的纯函数（逐帧渲染可任意跳帧、可复现）
import * as S from '../config/story.js';
import { pchip, linearCurve, inverse } from './math.js';
import { FULL, HALF, HALF_OFF, fullToHalf, halfToFull, COURSE } from './course.js';

export const FPS = S.FPS;
export const DURATION = S.DURATION;
export const AUDIO_OFFSET = S.AUDIO_OFFSET;
export const AUDIO_DUR = S.AUDIO_DUR;
// 公蟹里程用**分段线性**（= 排程的公里窗口模型本身）：
//   pchip 会把每个锚点的斜率抹平，段末就是一次“收脚”，分流前那段最明显（客户 2026-11-09）。
const maleKm = linearCurve(S.MALE_KM);
export const tOfMaleKm = (km) => inverse(maleKm, 0, S.DURATION, km);
/** 把 {t} / {at:{km}} 统一换成秒 */
export const resolveT = (e) => (e.t !== undefined ? e.t : tOfMaleKm(e.at.km));

const T_SPLIT = S.FEMALE_AFTER_SPLIT[0][0];
/** 客户 2026-11-09：她一直跟公蟹跑到**切进分流副本**才分线（原来在 T_SPLIT 就切，
 *  FEMALE_AFTER_SPLIT 首点写死 20.435 ⇒ F1700 一帧往前跳 0.63 km） */
const T_SPLIT_CUT = S.T_SPLIT_CUT ?? S.FEMALE_AFTER_SPLIT[1][0];
const femaleAfter = (() => {
  // null = “此刻与公蟹共线”⇒ 按**该点自己的时刻**取 fullToHalf(maleKm(t))，
  //   否则第二个 null 会被算成 T_SPLIT 时刻的值，切场景那一刻倒扣 0.28 km
  const pts = S.FEMALE_AFTER_SPLIT.map(([t, k]) => [t, k === null ? fullToHalf(maleKm(t)) : k]);
  return pchip(pts);
})();
function femaleKm(t) {
  if (t <= T_SPLIT_CUT) return fullToHalf(maleKm(t));
  return femaleAfter(t);
}

/** 半马里程 → 秒（分流前与公蟹同线，用 halfToFull 反查；分流后查母蟹自己的曲线） */
export function tOfFemaleKm(h) {
  const viaMale = tOfMaleKm(halfToFull(h));
  if (viaMale <= T_SPLIT_CUT + 1e-6) return viaMale;
  return inverse(femaleAfter, T_SPLIT, S.DURATION, h);
}

/** 项目点到达时间：两只螃蟹各一条（tMale / tFemale），分镜表与旁白核对都用它 */
export const POINT_TIMES = (S.POINTS || []).map((p) => {
  const tM = p.full !== null && p.full !== undefined ? +tOfMaleKm(p.full).toFixed(2) : null;
  let tF = p.half !== null && p.half !== undefined ? +tOfFemaleKm(p.half).toFixed(2) : null;
  // 分流点：两只螃蟹此刻还在同一条路上，必须同一时刻（half↔full 换算有 30m 级的取整误差）
  if (p.kind === 'split') tF = tM;
  return { ...p, tMale: tM, tFemale: tF };
});

const CRAB_STEPS = S.CRAB_STATE.map((e) => ({ ...e, T: resolveT(e) })).sort((a, b) => a.T - b.T);
const HP_STEPS = S.HP.map((e) => ({ ...e, T: resolveT(e) })).sort((a, b) => a.T - b.T);
const EVENTS = S.EVENTS.map((e) => ({ ...e, T: resolveT(e) }));
const STICKERS = S.STICKERS.map((s) => {
  // 显式时间窗：fromLine 开口 → toLine 说完／公蟹跑到 toKm／**第 toFrame 帧**
  // （toFrame 是给客户按帧说话的场合用的：第 n 帧 = n/30 秒）
  if (s.fromLine && s.toLine) return { ...s, T0: S.lineT(s.fromLine), T1: S.lineEnd(s.toLine) };
  // 纯帧窗（客户 2026-10-28：按帧说话的场合）：第 n 帧 = n / FPS 秒
  if (s.fromFrame !== undefined) {
    const T0 = s.fromFrame / S.FPS;
    const T1 = s.toFrame !== undefined ? s.toFrame / S.FPS : T0 + (s.hold ?? 3);
    return { ...s, T0, T1 };
  }
  // 按**公蟹到达里程**开窗（客户 2026-11-06：图卡必须等他跑到那个地方）
  if (s.fromKm !== undefined && s.toFrame !== undefined) return { ...s, T0: tOfMaleKm(s.fromKm), T1: s.toFrame / S.FPS };
  if (s.fromKm !== undefined) return { ...s, T0: tOfMaleKm(s.fromKm), T1: tOfMaleKm(s.toKm ?? s.fromKm) + (s.hold ?? 3) };
  if (s.fromLine && s.toFrame !== undefined) return { ...s, T0: S.lineT(s.fromLine), T1: s.toFrame / S.FPS };
  if (s.fromLine && s.toKm !== undefined) return { ...s, T0: S.lineT(s.fromLine), T1: tOfMaleKm(s.toKm) };
  const T = tOfMaleKm(s.at), T0 = tOfMaleKm(Math.max(0, s.at - s.lead));
  return { ...s, T0, T1: T + s.hold };
});
const STATIONS = COURSE.stations.map((st) => ({ ...st, T: tOfMaleKm(st.km) }));
// 分屏时间：由公蟹里程锚点换算
const SPLIT = { ...S.SPLIT, t0: S.SPLIT.t0 ?? tOfMaleKm(S.SPLIT.k0), t1: S.SPLIT.t1 ?? tOfMaleKm(S.SPLIT.k1) };
const CARDS = S.CARDS.map((c) => ({ ...c, T: resolveT(c) }));

function crabState(t, who) {
  const s = { stage: 0, mood: 'run', fx: null, fxT: -99 };
  for (const e of CRAB_STEPS) {
    if (e.T > t) break;
    if (e.who !== 'both' && e.who !== who) continue;
    if (e.stage !== undefined) s.stage = e.stage;
    if (e.mood) s.mood = e.mood;
    if (e.fx) { s.fx = e.fx; s.fxT = e.T; }
  }
  return s;
}
function hpState(t) {
  const s = { male: 5, female: 5, fxT: -99 };
  for (const e of HP_STEPS) {
    if (e.T > t) break;
    if (e.male !== undefined) s.male = e.male;
    if (e.female !== undefined) s.female = e.female;
    if (e.fx) s.fxT = e.T;
  }
  return s;
}

// ── 镜头：关键帧可写 {t} 或 {at:{km}}；统一解析成秒后按时间排序再用 PCHIP 平滑
const CAM = S.CAMERA.map((c) => ({ ...c, T: resolveT(c) })).sort((a, b) => a.T - b.T);
const camCurve = {};
for (const k of ['dist', 'az', 'pitch', 'frame']) camCurve[k] = pchip(CAM.map((c) => [c.T, c[k]]));

export function targetPos(spec, st) {
  if (Array.isArray(spec)) return [spec[0], spec[1], 0];
  if (spec === 'sf') return [...COURSE.meta.start_finish, 0];
  if (spec === 'male') return st.male.pos3;
  if (spec === 'female') return st.female.pos3;
  if (spec === 'pair') {
    const a = st.male.pos3, b = st.female.pos3;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }
  if (spec && spec.km !== undefined) { const r = spec.route === 'half' ? HALF : FULL; return [...r.pos(spec.km), 0]; }
  throw new Error('bad camera target ' + JSON.stringify(spec));
}
const smooth = (x) => x * x * (3 - 2 * x);
function camAt(t, st) {
  let i = 0;
  while (i < CAM.length - 2 && CAM[i + 1].T <= t) i++;
  const a = CAM[i], b = CAM[i + 1];
  const u = Math.min(1, Math.max(0, (t - a.T) / (b.T - a.T || 1)));
  const w = smooth(u);
  const pa = targetPos(a.target, st), pb = targetPos(b.target, st);
  return {
    target: [pa[0] + (pb[0] - pa[0]) * w, pa[1] + (pb[1] - pa[1]) * w, pa[2] + (pb[2] - pa[2]) * w],
    dist: camCurve.dist(t), az: camCurve.az(t), pitch: camCurve.pitch(t), frame: camCurve.frame(t),
  };
}

export function stateAt(t, liftFn) {
  const mk = maleKm(t), fk = femaleKm(t);
  const male = { km: mk, route: 'full', pos2: FULL.pos(mk), ...crabState(t, 'male') };
  // 半马线整体左偏 HALF_OFF（见 course.js）：母蟹要跟着偏，才踩在自己的粉线上
  const fp = HALF.pos(fk), fd = HALF.dir(fk);
  const female = { km: fk, route: 'half', pos2: [fp[0] - fd[1] * HALF_OFF, fp[1] + fd[0] * HALF_OFF], ...crabState(t, 'female') };
  male.pos3 = [...male.pos2, liftFn ? liftFn('full', mk) : 0];
  female.pos3 = [...female.pos2, liftFn ? liftFn('half', fk) : 0];
  const st = { t, male, female, hp: hpState(t) };
  st.cam = camAt(t, st);
  // 客户 2026-11-05 ⑥：**取消分屏**。st.split 恒为 0，整套左右分屏（含 camLeft）不再产生，
  //   下游的 lw / 裁剪 / 卡片缩放的代码路径都保留，只是永远走 0 那一支 —— 万一要退回分屏，
  //   把这里恢复成按 SPLIT.t0/t1 开合即可。
  st.split = 0;
  return st;
}

/** 当前生效的事件（含局部进度 k ∈ [0,1]，以及距开始的秒数 dt） */
export function activeEvents(t, type) {
  const out = [];
  for (const e of EVENTS) {
    if (type && e.type !== type) continue;
    const d = e.d ?? (S.DURATION - e.T);
    if (t >= e.T && t <= e.T + d) out.push({ ...e, k: (t - e.T) / d, dt: t - e.T, d });
  }
  return out;
}
export const eventsOf = (type) => EVENTS.filter((e) => e.type === type);
export function activeStickers(t) {
  return STICKERS.filter((s) => t >= s.T0 && t <= s.T1 + 0.4).map((s) => ({ ...s, dt: t - s.T0, rem: s.T1 + 0.4 - t }));
}
/** 全部地标的可见窗口（含“完全消失的时刻” TAIL）：卡片槽位要让位动画要按它算，不能只看当前活跃的 */
export const stickerWindows = () => STICKERS;
export const stations = () => STATIONS;
export function subtitleAt(t) {
  const cur = S.SUBTITLES.filter((s) => t >= s.t && t <= s.t + s.d);
  return cur.map((s) => ({ ...s, dt: t - s.t, rem: s.t + s.d - t }));
}
export function cardsAt(t) {
  return CARDS.filter((c) => t >= c.T && t <= c.T + c.d).map((c) => ({ ...c, t: c.T, dt: t - c.T, rem: c.T + c.d - t }));
}
export { maleKm, femaleKm, halfToFull, fullToHalf, T_SPLIT };
