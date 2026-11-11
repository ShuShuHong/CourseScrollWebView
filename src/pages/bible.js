// 设定集（每套画风一份，给项目方选型确认）
// 角色 / 地图风格 / 地标 / 图标道具 / 起终点 / 关键帧 / 字幕表 / 待确认
// 图片：AI 角色与地标来自 window.__ASSETS（pack_assets 内嵌）；地图与关键帧来自 window.__IMAGES（capture 截图）
import { crabSprite, crabId, getAssets, hasSprites, masterSrc, mascotActors, mascotShowcase, mascotSpec } from '../art/sprites.js';
import { crabDefs, crabSVG } from '../art/crab.js';
import { stationIcon, STATION_TYPES, kmBadge, uturnSign, heart, levelBadge, stationRow, stationCard } from '../art/icons.js';
import { archSVG, archDefs, zoneBoards, gunRipple } from '../art/props.js';
import { stickerSVG } from '../art/stickers.js';
import { THEME, STYLE, STYLE_NAMES, BRAND } from '../config/theme.js';
import { STICKERS, SUBTITLES, NARRATION, ELEV_MODE, AUDIO_OFFSET, AUDIO_DUR, CPS_AVG, SEGS } from '../config/story.js';
import { KEYFRAMES, ENV_SHOTS } from '../config/keyframes.js';
import { CUES as SFX_CUES, AMB as SFX_AMB, STEPS as SFX_STEPS, MIX as SFX_MIX } from '../config/sfx.js';
import { BGM_BLOCKS, BGM_BAR, BGM_BARS, BGM_TAIL, BGM_LEN, BGM_SRC_BAR } from '../config/bgm.js';
import { elevPanel, hudDefs } from '../engine/hud.js';
import { DURATION as DURATION_TOTAL } from '../engine/timeline.js';
import { COURSE } from '../engine/course.js';

const IMG = window.__IMAGES || {};
const $ = (s) => document.querySelector(s);
const sv = (vb, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${extra}><defs>${crabDefs()}${archDefs()}${hudDefs()}</defs>${body}</svg>`;
const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const card = (body, cap, cls = '') => `<figure class="card ${cls}">${body}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
const img = (k, alt, cls = '') => (IMG[k] ? `<img src="${IMG[k]}" alt="${alt}" class="${cls}">` : `<div class="miss">（缺少截图 ${k}）</div>`);

// ── 三套画风的位置与说辞
const META = {
  cartoon: {
    tag: '粗黑描边 · 平涂赛璐璐 · 暖色桌游地图板',
    look: [
      '角色：2D 卡通插画，粗黑描边 + 平涂赛璐璐 + 少量高光，手游/绘本感',
      '地图：暖米色地图板 + 白色路网 + 高饱和湖水，像棋盘上的赛道',
      '贴纸：白卡片 + 粗描边，与角色同一支笔',
      '图标：深色描边徽章（白圈包彩色圆片）',
    ],
    fit: '最讨喜、亲和力最强，适合短视频平台做大众传播；代价是“游戏感”重，专业/文旅调性弱一些。',
    risk: '三套里最容易被说“像儿童游戏”；若项目方希望更“赛事官方”，B 更稳。',
  },
  navi: {
    tag: '扁平矢量 · 高德式路网 · 白色贴纸卡与柔和投影',
    look: [
      '角色：现代扁平矢量吉祥物，几何造型、白色粗描边贴纸感，像导航 App 的语音包形象',
      '地图：浅灰米底 + 白色路网 + 浅蓝水系 + 低饱和绿地，已走过的赛段自动变灰',
      '贴纸：白色大圆角卡片 + 柔和落影，像地图上的地点卡（客户口径：去掉底部定位尖角）',
      '图标：白片 + 彩色实心圆 + 顶部高光，无黑描边',
    ],
    fit: '最像“真的在看一张地图”，专业感与科技感最强；适合赛事官方渠道与赞助商提案。',
    risk: '颜色偏淡，4K 大屏投影时对比度需要再压深一档（配色已给到可调 token）。',
  },
  papercut: {
    tag: '中国民间剪纸 · 多层纸叠贴 · 红青金米白',
    look: [
      '角色：平面 2D 剪纸，多层彩色手工纸叠贴，剪刀口利落，可见宣纸纤维',
      '地图：米黄纸底 + 红纸包边 + 剪纸树与芦苇，水面为青绿纸片',
      '贴纸：花边纸框 + 米色内衬 + 纸层投影（锯齿边是剪出来的）',
      '图标：深红纸盘 + 米白衬纸 + 彩色纸盘 + 剪口波浪边',
    ],
    fit: '最有地方文化味（剪纸是非遗语汇），适合文旅宣传与“秋日限定”叙事。',
    risk: '剪纸质感在密集快剪里容易糊成“红色一片”，需要靠留白与节奏控制；角色细节（绒毛）比另两套难读。',
  },
};
const M = META[STYLE];
const ACTORS = mascotActors();
const FA = ACTORS.find((a) => a.id === 'f') || ACTORS[0];
const MA = ACTORS.find((a) => a.id === 'm') || ACTORS[1] || ACTORS[0];
const FILES = { cartoon: '设定集-A-卡通', navi: '设定集-B-导航地图', papercut: '设定集-C-剪纸' };
const SEQF = { cartoon: '动作序列-A-卡通', navi: '动作序列-B-导航地图', papercut: '动作序列-C-剪纸' };
const STYLE_KEY = globalThis.__STYLE || 'navi';
// 运动序列：一个形象的四帧横排
function seqStrip(id, h = 128) {
  const c = getAssets().crabs?.[id];
  if (!c?.seq?.length) return '<span class="miss">暂无序列</span>';
  return `<div class="seqrow">${c.seq.map((f, i) => `<figure><img src="${f.src}" style="height:${h}px" alt="${id} f${i}"><figcaption>f${String(i).padStart(2, '0')}</figcaption></figure>`).join('')}</div>`;
}

const sections = [];
const sec = (id, no, title, lead, body) => sections.push(`<section id="${id}"><header><span class="no">${no}</span><h2>${title}</h2></header><p class="lead">${lead}</p>${body}</section>`);

// 角色图（AI 位图），h = 设计高度
function crabFig(sex, stage, mood, h = 300) {
  const id = crabId(sex, stage, mood);
  // 无 AI 位图时回退到赛事包里的矢量兜底角色（crabSVG）
  if (!id || !hasSprites()) return sv('-140 -190 280 208', crabSVG({ sex, stage, mood, phase: 0.2, still: true }), `style="height:${h}px;display:block"`);
  const a = getAssets().crabs[id];
  const w = a.w * (h / a.h);
  return sv(`${(-w / 2 - 8).toFixed(1)} ${(-h - 10).toFixed(1)} ${(w + 16).toFixed(1)} ${(h * 1.16).toFixed(1)}`,
    crabSprite({ sex, stage, mood, heightPx: h, moving: false }));
}

// ── 01 角色
{
  // 角色表来自赛事包（RACE.mascots）：换一场赛事，设定集自动跟着变
  const SHOW = mascotShowcase();
  const SPEC = mascotSpec();
  const rows = mascotActors().map((a) => [a, SHOW.filter((x) => String(x.actor) === a.id)]);
  const grid = rows.map(([a, list]) => `<div class="grid g5">${list.map((x) =>
    card(crabFig(a.sex, x.stage, x.mood, 330),
      `<b>${a.label ?? a.name}${a.routeLabel ? ' · ' + a.routeLabel : ''}</b> ${x.caption}`)).join('')}</div>`).join('');
  const master = masterSrc();
  sec('char', '01', '角色形象（AI 生成位图）',
    `主角是两位 Q 版奔跑小人：<b>${MA.name}戴蓝色 42.195 头带跑全马，${FA.name}戴粉色 21.0975 头带跑半马</b>。三套画风各用 AI 出图：先出一张“并排”定妆图，再以定妆图为参考图逐张派生单只形态，保证同一套里角色长相、配色、笔触一致（没有位图时由矢量兜底角色顶上）。`,
    `${master ? `<h3>定妆图（后续所有形态的参考基准）</h3><figure class="card master"><img src="${master}" alt="定妆图"></figure>` : ''}
     <h3>全部形象：${SPEC.stages} 个阶段 × ${(SPEC.moods || []).length} 个动作（每套 ${SPEC.stages * (SPEC.moods || []).length} 张）</h3>${grid}
     <p class="note">阶段：<b>Lv1 新手</b>（起跑）→ <b>Lv2 升级</b>（第一次登顶大桥：披风 + 头带金边 + 护腕）→ <b>Lv3 ${MA.crown} / ${FA.crown}</b>（冲线：王冠/后冠 + 披风 + 金边）。
     动作：奔跑 / 欢呼 / 疲惫 / 胜利；引擎按“当前状态”自动选帧，缺哪张就回退到最接近的一张。</p>
     <h3>位图角色怎么动</h3>
     <p class="note">每个形象都有一段<b>逐帧运动序列</b>：AI 出一张“动作分解图”（同一只角色、四格只改动作相位）→ 自动切格 → 归一化到同一画布（底线对齐、视觉中心对齐，所以换帧不跳）→ 引擎按速度播帧，并叠上 bob / squash / tilt 补足落地感。下面每个形象下面是它的四帧。单独的可调速预览见 <a href="${SEQF[STYLE_KEY]}.html">动作序列页</a>。</p>
     <h3>全部形象的运动序列</h3>
     ${SHOW.some((x) => getAssets().crabs?.[x.id]?.seq?.length)
      ? `<div class="seqwrap">${SHOW.map((x) => `<div class="seqitem"><b>${x.id}</b>${seqStrip(x.id, 128)}</div>`).join('')}</div>`
      : '<p class="note">这套画风还没出运动序列：<code>python tools/gen_seq.py ' + STYLE_KEY + '</code> → <code>python tools/slice_seq.py ' + STYLE_KEY + '</code>。</p>'}`);
}

// ── 02 地图风格案例
{
  const shots = [['env_overview', '全图总览'], ['env_city', '城区（北岸老城）'], ['env_bridge', '跨湖大桥（第一次 · 爬坡）'], ['env_east', '东环湖岸（全马专属）'], ['env_wetland', '湿地公园 + 起终点'], ['env_sequoia', '林荫大道 + 湖畔乐园']];
  const sw = (c, n) => `<div class="sw"><i style="background:${c}"></i><span>${n}<br><code>${c}</code></span></div>`;
  const Mp = THEME.map, R = THEME.route;
  const swatches = [sw(Mp.board, '陆地 / 板面'), sw(Mp.water, '湖面'), sw(Mp.waterDeep, '深水'), sw(Mp.green, '绿地'), sw(Mp.sand, '沙岸'), sw(Mp.road, '道路'), sw(R.full, '全马线'), sw(R.half, '半马线'), sw(Mp.sequoia[0], '林荫树列'), sw(Mp.buildings[0], '建筑'), sw(THEME.hud.panel, 'HUD 面板'), sw(THEME.hud.card, 'HUD 卡片')].join('');
  sec('map', '02', '地图风格案例（成片引擎直出）',
    `底图不是截图，而是把官方矢量图拆成<b>水面 / 绿地 / 道路 / 路名 / 地标</b> 五层数据后，用 three.js 重新立体化成一块“地图板”。同一份数据、同一套代码，换一套配色 token 就是另一种画风——下面是本套画风下的真实画面。`,
    `<div class="grid g3">${shots.map(([k, t]) => card(img(k, t), t, 'wide')).join('')}</div>
     <h3>本套配色</h3><div class="swatches">${swatches}</div>
     <h3>本套画风的三条规矩</h3><ul class="rules">${M.look.map((t) => `<li>${t}</li>`).join('')}</ul>`);
}

// ── 03 地标插画
{
  // 地标卡清单取自赛事包 story.js 的 STICKERS（名字随赛事切换，km 取自 tag 或缺省）
  const L = STICKERS.map((s2) => [s2.art, s2.name, s2.tag || '']);
  const assets = getAssets().landmarks || {};
  const grid = L.map(([art, name, km]) => card(
    assets[art] ? `<img src="${assets[art]}" alt="${name}">` : `<div class="miss">缺少地标图 ${art}</div>`,
    `<b>${name}</b> ${km}`)).join('');
  const stick = STICKERS.map((s) => card(sv('-160 -130 320 260', stickerSVG({ art: s.art, name: s.name, tag: s.tag })), `${s.name}${s.only === 'full' ? ' · 全马专属' : ''}`)).join('');
  sec('landmarks', '03', '地标插画（AI 生成）',
    `脚本要求“经过地标时把地标图片做成贴纸、从小变大”。本套的 7 张地标是本画风的 AI 插画（横幅 16:10，满画面、无文字）。<b>如果项目方能提供实拍照片，替换即可</b>：外框、引线、弹出动画都不用动。`,
    `<div class="grid g3">${grid}</div>
     <h3>做成贴纸后的样子（成片里的用法）</h3><div class="grid g4">${stick}</div>
     <p class="note">注意：AI 插画是“示意”，不是实景。对外发布建议用项目方授权的实拍照片替换，避免观众把插画当成实景比对。</p>`);
}

// ── 04 图标道具
{
  const types = Object.keys(STATION_TYPES);
  const icons = types.map((t) => card(sv('-40 -40 80 80', stationIcon(t), 'class="ico"'), STATION_TYPES[t].name)).join('');
  const head = `<tr><th>站点</th>${types.map((t) => `<th>${sv('-32 -32 64 64', stationIcon(t), 'class="tico"')}<br>${STATION_TYPES[t].name}</th>`).join('')}</tr>`;
  const rows = COURSE.stations.map((s) => `<tr class="${s.half ? '' : 'fo'}"><td>${s.km}km${s.half ? '' : ' <em>全马</em>'}</td>${types.map((t) => `<td>${s.services.includes(t) ? '●' : ''}</td>`).join('')}</tr>`).join('');
  const kms = [1, 8, 21, 42].map((k, i) => `<g transform="translate(${i * 70} 0)">${kmBadge(k)}</g>`).join('') + `<g transform="translate(280 0)">${kmBadge(10, THEME.route.half)}</g>`;
  const hearts = [0, 1, 2, 3, 4].map((i) => `<g transform="translate(${70 + i * 36} 0)">${heart(i < 4)}</g>`).join('') + levelBadge(2, THEME.route.full);
  const popCard = sv('-150 -50 300 100', stationCard(220) + `<g transform="translate(0 0) scale(.92)">${stationRow(['water', 'wc', 'medical'], 58).svg}</g>`);
  sec('icons', '04', '图标道具与功能点',
    `7 类功能点与官方图例一一对应（同色同义），但按本套画风重画：${STYLE === 'navi' ? '白色圆片 + 柔和落影 + 彩色实心圆，去掉黑描边，贴近导航 App 的地点图标' : STYLE === 'papercut' ? '深红纸盘 + 米白衬纸 + 彩色纸盘，外缘剪出波浪口' : '深色描边 + 白圈 + 彩色徽章，和角色同一支笔'}。角色经过补给站时，路边弹出该站的图标簇（只闪不念）。`,
    `<h3>功能点图标</h3><div class="grid g7">${icons}</div>
     <h3>弹出时的样子（地图上）</h3><div class="grid g2">${card(popCard, '路边图标簇 + 底板')}${card(sv('-120 -240 240 250', uturnSign('城区折返')), '折返牌')}</div>
     <h3>功能点分布（取自官方图“赛事功能点分布表”）</h3><table class="tbl">${head}${rows}</table>
     <h3>路牌 / 状态</h3><div class="grid g4">
       ${card(sv('-30 -30 380 60', kms), '公里牌（蓝=全马 / 粉=半马）')}
       ${card(sv('-30 -30 290 60', hearts), '体力条（5 格）+ 等级章')}
       ${card(sv('0 0 580 240', elevPanel(8.3)), `海拔剖面小窗（${ELEV_MODE === 'official' ? '官方剖面 2–20m' : '脚本口径 4–26m'}）`)}
       ${card(sv('-230 -110 460 220', zoneBoards({ active: 'AB' })), '分区牌 A/B/C')}
     </div>`);
}

// ── 05 起终点
{
  sec('arch', '05', '起点 / 终点户外造型',
    `起终点同一座龙门。成片里简化为“充气拱门”：立柱 + 横梁 + 金色吊牌（起点 START / 终点 FINISH）。起跑前拱门上方升起 A/B/C 分区牌，地面铺分区块，两次发枪各一道波纹。拱门与分区牌也按本套画风重绘（描边 / 扁平 / 剪纸）。`,
    `<div class="grid g3">
      ${card(sv('-230 -340 460 360', archSVG({ label: '起点 START' })), '起点拱门')}
      ${card(sv('-230 -340 460 360', archSVG({ label: '终点 FINISH' })), '终点拱门（同一座，换吊牌）')}
      ${card(sv('-220 -110 440 220', zoneBoards({ active: 'AB' }) + `<g transform="translate(0 80)">${gunRipple(0.45)}</g>`), '分区牌 + 第一枪（A/B 高亮）')}
     </div>`);
}

// ── 06 关键帧
{
  const rows = KEYFRAMES.map((k, i) => `<figure class="kf"><div class="kimg">${img('kf_' + i, k.title)}</div><figcaption><span class="tc">${fmtT(k.t)}</span><span class="sh">镜头 ${k.shot}</span><b>${k.title}</b><p>${k.note}</p></figcaption></figure>`).join('');
  sec('kf', '06', '关键帧（成片引擎直出）',
    `以下画面全部由成片引擎按时间轴实时渲染截取（1920×1080；成片 4K 为同一画面 2 倍像素）。全片 ${DURATION_TOTAL.toFixed(1)} 秒（${KEYFRAMES.length} 个关键帧镜头），屏幕文字照抄口播字幕表，位置取官方矢量图。`,
    `<div class="kfs">${rows}</div>`);
}

// ── 07 字幕表 + 旁白全文
{
  const D = DURATION_TOTAL;
  const rows = SUBTITLES.map((s) => `<tr><td>${fmtT(s.t)}</td><td>${s.d.toFixed(1)}s</td><td>${s.text}${s.tag ? ` <em>${s.tag}</em>` : ''}</td><td>${s.km !== undefined ? s.km.toFixed(2) : ''}</td><td>${(s.text.length / s.d).toFixed(2)}</td></tr>`).join('');
  const chars = SUBTITLES.reduce((a, s) => a + s.text.length, 0);
  const narr = NARRATION.reduce((a, n) => a + n.text.length, 0);
  const narrRows = NARRATION.map((n, i) => `<tr><td>第 ${i + 1} 段</td><td>${n.km ? `${n.km[0]}–${n.km[1]}km` : '起跑前 / 终点'}</td><td>${n.text}</td></tr>`).join('');
  sec('subs', '07', '字幕与旁白（逐字上屏，与口播完全一致）',
    `本册口播由 <b>edge-tts 逐句现场合成</b>：42 条字幕 + 3 条后补插句按<b>匀速排程</b>铺到片子的对应时刻上（<code>audio/tts/timeline.wav</code>），所以<b>画面时间 == 音轨时间</b>（偏置 ${AUDIO_OFFSET}s）。字幕仍是 <b>${SUBTITLES.length} 条，一条一行上屏</b>。旁白 <b>${narr} 字全部上口播、也全部上屏</b>，一条没删。片长 <b>${D.toFixed(2)} 秒</b>。
     实测语速 <b>${(chars / SUBTITLES.reduce((a, s) => a + s.d, 0)).toFixed(2)} 字/秒</b>（合成语音的节奏）。<br><b>“里程”列不再是“驱动画面的锚”，而是“这句话播放时角色恰好在哪”</b>——新口径是<b>角色按固定速度 0.80 km/s 匀速跑</b>：台词之间里程不够就插空档（无字幕无配音），台词太长就这一句减速；副本场景里主里程轴暂停。`,
    `<table class="tbl subs"><tr><th>入点</th><th>时长</th><th>字幕</th><th>里程</th><th>字/秒</th></tr>${rows}</table>
     <h3>旁白分段（配音稿，与上屏文字逐字一致）</h3>
     <p class="note">共 <b>${narr} 字</b>，9 个段落。新口径是<b>匀速优先</b>：地图段一律 0.80 km/s，
     只有两种例外 —— <b>① 台词点名了里程</b>（“约2.5公里博物馆”“约29.1公里全马折返点掉头”），这一段减速到刚好对上；
     <b>② 台词太长、里程不够</b>（桥段的“桥长/桥顶/最高点”三句挤在 0.45 km 里），这一句按 <code>Δkm / 时长</code> 减速。
     主会场副本 / 分流副本里角色不在主地图上跑，主里程轴暂停。要改只能在 <code>src/config/schedule.js</code> 里改里程锚点。</p>`,);
  // 附：分段表
  sections[sections.length - 1] = sections[sections.length - 1].replace('</section>',
    `<h3>旁白分段表</h3><table class="tbl subs"><tr><th>段落</th><th>赛程</th><th>旁白</th></tr>${narrRows}</table></section>`);
}

// ── 08 待确认
{
  const narr = NARRATION.reduce((a, n) => a + n.text.length, 0);
  const Q = [
    ['选哪套画风', `客户已选定 <b>${STYLE_NAMES.navi}</b>（2026-10-26）。<b>本册为 ${STYLE_NAMES[STYLE]}</b>；其余两套的册子保留，供追溯对比。`],
    ['片长', `已按客户 1031 音轨 + 匀速排程锁定：25 段铺成 <b>${AUDIO_DUR}s</b> = 口播段 ${(DURATION_TOTAL - 2.4).toFixed(2)}s + 片头/片尾各 1.20s。片长 <b>${DURATION_TOTAL.toFixed(2)} 秒</b>。要缩短只有两条路：把 V 调大（会多几句减速），或者砍台词。`],
    ['跨湖大桥建模口径', `（2026-10-27）按实景做成<b>独塔双索面斜拉桥</b>：H 型桥塔（两立腿立在桥面边梁 ±15 + 上下两道横梁 + 塔顶锚台，总高 96）立在第一次过桥那段（沿桥轴 u=0.58，避开角色经过时遮住塔腿），两侧各 8 根斜拉索呈扇形从塔顶落到桥面。<b>出现时机</b>：桥面在 6.75km（17.1s）开始隆起，塔在 19.4s 长到全高、索同步张开，<b>角色 19.8s 到桥头时已经完整</b>；长好之后不再重建，第二次过桥只重演桥面隆起。`],
    ['角色运动口径', `（2026-10-27 客户口径）① <b>动画节拍恒定</b>：序列帧固定 2.35 循环/秒、欢呼/胜利 1.5，不随地图速度变化；② <b>站位固定</b>：半马角色永远在画面左、全马角色永远在右，间距恒定，<b>不跟着赛道拐弯旋转</b>（多次掉头会让两位角色疯狂打转）；③ 朝向也不再左右翻转。`],
    ['海拔剖面窗口径', `（2026-10-27）<b>全程常驻左下角</b>，片头加载与片尾题字之外一直显示；曲线按<b>官方 AI 路线图剖面</b>（水面 2m、最高 20m）；<b>桥面高程单独用红色虚线记号</b>（竖虚线 + 顶部水平线）标到 <b>26m</b>——水域是全片最低点，但桥面本身有高度，两者不能混成一条线。`],
    ['地标贴纸口径', `（2026-10-27）拼贴画<b>固定在画面偏右上</b>（多张向下排开），<b>只有指示线跟着地图走</b>；进出场是从右侧柔和滑入 + 淡入 / 淡出右移，不再弹跳放大。指示线画在角色<b>下层</b>，从角色背后穿过，不压脸。`],
    ['配速口径（2026-11-08 客户第六版：匀速优先）', `客户原话：“动画不用跟着音频走，优先保证角色匀速，在需要的地方出音频。” 全部写进 <code>src/config/schedule.js</code> 的 25 段里程锚点：
     <b>地图主场景</b>按 V=0.80 km/s 匀速推进（里程不够 → 插空档；台词太长 → 该句按 Δkm/时长 减速）；
     <b>主会场副本 / 分流副本</b>里角色不在主地图上跑，<b>主里程轴暂停</b>（段 24 终点前 230 m 例外，在会场内真实推进）。
     实测：25 段里 16 句减速、4 段空档（合计 14.14 km）、1 段加冕停留；总里程 42.1950 km 一分不差。`],
    ['赛段调整 +2km', '新版脚本写“今年赛段调整，增加约2公里城区段”，并给出“博物馆约2.5km、老街约5.8km”。官方路线图（1022 版）上没有这段调整说明，图上实测是博物馆约2.73km、老街约6.38km。目前<b>字幕照新版脚本</b>、<b>贴纸弹出位置照官方图</b>，两者差 +0.23 / +0.58km。请确认以哪一版为准（若以新版为准，需要新的路线图矢量）。'],
    ['海拔口径', '新版脚本两处写“桥顶约26米 / 海拔4到26米”，故海拔小窗已切到<b>脚本口径（4–26m）</b>；官方剖面实际是 2–20m、累计约37m。若项目方要按官方剖面，一处开关切回 official。'],
    ['A/B 区首发表述', '新版脚本写“A、B区首发，C区第二枪”，已同步到信息卡、发枪标签与总结卡（原为“第一枪A/B区”）。'],
    ['医院贴纸已撤', '新版脚本不再提城区那家医院，故贴纸已从时间轴撤下（素材仍在 assets 里，恢复只要取消一行注释）。'],
    ['全马折返点口径（已和解）', '（2026-11-03 客户第三次录音）脚本改成“全马约22.6-38.5公里穿过滨湖公园，约29.1公里全马折返点掉头”；官方图上东端唯一 180° 掉头在约 29.2km 处（有计时点标注），两者只差 <b>0.1km</b>，口径已经对上。<b>配速也已按客户口径钉住</b>：读完“穿过滨湖公园”= <b>66.00s / 29.00km</b>，台词“约29.1公里…”在 <b>66.12s</b> 开口，折返掉头动画 <b>66.33s</b>，读完跑到 <b>39.00km</b>（68.92s）。仅 26–28 公里牌仍是按旧配速隐藏的（新配速下 1.9 s/km，已可视，待确认是否放出）。'],
    ['城区折返位置', '脚本写“下桥约19.5公里，城区折返”；官方图上折返在约 19.61km，之后约 20.91km 分流。字幕按脚本写 19.5，避免与官方图的 18.5km 折返混淆（18.5km 折返新台词未点名，图上仍保留）。'],
    ['桥长 / 直道', '“桥长537.4米”“终点前直道约230m”官方图上无标注，按脚本使用，请组委会确认出处。'],
    ['滨湖公园', '官方图上无此标注，位置按脚本里程放在东环起始段（约 22.4km）。'],
    ['AI 素材的授权', '角色与地标为 AI 生成（RunningHub · seedream-v5-pro）。对外宣传前请按平台协议确认商用条款；每张图的提示词与任务号已记录在 races/&lt;id&gt;/mascots/manifest.json。'],
    ['要不要逐帧动画', '目前是“静态形象 + 程序化动效”（见 01 节）。若希望角色有真正的跑步循环动画，需要每只角色额外生成 6–8 帧序列，成本与周期另计。'],
    ['地标图片', '（2026-11-03 更新）已按客户提供的实拍照片改画成 2.66:1 的卡片插图，8 张全部到位（含塔与大桥）。原矢量/旧插画保留在各目录的 .bak 里。'],
    ['底图审图', '底图直接取自组委会提供的官方路线图矢量，对外发布若需审图号请组委会确认。'],
    ['音效来源', '（2026-11-03）全部为程序化合成（numpy 生成，工具在 tools/sfx_render.py），<b>不含任何第三方素材</b>，无版权与授权问题；替换某一条音效只改 tools/sfx_render.py 里对应的函数，时间轴不动。'],
  ];
  // ── 08 音效（客户 2026-11-03：通篇加音效）
  {
    const rows = SFX_CUES.map((c, i) => `<tr><td class="num">${String(i + 1).padStart(2, '0')}</td><td class="tm">${c.t.toFixed(2)}s</td>` +
      `<td>${c.sfx}</td><td class="num">${c.gain > 0 ? '+' : ''}${c.gain.toFixed(0)} dB</td><td class="note2">${c.note || c.id}</td></tr>`).join('');
    const ambRows = SFX_AMB.map((a) => `<tr><td class="tm">${a.t0.toFixed(1)}–${a.t1.toFixed(1)}s</td><td>${a.sfx}</td>` +
      `<td class="num">${a.gain} dB</td><td class="note2">${a.note}</td></tr>`).join('');
    sec('sound', '08', '声音设计（旁白 + 音效）',
      `全片 <b>${SFX_CUES.length} 条</b>音效点 + <b>${SFX_AMB.length} 段</b>环境底噪 + 一条 <b>${SFX_STEPS.rate} 步/秒</b>的脚步床（${SFX_STEPS.t0.toFixed(1)}–${SFX_STEPS.t1.toFixed(1)}s）。
       所有时间都钉在时间轴上：发枪/折返/冲线取自 <code>story.js</code> 的事件与 <code>T_*</code>，上桥/桥顶/湿地取自 <code>tAtKm()</code> 反推，
       图卡音取自贴纸窗口 —— 改配速或换音轨，音效自动跟着走。旁白永远压在上面：说话时音效再压 <b>${Math.abs(SFX_MIX.duckUnderVo)} dB</b>。
       合成用 numpy 程序化生成（无版权素材），同一套参数每次跑出来的波形完全一致。`,
      `<table class="tbl subs"><tr><th>#</th><th>时刻</th><th>音色</th><th>电平</th><th>说明</th></tr>${rows}</table>
       <h3>环境底噪（每段场景一层，接缝交叠淡入淡出）</h3>
       <table class="tbl subs"><tr><th>区间</th><th>音色</th><th>电平</th><th>场景</th></tr>${ambRows}</table>
       <p class="note">脚步床固定 3.35 步/秒（约 200 步/分），只在桥上降到 3.05–3.10 并把声音做闷；
       客户口径是“角色动画节拍恒定”，所以脚步<b>不跟着地图速度变快</b>，否则会变成密集的鼠标点击声。</p>
       <h3>BGM：<span style="color:#c0392b">客户 2026-11-04 决定不用</span>（下表仅留档）</h3>
       <p class="note">成片音轨 = <b>口播 + 音效</b>两条，页面与 4K 成片里都没有音乐。
       当时剪好的版本（按小节切 ${BGM_LEN} 秒）仍单独留着试听 <code>dist/bgm.mp3</code>，
       下表是它的分段依据：原曲实测 <b>95.70 BPM</b>、一小节 ${BGM_SRC_BAR} 秒、66 小节、2 分 48 秒，
       按段落气质剪了 8 块、共 ${BGM_BARS} 小节 + ${BGM_TAIL} 秒尾音，并把<b>全马角色撞线 65.26 s</b>卡在小节线上（0 ms）。</p>
       <table class="tbl subs"><tr><th>#</th><th>片子里</th><th>取自原曲</th><th>为什么用这一段</th></tr>
       ${BGM_BLOCKS.map((b2, i) => `<tr><td class="num">${String(i + 1).padStart(2, '0')}</td><td class="tm">${b2.out.toFixed(2)}–${(b2.out + b2.bars * BGM_BAR).toFixed(2)}s</td><td class="num">第 ${b2.srcBar} 小节 ×${b2.bars}</td><td class="note2">${b2.why}</td></tr>`).join('')}
       </table>
       <p class="note">撤销后已复核：成片混音与 BGM 源文件的相关度 <b>0.0009</b>（≈0，说明真的没混进去），
       <code>check_bgm</code> 把这件事故意做成一条断言，防止以后误加回去。</p>`);
  }
  sec('qa', '08', '待项目方确认', '以下事项会影响画面或文字，请逐条确认（未确认前按“目前做法”继续）。',
    `<ol class="qa">${Q.map(([a, b]) => `<li><b>${a}</b><p>${b}</p></li>`).join('')}</ol>`);
}

document.body.dataset.style = STYLE;
$('#main').innerHTML = sections.join('');
$('#toc').innerHTML = [['char', '角色'], ['map', '地图'], ['landmarks', '地标'], ['icons', '图标'], ['arch', '起终点'], ['kf', '关键帧'], ['subs', '字幕'], ['qa', '待确认']]
  .map(([id, n], i) => `<a href="#${id}"><span>0${i + 1}</span>${n}</a>`).join('');
$('#tabs').innerHTML = Object.keys(FILES).map((k) => `<a href="${FILES[k]}.html" class="${k === STYLE ? 'on' : ''}">${STYLE_NAMES[k]}</a>`).join('')
  + `<a href="设定集.html" class="home">总览</a>`;
$('#badge').textContent = STYLE_NAMES[STYLE];
$('#positioning').innerHTML = `<b>${M.tag}</b><br>${M.fit}`;
$('#built').textContent = __BUILD_TIME__;
window.__ready = document.fonts.ready;
