// 生成三套设定集：每套各自截关键帧 + 环境图 → 内嵌进 dist/设定集-*.html
//   node tools/capture.mjs            （逐套：打包 stage → 截图 → 打包设定集）
//   node tools/capture.mjs navi       （只做指定画风）
// 截图存 out/stills/<style>/（PNG 原图，便于单独发给项目方）；内嵌版为 1180 宽 JPEG。
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { buildPage } from './build.mjs';
import { STYLES, BIBLE_FILE, LABEL, SHORT, buildStage, assetsJs } from './styles.mjs';
import { KEYFRAMES, ENV_SHOTS } from '../src/config/keyframes.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const stills = (s) => path.join(ROOT, 'out/stills', s);
const only = process.argv.slice(2).filter((a) => STYLES.includes(a));
const list = only.length ? only : STYLES;
const browser = await launch();

function resized(page, png, w, q) {
  return page.evaluate(async ([src, w, q]) => {
    const im = new Image();
    im.src = 'data:image/png;base64,' + src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((im.height / im.width) * w);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }, [png.toString('base64'), w, q]);
}

async function grab(page, file, w = 1180, q = 0.82) {
  const png = await page.screenshot({ type: 'png' });
  if (file) fs.writeFileSync(file, png);
  return resized(page, png, w, q);
}

const summary = [];
for (const style of list) {
  fs.mkdirSync(stills(style), { recursive: true });
  const out = await buildStage(style);
  const page = await openPage(browser, out, 1920, 1080, 1, '?clean=1&dpr=1');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  const images = {};
  console.log(`\n== ${LABEL[style]} ==`);

  for (let i = 0; i < KEYFRAMES.length; i++) {
    const k = KEYFRAMES[i];
    await page.evaluate((t) => window.__seek(t), k.t);
    images['kf_' + i] = await grab(page, path.join(stills(style), `kf_${String(i + 1).padStart(2, '0')}_${k.t.toFixed(1)}s.png`));
    process.stdout.write(`  kf ${i + 1}/${KEYFRAMES.length}\r`);
  }
  for (const e of ENV_SHOTS) {
    await page.evaluate((e) => {
      window.__director.override = { cam: e.cam, crabs: [], noHud: true, prog: e.prog, lift: e.lift, bridge: e.bridge };
      return window.__seek(40);
    }, e);
    images['env_' + e.id] = await grab(page, path.join(stills(style), `env_${e.id}.png`), 1280, 0.84);
  }
  await page.evaluate(() => { window.__director.override = null; });
  await page.close();

  const hero = images.kf_7 || '';
  await buildPage('bible', {
    minify: true, outName: BIBLE_FILE[style],
    define: {
      __STYLE__: JSON.stringify(style),
      __STYLE_LABEL__: JSON.stringify(LABEL[style]),
      __STYLE_SHORT__: JSON.stringify(SHORT[style]),
    },
    slots: {
      IMAGES: `<script>window.__IMAGES=${JSON.stringify(images)}</script>`,
      ASSETS: `<script>${assetsJs(style, true)};window.__STYLE=${JSON.stringify(style)};</script>`,
      HERO: hero ? `<img src="${hero}" alt="关键帧">` : '',
    },
  });
  summary.push({ style, images: Object.keys(images).length, errors });
}
await browser.close();
console.log('\nsummary', JSON.stringify(summary));
if (summary.some((s) => s.errors.length)) process.exitCode = 1;
