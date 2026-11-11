// 回放：node tools/seek.mjs <html> <t1,t2,...> <outprefix> [query]
import { launch, openPage } from './shot.mjs';
const [file, times, prefix, query = ''] = process.argv.slice(2);
const b = await launch();
const p = await openPage(b, file, 1920, 1080, 1, query);
for (const s of times.split(',')) {
  const t = +s;
  const st = await p.evaluate((tt) => {
    const d = window.__director;
    const st = d.render(tt);
    window.__seek ? window.__seek(tt) : null;
    return { male: st.male.km, female: st.female.km, split: st.split, hpM: st.male.stage };
  }, t);
  await new Promise((r) => setTimeout(r, 120));
  await p.screenshot({ path: `${prefix}_${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 90 });
  console.log(t.toFixed(2), 'male', st.male.toFixed(2), 'female', st.female.toFixed(2), 'split', st.split.toFixed(2));
}
await b.close();
