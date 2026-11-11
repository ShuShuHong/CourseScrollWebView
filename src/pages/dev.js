// 开发用：角色/图标/道具快速核看
import { crabStandalone, crabDefs } from '../art/crab.js';
import { stationIcon, STATION_TYPES, kmBadge, uturnSign, heart, levelBadge } from '../art/icons.js';
import { archSVG, archDefs, zoneBoards, gunRipple } from '../art/props.js';
import { stickerSVG, STICKER_ARTS } from '../art/stickers.js';

const app = document.getElementById('app');
const sv = (vb, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs}</defs>${body}</svg>`;
let html = '';
html += `<div class="c" style="grid-column:span 4">${sv('-40 -40 600 80', Object.keys(STATION_TYPES).map((t, i) => `<g transform="translate(${i * 76} 0)">${stationIcon(t)}</g>`).join('') +
  `<g transform="translate(540 0)">${kmBadge(8)}</g>`)}</div>`;
html += `<div class="c" style="grid-column:span 2">${sv('-230 -340 460 360', archSVG({ label: '起点 START', time: '06:59:58' }), archDefs())}</div>`;
html += `<div class="c">${sv('-200 -100 400 160', zoneBoards({ active: 'AB' }) + `<g transform="translate(0 40)">${gunRipple(0.4)}</g>`)}</div>`;
html += `<div class="c">${sv('-120 -240 240 250', uturnSign('全马折返点'))}</div>`;
html += STICKER_ARTS.map((a) => `<div class="c">${sv('-160 -130 320 260', stickerSVG({ art: a, name: a, tag: a === 'sequoia' ? '秋日限定' : '' }))}</div>`).join('');
html += `<div class="c">${sv('-80 -30 260 60', [0, 1, 2, 3, 4].map((i) => `<g transform="translate(${i * 34} 0)">${heart(i < 4)}</g>`).join('') + `<g transform="translate(-50 0)">${levelBadge(2, '#1475D9')}</g>`)}</div>`;
for (const sex of ['m', 'f']) for (const stage of [0, 1, 2]) html += `<div class="c">${crabStandalone({ sex, stage, mood: stage === 2 ? 'win' : 'run', phase: 0.15 })}</div>`;
app.innerHTML = html;
