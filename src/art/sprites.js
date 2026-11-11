// 位图角色选帧（RunningHub seedream 生成 → tools/cutout.py 抠图 → tools/pack_assets.py 内嵌）
// 资产由页面在应用脚本之前注入：window.__ASSETS = { crabs:{id:{src,w,h,ax,ay,cx,seq}}, landmarks, master }
//
// ⚠️ 模板结构：这里**不再假设**「两只角色 / 3 个阶段 / 4 种情绪」。
//   角色表在赛事包 races/<id>/race.js 的 RACE.mascots（spec + actors + showcase）；
//   本文件只负责把 (sex, stage, mood, back) 翻译成素材 id，并给出回退链。
//   换一场赛事改 race.js 就行，素材放 races/<id>/mascots/。
import { RACE_META } from '../config/theme.js';

export const getAssets = () => globalThis.__ASSETS || { crabs: {}, landmarks: {} };
export const hasSprites = () => Object.keys(getAssets().crabs).length > 0;

/** 缺省角色表：与澜湾这一版完全一致（阶段 0..2 / 四情绪 / 支持背身） */
const DEFAULT_SPEC = { stages: 3, moods: ['run', 'cheer', 'tired', 'win'], back: true, idTemplate: '{id}{stage}_{mood}' };
const DEFAULT_ACTORS = [
  { id: 'f', sex: 'f', name: '角色 A', label: '角色 A', side: 'left' },
  { id: 'm', sex: 'm', name: '角色 B', label: '角色 B', side: 'right' },
];

/** 选帧规格（赛事包可覆盖任意字段） */
export const mascotSpec = () => ({ ...DEFAULT_SPEC, ...(RACE_META?.mascots?.spec || {}) });
/** 出场角色（顺序 = 画面左→右） */
export const mascotActors = () => (RACE_META?.mascots?.actors?.length ? RACE_META.mascots.actors : DEFAULT_ACTORS);
/** sex → actor id（sex 是引擎沿用的旧参数名，实际就是角色 id） */
export const actorOf = (sex) => mascotActors().find((a) => a.sex === sex || a.id === sex)?.id ?? sex;
/** 按模板拼素材 id */
export const mascotId = (actor, stage, mood, spec = mascotSpec()) => spec
  .idTemplate.replace('{id}', String(actor)).replace('{stage}', String(stage)).replace('{mood}', String(mood));

/**
 * 设定集 / 动作序列页要展示的组合。
 *   赛事包给了 `showcase` 就用它（caption 是给客户看的文案）；
 *   没给就自动每个阶段挑代表性动作。
 * 返回 [{ actor, stage, mood, caption, id }]
 */
export function mascotShowcase() {
  const S = mascotSpec();
  const last = Math.max(0, S.stages - 1);
  const own = RACE_META?.mascots?.showcase;
  if (Array.isArray(own) && own.length) {
    return own.map((x) => ({ ...x, id: mascotId(actorOf(x.actor), x.stage, x.mood, S) }));
  }
  const picks = [[0, 'run'], [0, 'cheer'], [1, 'run'], [1, 'tired'], [last, 'win']]
    .filter(([st]) => st <= last);
  const moodCN = { run: '奔跑', cheer: '欢呼', tired: '疲惫', win: '冲线' };
  return mascotActors().flatMap((a) => picks.map(([st, mood]) => {
    const stageName = (S.stageName?.[st] ?? `Lv${st + 1}`).replace('{crown}', a.crown ?? a.name ?? '');
    const cap = S.stageName ? `Lv${st + 1} ${stageName} · ${moodCN[mood] ?? mood}` : mascotId(a.id, st, mood, S);
    return { actor: a.id, stage: st, mood, caption: cap, id: mascotId(a.id, st, mood, S) };
  }));
}

export function crabId(sex, stage, mood, back = false) {
  const c = getAssets().crabs;
  const S = mascotSpec();
  const a = actorOf(sex);
  const last = Math.max(0, S.stages - 1);
  const st = Math.max(0, Math.min(last, stage));
  const at = (k, m) => mascotId(a, k, m, S);
  const tries = [];
  // 背面视角（2026-11-06 分流副本）：只认 back 图，缺图才回落到正面 —— 反过来会画出「背对镜头却长着脸」
  if (back && S.back) {
    for (const id of [at(st, 'back'), at(1, 'back')]) if (c[id]) return id;
  }
  if (st === last) tries.push(at(last, 'win'));
  if (mood === 'tired') tries.push(at(Math.max(1, st), 'tired'), at(1, 'tired'));
  // 客户 2026-11-05：**回退链不许降级** —— 原来 cheer 时依次试 st_cheer → 0_cheer → 2_win，
  //   stage 1 没有 cheer 图就掉到 stage 0（初始形态），画面上就是“螃蟹突然变回小屁孩”。
  //   现在 cheer 缺图就退回**同档**的跑动图，宁可动作平淡也不能换形态。
  if (mood === 'cheer' || mood === 'win') tries.push(at(st, 'cheer'), at(st, 'run'));
  tries.push(at(st, 'run'), at(1, 'run'), at(0, 'run'));
  for (const id of tries) if (c[id]) return id;
  return Object.keys(c).find((k) => k.startsWith(a)) || null;
}

/**
 * 角色精灵 SVG 片段。原点 = 脚底；heightPx = 屏幕上的角色高度。
 * facing：-1..1，<0 时水平翻转（以视觉中心 cx 为轴）。
 * 有运动序列（assets.crabs[id].seq）时按相位播帧；没有就退回单张静图。
 * 帧已归一化到同一画布（底线对齐、视觉中心对齐），所以直接换 href 不会跳。
 * 跑动/腾空的上下颠仍由 bob 提供（切图时把基线压平了，这里补回来）。
 */
export function crabSprite({ sex, stage, mood, phase = 0, facing = 1, heightPx = 150, moving = true, ring, ringColor, back = false }) {
  const id = crabId(sex, stage, mood, back);
  if (!id) return '';
  const crab = getAssets().crabs[id];
  const seq = crab.seq;
  // 帧选择：有序列时按相位取帧（跑/累/欢呼/胜利都动；不动时也保留呼吸式跳动）
  let a = crab;
  if (seq && seq.length > 1) {
    const k = phase - Math.floor(phase);
    a = seq[Math.min(seq.length - 1, Math.floor(k * seq.length))];
  }
  const s = heightPx / a.h;
  const w = a.w * s, h = heightPx;
  const ph = phase * Math.PI * 2;
  const run = moving && (mood === 'run' || mood === 'tired');
  const hop = mood === 'cheer' || mood === 'win';
  const amp = mood === 'tired' ? 0.6 : 1;
  // 有序列时幅度减半：帧本身已经在动，程序化只是补足落地感
  const k = seq ? 0.55 : 1;
  const bob = run ? -Math.abs(Math.sin(ph)) * h * 0.06 * amp * k : hop ? -Math.abs(Math.sin(ph * 0.9)) * h * 0.09 * k : 0;
  const land = run ? Math.pow(Math.max(0, Math.cos(ph * 2)), 6) : 0;           // 落地瞬间
  const sy = 1 - land * 0.05 * amp * k, sx = 1 + land * 0.04 * amp * k;
  const tilt = run ? Math.sin(ph) * 4 * amp * k + (facing >= 0 ? 3 : -3) : hop ? Math.sin(ph * 0.9) * 3 : 0;
  const flip = facing < -0.15 ? -1 : 1;
  const ax = a.cx * w;                                       // 翻转轴 = 视觉中心
  const shadowR = w * 0.42 * (1 + bob / h * 0.8);
  let s0 = `<ellipse cx="0" cy="0" rx="${(shadowR).toFixed(1)}" ry="${(shadowR * 0.22).toFixed(1)}" fill="#0b2240" opacity="${(0.28 + bob / h).toFixed(2)}"/>`;
  if (ring) s0 += `<ellipse cx="0" cy="0" rx="${(w * 0.4).toFixed(1)}" ry="${(w * 0.085).toFixed(1)}" fill="${ringColor}" fill-opacity=".25" stroke="${ringColor}" stroke-width="${Math.max(2, h * 0.02).toFixed(1)}"/>`;
  const tf = `translate(0 ${bob.toFixed(1)}) rotate(${tilt.toFixed(2)} 0 ${(-h * 0.4).toFixed(1)}) scale(${(flip * sx).toFixed(3)} ${sy.toFixed(3)})`;
  return s0 + `<g transform="${tf}"><image href="${a.src}" x="${(-ax).toFixed(1)}" y="${(-a.ay * h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/></g>`;
}

/** 静态头像（HUD 用）：fit 到 size×size 方框，底边对齐 */
export function crabIcon(sex, stage, mood = 'run', size = 60) {
  const id = crabId(sex, stage, mood);
  if (!id) return '';
  const a = getAssets().crabs[id], k = Math.min(size / a.w, size / a.h);
  return `<image href="${a.src}" x="${(-a.w * k / 2).toFixed(1)}" y="${(-a.h * k).toFixed(1)}" width="${(a.w * k).toFixed(1)}" height="${(a.h * k).toFixed(1)}"/>`;
}
export const landmarkSrc = (art) => getAssets().landmarks?.[art] || null;
export const masterSrc = () => getAssets().master || null;
