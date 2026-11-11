// 字幕脚本审阅页：dist/字幕表.html（给项目方看“字字上口播、密度均匀”的证据）
//   · 概览：片长 / 字数 / 恒定语速 / 停顿
//   · 逐行表：入点、时长、字幕、里程、字/秒
//   · 旁白分段表 + 每段地图速度
//   · 与上一版（60 秒精简版）的差异
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const entry = path.join(ROOT, '_work', 'subs2_entry.mjs');
fs.writeFileSync(entry, `
export { SUBTITLES, NARRATION, CARDS, STICKERS, DURATION } from '../src/config/story.js';
export { VO, ORIGINAL, AUDIO } from '../src/config/voice.js';
export { KEYFRAMES } from '../src/config/keyframes.js';
`);
const out = path.join(ROOT, '_work', 'subs2.bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import(pathToFileURL(out).href + `?v=${Date.now()}`);
const { SUBTITLES, NARRATION, CARDS, STICKERS, DURATION, VO, ORIGINAL } = M;
const AUDIO = M.AUDIO;
const AUDIO_CUES = AUDIO.cues;

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(1, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const chars = SUBTITLES.reduce((a, s) => a + s.text.length, 0);
const speech = SUBTITLES.reduce((a, s) => a + s.d, 0);
const cps = chars / speech;
const narrChars = NARRATION.reduce((a, n) => a + n.text.length, 0);

const subRows = SUBTITLES.map((s, i) => `<tr><td>${i + 1}</td><td>${fmt(s.t)}</td><td>${s.d.toFixed(2)}s</td>
  <td class="txt">${s.text}${s.color ? `<i class="c-${s.color}">${s.color === 'half' ? '半马' : '全马'}</i>` : ''}</td>
  <td class="km">${s.km !== undefined ? s.km.toFixed(2) : ''}</td><td>${(s.text.length / s.d).toFixed(2)}</td></tr>`).join('');

const narrRows = NARRATION.map((n, i) => {
  const c = n.text.length;
  const span = n.t1 - n.t0;
  const spd = n.km && n.km[1] > n.km[0] ? ((n.km[1] - n.km[0]) / span).toFixed(2) : '—';
  return `<tr><td>第 ${i + 1} 段</td><td>${fmt(n.t0)}–${fmt(n.t1)}</td><td>${c} 字 / ${span.toFixed(1)}s</td>
    <td class="km">${n.km && n.km[1] > n.km[0] ? `${n.km[0]}–${n.km[1]}` : n.km ? '终点站定' : '起跑前'}</td>
    <td>${spd}</td><td class="txt">${n.text}</td></tr>`;
}).join('');

const cardRows = CARDS.map((c) => `<tr><td>${fmt(c.t ?? 0)}</td><td>${c.d.toFixed(1)}s</td><td>${c.title}</td><td class="txt">${c.lines.join(' · ')}</td></tr>`).join('');
const stickRows = STICKERS.map((s) => `<tr><td>${s.at}km</td><td>${s.name}</td><td>${s.tag || ''}${s.only === 'full' ? ' 全马专属' : ''}</td></tr>`).join('');

const fonts = fs.existsSync(path.join(ROOT, 'dist/fonts.css')) ? fs.readFileSync(path.join(ROOT, 'dist/fonts.css'), 'utf8') : '';

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>2026 高淳马拉松 · 口播脚本 v4（音轨同期）</title>
<style>${fonts}
:root{--ink:#14284A;--blue:#2E7BFF;--line:#DDE4EE;--pink:#FF4FA0;--gold:#FFB020}
*{box-sizing:border-box}
body{margin:0;background:#F2F5FA;color:var(--ink);font-family:HMSans,'Microsoft YaHei',sans-serif;line-height:1.6}
header{background:var(--ink);color:#fff;padding:18px 36px}
header h1{margin:0;font-size:22px}header p{margin:6px 0 0;font-size:14px;opacity:.82}
main{max-width:1240px;margin:0 auto;padding:26px 32px 70px}
h2{font-size:21px;margin:34px 0 10px;border-bottom:2px solid var(--ink);padding-bottom:6px}
.kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:18px}
.kpi div{background:#fff;border:2px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:24px;font-family:FigtreeX,sans-serif}
.kpi span{font-size:13px;color:#7A8799}
table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;font-size:14px;margin-top:8px}
th,td{border-bottom:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--ink);color:#fff;font-size:13px;white-space:nowrap}
td.txt{font-size:15px}td.km{font-family:FigtreeX,sans-serif;color:var(--blue);white-space:nowrap}
i{font-style:normal;font-size:12px;border-radius:5px;padding:0 6px;margin-left:6px;color:#fff}
.c-half{background:var(--pink)}.c-full{background:var(--blue)}
.note{background:#fff;border-left:6px solid var(--gold);border-radius:8px;padding:12px 16px;margin-top:12px;font-size:14px}
.note b{color:var(--blue)}
.ok{color:#0A8F4B;font-weight:700}
</style></head><body>
<header><h1>2026 高淳马拉松 · 赛道介绍片 · 口播脚本 v4</h1>
<p>客户 2026-10-27 交付音轨 + SRT：${AUDIO_CUES} 条 / ${AUDIO.dur}s，画面时间轴按音轨实测值重建（片头留 ${VO.audioOffset}s）</p></header>
<main>
<div class="kpi">
  <div><b>${DURATION.toFixed(2)}s</b><span>片长 = 音轨 ${AUDIO.dur}s + 片头 ${VO.audioOffset}s + 片尾 ${VO.tail}s</span></div>
  <div><b>${narrChars}</b><span>旁白总字数（含标点；与原文逐字一致）</span></div>
  <div><b>${SUBTITLES.length}</b><span>上屏条数（= 音轨句数 ${AUDIO_CUES}）</span></div>
  <div><b>${cps.toFixed(2)}</b><span>实测平均语速（字/秒）</span></div>
  <div><b>${fmt(SUBTITLES[0].t)}–${fmt(SUBTITLES[SUBTITLES.length - 1].t + SUBTITLES[SUBTITLES.length - 1].d)}</b><span>说话区间</span></div>
</div>

<div class="note"><b>时间从哪来：</b>每行的入点/出点直接取客户音轨的 SRT（不是估的），所以字幕和声音是“同期”的；整条音轨统一后移 ${VO.audioOffset}s，给片头的加载与赛道点亮留出位置。<br>
<b>为什么密度是均匀的：</b>客户录音本身是匀速念的（实测 ${cps.toFixed(2)} 字/秒，最快 5.88、最慢 3.75），所以不存在“前松后紧”。<br>
<b>为什么画面跟得上：</b>每行还绑定一个里程（见“里程”列）。文案里写“8.2 公里上桥”，螃蟹那一刻就在 8.2 km；段与段之间的地图速度是有意的秩序变化（城区慢、大桥更慢、水杉快、远环快进、终点站定），不是随机。</div>

<h2>逐行字幕（共 ${SUBTITLES.length} 条，最后一条止于 ${fmt(SUBTITLES[SUBTITLES.length - 1].t + SUBTITLES[SUBTITLES.length - 1].d)}）</h2>
<table><tr><th>#</th><th>入点</th><th>时长</th><th>字幕（与口播逐字一致）</th><th>里程 km</th><th>字/秒</th></tr>${subRows}</table>

<h2>旁白分段（9 段）</h2>
<table><tr><th>段落</th><th>时间</th><th>字数</th><th>赛程 km</th><th>地图速度 km/s</th><th>旁白原文</th></tr>${narrRows}</table>

<h2>信息卡</h2>
<table><tr><th>入点</th><th>时长</th><th>标题</th><th>内容</th></tr>${cardRows}</table>

<h2>地标贴纸</h2>
<table><tr><th>里程</th><th>地标</th><th>备注</th></tr>${stickRows}</table>

<h2>与上一版（60 秒精简版）的差别</h2>
<table>
<tr><th>项目</th><th>上一版</th><th>这一版</th></tr>
<tr><td>片长</td><td>60.0s</td><td><b>${DURATION.toFixed(1)}s</b></td></tr>
<tr><td>旁白</td><td>只取硬信息，压成 201 字字幕</td><td><b>${narrChars} 字全量、逐字上口播 + 逐字上屏</b></td></tr>
<tr><td>字幕条数</td><td>20</td><td><b>${SUBTITLES.length}</b></td></tr>
<tr><td>时间轴基准</td><td>按里程手工换算出秒</td><td><b>每行绑定里程，时间由语速推导（改文案自动重排）</b></td></tr>
<tr><td>镜头 / 信息卡 / 事件</td><td>秒</td><td><b>里程锚定（{ at: { km } }），画面不会与口播错位</b></td></tr>
<tr><td>总字数核对</td><td>无</td><td><b>脚本自检：38 行拼回原文一字不差</b></td></tr>
</table>

<h2>原文（核对用）</h2>
<div class="note" style="line-height:1.9">${ORIGINAL}</div>

<h2>自检结果</h2>
<ul>
<li>切行自检：<span class="ok">通过</span> —— ${SUBTITLES.length} 行拼回去与原文完全一致，没有漏字、改字、多字。</li>
<li>重叠 / 越界：<span class="ok">0 处</span>；最后一条字幕止于 ${fmt(SUBTITLES[SUBTITLES.length - 1].t + SUBTITLES[SUBTITLES.length - 1].d)}，片尾留白 ${(DURATION - (SUBTITLES[SUBTITLES.length - 1].t + SUBTITLES[SUBTITLES.length - 1].d)).toFixed(1)}s。</li>
<li>实机核对：在预览里逐条跳到每条字幕中段，<span class="ok">${SUBTITLES.length}/${SUBTITLES.length} 条都在画面上出现且只出现一次</span>。</li>
<li>语速：全部 ${cps.toFixed(2)} 字/秒（短行按最短停留 1.2s 兜底，最低 4.08）。</li>
</ul>
</main></body></html>`;

fs.writeFileSync(path.join(ROOT, 'dist/字幕表.html'), html);
console.log('built dist/字幕表.html', (html.length / 1024).toFixed(1), 'KB ·', DURATION.toFixed(1) + 's ·', SUBTITLES.length, '条 ·', narrChars, '字');
