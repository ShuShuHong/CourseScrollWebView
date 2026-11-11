// 总览页：三套画风并排对比（定妆图 + 一张关键帧 + 差异说明 + 入口链接）
// 用法：node tools/build_index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './shot.mjs';
import { buildPage } from './build.mjs';
import { STYLES, LABEL, BIBLE_FILE, STAGE_FILE } from './styles.mjs';

import fsx from 'node:fs';
const ROOT_ = path.resolve(import.meta.dirname, '..');
const activeRace = () => {
  try {
    const t = fsx.readFileSync(path.join(ROOT_, 'src/config/active-race.js'), 'utf8');
    return (t.match(/ACTIVE_RACE\s*=\s*'([^']+)'/) || [])[1] || '';
  } catch { return ''; }
};
const ROOT = path.resolve(import.meta.dirname, '..');

const META = {
  cartoon: {
    tag: '粗黑描边 · 平涂赛璐璐 · 暖色桌游地图板',
    bullets: ['角色：粗黑描边 2D 卡通，手游/绘本感', '地图：米色地图板 + 白路网 + 高饱和湖水', '贴纸：白卡片粗描边，与角色同一支笔'],
    fit: '最讨喜、传播力最强；专业感相对弱',
  },
  navi: {
    tag: '扁平矢量 · 高德式路网 · 白色贴纸卡',
    bullets: ['角色：扁平矢量吉祥物，白描边贴纸感', '地图：浅底 + 白路网 + 已跑赛段变灰', '贴纸：白卡 + 柔和落影（客户口径：不要底部定位尖角）'],
    fit: '最像真地图，专业感与科技感最强',
  },
  papercut: {
    tag: '中国民间剪纸 · 多层纸叠贴 · 红青金米白',
    bullets: ['角色：平面剪纸，多层纸叠贴 + 纸影', '地图：米黄纸底 + 红纸包边 + 剪纸树', '图标：深红纸盘 + 剪口波浪边'],
    fit: '最有地方文化味，适合文旅调性',
  },
};

const browser = await launch();
const page = await browser.newPage();

async function toJpeg(file, w, q) {
  if (!fs.existsSync(file)) return '';
  const b64 = fs.readFileSync(file).toString('base64');
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return page.evaluate(async ([src, w, q]) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((im.height / im.width) * w);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }, [`data:${mime};base64,${b64}`, w, q]);
}

const cards = {};
// 总览页的头图：优先“大桥”那张关键帧（画面信息量最大），找不到就用第 1 张关键帧
const { KEYFRAMES } = await import('../src/config/keyframes.js');
const heroIdx = (() => {
  const i = KEYFRAMES.findIndex((k) => k.title.includes('大桥'));
  return i >= 0 ? i : 0;
})();
const heroName = `kf_${String(heroIdx + 1).padStart(2, '0')}_${KEYFRAMES[heroIdx].t.toFixed(1)}s.png`;
for (const s of STYLES) {
  // 角色定妆图在**赛事包**里（races/<id>/mascots/<style>/master.jpg）
  const mascots = path.join(ROOT, 'races', activeRace(), 'mascots');
  const master = await toJpeg(path.join(mascots, s, 'master.jpg'), 980, 0.84);
  const stillsDir = path.join(ROOT, 'out/stills', s);
  const has = fs.existsSync(path.join(stillsDir, heroName));
  const hero = has ? await toJpeg(path.join(stillsDir, heroName), 980, 0.82) : '';
  cards[s] = { label: LABEL[s], ...META[s], master, hero, bible: BIBLE_FILE[s] + '.html', stage: STAGE_FILE[s] + '.html' };
}
await browser.close();

await buildPage('index', {
  minify: true, outName: '设定集',
  slots: { CARDS: `<script>window.__CARDS=${JSON.stringify(cards)}</script>` },
});
console.log('cards', Object.keys(cards).map((k) => `${k}:${cards[k].master ? 'master✓' : 'master✗'}${cards[k].hero ? ' hero✓' : ' hero✗'}`).join(' '));
