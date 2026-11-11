// 当前激活的赛事包 —— 由 `npm run race <id>`（tools/set-race.mjs）改写。
// 引擎与页面**不直接** import 这里：它们 import src/config/<name>.js 的转发壳，
// 壳里指向 races/<id>/config/<name>.js。换赛事 = 重写那 13 个壳，全仓 import 路径不动。
export const ACTIVE_RACE = 'lanwan-2026';
