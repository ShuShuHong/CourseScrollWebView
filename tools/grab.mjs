// 按时间点截帧：node tools/grab.mjs <file> <t1,t2,...> <outPrefix>
import { launch, openPage } from './shot.mjs';
const file = process.argv[2] || 'dist/stage-B-导航地图.html';
const times = (process.argv[3] || '20.4').split(',').map(Number);
const prefix = process.argv[4] || 'out/review/grab';
const b = await launch();
const p = await openPage(b, file, 1920, 1080, 1);
for (const t of times) {
  await p.evaluate((x) => window.__seek(x), t);
  await new Promise((r) => setTimeout(r, 160));
  const out = `${prefix}_${t.toFixed(2)}.jpg`;
  await p.screenshot({ path: out, type: 'jpeg', quality: 88 });
  console.log('saved', out);
}
await b.close();
