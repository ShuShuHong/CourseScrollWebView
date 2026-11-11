// 校「同期字幕位移」与「L31b 单独口径」
//   客户 2026-11-09：所有同期字幕在原来 +30 帧的基础上再提前 25 帧、再提前 5 帧 ⇒ 0 帧；
//   后补那句「撞墙高发区」也回到**与语音同刻**（+0.5 s 之后又提前 15 帧）。
//   node tools/check_subshift.mjs
import { launch, openPage } from './shot.mjs';
import { SUBTITLES, FPS } from '../src/config/story.js';
import { INSERTS, SUB_SHIFT_FRAMES } from '../src/config/inserts.js';

const ok = [], bad = [];
const chk = (n, c, d) => (c ? ok : bad).push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' · ' + d : ''}`);

// ① 数据层：每条字幕的位移必须等于它自己的 shiftFrames（普通条 = 全局值）
const bad1 = SUBTITLES.filter((s) => {
  const want = (s.shiftFrames ?? SUB_SHIFT_FRAMES) / FPS;
  return Math.abs((s.t - s.tVoice) - want) > 1e-3;
});
chk(`全部按各自 shiftFrames 上屏（普通 +${SUB_SHIFT_FRAMES} 帧）`, bad1.length === 0,
  bad1.length ? bad1.map((s) => `${s.id} ${((s.t - s.tVoice) * FPS).toFixed(0)}帧`).join(',') : '全部符合');

// ② 条数与顺序
chk(`字幕 ${SUBTITLES.length} 条（42 SRT + ${SUBTITLES.length - 42} 后补）`, SUBTITLES.length === INSERTS.length + 42, String(SUBTITLES.length));
const ins = SUBTITLES.find((s) => s.id === 'L31b');
chk('后补句在表里', !!ins, ins ? `L31b @${ins.t}` : '缺');

// ③ 后补句：字幕在声音之后 15 帧，且排在「约29.1折返」之后
chk('后补句字幕 = 声音（+0.5 s 之后再提前 15 帧）', Math.abs(ins.t - ins.tVoice) < 1e-3,
  `字幕 ${ins.t} / 声音 ${ins.tVoice} / ${((ins.t - ins.tVoice) * FPS).toFixed(0)} 帧`);
chk('后补句排在「约29.1折返」之后', ins.t > SUBTITLES.find((s) => s.id === 'L31').t, `${ins.t}`);

// ④ 浏览器：字幕真的在那一帧才出现（不是数据改了、渲染没跟上）
const b = await launch();
const p = await openPage(b, 'dist/stage-B-导航地图.html', 1920, 1080, 1);
await p.waitForFunction('window.__ready !== undefined');
await p.evaluate(() => window.__ready);

const seen = async (f, needle) => p.evaluate(async ([n, s2]) => {
  await window.__seekFrame(n);
  const t = window.__director.state.t;
  const txt = [...document.querySelectorAll('svg text')].map((e) => e.textContent).join('|');
  return { t: +t.toFixed(3), has: txt.includes(s2), panel: (document.getElementById('p-evsub')?.textContent || '').trim() };
}, [f, needle]);

const fOn = Math.round(ins.t * FPS);
const a1 = await seen(fOn - 2, '撞墙高发区'), a2 = await seen(fOn + 1, '撞墙高发区');
chk(`F${fOn - 2} 还没上屏`, !a1.has, a1.panel);
chk(`F${fOn + 1} 已经上屏`, a2.has, a2.panel);

// ⑤ 随机抽 6 条：上屏帧 == round(t×30)
//   注意：HUD 在 t > 1.6 才开（loading 幕布盖着），第 1 条字幕只能跟着开屏一起出，不参与抽样
let worst = 0;
for (const s of [SUBTITLES[1], SUBTITLES[5], SUBTITLES[14], SUBTITLES[20], SUBTITLES[30], SUBTITLES[41]]) {
  const f = Math.round(s.t * FPS);
  const r = await seen(f + 1, s.text);
  if (!r.has) bad.push(`FAIL  F${f + 1} 应上屏「${s.text}」但没找到`);
  worst = Math.max(worst, Math.abs(r.t - s.t));
}
chk(`抽样 6 条（第 1 条除外）：字幕帧 = round((声音+${SUB_SHIFT_FRAMES} 帧)×30)`, !bad.some((x) => x.includes('应上屏')), `最大时间差 ${worst.toFixed(3)}s`);

await b.close();
for (const l of [...ok, ...bad]) console.log(l);
console.log(`\n${bad.length ? '✗ ' + bad.length + ' 项不通过' : '✓ 全部通过'}（共 ${ok.length + bad.length} 项）`);
process.exit(bad.length ? 1 : 0);
