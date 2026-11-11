// 验证成片（stage）里画的确实是“序列帧”，而不是旧的静图
//   node tools/qc_seq_live.mjs [file] [t1] [t2]
import { launch, openPage } from './shot.mjs';

const file = process.argv[2] || 'dist/stage-B-导航地图.html';
const ts = process.argv.slice(3).map(Number).filter((x) => !Number.isNaN(x));
const T = ts.length >= 2 ? ts : [30.0, 30.18];

const b = await launch();
const p = await openPage(b, file, 1920, 1080, 1);

const probe = async (t) => {
  await p.evaluate((x) => window.__seek(x), t);
  await new Promise((r) => setTimeout(r, 90));
  return p.evaluate(() => {
    const A = window.__ASSETS || { crabs: {} };
    const seqOf = {};
    for (const [id, c] of Object.entries(A.crabs)) {
      if (c.seq && c.seq.length) seqOf[id] = c.seq;
    }
    const found = [];
    document.querySelectorAll('svg image').forEach((im) => {
      const u = im.getAttribute('href') || '';
      for (const [id, seq] of Object.entries(seqOf)) {
        const i = seq.findIndex((f) => f.src === u);
        if (i >= 0) found.push(`${id}#${i}`);
      }
    });
    return found;
  });
};

const a = await probe(T[0]);
const c = await probe(T[1]);
await b.close();

const setA = new Set(a), setC = new Set(c);
const changed = [...setA].filter((x) => !setC.has(x)).concat([...setC].filter((x) => !setA.has(x)));
console.log(`${file}`);
console.log(`  t=${T[0]}  序列帧命中：${a.join(' ') || '（无）'}`);
console.log(`  t=${T[1]}  序列帧命中：${c.join(' ') || '（无）'}`);
if (!a.length && !c.length) {
  console.log('  ✘ 画面里没有任何序列帧（还在用静图）');
  process.exitCode = 1;
} else if (changed.length) {
  console.log(`  ✔ 帧已随相位切换（变化：${changed.join(' ')}）`);
} else {
  console.log('  · 两帧命中同一序号（相位还没跨过帧边界，可再往后错开一点时间）');
}
