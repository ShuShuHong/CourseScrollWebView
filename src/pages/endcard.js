// 落版画面单页：把 src/art/endcard.js 画到 1920×1080 舞台上
//   ?t=2.6   按成片时间取入场进度（默认停在全到位）
//   ?dpr=2   4K 导出用
import { endcardSVG, hasEndcard } from '../art/endcard.js';
import { ENDCARD_T } from '../config/story.js';

const q = new URLSearchParams(location.search);
const t = q.has('t') ? +q.get('t') : ENDCARD_T.t0 + 3;
const k = Math.max(0, Math.min(1, (t - ENDCARD_T.t0) / ENDCARD_T.fade));
const dt = t - ENDCARD_T.t0;

const card = document.getElementById('card');
const draw = () => {
  card.innerHTML = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">`
    + endcardSVG({ k, dt }) + `</svg>`;
};
draw();
window.__redraw = draw;      // 导出 4K 海报时换更高分辨率的底图再画一遍

// 截图脚本用：确认底图与角色都在
window.__endcard = {
  hasArt: hasEndcard(),
  crabs: Object.keys((window.__ASSETS || {}).crabs || {}).length,
  t, k: +k.toFixed(3),
};
window.__ready = Promise.resolve();
if (!hasEndcard()) console.warn('缺少落版底图：先跑 tools/endcard_art.py 生成并装进 assets/endcard/');
