// 1031 配音排程 —— 客户 2026-11-08 指定「按公里窗口完成口播」后的口径
//
//  规则（客户原话）：“完成口播的意思是吉祥物在这段线路跑步的时间必须把对应的口播音频播放完”。
//  ⇒ 每条口播有一个**公里窗口** [km0, km1]；音频时长是固定的（录音不能剪），
//    于是这一句的速度 = (km1−km0) / 时长，由它反推 —— 不再有全局匀速。
//  副本段（主会场 / 分流）里吉祥物不在主地图上跑 ⇒ 主里程轴暂停。
//  客户没指定里程的空隙写成 GAP（只跑不说话），跑速取 V_GAP。
//
//  旧版（V=0.80 匀速 + 空档 + 减速）在 2026-11-08 晚被这一版取代：
//  它无法同时满足“12/13/14 在 9 km 前说完”“39–41.3 说 32/33”这些硬点。

export const FINISH = 42.195;
/** 客户 2026-11-09：切进地图主场景（F296）时两只吉祥物已经站在 0.10 km 处 */
export const START_KM = 0.10;
/** 片头留白：0 → LEAD 是地图加载条 / 赛道线点亮，口播从 LEAD 起算 */
export const LEAD = 1.20;
/** 片尾留白 */
export const TAIL = 1.20;
/** 空档跑速（只跑不说话时的速度） */
export const V_GAP = 0.80;

/* ── 片尾（客户 2026-11-09）───────────────────────────────────────
   「口播 35、36 读完才完成冲线，冲线加冕后欢呼 2–3 秒再切回舞台」
   ⇒ 段 24 的口播不能和冲线重叠，冲线往后推 crossAfter；加冕 crownAfter 之后
     再留 cheer 秒欢呼，然后才切主舞台（= 段 25 的起点）。
   这三个数同时决定 schedule 里那条**无口播停留**的长度。               */
export const FIN = { crossAfter: 0.50, crownAfter: 0.35, cheer: 2.50 };
/** 副本入口里程 = 最后 230 m 直道的起点。
 *  客户 2026-11-01：**L37「最后约230米直道」开口才切进主会场副本冲刺**，
 *  在那之前的 L36「右转进入星湖南路」还在大地图的星湖南路上说完。
 *  于是段 24 的前半段（L36）走地图、后半段（L37 起）在副本里，主里程轴在切点冻结。
 *  冻结时吉祥物正好停在 41.965 km，最后 230 m 交给主会场几何去跑。 */
export const FIN_ENTRY_KM = +(FINISH - 0.23).toFixed(4);
/** 冲线时刻 = 段 24 末 + crossAfter（段 24 末 = 「最后约230米直道」读完那一刻） */
/** 片尾停留时长 = 冲线等待 + 加冕 + 欢呼 */
export const FIN_HOLD = +(FIN.crossAfter + FIN.crownAfter + FIN.cheer).toFixed(3);

/* ── 段 → 公里窗口 ───────────────────────────────────────────────
   1/2/3 起跑仪式（副本，站定）· 18 湾湾冲线（副本）· 25 数据卡（副本）      */
export const SEG_KM = {
  4: [START_KM, 0.45], // 今年赛段调整（起跑出线）—— 客户 2026-11-09：F296 切进地图时从 0.10 km 出发
  5: [0.45, 1.40],     // 增加约 2 km 城区段
  6: [1.40, 2.50],     // 城区段 → 约2.5公里澜湾博物馆（说完正好 2.5）
  7: [5.80, 6.60],     // 约5.8公里澜湾老街
  8: [6.60, 7.50],     // 即将逐个解锁（9、10 慢跑，7.5 km 出桥卡 + 第 11 句）
  9: [7.50, 8.10],     // 约8.1公里上云澜大桥
  10: [8.10, 9.00],    // 桥长 / 桥顶 / 最高点（12、13、14 都在 9 km 前完成）
  11: [9.00, 10.00],   // 记住这个坡（9–10 km 完成第 15 句）
  12: [11.00, 12.00],  // 穿过银杏大道
  13: [12.00, 13.00],  // 金黄交织
  14: [13.00, 16.00],  // 进入悦水湾 / 湖水清澈（13–16 km 完成 18、19）
  15: [18.00, 19.00],  // 二次上桥 / 控制心率（18–19 km 完成 20、21）
  16: [19.00, 20.00],  // 下桥约19.5公里 澜湾北路折返（19–20 km 完成第 22 句）
  17: [20.00, 20.518], // 回环湖大道分流（20 km → 分流点，第 23 句）
  19: [22.60, 27.00],  // 全马约22.6-38.5 / 穿过滨湖公园
  20: [27.00, 29.10],  // 约29.1公里 全马折返点掉头
  // 客户 2026-11-01（片尾重排）：
  //   「34、35 两句口播都在环湖大道完成」→ 39.00→41.35 全部走环湖大道，41.35 收
  //     （41.40 是右转进星湖南路的路口，road 分界也钉在 41.40）
  //   「36 口播在星湖南路的返程完成，先不要进副本」→ 段 24 前半在星湖南路上说完
  //   「37 口播再入副本冲刺」→ 副本入口 = CUE_SCENE_CUT[35]（L36 那条 cue 号 35）
  21: [39.00, 40.00],  // 约40到41公里
  22: [40.00, 40.75],  // 经过云澜湖国家城市湿地公园（环湖大道）
  23: [40.75, 41.35],  // 回到环湖大道（收在右转路口之前 50 m）
  24: [41.35, FIN_ENTRY_KM], // 右转进入星湖南路（返程）→ 副本门口 = 41.965
};
/** 主里程轴暂停的段（副本内不做全马推进）
 *  26 = 段 25 的后半（「湖王湖后解锁」之后那三句），客户 2026-11-09 把片尾拆开插解锁句 */
export const PAUSE = new Set([1, 2, 3, 18, 25, 26]);

/* ── 客户没指定里程的空隙：只跑不说话 ────────────────────────── */
export const GAPS = [
  // 客户 2026-11-01：博物馆后新增了一句（L08b，插在段 6 之后），它自己跑掉 2.50→3.40 km，
  //   所以这段空档的起点从 2.50 让到 3.40
  { after: 6, km0: 3.40, km1: 5.80, note: '城区 → 老街之间（客户未指定）' },
  { after: 11, km0: 10.00, km1: 11.00, note: '过桥 → 银杏大道' },
  { after: 14, km0: 16.00, km1: 18.00, note: '悦水湾 → 二次上桥' },
  { after: 20, km0: 34.94, km1: 39.00, note: '撞墙句说完 → 39 km 出湿地卡' },
];

/* ── 排在**插句之前**的空档（客户 2026-11-09：“撞墙”那句要在 32.5 km 才触发）──
   29.10 折返点掉头说完 → 先空跑 3.4 km → 32.50 开口播撞墙句。            */
export const PREGAPS = [
  { after: 20, km0: 29.10, km1: 32.50, note: '折返后空跑 → 蓝蓝跑到 32.5 km 才开口说撞墙' },
];

/* ── 停留段：画面留在会场，主里程轴按这里给的方式走 ─────────
   两种形状：
     · { km0, km1 } = 场外推进：蓝蓝在主地图上继续跑（湾湾冲线那 2.13 s）
     · { d, km }     = 原地停留：里程不动、也没有口播（片尾冲线 + 加冕 + 欢呼） */
export const HOLDS = [
  { after: 18, km0: SEG_KM[17][1], km1: 22.60, scene: '主会场副本', note: '湾湾冲线／加冕期间蓝蓝继续跑' },
  // 客户 2026-11-01：副本入口挪到 41.965（最后 230 m 起点）⇒ 停留段把这 230 m 走完，
  //   主里程轴保持连续（44 km 不进副本时用；数值只给自检看，画面由主会场几何驱动）
  { after: 24, d: FIN_HOLD, km0: FIN_ENTRY_KM, km1: FINISH, scene: '主会场副本',
    note: '蓝蓝冲刺（最后 230 m）+ 冲线 + 加冕 + 欢呼（无口播）' },
];

/* ── 场景 ─────────────────────────────────────────────────────── */
export const SCENE_OF_SEG = {};
// 客户 2026-11-01：段 24 不再整段是副本 —— 它从环湖大道/星湖南路起，到 L37 开口才切进会场
for (const n of [1, 2, 3, 18, 25, 26]) SCENE_OF_SEG[n] = '主会场副本';
for (let n = 4; n <= 24; n++) if (!PAUSE.has(n)) SCENE_OF_SEG[n] = '地图主场景';

/** 段内切换：第几条 cue（1 起、含插入句后仍按 cue 序号）开口时切场景 */
export const CUE_SCENE_CUT = {
  24: { scene: '分流副本', why: '客户：分流副本完成口播 24、25' },
  26: { scene: '主会场副本', why: '客户：主会场副本（湾湾冲线）完成口播 26、27' },
  35: { scene: '主会场副本', why: '客户 2026-11-01：L37「最后约230米直道」开口才进主会场冲刺' },
};

export const SCENE_NOTE = {
  4: '起跑瞬间切到地图主场景',
  17: '第 23 句说完切进分流副本',
  18: '湾湾支线 20.87→21.10：最后 230 m + 冲线 + 加冕（轴暂停）',
  24: '41.35 km 右转进星湖南路（返程）→ L37 开口切进主会场，最后 230 m + 蓝蓝冲线',
  25: '站定 · 42.195 数据卡（到「湖王湖后解锁」读完）',
  26: '站定 · 解锁之后三句 + 片尾',
};

export const SCENE_COLOR = { '主会场副本': '#B45309', '地图主场景': '#0E7490', '分流副本': '#7C3AED' };

/** 把 SRT 的 cue 入点/出点挂到 manifest.items 上（schedule 需要它来定位段内切点） */
export function withCueTimes(items, srtText) {
  const T = {};
  for (const blk of String(srtText).replace(/^\uFEFF/, '').split(/\r?\n\s*\r?\n/)) {
    const L = blk.trim().split(/\r?\n/);
    if (L.length < 2) continue;
    const m = L[1].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const sec = (h, mi, se, ms) => +h * 3600 + +mi * 60 + +se + +ms / 1000;
    T[+L[0]] = [sec(m[1], m[2], m[3], m[4]), sec(m[5], m[6], m[7], m[8])];
  }
  for (const it of items) it.cueTimes = (it.cues || []).map((c) => T[c]);
  return items;
}

/** cue 序号 → 该 cue 在段内的相对时间（秒） */
const cueOffInItem = (it, cueNo) => {
  if (!it.cueTimes || !it.cues) return null;
  const k = it.cues.indexOf(cueNo);
  if (k < 0) return null;
  return it.cueTimes[k][0] - it.cut0;
};

/**
 * @param items   manifest.items（25 段音频，已附 cueTimes）
 * @param inserts 后补口播 [{ id, after, cueNo, km0, km1, dur, ... }]
 */
export function schedule(items, inserts = []) {
  const rows = [];
  let t = 0;
  let cueNo = 0;          // 累积 cue 序号（含插入句）
  const cuts = [];        // 场景切点（绝对时间）

  const addCut = (time, scene, why) => {
    if (!cuts.length || cuts.at(-1).scene !== scene) cuts.push({ t: +time.toFixed(4), scene, why });
  };

  const pushRow = (row) => {
    // 行本身换场景（比如段 18 回到主会场、段 24 进主会场）也要记一刀
    if (!cuts.length || cuts.at(-1).scene !== row.sc) addCut(row.t0, row.sc, `行 ${row.n}`);
    rows.push(row); t = row.t1;
  };

  const line = (n, it, km0, km1, kind = 'line') => {
    const d = it.dur;
    const pause = PAUSE.has(n);
    const here = rows.length ? rows.at(-1).km1 : 0;     // 暂停段停在“此刻吉祥物所在的位置”
    const k0 = pause ? here : km0;
    const k1 = pause ? here : km1;
    const t0 = t;
    // 段内的场景切点（例如段 17 里第 24 句开口切分流）
    const inRow = [];
    for (const c of it.cues || []) {
      const rel = cueOffInItem(it, c);
      const cut = CUE_SCENE_CUT[c];
      if (cut && rel !== null) inRow.push({ t: +(t0 + rel).toFixed(4), scene: cut.scene, why: cut.why, cue: c });
    }
    // 段内如果切去了副本（分流 / 主会场），主里程轴在这一刻**冻结**，
    // 剩下的台词在副本里播 —— 否则 0.9 km 会被摊到整段 6.22 s 上（速度掉到 0.145）
    const freeze = inRow.filter((c) => c.scene !== '地图主场景').map((c) => c.t).sort((a, b) => a - b)[0] ?? null;
    const effSpan = freeze ? Math.max(1e-6, freeze - t0) : d;
    pushRow({
      kind, n, d, t0: +t0.toFixed(4), t1: +(t0 + d).toFixed(4),
      km0: +k0.toFixed(4), km1: +k1.toFixed(4),
      v: pause ? 0 : +((k1 - k0) / effSpan).toFixed(4), pause, sc: SCENE_OF_SEG[n], it,
      inRow, freeze, span: +effSpan.toFixed(4),
    });
    for (const c of inRow) addCut(c.t, c.scene, c.why);
  };
  const gap = (km0, km1, note) => {
    const d = (km1 - km0) / V_GAP;
    pushRow({
      kind: 'gap', n: 'gap', d: +d.toFixed(4), t0: +t.toFixed(4), t1: +(t + d).toFixed(4),
      km0: +km0.toFixed(4), km1: +km1.toFixed(4), v: V_GAP, pause: false, sc: '地图主场景', note, inRow: [],
    });
  };
  const hold = (h) => {
    // d 给死 = 原地停留（片尾）；只给 km0/km1 = 场外推进（湾湾冲线那一段）
    const fixed = h.d != null;
    // d 固定时可以**同时**给 km0/km1（片尾：停留时长写死，但里程要把最后 230 m 走完）
    const km0 = fixed ? (h.km ?? h.km0) : h.km0;
    const km1 = fixed ? (h.km ?? h.km1) : h.km1;
    const d = fixed ? h.d : (km1 - km0) / V_GAP;
    pushRow({
      kind: 'hold', n: 'hold', id: `H${h.after}`, d: +d.toFixed(4), t0: +t.toFixed(4), t1: +(t + d).toFixed(4),
      km0: +km0.toFixed(4), km1: +km1.toFixed(4), v: fixed ? +((km1 - km0) / d).toFixed(4) : V_GAP, pause: false,
      sc: h.scene || SCENE_OF_SEG[18], note: h.note, inRow: [],
    });
  };
  const insert = (ins) => {
    // pad = 句后气口：只把这一行的时间轴拉长（下一段自然后移），字幕时长仍按 ins.dur 算
    const d = ins.dur + (ins.pad || 0);
    pushRow({
      kind: 'ins', n: ins.id, d, t0: +t.toFixed(4), t1: +(t + d).toFixed(4),
      km0: +ins.km0.toFixed(4), km1: +ins.km1.toFixed(4),
      v: +((ins.km1 - ins.km0) / d).toFixed(4), pause: false,
      // 客户 2026-11-09：插句可以指定场景（片尾那句「湖王湖后解锁」必须留在主会场副本里，
      //   否则 blocksOf 会在庆祝镜头中间硬插一个「地图主场景」）
      sc: ins.scene || '地图主场景',
      it: { cues: [ins.cueNo], text: ins.text, dur: d, cut0: 0, cueTimes: [] }, note: ins.note, inRow: [],
    });
  };

  // 首个场景
  addCut(0, SCENE_OF_SEG[1], '开场：主会场副本');

  for (let i = 0; i < items.length; i++) {
    const n = i + 1, it = items[i];
    if (n <= 3) { line(n, it, 0, 0); cueNo += (it.cues || []).length; }
    else if (PAUSE.has(n)) {
      // 副本段：主里程轴暂停（进副本的那一刻起就在当前位置）
      line(n, it, null, null);
      cueNo += (it.cues || []).length;
    } else {
      const w = SEG_KM[n];
      if (!w) throw new Error(`段 ${n} 没有公里窗口`);
      line(n, it, w[0], w[1]);
      cueNo += (it.cues || []).length;
    }
    for (const pg of PREGAPS.filter((x) => x.after === n)) gap(pg.km0, pg.km1, pg.note);
    for (const ins of inserts.filter((x) => x.after === n)) { insert(ins); cueNo += 1; }
    for (const g of GAPS.filter((x) => x.after === n)) gap(g.km0, g.km1, g.note);
    for (const h of HOLDS.filter((x) => x.after === n)) hold(h);
  }

  const total = +t.toFixed(4);
  const last = rows.at(-1);
  const gapsArr = rows.filter((r) => r.kind === 'gap');
  return {
    rows, cuts, total, km: +last.km1.toFixed(4),
    gaps: gapsArr.length,
    gapKm: +gapsArr.reduce((a, r) => a + (r.km1 - r.km0), 0).toFixed(4),
    cues: cueNo,
  };
}

/** 连续同场景的块（按段内切点拆分，供对照表 / 校验用） */
export function blocksOf(rows) {
  const out = [];
  const push = (sc, t0, t1, k0, k1, row) => {
    const last = out.at(-1);
    if (last && last.sc === sc) { last.t1 = t1; last.km1 = k1; last.rows.push(row); }
    else out.push({ sc, t0, t1, km0: k0, km1: k1, rows: [row] });
  };
  for (const r of rows) {
    const kmAt = (tt) => {
      if (r.km1 === r.km0) return r.km0;
      const end = r.freeze ?? r.t1;
      const span = Math.max(1e-6, end - r.t0);
      return r.km0 + (r.km1 - r.km0) * Math.min(1, Math.max(0, (tt - r.t0) / span));
    };
    if (!r.inRow || !r.inRow.length) { push(r.sc, r.t0, r.t1, r.km0, r.km1, r); continue; }
    let cur = { t: r.t0, sc: r.sc };
    for (const c of [...r.inRow].sort((a, b) => a.t - b.t)) {
      push(cur.sc, cur.t, c.t, kmAt(cur.t), kmAt(c.t), r);
      cur = { t: c.t, sc: c.scene };
    }
    push(cur.sc, cur.t, r.t1, kmAt(cur.t), r.km1, r);
  }
  return out;
}
