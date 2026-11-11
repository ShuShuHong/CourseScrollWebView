// 本模板的口播 = edge-tts 现场合成，不再引用客户预录音轨
//   node tools/tts_edge.mjs           已生成则跳过
//   node tools/tts_edge.mjs --force   文案/语速改过后强制重合成
//
// 做法：从赛事包配置里取出「每句文本 + 它在成片里的起点 t + 时长 dur」，
//       交给 tools/tts_edge.py 逐句合成、按时长贴合、铺成一条整轨。
//       时间轴完全沿用现有排程 ⇒ 画面 / 字幕 / 音效不需要跟着改。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AUDIO, SEGS, CUE_LINES } from '../src/config/vo1031.js';
import { INSERTS } from '../src/config/inserts.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'audio/tts/timeline.wav');
const force = process.argv.includes('--force');

if (fs.existsSync(OUT) && fs.statSync(OUT).size > 1024 && !force) {
  console.log(`  已存在 audio/tts/timeline.wav（${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB）—— 需要重合成请加 --force`);
  process.exit(0);
}

const segOf = (n) => SEGS.find((s) => s.n === n);
const entries = [];

// 42 条主字幕：起点 = 段起点 + 段内偏移
for (const l of CUE_LINES) {
  const s = segOf(l.seg);
  if (!s) throw new Error(`找不到段 ${l.seg}（字幕 ${l.id}）`);
  entries.push({ id: l.id, text: l.vo, t: +(s.t0 + l.dt).toFixed(3), dur: l.d });
}
// 后补插句：与字幕同一起点（段起点 + 文件头静音）
for (const ins of INSERTS) {
  const s = segOf(ins.id);
  if (!s) throw new Error(`找不到插句段 ${ins.id}`);
  const head = ins.head || 0;
  entries.push({ id: ins.id, text: ins.text, t: +(s.t0 + head).toFixed(3), dur: +(ins.dur - head).toFixed(3) });
}

const plan = {
  total: AUDIO.dur,
  sr: 44100,
  voice: process.env.TTS_VOICE || 'zh-CN-YunjianNeural',
  entries,
};
fs.mkdirSync(path.join(ROOT, 'out/plan'), { recursive: true });
const planPath = path.join(ROOT, 'out/plan/tts.json');
fs.writeFileSync(planPath, JSON.stringify(plan, null, 1), 'utf8');
console.log(`  edge-tts · ${plan.voice} · ${entries.length} 句 · 整轨 ${plan.total}s`);

const r = spawnSync('uv', ['run', '--with', 'edge-tts', '--with', 'numpy', '--with', 'scipy',
  'python', 'tools/tts_edge.py', planPath], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
