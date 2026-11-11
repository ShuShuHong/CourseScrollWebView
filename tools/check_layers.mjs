// 本轮六项口径的数值自检（纯 DOM + 深度探针，不靠眼睛）
import { launch, openPage } from './shot.mjs';

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  const t0 = performance.now();
  await window.__seek(tt);
  const ms = performance.now() - t0;
  const svg = document.querySelector('#ov');
  const texts = [...svg.querySelectorAll('text')];
  const bb = (el) => { const b = el.getBBox(); const m = el.getCTM(); return { x: Math.round(m.e + b.x * m.a), y: Math.round(m.f + b.y * m.d), w: Math.round(b.width * m.a), h: Math.round(b.height * m.d) }; };
  const r = { t: +tt.toFixed(2), ms: +ms.toFixed(1) };

  // ① 地标卡尺寸与站位
  const card = svg.querySelector('rect[width="560"]');
  if (card) {
    const g = card.closest('g');
    const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
    const k = (/scale\(([\d.]+)\)/.exec(g.getAttribute('transform') || '') || [, 1])[1];
    r.card = { w: Math.round(560 * k), h: Math.round(286 * k), top: Math.round(+m[2] - 143 * k), right: Math.round(+m[1] + 280 * k), op: +(g.getAttribute('opacity') || 1) };
  }
  // ② 引线 / 黄点：在角色之前、opacity 恒为 1
  const pin = [...svg.querySelectorAll('circle[fill="#FFC83D"]')].filter((c) => +c.getAttribute('r') > 6 && c.getAttribute('stroke')).pop();
  const root = [...svg.querySelectorAll('g[clip-path]')].find((g) => g.querySelector('image'));
  if (pin && root) {
    const chain = [...root.children];
    r.pin = { idx: chain.indexOf(pin.parentElement), crab: chain.findIndex((k) => k.querySelector('image')), op: +(pin.parentElement.getAttribute('opacity') || 1) };
  }
  // ③ 海拔窗：位置 / 灰字 / 与字幕的文档先后
  const el = svg.querySelector('[data-elev]');
  const subs = texts.filter((e) => e.getAttribute('text-anchor') === 'middle' && +e.getAttribute('font-size') >= 34);
  const sub = subs[subs.length - 1];
  if (el) {
    r.elev = bb(el);
    const gray = texts.find((e) => /1985/.test(e.textContent));
    if (gray) r.gray = { x: Math.round(gray.getBBox().x), y: Math.round(gray.getBBox().y) };
    if (sub) {
      r.subAfterElev = !!(el.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING);
      const sb = bb(sub.parentElement);
      r.subBox = sb;
      r.overlap = !(sb.x + sb.w < r.elev.x || sb.x > r.elev.x + r.elev.w || sb.y + sb.h < r.elev.y || sb.y > r.elev.y + r.elev.h);
    }
  }
  // ④ 路名层 vs 补给卡层 vs 角色层
  const road = texts.find((e) => /迎澜路|湖滨大道|宝塔路|镇兴路/.test(e.textContent) && e.closest('g[clip-path]'));
  if (road && root) {
    const chain = [...root.children];
    r.road = { idx: chain.indexOf(road.closest('g')), crab: chain.findIndex((k) => k.querySelector('image')), n: chain.length };
  }
  // ⑤ 公里牌数量（确认没有被过滤干净）
  r.badges = texts.filter((e) => /^\d{1,2}$/.test((e.textContent || '').trim()) && (e.parentElement.parentElement.firstElementChild?.getAttribute('d') || '').includes('V -34')).length;
  r.stats = window.__director.stats;
  return r;
}, t);

const rows = [];
for (const t of [11, 14, 18, 20, 22, 26, 28, 32, 33, 40, 44, 48, 52, 56, 57, 61, 66, 70]) {
  try { rows.push(await probe(t)); } catch (e) { rows.push({ t, err: String(e.message).slice(0, 120) }); }
}
const errs = rows.filter((r) => r.err);
if (errs.length) console.log('ERR', JSON.stringify(errs[0]));

const cards = rows.filter((r) => r.card);
console.log('=== ① 地标卡（560×286，顶边固定 186，右边 1864）===');
console.log(cards.slice(0, 4).map((r) => `t=${r.t} ${r.card.w}×${r.card.h} top=${r.card.top} right=${r.card.right} op=${r.card.op}`).join('\n'));

const pins = rows.filter((r) => r.pin);
console.log('\n=== ② 贴纸引线/黄点：应在角色之前 ===');
console.log(pins.map((r) => `t=${r.t} pin=${r.pin.idx} crab=${r.pin.crab} op=${r.pin.op}`).join('  '));

const elev = rows.filter((r) => r.elev);
console.log('\n=== ③ 海拔窗（目标 x=12 y=750 580×240；灰字在左下角）===');
console.log(elev.slice(0, 3).map((r) => `t=${r.t} x=${r.elev.x} y=${r.elev.y} ${r.elev.w}x${r.elev.h} 灰字(${r.gray && r.gray.x},${r.gray && r.gray.y})`).join('\n'));
const ov = rows.filter((r) => r.subBox && r.overlap);
console.log('与字幕重叠帧:', ov.length ? ov.map((r) => r.t).join(',') : '无');
console.log('字幕在海拔窗之后绘制:', rows.filter((r) => r.subAfterElev !== undefined).every((r) => r.subAfterElev));

const rd = rows.filter((r) => r.road);
console.log('\n=== ④ 路名层（应 > 卡片层、< 角色层）===');
console.log(rd.map((r) => `t=${r.t} road=${r.road.idx} crab=${r.road.crab}`).join('  '));

console.log('\n=== ⑤ 公里牌数量 / 深度探针 ===');
console.log(rows.map((r) => `${r.t}:badges=${r.badges} deep=${r.stats && r.stats.deep} hid=${r.stats && r.stats.hidden}`).join(' '));

const ms = rows.map((r) => r.ms).filter(Boolean);
console.log('\n=== 帧耗时（含深度探针）===');
console.log(`min ${Math.min(...ms).toFixed(1)} / avg ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)} / max ${Math.max(...ms).toFixed(1)} ms`);
await b.close();
