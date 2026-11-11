// 全片视觉口径：三套画风（A 卡通 / B 导航地图 / C 剪纸）。
// 页面地址加 ?style=cartoon|navi|papercut 切换；默认 DEFAULT_STYLE。
// 所有模块在加载时读取 THEME，故画风必须在页面加载前确定（URL 参数），不做运行时热切换。

export const DEFAULT_STYLE = 'navi';   // 客户 2026-10-26 选定：B · 导航地图
export const STYLE_NAMES = { cartoon: 'A · 卡通', navi: 'B · 导航地图', papercut: 'C · 剪纸' };

const COMMON = {
  station: {
    timing: '#ED1C24', medical: '#ED1C24', drink: '#00A650',
    water: '#019EDB', sponge: '#019EDB', food: '#F5821F', wc: '#019EDB',
  },
  stage: { w: 1920, h: 1080, fps: 30 },
};

const STYLES = {
  // ── A 卡通：暖色桌游地图板，粗黑描边
  cartoon: {
    key: 'cartoon',
    map: {
      board: '#F6EBCD', boardSide: '#C9A877', boardSideDark: '#8E6C45',
      sand: '#FBE2A6', water: '#4CC3E6', waterDeep: '#2BA3D6', waterLine: '#BDF0FF',
      green: '#A9D67E', greenDark: '#7CB95A',
      road: '#FFFFFF', roadMajor: '#FFF8E6', roadCasing: '#E3D3B0',
      tree: ['#4FA65A', '#62B95E', '#3E9152'], trunk: '#8A5A36',
      sequoia: ['#E9952E', '#F2B33D', '#D9762A'],
      flowers: ['#FF6FA3', '#FFC93C', '#B58CFF', '#FFFFFF'], reed: '#D8C08A',
      buildings: ['#FFFFFF', '#FDE7D4', '#E6F1FA', '#FFF1C9', '#F3E2F2'], roof: '#F07F5E',
      backdrop: '#123A5C',
      bldH: 1, treeScale: 1, roofs: true, paper: false, layerShadow: 0, hemi: 2.05, sun: 1.45,
    },
    route: {
      full: '#1475D9', fullGlow: '#6FC2FF', half: '#F0238C', halfGlow: '#FF8CC6',
      edge: '#FFFFFF', passedGray: false, bridge1: '#2F8CF0', bridge2: '#F2453D',
    },
    crab: { outline: '#1D2B3A', male: '#1475D9', female: '#F0238C', blush: '#FF8A8A', belly: '#FFF6E2' },
    hud: {
      panel: '#14284A', panel2: '#1E3B66', stroke: '#FFFFFF', text: '#FFFFFF', sub: '#9FB6D6',
      gold: '#FFC83D', red: '#F2453D', green: '#33C27A', ink: '#14284A', card: '#FFFFFF',
      shadow: 'rgba(10,25,50,.35)', overlayFilter: '',
    },
    arch: { post: ['#0F4C9E', '#4FA3FF', '#1A6FD8'], tag: '#FFC83D', tagText: '#1D2B3A', title: '#FFFFFF' },
    venue: { roadTex: 'blob', road: '#828D9C', asphaltOp: 1, asphalt: '#828D9C', plaza: '#F2E7CE', city: '#DCD4C4', tent: '#FBB040', stage: '#1F63E0', bldg: '#E9DFC9', crowd: ['#FFFFFF', '#F2C14E', '#2E7BFF', '#FF4FA0', '#42C08A', '#F2724E'] },
    sticker: { frame: 'card' },
    font: { cn: "'HMSans', 'Microsoft YaHei', sans-serif", title: "'HMSans', 'Microsoft YaHei', sans-serif", num: "'FigtreeX', 'HMSans', sans-serif" },
  },

  // ── B 导航地图：浅色、扁平、高德式路网；已走过的路线变灰；白色贴纸描边 + 柔和投影
  navi: {
    key: 'navi',
    map: {
      board: '#F3F1EC', boardSide: '#DCD7CC', boardSideDark: '#C4BFB4',
      sand: '#ECE9E2', water: '#A6D3F7', waterDeep: '#93C8F3', waterLine: '#C2E2FA',
      green: '#CDE9C3', greenDark: '#B5DDA8',
      road: '#FFFFFF', roadMajor: '#FFE9A8', roadCasing: '#D9D4CA',
      tree: ['#A6D59A', '#97CC8B', '#B3DCA7'], trunk: '#B9A58C',
      sequoia: ['#F2B65A', '#F4C66E', '#EBA44A'],
      flowers: ['#FF8FB8', '#FFD36B', '#C7A8FF', '#FFFFFF'], reed: '#DCCFA8',
      buildings: ['#E6E6EC', '#DFE0E8', '#EAE8EF', '#E2E5EC', '#E8E3EA'], roof: '#D6D7E0',
      backdrop: '#DCE6EF',
      bldH: 0.55, treeScale: 0.7, roofs: false, paper: false, layerShadow: 0, hemi: 2.4, sun: 0.9,
    },
    route: {
      full: '#2E7BFF', fullGlow: '#8DB8FF', half: '#FF4FA0', halfGlow: '#FF9CC8',
      edge: '#FFFFFF', passedGray: true, bridge1: '#2E7BFF', bridge2: '#FF5A4E',
    },
    crab: { outline: '#FFFFFF', male: '#2E7BFF', female: '#FF4FA0', blush: '#FF9A9A', belly: '#FFFFFF' },
    hud: {
      panel: '#FFFFFF', panel2: '#F2F5FA', stroke: '#FFFFFF', text: '#1F2D3D', sub: '#7A8799',
      gold: '#FFB020', red: '#FF5A4E', green: '#20B86A', ink: '#1F2D3D', card: '#FFFFFF',
      shadow: 'rgba(30,50,90,.16)', overlayFilter: 'drop-shadow(0 6px 10px rgba(30,50,90,.22))',
    },
    arch: { post: ['#1F63E0', '#6FA4FF', '#2E7BFF'], tag: '#FFFFFF', tagText: '#1F2D3D', title: '#FFFFFF' },
    venue: { roadTex: 'none', road: '#CED1D6', asphaltOp: 1, asphalt: '#CED1D6', plaza: '#F1F1EE', city: '#E6E4DE', tent: '#F6B24B', stage: '#3B6FD4', bldg: '#DCDDE3', crowd: ['#FFFFFF', '#F2C14E', '#2E7BFF', '#FF4FA0', '#42C08A', '#E8E8EC'] },
    sticker: { frame: 'navi' },
    font: { cn: "'HMSans', 'Microsoft YaHei', sans-serif", title: "'HMSans', 'Microsoft YaHei', sans-serif", num: "'FigtreeX', 'HMSans', sans-serif" },
  },

  // ── C 剪纸：宣纸底、红纸板边、层层纸影；靛蓝=全马、桃红=半马
  papercut: {
    key: 'papercut',
    map: {
      board: '#F1E2C2', boardSide: '#B8322C', boardSideDark: '#7A1E1A',
      sand: '#E4C893', water: '#3AA39B', waterDeep: '#22857F', waterLine: '#8ED8CC',
      green: '#86B463', greenDark: '#5E9446',
      road: '#FBF4E4', roadMajor: '#FBF4E4', roadCasing: '#C9A56A',
      tree: ['#4E8F4A', '#6AA455', '#3C7A45'], trunk: '#7A4A2A',
      sequoia: ['#E0892B', '#C8632A', '#EFB13A'],
      flowers: ['#E8508A', '#F2B33D', '#C8352E', '#FFF6E0'], reed: '#C9A86E',
      buildings: ['#F7EEDB', '#F2E4C8', '#EADAB8', '#F6E9D2', '#EFE0C4'], roof: '#C8352E',
      backdrop: '#6E1B17',
      bldH: 0.8, treeScale: 1, roofs: true, paper: true, layerShadow: 3.2, hemi: 2.0, sun: 1.3,
    },
    route: {
      full: '#2D4FA3', fullGlow: '#8199DA', half: '#E8508A', halfGlow: '#F7A3C4',
      edge: '#FFF6E0', passedGray: false, bridge1: '#2D4FA3', bridge2: '#C8352E',
    },
    crab: { outline: '#4A1612', male: '#2D4FA3', female: '#E8508A', blush: '#F28A8A', belly: '#FFF6E0' },
    hud: {
      panel: '#B8322C', panel2: '#9E2723', stroke: '#F6E3BC', text: '#FFF6E0', sub: '#F2CDA0',
      gold: '#F2B33D', red: '#C8352E', green: '#4E8F4A', ink: '#4A1612', card: '#FFF6E0',
      shadow: 'rgba(60,15,10,.35)', overlayFilter: '',
    },
    arch: { post: ['#8E1F1A', '#E2574C', '#C8352E'], tag: '#F2B33D', tagText: '#4A1612', title: '#FFF6E0' },
    venue: { roadTex: 'fibre', road: '#A98A63', asphaltOp: 1, asphalt: '#A98A63', plaza: '#F0DCB6', city: '#D9C39C', tent: '#E9A03A', stage: '#B8322C', bldg: '#EFE3C6', crowd: ['#FFF6E0', '#F2B33D', '#C8352E', '#4E8F4A', '#D9A05B', '#F7EEDB'] },
    sticker: { frame: 'paper' },
    font: { cn: "'HMSans', 'Microsoft YaHei', sans-serif", title: "'NotoSerifX', 'HMSans', serif", num: "'FigtreeX', 'HMSans', sans-serif" },
  },
};

function pickStyle() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('style');
    if (q && STYLES[q]) return q;
    if (globalThis.__STYLE && STYLES[globalThis.__STYLE]) return globalThis.__STYLE;
  } catch (e) { /* node 环境 */ }
  return DEFAULT_STYLE;
}

export const STYLE = pickStyle();
/** 赛事全称（客户 2026-11-08 第④条）：画面上所有赛事名一律用带冠名的全称 */
// 赛事全称不再写死在这里 —— 统一从赛事包的身份层取（race.js）
import { RACE } from '../race.js';
export const BRAND = RACE.brand;
export const RACE_META = RACE;

export const THEME = { ...COMMON, ...STYLES[STYLE] };
export const ALL_STYLES = Object.keys(STYLES);
