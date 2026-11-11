// 客观核对：补给卡互叠 / 海拔窗内的蟹残留 / 双蟹左右顺序
import { launch, openPage } from './shot.mjs';

const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

const probe = (t) => p.evaluate((tt) => {
  window.__seek(tt);
  const rects = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
  // 补给卡：文字以 “km 补给” 结尾的 <text>
  const cards = [...document.querySelectorAll('text')]
    .filter((e) => /^\d+(\.\d+)?km 补给$/.test((e.textContent || '').trim()))
    .map((e) => { const r = e.getBoundingClientRect(); return { km: e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height }; });
  // 蟹图：webp 位图，取包围盒
  const crabs = [...document.querySelectorAll('image')]
    .filter((i) => (i.getAttribute('href') || '').startsWith('data:image/webp'))
    .map((i) => { const r = i.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })
    .filter((c) => c.w > 40);
  // 海拔窗范围（面板固定 46,612 580x240）
  const inPanel = crabs.filter((c) => c.x + c.w / 2 > 20 && c.x + c.w / 2 < 660 && c.y + c.h > 590 && c.y < 880);
  // 片尾总结卡上的两个头像（190px 那个）
  const big = crabs.filter((c) => c.w > 150 && c.w < 230);
  void rects;
  return { cards, crabs, inPanel: inPanel.length, big };
}, t).then((r) => ({ ...r, t }));

for (const t of [56.6, 57.4, 58.2, 60.0, 66.0, 75.5]) {
  await new Promise((r) => setTimeout(r, 60));
  const r = await probe(t);
  // 卡片两两是否重叠
  const ov = [];
  for (let i = 0; i < r.cards.length; i++) for (let j = i + 1; j < r.cards.length; j++) {
    const a = r.cards[i], c = r.cards[j];
    const dx = Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x));
    const dy = Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
    if (dx > 4 && dy > 4) ov.push(`${a.km}×${c.km}(${Math.round(dx)}×${Math.round(dy)})`);
  }
  const order = r.crabs.sort((a, c) => a.x - c.x).map((c) => `${Math.round(c.x)}`);
  console.log(`t=${t}  补给卡 ${r.cards.length} 张 [${r.cards.map((c) => c.km).join(' ')}]  重叠 ${ov.length ? ov.join(' ') : '无'}  蟹 ${order.join(' | ')}  面板内蟹数 ${r.inPanel}  大头像 ${r.big.length}`);
}
console.log('errors', errs.length, errs.slice(0, 2));
await b.close();
