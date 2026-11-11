// 预览播放器 / 渲染目标
//   ?t=12.3        打开即停在该时刻
//   ?clean=1       隐藏播放器控件（截图、渲染 4K 用）
//   ?dpr=2         WebGL 像素比（4K 渲染时由渲染脚本设置）
// 供自动化调用：window.__seek(t) → Promise（该帧已画完）
import { Director } from '../engine/director.js';
import { DURATION, FPS, AUDIO_OFFSET, AUDIO_DUR, stickerWindows, activeEvents } from '../engine/timeline.js';
import { CAMERA, NARRATION, VO_LINES, SUBTITLES, SUB_SHIFT_SEC } from '../config/story.js';
import { NAME_SCALE, setNameScale, nameScale } from '../config/view.js';
import { FULL, HALF } from '../engine/course.js';

// 播放器上的段落跳转按钮（9 段旁白）
const SEG_NAMES = {
  start: '起跑', city: '城区', bridge: '大桥', water: '林荫·湖畔', bridge2: '二次上桥',
  fork: '折返分流', half: '半马冲线', loop: '全马环湖', finish: '终点',
};

/** 场景名（与客户口径一致：三个副本 + 地图主场景） */
const SCENE_CN = { course: '地图主场景', venue: '主会场副本', split: '分流副本' };
/** 当前时刻的口播条目（43 条里的一条）；空档返回 null —— 用**声音**时间 */
const CUE_OF = (t) => {
  for (let i = 0; i < VO_LINES.length; i++) {
    const l = VO_LINES[i];
    if (t >= l.t - 1e-6 && t < l.tOut + 1e-6) return { ...l, idx: i + 1 };
  }
  return null;
};
/** 当前在屏的**字幕**（比声音晚 SUB_SHIFT_SEC） */
const SUBCUE_OF = (t) => {
  for (let i = 0; i < SUBTITLES.length; i++) {
    const l = SUBTITLES[i];
    if (t >= l.t - 1e-6 && t <= l.t + l.d + 1e-6) return { ...l, idx: i + 1, tOut: +(l.t + l.d).toFixed(3) };
  }
  return null;
};
const NEXT_SUB = (t) => SUBTITLES.find((l) => l.t > t + 1e-6) || null;

/* ── 三个事件框的数据源 ─────────────────────────────
   · 同期字幕：VO_LINES（42 条，逐条上屏）
   · 图卡入场 / 出场：timeline 算好的 STICKERS 窗口 T0/T1（含 follow 卡） */
const STK = stickerWindows().map((s) => ({ id: s.id, name: s.name, t0: s.T0, t1: s.T1 }));
const STK_IN = [...STK].sort((a, b) => a.t0 - b.t0);
const STK_OUT = [...STK].sort((a, b) => a.t1 - b.t1);
const FNO = (t) => `F${Math.round(t * FPS)}`;
const fmtEv = (t) => `${t.toFixed(2)}s · ${FNO(t)}`;
/** 最近一次（≤t）与下一次（>t） */
function around(list, t, key) {
  let prev = null, next = null;
  for (const e of list) {
    if (e[key] <= t + 1e-6) prev = e;
    else { next = e; break; }
  }
  return { prev, next };
}
const NEXT_CUE = (t) => VO_LINES.find((l) => l.t > t + 1e-6) || null;

const q = new URLSearchParams(location.search);
const clean = q.get('clean') === '1';

// ── 折返点角度临时覆盖（调参用，不进成片）
//   ?utrot=19.61:12,29.20:-8   → 按里程分别给角度
//   ?utrot=15                  → 两个都先用同一个角度
//   预览器里按 , / . 还能实时 ±1°（Shift 为 ±0.2°），数值显示在画面下方的提示条上。
window.__UTROT = (() => {
  const out = {};
  const raw = q.get('utrot');
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':');
    if (v === undefined) { const d = +k; if (Number.isFinite(d)) out['*'] = d; continue; }
    const km = +k, deg = +v;
    if (Number.isFinite(km) && Number.isFinite(deg)) out[km.toFixed(2)] = deg;
  }
  return out;
})();
const dpr = +(q.get('dpr') || Math.min(2, window.devicePixelRatio || 1));
const root = document.getElementById('stage');
const D = new Director(root, { dpr });
// ?noprobe=1 关掉三维深度探针（纯看画面、或预览机性能吃紧时用）
if (q.get('noprobe') === '1') D.world.probeEnabled(false);
window.__director = D;

// ── 两条音轨（客户 2026-11-03：通篇加音效；2026-11-04 去掉 BGM）
//    AUD = 口播（内嵌 mp3），片子时间 = 音轨时间 + AUDIO_OFFSET
//    SFX = 音效床（dist/sfx.mp3，与片子 0 对齐、已按旁白压音）
const AUD = window.__AUDIO ? new Audio(window.__AUDIO) : null;
if (AUD) { AUD.preload = 'auto'; AUD.volume = 1; }
window.__audio = AUD;
const SFX = window.__SFX ? new Audio(window.__SFX) : null;
if (SFX) { SFX.preload = 'auto'; SFX.volume = 1; SFX.loop = false; }
window.__sfx = SFX;
// BGM 已撤销（客户 2026-11-04）：页面不再内嵌 __BGM，成片音轨 = 口播 + 音效
window.__bgm = null;
// 客户 2026-11-08-e：口播 / 音效两个开关拆开，可以单独听（调音效和口播的电平比）
let voOn = true, sfxOn = true;
const sndOn = () => voOn || sfxOn;

function syncAudio(t, force = false) {
  if (!sndOn()) return;
  if (AUD && voOn) {
    const want = Math.max(0, Math.min(AUDIO_DUR, t - AUDIO_OFFSET));
    if (force || Math.abs(AUD.currentTime - want) > 0.06) {
      try { AUD.currentTime = want; } catch { /* 元数据还没到 */ }
    }
  }
  if (SFX && sfxOn) {
    const want2 = Math.max(0, Math.min(DURATION, t));
    if (force || Math.abs(SFX.currentTime - want2) > 0.08) {
      try { SFX.currentTime = want2; } catch { /* 元数据还没到 */ }
    }
  }
}
/** 两条轨一起播/停（各自看自己的开关） */
function playAll() {
  if (AUD && voOn) AUD.play().catch(() => {});
  if (SFX && sfxOn) SFX.play().catch(() => {});
}
function pauseAll() {
  if (AUD) AUD.pause();
  if (SFX) SFX.pause();
}

// 默认不自动播：浏览器不允许无手势播放音频，等用户点 ▶（画面与音轨同时起，天然对齐）
let t = +(q.get('t') || 0), playing = false, last = 0;   // ?t= 也在下面按帧网格吸附
const ui = document.getElementById('ui');
const bar = document.getElementById('bar'), btn = document.getElementById('play');
const P = {
  frame: document.getElementById('p-frame'), total: document.getElementById('p-total'),
  sec: document.getElementById('p-sec'), cue: document.getElementById('p-cue'),
  cuedur: document.getElementById('p-cuedur'), kmm: document.getElementById('p-kmm'),
  kmf: document.getElementById('p-kmf'), scene: document.getElementById('p-scene'),
  evsub: document.getElementById('p-evsub'), evsubN: document.getElementById('p-evsub-n'),
  evin: document.getElementById('p-evin'), evinN: document.getElementById('p-evin-n'),
  evinTag: document.getElementById('p-evin-tag'),
  evout: document.getElementById('p-evout'), evoutN: document.getElementById('p-evout-n'),
};

// ── 帧号（客户 2026-10-27：播放器上要能看到“从片头到播放头共第几帧”）
//  成片按 30fps 采样：第 n 帧的画面时刻 = n / 30 秒，n 从 0 开始。
//  片长 DURATION（voice.js 自动推导）⇒ Math.round(DURATION * 30) 帧（0 … N-1）。
// FPS 来自 story.js（单一来源），这里不再硬写
const TOTAL_FRAMES = Math.round(DURATION * FPS);
const frameOf = (x) => Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(x * FPS)));
const tOfFrame = (n) => Math.max(0, Math.min(TOTAL_FRAMES - 1, n)) / FPS;
const clampT = (x) => Math.max(0, Math.min(DURATION, Number.isFinite(+x) ? +x : 0));
/** 控件上的跳转一律落到帧网格上，这样“看到的第 N 帧”就是导出的第 N 帧 */
const seekTo = (x) => window.__seek(tOfFrame(frameOf(x)));
const tc = (x) => {
  const m = Math.floor(x / 60), s = x - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};
// 起手把 ?t= 吸附到帧网格：这样控件上显示的时刻就是这一帧真正的时刻
t = tOfFrame(frameOf(clampT(t)));

const PANEL_W = 300;   // 右侧信息栏宽（与 stage.html 的 #panel 一致）
function fit() {
  // 2026-11-08：信息挪到右侧栏 ⇒ 缩放按“剩下的宽度”算，画面不再被栏压住
  const s = Math.min((innerWidth - (clean ? 0 : PANEL_W)) / 1920, (innerHeight - (clean ? 0 : 56)) / 1080);
  root.style.transform = `scale(${s})`;
  root.parentElement.style.height = `${1080 * s}px`;
  root.parentElement.style.width = `${1920 * s}px`;
}
function draw() {
  D.render(t);
  if (!clean) {
    bar.value = t;
    const n = frameOf(t);
    const cue = CUE_OF(t);
    P.frame.textContent = String(n);
    P.total.textContent = String(TOTAL_FRAMES);
    P.sec.textContent = `${(n / FPS).toFixed(3)} s　(${tc(t)})`;
    P.cue.textContent = cue ? `${cue.idx}／${VO_LINES.length}　${cue.text}` : `—／${VO_LINES.length}　（空档：无口播）`;
    P.cue.className = 'v sm' + (cue ? '' : ' mut');
    P.cuedur.textContent = cue ? `${cue.d.toFixed(2)} s` : '—';
    const st = D.state;
    P.kmm.textContent = `${st.male.km.toFixed(3)} km`;
    P.kmf.textContent = `${st.female.km.toFixed(3)} km`;
    P.scene.textContent = SCENE_CN[st.scene] || st.scene;

    // ── 三个事件框（2026-11-08）：同期字幕 / 图卡入场 / 图卡出场
    //    口径：主行 = “此刻正在发生的那一个事件”（没有就写无），副行 = 下一次同类事件
    const sub = SUBCUE_OF(t), nx = NEXT_SUB(t);
    const cueWin = sub ? `${sub.t.toFixed(2)}–${sub.tOut.toFixed(2)}s · ${FNO(sub.t)}–${FNO(sub.tOut)}` : '';
    P.evsub.textContent = sub ? `${sub.idx}／${SUBTITLES.length}　${cueWin}` : `无（空档：无字幕）`;
    P.evsub.className = 'v sm' + (sub ? '' : ' mut');
    P.evsub.title = sub ? sub.text : '';
    if (nx) {
      const g2 = sub ? nx.t - sub.tOut : 0;
      const gapTxt = g2 > 0.05 ? `（+${g2.toFixed(2)}s）` : '';
      P.evsubN.textContent = `次条 ${SUBTITLES.indexOf(nx) + 1}／${SUBTITLES.length}　${nx.t.toFixed(2)}s · ${FNO(nx.t)}${gapTxt}`;
    } else P.evsubN.textContent = '次条 无（已到片尾）';

    const inR = around(STK_IN, t, 't0');
    const outR = around(STK_OUT, t, 't1');
    const onAir = STK.filter((s2) => t >= s2.t0 && t <= s2.t1).map((s2) => s2.name);
    P.evin.textContent = inR.prev ? `最近 ${inR.prev.name}　${fmtEv(inR.prev.t0)}` : '无（片头前）';
    P.evin.className = 'v sm' + (inR.prev ? '' : ' mut');
    P.evinN.textContent = inR.next ? `下次 ${inR.next.name}　${fmtEv(inR.next.t0)}` : '下次 无（已全部出完）';
    P.evout.textContent = outR.prev ? `最近 ${outR.prev.name}　${fmtEv(outR.prev.t1)}` : '无（尚无卡收场）';
    P.evout.className = 'v sm' + (outR.prev ? '' : ' mut');
    P.evoutN.textContent = outR.next ? `下次 ${outR.next.name}　${fmtEv(outR.next.t1)}` : '下次 无（已全部出完）';
    P.evinTag.className = onAir.length ? 'tag' : 'tag off';
    P.evinTag.textContent = onAir.length ? `在场 ${onAir.length}` : '无卡';
    P.evinTag.title = onAir.join(' / ');

    btn.textContent = playing ? '❚❚' : '▶';
    tune(activeEvents(t, 'uturn'));
  }
}

/* ── 地名缩放控件（客户 2026-11-01）：右侧栏滑块，0.1 步进，默认 1.0，范围 1.0–5.0
 *    只改**地图路名**的字号；预览器改完立刻重画当前帧，4K 渲染用 ?names= 带同一个值。 */
const NS_EL = document.getElementById('nscale'), NS_V = document.getElementById('nscale-v');
function applyNameScale(v, redraw = true) {
  const val = setNameScale(v);
  if (NS_EL) NS_EL.value = String(val);
  if (NS_V) NS_V.textContent = val.toFixed(1);
  if (redraw) draw();
  return val;
}
if (NS_EL) NS_EL.addEventListener('input', () => applyNameScale(+NS_EL.value));
// 初始化：?names=1.6 优先（渲染脚本用），否则回到默认 1.0
applyNameScale(q.get('names') !== null ? +q.get('names') : NAME_SCALE.def, false);

/** 调参提示条：只在折返点出场期间显示，读数 = 当前实际生效的角度 */
function tune(list) {
  const el = document.getElementById('tune');
  if (!el) return;
  const u = list && list.length ? list[list.length - 1] : null;
  if (!u) { el.style.display = 'none'; return; }
  const key = u.km.toFixed(2);
  const deg = (window.__UTROT && typeof window.__UTROT[key] === 'number') ? window.__UTROT[key]
    : (window.__UTROT && typeof window.__UTROT['*'] === 'number') ? window.__UTROT['*'] : (u.rotDeg || 0);
  el.style.display = 'block';
  el.textContent = `折返点 ${key} km · rotDeg ${deg.toFixed(1)}°　（, / . 微调 ±1°，Shift 为 ±0.2°）`;
}
function loop(now) {
  if (playing) {
    // 有音轨且在播时，画面时间**由音轨驱动**（而不是各自跑时钟），这样永远不会有累积漂移
    const clocked = AUD && !AUD.paused && !AUD.ended && AUD.currentTime > 0;
    t = clocked ? AUDIO_OFFSET + AUD.currentTime : t + Math.min(0.1, (now - last) / 1000);
    if (SFX && sfxOn && SFX.paused && playing) SFX.play().catch(() => {});
    if (SFX && sfxOn && !SFX.paused && Math.abs(SFX.currentTime - t) > 0.14) {
      try { SFX.currentTime = Math.max(0, t); } catch { /* ignore */ }
    }
    if (t >= DURATION) { t = DURATION; playing = false; pauseAll(); }
    draw();
  }
  last = now;
  requestAnimationFrame(loop);
}

window.__seek = (x) => new Promise((res) => {
  // 一律吸附到帧网格：控件上的“第 N 帧”、显示的时刻、真正渲染的那一帧，三者永远一致
  t = tOfFrame(frameOf(clampT(x))); playing = false;
  pauseAll(); syncAudio(t, true);
  draw(); requestAnimationFrame(() => res(true));
});
/** 按帧号跳转（第 n 帧 = n/30 秒）；自检脚本也用它，保证“测的就是导出的那一帧” */
window.__seekFrame = (n) => window.__seek(tOfFrame(Math.round(n)));
// 2026-11-08：分流副本的螃蟹是 three 场景内的贴图精灵，解码是异步的 ⇒ ready 要一起等，
//   否则「加载完立刻 seek 到 1559 帧截图」会拍到没有螃蟹的一帧（自检工具会误判）。
window.__ready = document.fonts.ready.then(() => {
  draw();
  if (!clean && !q.get('t') && !playing) btn.textContent = '▶';
  const sw = window.__director && window.__director.splitWorld;
  return sw && sw.crabsReady ? sw.crabsReady.then(() => true) : true;
});

if (clean) { ui.style.display = 'none'; document.body.style.background = '#000'; if (AUD) AUD.muted = true; if (SFX) SFX.muted = true; voOn = sfxOn = false; }
else {
  bar.max = DURATION;
  bar.oninput = () => { seekTo(+bar.value); };
  btn.onclick = () => {
    if (t >= DURATION) { t = 0; syncAudio(0, true); }
    playing = !playing;
    if (playing) { syncAudio(t, true); playAll(); }   // 先把两轨对齐到画面时刻再起播
    else pauseAll();
    draw();
  };
  const applySnd = () => {
    if (AUD) AUD.muted = !voOn;
    if (SFX) SFX.muted = !sfxOn;
    if (!playing) return;
    if (sndOn()) { syncAudio(t, true); playAll(); }
    pauseAllPart();
  };
  // 只停被关掉的那一条（另一条不许中断）
  function pauseAllPart() {
    if (AUD && !voOn) AUD.pause();
    if (SFX && !sfxOn) SFX.pause();
  }
  document.getElementById('sndvo').onchange = (e) => { voOn = e.target.checked; applySnd(); };
  document.getElementById('sndsfx').onchange = (e) => { sfxOn = e.target.checked; applySnd(); };
  const marks = document.getElementById('marks');
  // 段落标记：每段旁白开头一跳（9 段，来自 voice.js 的 PARAGRAPHS）
  NARRATION.forEach((n, i) => {
    const b = document.createElement('button');
    // 右侧栏一行放三个 ⇒ 只写短名，序号放 title 里
    b.textContent = SEG_NAMES[n.id] || n.id;
    b.title = `第 ${i + 1} 段 · ${(SEG_NAMES[n.id] || n.id)}（${n.t0.toFixed(2)}s）`;
    b.onclick = () => seekTo(n.t0);
    marks.appendChild(b);
  });
  // 帧步进：逐帧预览（客户 2026-10-27：要能一帧一帧地挑毛病）
  // 步进按帧号加减，而不是给 t 累加 1/30 —— 后者会累积浮点误差，跳到后面就不是整帧了
  const step = (dir) => window.__seekFrame(frameOf(t) + dir);
  document.getElementById('fprev').onclick = () => step(-1);
  document.getElementById('fnext').onclick = () => step(+1);
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); btn.onclick(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) seekTo(t + 5); else step(+1); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); if (e.shiftKey) seekTo(t - 5); else step(-1); }
    // 折返点角度微调：, 逆时针 / . 顺时针（Shift 为 0.2°），立即重绘
    if (e.code === 'Comma' || e.code === 'Period') {
      const list = activeEvents(t, 'uturn');
      if (list.length) {
        e.preventDefault();
        const u = list[list.length - 1];
        const key = u.km.toFixed(2);
        const cur = (window.__UTROT && typeof window.__UTROT[key] === 'number') ? window.__UTROT[key]
          : (window.__UTROT && typeof window.__UTROT['*'] === 'number') ? window.__UTROT['*'] : (u.rotDeg || 0);
        const stp = e.shiftKey ? 0.2 : 1;
        const next = +(cur + (e.code === 'Period' ? stp : -stp)).toFixed(1);
        window.__UTROT[key] = next;
        draw();
        console.log(`[折返点 ${key} km] rotDeg = ${next}°`);
      }
    }
  });
}
addEventListener('resize', fit); fit();
requestAnimationFrame(loop);
void CAMERA;

// ── 调试/自检钩子（截图核对、数值探针用；不参与成片）
window.__dbg = {
  FULL, HALF,
  project: (x, y, h = 0) => D.world.project(x, y, h),
  probeZ: (x, y) => D.world.probeZ(x, y),
  state: () => D.state,
  stickers: () => stickerWindows().map((s) => ({ id: s.id, name: s.name, T0: +s.T0.toFixed(2), T1: +s.T1.toFixed(2), gone: +(s.T1 + 0.4).toFixed(2) })),
  dur: DURATION,
  // 地名缩放（自检探针）：读当前值 + 拿一条路名胶囊的实测字号
  nameScale: () => ({ value: nameScale(), min: NAME_SCALE.min, max: NAME_SCALE.max, step: NAME_SCALE.step }),
  setNameScale: (v) => applyNameScale(v),
  // ── 副本场景探针（自检脚本用）：几何清单 + 画布不透明度采样
  venue: () => {
    const V = window.__director.venueWorld;
    const names = [];
    V.scene.traverse((o) => { if (o.name) names.push(o.name); });
    return {
      meshes: V.scene.children.length,
      named: names,
      crowd: V.crowdCount,
      tapeBroken: false,
      phase: V.phase,
      startVisible: V.startMarks ? V.startMarks.visible : null,
      finishVisible: V.finishMarks ? V.finishMarks.visible : null,
      confetti: V.confetti ? { on: V.confetti.mesh.visible, t0: +V.confetti.t0.toFixed(2) } : null,
      cam: { target: V.camera.position.toArray().map((v) => +v.toFixed(1)) },
    };
  },
  venuePixel: (x, y, which = 'venue') => {
    // 2026-11-06：副本现在有两块画布（主会场 venue / 分流 split），探针要指名道姓地取
    const c = window.__director?.[which === 'split' ? 'splitWorld' : 'venueWorld']?.renderer?.domElement
      || document.querySelectorAll('canvas')[1];
    const g = document.createElement('canvas');
    g.width = c.width; g.height = c.height;
    const ctx = g.getContext('2d');
    ctx.drawImage(c, 0, 0);
    const k = c.width / 1920;
    const d = ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  },
  venueCamAt: (t) => {
    const st = window.__dbg.state();
    void st;
    return null;
  },
  fps: FPS,
  frames: TOTAL_FRAMES,
  frame: () => frameOf(t),
  tOfFrame: (n) => +tOfFrame(n).toFixed(4),
  seekFrame: (n) => window.__seekFrame(n),
};
