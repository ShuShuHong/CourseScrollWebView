// 4K 成片渲染：无头 Chrome 逐帧 __seekFrame → 截图 → 直通 ffmpeg 编码（不落帧文件）
//   node tools/render.mjs                     # B 导航地图 · 3840×2160 · 全片（2304 帧）
//   node tools/render.mjs cartoon             # 换成 A 卡通 / papercut
//   node tools/render.mjs --from 0 --to 89    # 只渲一段（试片用）
//   node tools/render.mjs --crf 14 --preset slow --audio dist/mix.mp3
// 输出：dist/成片-<画风>-4K.mp4（>--out 可改）；渲染日志与成品都带 ffprobe 复核。
//
//  为什么不用 page.screenshot 的 clip：舞台是 1920×1080 的 CSS 盒子按 scale(2) 放大，
//  画布自身在 dpr=2 下就是 3840×2160，所以视口直接开 3840×2160、dpr 传 2 即可 1:1 出像素。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { launch, openPage } from './shot.mjs';
import { STYLES, STAGE_FILE, LABEL, buildStage } from './styles.mjs';
import { DURATION, FPS } from '../src/config/story.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// ── 参数
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const flag = (name) => argv.includes('--' + name);
const style = argv.find((a) => STYLES.includes(a)) || 'navi';
const W = +opt('w', 3840), H = +opt('h', 2160);
const DPR = +(opt('dpr', W / 1920));            // 4K 时 = 2
const CRF = +opt('crf', 16);
const PRESET = opt('preset', 'slow');
const FMT = opt('fmt', 'png');
const AUDIO = path.resolve(ROOT, opt('audio', 'dist/mix.mp3'));
const TOTAL = Math.round(DURATION * FPS);
const FROM = Math.max(0, Math.min(TOTAL - 1, +opt('from', 0)));
const TO = Math.max(FROM, Math.min(TOTAL - 1, +opt('to', TOTAL - 1)));
const OUT = path.resolve(ROOT, opt('out', path.join('dist', `成片-${LABEL[style].replace(/ · /, '-')}-${H}p.mp4`)));
const NOAUD = flag('an');                        // 只出画面（分段渲染的中间件，音轨最后统一混）
// 地名缩放：不传就用预览器默认值（view.js 的 NAME_SCALE.def，客户 2026-11-01 定为 1.4）
const NAMES = opt('names', '');

if (!flag('nobuild')) await buildStage(style);
if (!NOAUD && !fs.existsSync(AUDIO)) throw new Error(`找不到音轨 ${AUDIO}（先跑 npm run sfx）`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const N = TO - FROM + 1;
console.log(`== ${LABEL[style]} · ${W}×${H} · ${FPS}fps · 第 ${FROM}–${TO} 帧（${N} 帧）==`);
console.log(`   音轨 ${path.relative(ROOT, AUDIO)} · x264 ${PRESET} crf ${CRF} · → ${path.relative(ROOT, OUT)}`);

// ── ffmpeg：image2pipe 读 png/jpeg，音轨直接混进来
const ARGS = [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-vcodec', FMT, '-framerate', String(FPS), '-i', '-',
  // 只渲片段时音轨也要对齐：-ss 必须放在音频输入之前（放输出端会把视频也砍掉）
  ...(!NOAUD && FROM > 0 ? ['-ss', (FROM / FPS).toFixed(6)] : []),
  ...(NOAUD ? [] : ['-i', AUDIO]),
  '-map', '0:v:0', ...(NOAUD ? [] : ['-map', '1:a:0']),
  '-c:v', 'libx264', '-preset', PRESET, '-crf', String(CRF), '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-level', '5.1', '-g', String(FPS * 2),
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  ...(NOAUD ? ['-an'] : ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000']),
  // 只渲片段时音轨也要跟着裁：-ss 用起始帧的时刻
  // 时长自己钉死（-shortest 在 image2pipe 上放不出精确的 0.333s，会多给近 1 秒静音）
  '-t', (N / FPS).toFixed(6),
  '-movflags', '+faststart',
  OUT,
];
const ff = spawn('ffmpeg', ARGS, { stdio: ['pipe', 'inherit', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', (d) => { ffErr += d.toString(); });
const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 退出码 ${c}\n${ffErr}`)))));

// ── 浏览器
const browser = await launch();
const page = await openPage(browser, path.join(ROOT, 'dist', STAGE_FILE[style] + '.html'), W, H, 1, `?clean=1&dpr=${DPR}${NAMES ? '&names=' + NAMES : ''}`);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const probe = await page.evaluate(() => ({
  canvases: [...document.querySelectorAll('canvas')].map((c) => `${c.width}×${c.height}`),
  frames: window.__dbg.frames,
}));
console.log(`   画布 ${probe.canvases.join(' / ')} · 页面帧数 ${probe.frames}`);
if (!probe.canvases.every((s) => s === `${W}×${H}`)) {
  throw new Error(`画布不是 ${W}×${H}：${probe.canvases.join(',')}（检查 --dpr）`);
}

const write = (buf) => new Promise((res) => {
  if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res);
});

const t0 = Date.now();
for (let n = FROM; n <= TO; n++) {
  await page.evaluate((i) => window.__seekFrame(i), n);
  const buf = await page.screenshot({ type: FMT, quality: FMT === 'jpeg' ? 96 : undefined, optimizeForSpeed: FMT === 'png' });
  await write(buf);
  const k = n - FROM + 1;
  if (k % 30 === 0 || n === TO) {
    const el = (Date.now() - t0) / 1000, fps = k / el;
    const left = (N - k) / fps;
    process.stdout.write(`\r   第 ${n}/${TO} 帧 · ${fps.toFixed(1)} fps · 已用 ${(el / 60).toFixed(1)} 分 · 预计还剩 ${(left / 60).toFixed(1)} 分   `);
  }
}
ff.stdin.end();
await done;
await browser.close();
const sec = (Date.now() - t0) / 1000;
console.log(`\n   渲染完成 ${sec.toFixed(0)}s（${(N / sec).toFixed(1)} fps）· ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
if (errors.length) console.log(`   pageerror ${errors.length} 条：${errors.slice(0, 3).join(' | ')}`);

// ── ffprobe 复核
const pj = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', OUT], { encoding: 'utf8' });
const info = JSON.parse(pj.stdout);
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
const dur = +info.format.duration;
const bad = [];
if (v.width !== W || v.height !== H) bad.push(`分辨率 ${v.width}×${v.height}`);
if (!/30/.test(v.r_frame_rate)) bad.push(`帧率 ${v.r_frame_rate}`);
if (!a && !NOAUD) bad.push('没有音轨');
if (Math.abs(dur - N / FPS) > 0.12) bad.push(`时长 ${dur.toFixed(3)}s ≠ ${(N / FPS).toFixed(3)}s`);
console.log(`\n   复核：${v.codec_name} ${v.width}×${v.height} ${v.r_frame_rate} · ${v.nb_frames || '?'} 帧 · ${v.pix_fmt} · ${(v.bit_rate / 1e6).toFixed(1)} Mbps`);
console.log(`        音频 ${a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : '缺失'} · 总长 ${dur.toFixed(3)}s`);
console.log(bad.length ? `\n✗ ${bad.join('；')}` : '\n✓ 4K 成片复核通过');
process.exit(bad.length || errors.length ? 1 : 0);
