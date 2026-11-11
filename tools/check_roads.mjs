// 地名（路名）覆盖自检 —— 客户 2026-11-01：「螃蟹经过的道路上都添加地名标签」
//   node tools/check_roads.mjs
//   ① 数据层：区段首尾相接覆盖 0→42.195，终点/起点无缝隙，每个标签都在自己的窗口内
//   ② 覆盖力：沿全程每 0.02 km 采样，必须**恰好有一个**标签窗口命中（不空、不重）
//   ③ 浏览器层：全片逐帧（每 3 帧）取样，course 场景下画面上必须至少有 1 个路名胶囊；
//      并且把出现过的路名收集起来，和配置里的名字集合比对（有没有漏画）
//   ④ 半马：母蟹在前 21.0975 km 也必须始终有标签
import { launch, openPage } from './shot.mjs';
import { readFileSync } from 'node:fs';
import { roadCells, roadLabels, roadCoverage } from '../src/config/roads.js';
import { DURATION, STICKERS, tAtKm } from '../src/config/story.js';

const ok = [], bad = [];
const chk = (n, c, d) => (c ? ok : bad).push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' · ' + d : ''}`);

/* ① 结构 */
const { cells, bad: b1 } = roadCoverage();
chk(`区段连续覆盖 0→42.195（${cells.length} 段）`, b1.length === 0, b1.join('；') || '无缝');
const labels = roadLabels();
// 客户 2026-11-01：东岸堤顶 23–35 km 明确**不贴路名**（noLabel 段）⇒ 空白是设计要求，不是缺陷
const blanks = cells.filter((c) => c.noLabel).map((c) => [c.km0, c.km1]);
const inBlank = (km) => blanks.some(([a, z]) => km >= a - 1e-9 && km <= z + 1e-9);
const blankDraw = () => blanks.length;
const BLANK_TXT = blanks.length ? `空白段 ${blanks.map(([a, z]) => `${a.toFixed(2)}–${z.toFixed(2)}`).join('、')}（客户指定不贴）` : '无空白段';
const drawCells = cells.filter((c) => !c.noLabel);
chk(`标签数 ${labels.length}（${drawCells.length} 个出标区段，长段允许同名重复）`,
  labels.length >= drawCells.length, `${cells.length} 段里 ${blankDraw()} 段是客户指定不贴`);
chk('每个标签都在自己的窗口内', labels.every((l) => l.km > l.t0 - 1e-9 && l.km < l.t1 + 1e-9),
  labels.filter((l) => !(l.km > l.t0 - 1e-9 && l.km < l.t1 + 1e-9)).map((l) => `${l.name}@${l.km}`).join(',') || '全在');

/* ② 每 0.02 km 必须恰好命中一个标签 */
let miss = 0, dup = 0, worst = null;
for (let km = 0; km <= 42.195 + 1e-9; km += 0.02) {
  const hit = labels.filter((l) => km >= l.t0 - 1e-9 && km <= l.t1 + 1e-9);
  if (hit.length === 0 && !inBlank(km)) { miss++; worst = worst || `km ${km.toFixed(2)} 无标签`; }
  if (hit.length > 1) {
    // 正好落在两段交界（差 1e-9 也算命中两次）是允许的
    const boundary = hit.every((h) => Math.abs(km - h.t0) < 1e-6 || Math.abs(km - h.t1) < 1e-6);
    if (!boundary) { dup++; worst = worst || `km ${km.toFixed(2)} 命中 ${hit.map((h) => h.name).join('/')}`; }
  }
}
chk('全程每 0.02 km 都有且仅有一个标签窗口（空白段除外）', miss === 0 && dup === 0,
  worst || `采样 ${Math.round(42.195 / 0.02) + 1} 点 · ${BLANK_TXT}`);

/* ③ 浏览器逐帧 */
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1280, 720, 1);
await p.waitForFunction('window.__ready !== undefined');
await p.evaluate(() => window.__ready);

const N = Math.round(DURATION * 30);
// 空白段的帧号区间：用主里程锚点把 km 换成帧（螃蟹在空白段里跑的那几帧没有路名是设计要求）
const blankFrames = blanks.map(([a, z]) => [Math.floor(tAtKm(a) * 30) - 6, Math.ceil(tAtKm(z) * 30) + 6]);
const inBlankFrame = (f) => blankFrames.some(([a, z]) => f >= a && f <= z);
const scan = await p.evaluate(async (n, names, bl) => {
  const re = new RegExp(`^(${names.join('|')})$`);
  const inBlankFrame = (f) => bl.some(([a, z]) => f >= a && f <= z);
  const seen = {};
  const empty = [];
  for (let f = 0; f < n; f += 3) {
    await window.__seekFrame(f);
    const st = window.__director.state;
    if (st.scene !== 'course') continue;
    if (st.t < 2.6) continue;                       // 片头加载幕布还没撤
    const pills = [...document.querySelectorAll('svg text')].filter((e) => re.test(e.textContent.trim()));
    if (!pills.length && !inBlankFrame(f)) empty.push(f);
    for (const e of pills) seen[e.textContent.trim()] = (seen[e.textContent.trim()] || 0) + 1;
  }
  return { seen, empty, frames: Math.ceil(n / 3) };
}, N, [...new Set(labels.map((l) => l.name))], blankFrames);

const wantNames = [...new Set(labels.map((l) => l.name))];
const missed = wantNames.filter((nm) => !scan.seen[nm]);
chk('course 场景下每取样帧都至少有 1 个路名标签（空白段除外）', scan.empty.length === 0,
  scan.empty.length ? `${scan.empty.length} 帧无标签，首个 F${scan.empty[0]}` : `${scan.frames} 帧全有 · ${BLANK_TXT}`);
chk(`配置里的 ${wantNames.length} 个路名都在画面上出现过`, missed.length === 0,
  missed.length ? `没出现：${missed.join('、')}` : Object.entries(scan.seen).map(([k, v]) => `${k}×${v}`).join(' '));

/* ④ 半马（母蟹）前 21.0975 km */
const halfScan = await p.evaluate(async (n, names) => {
  const re = new RegExp(`^(${names.join('|')})$`);
  const empty = [];
  for (let f = 0; f < n; f += 3) {
    await window.__seekFrame(f);
    const st = window.__director.state;
    if (st.scene !== 'course') continue;
    if (st.t < 2.6) continue;
    if (st.female.km > 20.7) break;                 // 分流进副本之后不看
    const pills = [...document.querySelectorAll('svg text')].filter((e) => re.test(e.textContent.trim()));
    if (!pills.length) empty.push([f, +st.female.km.toFixed(2)]);
  }
  return empty;
}, Math.round(DURATION * 30), [...new Set(labels.map((l) => l.name))]);
chk('母蟹（半马）在图上跑动时也一直有路名标签', halfScan.length === 0,
  halfScan.length ? `${halfScan.length} 帧无标签，首个 F${halfScan[0][0]} @${halfScan[0][1]}km` : '全程有');

/* ⑤ 客户 2026-11-01 傍晚：「不用移动闪避螃蟹，就贴在路上，可以被螃蟹遮挡」。
       所以这一条从「不许被盖住」反过来：① 源码守卫 —— 画标签处不许再出现按螃蟹位置滑动的逻辑；
       ② 遮挡只做统计（打印出来供人工确认，不判失败）。 */
const overlap = await p.evaluate(async (n, names) => {
  const re = new RegExp(`^(${names.join('|')})$`);
  const bads = [];
  let partial = 0;
  for (let f = 0; f < n; f += 15) {
    await window.__seekFrame(f);
    const st = window.__director.state;
    if (st.scene !== 'course' || st.t < 2.6) continue;
    const pills = [...document.querySelectorAll('svg text')].filter((e) => re.test(e.textContent.trim()));
    const crabs = [...document.querySelectorAll('[data-crab]')].map((e) => e.getBoundingClientRect());
    for (const pl of pills) {
      const r = pl.getBoundingClientRect();
      for (const c of crabs) {
        const ox = Math.min(r.right, c.right) - Math.max(r.left, c.left);
        const oy = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
        // 遮挡是**允许**的（客户 2026-11-01 傍晚），这里只统计，不判失败。
        if (ox > r.width * 0.6 && oy > r.height * 0.6) partial++;
      }
    }
  }
  return { bads, partial };
}, N, [...new Set(labels.map((l) => l.name))]);
const srcAnn = readFileSync(new URL('../src/engine/annotations.js', import.meta.url), 'utf8');
const banned = ['hitsCrab', 'crabCX', 'crabCY', 'refFull - d', 'refFull + d', 'refFull - 0.45'].filter((k) => srcAnn.includes(k));
chk('地名标签不做螃蟹避让（只贴路面）', banned.length === 0,
  banned.length ? `drawRoadNames 里还有避让逻辑：${banned.join(' / ')}` : `源码无避让 · 全片被螃蟹压住 ${overlap.partial} 帧（按口径允许，只作记录）`);

/* ⑥ 客户 2026-11-01：地名标签一律画在公里牌**下面**（迎湖路那块原来把 12.5 的牌子盖掉了）
       判据用**命中测试**：两者重叠的地方，点下去必须先是公里牌，不能是路名胶囊。 */
const lay = await p.evaluate(async (n, names) => {
  const re = new RegExp(`^(${names.join('|')})$`);
  const isPill = (t) => t && t.parentElement && t.parentElement.querySelector('rect');
  const bads = [];
  let pairs = 0;
  for (let f = 0; f < n; f += 7) {
    await window.__seekFrame(f);
    const st = window.__director.state;
    if (st.scene !== 'course') continue;
    const pills = [...document.querySelectorAll('svg text')].filter((e) => re.test(e.textContent.trim()) && isPill(e));
    const badges = [...document.querySelectorAll('svg text')].filter((e) => /^\d{1,2}(\.\d)?$/.test(e.textContent.trim())
      && (e.parentElement.parentElement.firstElementChild?.getAttribute('d') || '').includes('V -34'));
    for (const pl of pills) {
      const a = pl.parentElement.getBoundingClientRect();
      for (const bd of badges) {
        const c = bd.parentElement.getBoundingClientRect();
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox <= 2 || oy <= 2) continue;
        pairs++;
        const px = Math.round((Math.max(a.left, c.left) + Math.min(a.right, c.right)) / 2);
        const py = Math.round((Math.max(a.top, c.top) + Math.min(a.bottom, c.bottom)) / 2);
        const hit = document.elementsFromPoint(px, py);
        const first = hit.find((e) => e.tagName === 'text');
        if (first === pl) bads.push({ f, a: pl.textContent.trim(), b: bd.textContent.trim() });
      }
    }
  }
  return { bads, pairs };
}, N, [...new Set(labels.map((l) => l.name))]);
chk('地名标签层在公里牌层之下', lay.bads.length === 0,
  lay.bads.length ? `${lay.bads.length}/${lay.pairs} 处重叠时路名在上面，首个 F${lay.bads[0].f}「${lay.bads[0].a}」压「${lay.bads[0].b}」`
    : `${lay.pairs} 处重叠全部是牌子在上`);

/* ⑦ 默认地名缩放 = 1.4（客户 2026-11-01） */
const defScale = await p.evaluate(() => window.__dbg.nameScale().value);
chk('地名默认缩放 = 1.4', Math.abs(defScale - 1.4) < 1e-9, `实测 ${defScale}`);

/* ⑧ 迎湖路的标签往南让开了（不与 12.5/13 公里牌重叠） */
const yh = await p.evaluate(async (n) => {
  const hit = [];
  for (let f = 1280; f < 1460; f += 5) {
    await window.__seekFrame(f);
    const st = window.__director.state;
    if (st.scene !== 'course') continue;
    const pills = [...document.querySelectorAll('svg text')].filter((e) => e.textContent.trim() === '迎湖路')
      .map((e) => e.parentElement.getBoundingClientRect());
    const badges = [...document.querySelectorAll('svg text')]
      .filter((e) => /^\d{1,2}(\.\d)?$/.test(e.textContent.trim())
        && (e.parentElement.parentElement.firstElementChild?.getAttribute('d') || '').includes('V -34'))
      .map((e) => e.parentElement.getBoundingClientRect());
    let worst = 0;
    for (const a of pills) for (const c of badges) {
      const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      // 允许 ≤12px 的“贴边”（透视下牌子与胶囊擦一下边，字都还看得清）
      if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
    }
    if (worst > 0) hit.push({ f, d: Math.round(worst) });
  }
  return hit;
}, 0);
chk('迎湖路标签不压公里牌（贴边 ≤12px 允许）', yh.filter((x) => x.d > 12).length === 0,
  yh.length ? `${yh.length} 帧有贴边，最深 ${Math.max(...yh.map((x) => x.d))}px（F${yh[0].f}）` : '180 帧内完全分开');

await b.close();
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
