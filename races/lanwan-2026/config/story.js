// ════════════════════════════════════════════════════════════════════════
//  全片时间轴（唯一需要经常改的文件）
//  · 口播/字幕的唯一来源是 voice.js：44 行的入点/出点全部来自客户音轨的 SRT（audio/1029）
//  · 本文件里所有“镜头 / 信息卡 / 事件”优先用 { at: { km } }（里程锚定）而不是秒，
//    这样换音轨、改文案，画面自动跟着重排
//  · 单位：秒 / 公里（全马 0–42.195，半马 0–21.0975）
// ════════════════════════════════════════════════════════════════════════
import { buildScript, LINES, PARAGRAPHS, VO, AUDIO, PRESTART_KM, FINISH_KM, SUB_SHIFT } from './voice.js';
import { SUB_SHIFT_FRAMES, SUB_END_FRAMES } from './inserts.js';
import { FIN } from './schedule.js';
import { pchip, inverse } from '../../../src/engine/math.js';
import { BRAND } from './theme.js';

const S = buildScript();

export const FPS = 30;                 // 成片帧率：第 n 帧 = n/30 秒（播放器、分镜表、toFrame 都用它）
const F = (t) => Math.round(t * FPS);   // 秒 → 帧号（贴纸窗口用，换音轨时改时间就行）
export const DURATION = S.DURATION;
export const AUDIO_DUR = AUDIO.dur;
export const AUDIO_OFFSET = VO.audioOffset;
export const PRESTART = PRESTART_KM;

/** 25 段配音在成片里的落位（t0/t1/km0/km1/scene/pause）—— 2026-11-08 匀速排程的产物 */
export const SEGS = S.segs;
const _seg = (n) => {
  const s = SEGS.find((x) => x.n === n);
  if (!s) throw new Error('unknown vo segment ' + n);
  return s;
};
export const segT0 = (n) => _seg(n).t0;
export const segT1 = (n) => _seg(n).t1;
export const SEG_OF = (t) => SEGS.filter((s) => t >= s.t0 - 1e-9 && t < s.t1 + 1e-9).at(-1) || null;
/** 起跑：段 4（地图第一段）开口 —— C 区第二枪刚说完 */
export const T_SPLIT = segT0(17);
/** 切进分流副本的时刻（段 17 的段内切点）—— 湾湾在那之前一直跟着蓝蓝 */
export const T_SPLIT_CUT = SEGS.find((x) => x.n === 17).cuts[0].t;
export const T_HALF_START = segT1(17);

/** 逐行口播/字幕（含 km 锚点、入出点、字/秒、句间空隙），设定集/分镜表/校验工具都读它 */
export const VO_LINES = S.lines;
export const VO_SCRIPT = S;
export const lineT = (id) => {
  const l = S.lines.find((x) => x.id === id);
  if (!l) throw new Error('unknown voice line ' + id);
  return l.t;
};
export const lineEnd = (id) => {
  const l = S.lines.find((x) => x.id === id);
  return l.t + l.d;
};

// ── 关键时间点（由旁白行推导，换音轨/改文案自动更新）
export const T_GO = S.T_GO;                                // 起跑（= 段 4 开口，地图切出会场那一刻）
export const T_FEMALE_FINISH = lineEnd('L27');             // 湾湾冲线（“3小时关门内冲线”说完）

/** 蓝蓝里程锚点：[[t, km], ...]（单调），engine/timeline.js 用它做 pchip 插值
 *  起跑仪式期间把吉祥物钉在起点不动（否则从头就开始“蹭”着往前挪），发枪那一刻才起步。 */
// 客户 2026-10-27 第二轮：22–40km 整段**匀速**（1.16 km/s），不再有“加速段”，
// 也不再在折返点插“原地掉头”的停顿锚点 —— 见 voice.js 的 PACE。
export const MALE_KM = (() => {
  // 里程全程连续（客户要求：不能出现“瞬移”）。22→40km 这 18km 被音轨压进 ~16s，
  // 处理方式是**全程同一速率**（voice.js PACE 块），不是“先慢跑再快进”。
  // 客户 2026-11-09：**F296 切进地图主场景时两只已经从 0.10 km 出发**。
  //   起跑段（段 4）的 km0 现在是 0.10，排程把 [T_GO, 0.10] 也写进了锚点 ——
  //   这里必须用 >= 才收得进来（原来写 > 会把它滤掉，吉祥物回到 −0.06）。
  const atGo = S.MALE_KM.filter(([t]) => Math.abs(t - T_GO) < 1e-6).at(-1);
  const K0 = atGo ? atGo[1] : PRESTART_KM;
  const rest = S.MALE_KM.filter(([t]) => t > T_GO + 1e-6);
  return [[0, K0], [T_GO, K0], ...(rest.length ? rest : [[DURATION, FINISH_KM]])];
})();
export const CPS_AVG = S.cpsAvg;
export const VO_MATCH = S.match;

// 蓝蓝进度：mileage -> 秒（纯函数，供配置里的“到达某公里时”使用）
const _maleKm = pchip(MALE_KM);
export const tAtKm = (km) => inverse(_maleKm, 0, DURATION, km);
export const T_MALE_FINISH = tAtKm(FINISH_KM);             // 蓝蓝到终点（“全马42.195公里”中点）

// 2026-11-09（客户）：**口播 35、36 读完才完成冲线**，冲线加冕后欢呼 2–3 s 再切主舞台。
//   T_MALE_FINISH 是**里程轴**到 42.195 的时刻（= 第 36 句开口、切进会场那一刻），
//   段 24（口播 35+36）整段读完是 segT1(24) —— 撞线从**那一刻**起算 crossAfter 秒。
//   三个数来自 schedule.js 的 FIN，与排程里那条「H24 停留」是同一份口径
//   （停留时长 = crossAfter + crownAfter + cheer ⇒ 段 25 起点正好落在 T_STAGE）。
/** 副本入口 = 「最后约230米直道」（L36）开口那一刻。
 *  客户 2026-11-01：L35「右转进入星湖南路」还在星湖南路上说完，到 L36 才切进主会场冲刺。
 *  与 schedule.js 的 CUE_SCENE_CUT[35]（cue 35 = L36）同一个时刻 —— 由排程段推导，不写死。 */
export const T_FIN_ENTRY = +lineT('L36').toFixed(3);
export const T_FIN_CROSS = +(segT1(24) + FIN.crossAfter).toFixed(3);      // 蓝蓝真正撞线
export const T_CROWN_MALE = +(T_FIN_CROSS + FIN.crownAfter).toFixed(3);   // 加冕
export const T_STAGE = +(T_CROWN_MALE + FIN.cheer).toFixed(3);            // 切主舞台（= 段 25 起点）

// ── 落版画面（客户 2026-11-04）：AI 底图 + 矢量排版 + 湖王湖后
//    起点取片尾最后一句口播收完（91.974 + 1.20 = 93.17）之后 0.09 s，到片尾 95.17 为止；
//    0.80 s 通过“压黑”转场（主舞台 LED 背板本身也有标题，直接交叉溶解会撞出两条字）。
export const ENDCARD_T = { t0: +(DURATION - 1.91).toFixed(2), fade: 0.80 };

// ── 字幕：直接来自 voice.js（每条 = 一行口播，逐字上屏）
//    客户 2026-11-08：**所有同期字幕统一延后 30 帧（1.000 s）** ——
//    只动上屏时间，声音不动；改帧数去 src/config/inserts.js 的 SUB_SHIFT_FRAMES
export const SUB_SHIFT_SEC = SUB_SHIFT;
export const SUBTITLES = S.lines.map((l) => {
  // 客户 2026-11-08：全局 +30 帧，但**第 31 条（后补那句）单独提前 30 帧**
  const fr = l.subShiftFrames ?? SUB_SHIFT_FRAMES;
  const tOn = l.t + fr / 30;
  // 客户 2026-11-01：个别句子指定「最晚消失帧」——只延长上屏，不动声音
  const endF = SUB_END_FRAMES[l.id];
  const dOn = endF ? +Math.max(l.d, endF / 30 - tOn).toFixed(3) : l.d;
  return {
    id: l.id, t: +tOn.toFixed(3), d: dOn, dVoice: l.d, text: l.text, color: l.color, tag: l.tag, km: l.km,
    tVoice: l.t,       // 声音真正的起点（校偏置时用）
    shiftFrames: fr,
  };
});
// ── 旁白分段（设定集/分镜表/字幕表按段落展示；text 是逐字原文）
export const NARRATION = PARAGRAPHS.map((p) => ({
  id: p.id,
  km: p.km || null,
  text: p.lines.map((id) => S.lines.find((l) => l.id === id).vo).join(''),
  t0: lineT(p.lines[0]),
  t1: lineEnd(p.lines[p.lines.length - 1]),
}));


// ── 镜头关键帧
//  target: 'male' | 'female' | 'pair' | 'sf'(起终点) | [x,y](图上 pt) | {route,km}
//  dist: 相机到目标距离（pt）  az: 方位角°（0 = 北在上）  pitch: 俯角°
//  frame: 主体在画面中的竖向偏移（0 居中，正值 = 主体偏下）
//  起跑仪式用 { t }（时间固定）；此后一律用 { at:{km} }，跟着赛程走
export const CAMERA = [
  // ① 起跑仪式（时间固定）
  { t: 0.0, target: [1700, 1350], dist: 5600, az: 0, pitch: 62, frame: 0 },
  { t: lineT('L01') - 0.05, target: [1500, 1250], dist: 4800, az: 0, pitch: 60, frame: 0 },
  { t: lineT('L03'), target: 'sf', dist: 520, az: 0, pitch: 40, frame: 0.12, ease: 'inOut' },
  { t: lineT('L04') + 0.6, target: 'sf', dist: 460, az: 0, pitch: 40, frame: 0.12 },
  // ② 城区段（音轨里“2.9km 博物馆”与“6.1km 老街”只隔 1.9s ⇒ 3.2km/1.9s，镜头必须先贴近再拉开）
  { at: { km: 0.60 }, target: 'pair', dist: 820, az: 0, pitch: 46, frame: 0.12 },
  { at: { km: 2.50 }, target: 'pair', dist: 760, az: 0, pitch: 44, frame: 0.12 },
  { at: { km: 6.60 }, target: 'pair', dist: 1080, az: -8, pitch: 50, frame: 0.12 },
  // ③ 大桥（爬升段切近景）
  // 过桥机位：压低俯角、后撤到能同时看见桥塔与吉祥物（实测塔在屏上约 190px，吉祥物不遮塔）
  { at: { km: 8.02 }, target: 'pair', dist: 660, az: 46, pitch: 27, frame: 0.02 },
  { at: { km: 8.30 }, target: 'pair', dist: 560, az: 58, pitch: 15, frame: 0.12 },
  { at: { km: 8.60 }, target: 'pair', dist: 600, az: 64, pitch: 24, frame: 0.02 },
  { at: { km: 9.60 }, target: 'pair', dist: 900, az: 14, pitch: 48, frame: 0.12 },
  // ④ 银杏 / 悦水湾
  { at: { km: 12.20 }, target: 'pair', dist: 920, az: 6, pitch: 48, frame: 0.12 },
  { at: { km: 14.60 }, target: 'pair', dist: 780, az: 10, pitch: 44, frame: 0.11 },
  // ⑤ 二次上桥（14.8→18.5km 只有 1.8s，先拉开再俯到桥面）
  { at: { km: 16.20 }, target: 'pair', dist: 1180, az: 14, pitch: 52, frame: 0.11 },
  { at: { km: 17.60 }, target: 'pair', dist: 580, az: 18, pitch: 36, frame: 0.10 },
  // ⑥ 折返 / 分流（客户 2026-11-05 ⑥：取消分屏）
  // 2026-11-09 客户：「口播 22 不要动摄像机，跟着吉祥物」「口播 23 还是跟着吉祥物」
  //   ⇒ 那两推（54.9 → 700、56.3 → 定在岔口的 380）整段撤掉，改成**锁死的中景跟拍**。
  //   追加（同一天第二批）：「1700 帧别动镜头，还是跟随蓝蓝」⇒ target 从 'pair' 改 'male'：
  //   'pair' 在两只投影靠近时跟的是**中点**，湾湾一动镜头就跟着飘；跟蓝蓝则纹丝不动。
  //   两个关键帧数值完全一样（一个按里程、一个按**切场景时刻**），pchip 插出来是水平线。
  { at: { km: 19.10 }, target: 'male', dist: 640, az: 6, pitch: 40, frame: 0.10 },
  { t: +(T_SPLIT_CUT - 0.02).toFixed(3), target: 'male', dist: 640, az: 6, pitch: 40, frame: 0.10 },
  // ⑦ 半马冲线 → 全马环湖
  { at: { km: 21.85 }, target: 'male', dist: 800, az: -6, pitch: 46, frame: 0.12 },
  { at: { km: 23.00 }, target: 'male', dist: 900, az: -10, pitch: 48, frame: 0.12 },
  // ⑧ 22→40km 环湖匀速段（客户 2026-10-27 第二轮）：一条直线匀速通过，不加速、不设角标。
  //    18km 走 ~16s ⇒ 1.16 km/s，镜头拉成中远景跟住蓝蓝，让路在脚下均匀滑过。
  { at: { km: 25.10 }, target: 'male', dist: 1450, az: -10, pitch: 54, frame: 0.08 },
  { at: { km: 39.60 }, target: 'male', dist: 1200, az: -4, pitch: 50, frame: 0.10 },
  { at: { km: 40.60 }, target: 'male', dist: 820, az: 0, pitch: 46, frame: 0.12 },
  // ⑨ 冲线 / 片尾（时间固定）
  { t: lineT('L36'), target: 'sf', dist: 520, az: 0, pitch: 38, frame: 0.12 },   // 「最后约230米直道」开口
  { t: T_FIN_CROSS, target: 'sf', dist: 470, az: 0, pitch: 36, frame: 0.12 },
  { t: DURATION, target: 'sf', dist: 440, az: 0, pitch: 34, frame: 0.12 },
];

// 分屏：左半跟湾湾（按口播行推导，换音轨自动跟着走）
//   开屏 = 「回环湖大道分流」(L23) 开口后 1.09 s —— 让观众先听到“分流”两个字再拉屏；
//   收屏 = 湾湾冲线（L27 说完）后 3.09 s —— 留 3 s 看她戴冠庆祝。
// 客户 2026-11-05 ⑥：**取消分屏**。这个对象现在只剩“分叉时刻”这一个用途
//   （湾湾自己的里程曲线起点、分叉音效、副本半马窗口的旧引用），不再驱动任何左右分屏。
export const SPLIT = {
  k0: 20.91,
  t0: T_SPLIT,                 // 段 17 开口（“回环湖大道分流”）
  t1: T_HALF_START,            // 段 17 收口 = 湾湾进主会场副本那一刻
  ease: 0.45, easeIn: 0.28,   // ease 是“到 t1 前 1.1s 开始淡出”，所以要让冲线那一刻还是满幅
  left: { target: 'female', dist: 520, az: 0, pitch: 40, frame: -0.10 },   // 负值把主体抬离左下角的海拔窗
  leftTitle: '半马 · 湾湾', rightTitle: '全马 · 蓝蓝',
};

// 半马：分流前跟蓝蓝同线（按 half→full 换算），分流后自己跑到 21.0975 冲线
// 客户 2026-11-05：湾湾必须**明显走在粉红（半马）道上**。
//   旧版她从分叉点（半马 20.8km）出发、9.1 秒只挪 0.29km ⇒ 整段特写都还在蓝粉重叠的共线段上，
//   看上去像“走错道”。改成：50.30s 就站上粉线北向支路，到切副本前跑到 21.06，
//   最后 0.04km 交给副本里的冲刺镜头。
export const FEMALE_AFTER_SPLIT = [
  // 客户 2026-11-09：「湾湾不要瞬移，也还是跟着蓝蓝，直到转场景」。
  //   原来第一个点是写死的 20.4350，而在 T_SPLIT（56.635 s）那一刻她在蓝蓝 line 上只到
  //   fullToHalf(maleKm) = 19.83 ⇒ F1700 一帧内往前跳 0.63 km（实测屏幕 170 px）。
  //   现在两点都写 null（= 与蓝蓝共线，由 engine/timeline.js 取 fullToHalf(maleKm(t))），
  //   而 femaleKm() 的切换点也从 T_SPLIT 改到**切场景** T_SPLIT_CUT —— 地图上她全程贴着他。
  [SPLIT.t0, null],                 // 分流牌亮 → 与他共线
  [T_SPLIT_CUT, null],              // 一直共线到切进分流副本
  [T_HALF_START, 21.06],            // 进主会场副本时她已接近终点直道
  [T_FEMALE_FINISH, 21.0975],
  [DURATION, 21.0975],
];

// ── 角色形态：stage 0 新手 / 1 升级（披风）/ 2 王者（披风 + 大皇冠）；mood: run | cheer | tired | win
//    皇冠时机（客户 2026-10-28）：湾湾在半马冲线时解锁湖后（48.44s "解锁湖后"）；
//    蓝蓝在全马冲线后、口播"湖王湖后解锁"（71.00s L40）时才加冕
export const CRAB_STATE = [
  { t: 0, who: 'both', stage: 0, mood: 'cheer' },
  { t: T_GO, who: 'both', mood: 'run' },
  { at: { km: 9.55 }, who: 'both', stage: 1, fx: 'levelup' },   // 桥顶升级
  { at: { km: 19.40 }, who: 'both', mood: 'tired' },
  { at: { km: 20.30 }, who: 'both', mood: 'run' },
  { t: T_FEMALE_FINISH, who: 'female', stage: 2, mood: 'win', fx: 'crown' },
  { t: T_FIN_CROSS, who: 'male', mood: 'win' },
  { t: T_CROWN_MALE, who: 'male', stage: 2, mood: 'win', fx: 'crown' },
  // 切主舞台：两只一起庆祝（客户 2026-11-09）
  { t: T_STAGE, who: 'both', stage: 2, mood: 'win' },
];
// 体力条（满 5 格）
export const HP = [
  { t: 0, male: 5, female: 5 },
  { at: { km: 19.40 }, male: 4, female: 4, fx: true },
  { at: { km: 29.40 }, male: 5 },
];

// ── 信息卡（多行数据，避免字幕连播）
//  客户 2026-11-09：三个框的口径统一成「跟着所在副本走」——
//    · 分区起跑卡 → 撑到**起跑副本结束**（段 4 开口那一刻）
//    · 湾湾 / 蓝蓝冲线卡 → 从**进冲刺副本**起、到**出副本前**收
//    · 主舞台详细数据卡 → 撑到**第 41 条口播（L42「2026澜湾马拉松，」）读完**
const _segEnd = (id) => SEGS.find((x) => x.n === id)?.t1 ?? segT1(24);
const _segBeg = (id) => SEGS.find((x) => x.n === id)?.t0 ?? segT0(24);
export const CARDS = [
  { t: lineT('L03'), d: +(segT0(4) - 0.02 - lineT('L03')).toFixed(2), id: 'start', title: '分区起跑',
    lines: ['A/B/C区全半马混编', 'A、B区首发，C区第二枪', '半程 10:40 / 全程 13:40 关门'] },
  // 客户 2026-11-05 ②：「赛段调整」字卡整张撤掉（数据仍留在设定集第 08 节）
  { at: { km: 8.06 }, d: 3.4, id: 'bridge', side: 'left', y: 300, title: '云澜大桥', lines: ['桥长537.4米', '桥顶约26m，赛道最高点', '累计爬升61m'] },
  // 客户 2026-10-29 ⑤：这张卡原来压在吉祥物头上，整体下移到画面左下（字幕上方）
  // 2026-11-08：新版脚本删掉了「解锁湖后」⇒ 卡片文字也跟着去掉，别让画面上出现口播里没有的词。
  //   窗口改成跟段 18 的会场停留一起（T_FEMALE_FINISH−0.9 起 2.4 s）
  { t: segT0(18), d: +(_segEnd('H18') - 0.05 - segT0(18)).toFixed(2), id: 'half', side: 'left', y: 600,
    title: '21.0975km', lines: ['湾湾冲线', '半程 10:40 关门'], color: 'half' },
  // 客户 2026-11-06：**230 米字卡从第 2304 帧（76.80 s）就出**，一直挂到冲线之后
  //   注意：卡片进场本身有 0.5s 淡入（hud.cards 的 kin），t 若正好写 2304 帧，
  //   那一帧 op=0 等于没出 ⇒ t 提前到第 2289 帧（76.30 s），2304 帧时刚好全亮
  //   2026-11-07：改成按冲线时刻倒推（原来写死 2289 帧，插台词后他会提前 3.77 s 到位）
  //   2026-11-08：但新排程里 T_MALE_FINISH−4.465 会落在**切进副本之前**（还在大地图上），
  //     所以再夹一道下限 = 「最后约230米直道」开口后 0.55 s（那时已经切进主会场副本）
  // 客户 2026-11-09：与湾湾那张**完全一致** —— 进副本即出、出副本前收；文案「蓝蓝冲线 / 全程 13:40 关门」
  { t: T_FIN_ENTRY, d: +(T_STAGE - 0.05 - T_FIN_ENTRY).toFixed(2), id: 'full', title: '42.195km',
    lines: ['蓝蓝冲线', '全程 13:40 关门'], color: 'full' },
  // 客户 2026-10-29 ⑦：撤掉「赛道全解锁」大卡，改成主舞台庆祝仪式 + 赛道信息字卡
  //   67.00s 起镜头切到主舞台，信息卡挂在画面左侧空位（舞台在右），一直挂到落版前
  // 客户 2026-11-09：第 41 条口播现在就是「湖王湖后解锁，」⇒ 卡挂到它读完
  { t: +T_STAGE.toFixed(2), d: +(lineEnd('L41') - T_STAGE).toFixed(2), id: 'info', side: 'left', y: 590, title: BRAND, shape: 'venue',
    lines: ['全马 42.195km · 半马 21.0975km', '累计爬升 61m · 海拔 4—26m', '半程 10:40 / 全程 13:40 关门', 'A、B区首发，C区第二枪'] },
];

// ── 地标贴纸：anchor = data/course.json 的 pois 键或 [x,y]；at = 蓝蓝到达该里程时弹出
// 新版脚本只提“博物馆、老街”两个城区地标，中医院贴纸先撤（要恢复把下一行取消注释）
export const STICKERS = [
  // 2026-11-08：写死的旧帧号（524/638/1131/1271/360…）全部撤掉，改成一律跟台词或里程 ——
  //   换音轨、改排程都不会再出现“卡在别处”。
  // 文渊寺（塔）**必须排最前**：卡片槽位 = 前面几张卡的占位之和，先出场的占上卡位。
  // 文渊寺必须在博物馆之前 0.2–0.9 s 出现（两张卡要依次占上下卡位）
  // 2026-11-01：改成**相对博物馆卡的出场时刻**（博物馆卡 T0 = tAtKm(2.73 − lead=0.5)），
  //   早 0.5 s 出场。原来写死 tAtKm(2.73) − 1.75，博物馆之后新增一句改变了 2.2–2.7 km 的时速，
  //   两者只差 −0.03 s（两张卡同时进下卡位，会叠在一起）。
  { id: 'baosi', art: 'baosi', name: '文渊寺', anchor: 'baosheng_temple',
    fromFrame: F(tAtKm(2.73 - 0.5) - 0.5), toFrame: F(lineEnd('L08') + 0.6), side: 'right' },
  { id: 'museum', art: 'museum', name: '澜湾博物馆', anchor: 'museum', at: 2.73, lead: 0.5, hold: 2.6, side: 'right' },
  // 老街：等博物馆升到上卡位之后才进下卡位（否则两张卡在下卡位叠着出现）
  { id: 'oldstreet', art: 'oldstreet', name: '澜湾老街', anchor: 'old_street',
    fromFrame: F(lineT('L09') - 0.35), toFrame: F(lineEnd('L10') + 0.9), side: 'right' },
  // 银杏大道：锚点取大道右端，引线指向吉祥物前方，缩短遮挡
  // 客户 2026-11-09：**「秋日限定」角标加回来**（之前按 2026-10-27 的口径删了）
  { id: 'sequoia', art: 'sequoia', name: '银杏大道', anchor: { km: 12.60 }, tag: '秋日限定',
    fromFrame: F(lineT('L16') - 0.3), toFrame: F(lineEnd('L17') + 0.4), side: 'right' },
  // 云澜大桥：第一次过桥全程（段 9 上桥 → 段 11 收）
  // 2026-11-08 客户：**7.5 km 处出云澜大桥图卡，同时开口播第 11 句**
  { id: 'bridge', art: 'bridge', name: '云澜大桥', anchor: { km: 8.35 },
    fromFrame: F(lineT('L11')), toFrame: F(lineEnd('L15') + 0.3), side: 'right' },
  // 客户 2026-11-09：**12.6 km 就要出场**
  { id: 'watertown', art: 'watertown', name: '云澜湖悦水湾', anchor: 'water_town',
    fromFrame: F(tAtKm(12.6)), toFrame: F(lineEnd('L19') + 0.6), side: 'right' },
  // 滨湖公园横跨 23–35 km 全部水岸：按蓝蓝到达里程触发，收在“29.1 折返”读完
  // 客户 2026-11-09：「全马专属」角标加回来
  { id: 'lakepark', art: 'lakepark', name: '云澜水岸滨湖公园', follow: { km0: 22.6, km1: 36 },
    fromKm: 22.6, toFrame: F(lineEnd('L31')), side: 'right', only: 'full', tag: '全马专属' },
  // 2026-11-08 客户：**刚到 39 km 就可以出湿地卡**（第 32 句开口那一刻）
  // 客户 2026-11-09：黄点直接点到 **40 km 与 41 km 两块路牌的正中间**（= 40.5 km 处）
  { id: 'wetland', art: 'wetland', name: '云澜湖国家城市湿地公园', anchor: { km: 40.5 },
    fromFrame: F(tAtKm(39.0)), toFrame: F(lineEnd('L34') + 0.02), side: 'left', only: 'full', tag: '全马专属' },
];

// ── 项目点：两只吉祥物“经过”的时间点由这里算（分镜表/旁白核对都用它）
//   full / half = 该点在两条路线上的里程；null = 这条线不经过
export const POINTS = [
  { id: 'start', name: '起点 · 澜渚洲公园', route: 'both', full: 0.00, half: 0.00, kind: 'start', note: '星湖南路，A/B 区首发' },
  { id: 'museum', name: '澜湾博物馆', route: 'both', full: 2.73, half: 2.64, kind: 'poi', note: '脚本写“约2.5公里”' },
  { id: 'oldstreet', name: '澜湾老街', route: 'both', full: 6.38, half: 6.24, kind: 'poi', note: '脚本写“约5.8公里”' },
  { id: 'bridge1', name: '云澜大桥（第一次 · 蓝）', route: 'both', full: 8.20, half: 8.10, kind: 'bridge', note: '桥长537.4m，桥顶约26m' },
  { id: 'sequoia', name: '银杏大道', route: 'both', full: 11.90, half: 11.80, kind: 'poi', note: '秋日限定' },
  { id: 'watertown', name: '云澜湖悦水湾', route: 'both', full: 15.65, half: 15.55, kind: 'poi', note: '湖水清澈、花海环绕' },
  { id: 'uturn18', name: '约18.5km 折返', route: 'both', full: 18.50, half: 18.40, kind: 'uturn', note: '半马前最远点（官方图 18.5km，新台词未点名）' },
  { id: 'bridge2', name: '云澜大桥（第二次 · 红）', route: 'both', full: 19.20, half: 19.10, kind: 'bridge', note: '上桥控制心率' },
  { id: 'uturn_nanyi', name: '澜湾北路折返', route: 'both', full: 19.61, half: 19.51, kind: 'uturn', note: '全半马共同' },
  { id: 'split', name: '环湖大道分流点', route: 'both', full: 20.91, half: 20.80, kind: 'split', note: '半马左转、全马右转' },
  { id: 'half_direct', name: '半马终点前直道（约230m）', route: 'half', full: null, half: 20.87, kind: 'finish', note: '金色冲刺带' },
  { id: 'half_finish', name: '半马终点 21.0975km', route: 'half', full: null, half: 21.0975, kind: 'finish', note: '湾湾冲线 · 解锁湖后' },
  { id: 'lakepark', name: '云澜水岸滨湖公园', route: 'full', full: 22.40, half: null, kind: 'poi', note: '脚本 22.6—36km 段（2026-11-09 新稿）' },
  { id: 'timing_east', name: '东岸计时点', route: 'full', full: 29.19, half: null, kind: 'timing', note: '官方图唯一 180° 掉头处' },
  { id: 'uturn_29', name: '全马折返点（图上 29.2km）', route: 'full', full: 29.20, half: null, kind: 'uturn', note: '脚本写“约29.1公里”（2026-11-01 新录音）' },
  { id: 'people_hospital', name: '人民医院', route: 'full', full: 39.24, half: null, kind: 'poi', note: '回程城区段' },
  { id: 'wetland', name: '云澜湖国家城市湿地公园', route: 'full', full: 40.59, half: null, kind: 'poi', note: '40—41km 段' },
  { id: 'return', name: '回到星湖南路', route: 'full', full: 41.40, half: null, kind: 'poi', note: '起终点同一路口' },
  { id: 'full_direct', name: '终点前直道（约230m）', route: 'full', full: 41.90, half: null, kind: 'finish', note: '金色冲刺带' },
  { id: 'finish', name: '终点拱门', route: 'both', full: 42.195, half: 21.0975, kind: 'finish', note: '蓝蓝冲线 · 解锁湖王' },
];

// ── 其它事件（type 由 engine/timeline.js 解释；t 固定 = 仪式类，at.km = 赛程类）
export const EVENTS = [
  { type: 'loading', t: 0, d: lineT('L01') + 0.7, text: '澜湾马拉松地图加载中' },
  { type: 'reveal', t: lineT('L01') - 0.15, d: 2.3 },              // 赛道线从起点一路点亮
  { type: 'arch', t: lineT('L03') - 0.4, label: '起点 START' },
  { type: 'arch', t: lineT('L36'), label: '终点 FINISH' },
  { type: 'zones', t: lineT('L04') - 0.7, d: 4.4 },
  { type: 'gun', t: lineT('L04') - 0.1, zones: 'AB', label: 'A/B区首发' },
  { type: 'gun', t: lineT('L04') + 1.5, zones: 'C', label: 'C区第二枪' },
  { type: 'go', t: T_GO },
  { type: 'bridge', at: { km: 6.75 }, d: 10.2, rise: 1.0, color: 'bridge1', build: true },   // 提前隆起 + 长塔长索，20.0s 前成型（吉祥物 20.36s 到桥下）
  { type: 'bridge', at: { km: 17.00 }, d: 7.0, rise: 0.55, color: 'bridge2', warn: '体力下降 + 爬坡' },
  // 只留暖色氛围光，不再挂“秋日限定”字卡（客户 2026-10-27）
  { type: 'autumn', at: { km: 12.00 }, d: 5.6 },
  // 折返点（客户 2026-10-27：不做路牌，直接在地面刷 U 型掉头标识）
  // 折返点（客户 2026-10-27 九批）：**地面只写“折返点”三个字**（黄色 U 型导流线整组删掉），
  // 提前 **2 km** 就出现（对齐补给图标那套 ±2km 口径），跑到点位后 0.3 km 收。
  { type: 'uturn', at: { km: 17.61 }, d: +(tAtKm(19.90) - tAtKm(17.61)).toFixed(2),
    km: 19.61, label: '澜湾北路折返', paint: '折返点', fsPt: 18,
    // ── 手动微调区（改完跑 npm run preview 即可看到）
    //    rotDeg: 相对“沿赛道”再转多少度，正 = 顺时针（屏幕上数的方向）
    //    axis:   默认沿赛道；写 'across' 就是横跨路面
    rotDeg: 60 },
  // 同上：提前 2 km 出现，跑到 29.50 收
  // 2026-11-08：V=0.80 比旧配速慢一倍 ⇒ 提前量从 2 km 收到 0.6 km（28.60），
  //   否则「折返点」地面字在他还在 27.2 km 时就亮起来，实际 29.2 才到（差 4.8 s）。
  { type: 'uturn', at: { km: 28.60 }, d: +(tAtKm(29.50) - tAtKm(28.60)).toFixed(2),
    km: 29.20, label: '全马折返点', paint: '折返点', fsPt: 25,
    rotDeg: 90 },
  // 分流标志（客户 2026-11-05 ⑥）：取消分屏后靠这个把“一左一右”讲清楚
  //   20.50 出现（拉近机位刚开始）→ 蓝蓝跑到 21.35 收（镜头拉回中景）
  // 分叉标志收到 1570 帧（副本进场那一刻）为止 —— 否则副本淡入时地上还飘着分流箭头
  // 客户 2026-11-06（最新）：**牌面一直挂到切副本那一刻**（1570 帧 = 52.333 s）才跟着渐隐。
  //   d 设成 52.333 − 48.95 = 3.383；drawFork 的 op 在最后 0.5 s 线性降到 0，
  //   所以 51.83 起淡、52.33 淡净，正好接上副本的硬切
  // 2026-11-08：分叉牌只在“切进分流副本前”那 2 s 起作用（副本里有自己的分流牌）
  { type: 'fork', t: +(T_SPLIT - 1.60).toFixed(3), d: 2.10 },
  // 半马降暗：按**湾湾冲线**时刻，不按蓝蓝里程（换了配速 km 反推会提前/滞后）
  { type: 'dimHalf', t: +(T_FEMALE_FINISH + 0.10).toFixed(2) },
  // 客户 2026-10-27 第二轮：22–40km 全程匀速 ⇒ “加速通过”角标和速度线整段取消
  // 客户 2026-11-05 ②：**结尾落版整段去掉** —— 片子停在主舞台的庆祝镜头上收尾，
  //   不再切一张带标题/数据/湖王湖后的落版画面（素材与 src/art/endcard.js 仍留档，要恢复就接这一行）
  // { type: 'endTitle', t: ENDCARD_T.t0, d: DURATION - ENDCARD_T.t0 },
];

// ── 公里牌：show=false 可整体隐藏；hide 为不显示的全马里程区间
// 字幕按脚本写“约25km 全马折返点”，而图上真实折返在 29.2 km → 隐藏 26–29 公里牌避免同屏穿帮
// 客户 2026-10-27：补一块 29 公里牌（折返点），其余 25.6–39.5 仍然不显示（加速段避免与旁白撞）
// 客户 2026-10-29 第四版：环湖段配速改成“读完滨湖公园就 29、读完折返就 39”，
//   28.85–29.15 这个窗口只剩 0.1s（牌子来不及看见）⇒ 放宽到 28.55–29.55，正好罩住折返点前后 1 km
// 客户 2026-11-01：折返点重新念回「约29.1公里」⇒ 隐藏区间前端退回 25.6（25 牌可以露出来了）
export const KM_BADGES = { show: true, hide: [[25.6, 28.55], [29.55, 39.5]] };
// ── 海拔小窗口径：'official' = 官方 AI 路线图剖面（2–20 m）；'script' = 按脚本线性换算成 4–26 m
//    客户口径（2026-10-27）：路线本身按官方剖面；大桥桥面另有高度，单独用一条虚线画到 26 m
export const BRIDGE_ELEV = { deck: 26, label: '桥面 26m' };
export const ELEV_WIN = {
  t0: lineT('L01') + 0.75,       // 加载条撤掉、地图亮相之后
  t1: DURATION - 1.25,           // 片尾题字开始之前
};
export const ELEV_MODE = 'official';

// ── 功能点（补给点）图标簇 —— 客户 2026-10-27 口径
//    · 只按距离出现：吉祥物离点位 radius 公里内显示，跑出这个半径自动消失（全片同一套）
//    · 卡片钉在该落点正上方 lift 像素；不逐帧避让、不随镜头推拉上下滑（那才是“漂移”）
export const STATION_POP = { radius: 2.0, fade: 0.35, lift: 260 };
