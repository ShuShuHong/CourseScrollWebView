// ════════════════════════════════════════════════════════════════════════
//  副本场景（主会场 · 起跑前平面图）—— 按官方平面图米制重建
//
//  依据：官方 .ai 第 2 页「主会场平面图(起跑前)」。页面上这些字全是转曲的，
//  所以先用 Windows OCR 读出每个标签的位置，再对填充色做连通域（tools/_venue_blocks.py），
//  得到每个实体的 pt 矩形，最后按 1 pt = 11.58 cm（路宽 190 pt = 22 m 定标）换算成米。
//
//  官方图方位（客户 2026-10-29 确认）：**左=北 右=南 上=东 下=西**
//    → 页面 +x = 南，页面 -y = 东
//    → 世界 +x = 北（跑进方向），世界 +z = 西（广场/主舞台侧），世界 -z = 东（澜渚洲公园侧）
//  原点 = 起终点线中心（官方 pt 2325..2400 那道 S/F 门头），y = 高度，单位米。
//
//  为什么不用官方图直接当底图：它 1 pt ≈ 11.6 cm（整页 ≈ 420 m × 144 m），比全图
//  （3.34 m/pt）细 30 倍，直接贴图会失去方位感；近景舞台要在**同一套真实尺寸**下重建。
// ════════════════════════════════════════════════════════════════════════

/** 官方页面 pt → 米（路宽 190 pt = 22 m；页面 S/F 门头 x 2325..2400 归零） */
import {
  T_CROWN_MALE, T_FIN_CROSS, T_FIN_ENTRY, T_STAGE, T_GO, T_FEMALE_FINISH, T_MALE_FINISH,
  SPLIT, DURATION, lineT, lineEnd, SEGS,
} from './story.js';

/** 按段号（或 'H18' / 'H24' = 停留段）取排程段 —— 副本窗口的唯一来源 */
const SEG_S = (n) => {
  const s = SEGS.find((x) => x.n === n);
  if (!s) throw new Error('venue: unknown seg ' + n);
  return s;
};
import { SP, femaleAt, maleAt } from './split.js';

// ── 四个副本窗口：2026-11-08 起全部由**排程段**给（不再按旧帧号写死）
//    start  段 1–3   ：片头加载条之后 → 段 4 开口（起跑瞬间切出会场）
//    split  段 17    ：分流丁字路口（整段台词都在副本里说完，客户明确）
//    half   段 18    ：湾湾 230 m 冲刺 → 冲线 → 加冕，**连 2.13 s 加冕停留一起**留在会场
//    fin    段 24（L36 起）–25：最后 230 m + 42.195 数据卡 + 片尾
export const WIN_T = {
  // 2026-11-08（公里窗口版）：四个窗口全部从**排程段**取，不再写死帧号
  //   start  段 1–3             ：片头 → 段 4 开口（起跑瞬间切出会场）
  //   split  段 17 内第 24 句    ：分流丁字路口（客户：分流副本完成口播 24、25）
  //   half   段 18 + 加冕停留     ：湾湾 230 m 冲线 → 加冕
  //   fin    段 24（L36 起）–25   ：41.965 km（最后 230 m 起点）进会场 → 蓝蓝冲线 → 数据卡
  start0: +SEG_S(1).t0.toFixed(3), start1: +SEG_S(4).t0.toFixed(3),
  split0: +SEG_S(17).cuts[0].t.toFixed(3), split1: +SEG_S(18).t0.toFixed(3),
  half0: +SEG_S(18).t0.toFixed(3), half1: +SEG_S('H18').t1.toFixed(3),
  // 客户 2026-11-01：副本入口从「段 24 起点」挪到「L36（最后约230米直道）开口」——
  //   L35「右转进入星湖南路」留在大地图的星湖南路上说完，L36 才切进会场冲刺。
  fin0: +T_FIN_ENTRY.toFixed(3), fin1: +(DURATION + 0.09).toFixed(2),
  // 2026-11-09 客户：口播 35/36 读完才冲线 → 加冕 → 欢呼 2.5 s → 切主舞台。
  //   三个时刻全在 story.js 里由 schedule.js 的 FIN 推出来，和排程的 H24 停留同一份口径。
  stage: +T_STAGE.toFixed(2),                                 // 切主舞台（加冕后 2.5 s）
  cross: {
    half: +(T_FEMALE_FINISH - 0.29).toFixed(2),                // 湾湾过线（比“说完”早 0.29 s）
    full: +T_FIN_CROSS.toFixed(2),                             // 蓝蓝过线（口播 36 读完 + 0.5 s）
  },
};
/** 起跑枪响（C 区第二枪）：口播 L04 开口后 1.5 s —— 与 story.js 的 gun 事件同一口径 */
const START_GO = +(lineT('L04') + 1.5).toFixed(3);

/** 分流副本窗口长度（去比例用） */
export const SPLIT_W = +(WIN_T.split1 - WIN_T.split0).toFixed(4);

// ── 起点分区配色（客户 2026-11-08 第①条，取自官方平面图）
//   A/B 区 = 紫 #9B62A4 · C 区 = 黄 #FFF243
//   实测：官方图上 A/B 连片的填色 (155,98,164)、C 区 (255,242,67)
export const ZONE_PURPLE = '#9B62A4';
export const ZONE_YELLOW = '#FFF243';

export const M_PER_PT = 0.11579;
export const PT_ORIGIN = { x: 2362, y: 1965 };
/** 页面 pt → 世界米（+x 北 / +z 西） */
export const fromPlan = (px, py) => [
  +((PT_ORIGIN.x - px) * M_PER_PT).toFixed(2),
  +((py - PT_ORIGIN.y) * M_PER_PT).toFixed(2),
];

/** 舞台尺度（米）—— 括号里是官方图上的 pt 范围，改数字前先回去量 */
export const V = {
  road: { x0: -76, x1: 273, halfW: 11 },             // 星湖南路：pt 1870..2060 = 22 m（路面在 C 区口结束）
  /** 南端弯折：官方图里路面在 C 区口（x≈-76）折向东南，贴着 C 区左边界跑。
   *  这里直接给中心线控制点（比圆弧更贴图），最后几段是出场的环湖大道 */
  /** 南端弯折：半径 r、转 turn 度（正 = 向东 / +z），之后直出 ext 米到环湖大道 */
  bend: { r: 48, turn: 75, ext: 60 },
  walk: { w: 2.2 },                                   // 人行道宽
  arch: { x: 0, span: 24, clear: 9.2, depth: 3.2 },   // S/F 门头，跨 22 m 路 + 两侧各 1 m
  tape: { x: 0.9, h: 1.15 },
  finishLine: { w: 0.5 },
  /** A/B 分区：pt 矩形直译（A 2412..2584 / B 2647..2972） */
  zones: [
    { id: 'A', x0: -25.9, x1: -6.0, z0: -8.7, z1: 10.3, color: ZONE_PURPLE, sub: 'A/B 首发' },
    { id: 'B', x0: -70.9, x1: -33.2, z0: -8.5, z1: 10.1, color: ZONE_PURPLE, sub: '' },
  ],
  /** C 区（客户 2026-11-03）：不再是一大片地面，而是**沿弯道往后延伸的一条集结带**，
   *  宽度与 A/B 一致（19 m），但有长度、有拐弯 —— 路面也就跟着它一起拐。
   *  arc0/arc1 = 从弯道起点（x = road.x0）沿中心线量起的弧长（米） */
  zoneC: { arc0: 0, arc1: 58, halfW: 9.4, color: ZONE_YELLOW },
  /**
   * C 区三岔路口（客户 2026-11-08 手绘红线）
   *   west / east = 客户在截图里画的两条红线（世界坐标，从截图按 13.915 px/m 反算）。
   *   路口 = 这两条线 + 现有路外缘 + 现有路北边线 围出来的那一大块，全部铺成路面。
   *   蓝色 C 带在 y=0.34，压在这层路面上，形状与面积都不变。
   *   三岔口不画双黄线（客户明确取消）。
   */
  junction: {
    // 客户 2026-11-08：红线是手描参考 ⇒ 不照抄。
    //   nw   = 支路口西角（平面图 8 点）
    //   east = 支路口东角（平面图 9 点）
    //   2026-11-08-j：西边界不再用「过 A、与路缘相切」的弧，
    //     改成**三点定圆**：A(nw) → arcMid(5 点) → q(6 点)。客户在平面图上直接给了这三个点。
    //   q 会自动吸附到主路外缘上最近的那一点，保证接缝严丝合缝。
    nw: [-143.0, -52.0],
    east: [-111.0, -52.0],
    arcMid: [-126.8, -24.1],   // 5 点：西边界弧必须经过
    q: [-131.5, 27.4],         // 6 点：西边界并入主路外缘
  },
  /** 东侧（公园侧）帐篷带：pt y 1772..1847 = z -22.4..-13.7 */
  tentStrip: { z0: 13.7, z1: 22.4 },
  tents: [
    // 客户 2026-11-05 ⑥：按官方平面图补齐 —— 东侧帐篷带自北向南：完赛物资发放区 → 加油助威区 → 啦啦队 → 媒体区
    { id: 'supply', text: '完赛物资发放区', x0: 76.0, x1: 96.0, color: '#1F63E0' },
    { id: 'cheer', text: '加油助威区', x0: 60.0, x1: 72.4, color: '#FBB040' },
    { id: 'squad', text: '啦啦队', x0: 38.6, x1: 56.3, color: '#FBB040' },
    { id: 'media', text: '媒体区', x0: 26.4, x1: 38.8, color: '#FBB040' },
  ],
  /** 安保车辆停车区（官方平面图东北角那块黄区） */
  security: { x0: 64, x1: 104, z0: 32, z1: 42, color: '#FFD24A' },
  led: { x: 15.0, z: 33, w: 10, h: 6 },             // LED 屏 pt 2196..2266
  water: { x: 116.3, z: 30.2, w: 15.8, d: 5.2 },      // 赛后饮水站 pt 1289..1425 × 1682..1727
  gates: [{ x: -21.3, z: 15.4 }, { x: -67.9, z: 15.4 }, { x: -114.6, z: 20 }], // 检录口
  stage: { x: 20.3, z: -18.2, w: 15, d: 11, top: 1.15 },   // 主舞台 pt 2120..2250 × 2075..2170；台面高 1.15 m
  actor: { x: 47.7, z: -22.9, w: 21.5, d: 8.6 },        // 演员候场区
  viewer: { x0: 43.4, x1: 57.9, z0: -15.6, z1: -8.7 },   // 观众观摩区
  sponsor: { x0: 78.8, x1: 90.8, z: -11.8 },            // 企业广告牌（终点直道西侧）
  wc: { x: -67.3, z: 38.9 },                          // WC pt 2941 × 1629
  storage: { x0: 100, x1: 150, z: -26, n: 5 },          // 存衣车（广场远端，背景用）
  /** 西侧（广场/城市）的城市界面：停车场、充电桩、指挥中心、转播区、居民楼（客户 2026-11-01） */
  urban: {
    // 停车场两处：北段（原有）+ 南段（开场镜头左边这块）
    lots: [
      { x0: 92, x1: 178, z0: -44.5, z1: -31.0, bays: 16 },
      { x0: -140, x1: 40, z0: -45.0, z1: -32.0, bays: 22 },
    ],
    charger: { x0: -136, x1: 176, z: -30.3, n: 14 },
    command: { x: -46, z: -34.5, w: 13, d: 7.5, h: 3.6 },
    broadcast: { x: 14, z: -36.5, w: 15, d: 8.5, h: 3.4, dish: true },
    // 临街低层商铺（3.4–4.6 m），把近处那条灰带填满
    shops: [
      { x: -132, w: 22, h: 4.2 }, { x: -104, w: 18, h: 3.8 }, { x: -72, w: 20, h: 4.4 },
      { x: -40, w: 18, h: 4.0 }, { x: -8, w: 16, h: 3.9 }, { x: 30, w: 20, h: 4.3 },
      { x: 74, w: 24, h: 4.6 }, { x: 140, w: 20, h: 4.1 },
    ],
    shopZ: -46.5,
    // 现代居民楼：横跨整条西侧，z 拉到 -58 才不至于被雾气吞掉
    // 客户 2026-11-08-c：新岔路口（x 到 −143）西侧那栋 24 m 的大楼去掉 —— 它贴在路口边上，
    //   挡住路口收口的曲线，画面里非常突兀。
    towers: [
      { x: -110, w: 19, d: 14, h: 30 },
      { x: -72, w: 16, d: 12, h: 26 }, { x: -28, w: 18, d: 13, h: 32 },
      { x: 12, w: 15, d: 12, h: 27 }, { x: 54, w: 19, d: 14, h: 23 },
      { x: 104, w: 17, d: 13, h: 29 }, { x: 156, w: 21, d: 15, h: 25 },
    ],
    towerZ: -56,
    hedge: { z: -29.2, x0: -150, x1: 208 },
    lamp: { z: -13.4, x0: -140, x1: 246, step: 32 },
  },
  /** 公园 / 水面 / 广场 / 城市地块 */
  park: { x0: -150, x1: 280, z0: 13, z1: 80 },
  pond: [[104, 42], [60, 46], [10, 50], [-40, 58], [-74, 62], [-74, 78], [104, 78]],
  pond0: { z0: 44, z1: 61 },                         // 水面外缘（画岸线用）
  plaza: { x0: -86, x1: 200, z0: -30, z1: -11 },
  city: { x0: -180, x1: 290, z0: -84, z1: -30 },
  /** 城市地块（西侧，背景）：pt 位置换算后的 x 中点在括号里 */
  blocks: [
    { x: 219, w: 16, name: '苏宁雅居' }, { x: 120, w: 60, name: '海蓝中堂' },
    { x: 40, w: 40, name: '澜庭一品' }, { x: -54, w: 38, name: '云湖美锦东区' },
  ],
  streets: [{ x: 170, name: '吉泰路' }, { x: 16, name: '湘南路' }, { x: -104, name: '环湖大道', diag: true }],
  /** 230 m 直道刻度（距终点线的米数；牌子立在路东缘） */
  marks: [230, 200, 150, 100, 50],
  flagStep: 26,
  /** 观众带：西侧沿路（终点直道两侧人流最多），东侧只在拱门附近零星 */
  crowd: { x0: -40, x1: 245, z0: -17.4, z1: -13.6, rows: 3 },
};

/** 三个副本窗口（时间来自 voice.js 的口播行，改音轨会自动跟着走）
 *  track: 机位跟随谁（'female' 只跟湾湾；'pair' 跟两只的中间）
 *  片尾窗口 2026-10-28 提前到 62.60s：对齐 L35 "最后约230米直道"，蓝蓝从 230 m 冲进来 */
export const VENUE_WINDOWS = [
  { id: 'start', kind: 'start', t0: WIN_T.start0, t1: WIN_T.start1, track: 'pair' },
  // 客户 2026-11-06（第二副本）：分流丁字路口 —— 整屏切进另一套 three.js 场景（scene:'split'）
  // 2026-11-07：改成**硬切进场**（noFadeIn）—— 地图层在 50.0 s 时两只吉祥物已经画在岔口上了，
  //   淡入会让前 0.5 s 露出那张“位置不对”的地图
  { id: 'split', kind: 'split', t0: WIN_T.split0, t1: WIN_T.split1, track: 'female', scene: 'split', noFadeOut: true, noFadeIn: true },
  // 半马分屏：开屏比「半马最后约230米直道」(L26) 早 4.95 s —— 让观众先看到她在直道上跑；
  //   收屏在湾湾冲线后 3.09 s，留出戴冠庆祝。时刻全部来自 voice.js（换音轨自动跟着走）
  // 客户 2026-11-06（最新）：**1818 帧直接硬切回大地图** —— 不做渐隐，
  //   切过去的那一刻画面里立刻只剩蓝蓝（湖后不在这段全图里出场）
  // 2026-11-06 追加：分流副本 54.76 结束 ⇒ 这里**硬切进来**（noFadeIn），中间不再露一帧大地图
  { id: 'half', kind: 'half', t0: WIN_T.half0, t1: WIN_T.half1, track: 'female', noFadeOut: true, noFadeIn: true },
  // 客户 2026-10-31 ⑦：结尾不回全图 ⇒ 这个窗口**不做淡出**（片长结束时画面停在主舞台）
  // 2026-11-01：入口挪到 L36 之后，0.5 s 淡入会让「星湖南路」和主会场**双影叠在一起**
  //   （地图那张正对着起终点门头，叠出来很脏）⇒ 与另外两个副本同口径，**硬切进场**。
  { id: 'finale', kind: 'finale', t0: WIN_T.fin0, t1: WIN_T.fin1, track: 'pair', noFadeOut: true, noFadeIn: true },
];

/** 吉祥物在副本里的走位（米）。返回 { maleX, femaleX, z, mood, stage } */
export function venuePose(win, t) {
  const k = (t - win.t0) / (win.t1 - win.t0);
  // ── 第二副本：分流丁字路口（客户 2026-11-06）
  //   两只吉祥物并排朝东跑（+x），到岔口湾湾左转（-z 星湖南路）、蓝蓝右转（+z 柳堤南路）。
  //   这里给的是**场景世界坐标**（+x 东 / +z 南），和 split3d.js 用的是同一套。
  if (win.kind === 'split') {
    // 客户 2026-11-06 第二批：两条车道早在岔口前 120 m 就分开，湾湾在北侧车道、蓝蓝在南侧车道；
    // 这里按弧长 s 走位（负 = 还没到岔口），s 从 SP.s0 起、按 SP.speed 推进。
    // 2026-11-08：窗口从 4.93 s 变成 6.22 s ⇒ 不能再按“每米固定速度”走，
    //   否则她会在 59 s 冲出路口 80 m（实测 x=0.5 / z=−81.5）。
    //   改成**按窗口比例推进到同一个终点弧长** SP.sEnd，走位与机位关键帧就都跟窗口长度无关了。
    const kk = Math.max(0, Math.min(1, (t - win.t0) / (win.t1 - win.t0)));
    const s = SP.s0 + (SP.sEnd - SP.s0) * kk;
    const f = femaleAt(s), m = maleAt(s);
    const lean = (h) => Math.max(-18, Math.min(18, h * 0.28));
    return {
      maleX: m.x, maleZ: m.z, femaleX: f.x, femaleZ: f.z,
      mood: 'run', stage: 1, still: false, back: true, noLock: true,
      maleLean: lean(m.heading), femaleLean: lean(f.heading),
      longShadow: 1.0,
    };
  }
  if (win.kind === 'start') {
    // 分区里站定 → 发枪后冲出起点线
    // 2026-11-08 客户：**直到切走那一刻（F296）两只都还在往前跑，动势不许减**
    //   旧写法 GO=8.64 + 0.66 s 的 smoothstep 冲出 26 m ⇒ 9.30 就跑到头站住了，
    //   276–296 帧看起来像“停在起跑线附近”。
    //   现在：GO 取 C 区第二枪那一刻，之后**恒速直线**跑到窗口末，全程同速不减速。
    const GO = START_GO;
    const X0 = -7.5;
    if (t < GO) return { maleX: X0, femaleX: X0, z: 0, mood: 'cheer', stage: 0, still: true };
    const v = 26 / Math.max(0.9, win.t1 - GO);   // m/s：窗口末尾正好 +26 m，且全程同速
    const x = X0 + v * (t - GO);
    return { maleX: x, femaleX: x, z: 0, mood: 'run', stage: 0, still: false };
  }
  if (win.kind === 'half') {
    // 客户 2026-10-29：一开屏（F1234 = 41.133s）就是她已经在最后 230 m 直道上冲刺，
    //   不再做"从 268 m 远处跑进来"的进场（那样开屏第一秒画面是空的）。
    // 客户 2026-11-05 ⑦：**冲刺方向反了** —— 世界 +x 才是北，她必须从南（-x）往北（+x）跑。
    //   原来 x0=30→x1=-1.2 是从北往南跑。现在 x0=-30（南）→ x1=+1.25（越过 x≈0.9 的终点线）。
    const A = WIN_T.half0, B = CROSS.half, x0 = -30, x1 = 1.25;
    let x;
    if (t <= A) x = x0;
    else if (t >= B) x = x1;
    else {
      const u = (t - A) / (B - A);
      // 起步略慢、中段最冲、临线稍收（不是匀速，读起来才有"冲刺"）
      const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, u * 1.06));
      x = x0 + (x1 - x0) * e;
    }
    // 过线**立马**解锁湖后（客户 2026-10-29）：撞线那一刻就切 win + stage 2 并撒花
    const settled = t >= B;
    return {
      maleX: null, femaleX: x, z: 0, mood: settled ? 'win' : 'run', stage: settled ? 2 : 1,
      // 客户 2026-10-30 ④：F1420（47.333s）她已经在冲刺途中戴着王冠 ⇒ 冠冕取 46.95（留 0.4s 弹出）
      still: t >= B + 0.55, femaleCrownAt: B + 0.10, femaleConfettiAt: B + 0.10,
    };
  }
  // finale（客户 2026-10-28）：窗口从 L35"最后约230米直道"开，蓝蓝从 230 m 冲进来，65.20s 撞线。
  //   湾湾早已在终点（半马冲线时已解锁湖后，全程保持 stage 2 + 欢呼），站在路北侧半条道上，
  //   蓝蓝冲刺时不和他叠在一条线上。
  //   蓝蓝皇冠：撞线后先喘口气（m1 只有 run / tired 两套图，没有 m1_cheer，用 cheer 会掉披风），
  //   口播"湖王湖后解锁"（T_CROWN_MALE = L40 入点 71.00s）才加冕。
  // 67.00s 之后：两只站在主舞台上做庆祝仪式（机位同时切到舞台正面）
  if (t >= STAGE_T) {
    return {
      maleX: STAGE_POS.maleX, femaleX: STAGE_POS.femaleX, z: STAGE_POS.z, y: STAGE_POS.y,
      maleZ: STAGE_POS.z, femaleZ: STAGE_POS.z + 1.1,
      maleStage: 2, femaleStage: 2, maleMood: 'win', femaleMood: 'win',
      mood: 'win', stage: 2, still: true, maleStill: true, femaleStill: true,
      onStage: true, maleCrownAt: T_CROWN_MALE, femaleCrownAt: CROSS.half + 0.10,
    };
  }
  const M_FIN = CROSS.full;
  // 客户 2026-11-05 ⑦：蓝蓝冲刺同理，从南（-x）往北（+x）冲过终点线
  //   x0 取 -55：再往南（<-76）就出了直道、跑到弯道上了（客户截图里他站在弯道上）
  const A = win.t0, x0 = -55, x1 = 1.25;
  let mx;
  if (t <= A) mx = x0;
  else if (t >= M_FIN) mx = x1;
  else mx = x0 + (x1 - x0) * ((t - A) / (M_FIN - A));
  // 客户 2026-10-29：蓝蓝冲线同理 —— 过线即加冕，随后切到主舞台做庆祝仪式
  // 客户 2026-10-30 ⑤：撞线那一刻才加冕（F1958 = 65.27s 时他还在线上方，不该戴冠）
  const CROWN_M = M_FIN + 0.35;
  const crowned = t >= CROWN_M;
  const maleMood = crowned ? 'win' : 'run';
  return {
    maleX: mx, femaleX: null, z: 0, maleZ: 0, femaleZ: -1.6,   // 湾湾已在主舞台，冲刺镜头里不出现
    maleStage: crowned ? 2 : 1, femaleStage: 2,
    maleMood, femaleMood: 'win',
    // 旧字段（只给还没改的读者用）：取蓝蓝的
    mood: maleMood, stage: crowned ? 2 : 1,
    still: t >= M_FIN,
    maleStill: t >= M_FIN, femaleStill: true,
    maleCrownAt: CROWN_M, maleConfettiAt: M_FIN,
    // 湾湾在片尾不再放加冕特效（半马冲线时已放过）
  };
}

/**
 * 冲线瞬间（片子时刻）——角色动画与撒花必须是同一个数。
 *   half 48.15 = 第二段冲刺里 x 从 230 m 冲到 -1.2 m 到位的时刻（原 B 常量）
 *   full 65.20 = 片尾直道 230 m 冲到 -1.2 m 到位的时刻（原 M_FIN 常量）
 */
export const CROSS = WIN_T.cross;
/** 片尾冲刺窗口长度（L36 开口 → 蓝蓝撞线），机位关键帧按它的比例取点 */
export const FIN_W = +(WIN_T.cross.full - WIN_T.fin0).toFixed(4);

/** 片尾主舞台庆祝：67.00s 起两只已经站在台上（剪接点在冲线镜头之后） */
export const STAGE_T = WIN_T.stage;      // 切主舞台（加冕后 2.5 s，见 story.js 的 T_STAGE）
/** 主舞台上的站位（米，湾湾偏北=画面左） */
export const STAGE_POS = { maleX: 19.4, femaleX: 22.4, z: -18.4, y: 1.15 };

/** 客户 2026-11-09：**戴皇冠的序列帧整体放大 1.5 倍**。
 *  为什么不是按时间：素材里戴冠的那套图（stage 2）画得比不戴冠的小一圈，
 *  所以要补的是**素材比例**，不是「撞线后变大」的动画 —— 一切换到 stage 2 就按 1.5 倍画，
 *  切回 stage 1 就 1.0，中间没有缓入。湾湾半马冲线后同样是 stage 2 ⇒ 也按 1.5 倍，
 *  所以片尾舞台上两只一样大。 */
export const CROWN_GROW = 1.5;
/** 该角色此刻该乘的放大系数（只跟 stage 走） */
export const growOf = (stage) => (stage >= 2 ? CROWN_GROW : 1);

/** 并排锁定权重：两只相距 ≤ near 米时按"母左公右"并排画（1），≥ far 米时各画各的真实位置（0），中间 smoothstep。
 *  机位跟随与 drawVenueCrabs 共用这一份，保证"镜头跟谁"和"画在哪"一致 */
export const PAIR_LOCK = { near: 8, far: 14 };
export function pairLock(pose) {
  if (pose.noLock) return 0;                    // 分流副本：两只已经并排站在各自的路面上，不许再归位
  if (pose.maleX == null || pose.femaleX == null) return 0;
  // 距离要算二维：分流副本里两只的 x 相同、差在 z 上（±1.45 → ±十几米）
  const dx = pose.maleX - pose.femaleX;
  const dz = (pose.maleZ ?? 0) - (pose.femaleZ ?? 0);
  const d = Math.hypot(dx, dz);
  const u = Math.min(1, Math.max(0, (PAIR_LOCK.far - d) / (PAIR_LOCK.far - PAIR_LOCK.near)));
  return u * u * (3 - 2 * u);
}

/** 机位要跟的那个 x：female / male 跟单只；pair 在两只靠拢时跟中点，分开时跟正在跑的蓝蓝 */
export function liveTargetX(win, pose) {
  const m = pose.maleX, fx = pose.femaleX;
  if (win.track === 'female') return fx ?? null;
  if (win.track === 'male') return m ?? null;
  if (m == null) return fx ?? null;
  if (fx == null) return m;
  const L = pairLock(pose);
  return m * (1 - L) + ((m + fx) / 2) * L;
}

/** 机位关键帧（客户 2026-10-28 · M1 重排）
 *  规则：副本里 dist 一律 12–65 m（片尾最后一镜拉出允许到 80）；要"看全场"用高俯角，不用拉远。
 *  target：[x,z] = 静态点；'pair' | 'male' | 'female' = 跟角色；'arch' = 拱门。
 *  follow：0..1，x 跟角色的权重（缺省：字符串 target = 1，其余 = 0），关键帧之间 pchip 平滑过渡，
 *    所以"先看场地、再跟吉祥物"在切换处不会跳。（旧版 track 恒为 1，坐标 target 的 x 实际全部失效）
 *  方位：拱门横跨 z（南北），只有站在 ±x 轴上才看得见面；起跑一律站东侧（az 取负），人朝镜头跑来；
 *    冲线（半马/全马）站西侧（az 取正），人从 230 m 外朝镜头跑来。
 *  每一镜都踩口播（时刻见交接文档 §5）。 */
export const VENUE_CAM = {
  // 方位按官方图（左北右南上东下西）：az=0 站西侧（广场/舞台）看东；az=-90 站北侧看南；
  //   az=+90 站南侧看北；az=180 站东侧（公园）看西。拱门横跨 z，只有 ±x 轴上看得见面。
  start: [
    // 客户 2026-10-30 ①：开场先给远景（能看到整块 C 区），然后一口气往前推到位。
    //   机位在南侧偏西，视线顺着路轴往北（远处是门头），C 区在画面近处右侧。
    // 客户 2026-11-05 ①：窗口缩到 1.20–8.967 ⇒ 关键帧按**窗口比例**排，不再写死秒偏移
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.00, target: [-62, 14], dist: 196, az: 122, pitch: 34, frame: 0.02, ty: 0 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.05, target: [-62, 14], dist: 192, az: 121, pitch: 34, frame: 0.02 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.22, target: [-56, 12], dist: 158, az: 116, pitch: 31, frame: 0.02 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.40, target: [-48, 8], dist: 122, az: 110, pitch: 27, frame: 0.02 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.62, target: [-36, 4], dist: 88, az: 102, pitch: 22, frame: 0.02 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.78, target: [-24, 2], dist: 62, az: 96, pitch: 17, frame: 0.03 },
    { t: WIN_T.start0 + (WIN_T.start1 - WIN_T.start0) * 0.93, target: 'pair', dist: 34, az: 94, pitch: 12, frame: 0.04 },  // 贴到双宝背后
    { t: WIN_T.start1, target: 'pair', dist: 40, az: 92, pitch: 15, frame: 0.05 },
  ],
  // 客户 2026-11-06（第二副本）：分流丁字路口 —— 镜头站在路口南侧、朝北，跟着两只吉祥物往前推。
  //   az 90 = 机位在 -x（南）侧、看向 +x（北），正是「站在它们背后」；湾湾在画面左（西）、蓝蓝在右（东）。
  //   起始低机位（1.4 m、pitch 3）贴地拍，随分流推进抬到 12 m 高、pitch 14，把两条岔路一起收进画面。
  split: [
    // 客户 2026-11-07（第四版）：
    //   ① 窗口提前到 **1495 帧**（49.833 s），两只从 x = −162 起步（分流牌在 64 m 外，牌面待 ~1.7 s）；
    //   ② 湾湾**第 1612 帧（53.733 s）开始打弯** —— 机位在那一刻起转身；
    //   ③ 镜头跟**湾湾**（track: 'female'），x 与 z 都实时跟，拐弯时不会把她甩出画面。
    //   方位口径（实测 offset = (−sin az, +cos az)）：az 90 = 她身后（朝东）；az 0 = 她南侧（+z）；
    //     az 180 = 北侧（−z，那边是行道树，千万别去）。所以她拐成朝北后，机位要往 az 90 → 0 收。
    // 2026-11-08：下面这些偏移原来是对着 4.93 s 窗口调的，新窗口 6.22 s ⇒ 改写成**窗口比例**，
    //   换音轨 / 改排程都不用再逐个重调。
    // 客户 2026-11-09：**分流副本里镜头只跟湾湾，不要切镜头**。
    //   原来收尾两镜切到 'pair'（目标从她身上换成两只的中点 ⇒ 画面猛地一甩，
    //   看着就像一次硬切），现在整段一个 target、一条单调的环绕弧：az 90（她身后）→ 44，
    //   dist 36 → 26、pitch 3.5 → 22 同步抬升，中间没有任何换目标/反打。
    { t: WIN_T.split0 + SPLIT_W * 0.000, target: 'female', dist: 36, az: 90, pitch: 3.5, frame: 0.04, ty: 1.20 },
    { t: WIN_T.split0 + SPLIT_W * 0.264, target: 'female', dist: 35, az: 90, pitch: 5.0, frame: 0.04, ty: 1.22 },
    { t: WIN_T.split0 + SPLIT_W * 0.528, target: 'female', dist: 33, az: 86, pitch: 8.5, frame: 0.03, ty: 1.26 },
    { t: WIN_T.split0 + SPLIT_W * 0.721, target: 'female', dist: 31, az: 78, pitch: 12.0, frame: 0.03, ty: 1.30 },
    { t: WIN_T.split0 + SPLIT_W * 0.792, target: 'female', dist: 30, az: 70, pitch: 15.0, frame: 0.02, ty: 1.34 },  // 开始打弯
    { t: WIN_T.split0 + SPLIT_W * 0.873, target: 'female', dist: 28, az: 58, pitch: 18.5, frame: 0.02, ty: 1.36 },
    { t: WIN_T.split0 + SPLIT_W * 0.934, target: 'female', dist: 27, az: 50, pitch: 20.5, frame: 0.02, ty: 1.34 },
    { t: WIN_T.split1, target: 'female', dist: 26, az: 44, pitch: 22.0, frame: 0.02, ty: 1.30 },
  ],
  half: [
    // 客户 2026-11-05 ⑥：整屏切进副本“跟着她跑”，窗口只有 5.77 s（54.87–60.63）⇒ 机位按比例压：
    //   前 60% 一路跟拍推近，撞线那一刻贴到 17 m，之后环绕一次就锁死，留 1.8 s 给戴冠庆祝
    // 客户 2026-11-05 ⑦：**机位放到门头以北、朝南拍**（az 取负 = 站北侧看南），
    //   她从南边跑过来、穿过门头、冲向镜头；撞线后原地环绕，角度锁死只留庆祝。
    //   机位距离要够远才看得见门头两根立柱（实测 46 m 时柱子正好卡在画幅两侧外，只剩一道蓝边）
    // 客户 2026-11-05：1570 帧一进副本她就已经在冲刺 ⇒ 起手别拉那么远（64 → 46），吉祥物早点读得出来
    { t: WIN_T.half0 + 0.00, target: 'female', dist: 46, az: -76, pitch: 10, frame: 0.0 },
    { t: WIN_T.half0 + 0.30, target: 'female', dist: 44, az: -78, pitch: 10, frame: 0.01 },
    { t: CROSS.half - 0.90, target: 'female', dist: 30, az: -84, pitch: 8, frame: 0.02 },
    { t: CROSS.half, target: 'female', dist: 17, az: -92, pitch: 6, frame: 0.02 },             // 撞线（黑白终点标识 + 撒花）
    // 客户 2026-11-06：环绕别转到门头立柱后面 —— az −126 时那根蓝柱子会吃掉画面左边三分之一。
    //   收敛到 −96…−104，dist 抬到 20，她和纸屑都在画心，立柱留在画外。
    { t: CROSS.half + 0.55, target: 'female', dist: 19, az: -104, pitch: 8, frame: 0.0 },      // 解锁湖后
    { t: CROSS.half + 1.10, target: 'female', dist: 20, az: -99, pitch: 9, frame: -0.02 },     // 环绕到此为止
    { t: WIN_T.half1, target: 'female', dist: 21, az: -96, pitch: 9, frame: -0.02 },           // 角度锁死，只留庆祝
  ],
  finale: [
    //   客户 2026-11-05 ⑦：副本提前到 2268 帧，那时他还在门头以南 55 m ⇒ 机位必须先**定在门头以北**、
    //   顺着路轴往南看（门洞给他做画框）；跟着他跑会贴着柱子、把门柱拍成一堵墙。
    //   冲线前再切回跟人（湾湾已站在终点线上，'pair' 会把镜头拉到两者中间、把他挤到画左）。
    //   ⚠️ 2026-11-01：副本入口挪到 L36（fin0 100.24→102.30），冲刺窗口从 4.66 s 缩到 2.60 s。
    //     原来那三个绝对值（+0.60/+1.30/+2.60）会挤到冲线之后（+2.60 = 104.899 = 撞线那一刻），
    //     机位在撞线时还停在 dist 28 的远景 ⇒ 推近整段丢失。改成**按窗口比例**取点，
    //     窗口再变时长，推镜节奏跟着走。
    { t: WIN_T.fin0 + FIN_W * 0.00, target: [18, 0], dist: 86, az: -90, pitch: 11, frame: 0.0 },   // 门框远景
    { t: WIN_T.fin0 + FIN_W * 0.10, target: [4, 0], dist: 66, az: -90, pitch: 10, frame: 0.0 },
    //   之后直接跟人一路推近（他还在门头以南 50 m，“定在门头以北”只能给那一个远景镜头）
    //   2.6 s 的窗口里远景只给 0.26 s，剩下 1.0 s 全部用来推近，冲刺才看得见
    { t: WIN_T.fin0 + FIN_W * 0.30, target: 'male', dist: 40, az: -88, pitch: 8, frame: 0.01 },
    { t: WIN_T.fin0 + FIN_W * 0.48, target: 'male', dist: 28, az: -90, pitch: 7, frame: 0.01 },
    { t: CROSS.full - 0.90, target: 'male', dist: 20, az: -94, pitch: 7, frame: 0.02 },
    { t: CROSS.full, target: 'male', dist: 17, az: -96, pitch: 6, frame: 0.02 },              // 撞线：黑白终点标识 + 撒花
    { t: CROSS.full + 1.10, target: 'pair', dist: 18, az: -108, pitch: 9, frame: 0.06 },
    // ── 剪接到主舞台：镜头在台前（东侧，+z）往西看，az 必须 <90
    // 客户 2026-11-06：背板换成 13.8×7.65 m 的大屏后，视线要抬高 —— 原来 ty 1.6–1.9
    //   会把两个小家伙顶到屏幕下半部分的「2026.11.08」上面；现在 ty 2.6–2.9，蟹落在台面、日期露出来
    // 客户 2026-11-09：加冕后要**欢呼 2.5 s 再切回舞台**。原来从 CROSS.full+1.10 就开始
    //   一路平移到舞台，拍到 104 s 他已经整个出画（实测屏幕 x −1525），观众看到空路在飘。
    //   现在把「跟到他身上」这一镜锁到切舞台前 0.02 s（= 1 帧），切点仍是硬切。
    { t: +(WIN_T.stage - 0.02).toFixed(2), target: 'pair', dist: 18, az: -108, pitch: 9, frame: 0.06 },
    { t: WIN_T.stage, target: [STAGE_POS.maleX + 1.5, STAGE_POS.z], dist: 30, az: 30, pitch: 12, frame: 0.02, ty: 2.5 },
    { t: WIN_T.stage + 1.60, target: [STAGE_POS.maleX + 1.5, STAGE_POS.z], dist: 26, az: 24, pitch: 10, frame: 0.02, ty: 2.7 },
    { t: WIN_T.stage + 4.00, target: [STAGE_POS.maleX + 1.5, STAGE_POS.z], dist: 23, az: 16, pitch: 8, frame: 0.04, ty: 2.9 },
    { t: WIN_T.stage + 6.60, target: [STAGE_POS.maleX + 1.5, STAGE_POS.z], dist: 27, az: 14, pitch: 11, frame: 0.06, ty: 2.6 },
    { t: WIN_T.fin1, target: [STAGE_POS.maleX + 1.5, STAGE_POS.z], dist: 29, az: 12, pitch: 12, frame: 0.05, ty: 2.7 },
  ],
};

/** 副本画面不透明度：窗口首尾各 0.5s 淡入淡出（客户 2026-10-30 ②：副本↔主图要有个过渡） */
export const VENUE_FADE = 0.5;
export function venueAlpha(t, win) {
  if (!win) return 0;
  const f = VENUE_FADE;
  // 客户 2026-11-06：淡出可以按**帧**写死（half 窗口：1805→1818），淡入仍然用 VENUE_FADE
  // 2026-11-06 第二副本：split→half 是两个不同场景的硬切（noFadeOut + noFadeIn），中间不露大地图
  const inn = win.noFadeIn ? 9 : (t - win.t0) / f;
  const out = win.noFadeOut ? 9
    : win.fadeOut ? (win.fadeOut[1] - t) / (win.fadeOut[1] - win.fadeOut[0])
    : (win.t1 - t) / f;
  return Math.max(0, Math.min(1, inn, out));
}

/** 当前时刻落在哪个副本窗口（不在窗口里返回 null） */
export function venueAt(t) {
  for (const w of VENUE_WINDOWS) if (t >= w.t0 && t < w.t1) return w;
  return null;
}

// ── 机位插值：关键帧 → t 的连续函数（pchip，和全图镜头同一套算法）
import { pchip } from '../../../src/engine/math.js';

const _camCache = new Map();

const isLive = (k) => typeof k.target === 'string' && k.target !== 'arch';

function camCurves(win) {
  const hit = _camCache.get(win.id);
  if (hit) return hit;
  const ks = VENUE_CAM[win.id].map((k) => {
    // 静态 x：坐标 / 拱门直接取；跟角色的关键帧取"那一刻角色在哪"，只在 follow<1 时参与混合
    let x, z = 0;
    if (Array.isArray(k.target)) [x, z] = k.target;
    else if (k.target === 'arch') x = V.arch.x;
    else {
      const p = venuePose(win, k.t);
      x = liveTargetX({ ...win, track: k.target }, p) ?? 0;
      // 分流副本里两只分别跑在两条车道上：机位的 z 取它们的中点，否则宽画幅会把其中一只挤出画面
      if (win.kind === 'split') {
        const mz = p.maleZ ?? 0, fz = p.femaleZ ?? 0;
        z = k.target === 'female' ? fz : k.target === 'male' ? mz : (mz + fz) / 2;
      }
    }
    if (k.z !== undefined) z = k.z;
    const follow = k.follow ?? (isLive(k) ? 1 : 0);
    return { T: k.t, x, z, follow, dist: k.dist, az: k.az, pitch: k.pitch, frame: k.frame, ty: k.ty ?? 0 };
  }).sort((a, b) => a.T - b.T);
  const P = (key) => pchip(ks.map((k) => [k.T, k[key]]));
  const c = { keys: ks, x: P('x'), z: P('z'), follow: P('follow'), dist: P('dist'), az: P('az'), pitch: P('pitch'), frame: P('frame'), ty: P('ty') };
  _camCache.set(win.id, c);
  return c;
}

/** 当前时刻的副本机位：静态 x（关键帧 pchip）与"跟角色"的实时 x 按 follow 权重混合。
 *  跟谁由最近的跟随关键帧决定（窗口 track 只是缺省）；只跟横向 x，z 与高度仍由关键帧管 */
export function venueCamera(t, win) {
  const c = camCurves(win);
  const tt = Math.min(win.t1 - 1e-3, Math.max(win.t0, t));
  const pose = venuePose(win, t);
  let x = c.x(tt), z = c.z(tt);
  const wgt = Math.min(1, Math.max(0, c.follow(tt)));
  if (wgt > 1e-4) {
    // 跟谁：最近一个已过的跟随关键帧；还没到第一个跟随关键帧时，用即将到来的那个
    const live = c.keys.filter((k) => k.follow > 0).map((k) => VENUE_CAM[win.id].find((r) => r.t === k.T));
    const past = live.filter((k) => k.t <= tt + 1e-6);
    const who = (past.length ? past[past.length - 1] : live[0])?.target ?? win.track;
    const lx = liveTargetX({ ...win, track: typeof who === 'string' && who !== 'arch' ? who : win.track }, pose);
    if (lx != null) x = x * (1 - wgt) + lx * wgt;
    // 2026-11-07：分流副本里湾湾会拐进另一条路，机位只跟 x 会把她甩出画面 ⇒ z 也实时跟
    if (win.kind === 'split') {
      const lz = who === 'male' ? pose.maleZ : who === 'female' ? pose.femaleZ : ((pose.maleZ ?? 0) + (pose.femaleZ ?? 0)) / 2;
      if (lz != null) z = z * (1 - wgt) + lz * wgt;
    }
  }
  // ty = 看向的高度（舞台段要往上看台面，否则镜头盯着地面）
  return { target: [x, z], ty: c.ty(tt), dist: c.dist(tt), az: c.az(tt), pitch: c.pitch(tt), frame: c.frame(tt), follow: wgt };
}
