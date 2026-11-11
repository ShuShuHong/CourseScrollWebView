// 关键帧清单（设定集“关键帧”章节 + 审片对照用）
// 每条写它对应的“蓝蓝里程”或绝对时间，t 由 story.js 的 MALE_KM 反推 ⇒ 换音轨/改文案后自动跟着走。
// 起跑仪式与片尾这几条时间固定（那一刻蓝蓝还在起点 / 已到终点），所以直接给 t。
import { MALE_KM, DURATION, T_GO, T_FEMALE_FINISH, T_MALE_FINISH, T_CROWN_MALE, lineT, lineEnd, tAtKm } from './story.js';
import { pchip, inverse } from '../../../src/engine/math.js';

const maleKm = pchip(MALE_KM);
const tAt = (km) => +inverse(maleKm, 0, DURATION, km).toFixed(2);

const RAW = [
  { t: 0.9, shot: 1, title: '黑屏加载', note: '加载条“澜湾马拉松地图加载中”，Q 版蓝蓝在跑步读条；口播“2026澜湾马拉松，赛道解锁”' },
  { t: 2.7, shot: 1, title: '副本 · 主会场全景', note: '按官方「主会场平面图·起跑前」米制重建（左北右南）：路 22 m、门头 24 m 跨、A/B/C 分区、东侧加油助威/啦啦队/媒体区帐篷带、西侧主舞台与演员候场、公园水面；镜头在门头正面' },
  { t: 6.1, shot: 1, title: '副本 · A/B/C 分区', note: '地面分区涂装（A 红 / B、C 蓝，官方口径，无立牌）；第一枪波纹在 A 区中心扩散——对应口播“A、B区首发”' },
  { t: lineT('L04') + 1.75, shot: 1, title: '副本 · C 区第二枪', note: '第二枪波纹在弯道里的 C 区扩散；左上信息卡：混编 / A/B 首发 / C 第二枪 / 关门时间；远处可见道路在 C 区口向西弯折' },
  { t: T_GO, shot: 1, title: '副本 · GO! 冲出起点线', note: '镜头从**两只吉祥物背后**跟出去（F195–232 已环绕到门头背面并抬高，ABC 自上而下排开）；此刻只有起跑线，没有终点标识；9.30s 切回全图' },
  { km: 1.6, shot: 2, title: '城区段 · 赛段调整', note: '信息卡“新增约2km城区段”；画面进入今年新加的城区部分' },
  { km: 2.36, shot: 2, title: '文渊塔（白模占位）', note: '官方图红框处立起白模佛塔 + 一张“文渊寺”图卡（13.90s 出、16.90s 收，比博物馆卡早半秒、老街卡出之前消失）' },
  { km: 2.5, shot: 2, title: '约2.5km 澜湾博物馆', note: '地标贴纸由小变大，引线连回官方图上的博物馆位置；公里牌路边立起' },
  { km: 5.7, shot: 2, title: '约5.8km 澜湾老街', note: '老街贴纸放大；5km 功能点图标簇弹出（只闪不念）' },
  { km: 8.1, shot: 3, title: '约8.1km 上云澜大桥（刚到桥头）', note: '桥在吉祥物抵达前 ~1s 就先隆起并“长”出 H 型独塔与双索面斜拉索（6.75km 起算）；公里牌 08' },
  { km: 9.6, shot: 3, title: '桥顶 · 形态升级', note: '桥顶约26m，赛道最高点；LEVEL UP，双宝换装 Lv2（披风 + 头带金边）' },
  { km: 11.9, shot: 4, title: '银杏大道 · 秋日限定', note: '金色银杏行道树；画面暖色“秋日限定”滤镜' },
  { km: 14.0, shot: 4, title: '云澜湖悦水湾', note: '花海点缀 + 悦水湾贴纸；海拔窗“最低约4m”小标签' },
  { km: 18.0, shot: 5, title: '二次上桥', note: '桥模型红色；体力条掉一格 + “体力下降 + 爬坡”警告；表情疲惫' },
  { km: 19.6, shot: 6, title: '澜湾北路折返', note: '黄色折返牌；全半马共同' },
  { km: 20.9, shot: 6, title: '全 / 半马分流', note: '地面弹出分流箭头：粉=半马左转星湖南路，蓝=全马右转柳堤南路；随后画面左右分屏' },
  { km: 22.4, shot: 7, title: '半马冲刺 · 左右分屏', note: '左半切到副本：湾湾跑最后 230 m 直道（路面上 230/200/150/100/50 m 刻度依次掠过）；右半仍是全图，蓝蓝继续环湖' },
  { t: T_FEMALE_FINISH + 0.5, shot: 7, title: '副本 · 湾湾冲线', note: '一开屏即冲刺画面；撞线瞬间踩黑白终点标识 + 撒花，**过线即**解锁湖后；镜头只轻轻绕一下就锁死，一直庆祝到收屏' },
  { km: 23.2, shot: 8, title: '约22.6—38.5km 滨湖公园（脚本口径）', note: '半马线变暗，只剩全马高亮；云澜水岸滨湖公园贴纸' },
  { km: 29.1, shot: 8, title: '29.1km 折返点掉头 · 图上 29.2km', note: '新脚本已改成 29.1km，与图上 29.2km 只差 0.1km；26–28 公里牌隐藏' },
  { km: 33.0, shot: 8, title: '折返后加速 · 29→39km', note: '29.1km 折返读完就加速回程（3.57 km/s）；不设加速角标、不拉速度线，镜头中远景跟住蓝蓝' },
  { km: 40.4, shot: 9, title: '约40—41km 湿地公园', note: '全马专属地标贴纸；体力回稳' },
  { t: T_MALE_FINISH + 0.6, shot: 10, title: '副本 · 蓝蓝冲线', note: '蓝蓝单独从北侧最后 230 m 冲进拱门撞线（湾湾此时已在主舞台，不出现），撒花 + 大皇冠红披风（过线即解锁）' },
  { t: T_CROWN_MALE + 0.6, shot: 10, title: '副本 · 主舞台庆祝', note: '剪接到主舞台：两只站在台上（母左公右）撒花庆祝，左侧挂赛道信息字卡（全马/半马里程、爬升、海拔、关门、分区）' },
  { t: DURATION - 0.6, shot: 10, title: '片尾', note: '“2026澜湾马拉松，11月8日，赛道见”' },
];

export const KEYFRAMES = RAW.map((k) => ({ ...k, t: k.t !== undefined ? +k.t.toFixed(2) : tAt(k.km) }))
  .sort((a, b) => a.t - b.t);

// 环境设定截图（无角色、无 HUD）：机位固定，与时间无关
export const ENV_SHOTS = [
  { id: 'overview', title: '全图总览', cam: { target: [1080, 1150, 0], dist: 6200, az: 0, pitch: 64, frame: 0 }, prog: 0, lift: 0.1 },
  { id: 'city', title: '城区（北岸老城）', cam: { target: [1000, 470, 0], dist: 1300, az: 0, pitch: 50, frame: 0 }, prog: 0, lift: 0.1 },
  { id: 'bridge', title: '云澜大桥（第一次 · 蓝）', cam: { target: [820, 750, 10], dist: 620, az: 35, pitch: 32, frame: 0 }, prog: 0, lift: 1, bridge: 'bridge1' },
  { id: 'bridge2', title: '云澜大桥（第二次 · 红）', cam: { target: [820, 750, 10], dist: 620, az: 35, pitch: 32, frame: 0 }, prog: 0, lift: 1, bridge: 'bridge2' },
  { id: 'sequoia', title: '银杏大道 + 悦水湾花海', cam: { target: [1750, 1050, 0], dist: 900, az: 0, pitch: 46, frame: 0 }, prog: 0, lift: 0.1 },
  { id: 'east', title: '东环湖岸（全马专属）', cam: { target: [1700, 1300, 0], dist: 2100, az: 0, pitch: 56, frame: 0 }, prog: 0, lift: 0.1 },
  { id: 'wetland', title: '湿地公园 + 起终点', cam: { target: [600, 1900, 0], dist: 900, az: -10, pitch: 44, frame: 0 }, prog: 0, lift: 0.1 },
];
void lineEnd;
