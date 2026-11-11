// 把 voice.js 指向的口播音轨转成 dist/vo.mp3（网页内嵌用）
//   node tools/vo_encode.mjs
// 为什么单独一步：舞台页嵌的是 mp3，不是 wav（体积）；换配音后这一步忘记跑，
// 就会出现“字幕/时间轴是新的、声音还是旧的”这种最难查的错。sfx 与 preview 都串了它。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AUDIO, VO } from '../src/config/voice.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = path.join(ROOT, AUDIO.file);
const dst = path.join(ROOT, 'dist', 'vo.mp3');
if (!fs.existsSync(src)) throw new Error(`找不到口播音轨 ${AUDIO.file}`);

const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src,
  '-c:a', 'libmp3lame', '-b:a', '160k', '-ar', '44100', '-ac', '2', dst], { encoding: 'utf8' });
if (r.status !== 0) throw new Error('ffmpeg 失败：' + (r.stderr || r.stdout));

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], { encoding: 'utf8' });
const dur = +probe.stdout.trim();
console.log(`  vo.mp3 ← ${AUDIO.file}  ${dur.toFixed(3)}s（voice.js 记的 ${AUDIO.dur}s，偏移 ${VO.audioOffset}s）`
  + `  ${(fs.statSync(dst).size / 1048576).toFixed(2)} MB`);
if (Math.abs(dur - AUDIO.dur) > 0.1) {
  console.error(`  ✗ 时长不一致（${dur} vs ${AUDIO.dur}）—— 把 voice.js 的 AUDIO.dur 改成实测值`);
  process.exit(1);
}
