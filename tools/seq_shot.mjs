import { launch, openPage } from './shot.mjs';

const times = process.argv.slice(2).map(Number);
const b = await launch();
const p = await openPage(b, 'dist/stage.html', 1920, 1080, 1);
for (const t of times) {
  await p.evaluate((tt) => window.__seek(tt), t);
  await new Promise((r) => setTimeout(r, 80));
  const f = `out/review/insp5/seq_${String(t).replace('.', '_')}.jpg`;
  await p.screenshot({ path: f, type: 'jpeg', quality: 88 });
  console.log('saved', f);
}
await b.close();
