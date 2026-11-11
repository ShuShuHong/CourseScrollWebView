// 音效自检：结构（时间轴对齐）+ 声学（可听度/压音/峰值）+ 播放器（两轨同步）
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage } from './shot.mjs';
import { CUES, AMB, STEPS, MIX } from '../src/config/sfx.js';
import { EVENTS, DURATION, T_GO, T_FEMALE_FINISH, T_MALE_FINISH, tAtKm, STICKERS, lineT } from '../src/config/story.js';
import { AUDIO, VO } from '../src/config/voice.js';
import { CROSS } from '../src/config/venue.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ok = [], bad = [];
const chk = (name, pass, info = '') => (pass ? ok : bad).push(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' · ' + info : ''}`);

const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'sfx', 'report.json'), 'utf-8'));

// ── ① 结构：音效表本身
console.log('=== ① 音效表 ===');
console.log(`  cue ${CUES.length} 条 · 底噪 ${AMB.length} 段 · 步频 ${STEPS.rate} 步/秒 · 片长 ${DURATION}s`);
chk('cue 数量 ≥ 30（通篇，不是点缀）', CUES.length >= 30, String(CUES.length));
const oob = CUES.filter((c) => !(c.t >= 0 && c.t <= DURATION + 1e-6));
chk('所有 cue 都落在片长之内', oob.length === 0, oob.map((c) => c.id).join(','));
const dup = CUES.filter((c, i) => CUES.findIndex((x) => x.id === c.id) !== i);
chk('cue id 唯一', dup.length === 0, dup.map((c) => c.id).join(','));

// 事件类音效必须踩在 story.js 的事件时刻上（不靠手填秒数）
const guns = EVENTS.filter((e) => e.type === 'gun').map((e) => e.t);
const g1 = CUES.find((c) => c.id === 'gunAB'), g2 = CUES.find((c) => c.id === 'gunC');
chk('两枪 = story 的两次发枪', !!g1 && !!g2 && Math.abs(g1.t - guns[0]) < 1e-6 && Math.abs(g2.t - guns[1]) < 1e-6,
  `${g1?.t.toFixed(2)} / ${g2?.t.toFixed(2)} vs ${guns.map((v) => v.toFixed(2)).join(' / ')}`);
const tapeF = CUES.find((c) => c.id === 'tapeF'), tapeM = CUES.find((c) => c.id === 'tapeM');
chk('母蟹撞线 = T_FEMALE_FINISH', !!tapeF && Math.abs(tapeF.t - T_FEMALE_FINISH) < 1e-6, tapeF?.t.toFixed(3));
chk('公蟹撞线 = CROSS.full（口播 36 读完 + 0.5 s）', !!tapeM && Math.abs(tapeM.t - CROSS.full) < 1e-6, tapeM?.t.toFixed(3));
const u1 = CUES.find((c) => c.id === 'uturn1'), u2 = CUES.find((c) => c.id === 'uturn2');
chk('两处折返 = 19.61 / 29.2 km 的实际时刻', !!u1 && !!u2 &&
  Math.abs(u1.t - tAtKm(19.61)) < 1e-6 && Math.abs(u2.t - tAtKm(29.2)) < 1e-6,
  `${u1?.t.toFixed(2)}s / ${u2?.t.toFixed(2)}s`);
const goCue = CUES.find((c) => c.id === 'cheerGo');
chk('起跑欢呼 = T_GO', !!goCue && Math.abs(goCue.t - T_GO) < 1e-6, goCue?.t.toFixed(3));
const cardIds = STICKERS.map((s) => 'card_' + s.id);
const missing = cardIds.filter((id) => !CUES.some((c) => c.id === id));
chk('每张地标卡都有出场音', missing.length === 0, missing.join(',') || `${cardIds.length} 张`);

// 底噪必须覆盖全片（不能有长空档）
const spans = AMB.map((a) => [a.t0, a.t1]).sort((a, b) => a[0] - b[0]);
let maxGap = 0, gapAt = 0;
for (let i = 1; i < spans.length; i++) {
  const g = spans[i][0] - spans[i - 1][1];
  if (g > maxGap) { maxGap = g; gapAt = spans[i - 1][1]; }
}
const lead = spans[0][0], tail = DURATION - spans[spans.length - 1][1];
console.log(`  底噪覆盖 ${spans[0][0].toFixed(1)}–${spans[spans.length - 1][1].toFixed(1)}s · 最大接缝 ${maxGap.toFixed(2)}s @${gapAt.toFixed(1)}s · 头 ${lead.toFixed(1)}s 尾 ${tail.toFixed(1)}s`);
chk('底噪无断档（接缝 ≤ 0.3s）', maxGap <= 0.3, `${maxGap.toFixed(2)}s`);
chk('片头片尾都有底噪托底（≤ 1.2s 空白）', lead <= 1.2 && tail <= 1.2, `头 ${lead.toFixed(1)} 尾 ${tail.toFixed(1)}`);

// ── ② 声学：来自 sfx_render.py 的实测 + 可听度审计
console.log('\n=== ② 声学 ===');
console.log(`  音效床 RMS（说话时 / 空隙）${report.bedRmsSpeechDb} / ${report.bedRmsGapDb} dBFS · 压音 ${report.duckDepthDb} dB`);
chk('谈音深度 8–18 dB（听得见、又不抢话）', report.duckDepthDb >= 8 && report.duckDepthDb <= 18, `${report.duckDepthDb} dB`);
chk('空隙时音效床明显高于说话时', report.bedRmsGapDb - report.bedRmsSpeechDb >= 8, `${(report.bedRmsGapDb - report.bedRmsSpeechDb).toFixed(1)} dB`);
chk('成片峰值不爆（≤ -1.0 dBFS）', report.mixPeakDb <= -1.0, `${report.mixPeakDb} dBFS`);
chk('音效床有自己的余量（≤ -3 dBFS）', report.bedPeakDb <= -3.0, `${report.bedPeakDb} dBFS`);
chk('脚步踩在跑步区间内（T_GO 之后、冲线之前）', STEPS.t0 >= T_GO && STEPS.t1 <= CROSS.full,
  `${STEPS.t0.toFixed(2)}–${STEPS.t1.toFixed(2)}s`);
chk('步数是“人”的密度（2.5–4.2 步/秒）', STEPS.rate >= 2.5 && STEPS.rate <= 4.2, `${STEPS.rate}`);

// ── ③ 播放器：两轨都在、都能同步
console.log('\n=== ③ 播放器 ===');
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1440, 900, 1, '?v=' + Math.random());
const has = await p.evaluate(() => ({
  vo: !!window.__audio, voDur: window.__audio?.duration || null,
  sfx: !!window.__sfx, sfxDur: window.__sfx?.duration || null,
}));
console.log(`  口播 ${has.vo ? has.voDur?.toFixed(3) + 's' : '缺失'} · 音效床 ${has.sfx ? has.sfxDur?.toFixed(3) + 's' : '缺失'}`);
chk('两条音轨都内嵌进页面', has.vo && has.sfx);
chk(`口播时长 = voice.js AUDIO.dur ${AUDIO.dur}s`, Math.abs((has.voDur || 0) - AUDIO.dur) < 0.05, String(has.voDur?.toFixed(3)));
chk(`音效床时长 = 片长 ${DURATION}s`, Math.abs((has.sfxDur || 0) - DURATION) < 0.06, String(has.sfxDur?.toFixed(3)));

// seek 到若干时刻，两轨都必须跟到位
await p.evaluate(() => window.__seek(0));
for (const t of [0, 8.64, 41.13, 65.26, 76.5]) {
  await p.evaluate((tt) => window.__seek(tt), t);
  await new Promise((r) => setTimeout(r, 120));
  const s = await p.evaluate(() => ({
    vo: window.__audio?.currentTime ?? null, sfx: window.__sfx?.currentTime ?? null,
  }));
  const wantVo = Math.max(0, Math.min(AUDIO.dur, t - VO.audioOffset));
  chk(`seek ${t}s：口播 ${s.vo?.toFixed(2)} · 音效 ${s.sfx?.toFixed(2)}`,
    Math.abs((s.sfx ?? -9) - Math.min(t, DURATION)) < 0.25 && Math.abs((s.vo ?? -9) - wantVo) < 0.25);
}
await b.close();

console.log('\n=== 汇总 ===');
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
