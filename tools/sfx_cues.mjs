// 把音效表导出成 JSON，交给 tools/sfx_render.py 合成（JS = 唯一来源，py 只负责算波形）
import fs from 'node:fs';
import path from 'node:path';
import { CUES, AMB, STEPS, MIX, SFX_IDS } from '../src/config/sfx.js';
import { DURATION, AUDIO_OFFSET } from '../src/config/story.js';
import { AUDIO } from '../src/config/voice.js';
import { VO_LINES } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const out = {
  duration: DURATION,
  audioOffset: AUDIO_OFFSET,
  audioFile: AUDIO.file,        // 口播源文件（voice.js 唯一来源，换音轨自动跟着走）
  cues: CUES.map((c) => ({ ...c, t: +c.t.toFixed(4) })),
  amb: AMB.map((a) => ({ ...a, t0: +a.t0.toFixed(3), t1: +a.t1.toFixed(3) })),
  steps: STEPS,
  mix: MIX,
  ids: SFX_IDS,
  // 旁白区间（做侧链压音用）：片子时间 = 音轨时间 + audioOffset
  // 2026-11-08：字幕时间已经是**成片时间**（audioOffset = 0），不再是音轨内相对时刻
  vo: VO_LINES.map((l) => [+l.t.toFixed(3), +l.tOut.toFixed(3)]),
};
const dest = path.join(ROOT, 'out', 'sfx', 'cues.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 1), 'utf-8');
console.log(`音效表 → ${path.relative(ROOT, dest)}：${out.cues.length} 条 cue / ${out.amb.length} 段底噪 / ${out.ids.length} 种音色 / 步频 ${STEPS.rate} 步·秒 / 片长 ${DURATION}s`);
for (const c of out.cues) console.log(`  ${String(c.t.toFixed(2)).padStart(6)}s  ${c.sfx.padEnd(8)} ${c.gain.toFixed(1)}dB  ${c.id}`);
