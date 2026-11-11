// 角色运动序列预览：把 assets 里的 seq 帧当 sprite sheet 播，验证“运动序列”是否成立
// ⚠️ 模板结构：形象清单来自赛事包的 RACE.mascots（mascotShowcase），不再写死 m/f × 三阶
import { mascotActors, mascotShowcase } from '../art/sprites.js';
const A = globalThis.__ASSETS || { crabs: {} };
const MOOD_CN = { run: '奔跑', cheer: '欢呼', tired: '疲惫', win: '胜利' };
const ACTORS = mascotActors();
const LABEL = {};
for (const x of mascotShowcase()) {
  const a = ACTORS.find((k) => k.id === x.actor) || {};
  LABEL[x.id] = [`${a.label ?? a.name ?? x.actor} · Lv${x.stage + 1}`, MOOD_CN[x.mood] ?? x.mood, x.mood];
}
// 兜底：素材里还有 showcase 没覆盖到的形象，也照样列出来（不然新赛事会看到空页）
for (const id of Object.keys(A.crabs || {})) {
  if (!LABEL[id]) LABEL[id] = [id, '', 'run'];
}
const ORDER = Object.keys(LABEL);
const style = globalThis.__STYLE || 'navi';
document.body.dataset.style = style;
const BADGE = { cartoon: 'A · 卡通', navi: 'B · 导航地图', papercut: 'C · 剪纸' };
const FILE = { cartoon: '动作序列-A-卡通', navi: '动作序列-B-导航地图', papercut: '动作序列-C-剪纸' };
document.getElementById('badge').textContent = BADGE[style] || style;

// 顶部三套切换
const tabs = document.getElementById('tabs');
tabs.innerHTML = ['cartoon', 'navi', 'papercut']
  .map((s) => `<a href="${FILE[s]}.html" class="${s === style ? 'on' : ''}">${BADGE[s]}</a>`)
  .join('') + '<a href="设定集.html">总览</a>';

const state = { playing: true, fps: 12, size: 150, bg: 'grid', together: true, t: 0, hoverOnly: false };
const cards = [];

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function card(id, crab) {
  const seq = crab.seq;
  const [who, mood] = LABEL[id];
  const imgs = seq.map((f) => {
    const im = new Image();
    im.src = f.src;
    return im;
  });
  const node = el(`<div class="card">
    <div class="hd"><b>${id}</b><span>${who} · ${mood}</span><span class="tag">${seq.length} 帧</span></div>
    <div class="stage ${state.bg}"><img alt="${id}"></div>
    <div class="strip">${seq.map((f, i) => `<figure><img src="${f.src}" alt="f${i}"><figcaption>f${String(i).padStart(2, '0')}</figcaption></figure>`).join('')}</div>
    <div class="meta">画布 ${seq[0].w}×${seq[0].h} · 帧高差 ${(Math.max(...seq.map((f) => f.ay)) - Math.min(...seq.map((f) => f.ay))).toFixed(3)}</div>
  </div>`);
  const stage = node.querySelector('.stage');
  const img = node.querySelector('.stage img');
  const c = { id, node, stage, img, imgs, seq, i: 0, hover: false, crab };
  node.addEventListener('mouseenter', () => { c.hover = true; });
  node.addEventListener('mouseleave', () => { c.hover = false; });
  cards.push(c);
  return node;
}

function render() {
  const grid = document.getElementById('grid');
  const ids = ORDER.filter((id) => A.crabs[id] && A.crabs[id].seq && A.crabs[id].seq.length > 1);
  if (!ids.length) {
    grid.innerHTML = '<div class="empty">这套画风还没有运动序列：跑 <code>uv run --with requests python tools/gen_seq.py ' + style + '</code> 出宫格图，再跑 <code>tools/slice_seq.py</code> 切帧。</div>';
    document.getElementById('table').innerHTML = '';
    return;
  }
  for (const id of ids) grid.appendChild(card(id, A.crabs[id]));
  // 明细表
  const rows = ids.map((id) => {
    const seq = A.crabs[id].seq;
    const dy = (Math.max(...seq.map((f) => f.ay)) - Math.min(...seq.map((f) => f.ay))) * seq[0].h;
    const dx = (Math.max(...seq.map((f) => f.cx)) - Math.min(...seq.map((f) => f.cx))) * seq[0].w;
    return `<tr><td><b>${id}</b></td><td>${LABEL[id][0]} · ${LABEL[id][1]}</td><td class="num">${seq.length}</td>
      <td class="num">${seq[0].w}×${seq[0].h}</td><td class="num">${dy.toFixed(1)} px</td><td class="num">${dx.toFixed(1)} px</td></tr>`;
  }).join('');
  document.getElementById('table').innerHTML = `<table><thead><tr><th>形象</th><th>说明</th><th>帧数</th><th>画布</th><th>基线抖动</th><th>中心抖动</th></tr></thead><tbody>${rows}</tbody></table>`;
  applySize();
}

function applySize() {
  for (const c of cards) {
    const f = c.seq[c.i];
    const h = state.size;
    const w = Math.round(f.w * h / f.h);
    c.img.style.height = h + 'px';
    c.img.style.width = w + 'px';
  }
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) state.t += dt * (state.together ? 1 : 1);
  const per = 1 / state.fps;
  for (const c of cards) {
    const active = state.together || c.hover;
    if (!active) continue;
    const i = Math.floor((state.t / per) % c.seq.length);
    if (i !== c.i) {
      c.i = i;
      c.img.src = c.seq[i].src;
      applySize.call(null);
      c.img.style.height = state.size + 'px';
      c.img.style.width = Math.round(c.seq[i].w * state.size / c.seq[i].h) + 'px';
    }
  }
  requestAnimationFrame(tick);
}

document.getElementById('play').addEventListener('change', (e) => { state.playing = e.target.checked; });
document.getElementById('fps').addEventListener('input', (e) => {
  state.fps = +e.target.value;
  document.getElementById('fpsv').textContent = state.fps + ' fps';
});
document.getElementById('size').addEventListener('input', (e) => {
  state.size = +e.target.value;
  document.getElementById('sizev').textContent = state.size + ' px';
  applySize();
});
document.getElementById('bgsel').addEventListener('change', (e) => {
  state.bg = e.target.value;
  for (const c of cards) { c.stage.className = 'stage ' + state.bg; }
});
document.getElementById('allbtn').addEventListener('click', (e) => {
  state.together = !state.together;
  e.target.classList.toggle('on', state.together);
  e.target.textContent = state.together ? '全部同时播' : '悬停才播';
});

render();
requestAnimationFrame(tick);
