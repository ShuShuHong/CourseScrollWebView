// 打包：src/pages/<name>.js + <name>.html → dist/<name>.html（单文件，离线可开）
//   node tools/build.mjs stage bible ...
// 模板中的占位：<!--FONTS--> 字体 CSS；<!--APP--> 打包后的脚本；<!--KEYFRAMES--> 关键帧（bible 用）
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
let _brand;
async function raceBrand() {
  if (!_brand) _brand = (await import(pathToFileURL(path.join(ROOT, 'src/config/theme.js')).href)).BRAND;
  return _brand;
}
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

export async function buildPage(name, extra = {}) {
  const entry = path.join(ROOT, 'src/pages', name + '.js');
  const tpl = fs.readFileSync(path.join(ROOT, 'src/pages', name + '.html'), 'utf8');
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'iife', minify: !!extra.minify, write: false,
    loader: { '.json': 'json' }, target: 'chrome110', legalComments: 'none',
    define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16)), ...(extra.define || {}) },
  });
  const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const fontsFile = path.join(ROOT, 'dist/fonts.css');
  const fonts = fs.existsSync(fontsFile) ? fs.readFileSync(fontsFile, 'utf8') : '';
  let html = tpl.replace('<!--FONTS-->', () => `<style>${fonts}</style>`).replace('<!--APP-->', () => `<script>${js}</script>`);
  for (const [k, v] of Object.entries(extra.slots || {})) html = html.replace(`<!--${k}-->`, () => v);
  const brand = await raceBrand();
  html = html.replaceAll('<!--BRAND-->', () => brand); // 模板里的 <!--BRAND--> → 当前赛事全称
  const out = path.join(DIST, (extra.outName || name) + '.html');
  fs.writeFileSync(out, html);
  console.log('built', path.relative(ROOT, out), (fs.statSync(out).size / 1024 / 1024).toFixed(2) + ' MB');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const names = process.argv.slice(2);
  for (const n of names) await buildPage(n, { minify: n !== 'dev' });
}
