// 补给图标簇 / 地标贴纸 的口径自检（纯 DOM 数值，不看图）
//  ① 贴纸底部小尖角已删除
//  ② 图标簇在角色下层（marks）
//  ③ 显隐由距离决定：螃蟹离点位 ±2km
//  ④ 卡片钉死：卡片中心 = 落点正上方 260px，且与同里程公里牌同 x
//  ⑤ 有公里牌时，引线终点 = 牌面上沿（牌当箭头）；无牌时，终点 = 地面落点
import { launch, openPage } from './shot.mjs';
import { DURATION, SUBTITLES } from '../src/config/story.js';
// 渲染层读的是 SUBTITLES（已 +30 帧），这里必须用同一份，否则判定窗错开 1 s
const hasSubAt = (t) => SUBTITLES.some((l) => t >= l.t - 1e-6 && t < l.t + l.d + 1e-6);

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  try {
  await window.__seek(tt);
  const parseT = (el) => {
    const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(el.getAttribute('transform') || '');
    const s = /scale\(([-\d.]+)\)/.exec(el.getAttribute('transform') || '');
    return m ? { x: +m[1], y: +m[2], sc: s ? +s[1] : 1 } : null;
  };
  const ov = document.querySelector('#ov');
  const texts = [...ov.querySelectorAll('text')];

  // 公里牌：text 两位数字，向上两级是 translate(x y) scale(s)，其首子为杆子（d 含 "V -34"）
  const badges = [];
  for (const tx of texts) {
    const s = (tx.textContent || '').trim();
    if (!/^\d{1,2}$/.test(s)) continue;
    const inner = tx.parentElement;            // translate(0 -56)
    const g = inner && inner.parentElement;     // translate(x y) scale(sc)
    if (!g || !g.firstElementChild) continue;
    const d = g.firstElementChild.getAttribute('d') || '';
    if (!d.includes('V -34')) continue;
    const tr = parseT(g);
    if (tr) badges.push({ km: +s, ...tr });
  }

  // 补给卡：text 形如 "15km 补给"
  const cards = [];
  for (const tx of texts) {
    const s = (tx.textContent || '').trim();
    if (!/km 补给$/.test(s)) continue;
    const pillG = tx.parentElement;             // translate(0 -52)
    const g = pillG && pillG.parentElement;      // translate(cx cy) opacity
    if (!g) continue;
    const tr = parseT(g);
    if (!tr) continue;
    const op = +(g.getAttribute('opacity') || 1);
    const lead = g.firstElementChild;
    const ld = lead ? lead.getAttribute('d') || '' : '';
    const m = /^M 0 46 V ([-\d.]+)$/.exec(ld);
    cards.push({ label: s, km: +s.replace(/km.*/, ''), cx: tr.x, cy: tr.y, op, endRel: m ? +m[1] : null });
  }

  // 层序：主视口里，补给卡组是否排在第一个含 <image> 的元素（角色）之前
  const main = document.querySelector('g[clip-path*="vc-main"]');
  let layer = null;
  if (main) {
    const kids = [...main.children];
    const idxCrab = kids.findIndex((k) => k.querySelector('image'));
    const cardEls = texts.filter((tx) => /km 补给$/.test((tx.textContent || '').trim())).map((tx) => tx.parentElement.parentElement);
    const idxCard = cardEls.length ? kids.indexOf(cardEls[0]) : -1;
    layer = { idxCard, idxCrab, ok: idxCard >= 0 && idxCrab >= 0 ? idxCard < idxCrab : null };
  }
  const st = window.__director.state;
  return {
    t: +tt.toFixed(2), maleKm: +st.male.km.toFixed(3), femaleKm: +st.female.km.toFixed(3),
    cards: cards.filter((c) => c.op > 0.02), all: cards, badges: badges.filter((b) => b.km <= 42), layer,
    tailGone: !ov.innerHTML.includes('L 0 135 L 16 111'),
  };
  } catch (e) { return { err: String(e && e.stack).slice(0, 600), t: tt }; }
}, t);

const rows = [];
// 2026-11-08：扫描范围原来写死 76.8s（旧片长），换音轨后后半程补给点根本没被扫到
for (let t = 0; t <= DURATION - 0.1; t += 0.2) {
  try { rows.push(await probe(+t.toFixed(2))); }
  catch (e) { console.log('FAIL t=' + t.toFixed(2) + ' ' + String(e.message).slice(0, 90)); }
}

const errs = rows.filter((r) => r.err);
if (errs.length) console.log('ERR', JSON.stringify(errs[0]).slice(0, 300));
// 按卡片标签汇总显隐窗口
const byLabel = new Map();
for (const r of rows) {
  for (const c of r.all) {
    if (c.op <= 0.02) continue;
    const km = r.maleKm;
    if (!byLabel.has(c.label)) byLabel.set(c.label, { first: r.t, last: r.t, minD: 9, maxD: -9, rows: [] });
    const o = byLabel.get(c.label);
    o.last = r.t; o.minD = Math.min(o.minD, km - c.km > 0 ? km - c.km : c.km - km);
    o.maxD = Math.max(o.maxD, Math.abs(km - c.km));
    o.rows.push({ t: r.t, km: +km.toFixed(2), d: +(km - c.km).toFixed(2), cx: c.cx, cy: c.cy, endRel: c.endRel });
  }
}
console.log('=== ① 贴纸尖角 ===');
console.log('尖角已删除:', rows.every((r) => r.tailGone));

console.log('\n=== ② 层序（marks 在角色之前）===');
const L = rows.find((r) => r.layer && r.layer.idxCard >= 0);
console.log(JSON.stringify(L ? L.layer : null));

console.log('\n=== ③ 显隐窗口（按里程）===');
for (const [k, v] of [...byLabel].sort((a, b2) => Number(a[0]) - Number(b2[0]))) {
  console.log(`${k.padEnd(12)} t ${v.first.toFixed(1)}–${v.last.toFixed(1)}  里程偏差 ${v.minD.toFixed(2)}–${v.maxD.toFixed(2)} km`);
}

console.log('\n=== ④⑤ 卡片钉死 / 引线落点 ===');
let driftMax = 0, xMax = 0, badgeEndMax = 0, groundEndMax = 0, nBadge = 0, nGround = 0;
for (const r of rows) {
  for (const c of r.cards) {
    const bd = r.badges.find((bb) => bb.km === c.km);
    if (bd) {
      nBadge++;
      driftMax = Math.max(driftMax, Math.abs(c.cy - bd.y + 260));
      xMax = Math.max(xMax, Math.abs(c.cx - bd.x));
      const want = bd.y - 80 * bd.sc - 8 - c.cy;      // 牌面上沿（相对卡片中心）
      badgeEndMax = Math.max(badgeEndMax, Math.abs(c.endRel - want));
    } else if (c.endRel != null) {
      nGround++;
      groundEndMax = Math.max(groundEndMax, Math.abs(c.endRel - 260));
    }
  }
}
console.log(`有牌帧 ${nBadge}：卡片中心相对牌锚点偏移误差 ≤ ${driftMax.toFixed(2)}px（应恒为 260）`);
console.log(`有牌帧：卡片 x 与牌 x 偏差 ≤ ${xMax.toFixed(2)}px（应为 0）`);
console.log(`有牌帧：引线终点距牌面上沿误差 ≤ ${badgeEndMax.toFixed(2)}px（应为 0，牌即箭头）`);
console.log(`无牌帧 ${nGround}：引线终点距地面落点误差 ≤ ${groundEndMax.toFixed(2)}px（应为 0）`);

// 抽样：15km 补给在若干时刻的样子
console.log('\n=== 抽样：15km ===');
for (const r of rows.filter((r) => Math.abs(r.maleKm - 15) < 2.2 && Math.abs(r.t % 1) < 0.06)) {
  const c = r.cards.find((x) => x.km === 15);
  const bd = r.badges.find((x) => x.km === 15);
  console.log(`t=${r.t.toFixed(1)} km=${r.maleKm.toFixed(2)} ` +
    (c ? `card(${c.cx.toFixed(0)},${c.cy.toFixed(0)}) op=${c.op.toFixed(2)} end=${c.endRel === null ? 'badge' : c.endRel.toFixed(0)}` : '—') +
    (bd ? ` badge(${bd.x.toFixed(0)},${bd.y.toFixed(0)} s=${bd.sc.toFixed(2)})` : ' noBadge'));
}

const ok = {
  '①贴纸无尖角': rows.every((r) => r.tailGone),
  '②补给组在角色下层': rows.every((r) => !r.layer || r.layer.ok !== false),
  '③显隐=±2km': [...byLabel].every(([, v]) => v.maxD <= 2.06) && byLabel.size >= 15,
  '④卡片钉死(260px,同x)': driftMax < 0.5 && xMax < 0.5,
  '⑤引线落在真实落点': badgeEndMax < 0.5 && groundEndMax < 0.5,
  // 2026-11-08：补给簇的站名标签（cy−74…cy−30）不许被字幕条（896…984）压住 ——
  //   被压住时渲染器会直接不画标签（见 annotations.js drawStations）
  '⑥站名不压字幕（仅有字幕时）': rows.filter((r) => hasSubAt(r.t))
    .every((r) => r.cards.every((c) => (c.cy - 30) <= 896 + 2 || (c.cy - 74) >= 984 - 2)),
};
console.log('\n=== 结论 ===');
for (const [k, v] of Object.entries(ok)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
if (!Object.values(ok).every(Boolean)) process.exitCode = 1;
await b.close();
