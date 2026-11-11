// ════════════════════════════════════════════════════════════════════════
//  口播 / 字幕的唯一来源 —— 2026-11-08 换成客户 1031 新配音（第三版口径）
//
//  规则（与上一版最大的不同）：
//   1. **不再“画面跟着音频走”**。新口径是：吉祥物按固定速度 V 匀速跑，
//      里程不够的地方插空档、台词太长的句子把吉祥物减速 —— 见 config/schedule.js。
//   2. 42 条口播由 edge-tts 逐句合成、按排程铺成一条与画面时刻对齐的整轨
//      （tools/tts_edge.mjs → audio/tts/timeline.wav）⇒ audioOffset = 0，画面时间 == 音轨时间。
//   3. 字幕仍是 **42 条，一条 SRT 一行上屏**；合并成 25 段只是为了音频连续，
//      不改变上屏条数（客户 2026-11-08 明确）。
//   4. 每句的里程 = 它所属那一段的 km0→km1 线性插值（副本段主里程轴暂停）。
//   5. 文案一字不改；buildScript() 把 42 行拼回原文自检。
//
//  与旧版（1029-wall）的差别：删掉「解锁湖后」「撞墙高发区」「湖王湖后解锁」三句，
//  「全马右转柳堤南路」改成「全马靠右直行柳堤南路」。45 行 → 42 行。
// ════════════════════════════════════════════════════════════════════════
import { AUDIO as A1031, TIMING, SEGS, CUE_LINES, FINISH } from './vo1031.js';
import { INSERTS, SUB_SHIFT_FRAMES } from './inserts.js';

export const PRESTART_KM = -0.06;
export const FINISH_KM = FINISH;

/** 音轨事实：audio/tts/timeline.wav = edge-tts 逐句合成、按排程铺好的整轨（44.1k / 双声道） */
export const AUDIO = {
  file: A1031.file,
  dur: A1031.dur,
  cues: A1031.cues,
  segments: A1031.segments,
};

export const VO = {
  audioOffset: 0,          // 整轨已经和画面时刻对齐，不再后移
  tail: 0,                 // 片尾留白已经算进整轨（TIMING.tail）
  gapEps: 0.02,
  lead: TIMING.lead,       // 片头加载条留白
  v: TIMING.v,             // 匀速 0.80 km/s
};

/** 客户原文（9 段）—— 42 行拼回去必须与它一字不差 */
export const ORIGINAL = [
  '2026澜湾马拉松，赛道解锁。起点澜渚洲公园星湖南路，A、B区首发，C区第二枪',
  '今年赛段调整，增加约2公里城区段；目前位于城区段，约2.5公里澜湾博物馆。直行后连续两次右转，行至云澜街。约5.8公里澜湾老街，即将逐个解锁澜湾地标。',
  '约8.1公里上云澜大桥，桥长537.4米，桥顶海拔约26米，赛道最高点。记住这个坡，后面还有一次。',
  '穿过秋日限定的银杏大道，金黄交织，随手一拍就是大片。进入悦水湾，湖水清澈，花海环绕。',
  '第二次上云澜大桥，上桥控制心率，别冲。',
  '下桥约19.5公里，澜湾北路折返，回环湖大道分流：半马左转星湖南路，全马靠右直行随后右转至柳堤南路。',
  '半马最后约230米直道，3小时关门内冲线。',
  '全马约22.6到36公里穿过云澜水岸滨湖公园，约29.1公里全马折返点掉头；接下来是身体切换燃料的撞墙高发区，约40到41公里经过云澜湖国家城市湿地公园，回到环湖大道，右转进入星湖南路，最后约230米直道。',
  '全马42.195公里，半马21.0975公里，累计爬升61米，海拔4到26米。湖王湖后解锁，2026澜湾马拉松，11月8日，赛道见。',
].join('');

/** 后补口播：钉在帧上（src/config/inserts.js），不属于任何一段排程 */
const INS_LINES = INSERTS.map((x) => {
  const seg = SEGS.find((s2) => s2.n === x.id);
  if (!seg) throw new Error('vo1031 里没有插入段 ' + x.id);
  return {
    id: x.id, vo: x.text, color: null, insert: true,
    t: +(seg.t0 + x.head).toFixed(3),          // 语音起点 = 该行起点 + 文件头静音
    // 字幕时长 = 行时长 − 文件头静音：否则字幕会拖到下一段的第一句上面
    //   （L31b 后面是空档，原来的 +0.15 没暴露；L41 后面紧跟段 26 的第一句就撞了）
    d: +(x.dur - x.head).toFixed(3),
    subShiftFrames: x.subShiftFrames ?? null,  // 客户：这一条的字幕单独提前 30 帧
  };
});

/** 43 行（42 条 SRT + 1 条后补）：id 沿用旧编号，story/sfx 里的引用不用改 */
export const LINES = [
  ...CUE_LINES.map((l) => ({ id: l.id, seg: l.seg, cue: l.cue, dt: l.dt, d: l.d, vo: l.vo, color: l.color })),
  ...INS_LINES,
];

/** 段落分组（播放器跳段、分镜表分段、设定集按段展示）—— 用显式 id，别再切片（43 条后切片会错位） */
const IDS = (a, b) => CUE_LINES.filter((l) => l.id >= a && l.id <= b).map((l) => l.id);
export const PARAGRAPHS = [
  { id: 'start', lines: ['L01', 'L02', 'L03', 'L04'] },
  // 城区段：客户 2026-11-01 在博物馆（L08）后加了一句
  { id: 'city', lines: [...IDS('L05', 'L08'), 'L08b', ...IDS('L09', 'L10')] },
  { id: 'bridge', lines: IDS('L11', 'L15') },
  { id: 'water', lines: IDS('L16', 'L19') },
  { id: 'bridge2', lines: IDS('L20', 'L21') },
  { id: 'fork', lines: IDS('L22', 'L25') },
  { id: 'half', lines: IDS('L26', 'L27') },
  // 环湖段：后补的 L31b 按时间插在 L31 与 L32 之间
  { id: 'loop', lines: [...IDS('L29', 'L31'), 'L31b', ...IDS('L32', 'L35')] },
  // 片尾：段 25 收在「海拔4到26米。」→ L41「湖王湖后解锁，」→ 段 26 的三句
  { id: 'finish', lines: ['L37', 'L38', 'L39', 'L40', 'L41', 'L42', 'L43', 'L44'] },
];

/** 同期字幕统一后移（客户 2026-11-08：30 帧 = 1.000 s）；只动上屏时间，不动声音 */
export const SUB_SHIFT = +(SUB_SHIFT_FRAMES / 30).toFixed(4);

/** 兼容旧工具的 PACE 视图：只列“主里程轴真的在推进”的段（副本段 km 不动，不进来） */
export const PACE = SEGS.filter((s) => s.kind === 'line' && s.km1 > s.km0 + 1e-6).map((s) => {
  const ls = CUE_LINES.filter((l) => l.seg === s.n);
  return {
    id0: ls.length ? ls[0].id : null,
    id1: ls.length ? ls[ls.length - 1].id : null,
    km0: s.km0, km1: s.km1, t0: s.t0, t1: s.t1, pin: true, freeze: s.freeze ?? null,
    why: `${s.scene} · 段 ${s.n} · ${s.d}s · ${s.v} km/s${s.v < TIMING.v - 1e-6 ? '（减速）' : ''}`,
  };
});

const strip = (s) => s.replace(/[，。；：、,.;:]+$/, '');
const PUNCT = /[，。；：、,.;:!?！？\s"'“”（）()]/g;
const norm = (s) => s.replace(PUNCT, '');

const SEG_BY_N = new Map(SEGS.map((s) => [s.n, s]));
/** 第一段“地图主场景”的起点 = 起跑（C 区第二枪说完，画面切出会场） */
const SEG_RUN = SEGS.filter((s) => s.kind === 'line')[3];

/** 每行的时间、里程、DURATION、蓝蓝里程锚点 */
export function buildScript(vo = VO, lines = LINES) {
  const errors = [];
  // 拼接自检必须按**时间顺序**（后补句是钉帧的，数组里排在最后）
  const segTOf = (L) => (L.insert ? L.t : (SEG_BY_N.get(L.seg)?.t0 ?? 0) + L.dt);
  const joined = [...lines].sort((a, b) => segTOf(a) - segTOf(b)).map((l) => l.vo).join('');
  const exact = joined === ORIGINAL;
  const loose = norm(joined) === norm(ORIGINAL);
  if (!exact && !loose) {
    let i = 0;
    const a = norm(joined), b = norm(ORIGINAL);
    while (i < a.length && a[i] === b[i]) i++;
    errors.push(`切行后与原文不一致（第 ${i + 1} 字起）：\n  原文 …${b.slice(Math.max(0, i - 12), i + 18)}\n  拼回 …${a.slice(Math.max(0, i - 12), i + 18)}`);
  }
  const match = exact ? 'exact' : loose ? 'punct-insensitive' : 'mismatch';

  const kmOf = (seg, t, d) => {
    if (!seg) return 0;
    // 段内切进副本时主里程轴冻结（seg.freeze），后面的台词原地播
    const span = seg.span ?? seg.d ?? 1;
    const u = Math.max(0, Math.min(1, ((t + d / 2) - seg.t0) / (span || 1)));
    return +(seg.km0 + (seg.km1 - seg.km0) * u).toFixed(4);
  };

  const rows = [];
  for (const L of lines) {
    let seg, t, d;
    if (L.insert) {
      // 后补句：时间已经钉死（inserts.js），只找它落在哪一段里，好算里程
      t = +L.t.toFixed(3); d = +L.d.toFixed(3);
      seg = SEGS.find((s2) => t >= s2.t0 - 1e-9 && t <= s2.t1 + 1e-9) || null;
    } else {
      seg = SEG_BY_N.get(L.seg);
      if (!seg) { errors.push(`${L.id} 找不到所在段 ${L.seg}`); continue; }
      t = +(seg.t0 + L.dt).toFixed(3); d = +L.d.toFixed(3);
      if (t + d > seg.t1 + 0.05) errors.push(`${L.id} 越过所在段结尾（${(t + d).toFixed(3)} > ${seg.t1}）`);
    }
    if (d <= 0) errors.push(`${L.id} 时长 ≤ 0`);
    rows.push({ L, seg, t, d });
  }
  // 43 条里有 1 条是钉帧的后补句 ⇒ 统一按时间排序，再重编 i
  rows.sort((a, b) => a.t - b.t);

  const out = [];
  let prevEnd = -Infinity;
  for (const [i, r] of rows.entries()) {
    const { L, seg, t, d } = r;
    if (t < prevEnd - 1e-6) errors.push(`${L.id} 与上一行重叠（${t} < ${prevEnd.toFixed(3)}）`);
    prevEnd = t + d;
    out.push({
      ...L, i: i + 1, text: strip(L.vo), chars: [...L.vo].length, t, d,
      tIn: t, tOut: +(t + d).toFixed(3),
      charsNoPunct: norm(L.vo).length,
      cps: +(norm(L.vo).length / d).toFixed(2),
      gap: i ? +(t - out[i - 1].tOut).toFixed(3) : +t.toFixed(3),
      km: kmOf(seg, t, d),
      // 段内可能中途切场景（段 17 第 24 句切分流、段 24 第 35 句切主会场）
      scene: seg ? ((seg.cuts || []).filter((c) => t >= c.t - 1e-6).reduce((a, c) => c.scene, seg.scene)) : null,
      pause: seg ? seg.pause : false,
    });
  }
  const DURATION = TIMING.duration;
  const tGo = +SEG_RUN.t0.toFixed(3);

  // 蓝蓝里程锚点：段边界就是硬锚点（匀速模型本身就声明了每段起止 km）
  const anchors = [[0, PRESTART_KM], [tGo, PRESTART_KM]];
  for (const s2 of SEGS) {
    if (s2.t1 <= tGo + 1e-6) continue;
    // 2026-11-09：起跑段（t0 == T_GO）的 km0 也必须进锚点 —— 否则切进地图那一刻
    //   里程还挂在 PRESTART_KM(−0.06)，第一句要读 0.1km 就差了 0.16km
    if (s2.t0 >= tGo - 1e-6) anchors.push([s2.t0, s2.km0]);
    // 冻结段：先记“跑到哪”的那一刻，再记段尾的同一个 km（中间是平的）
    if (s2.freeze) { anchors.push([s2.freeze, s2.km1]); }
    anchors.push([s2.t1, s2.km1]);
  }
  anchors.push([DURATION, FINISH_KM]);
  const clean = [];
  for (const [tt, kk] of anchors.sort((a, b) => a[0] - b[0])) {
    if (clean.length && Math.abs(tt - clean[clean.length - 1][0]) < 0.02) {
      clean[clean.length - 1][1] = Math.max(clean[clean.length - 1][1], kk);
    } else clean.push([tt, kk]);
  }
  for (let i = 1; i < clean.length; i++) {
    if (clean[i][1] < clean[i - 1][1] - 1e-6) errors.push(`里程回退：${JSON.stringify(clean[i - 1])} → ${JSON.stringify(clean[i])}`);
    if (clean[i][0] <= clean[i - 1][0]) errors.push(`时间未递增：${JSON.stringify(clean[i - 1])} → ${JSON.stringify(clean[i])}`);
  }

  const spoken = out[out.length - 1].t + out[out.length - 1].d - out[0].t;
  const cpsAvg = +(out.reduce((s2, l) => s2 + l.charsNoPunct, 0) / spoken).toFixed(2);
  return {
    DURATION, T_GO: tGo, lines: out, MALE_KM: clean, paragraphs: PARAGRAPHS, errors, match, cpsAvg,
    chars: joined.length, charsNoPunct: norm(joined).length,
    segs: SEGS,
  };
}
