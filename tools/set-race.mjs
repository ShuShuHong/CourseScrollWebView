// 切换赛事包：把 src/config/*.js 的 13 个转发壳指向 races/<id>/config/
//   npm run race                 → 列出所有赛事包 + 当前激活的是哪个
//   npm run race berlin-2026     → 切过去（校验目录齐全后原子替换）
//
// 为什么用「重写壳」而不是运行时动态 import：
//   全仓库（engine/art/pages/tools）有 200+ 处 `from '../config/story.js'`，
//   静态 `export *` 能让这些 import 一个字都不用改；而 ESM 的 export * 不能在运行时
//   换目标（没有条件重导出），所以切换必须落到文件上。代价是切换后要重建（本来也要重建）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RACES = path.join(ROOT, 'races');
const CFG = path.join(ROOT, 'src', 'config');

/** 落在赛事包里、需要一壳一文件的配置（新增配置要同步加到这里） */
export const PACK_FILES = [
  'theme', 'story', 'schedule', 'voice', 'vo1031', 'inserts',
  'roads', 'labels', 'keyframes', 'sfx', 'bgm', 'split', 'venue',
];

const list = () => fs.readdirSync(RACES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(RACES, d.name, 'race.js')))
  .map((d) => d.name);

/** 落在赛事包里、同样需要转发壳的 **art** 模块（引擎/页面 import 的是壳） */
export const PACK_ART = ['crab'];

/** 检查一个包是否齐全：race.js + config/ 下 13 个文件 + art/ 下兜底角色 + mascots/ 素材 */
export function validatePack(id) {
  const bad = [];
  const dir = path.join(RACES, id);
  if (!fs.existsSync(path.join(dir, 'race.js'))) bad.push('缺 race.js（身份层）');
  for (const n of PACK_FILES) {
    const f = path.join(dir, 'config', `${n}.js`);
    if (!fs.existsSync(f)) bad.push(`缺 config/${n}.js`);
  }
  for (const n of PACK_ART) {
    if (!fs.existsSync(path.join(dir, 'art', `${n}.js`))) bad.push(`缺 art/${n}.js（矢量兜底角色）`);
  }
  if (!fs.existsSync(path.join(dir, 'mascots', 'cut.json'))) bad.push('缺 mascots/cut.json（角色素材锚点表）');
  return bad;
}

export function setRace(id) {
  const bad = validatePack(id);
  if (bad.length) throw new Error(`赛事包 ${id} 不完整：\n  - ${bad.join('\n  - ')}`);
  for (const n of PACK_FILES) {
    fs.writeFileSync(path.join(CFG, `${n}.js`),
      `// ⚠️ 模板结构：真正的实现已移到赛事包 races/${id}/config/${n}.js\n`
      + `//   这里只是转发壳 —— 换一场赛事只改 src/config/active-race.js，全仓 import 路径不用动。\n`
      + `export * from '../../races/${id}/config/${n}.js';\n`, 'utf-8');
  }
  // art/ 的转发壳（crab.js 等赛事包的矢量兜底）
  for (const n of PACK_ART) {
    fs.writeFileSync(path.join(ROOT, 'src', 'art', `${n}.js`),
      `// ⚠️ 模板结构：角色矢量兜底在赛事包 races/${id}/art/${n}.js
`
      + `//   这里只是转发壳 —— 换一场赛事只改 src/config/active-race.js，全仓 import 路径不用动。
`
      + `export * from '../../races/${id}/art/${n}.js';
`, 'utf-8');
  }
  fs.writeFileSync(path.join(CFG, 'active-race.js'),
    `// 当前激活的赛事包 —— 由 \`npm run race <id>\`（tools/set-race.mjs）改写。\n`
    + `// 引擎与页面**不直接** import 这里：它们 import src/config/<name>.js 的转发壳，\n`
    + `// 壳里指向 races/<id>/config/<name>.js。换赛事 = 重写那 13 个壳，全仓 import 路径不动。\n`
    + `export const ACTIVE_RACE = '${id}';\n`, 'utf-8');
  return id;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  // 用读文件 + 正则取当前 id：动态 import 绝对 Windows 路径要 pathToFileURL，不如直接读
  const cur = (fs.readFileSync(path.join(CFG, 'active-race.js'), 'utf-8').match(/ACTIVE_RACE\s*=\s*'([^']+)'/) || [])[1] || '(未知)';
  const want = process.argv[2];
  if (!want) {
    console.log(`当前激活：${cur}\n可用赛事包：`);
    for (const id of list()) {
      const bad = validatePack(id);
      console.log(`  ${id === cur ? '*' : ' '} ${id}${bad.length ? '  ⚠ ' + bad.join('；') : ''}`);
    }
    process.exit(0);
  }
  const got = setRace(want);
  console.log(`✓ 已切到 ${got}（13 个转发壳已重写）—— 记得 npm run preview 重建`);
}
