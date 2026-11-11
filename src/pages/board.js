// 分镜表（逐行口播 = 逐镜）：时间码全部来自客户音轨 SRT；里程/元素由 story.js 推导
import { venueAt } from '../config/venue.js';
import {
  DURATION, AUDIO_DUR, AUDIO_OFFSET, VO_LINES, NARRATION, CAMERA, CARDS, STICKERS, EVENTS,
  SPLIT, T_GO, T_FEMALE_FINISH, T_MALE_FINISH, CPS_AVG, lineT, lineEnd, tAtKm,
} from '../config/story.js';
import { POINT_TIMES, maleKm, femaleKm, activeEvents, activeStickers, cardsAt } from '../engine/timeline.js';
import { AUDIO } from '../config/voice.js';
import { CUES as SFX_CUES, AMB as SFX_AMB } from '../config/sfx.js';

// 这一句里响过的音效（含跨进这句尾巴上的）
const SFX_NAME = { gun: '发枪', tape: '撞线', card: '图卡', cheer: '欢呼', crowd: '人群', rumble: '桥体隆起',
  wind: '风', ding: '桥顶', whoosh: '下桥', leaves: '落叶', birds: '鸟鸣', breath: '呼吸', uturn: '折返',
  fork: '分流', split: '分屏', sparkle: '解锁闪光', fanfare: '号角', end: '落版', boot: '加载', reveal: '点亮',
  traffic: '车流', street: '街道', park: '林间', rush: '风声掠过', crowd_: '人群' };
function sfxOf(a, b) {
  const hit = SFX_CUES.filter((c) => c.t >= a - 0.05 && c.t < b);
  const amb = SFX_AMB.filter((x) => x.t0 < b && x.t1 > a);
  const parts = hit.map((c) => `${SFX_NAME[c.sfx] || c.sfx}${c.t.toFixed(2)}`);
  const ambs = [...new Set(amb.map((x) => SFX_NAME[x.sfx.replace('amb_', '')] || x.sfx.replace('amb_', '')))];
  return [parts.length ? parts.join('、') : '', ambs.length ? `<span class="amb">底噪：${ambs.join('/')}</span>` : ''].filter(Boolean).join('<br>') || '<i>—</i>';
}

const $ = (s) => document.querySelector(s);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
// 帧号（30fps，与预览器的“第 N 帧”同一套算法）：报问题时说帧号比说秒准
const FPS = 30;
const fr = (t) => Math.round(t * FPS);
const fmtF = (t) => `${fmt(t)} <small style="opacity:.62">F${fr(t)}</small>`;
const f2 = (x) => (x === null || x === undefined ? '—' : x.toFixed(2));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const SEG = {
  start: '① 起跑', city: '② 城区段', bridge: '③ 跨湖大桥', water: '④ 林荫·湖畔',
  bridge2: '⑤ 二次上桥', fork: '⑥ 折返分流', half: '⑦ 半马冲线', loop: '⑧ 全马环湖', finish: '⑨ 终点',
};
const SEG_OF = {};
for (const n of NARRATION) for (const l of VO_LINES) {
  if (l.t >= n.t0 - 1e-6 && l.t <= n.t1 + 1e-6) SEG_OF[l.id] = n.id;
}

// 景别：按相机距离给一个中文说法（分镜表里比数字好读）
function shotName(dist) {
  if (dist < 620) return '近景';
  if (dist < 900) return '中景';
  if (dist < 1400) return '全景';
  if (dist < 2200) return '大远景';
  return '全图大远景';
}
const CAMS = CAMERA.map((c) => ({ ...c, T: c.t !== undefined ? c.t : tAtKm(c.at.km) })).sort((a, b) => a.T - b.T);
function camAt(t) {
  let i = 0;
  while (i < CAMS.length - 2 && CAMS[i + 1].T <= t) i++;
  const a = CAMS[i], b = CAMS[i + 1];
  const u = Math.min(1, Math.max(0, (t - a.T) / ((b.T - a.T) || 1)));
  return {
    dist: a.dist + (b.dist - a.dist) * u,
    pitch: a.pitch + (b.pitch - a.pitch) * u,
    target: u < 0.5 ? a.target : b.target,
  };
}
const targetName = (tg) => (Array.isArray(tg) ? `图面点 ${tg.join(',')}` : ({ sf: '起终点', pair: '双角色', male: '全马角色', female: '半马角色' }[tg] || String(tg)));
const EVENT_ZH = {
  loading: '加载条', reveal: '赛道点亮', arch: '拱门', zones: '分区地砖', gun: '发枪波纹', go: 'GO!',
  bridge: '桥梁隆起', elev: '海拔小窗', elevTag: '海拔标签', autumn: '秋日滤镜', uturn: '折返牌',
  fork: '分流箭头', dimHalf: '半马降暗', montage: '快进速度线', endTitle: '片尾题字',
};
// 常驻型事件（拱门一直立着、半马一直暗着）：只在“它开始的那一行”提一次
const PERSISTENT = new Set(['arch', 'dimHalf', 'reveal']);

// ── 逐行分镜
const rows = VO_LINES.map((l) => {
  const mid = l.t + l.d / 2;
  const cam = camAt(mid);
  const cards = cardsAt(mid).map((c) => c.title);
  const stk = activeStickers(mid).map((s) => s.name);
  const started = EVENTS.filter((e) => {
    const T = e.t !== undefined ? e.t : tAtKm(e.at.km);
    return T >= l.t - 0.01 && T < l.t + l.d - 0.01;
  }).map((e) => {
    const zh = EVENT_ZH[e.type] || e.type;
    return PERSISTENT.has(e.type) ? `${zh}出现` : (e.d !== undefined ? `起·${zh}` : zh);
  });
  const running = EVENTS.filter((e) => e.d !== undefined && !PERSISTENT.has(e.type))
    .filter((e) => { const T = e.t !== undefined ? e.t : tAtKm(e.at.km); return mid > T + 0.01 && mid < T + e.d; })
    .map((e) => EVENT_ZH[e.type] || e.type);
  const evs = [...new Set([...started, ...running])];
  const mk = maleKm(mid), fk = femaleKm(mid);
  return {
    n: l.i, id: l.id, seg: SEG_OF[l.id] || '', t: l.t, d: l.d, text: l.text, km: l.km,
    mk, fk, cps: l.cps, gap: l.gap,
    cam: { name: shotName(cam.dist), dist: cam.dist, pitch: cam.pitch, target: targetName(cam.target) },
    cards, stk, evs,
  };
});

// ── 段落节奏
const segRows = NARRATION.map((n) => {
  const ls = VO_LINES.filter((l) => SEG_OF[l.id] === n.id);
  const t1 = ls[ls.length - 1].t + ls[ls.length - 1].d;
  const span = t1 - ls[0].t;
  const kmA = maleKm(ls[0].t), kmB = maleKm(t1);
  const chars = ls.reduce((a, l) => a + l.charsNoPunct, 0);
  return {
    id: n.id, name: SEG[n.id], t0: ls[0].t, t1, span, n: ls.length, chars,
    cps: chars / span, kmA, kmB, speed: kmB > kmA ? (kmB - kmA) / span : null,
  };
});

// ── 项目点（两位角色各一条时间）
const ptRows = POINT_TIMES.map((p) => ({
  ...p,
  script: (() => {
    const l = VO_LINES.find((x) => Math.abs(x.km - (p.full ?? p.half)) < 0.35);
    return l ? `${l.id} ${l.text}` : '—（脚本未点名，画面用路名/图标交代）';
  })(),
}));

// ── KPI
$('#kpi').innerHTML = [
  [DURATION.toFixed(2) + 's', `片长 = 音轨 ${AUDIO_DUR}s + 片头 ${AUDIO_OFFSET}s + 片尾 ${(DURATION - AUDIO_DUR - AUDIO_OFFSET).toFixed(2)}s`],
  [`${AUDIO.cues} 条 / ${VO_LINES.reduce((a, l) => a + l.charsNoPunct, 0)} 字`, '客户音轨逐句（一字未删）'],
  [CPS_AVG + ' 字/秒', '实测语速（不是估的）'],
  [VO_LINES.length + '', '个分镜（= 一条字幕一镜）'],
  [fmt(T_GO), '发枪 GO'],
  [fmt(T_FEMALE_FINISH) + ' / ' + fmt(T_MALE_FINISH), '半马 / 全马冲线'],
].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');

// ── 表 1：逐行分镜
$('#shots').innerHTML = rows.map((r) => `<tr id="${r.id}">
  <td class="num">${String(r.n).padStart(2, '0')}</td>
  <td class="tm">${fmtF(r.t)}</td>
  <td class="tm">${fmtF(r.t + r.d)}</td>
  <td class="num">${r.d.toFixed(2)}</td>
  <td class="seg">${r.seg ? SEG[r.seg] : ''}</td>
  <td class="vo">${esc(r.text)}</td>
  <td class="num">${f2(r.mk)}</td>
  <td class="num">${f2(r.fk)}</td>
  <td class="cam">${venueAt(r.t) ? '<b style="color:#1F63E0">副本</b> ' : ''}<b>${venueAt(r.t) ? '主会场 · ' + (venueAt(r.t).id === 'start' ? '起跑' : venueAt(r.t).id === 'half' ? '半马冲线' : '加冕') : r.cam.name}</b><br><span>${venueAt(r.t) ? '近景舞台（米制）' : 'd' + Math.round(r.cam.dist) + ' · 俯' + Math.round(r.cam.pitch) + '° · 跟' + r.cam.target}</span></td>
  <td class="el">${[r.stk.length ? '贴纸：' + r.stk.join('、') : '', r.cards.length ? '卡片：' + r.cards.join('、') : '', r.evs.length ? '效果：' + r.evs.join('、') : ''].filter(Boolean).join('<br>') || '<i>—</i>'}</td>
  <td class="sfx">${sfxOf(r.t, r.t + r.d)}</td>
</tr>`).join('');

// ── 表 2：段落
$('#segs').innerHTML = segRows.map((s) => `<tr>
  <td class="seg">${s.name}</td><td class="tm">${fmt(s.t0)}–${fmt(s.t1)}</td>
  <td class="num">${s.span.toFixed(1)}s</td><td class="num">${s.n}</td><td class="num">${s.chars}</td>
  <td class="num">${s.cps.toFixed(2)}</td>
  <td class="num">${s.kmA.toFixed(2)}→${s.kmB.toFixed(2)}</td>
  <td class="num">${s.speed ? s.speed.toFixed(2) : '—'}</td>
</tr>`).join('');

// ── 表 3：项目点
$('#points').innerHTML = ptRows.map((p) => `<tr class="${p.kind}">
  <td>${esc(p.name)}</td>
  <td class="num">${p.full === null ? '—' : p.full.toFixed(2)}</td>
  <td class="num">${p.half === null ? '—' : p.half.toFixed(2)}</td>
  <td class="tm ${p.tMale === null ? 'na' : ''}">${p.tMale === null ? '不经过' : fmt(p.tMale)}</td>
  <td class="tm ${p.tFemale === null ? 'na' : ''}">${p.tFemale === null ? '不经过' : fmt(p.tFemale)}</td>
  <td class="num">${p.tMale !== null && p.tFemale !== null ? (Math.abs(p.tMale - p.tFemale) < 0.05 ? '同框' : Math.abs(p.tMale - p.tFemale).toFixed(2) + 's') : '—'}</td>
  <td class="note2">${esc(p.note)}</td>
  <td class="note2">${esc(p.script)}</td>
</tr>`).join('');

// ── 口径核对：脚本里写死的公里数 vs 官方图上量出来的里程
//  全部按 2026-11-03 客户第三次录音（audio/1029）的字面值；
//  区间（22.6—38.5 / 40—41）只要官方里程落在区间内就算对得上；
//  单点给 tol（台词取整到 0.1km 的容差）；span 行判“脚本区间是否落在图上那段路里”
// 项目点名不再写死：按图上里程从 POINT_TIMES 里就近匹配（换赛事包自动跟着变）
const ptName = (km, fallback) => {
  const p = POINT_TIMES.find((x) => Math.abs((x.full ?? x.half) - km) < 0.3);
  return p ? p.name : fallback;
};
const SCRIPT_KM = [
  { km: 2.73, script: '约2.5', real: 2.73, range: [2.5, 2.5], line: 'L08' },
  { km: 6.38, script: '约5.8', real: 6.38, range: [5.8, 5.8], line: 'L09' },
  { km: 8.20, script: '约8.1', real: 8.20, range: [8.1, 8.1], line: 'L11' },
  { km: 19.61, script: '约19.5', real: 19.61, range: [19.5, 19.5], line: 'L22' },
  { km: 22.40, script: '约22.6—38.5', real: 22.40, range: [22.6, 38.5], span: [22.40, 40.59], line: 'L29–L31' },
  { km: 29.20, script: '约29.1', real: 29.20, range: [29.1, 29.1], tol: 0.15, line: 'L31' },
  { km: 40.59, script: '约40—41', real: 40.59, range: [40.0, 41.0], line: 'L32–L33' },
  { km: 42.195, name: '全马终点', script: '42.195', real: 42.195, range: [42.195, 42.195], tol: 1e-6, line: 'L37' },
  { km: 21.0975, name: '半马终点', script: '21.0975', real: 21.0975, range: [21.0975, 21.0975], tol: 1e-6, line: 'L38' },
].map((m) => ({ ...m, point: m.name || ptName(m.km, `约${m.km}km`) }));
const judge = (m) => {
  const [a, b] = m.range;
  if (m.span) {
    // 脚本说的是一段路（22.6—38.5 穿过公园）：只要这段落进图上那段路（22.40 进园 → 40.59 湿地）就算对
    const [s0, s1] = m.span, e = 0.25;
    const ok2 = a >= s0 - e && b <= s1 + e;
    return { ok: ok2, txt: ok2 ? `✓ 落在图上 ${s0.toFixed(2)}–${s1.toFixed(2)} 内` : '越出图上区间' };
  }
  if (m.real >= a - 1e-6 && m.real <= b + 1e-6) return { ok: true, txt: '✓ 落在脚本区间内' };
  const d = a === b ? m.real - a : (m.real < a ? m.real - a : m.real - b);
  if (m.tol && Math.abs(d) <= m.tol) return { ok: true, txt: `✓ 取整差 ${Math.abs(d).toFixed(2)}km` };
  return { ok: false, txt: `${d > 0 ? '+' : ''}${d.toFixed(2)}km` };
};
const verdicts = SCRIPT_KM.map((m) => ({ ...m, v: judge(m) }));
const bad = verdicts.filter((v) => !v.v.ok);
$('#anchor').innerHTML = `脚本里点名的公里数共 <b>${SCRIPT_KM.length}</b> 处：` +
  verdicts.map((m) => `<span class="${m.v.ok ? 'tagok' : 'tagd'}">${m.point}：脚本 ${m.script} · 图上 ${m.real.toFixed(2)} ${m.v.txt}</span>`).join('') +
  `。画面一律按官方图走、字幕按脚本走；偏离的 <b>${bad.length}</b> 处（${bad.map((b) => b.point).join('、')}）是今年新增城区段与既有口径差，见设定集第 08 节“待确认”。`;

// ── 片尾口径
$('#tail').textContent = `音轨 ${AUDIO_DUR}s 结束时是片子第 ${(AUDIO_OFFSET + AUDIO_DUR).toFixed(2)}s，最后一句“赛道见”止于 ${fmt(lineT('L42') + VO_LINES[41].d)}；片尾题字 ${(DURATION - AUDIO_OFFSET - AUDIO_DUR).toFixed(2)}s。`;
void [SPLIT, CARDS, STICKERS, lineEnd, rows];
