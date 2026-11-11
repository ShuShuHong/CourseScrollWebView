// ════════════════════════════════════════════════════════════════════════
//  音效表（全片唯一来源）—— 客户 2026-11-03：“通篇加音效，跑步、爬升、冲线、折返等等”
//
//  规矩（和画面同一条）：**所有音效都钉在时间轴上，不靠“感觉”**。
//    · 事件类（发枪、折返、冲线）的时间直接取自 story.js 的 EVENTS / T_GO / T_*；
//    · 里程类（上桥、桥顶、湿地）一律 tAtKm(km) 反推，配速改了音效自动跟着走；
//    · 卡片类取贴纸卡自己的出场时刻（at / fromFrame），与画面同帧。
//  合成在 tools/sfx_render.py 里做（numpy 程序化合成，无版权素材、可复现）。
// ════════════════════════════════════════════════════════════════════════
import {
  DURATION, T_GO, T_FEMALE_FINISH, T_SPLIT, tAtKm, STICKERS, EVENTS,
  lineT, lineEnd, ELEV_WIN, SPLIT, ENDCARD_T,
} from './story.js';
import { CROSS, WIN_T } from './venue.js';
// 2026-11-09：撞线/欢呼/加冕一律改用 **CROSS.full（真正撞线那一刻）**，
//   不再是 T_MALE_FINISH（那是里程轴到 42.195 的时刻，比撞线早 crossAfter 秒）。

// 湾湾戴冠时刻：撞线前 1.2 s（与 venuePose 的 femaleCrownAt 同一口径）
const CROWN_F = +(CROSS.half - 1.2).toFixed(2);

const gunTimes = EVENTS.filter((e) => e.type === 'gun').map((e) => e.t);
// 卡片时间：帧窗优先；否则按“出现时的里程”；滨湖公园这种 fromLine 卡（跟随锚点、没有固定里程）取台词入点
const stickerT = (s) => {
  if (s.fromFrame !== undefined) return s.fromFrame / 30;
  // 客户 2026-11-09：澜湾博物馆的音效比图卡晚了 ~30 帧 —— 根因是这里取的是**到达里程**的时刻，
  //   而图卡的 T0 是「到达里程 − lead」（engine/timeline.js 的 STICKERS 分支）。
  //   改成同一条口径，音效与图卡**同一帧**上线。
  if (s.at !== undefined) return tAtKm(Math.max(0, s.at - (s.lead ?? 0)));
  if (s.fromKm !== undefined) return tAtKm(s.fromKm);   // 2026-11-08：滨湖公园卡走 fromKm，以前漏了这一支 ⇒ 音效落在 0s
  if (s.fromLine) return lineT(s.fromLine);
  return 0;
};

// ── 单次音效（t = 片子里的秒）
export const CUES = [
  // 片头：加载 → 赛道点亮
  { id: 'boot', t: 0.02, sfx: 'boot', gain: -10, note: '加载低频起' },
  { id: 'reveal', t: lineT('L01') - 0.15, sfx: 'reveal', gain: -2, note: '赛道线点亮' },
  // 起点：人群底噪 + 两枪
  { id: 'gunAB', t: gunTimes[0], sfx: 'gun', gain: -3, note: 'A/B 区首发' },
  { id: 'gunC', t: gunTimes[1], sfx: 'gun', gain: -3, note: 'C 区第二枪' },
  { id: 'cheerGo', t: T_GO, sfx: 'cheer', dur: 2.6, gain: -1, note: '起跑欢呼' },
  // 城区：两张卡片 + 一阵车流
  // 每张地标图卡出场时一声轻“卡”——时间直接取贴纸窗口（换帧窗/换配速自动跟）
  ...STICKERS.map((s) => ({
    id: 'card_' + s.id, t: stickerT(s), sfx: 'card', gain: s.id === 'lakepark' ? -2 : (s.id === 'bridge' ? 0 : -2),
    pan: s.side === 'left' ? -0.25 : 0.25, note: s.name + ' 卡',
  })),
  { id: 'traffic', t: tAtKm(4.2), sfx: 'traffic', dur: 3.4, gain: -17, pan: -0.35, note: '城区远处车流' },
  // 第一次上桥：隆起 → 风 → 桥顶
  { id: 'bridgeGrow', t: tAtKm(6.75), sfx: 'rumble', dur: 3.4, gain: -11, note: '桥体隆起' },
  { id: 'deckTop', t: lineT('L14') + 0.05, sfx: 'ding', gain: -8, note: '桥顶（最高点）' },
  { id: 'downhill1', t: tAtKm(8.62), sfx: 'whoosh', dur: 1.5, gain: -13, pan: 0.2, note: '下桥' },
  // 银杏 / 悦水湾
  { id: 'leaves', t: tAtKm(11.6), sfx: 'leaves', dur: 3.0, gain: -5, note: '银杏落叶（新排程口播密集，抬 4 dB 才压得住）' },
  { id: 'birds', t: tAtKm(13.6), sfx: 'birds', dur: 3.2, gain: -10, pan: 0.3, note: '悦水湾鸟鸣' },
  // 二次上桥（爬升）
  { id: 'bridge2', t: tAtKm(17.0), sfx: 'rumble', dur: 3.0, gain: -10, note: '二次上桥隆起' },
  { id: 'breath', t: tAtKm(17.6), sfx: 'breath', dur: 2.4, gain: -18, note: '吃力呼吸' },
  { id: 'wind2', t: tAtKm(17.9), sfx: 'wind', dur: 3.0, gain: -8, note: '二次桥面风（整段在口播下 ⇒ 按 MIX.duckUnderVo 压 15 dB，当质感不当事件）' },
  // 折返 / 分流 / 分屏
  { id: 'uturn1', t: tAtKm(19.61), sfx: 'uturn', gain: -4, pan: -0.15, note: '澜湾北路折返' },
  // 2026-11-09：分流牌现在钉在 T_SPLIT−1.60 出、T_SPLIT+0.50 收（机位不再推到岔口），
  //   音效跟着牌走；用 tAtKm(20.75) 会落到「H18 场外推进」里（那时画面在会场）
  { id: 'fork', t: +(T_SPLIT - 1.55).toFixed(2), sfx: 'fork', gain: -10, note: '全/半马分流' },
  // 2026-11-08：段 17 一开口就是台词 ⇒ 分叉音效提到切进副本前 0.40 s 的气口里
  { id: 'splitIn', t: +(SPLIT.t0 - 0.40).toFixed(3), sfx: 'split', gain: -7, note: '切进分流副本' },
  // 半马冲线（湾湾）
  { id: 'crownF', t: CROWN_F, sfx: 'sparkle', gain: -10, pan: -0.3, note: '解锁湖后' },
  { id: 'cheerF', t: T_FEMALE_FINISH + 0.10, sfx: 'cheer', dur: 2.4, gain: -5, pan: -0.35, note: '半马终点欢呼（撞线之后再起，别盖住绷带声）' },
  { id: 'tapeF', t: T_FEMALE_FINISH, sfx: 'tape', gain: 0, pan: -0.3, note: '湾湾撞线' },
  // 全马折返（29.2km）
  { id: 'uturn2', t: tAtKm(29.2), sfx: 'uturn', gain: 0, pan: 0.5, note: '全马折返点（压过欢呼尾巴，右声道）' },
  // 回程：湿地 → 最后直道
  { id: 'wetlandBirds', t: tAtKm(40.4), sfx: 'birds', dur: 3.4, gain: -8, pan: -0.3, note: '湿地水鸟' },
  // 蓝蓝冲线 + 主舞台
  { id: 'tapeM', t: CROSS.full, sfx: 'tape', gain: 0, note: '蓝蓝撞线' },
  { id: 'cheerM', t: +(CROSS.full + 0.02).toFixed(2), sfx: 'cheer', dur: 4.2, gain: -5, note: '全马终点欢呼' },
  { id: 'fanfare', t: +(CROSS.full + 0.25).toFixed(2), sfx: 'fanfare', gain: -5, note: '解锁湖王' },
  { id: 'sparkleM', t: +(WIN_T.stage + 0.4).toFixed(2), sfx: 'sparkle', gain: -3, pan: 0.3, note: '舞台撒花' },
  // 落版
  // 客户 2026-11-05 ②：落版去掉 ⇒ 落版转场音也不放（保留定义注释，要恢复把上一行取消注释）
  // { id: 'endTitle', t: +(ENDCARD_T.t0 - 0.05).toFixed(2), sfx: 'end', gain: -7, note: '落版转场' },
];

// ── 跑步脚步：一条“床”，不逐条列。速率恒定 ±，只在桥上变闷、终点前变轻
//    （客户口径：角色动画节拍恒定，脚步也不跟着地图速度抽风）
export const STEPS = {
  t0: T_GO + 0.18,
  t1: +(CROSS.full - 0.10).toFixed(2),
  rate: 3.35,                                   // 步/秒（约 200 步/分）
  gain: -21,
  sections: [
    { t0: T_GO, t1: tAtKm(6.75), rate: 3.30, gain: 0, tone: 'road' },
    { t0: tAtKm(6.75), t1: tAtKm(8.62), rate: 3.10, gain: -3.5, tone: 'deck' },   // 上桥：步频慢、声变闷
    { t0: tAtKm(8.62), t1: tAtKm(17.0), rate: 3.40, gain: 0, tone: 'road' },
    { t0: tAtKm(17.0), t1: tAtKm(19.9), rate: 3.05, gain: -4.0, tone: 'deck' },
    { t0: tAtKm(19.9), t1: tAtKm(29.2), rate: 3.45, gain: -0.5, tone: 'road' },
    { t0: tAtKm(29.2), t1: tAtKm(40.0), rate: 3.50, gain: -1.0, tone: 'road' },
    { t0: tAtKm(40.0), t1: CROSS.full, rate: 3.55, gain: 0.5, tone: 'road' },
  ],
};

// ── 底噪床（ambi​ence）：每一段场景都有一层很轻的环境声，接缝处交叠淡入淡出
//    客户 2026-11-03：“通篇加音效” —— 不是只在事件点响一下，而是要有一层“现场感”托底。
export const AMB = [
  { id: 'amb_start', t0: 0.90, t1: 9.80, sfx: 'amb_crowd', gain: -27, note: '起点主会场人群' },
  { id: 'amb_city1', t0: 9.70, t1: 16.50, sfx: 'amb_street', gain: -36, note: '城区街道' },
  { id: 'amb_city2', t0: 16.40, t1: 21.60, sfx: 'amb_street', gain: -37, note: '城区街道（续）' },
  { id: 'amb_bridge1', t0: 21.50, t1: 30.60, sfx: 'amb_wind', gain: -34, note: '桥面风' },
  { id: 'amb_park', t0: 30.50, t1: 41.20, sfx: 'amb_park', gain: -33, note: '银杏/悦水湾林间' },
  { id: 'amb_bridge2', t0: 41.10, t1: 46.60, sfx: 'amb_wind', gain: -34, note: '二次上桥风' },
  { id: 'amb_street3', t0: 46.50, t1: 50.50, sfx: 'amb_street', gain: -37, note: '澜湾北路回程' },
  { id: 'amb_crowd2', t0: 50.40, t1: 62.40, sfx: 'amb_crowd', gain: -29, note: '半马终点人群' },
  // 2026-11-07：尾段改成按冲线时刻 / 片长推导 —— 插了新台词后片长多 3.78 s，
  //   写死的 77.00 / 82.80 / 94.91 会在片尾留下 4 s 没有底噪的空白。
  { id: 'amb_rush', t0: 62.30, t1: +(CROSS.full - 3.77).toFixed(2), sfx: 'amb_rush', gain: -31, note: '环湖快进：风声掠过' },
  { id: 'amb_finish', t0: +(CROSS.full - 3.87).toFixed(2), t1: +(CROSS.full + 2.04).toFixed(2), sfx: 'amb_crowd', gain: -27, note: '终点前人群渐强' },
  { id: 'amb_stage', t0: +(CROSS.full + 1.94).toFixed(2), t1: +(DURATION - 0.26).toFixed(2), sfx: 'amb_crowd', gain: -26, note: '主舞台观众' },
];

// ── 混音口径：旁白永远压在上面（口播是主角）
export const MIX = {
  // 客户 2026-11-08-e：口播 / 音效拆成两个独立开关 ——
  //   两个都 true ⇒ 与原来的成片音轨完全一致；
  //   关掉 sfx ⇒ 只有口播（给客户在剪辑软件里自己配音效）；
  //   关掉 vo  ⇒ 只有音效。
  //   无论开关怎么设，混音脚本都会用「满配（口播+音效）」的峰值来定总增益，
  //   所以两条分轨 dist/stem-vo.wav / dist/stem-sfx.wav 相加 = 原成片音轨，电平不会错。
  vo: true,
  sfx: true,
  // 客户 2026-11-03：音效整体再降三分之一 ⇒ 20·log10(2/3) = −3.52 dB，−28.5 → −32.0
  bedRmsDb: -32.0,          // 音效床整体 RMS（含底噪）目标
  bedPeakDb: -3.0,          // 音效床峰值上限（tanh 软限幅）
  mixPeakDb: -1.5,          // 成片峰值上限
  duckUnderVo: -15.0,
  // ── BGM：客户 2026-11-04 撤销，不再进成片（bgm: false）
  //    dist/bgm.mp3 仍单独留着试听；把 bgm 改回 true 重跑 npm run sfx 就能混回去
  bgm: false,
  bgmRmsDb: -30.0,          // 空隙时的电平（说话时再压 bgmDuckDb）
  bgmDuckDb: -10.0,         // 说话时再降 10 dB ⇒ 约比口播低 12.5 dB       // 有人说话时，音效床再压 13 dB
  duckAttack: 0.10,         // 压低 100 ms
  duckRelease: 0.30,        // 抬回 300 ms
  voLead: 0.04,             // 旁白提前 40 ms 起压（避免“字先到、声后压”）
};

export const SFX_IDS = [...new Set([...CUES.map((c) => c.sfx), ...AMB.map((a) => a.sfx)])];
export const sfxAt = (t, win = 0.5) => CUES.filter((c) => t >= c.t - win && t <= c.t + (c.dur ?? 0.6));
void ELEV_WIN; void lineEnd;
