// 右上角站位冲突自检：地标照片卡（固定 186–472 / 1304–1864）与信息卡、图例、海拔窗
import { launch, openPage } from './shot.mjs';

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const svg = document.querySelector('#ov');
  const box = (el) => { const b = el.getBBox(); const m = el.getCTM(); return { x: Math.round(m.e + b.x * m.a), y: Math.round(m.f + b.y * m.d), w: Math.round(b.width * m.a), h: Math.round(b.height * m.d) }; };
  const r = { t: +tt.toFixed(2) };
  // 地标卡：宽 560 的白卡 —— 量**卡片本身**（四个角变换后的包围盒），不要量整个组。
  // 组里还有引线和黄点：引线常常斜着拉出几十像素，用组的 AABB 会把“线从图例旁边经过”误判成“卡片压图例”。
  const card = svg.querySelector('rect[width="560"]');
  if (card) {
    const g = card.closest('g');
    if (+(g.getAttribute('opacity') || 1) > 0.02) {
      const cb = card.getBBox(), M = card.getCTM();
      const xs = [], ys = [];
      for (const [px, py] of [[cb.x, cb.y], [cb.x + cb.width, cb.y], [cb.x, cb.y + cb.height], [cb.x + cb.width, cb.y + cb.height]]) {
        xs.push(M.a * px + M.c * py + M.e); ys.push(M.b * px + M.d * py + M.f);
      }
      r.sticker = { x: Math.round(Math.min(...xs)), y: Math.round(Math.min(...ys)), w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)) };
    }
  }
  // 信息卡：标题字号 40 / 字重 900 的那条文本所在组
  // 折返点地面字牌也常用 font-size 40，但它不是信息卡 ⇒ 带 data-u 的那组排除掉
  const titles = [...svg.querySelectorAll('text[font-size="40"]')].filter((el) => !el.closest('[data-u]'));
  r.cards = titles.map((el) => {
    let g = el.parentElement;
    while (g && !g.querySelector('rect')) g = g.parentElement;
    return { title: el.textContent, ...box(g) };
  });
  // 图例：宽 306 的面板
  const lg = [...svg.querySelectorAll('rect')].find((e) => +e.getAttribute('width') === 306);
  if (lg) r.legend = box(lg.closest('g'));
  // 海拔窗：data-elev 的内层矩形
  const ev = svg.querySelector('[data-elev] rect');
  if (ev) r.elev = box(ev);
  return r;
}, t);

const hit = (a, c) => !(a.x + a.w < c.x || a.x > c.x + c.w || a.y + a.h < c.y || a.y > c.y + c.h);
const rows = [];
for (let t = 2; t <= 76; t += 0.5) {
  try { rows.push(await probe(+t.toFixed(1))); } catch (e) { rows.push({ t, err: String(e.message).slice(0, 60) }); }
}
const acc = { sc: [], sl: [], ce: [] };
const seen = new Set();
for (const r of rows) {
  for (const c of r.cards || []) {
    if (r.sticker && hit(r.sticker, c)) { if (!seen.has('s' + c.title + r.t)) { acc.sc.push(`${r.t}:${c.title}`); seen.add('s' + c.title + r.t); } }
    if (r.elev && hit(r.elev, c)) { if (!seen.has('e' + c.title + r.t)) { acc.ce.push(`${r.t}:${c.title}`); seen.add('e' + c.title + r.t); } }
  }
  if (r.sticker && r.legend && hit(r.sticker, r.legend)) acc.sl.push(r.t);
}
const sum = (a) => { const by = new Map(); for (const s of a) { const [t, k] = String(s).split(':'); by.set(k || '-', [...(by.get(k || '-') || []), t]); } return [...by].map(([k, v]) => `${k}×${v.length}帧(${v[0]}–${v[v.length - 1]})`).join(' '); };
console.log('地标卡 × 信息卡:', acc.sc.length ? sum(acc.sc) : '无');
console.log('地标卡 × 图例  :', acc.sl.length ? acc.sl.length + ' 帧' : '无');
console.log('信息卡 × 海拔窗:', acc.ce.length ? sum(acc.ce) : '无');
const s = rows.filter((r) => r.sticker);
console.log('地标卡出现帧数:', s.length, s[0] ? JSON.stringify(s[0].sticker) : '');
console.log('信息卡名单:', JSON.stringify([...new Set(rows.flatMap((r) => (r.cards || []).map((c) => c.title)))]));
await b.close();
