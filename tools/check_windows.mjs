// 客户 2026-11-08 那张「口播 → 公里窗口」清单的逐条验收
//   口径：一条口播的**整段音频**必须在它声明的公里窗口里播完（客户：“完成口播的意思是
//   螃蟹在这段线路跑步的时间必须把对应的口播音频播放完”）。
//   node tools/check_windows.mjs
import { VO_LINES, SUBTITLES, SEGS, DURATION, lineT } from '../src/config/story.js';
import { WIN_T } from '../src/config/venue.js';

const ok = [], bad = [];
const chk = (n, c, d) => (c ? ok : bad).push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' · ' + d : ''}`);
// 客户 2026-11-01：博物馆后插了一句（L08b）⇒ 数组下标与 cue 号不再一一对应，
//   一律按 SRT 的 cue 号查，别再拿 VO_LINES[n-1] 当“第 n 句”。
const cue = (n) => VO_LINES.find((l) => l.cue === n) || VO_LINES[n - 1];
const fmt = (x) => x.toFixed(2);

/* ① 每条的起点/终点公里（用 MALE_KM 的实际值，不用声明值，防止两套口径打架） */
const kmAt = (t) => {
  // 段内线性（考虑冻结）；找不到就取最近段端点
  const s = SEGS.find((x) => t >= x.t0 - 1e-6 && t <= x.t1 + 1e-6);
  if (!s) return null;
  if (!s.km1 || s.km1 === s.km0) return s.km0;
  const end = s.freeze ?? s.t1;
  const u = Math.max(0, Math.min(1, (t - s.t0) / Math.max(1e-6, end - s.t0)));
  return s.km0 + (s.km1 - s.km0) * u;
};
const win = (n) => {
  const c = cue(n);
  return [kmAt(c.t), kmAt(c.tOut)];
};

console.log('=== ① 客户指定的窗口 ===');
const RULES = [

  [14, null, 9.00, '12/13/14 都在 9 km 前说完'],
  [15, 9.00, 10.00, '第 15 句在 9–10 km'],
  [17, 11.00, 13.00, '16/17 在 11–13 km'],
  [19, 13.00, 16.00, '18/19 在 13–16 km'],
  [21, 18.00, 19.00, '20/21 在 18–19 km'],
  [22, 19.00, 20.00, '第 22 句在 19–20 km'],
  [23, 20.00, 20.90, '第 23 句 20 km → 分流点'],
];
// 环湖段之后的三句按 **voice id** 钉（cue 号与 id 在 28 之后不再相等，写数字必错）：
//   L32「约40到41公里」/ L33「经过湿地公园」都要落在 39–41.3；L34「回到湖滨大道」落 41.3–41.9
// 客户 2026-11-01（片尾重排）：湖滨大道 39.45–41.40（右转路口），丹阳湖南路 41.40–42.195
//   34、35（字幕表行号）= L33「经过湿地公园」+ L34「回到湖滨大道」⇒ 都必须读完还在湖滨大道
//   36（行号）= L35「右转进入丹阳湖南路」⇒ 在丹阳湖南路的返程上说完，**还没进副本**
const IDRULES = [
  ['L32', 39.00, 40.10, '32/L32「约40到41公里」在 39–40.1 km（湖滨大道）'],
  ['L33', 40.00, 41.35, '34/L33「经过湿地公园」在 40–41.35 km（湖滨大道）'],
  ['L34', 40.60, 41.35, '35/L34「回到湖滨大道」在 40.6–41.35 km（湖滨大道，收在路口前）'],
  ['L35', 41.38, 41.99, '36/L35「右转进入丹阳湖南路」在 41.4–41.99 km（丹阳湖南路返程）'],
  ['L36', 41.96, 42.20, '37/L36「最后约230米直道」在副本里（41.965 起冲刺）'],
];
for (const [id, lo, hi, name] of IDRULES) {
  const l = VO_LINES.find((x) => x.id === id);
  const a = kmAt(l.t), b = kmAt(l.tOut);
  console.log(`  ${id}  ${fmt(a)} → ${fmt(b)} km   ${name}`);
  chk(name, a >= lo - 0.02 && b <= hi + 0.02, `${fmt(a)}–${fmt(b)}`);
}
for (const [n, lo, hi, name] of RULES) {
  const [a, b] = win(n);
  const okLo = lo === null || a >= lo - 0.02;
  const okHi = hi === null || b <= hi + 0.02;
  console.log(`  第 ${String(n).padStart(2)} 句  ${fmt(a)} → ${fmt(b)} km   ${name}`);
  chk(name, okLo && okHi, `${fmt(a)}–${fmt(b)}`);
}

// 客户：7.5 km 处出桥卡 + 开口播第 11 句 —— 这里校的是**段边界**（音频有 0.12 s 头部静音）
{
  const seg9 = SEGS.find((x) => x.n === 9);
  const seg8 = SEGS.find((x) => x.n === 8);
  console.log(`  第 8 段收在 ${fmt(seg8.km1)} km · 第 9 段（第 11 句）从 ${fmt(seg9.km0)} km 起`);
  chk('9/10 段收在 7.5 km，第 11 段正好从 7.5 km 起', Math.abs(seg8.km1 - 7.5) < 1e-6 && Math.abs(seg9.km0 - 7.5) < 1e-6);
}

console.log('\n=== ② 场景归属 ===');
// 段内可能有场景切点（例：段 24 从 L36 起切进主会场）⇒ 先看这一句开口时刻之前有没有切点
const sc = (n) => {
  const c = cue(n);
  const s = SEGS.find((x) => x.n === c.seg);
  const cut = (s?.cuts || []).filter((k) => k.t <= c.t + 1e-3).at(-1);
  return cut ? cut.scene : c.scene;
};
for (const n of [24, 25]) chk(`第 ${n} 句在分流副本`, sc(n) === '分流副本', sc(n));
for (const n of [26, 27]) chk(`第 ${n} 句在主会场副本（母蟹冲线）`, sc(n) === '主会场副本', sc(n));
for (const n of [35, 36]) chk(`第 ${n} 句在主会场副本（公蟹冲线）`, sc(n) === '主会场副本', sc(n));
// 客户 2026-11-01：进主会场的那一刻 = L36（「最后约230米直道」，字幕表第 37 条）开口
chk('L36（最后230米）开口才进主会场', Math.abs(WIN_T.fin0 - lineT('L36')) < 0.05,
  `fin0 ${fmt(WIN_T.fin0)} vs L36 ${fmt(lineT('L36'))}`);
chk('L35（右转进丹阳湖南路）开口时还没进副本', lineT('L35') < WIN_T.fin0 - 1.5,
  `L35 ${fmt(lineT('L35'))} < fin0 ${fmt(WIN_T.fin0)}`);

console.log('\n=== ③ 第 31 条字幕（撞墙句）与语音同刻 ===');
const s31 = SUBTITLES.find((s) => s.id === 'L31b');
chk('后补那句（撞墙）在表里', !!s31, `第 ${VO_LINES.findIndex((l) => l.id === 'L31b') + 1}／${VO_LINES.length} 条`);
chk('它的字幕与声音同刻（0.5 s 之后再提前 15 帧）', Math.abs(s31.t - s31.tVoice) < 1e-3,
  `字幕 ${fmt(s31.t)} / 声音 ${fmt(s31.tVoice)} / 偏置 ${((s31.t - s31.tVoice) * 30).toFixed(0)} 帧`);
const others = SUBTITLES.filter((s) => s.id !== 'L31b');
chk('其它 42 条与声音同刻上屏（+30 之后再提前 25 + 5 帧）', others.every((s) => Math.abs(s.t - s.tVoice) < 1e-3));

console.log('\n=== ④ 整体 ===');
chk(`口播 ${VO_LINES.length} 条`, VO_LINES.length === SUBTITLES.length, String(VO_LINES.length));
chk(`字幕 ${SUBTITLES.length} 条`, SUBTITLES.length === VO_LINES.length);
chk('时间轴单调不重叠', VO_LINES.every((l, i) => i === 0 || l.t >= VO_LINES[i - 1].tOut - 1e-6));
chk('片尾在片长内', VO_LINES.at(-1).tOut <= DURATION, `${fmt(VO_LINES.at(-1).tOut)} / ${DURATION}`);
const last = SEGS.at(-1);
chk('末端 42.195 km', Math.abs(last.km1 - 42.195) < 1e-6, String(last.km1));

for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
