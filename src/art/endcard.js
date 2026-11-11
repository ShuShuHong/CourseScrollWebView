// 落版画面（客户 2026-11-04）：AI 背景 + 矢量排版 + 蟹王/蟹后位图
//
// 依据（两条，缺一不可）：
//   ① 最初脚本 xlsx 第 10 条：「公蟹冲线，戴王冠、披风，变蟹王。两只螃蟹在终点并排站立。」
//      同条给的数据线：公蟹 42.195km / 母蟹 21.0975km / 累计爬升 61m / 海拔 4—26m /
//      半程 10:40 / 全程 13:40 关门 / A、B、C 混编，A、B 第一枪、C 第二枪。
//   ② 官方 .ai 设计稿：蓝白底、清透湖面、暖秋树列、粗无衬线标题；
//      品牌锁定「2026 澜湾马拉松 / LANWAN MARATHON」（片子全篇用的是这个短名，不是冠名全称）。
//
// 为什么文字不用 AI 生成：4K 屏上要 1:1 锐利、而且客户随时可能改字；
// 为什么角色不用 AI 重画：客户对形象准确性极敏感，直接用项目自己的位图（母左公右，定稿口径）。
//
// 用法：
//   endcardSVG({ k, dt })      → 一整张落版（1920×1080 设计坐标，4K 时整体 ×2）
//   ENDCARD.t0 / t1 / fade     → 时间轴（由 story.js 的 endTitle 事件读取）
import { getAssets, crabSprite, hasSprites } from './sprites.js';
import { THEME, RACE_META } from '../config/theme.js';
import { esc } from './svg.js';
import { POINTS } from '../config/story.js';

const W = 1920, H = 1080;
const FONT = THEME.font;
const GOLD = '#FFB020';
const WHITE = '#FFFFFF';

export const ENDCARD = {
  // 时刻不在这里：见 src/config/story.js 的 ENDCARD_T（时间轴唯一来源）
  art: 'endcard',         // assets_<style>.js 里的背景图 id（只有 B 导航地图有）
  title: RACE_META.brand,
  en: RACE_META.en,
  slogan: '赛道见',
  // 脚本第 10 条给的四个数，一句不落
  l1: `${RACE_META.routes.full.label} ${RACE_META.routes.full.distance}km · ${RACE_META.routes.half.label} ${RACE_META.routes.half.distance}km · 累计爬升 ${RACE_META.elevation.gain}m · 海拔 ${RACE_META.elevation.min}—${RACE_META.elevation.max}m`,
  l2: `${RACE_META.routes.half.kmLabel} ${RACE_META.routes.half.cutOff} / ${RACE_META.routes.full.kmLabel} ${RACE_META.routes.full.cutOff} 关门 · A、B 区首发，C 区第二枪`,
  // 起终点名取自 story.js 的起点 POI（剥掉自带的“起点 · ”前缀，避免和外面的“起终点 · ”重复）
  venue: '起终点 · ' + (((POINTS.find((p) => p.kind === 'start') || {}).name || '起终点').replace(/^(起点|终点)\s*·\s*/, '')),
};

// 角色站位（客户定稿口径：母蟹永远在左、公蟹永远在右；站同一条脚线上）
// 站位：**站在画面底部的地面上、分列标题左右**。
//   原来放在 y≈690（地平线附近）时，两只悬在天空里 —— 4K 成片里非常明显（没有接地影），客户一定挑。
//   现在脚线 1000、贴着底边站，正好在文字栏两侧的空档里。
export const ENDCARD_FEET = 1000;
export const ENDCARD_DUO = [
  { sex: 'f', x: 268, h: 214, ph: 0.00 },
  { sex: 'm', x: 1656, h: 230, ph: 0.42 },
];

/** 有没有落版底图（A 卡通 / C 剪纸暂时没有，退回原来的纯文字片尾） */
export const hasEndcard = () => !!getAssets().endcard;

const softStroke = 'paint-order="stroke" stroke="rgba(6,16,28,.34)" stroke-width="2.4" stroke-linejoin="round"';

/**
 * 整张落版。
 * @param k  入场进度 0..1（0 = 全透明，1 = 到位）
 * @param dt 已经入场多少秒（用于文字错峰与角色呼吸）
 */
export function endcardSVG({ k = 1, dt = 9, fade = 0.80 } = {}) {
  const a = getAssets();
  const art = a.endcard;
  if (!art) return '';
  const cl = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const sm = (x) => { const t = cl(x); return t * t * (3 - 2 * t); };   // smoothstep
  const rise = (d, dur = 0.5) => sm((dt - d) / dur);
  const push = 1 + 0.018 * sm(dt / 3.2);            // 底图极慢推近，静止画面也有气

  // 转场用「过黑」而不是直接交叉溶解：片尾主舞台的 LED 背板本身就写着
  // 「2026 澜湾马拉松」，直接淡入会出现两条标题叠在一起（实测 75.3s 非常难看）。
  //   0 → 0.42fade：黑场压到 0.94；0.40fade 起卡片浮出，fade 时到位。
  const dip = sm(dt / (fade * 0.42)) * 0.94;
  const cardK = cl(k) * sm((dt - fade * 0.40) / (fade * 0.60));
  let s = `<rect width="${W}" height="${H}" fill="#05090F" opacity="${dip.toFixed(3)}"/>`;
  s += `<g opacity="${cardK.toFixed(3)}">`;
  s += `<g transform="translate(${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)}) scale(${push.toFixed(4)}) translate(${(-W / 2).toFixed(1)} ${(-H / 2).toFixed(1)})">`
    + `<image href="${art}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/></g>`;
  s += `<defs><linearGradient id="ec-scrim" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0.34" stop-color="#06111F" stop-opacity="0"/>`
    + `<stop offset="0.58" stop-color="#06111F" stop-opacity="0.46"/>`
    + `<stop offset="0.79" stop-color="#06111F" stop-opacity="0.86"/>`
    + `<stop offset="1" stop-color="#06111F" stop-opacity="0.955"/>`
    + `</linearGradient>`
    + `<radialGradient id="ec-vig" cx=".5" cy=".42" r=".78"><stop offset="0.55" stop-color="#06111F" stop-opacity="0"/><stop offset="1" stop-color="#06111F" stop-opacity=".42"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#ec-scrim)"/><rect width="${W}" height="${H}" fill="url(#ec-vig)"/>`;

  // ── 角色：蟹后（左） / 蟹王（右），站在下方暗带上
  if (hasSprites()) {
    const feet = ENDCARD_FEET;
    for (const c of ENDCARD_DUO) {
      s += `<g transform="translate(${c.x} ${feet})" opacity="${rise(0.10, 0.55).toFixed(3)}">`
        + crabSprite({ sex: c.sex, stage: 2, mood: 'win', phase: (dt * 0.85 + c.ph) % 1, facing: 1, heightPx: c.h })
        + `</g>`;
    }
  }

  // ── 文字：标题 → 英文 → 金线 → 赛道见 → 两行数据
  const t1 = rise(0.18, 0.6), t2 = rise(0.34, 0.6), t3 = rise(0.46, 0.6), t4 = rise(0.60, 0.6), t5 = rise(0.72, 0.6);
  s += `<g transform="translate(${W / 2} ${(786 + (1 - t1) * 22).toFixed(1)})" opacity="${t1.toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.title}" font-weight="800" font-size="86" letter-spacing="4" fill="${WHITE}" ${softStroke}>${esc(ENDCARD.title)}</text></g>`;
  s += `<g transform="translate(${W / 2} ${(826 + (1 - t2) * 14).toFixed(1)})" opacity="${(t2 * 0.72).toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.num}" font-weight="700" font-size="17" letter-spacing="9" fill="${WHITE}">${esc(ENDCARD.en)}</text></g>`;
  // 金线：从中心向两侧展开
  const rw = 250 * t3;
  s += `<rect x="${(W / 2 - rw / 2).toFixed(1)}" y="848" width="${rw.toFixed(1)}" height="3" rx="1.5" fill="${GOLD}" opacity="${t3.toFixed(3)}"/>`;
  s += `<g transform="translate(${W / 2} ${(916 + (1 - t4) * 16).toFixed(1)})" opacity="${t4.toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.title}" font-weight="800" font-size="58" letter-spacing="6" fill="${GOLD}" ${softStroke}>${esc(ENDCARD.slogan)}</text></g>`;
  s += `<g transform="translate(${W / 2} 972)" opacity="${t5.toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.cn}" font-weight="600" font-size="27" letter-spacing=".6" fill="${WHITE}" opacity=".92" ${softStroke}>${esc(ENDCARD.l1)}</text></g>`;
  s += `<g transform="translate(${W / 2} 1008)" opacity="${(t5 * 0.72).toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.cn}" font-weight="500" font-size="22" letter-spacing=".4" fill="${WHITE}">${esc(ENDCARD.l2)}</text></g>`;

  s += `<g transform="translate(${W / 2} 1046)" opacity="${(t5 * 0.5).toFixed(3)}">`
    + `<text text-anchor="middle" font-family="${FONT.cn}" font-weight="400" font-size="18" letter-spacing="2.4" fill="${WHITE}">${esc(ENDCARD.venue)}</text></g>`;

  s += `</g>`;
  return s;
}
