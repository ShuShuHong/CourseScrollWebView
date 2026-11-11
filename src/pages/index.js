// 设定集总览：把三套并排摆出来，方便一次性圈定
const C = window.__CARDS || {};
const order = ['cartoon', 'navi', 'papercut'];
const $ = (s) => document.querySelector(s);

$('#cards').innerHTML = order.filter((k) => C[k]).map((k) => {
  const c = C[k];
  return `<article class="sc">
    <div class="hd"><div class="no">方案 ${['A', 'B', 'C'][order.indexOf(k)]}</div><h3>${c.label}</h3><p>${c.tag}</p></div>
    ${c.master ? `<img src="${c.master}" alt="定妆图">` : ''}
    ${c.hero ? `<div class="kfimg"><img src="${c.hero}" alt="关键帧"><span>成片关键帧 · 林荫大道</span></div>` : ''}
    <ul>${c.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    <div class="bt"><a class="p1" href="${c.bible}">打开这套设定集 →</a><a class="p2" href="${c.stage}">预览成片</a></div>
  </article>`;
}).join('');

const rows = [
  ['角色画法', '粗黑描边 + 平涂赛璐璐', '扁平矢量 + 白描边贴纸', '多层剪纸 + 纸影'],
  ['地图气质', '桌游地图板，暖、饱和', '导航 App，浅、干净', '民间剪纸，米黄 + 中国红'],
  ['地标插画', '卡通插画（AI）', '扁平矢量插画（AI）', '剪纸插画（AI）'],
  ['功能点图标', '深色描边徽章', '白片 + 彩色圆片，无描边', '红纸盘 + 剪口波浪边'],
  ['适合场景', '短视频平台 / 大众传播', '官方渠道 / 赞助商提案', '文旅宣传 / 秋日限定叙事'],
  ['要注意的', '容易被说“像儿童游戏”', '颜色偏淡，大屏投影要压深', '细节易糊成一片红，靠留白'],
];
$('#table').innerHTML = `<table><tr><th>维度</th><th>A · 卡通</th><th>B · 导航地图</th><th>C · 剪纸</th></tr>${
  rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>`;
$('#built').textContent = __BUILD_TIME__;
window.__ready = document.fonts.ready;
