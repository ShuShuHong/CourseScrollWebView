// 塔顶几何自检：立腿顶、锚台、上横梁是否咬合；塔是否立在桥面之外（跨在水上）
import { launch, openPage } from './shot.mjs';
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 900, 600, 1);
await p.evaluate(() => window.__seek(20.4));
await new Promise((r) => setTimeout(r, 120));
console.log(await p.evaluate(() => {
  const T = window.__director.world.tower;
  const H = T.H;
  const leg = T.legs[0];
  const legTop = leg.position.y + leg.scale.y / 2;
  const capTop = T.cap.position.y + (T.cap.geometry.parameters.height / 2) * T.cap.scale.y;
  const capBot = T.cap.position.y - (T.cap.geometry.parameters.height / 2) * T.cap.scale.y;
  const beam = T.beams[0].mesh, bh = beam.geometry.parameters.height / 2;
  return JSON.stringify({
    H: +H.toFixed(1),
    legX: +(T.legX || T.legs[0].position.x).toFixed(1),
    legTop: +legTop.toFixed(2), capBot: +capBot.toFixed(2), capTop: +capTop.toFixed(2),
    beamTop: +(beam.position.y + bh).toFixed(2), beamBot: +(beam.position.y - bh).toFixed(2),
    legPoke_above_capTop: +(legTop - capTop).toFixed(2),
    cap_beam_overlap: +(beam.position.y + bh - capBot).toFixed(2),
    cables: T.per * 4,
  });
}));
await b.close();
