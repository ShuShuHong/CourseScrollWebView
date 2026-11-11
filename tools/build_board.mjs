// 分镜表：src/pages/board.js → dist/分镜表.html（文件名带中文，客户直接开这个）
//   node tools/build_board.mjs
// 以前是手工 `node tools/build.mjs board` 再改名的 —— 换音轨后很容易忘记重出，这里固定成一条命令。
import path from 'node:path';
import { buildPage } from './build.mjs';

await buildPage('board', { minify: true, outName: '分镜表' });
