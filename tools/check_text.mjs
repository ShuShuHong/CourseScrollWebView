// 文字排版自检：地标卡名称行间距 / 秋日限定字卡是否已去除 / 路名与字幕条是否相撞
import { launch, openPage } from './shot.mjs';
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);

const probe = (t) => p.evaluate(async (tt) => {
  await window.__seek(tt);
  const svg = document.querySelector('#ov');
  const box = (el) => { const b = el.getBBox(); const m = el.getCTM(); return { x: m.e + b.x * m.a, y: m.f + b.y * m.d, w: b.width * m.a, h: b.height * m.d }; };
  const texts = [...svg.querySelectorAll('text')];
  const r = { t: +tt.toFixed(2) };
  const card = svg.querySelector('rect[width="560"]');
  if (card) {
    const g = card.closest('g');
    if (+(g.getAttribute('opacity') || 1) > 0.02) {
      // 卡内局部坐标（未缩放）：图片框 = clipPath rect；名称 = 最后一条 text 的 y（基线）
      const clip = g.querySelector('clipPath rect');
      const name = [...g.querySelectorAll('text')].pop();
      const fs = +name.getAttribute('font-size');
      const iy = +clip.getAttribute('y'), ih = +clip.getAttribute('height');
      const baseline = +name.getAttribute('y');
      const rr = card.getBoundingClientRect ? null : null;
      r.card = {
        imgBottom: iy + ih, capTop: +(baseline - fs * 0.72).toFixed(1), baseline,
        gapImgToText: +(baseline - fs * 0.72 - (iy + ih)).toFixed(1),
        gapTextToBottom: +(143 - (baseline + fs * 0.22)).toFixed(1),
        name: name.textContent,
      };
    }
  }
  r.tag = texts.some((e) => /秋日限定/.test(e.textContent || ''));
  const subs = texts.filter((e) => e.getAttribute('text-anchor') === 'middle' && +e.getAttribute('font-size') >= 34);
  const sub = subs[subs.length - 1];
  if (sub) {
    const rect = sub.parentElement.querySelector('rect');
    if (rect) { const q = box(rect); r.sub = { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.w), h: Math.round(q.h) }; }
  }
  r.roads = texts.filter((e) => +e.getAttribute('font-size') === 22 && e.parentElement.querySelector('rect')).map((e) => {
    const q = box(e.parentElement.querySelector('rect'));
    return { n: e.textContent.trim(), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.w), h: Math.round(q.h) };
  });
  return r;
}, t);

const rows = [];
for (let t = 2; t <= 76; t += 0.5) { try { rows.push(await probe(+t.toFixed(1))); } catch (e) { rows.push({ t, err: String(e).slice(0, 60) }); } }

const cards = rows.filter((r) => r.card);
// 有角标的卡（湿地公园“全马专属”）最后一条 text 是角标，不是名称 ⇒ 单列出来
const named = cards.filter((r) => !/专属|限定/.test(r.card.name));
const tagged = cards.filter((r) => /专属|限定/.test(r.card.name));
const g1 = named.map((r) => r.card.gapImgToText), g2 = named.map((r) => r.card.gapTextToBottom);
console.log('=== 地标卡名称行（局部单位）===');
console.log(`图片底 → 字顶间隙 ${Math.min(...g1)} – ${Math.max(...g1)}（改前 3）`);
console.log(`字底 → 卡下沿 ${Math.min(...g2)} – ${Math.max(...g2)}`);
console.log('样例', JSON.stringify(cards[0] && cards[0].card));
console.log('出现帧数', cards.length, '· 名称行样本', named.length, '· 带角标样本', tagged.length, '其余间隔', JSON.stringify(tagged.map((r) => r.card.gapImgToText)));
console.log('\n=== “秋日限定”字卡 ===');
const tags = rows.filter((r) => r.tag).map((r) => r.t);
console.log(tags.length ? `仍在 ${tags.length} 帧：${tags.slice(0, 5)}` : '已全部去除');
let bad = 0; const seen = [];
for (const r of rows) {
  if (!r.sub) continue;
  for (const rd of r.roads || []) {
    if (!(rd.x + rd.w < r.sub.x || rd.x > r.sub.x + r.sub.w || rd.y + rd.h < r.sub.y || rd.y > r.sub.y + r.sub.h)) { bad++; if (seen.length < 8) seen.push(`${r.t}:${rd.n}@y${rd.y}`); }
  }
}
console.log('\n=== 路名 × 字幕条 ===');
console.log(bad ? `${bad} 帧：${seen.join(' ')}` : '无重叠');
await b.close();
