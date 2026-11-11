// 清理 out/stills 里已经不在关键帧清单中的旧截图（改了关键帧表之后会残留）
// 用法：node tools/clean_stills.mjs
import fs from 'node:fs';
import path from 'node:path';
import { KEYFRAMES } from '../src/config/keyframes.js';
import { STYLES } from './styles.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const want = new Set(KEYFRAMES.map((k, i) => `kf_${String(i + 1).padStart(2, '0')}_${k.t.toFixed(1)}s.png`));
let removed = 0;
for (const s of STYLES) {
  const dir = path.join(ROOT, 'out/stills', s);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('kf_')) continue;
    if (want.has(f)) continue;
    fs.unlinkSync(path.join(dir, f));
    removed++;
  }
}
console.log(`保留 ${want.size} 张/套，删除旧图 ${removed} 个`);
