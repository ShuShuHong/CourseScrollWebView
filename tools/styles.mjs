// 三套画风的构建助手：stage / 设定集 的文件名、素材包注入、样式名
// 用法（CLI）：node tools/styles.mjs stage        → 打包三套 stage
import fs from 'node:fs';
import path from 'node:path';
import { buildPage } from './build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

export const STYLES = ['cartoon', 'navi', 'papercut'];
export const LABEL = { cartoon: 'A · 卡通', navi: 'B · 导航地图', papercut: 'C · 剪纸' };
export const SHORT = { cartoon: '卡通', navi: '导航地图', papercut: '剪纸' };
export const STAGE_FILE = { cartoon: 'stage', navi: 'stage-B-导航地图', papercut: 'stage-C-剪纸' };
export const BIBLE_FILE = { cartoon: '设定集-A-卡通', navi: '设定集-B-导航地图', papercut: '设定集-C-剪纸' };
export const SEQ_FILE = { cartoon: '动作序列-A-卡通', navi: '动作序列-B-导航地图', papercut: '动作序列-C-剪纸' };

export function assetsJs(style, bible = false) {
  const p = path.join(ROOT, 'dist', `assets_${style}${bible ? '_bible' : ''}.js`);
  if (!fs.existsSync(p)) throw new Error(`缺少素材包 ${p}（先跑 tools/pack_assets.py）`);
  return fs.readFileSync(p, 'utf8');
}

/**
 * 两条音轨（内嵌 mp3，base64）：口播 vo.mp3 + 音效床 sfx.mp3。
 * BGM 不内嵌（客户 2026-11-04 撤销）：dist/bgm.mp3 仍可单独试听，但不进页面、也不进成片。
 */
export function audioBoot() {
  const pv = path.join(ROOT, 'dist', 'vo.mp3');
  const ps = path.join(ROOT, 'dist', 'sfx.mp3');
  // 2026-11-08：踩过一次 —— 改了 story.js（卡/事件/折返时刻）只跑了 preview，
  //   dist/sfx.mp3 还是旧的，页面里音效和画面对不上却看不出来。这里按 mtime 检查并报警。
  const newer = ['src/config/story.js', 'src/config/voice.js', 'src/config/sfx.js', 'src/config/vo1031.js']
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f) && (!fs.existsSync(ps) || fs.statSync(f).mtimeMs > fs.statSync(ps).mtimeMs));
  if (newer.length) {
    console.warn(`  ⚠ dist/sfx.mp3 比 ${newer.map((f) => path.relative(ROOT, f)).join(' / ')} 旧 —— 先跑 npm run sfx 再打包`);
  }
  let out = '';
  if (!fs.existsSync(pv)) out += '<!-- 没有 dist/vo.mp3 -->';
  else out += `<script>window.__AUDIO='data:audio/mpeg;base64,${fs.readFileSync(pv).toString('base64')}';</script>`;
  if (!fs.existsSync(ps)) out += '<!-- 没有 dist/sfx.mp3：先跑 npm run sfx -->';
  else out += `<script>window.__SFX='data:audio/mpeg;base64,${fs.readFileSync(ps).toString('base64')}';</script>`;
  return out;
}

/** 打包一套 stage：素材内嵌 + 画风写死（页面仍可用 ?style= 覆盖，但不要和素材混用） */
export async function buildStage(style) {
  const boot = `<script>${assetsJs(style)};window.__STYLE=${JSON.stringify(style)};</script>`;
  return buildPage('stage', { minify: true, outName: STAGE_FILE[style], slots: { ASSETS: boot, AUDIO: audioBoot() } });
}

/** 打包一套“动作序列”预览页（与 stage 共用同一个素材包） */
export async function buildSeq(style) {
  const boot = `<script>${assetsJs(style)};window.__STYLE=${JSON.stringify(style)};</script>`;
  return buildPage('seq', { minify: true, outName: SEQ_FILE[style], slots: { ASSETS: boot } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const what = process.argv[2] || 'stage';
  for (const s of STYLES) {
    if (what === 'seq') await buildSeq(s);
    else await buildStage(s);
  }
}
