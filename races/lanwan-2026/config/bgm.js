// ════════════════════════════════════════════════════════════════════════
//  BGM 剪裁计划（客户 2026-11-03：给的是 2:48 的整曲，要按节奏剪成 76.81 s）
//
//  原曲实测（tools/bgm_analyze.py）：95.70 BPM、一小节 2.5078 s、共 66 小节、
//  首拍 0.302 s。结构：1–3 intro / 4–12 A / 13–19 B / 20–28 C / 29–32 收 /
//  33–37 build / 38–49 副歌（最厚）/ 50–53 最高潮 / 54–56 breakdown / 57–65 outro。
//
//  输出网格：一小节 2.5100 s ⇒ **30 小节 = 75.30 s**，再接 1.51 s 尾音 = **76.81 s**
//  （与原曲 2.5078 只差 0.09%，等于不改速，听不出拉伸）。
//  选这个网格是因为它让**蓝蓝撞线 65.26 s 正好落在第 26 小节之后的正拍**（65.26），
//  主舞台 62.75 也刚好卡在第 25 小节。
// ════════════════════════════════════════════════════════════════════════
// 客户 2026-11-04 撤销 BGM：**不进成片、不进预览器、不进混音**。
//   这里只留一条路径给设定集/试听用。原 31 MB 的 wav 已转成 192k mp3（4 MB）——
//   要重新混音请用 `ffmpeg -i audio/bgm-希望的新篇章2.mp3 -ar 48000` 转回去。
export const BGM_SRC = 'audio/bgm-希望的新篇章2.mp3';
export const BGM_SRC_BAR = 2.5078;      // 原曲一小节
export const BGM_SRC_T0 = 0.302;        // 原曲首拍
export const BGM_BAR = 2.510;           // 输出一小节
export const BGM_BARS = 30;             // 30 小节 = 75.30 s
export const BGM_TAIL = 1.51;           // 尾音（原曲最后一小节的余韵）
export const BGM_LEN = +(BGM_BARS * BGM_BAR + BGM_TAIL).toFixed(2);   // 76.81

// 每块：原曲从第几小节取、取几小节、放到输出第几秒（由前面累加得出）
//   why = 这段音乐在片子里对应什么
export const BGM_BLOCKS = [
  { id: 'b1', srcBar: 1, bars: 3, out: 0.00, why: '片头：加载 + 赛道点亮 + 主会场（原曲 intro，只有垫底与稀疏钢琴）' },
  { id: 'b2', srcBar: 4, bars: 4, out: 7.53, why: '城区段：低音进、律动establish（第一枪落在 intro 尾巴上，第二枪与 GO 落在律动里）' },
  { id: 'b3', srcBar: 13, bars: 4, out: 17.57, why: '第一次上云澜大桥：低频加厚、亮度上来（桥顶 25.45 s 在第 10 小节内）' },
  { id: 'b4', srcBar: 54, bars: 2, out: 27.61, why: '下桥 → 银杏 → 悦水湾：用原曲的 breakdown（低频掉 10 dB），把画面让给湖水与鸟声' },
  { id: 'b5', srcBar: 57, bars: 3, out: 32.63, why: '二次上桥（爬升）：breakdown 之后的 rebuild，音色转暗、低频回来 = 爬坡' },
  { id: 'b6', srcBar: 38, bars: 4, out: 40.16, why: '分流 → 分屏 → 湾湾冲线：原曲副歌入口，全乐队进来（撞线 48.44 在第 19 小节后半）' },
  { id: 'b7', srcBar: 42, bars: 5, out: 50.20, why: '全马环湖（22.6–28.9 滨湖公园 → 29.1 折返 → 40–41 湿地）：副歌持续段，开阔耐听' },
  { id: 'b8', srcBar: 49, bars: 5, out: 62.75, why: '终点前 → 蓝蓝撞线 65.26（第 26 小节正拍）→ 主舞台 62.75 起：原曲最响的 5 小节' },
];
export const BGM_TAIL_SRC = 166.65;     // 尾音取自原曲最后 1.51 s

// 片子上的关键点（用来核对“段落切换有没有踩到戏”）
export const BGM_LANDMARKS = [
  { t: 6.42, name: 'A/B 区发枪' },
  { t: 8.02, name: 'C 区第二枪' },
  { t: 8.64, name: 'GO 起跑' },
  { t: 17.02, name: '第一次上桥' },
  { t: 25.45, name: '桥顶 26 m' },
  { t: 27.00, name: '下桥' },
  { t: 34.02, name: '二次上桥' },
  { t: 41.13, name: '分屏展开' },
  { t: 48.44, name: '湾湾撞线' },
  { t: 51.70, name: '分屏收回' },
  { t: 62.60, name: '主舞台' },
  { t: 65.26, name: '蓝蓝撞线' },
  { t: 76.81, name: '落版' },
];

export const bgmBlockAt = (t) => BGM_BLOCKS.find((b) => t >= b.out && t < b.out + b.bars * BGM_BAR) || null;
