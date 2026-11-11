import { launch, openPage } from './shot.mjs';

const b = await launch();
const p = await openPage(b, 'dist/stage.html', 1920, 1080, 1);

const probe = (t) => p.evaluate((tt) => {
  window.__seek(tt);
  const st = window.__director.state;
  const imgs = [...document.querySelectorAll('image')]
    .filter((i) => (i.getAttribute('href') || '').startsWith('data:image/webp'))
    .map((i) => { const r = i.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((i) => i.w > 60)
    .sort((a, c) => a.x - c.x);
  const txt = [...document.querySelectorAll('text')].find((e) => e.textContent === '海拔剖面');
  const eb = txt ? txt.parentElement.getBoundingClientRect() : null;
  const stickerTxt = [...document.querySelectorAll('text')].find((e) => e.textContent.includes('水杉大道'));
  const sg = stickerTxt ? stickerTxt.closest('g') : null;
  // the sticker group is nested; walk up to the group that contains the card
  let sg2 = stickerTxt;
  for (let k = 0; k < 4 && sg2; k++) sg2 = sg2.parentElement;
  const sb = sg2 ? sg2.getBoundingClientRect() : null;
  const lead = [...document.querySelectorAll('path')].find((q) => q.getAttribute('stroke') === '#fff' && q.getAttribute('stroke-width') === '7');
  const lb = lead ? lead.getBoundingClientRect() : null;
  return {
    t: tt, mk: +st.male.km.toFixed(2), fk: +st.female.km.toFixed(2), split: +st.split.toFixed(2),
    imgs,
    elev: eb ? { x: Math.round(eb.x), y: Math.round(eb.y), w: Math.round(eb.width), h: Math.round(eb.height) } : null,
    sticker: sb ? { x: Math.round(sb.x), y: Math.round(sb.y), w: Math.round(sb.width), h: Math.round(sb.height) } : null,
    lead: lb ? { x: Math.round(lb.x), y: Math.round(lb.y), w: Math.round(lb.width), h: Math.round(lb.height) } : null,
  };
}, t);

for (const t of [20.4, 22.5, 29.4, 40.9, 44.6, 48.9, 56.6, 57.4, 66, 75.5]) {
  await new Promise((r) => setTimeout(r, 90));
  console.log(JSON.stringify(await probe(t)));
}
await b.close();
