// 赛道沿途地名（路名）—— 客户 2026-11-01：
//   「吉祥物经过的道路上都在经过的路段的中间位置添加地名标签，我看有的道路没添加」
//
// 口径（与之前那版最大的不同）：
//   旧版 ROAD_LABELS 是**官方图上的取字点**（pt 坐标 + 一串 km），只在吉祥物离该点 ±1.4 km 内才画，
//   于是「没取到字点」或者「取到的字点离赛道太远」的路段就没有标签，看起来像漏了。
//   现在改成**沿赛道切段**：把整条全马航线按“锚点”分成若干连续区段（Voronoi），
//   每个区段取**区段中点**（沿路线的弧长中点）作为标签位置 —— 也就是“经过路段的中间位置”，
//   且**任何一公里都必有标签**（区段首尾相接，不留缝）。
//
//   锚点 = 官方图上能确认的路名 + 台词里点名、且位置能确认的路名（澜湾北路 / 云澜街 / 银杏大道）。
//   km 一律是**全马路线的里程**；半马视图用 halfToFull() 换算后查同一张表。

/** 锚点：name = 路名，km = 该路名在**全马**路线上的里程，route = 'both' 共用 / 'full' 仅全马 */
export const ROAD_ANCHORS = [
  { name: '星湖南路', km: 0.38 },
  { name: '澜渚路', km: 1.54 },
  // 客户 2026-11-01（第七批）城区段三处对调/改名：
  //   ① 青云街 去掉（这个位置官方图上印的根本不是青云街）
  //   ② 原来叫「云澜街」那处（≈3.1 km）改成 **镜湖南路**
  //   ③ 「云澜街」搬到原「澜兴路」的位置（≈3.84 km）
  //   ④ 「澜兴路」再往后挪到**两块绿地之间**（≈5.40 km）
  { name: '镜湖南路', km: 3.10, labelAt: 3.10 },
  { name: '云澜街', km: 3.84, labelAt: 3.84 },
  { name: '澜兴路', km: 5.40, labelAt: 5.40 },
  { name: '集贤街', km: 5.90 },
  { name: '望湖路', km: 6.20 },
  { name: '环湖大道', km: 7.46 },
  // 桥两次都过：标签钉在**桥面上**（course.json 的 pass1 8.001–8.539 / pass2 18.311–18.849 中点）
  { name: '云澜大桥', km: 8.27, labelAt: 8.27 },
  { name: '湖影路', km: 9.65 },
  { name: '悦水路', km: 10.81 },
  { name: '银杏大道', km: 11.90 },
  // 客户 2026-11-01（第七批）：闻莺路要**在 12.5 公里处** ⇒ 取消上一批的 88 m 南移。
  //   压公里牌的问题已经由层序解决（公里牌单独成层、画在路名之后），不需要靠位置躲。
  { name: '闻莺路', km: 12.49, labelAt: 12.49 },
  // 客户 2026-11-01（第八批）：**15–16 km 那个「闻莺路」删掉**，全片只保留 12.5 处那一个。
  //   原来这里是悦水湾环线（13–16.5）的第二个同名锚点，客户要求去掉；
  //   这一段的路名由「银杏大道 11.90」与「云澜大桥 18.58」之间的自然间隔承担，
  //   闻莺路的段窗口于是回到 12.195–16.89（只有 12.5 一个标签）。
  { name: '云澜大桥', km: 18.58, labelAt: 18.58 },
  // 台词「下桥约19.5公里，澜湾北路折返」——折返点就落在澜湾北路上
  { name: '澜湾北路', km: 19.55 },
  { name: '环湖大道', km: 20.14 },
  { name: '柳堤南路', km: 21.40 },
  // 客户 2026-11-01（第七批）：**23–35 km 的「柳堤南路」全部去掉** ——
  //   东岸堤顶那一段画面上不贴任何路名（noLabel = 这一段只占里程、不出标签）。
  //   两个 noLabel 锚点把 23.0–34.9 夹出来，前后的 21.4 与 36.6 仍然各有一个标签。
  //   锚点取 24.60 / 33.40：Voronoi 分界 = 相邻两锚点中点 ⇒ 空白的边界正好是 **23.00 → 35.00**
  { name: '柳堤南路', km: 24.60, noLabel: true },
  { name: '柳堤南路', km: 33.40, noLabel: true },
  { name: '柳堤南路', km: 36.60, repeat: true },
  { name: '科创大道', km: 38.68, labelAt: 38.68 },
  // 客户 2026-11-01（第七批）：回程这段「环湖大道」改叫 **柳堤南路**
  //   （官方图上柳堤南路的北端就落在 40.7 一带，回程正好从它东侧绕过来）。
  //   锚点仍取 41.00 / 41.80 ⇒ Voronoi 分界 41.40 正好是右转进星湖南路的路口。
  { name: '柳堤南路', km: 41.00, labelAt: 40.60 },
  { name: '星湖南路', km: 41.80 },
];

const byKm = [...ROAD_ANCHORS].sort((a, b) => a.km - b.km);

/**
 * 沿路线切段（Voronoi）：第 i 段覆盖 [mid(prev,cur), mid(cur,next)]，
 * 标签位置 = 该段中点；段与段首尾相接一直到 42.195。
 * 返回 [{ name, km0, km1, km }]（km = 标签所在里程 = 段中点）
 */
export function roadCells(len = 42.195) {
  const out = [];
  for (let i = 0; i < byKm.length; i++) {
    const a = byKm[i];
    const lo = i === 0 ? 0 : (byKm[i - 1].km + a.km) / 2;
    const hi = i === byKm.length - 1 ? len : (a.km + byKm[i + 1].km) / 2;
    out.push({
      name: a.name, km0: +lo.toFixed(4), km1: +hi.toFixed(4),
      km: +(a.labelAt != null ? a.labelAt : (lo + hi) / 2).toFixed(4),
      labelAt: a.labelAt, repeat: !!a.repeat,
      // noLabel = 这一段只占里程、不出标签（客户 2026-11-01：23–35 km 的东岸堤顶不贴路名）
      noLabel: !!a.noLabel,
      // dLat = 这条路的标签整体向南（世界 +z）平移多少米（备用微调）
      dLat: a.dLat || 0,
    });
  }
  return out;
}

/** 覆盖度自检：相邻段必须严丝合缝、末端 = 42.195 */
export function roadCoverage(len = 42.195) {
  const c = roadCells(len);
  const bad = [];
  if (Math.abs(c[0].km0) > 1e-6) bad.push(`首段不从 0 开始：${c[0].km0}`);
  for (let i = 1; i < c.length; i++) {
    if (Math.abs(c[i].km0 - c[i - 1].km1) > 1e-6) bad.push(`第 ${i} 段与上一段之间有缝 ${c[i - 1].km1}→${c[i].km0}`);
    if (!c[i].noLabel && (c[i].km <= c[i].km0 || c[i].km >= c[i].km1)) bad.push(`第 ${i} 段的中点 ${c[i].km} 不在区间内`);
  }
  if (Math.abs(c[c.length - 1].km1 - len) > 1e-6) bad.push(`末段不到 ${len}：${c[c.length - 1].km1}`);
  return { cells: c, bad };
}

/**
 * 真正要画的标签：**区段过长时拆成多个同名标签**，每个最多管 SPAN 公里。
 *   为什么要拆：东岸堤顶那一段「柳堤南路」长 8.6 km，只放一个居中的标签时，
 *   吉祥物跑到段头，标签已经在 8 km 之外、根本不在画里 —— 等于还是没有标签。
 *   拆开之后每一小段都有自己的标签、而且都在自己小段的中间。
 * 返回 [{ name, km, t0, t1 }]：km = 标签所在里程，[t0,t1] = 它在屏上的里程窗口。
 */
export const LABEL_SPAN = 2.4;
export function roadLabels(len = 42.195, span = LABEL_SPAN) {
  const out = [];
  for (const c of roadCells(len)) {
    if (c.noLabel) continue;                 // 客户：这一段不出标签（里程仍然被它占着）
    const L = c.km1 - c.km0;
    const n = c.repeat ? Math.max(1, Math.ceil(L / span - 1e-9)) : 1;
    const step = L / n;
    for (let i = 0; i < n; i++) {
      const t0 = c.km0 + step * i, t1 = c.km0 + step * (i + 1);
      // labelAt = 该路名的**真实位置**（桥面中点等）；缺省就用小段中点
      const km = c.labelAt != null ? c.labelAt : (t0 + t1) / 2;
      out.push({ name: c.name, km: +km.toFixed(4), t0: +t0.toFixed(4), t1: +t1.toFixed(4), dLat: c.dLat || 0 });
    }
  }
  return out;
}
export const SPLIT_ROADS = { half: '星湖南路', full: '环湖大道' };  // 分流路牌两侧路名（引擎 annotations.js 读取）
