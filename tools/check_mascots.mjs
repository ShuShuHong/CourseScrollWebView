// 角色表自检 —— 客户 2026-11-01 之后的模板口径：角色不再写死在引擎里，
//   全部由 races/<id>/race.js 的 RACE.mascots（spec + actors + showcase）+ mascots/ 素材决定。
//   换一场赛事最容易错的就是「表里声明了、素材里没有」⇒ 这里逐条对。
//   node tools/check_mascots.mjs [style=navi]
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_RACE } from '../src/config/active-race.js';
import { mascotSpec, mascotActors, mascotShowcase, mascotId, crabId } from '../src/art/sprites.js';

/* 身份层从当前激活的赛事包读 —— 换赛事后自检自动跟着换 */
const { RACE } = await import(`../races/${ACTIVE_RACE}/race.js`);

const ROOT = path.resolve(import.meta.dirname, '..');
const STYLE = process.argv[2] || 'navi';
const ok = [], bad = [];
const chk = (n, c, d) => (c ? ok : bad).push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' · ' + d : ''}`);

/* 素材包（pack_assets 产物）：只读 ids，不依赖浏览器 */
const packed = fs.readFileSync(path.join(ROOT, 'dist', `assets_${STYLE}.js`), 'utf8');
const ASSETS = JSON.parse(packed.replace(/^window\.__ASSETS=/, '').replace(/;$/, ''));
globalThis.__ASSETS = ASSETS;
const ids = Object.keys(ASSETS.crabs || {});
const has = (id) => !!ASSETS.crabs?.[id];

console.log(`=== 角色表（${STYLE}）===`);
const S = mascotSpec();
const ACTORS = mascotActors();
console.log(`  spec   stages=${S.stages} moods=${S.moods.join('/')} back=${S.back} 模板=${S.idTemplate}`);
console.log(`  actors ${ACTORS.map((a) => `${a.id}(${a.label ?? a.name})`).join(' ')}`);

/* ① 规格本身合法 */
chk('spec.stages ≥ 1', S.stages >= 1, String(S.stages));
chk('spec.moods 非空', S.moods.length >= 1, S.moods.join('/'));
chk('idTemplate 三个占位符齐全',
  ['{id}', '{stage}', '{mood}'].every((k) => S.idTemplate.includes(k)), S.idTemplate);

/* ② 角色：id 唯一 + 每个角色至少有「阶段 0 奔跑」这张底图 */
chk('至少一个角色', ACTORS.length >= 1, String(ACTORS.length));
chk('角色 id 唯一', new Set(ACTORS.map((a) => a.id)).size === ACTORS.length, ACTORS.map((a) => a.id).join(','));
for (const a of ACTORS) {
  const base = mascotId(a.id, 0, 'run', S);
  chk(`角色 ${a.id} 有底图 ${base}`, has(base), has(base) ? '' : `素材里没有，只有 ${ids.filter((k) => k.startsWith(a.id)).join('/') || '（无）'}`);
}

/* ③ showcase：设定集要展示的每一张都必须存在，且 caption 齐全 */
const SHOW = mascotShowcase();
const missShow = SHOW.filter((x) => !has(x.id));
chk(`showcase ${SHOW.length} 张全部有素材`, missShow.length === 0,
  missShow.length ? `缺 ${missShow.map((x) => x.id).join('/')}` : `${STYLE} 画风齐全`);
chk('showcase 每张都有 caption', SHOW.every((x) => x.caption && x.caption.length > 0));

/* ④ 回退链：任意 (角色, 阶段, 情绪) 都必须解析到一张真实存在的图
      这是最容易出事的点 —— 少一张 cheer 图就会掉到别的形态 */
let unres = [];
for (const a of ACTORS) {
  for (let st = 0; st < S.stages; st++) {
    for (const mood of S.moods) {
      const got = crabId(a.id, st, mood);
      if (!got || !has(got)) unres.push(`${a.id}/${st}/${mood}`);
    }
    if (S.back) {
      const gb = crabId(a.id, st, 'run', true);
      if (!gb || !has(gb)) unres.push(`${a.id}/${st}/back`);
    }
  }
}
chk('所有（角色 × 阶段 × 情绪）都能选中一张存在的图', unres.length === 0,
  unres.length ? `解析失败 ${unres.length} 组：${unres.slice(0, 6).join(' ')}` : `${ACTORS.length} 角色 × ${S.stages} 阶 × ${S.moods.length} 情绪`);

/* ⑤ 阶段钳制：越界的 stage 必须夹到 [0, stages-1]，不许拿到 undefined */
const clampLo = crabId(ACTORS[0].id, -5, 'run');
const clampHi = crabId(ACTORS[0].id, 99, 'run');
chk('stage 越界会被钳制', !!clampLo && !!clampHi && has(clampLo) && has(clampHi), `${clampLo} / ${clampHi}`);

/* ⑥ 素材目录结构（新赛事拷贝时最容易漏 seq/） */
const mascots = path.join(ROOT, 'races', RACE.id, 'mascots');
chk('mascots/cut.json 存在', fs.existsSync(path.join(mascots, 'cut.json')), `races/${RACE.id}/mascots/cut.json`);
chk(`${STYLE}/cut 目录存在`, fs.existsSync(path.join(mascots, STYLE, 'cut')));
const nSeq = ids.filter((k) => ASSETS.crabs[k].seq?.length).length;
console.log(`  运动序列：${nSeq}/${ids.length} 个形象有逐帧序列`);

console.log('');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
