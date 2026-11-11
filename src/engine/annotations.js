// 地图标注层（每个视口）：公里牌、路名、功能点弹出、地标贴纸、折返牌、分流箭头、终点直道
import { stationRow, kmBadge, uturnSign, stationCard } from '../art/icons.js';
import { stickerSVG } from '../art/stickers.js';
import { easeOutBack, clamp, smooth, esc } from '../art/svg.js';
import { THEME } from '../config/theme.js';
import { roadLabels, SPLIT_ROADS } from '../config/roads.js';
import { nameScale } from '../config/view.js';
import { KM_BADGES, STATION_POP, ELEV_WIN } from '../config/story.js';
import { subtitleAt } from './timeline.js';
import { FULL, HALF, COURSE, liftAt, fullToHalf, halfToFull } from './course.js';
import { activeEvents, activeStickers, stickerWindows, stations, cardsAt } from './timeline.js';
import { pill, pillW, grp, T, f, OUT, LINE, HUD, FONT, Z, textW } from './ui.js';

const R = THEME.route;
// 左下角海拔窗（不透明面板）：窗口可见期间，落在这个矩形里的地图标注一律不画。
// 否则标签从面板边缘滑出时会露出半截，看起来像渲染错误。
// 边距要吃掉胶囊/牌子自身的宽高（±70 / ±34），否则“中心在面板外、边缘伸进去”还是会被切
const ELEV_RECT = { x0: -40, x1: 620, y0: 702, y1: 1012 };
const inElevRect = (p, t) =>
  t >= ELEV_WIN.t0 - 0.45 && t <= ELEV_WIN.t1 + 0.45 &&
  p.x > ELEV_RECT.x0 && p.x < ELEV_RECT.x1 && p.y > ELEV_RECT.y0 && p.y < ELEV_RECT.y1;

const inRect = (p, r, m = 0) => p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m;

/** 公里牌：在螃蟹前方 1.5 km 内与身后 0.6 km 内显示；走过时“叮”一下放大 */
export function drawKm(w, st, view, lift, out) {
  if (!KM_BADGES.show) return;
  const r = view.rect;
  const list = [];
  if (view.crabs.includes('male')) for (const b of COURSE.km_badges) list.push({ km: b.km, route: FULL, key: 'full', ref: st.male.km, color: R.full });
  if (view.crabs.includes('female') && !view.crabs.includes('male')) for (const b of COURSE.half_badges) list.push({ km: b.km, route: HALF, key: 'half', ref: st.female.km, color: R.half });
  for (const b of list) {
    if (b.key === 'full' && KM_BADGES.hide.some(([a, z]) => b.km >= a && b.km <= z)) continue;
    const d = b.km - b.ref;
    if (d > 1.6 || d < -0.7) continue;
    const op = clamp((1.6 - d) / 0.4) * clamp((d + 0.7) / 0.3);
    const P = b.route.pos(b.km), D = b.route.dir(b.km);
    const off = 13;                                        // 牌子立在路的右侧
    const p = w.project(P[0] - D[1] * off, P[1] + D[0] * off, liftAt(b.key, b.km, lift));
    if (!p.ok || !inRect(p, r, 40)) continue;
    if (inElevRect({ x: p.x, y: p.y - 60 }, st.t)) continue;   // 按牌子实际位置判（画在锚点上方 56px）
    const ding = d < 0 ? Math.max(0, 1 - (-d) / 0.12) : 0;
    const sc = clamp(p.ppp * 2.2, 0.55, 1.15) * (1 + ding * 0.35);
    // 记下这一帧真的画出来的公里牌：功能点图标簇要借它的杆子+牌面当引线箭头，
    // 所以必须用“实际画出来的那块牌”的坐标与缩放，不能另算一遍。
    // op ≤ 0.002 时 grp() 会把整块丢掉（DOM 里根本没有），这种“看不见的牌”不能记，
    // 否则补给卡的引线会指向一块不存在的牌子（实测差 100px）。
    if (op > 0.002) (view._km ||= {})[`${b.key}:${b.km}`] = { x: p.x, y: p.y, sc };
    out.push(grp(T(p.x, p.y, sc), `<path d="M 0 0 V -34" stroke="${OUT}" stroke-width="5"/><g transform="translate(0 -56)">${kmBadge(b.km, b.color)}</g>`, op), ...Z(p));
  }
}

/**
 * 地名（路名）—— 客户 2026-11-01：**每条经过的路，在它那一段的中间位置放标签**。
 *
 *  旧做法：用官方图上的取字点（ROAD_LABELS 的 pt）+ ±1.4 km 邻近显隐 ⇒
 *    没取到字点 / 字点离赛道太远的路段就整段没有标签（客户说的“有的道路没添加”）。
 *  新做法：`src/config/roads.js` 沿赛道把全程切成连续区段（Voronoi），
 *    每个区段（过长则再均分）把标签画在**该段中点**的路面上，显隐窗口 = 该段本身。
 *    于是任何一公里都必有一个正确路名的标签，而且就在当段的中间。
 */
export function drawRoadNames(w, st, view, out) {
  const r = view.rect;
  const half = !view.crabs.includes('male');
  const route = half ? HALF : FULL;
  const ref = half ? st.female.km + 0.15 : st.male.km;
  // 半马：把半马里程换回全马里程再查同一张区段表（分流前后都在共线段上）
  const refFull = half ? halfToFull(ref) : ref;
  const bridgeOn = activeEvents(st.t, 'bridge').length > 0;
  // 客户 2026-11-01：地名（路名）字号可调，系数来自右侧控制区的滑块（默认 1.0）
  const K = nameScale();
  const fs = 22 * K, pad = 12 * K, pillH = fs * 1.7;
  // 胶囊宽度按字数估（中文 1 字 ≈ 1.0 em，两端各一个 pad，再加外描边余量）
  const labW = (name) => String(name).length * fs + pad * 2 + 8;
  for (const L of roadLabels()) {
    // 显隐 = 螃蟹是否在**这一段**里（边缘 0.22 km 淡入淡出）
    const inside = refFull >= L.t0 && refFull <= L.t1;
    const near = inside ? 0 : Math.min(Math.abs(refFull - L.t0), Math.abs(refFull - L.t1));
    const op = inside ? 1 : clamp(1 - near / 0.22);
    if (op <= 0) continue;
    if (L.km > route.len + 1e-6) continue;          // 半马跑不到这么远
    // 过桥时「云澜大桥」这块牌子原来**整块不画**（怕横穿塔腿、而且右上信息卡写着桥名）。
    //   客户 2026-11-01：不许整段没有地名 ⇒ 改成把它挪到**螃蟹脚下的桥面**上（塔在头顶，不撞）；
    //   第一次过桥有桥卡，仍然让桥卡说话（那一段不画），第二次过桥没有卡，就靠这块牌子。
    const bridgeLabel = L.name.includes('桥');
    if (bridgeOn && bridgeLabel && L.km < 12) continue;
    // 位置：**就贴在本段路面上**（客户 2026-11-01 傍晚：不用躲螃蟹，被螃蟹盖住没关系）。
    //   所以锚点 = 本段中点（`labelAt` 指定过的用指定点：桥面 8.27 / 18.58、创新大道 38.68），
    //   不再按螃蟹位置左右滑、也不再在屏幕上让开角色。
    //   唯一还会动的情况：中点被机位推出画框 —— 这时沿**本段路面**挪到离中点最近的可视点，
    //   仍然压在路上，只是不躲人（否则整条路一个字都看不见）。
    //   dLat：整条路名的标签向南（世界 +z = 图面下）让开多少米 —— 只动标签，不动赛道与公里牌
    const dLat = L.dLat || 0;
    const at = (km) => {
      const q = half ? HALF.pos(Math.min(route.len, km)) : FULL.pos(km);
      return dLat ? [q[0], q[1] + dLat] : q;
    };
    const onRoad = (km) => {
      const q = w.project(...at(km), 0);
      return q.ok && inRect(q, r, -40) ? q : null;
    };
    let p = onRoad(L.km);
    if (!p) {
      const span = Math.max(0.0, L.t1 - L.t0);
      const n = Math.max(8, Math.ceil(span / 0.1));
      let bestD = Infinity;
      for (let i = 0; i <= n; i++) {
        const k = L.t0 + (span * i) / n;
        const q = onRoad(k);
        if (!q) continue;
        const d = Math.abs(k - L.km);
        if (d < bestD) { bestD = d; p = q; }
      }
    }
    if (!p) continue;
    // 客户 2026-10-27 口径：路名只在“被螃蟹挡住”时才允许看不见，别的东西不许盖它。
    // 与同期字幕条（y 896–984）压在一起时整块抬起来——是抬起来，不是消失。
    // 放大后胶囊变高，判据按**胶囊自身的上下边**算，否则 k≥2 时会压住字幕。
    let px2 = p.x;
    let py = p.y - 44 * K;
    if (py + pillH / 2 > 884 && py - pillH / 2 < 996) py = 884 - pillH / 2 - 4;
    // 与左下角海拔窗重叠：抬到窗子上沿之上再判一次（客户 2026-11-01：不许整帧没有地名）
    if (inElevRect({ x: p.x, y: py }, st.t)) {
      const py2 = ELEV_RECT.y0 - pillH / 2 - 6;
      if (inElevRect({ x: p.x, y: py2 }, st.t)) continue;
      py = py2;
    }
    // 分屏时上半屏要放“半马·母蟹 / 全马·公蟹”标题，路名胶囊让开这条带
    if (st.split > 0.02 && py < 215) continue;
    // 补给/功能点卡片：卡片文字只允许被螃蟹遮挡 ⇒ 路名胶囊让开（先左右，再上下）
    const cards = (view._cards || []).map((c) => ({ x0: c.x - c.hw, x1: c.x + c.hw, y0: c.y - c.hh - 10, y1: c.y + c.hh + 10 }));
    const hitsCard = (x, y) => {
      const w2 = labW(L.name) / 2, h2 = pillH / 2;
      return cards.some((c) => x + w2 > c.x0 && x - w2 < c.x1 && y + h2 > c.y0 && y - h2 < c.y1);
    };
    if (hitsCard(p.x, py)) {
      const LW = labW(L.name);
      const tries = [[0, -(pillH + 26)], [0, pillH + 26], [-1 * (LW + 30), 0], [LW + 30, 0],
        [-1 * (LW + 30), -(pillH + 26)], [LW + 30, -(pillH + 26)]];
      let done = false;
      for (const [dx, dy] of tries) {
        const nx = p.x + dx, ny = py + dy;
        if (nx < r.x + 60 || nx > r.x + r.w - 60 || ny < 46 || ny > r.y + r.h - 40) continue;
        if (nearSub(ny - pillH / 2, ny + pillH / 2)) continue;
        if (inElevRect({ x: nx, y: ny }, st.t) || hitsCard(nx, ny)) continue;
        px2 = nx; py = ny; done = true;
        break;
      }
      if (!done) continue;       // 实在没地方放：宁可这一帧不画，也不许盖住卡片文字
    }
    out.push(grp(T(px2, py), pill(0, 0, L.name, { fs, fill: 'rgba(255,255,255,.94)', color: HUD.ink, stroke: OUT, sw: 2.5 * K, pad }), op * 0.95));
  }
}

/**
 * 功能点（补给点）图标簇 —— 客户 2026-10-27 口径：
 *   ① 整组（卡片 + 虚线 + 箭头）画在**角色下层**：director 把它送进 marks，角色跑过时自然压在它前面；
 *   ② 显隐只由距离决定：螃蟹离点位 STATION_POP.radius（2 km）内出现，跑出 2 km 自动消失，全片同一个特性；
 *   ③ 引线必须落到赛道边的真实落点上。与公里牌重合时，直接借那块牌的杆子 + 牌面当引线和箭头
 *      （牌面就是箭头，不再另画一个针尖指着一块牌子）；
 *   ④ 卡片钉死在地图上（该落点正上方固定像素），不逐帧避让、不随镜头推拉上下滑——那才是“漂移”的来源。
 */
/** 字幕条在 1920×1080 设计坐标里的竖向范围（hud.js：中心 940、高 88） */
const SUB_BAND = [896, 984];
const nearSub = (a, b) => b > SUB_BAND[0] && a < SUB_BAND[1];

export function drawStations(w, st, view, lift, out) {
  const r = view.rect;
  const key = view.id === 'left' ? 'half' : 'full';
  const route = key === 'half' ? HALF : FULL;
  const refKm = key === 'half' ? st.female.km : st.male.km;
  const RAD = STATION_POP.radius, FADE = STATION_POP.fade, LIFT = STATION_POP.lift;
  const cands = stations()
    .filter((s) => !(view.id === 'left' && !s.half))
    .filter((s) => s.km <= route.len + 1e-6)
    .map((s) => ({ s, d: s.km - refKm }))
    .filter((c) => Math.abs(c.d) <= RAD)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));      // 近的先占位，远的让开（只跳过，不挪动）
  const placed = [];
  // 客户口径「卡片文字只能被螃蟹遮挡」⇒ 把这一帧实际放下的卡片矩形记下来，
  //   路名层（drawRoadNames）据此避让（客户 2026-11-01：闻莺路曾盖住「12.5km 补给」）
  view._cards = placed;
  for (const { s, d } of cands) {
    const op = clamp((RAD - Math.abs(d)) / FADE);
    if (op <= 0.004) continue;
    const P = route.pos(s.km), D = route.dir(s.km);
    // 落点与公里牌同侧、同偏移（13）：只有这样两者才会严丝合缝地重合
    const a = w.project(P[0] - D[1] * 13, P[1] + D[0] * 13, liftAt(key, s.km, lift));
    if (!a.ok) continue;
    const row = stationRow(s.services, 58);
    const hw = row.width / 2 + 16, hh = 48;
    const cx = a.x, cy = a.y - LIFT;
    // 整块在画内才画。不做横向挤压——挤一下就成了“卡片追着角色漂”
    if (cx - hw < r.x + 6 || cx + hw > r.x + r.w - 6) continue;
    if (cy - hh < r.y + 6 || cy + hh > r.y + r.h - 6) continue;
    if (inElevRect({ x: cx, y: cy }, st.t)) continue;          // 压在海拔窗底下＝看不见，别画
    // 2026-11-08：字幕条是不透明白条，压过去整块就废了。此刻**真有字幕**时：
    //   · 图标行（cy±38）被盖掉过半 ⇒ 整簇不画（和“压海拔窗”同一条道理）
    //   · 站名标签（cy−74…cy−30）被盖住 >2px ⇒ 只省掉标签，图标照留
    const hasSub = subtitleAt(st.t).length > 0;
    if (hasSub && (Math.min(cy + 38, SUB_BAND[1]) - Math.max(cy - 38, SUB_BAND[0])) > 76 * 0.5) continue;
    if (placed.some((c) => Math.abs(c.x - cx) < hw + c.hw && Math.abs(c.y - cy) < hh + c.hh)) continue;
    placed.push({ x: cx, y: cy, hw, hh });

    // 引线端点：有公里牌就落到牌面上沿（杆子+牌面继续往下指到路面）；没有牌才落到地面点并画箭头
    const badge = view._km?.[`${key}:${s.km}`];
    const yGround = LIFT;                                     // 卡片中心 → 地面落点（固定像素）
    const yEnd = badge ? badge.y - 80 * badge.sc - 8 - cy : yGround;
    const TOP = 46;                                           // 卡片下沿（本体 ±38 + 投影余量）
    let svg = '';
    if (yEnd > TOP + 8) {
      svg += `<path d="M 0 ${TOP} V ${f(yEnd)}" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`;
      svg += `<path d="M 0 ${TOP} V ${f(yEnd)}" stroke="${LINE}" stroke-width="3.5" stroke-dasharray="4 6" stroke-linecap="round"/>`;
      if (!badge) {
        svg += `<path d="M -9 ${f(yEnd - 13)} L 9 ${f(yEnd - 13)} L 0 ${f(yEnd)} Z" fill="#fff"/>`;
        svg += `<path d="M -6 ${f(yEnd - 11)} L 6 ${f(yEnd - 11)} L 0 ${f(yEnd - 2)} Z" fill="${LINE}"/>`;
      }
    }
    svg += stationCard(row.width);
    svg += `<g transform="scale(.92)">${row.svg}</g>`;
    // 2026-11-08：补给簇的站名标签（cy−74…cy−30）会被字幕条（896…984）压住 ——
    //   实测全片 786 次出现里有 17 次（约 2%，都在镜头移动穿字幕带那一两秒）。
    //   口径是“卡片文字只能被螃蟹遮挡”，所以一旦被盖住（>2px）就不画标签，图标照留。
    const lTop = cy - 74, lBot = cy - 30;
    const covered = hasSub ? Math.min(lBot, SUB_BAND[1]) - Math.max(lTop, SUB_BAND[0]) : 0;
    if (covered <= 2) {
      // 客户 2026-11-08 第③条：2.5 km 是「医疗点 + 厕所」，不是补给站 ⇒
      //   标签只在**真的有补给**（饮料/饮水/用水/食品）时写“补给”，否则只写里程
      const hasSupply = s.services.some((x) => ['drink', 'water', 'sponge', 'food'].includes(x));
      const label = hasSupply ? `${s.km}km 补给` : `${s.km}km`;
      svg += `<g transform="translate(0 -52)">${pill(0, 0, label, { fs: 20, fill: HUD.panel, pad: 12, sw: 2.5 })}</g>`;
    }
    out.push(grp(T(cx, cy), svg, op), ...Z(a));
  }
}

/**
 * 地标贴纸（客户 2026-10-27 口径）：
 *   · 位置固定在画面偏右上，多张时向下排开——贴纸本身不动；
 *   · 只有指示线跟着地图走：线从贴纸左下角连到地图上的真实地标点；
 *   · 出现/消失都是“从右侧滑入 + 淡入”/“淡出 + 轻微右移”，不做弹跳放大。
 */
/**
 * 长条形地标的跟随锚点（客户 2026-10-28 口径：云澜水岸滨湖公园是狭长型，
 * 23–35 km 整段水岸都算它，指示点要**跟着画面里可见的那段路线走**）。
 *
 * 算法：对 23–35 km 每 50 m 采一个样本，权重 = 可见度 × 距螃蟹的高斯，
 *
 *   · **可见度**：离画框边缘 46 px 内平滑衰减到 0 ⇒ 出画的部分权重为 0，
 *     路线滑进滑出时权重连续变化，锚点跟着连续滑，不会在某一段出画的瞬间跳走；
 *   · **高斯**（σ = 3 km，可用 `follow.sigma` 调）：以公蟹当前里程为中心。
 *
 * 为什么需要高斯这一项：湖是环形，画面上常常同时看到**两段**岸线（近岸 + 对岸，
 * 实测 248/356 帧都是两段）。只取“可见中点”会落进湖心的空隙里（实测有 259 帧锚点在画外），
 * 只取“最长一段的中点”会在两段长度接近时来回横跳（实测单帧跳 977 px）。
 * 加上高斯后锚点稳定在“公蟹身边这段可见岸线的中点”：全程 0 帧出画，单帧最大位移 72 px。
 *
 * 纯函数（只依赖 t 的机位、赛道几何与公蟹里程）⇒ 任意跳帧、离线渲染、逐帧预览结果一致。
 * 可见部分太少时返回 null，调用方退回区间中点，保证卡片始终画得出来。
 */
function followAnchor(w, view, fr, crabKm) {
  const r = view.rect, fade = 46, stepKm = 0.05, sigma = fr.sigma ?? 3;
  const edge = (d) => smooth(clamp(d / fade));        // 离边框 d px 时的权重；框外 d<0 ⇒ 0
  let sw = 0, sk = 0;
  for (let km = fr.km0; km <= fr.km1 + 1e-9; km += stepKm) {
    const P = FULL.pos(km);
    const q = w.project(P[0], P[1], 0);
    if (!q.ok) continue;
    const vis = edge(Math.min(q.x - r.x, r.x + r.w - q.x)) * edge(Math.min(q.y - r.y, r.y + r.h - q.y));
    if (vis <= 0) continue;
    const g = Math.exp(-((km - crabKm) ** 2) / (2 * sigma * sigma));
    sw += vis * g; sk += vis * g * km;
  }
  if (sw < 0.2) return null;
  const kmMid = clamp(sk / sw, fr.km0, fr.km1);
  return { p: FULL.pos(kmMid), km: kmMid };
}

export function drawStickers(w, st, view, crabsInfo, out, under) {
  const r = view.rect, t = st.t;
  // ── 槽位是**连续量**（客户 2026-10-27 口径）：
  //    前一张卡片完全消失后，后面那张用 0.5s 缓入缓出（smoothstep，首尾速度为 0、中段最快）
  //    平移到上一格的位置。原来槽位是整数序号，前一张一消失，后一张当帧就“瞬移”上去。
  //    这里写成 t 的纯函数 ⇒ 任意跳帧、逐帧预览、离线渲染都一致，不会因为播放顺序而不同。
  const SLOT_ANIM = 0.5;
  const list = stickerWindows().filter((s) => !(view.id === 'left' && s.only === 'full') && !(view.id === 'right' && s.only === 'half'));
  const gone = (s) => s.T1 + 0.4;                     // 与 activeStickers 的窗口尾一致：这一刻起完全看不见
  const presence = (s) => {
    if (t < s.T0) return 0;                           // 还没出现
    // 进场也占位（缓入 0.45s）：文渊寺(12.00) 比博物馆(12.51) 早出，博物馆一出现，
    // 文渊寺要**平移**到下一格；如果占位是 0/1 硬切，它会当帧往下跳 306px（客户最烦的“瞬移”）
    if (t < s.T0 + 0.45) return smooth((t - s.T0) / 0.45);
    if (t <= gone(s)) return 1;                       // 在屏（含淡出尾巴）
    const u = (t - gone(s)) / SLOT_ANIM;
    return u >= 1 ? 0 : 1 - smooth(u);                // 让位：1 → 0，缓入缓出
  };
  for (let i = 0; i < list.length; i++) {
    const s = activeStickers(t).find((x) => x.id === list[i].id);
    if (!s) continue;
    // 连续槽位 = 前面所有卡的“占位度”之和（0 = 第一格）
    let slotF = 0;
    for (let j = 0; j < i; j++) slotF += presence(list[j]);
    let A, followKm = null;
    if (s.follow) {
      // 跟随模式：锚点每帧现算（画面里可见的 23–35km 那段的中点）；算不出来就退回区间中点，
      // 卡片本身必须一直画得出来 —— 锚点只是引线的落点，不该让整张卡消失。
      const F0 = followAnchor(w, view, s.follow, st.male.km);
      A = F0 ? F0.p : FULL.pos((s.follow.km0 + s.follow.km1) / 2);
      followKm = F0 ? F0.km : null;
    } else if (typeof s.anchor === 'string') A = COURSE.pois[s.anchor].pt;
    else if (Array.isArray(s.anchor)) A = s.anchor;
    else {
      // { km, off }：沿赛道法线偏移 off pt —— 用来把定位点放到某个补给点/路口的侧边
      A = FULL.pos(s.anchor.km);
      if (s.anchor.off) {
        const D = FULL.dir(s.anchor.km);
        A = [A[0] - D[1] * s.anchor.off, A[1] + D[0] * s.anchor.off];
      }
    }
    // 引线端点用**安全投影**（方向永远正确，不会整帧消失）
    const a0 = w.projectSafe(A[0], A[1], 0);
    // data-f 只给自检脚本读：当前折返/跟随锚点落在哪个里程
    const dbgFollow = followKm === null ? '' : ` data-f="km:${followKm.toFixed(2)}"`;
    if (!a0.ok) continue;

    // 分屏时卡片缩到 0.85 —— 但必须跟着 st.split 连续走，不能按视口宽度一刀切：
    // 分屏一结束视口从 960 变回 1920，硬阈值会让卡片当帧跳 21px、尺寸也跳一档（实测 47.87s）
    const base = (s.small ? 0.78 : 1.0) * (1 - 0.15 * clamp(st.split || 0));
    const W2 = 560 * base / 2, H2 = 286 * base / 2;

    // 柔和进出：滑入 0.55s（从右侧 110px 滑到位）、淡出 0.45s
    const kin = smooth(clamp(s.dt / 0.55));
    const kout = smooth(clamp(s.rem / 0.45));
    const op = Math.min(kin, kout);
    if (op <= 0.002) continue;

    // 固定站位：右上角，留出图例与信息卡的位置；多张往下排。卡顶固定（186px），放大只向下长
    // slotF 是连续槽位：前一张消失后 0.5s 内从 1 缓到 0，这张卡就平滑顶上去
    const slotX = r.x + r.w - W2 - 56;
    const slotY = r.y + 186 + H2 + slotF * (H2 * 2 + 20);
    const x = slotX + (1 - kin) * 110 - (1 - kout) * 40;
    const y = slotY;
    const sc = base;

    // 指示线 + 黄点（客户 2026-10-27 口径）：
    //   · 整组钉在地图锚点上，进 deep 层（角色下层）——螃蟹跑过去自然压住它；
    //   · 不再按“离螃蟹多近”淡出：那是回避逻辑，会让线在贴纸存在的大半时间里隐形。
    //     现在只随卡片本身的进出场淡入淡出，遮挡交给图层顺序。
    // 引线起点取在卡片边框上、朝向锚点的那一点（射线与卡片矩形求交）：
    // 原来固定取左下角，锚点在右侧时线会横穿卡片本身
    const fdx = a0.x - x, fdy = a0.y - y;
    const bx = W2 * 0.94, by = H2 * 0.94;
    const kk = Math.min(bx / Math.max(1, Math.abs(fdx)), by / Math.max(1, Math.abs(fdy)));
    const from = { x: x + fdx * Math.min(1, kk), y: y + fdy * Math.min(1, kk) };
    // 客户 2026-11-05 ②：**去掉引线的“规避动作”** —— 原来锚点在画外时把线截到画框边缘、
    //   末端改画小箭头，看起来像线在中途拐了个弯。现在一律直线连到真实锚点（出画就让它出画），
    //   黄点也始终画在锚点上。
    let a = { x: a0.x, y: a0.y };
    const offView = false;
    // 客户 2026-11-05：引线**不许消失**。上一版对“超远锚点”直接不画，结果几帧里线凭空没了。
    //   现在改成：只要投影有效就在同一条直线上取一个远点（夹到 ±12 屏宽的安全盒子），
    //   线的方向不变、由视口裁掉，永远不会出现“线没了”的帧。只有锚点落到相机背后（ok=false，
    //   投影坐标会翻面、方向是错的）才不画线。
    let far = false;
    if (a0.ok && (Math.abs(a.x) > r.w * 12 || Math.abs(a.y) > r.h * 12)) {
      const dx = a.x - from.x, dy = a.y - from.y;
      const k2 = Math.min(Math.abs((r.w * 12) / (dx || 1e-6)), Math.abs((r.h * 12) / (dy || 1e-6)));
      a = { x: from.x + dx * k2, y: from.y + dy * k2 };
      far = true;
    }
    const farOut = !a0.ok || !Number.isFinite(a.x + a.y);
    const leadOp = Math.min(op, clamp(s.dt / 0.35));
    // 引线用比常规标注更实的墨色（.55），否则穿水时几乎看不见
    const leadInk = THEME.key === 'navi' ? 'rgba(31,45,61,.55)' : OUT;
    let lead = `<path${dbgFollow} d="M ${f(a.x)} ${f(a.y)} L ${f(from.x)} ${f(from.y)}" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`;
    lead += `<path d="M ${f(a.x)} ${f(a.y)} L ${f(from.x)} ${f(from.y)}" stroke="${leadInk}" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 8"/>`;
    const ang = Math.atan2(a0.y - from.y, a0.x - from.x) * 180 / Math.PI;
    const pin = offView
      ? `<g transform="translate(${f(a.x)} ${f(a.y)}) rotate(${f(ang)})"><path d="M -4 -9 L 7 0 L -4 9 Z" fill="#FFC83D" stroke="${OUT}" stroke-width="2.6" stroke-linejoin="round"/></g>`
      : `<circle cx="${f(a.x)}" cy="${f(a.y)}" r="${f(11 * kin)}" fill="#FFC83D" stroke="${OUT}" stroke-width="3.5"/>`;
    if (!farOut) {
      // 远点只画线，不画黄点（黄点会跑到画外几十屏，没有意义）
      // 客户 2026-11-06 ④：引线**不参与三维遮挡**。原来它带着 hit 点进深度层，
      //   锚点（桥面）被桥体挡住时整条线被剔掉 —— 这就是 698 帧起“引线断断续续消失”的真因。
      //   引线是 UI 注记，不是地图实物，永远画在图层里。
      (under || out).push(grp('', far ? lead : lead + pin, leadOp), a0.d, null);
    }

    (view.occ ||= []).push({ x0: x - W2, x1: x + W2, y0: y - H2, y1: y + H2 });
    out.push(grp(T(x, y, sc), stickerSVG({ art: s.art, name: s.name, tag: s.tag }), op));
  }
  void crabsInfo;
}

/** 折返牌 */
/**
 * 折返点（客户 2026-10-27 口径）：不做路牌，直接在地面上刷一个 U 型掉头标识——
 *   去程走路的右侧、绕过折返点、回程走左侧，像真实的掉头导流线；整组贴在点位前方的路面上。
 *   投影后逐点连线，所以它随镜头透视自然变形，不进屏幕层、也不做深度排序（本来就在地面）。
 */
/**
 * 折返点地面标识：U 型导流线 + 旁边的“折返点”字牌
 *
 * 客户 2026-10-27 口径：
 *   ① 只在螃蟹跑到跟前才出现（不许“还没下桥就写出来”）；
 *   ② 文字不许压路面 —— 挪到路肩外的空地；
 *   ③ 文字与路线**垂直**，而不是顺着柏油一路斜过去。
 *
 * 侧别选择是算出来的、不是猜的：把两侧候选点分别投影，比“到任一条赛道的距离”
 * 与“是否落在水面里”，取空旷又不掉进湖的那一侧；两侧都不合格就不画（宁可没有）。
 */
export function drawUturns(w, st, view, ground) {
  for (const u of activeEvents(st.t, 'uturn')) {
    if (view.id === 'left' && u.km > 21.1) continue;        // 左屏只有半马，不画全马折返
    if (u.km > 21.1 && !view.crabs.includes('male')) continue;
    const k = smooth(clamp(u.dt / 0.6)), op = clamp((u.d - u.dt) / 0.6);
    if (op <= 0.01) continue;
    const lab = uturnLabel(w, u, k * op);
    if (lab) ground.push(lab);
  }
}

/**
 * 折返点标识 = 地面上的三个字（客户 2026-10-27 九批）
 *
 *   ① 只要文字：黄色 U 型导流线整组删掉（那东西位置/方向一直读不准）；
 *   ② 贴地：整串字画在地平面坐标系里（该点的雅可比构造仿射基），跟着地面一起透视，
 *      不是浮在空中的牌子；位置只由里程决定 ⇒ 不漂移；
 *   ③ 与道路垂直：字串方向 = 赛道法线，读起来是“横跨路面”的一行；
 *   ④ 不考虑遮挡：不做 HUD 避让、不选侧、不缩字号试验，压住谁也照画。
 *
 * 折返点是 180° 掉头，正踩在点位上取方向会跨过掉头点（法线来回跳），
 * 所以基向量取“点位前 25 m”处算，再把原点平移回点位本身。
 */
/**
 * 折返点当前旋转量（度，正 = 顺时针）：
 *   ① 预览器里临时调的（`?utrot=19.61:12` 或按 , / . 键）存在 window.__UTROT，优先；
 *   ② 否则用 `src/config/story.js` 事件里写的 `rotDeg`。
 * 调好之后把数字抄进 story.js 就永久生效。
 */
export function rotDegOf(u) {
  const ov = (typeof window !== 'undefined') ? window.__UTROT : null;
  const key = u.km.toFixed(2);
  if (ov && typeof ov[key] === 'number') return ov[key];
  if (ov && typeof ov['*'] === 'number') return ov['*'];
  return u.rotDeg || 0;
}

function uturnLabel(w, u, alpha) {
  const txt = u.paint || u.label || '折返';
  const km = u.km;
  const kb = km - 0.025;                       // 基点：点位前 25 m（折返点会掉头，正点位取方向会跳）
  const pb = FULL.pos(kb), dir = FULL.dir(kb, 0.012);
  const p = FULL.pos(km);                      // 字的**底边**落在点位本身
  const H = u.fsPt || 14;                      // 世界字高（pt）——常量，逐帧不变
  const nx = -dir[1], ny = dir[0];             // 赛道法线（世界）

  const h = 8;                                 // 中心差分步长（pt）
  const o = w.project(p[0], p[1], 0.3);
  const nA = w.project(pb[0] - nx * h, pb[1] - ny * h, 0.3);
  const nB = w.project(pb[0] + nx * h, pb[1] + ny * h, 0.3);
  const rA = w.project(pb[0] - dir[0] * h, pb[1] - dir[1] * h, 0.3);
  const rB = w.project(pb[0] + dir[0] * h, pb[1] + dir[1] * h, 0.3);
  if (!o.ok || !nA.ok || !nB.ok || !rA.ok || !rB.ok) return null;

  const nLen = Math.hypot((nB.x - nA.x) / (2 * h), (nB.y - nA.y) / (2 * h));   // 横向每 pt 的屏幕位移
  const rLen = Math.hypot((rB.x - rA.x) / (2 * h), (rB.y - rA.y) / (2 * h));   // 沿路每 pt 的屏幕位移
  const roadAng = Math.atan2(rB.y - rA.y, rB.x - rA.x);
  const th = (rotDegOf(u) * Math.PI) / 180;          // 可选微调（正 = 顺时针），默认 0

  // ── 地面漆：字沿着赛道方向排（读起来是“顺着路跑过去看到的一行字”），
  //    x 轴取赛道切线，且保证在屏幕上从左往右（cos>0）；y 轴按行列为正取 x+90（不镜像）。
  //    这样字是躺在地面里的，沿着路被透视压扁，像刷在柏油上。
  const along = u.axis !== 'across';
  const baseAng = along ? roadAng : roadAng - Math.PI / 2;
  const xAng0 = Math.cos(baseAng) < 0 ? baseAng + Math.PI : baseAng;  // 屏幕上从左往右读
  const xAng = xAng0 + th;                                            // th 整体转（两轴一起转 = 刚体）
  const yAng = xAng + Math.PI / 2;                                    // 字头方向（局部 y 朝下）
  const xLen = along ? rLen : nLen, yLen = along ? nLen : rLen;
  const a = Math.cos(xAng) * xLen, b = Math.sin(xAng) * xLen;
  const c = Math.cos(yAng) * yLen, d = Math.sin(yAng) * yLen;

  const pxH = Math.hypot(c, d) * H;            // 屏幕上字高
  if (pxH < 7) return null;                    // 太小看不清就不画（不是避让）

  // 矩阵必须给 3 位小数：全局 f() 只保留 1 位，±1.05 这种基向量会被圆掉 4%（实测歪 2.3°）
  const g3 = (v) => Math.round(v * 1000) / 1000;
  const ru = rotDegOf(u).toFixed(1);
  const dbg = ` data-u="km:${km.toFixed(2)} base:${kb.toFixed(3)} fsPt:${H.toFixed(1)} pxH:${pxH.toFixed(1)} axis:${along ? 'along' : 'across'} rot:${ru}"`;
  // 底边对齐：字形盒在 y ∈ [-H, 0]，基线 y=0 ⇒ 整串字的**下缘**正好压在点位上
  return `<g transform="matrix(${g3(a)} ${g3(b)} ${g3(c)} ${g3(d)} ${g3(o.x)} ${g3(o.y)})"${dbg} opacity="${f(alpha)}">` +
    `<text x="0" y="0" text-anchor="middle" dominant-baseline="text-after-edge" ` +
    `font-family="${FONT}" font-weight="900" font-size="${f(H)}" ` +
    `fill="#FFB020" stroke="#fff" stroke-width="${f(H * 0.17)}" paint-order="stroke" letter-spacing="${f(H * 0.06)}">${txt}</text></g>`;
}

/** 分流：地面大箭头（世界坐标），左粉右蓝 */
export function drawFork(w, st, view, ground, out) {
  for (const e of activeEvents(st.t, 'fork')) {
    if (view.id !== 'main') continue;
    const k = smooth(clamp(e.dt / 0.8)), op = clamp((e.d - e.dt) / 0.5);
    // 地面带子：从分叉点沿各自路线刷一段高亮（客户 2026-11-05 ⑥ 的“分流标志”主体）
    const band = (route, k0, k1, color) => {
      const pts = [];
      const kk = k0 + (k1 - k0) * k;
      for (let x = k0; x <= kk + 1e-6; x += 0.01) pts.push(route.pos(x));
      if (pts.length < 2) return null;
      const scr = pts.map(([x, y]) => w.project(x, y, 0.5));
      const d = scr.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ');
      const sw = clamp(scr[0].ppp * 16, 10, 40);
      ground.push(`<path d="M ${d}" fill="none" stroke="#fff" stroke-width="${f(sw + 10)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op * 0.9)}"/>` +
        `<path d="M ${d}" fill="none" stroke="${color}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op)}"/>`);
      // 箭头贴在末端：取末端前 4 个采样点算方向，避免 px/帧抖动
      const a = scr[scr.length - 1], b = scr[Math.max(0, scr.length - 4)];
      const ang = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
      ground.push(grp(T(a.x, a.y, sw / 18, ang), `<path d="M 30 0 L -12 -26 L -6 0 L -12 26 Z" fill="${color}" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`, op));
      return { a, b, ang };
    };
    const sp = COURSE.split;
    const H = band(HALF, sp.half_km - 0.05, Math.min(21.0975, sp.half_km + 0.3), R.half);
    const M = band(FULL, sp.full_km - 0.05, sp.full_km + 0.55, R.full);
    const tk = easeOutBack(clamp((e.dt - 0.45) / 0.4)) * op;
    // 两行标签：上行“半马/全马 + 左转/右转”，下行路名 —— 客户要“能明显看出螃蟹一左一右”
    //   位置**必须夹在画框里**：镜头推到 340 时全马的箭头尖已经跑到画面右侧外（实测 x=1906），
    //   标签跟着箭尖就整块出画。这里按 prefer 侧先摆，再夹进 [24, w-24] × [70, 860]，绝不压字幕带。
    const R_ = view.rect, PADX = 28, TOP = 70, BOT = 800;
    // 右列是地标图卡的固定站位（x ≥ 1385），左列是标题/心跳/海拔窗 —— 标签只在中间这块放
    const XL = Math.max(R_.x + PADX, 560), XR = Math.min(R_.x + R_.w - PADX, 1385);
    const tag = (cx0, cy0, w, h, title, road, color) => {
      const x = Math.max(XL, Math.min(XR - w, cx0 - w / 2));
      const y = Math.max(TOP, Math.min(BOT - h, cy0 - h / 2));
      const cx = x + w / 2, cy = y + h / 2;
      const box = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${color}" stroke="#fff" stroke-width="4"/>`;
      const t1 = `<text x="${f(cx)}" y="${f(y + 40)}" text-anchor="middle" font-family="${FONT.cn}" font-weight="700" font-size="30" fill="#fff">${esc(title)}</text>`;
      const t2 = `<text x="${f(cx)}" y="${f(y + 76)}" text-anchor="middle" font-family="${FONT.cn}" font-weight="600" font-size="26" fill="#FFFFFF" opacity="0.94">${esc(road)}</text>`;
      const k = Math.max(0.02, tk);
      return `<g transform="translate(${f(cx)} ${f(cy)}) scale(${k.toFixed(3)}) translate(${f(-cx)} ${f(-cy)})">${box}${t1}${t2}</g>`;
    };
    // ── 客户 2026-11-06：**两块胶囊字卡换成一块分流标志路牌**
    //    设计：立杆 + 单块牌子；牌面上部是「分流点 SPLIT」深色条，下面左右各一半
    //    （左半粉、右半蓝），各写「◀ 半马 / 星湖南路」与「全马 / 环湖大道 ▶」。
    //    牌子挂在分叉点正上方，螃蟹在地面层，互不遮挡。
    {
      const sp0 = w.project(COURSE.split.pt[0], COURSE.split.pt[1], 1);
      if (!sp0.ok) continue;
      // 牌面尺寸整体按 S 缩：分叉点在这几秒里正好落在画面上三分之一，牌子太大会顶出画框
      const S = 0.78;
      const sc = clamp(sp0.ppp * 2.1, 0.72, 1.15) * (0.6 + 0.4 * k);
      // 牌面抬到“龙门架”高度：1540 帧母蟹已经跑到分叉点以北 157 px，牌面压在她身上会把两边都读不清
      //   ⇒ 立杆加长、牌面整体抬到螃蟹头顶之上（实测牌面下沿 183 px，她头顶 212 px）
      const BW = 470 * S, BH = 160 * S, TOP = -580 * S;
      const x0 = -BW / 2, y0 = TOP, r = 18 * S;
      const leadInk = THEME.key === 'navi' ? 'rgba(31,45,61,.55)' : OUT;
      const fsT = 34 * S, fsS = 26 * S, fsH = 25 * S;
      let g = '';
      g += `<rect x="${f(x0 + 5)}" y="${f(y0 + 8)}" width="${f(BW)}" height="${f(BH)}" rx="${f(r)}" fill="rgba(20,40,70,.18)"/>`;
      g += `<path d="M 0 -16 L 0 ${f(y0 + BH)}" stroke="#FFFFFF" stroke-width="${f(15 * S)}" stroke-linecap="round"/>`;
      g += `<path d="M 0 -16 L 0 ${f(y0 + BH)}" stroke="${leadInk}" stroke-width="${f(7 * S)}" stroke-linecap="round"/>`;
      g += `<ellipse cx="0" cy="-10" rx="${f(19 * S)}" ry="${f(6 * S)}" fill="rgba(20,40,70,.18)"/>`;
      g += `<rect x="${f(x0)}" y="${f(y0)}" width="${f(BW)}" height="${f(BH)}" rx="${f(r)}" fill="#FFFFFF" stroke="${OUT}" stroke-width="5"/>`;
      // 左右半区薄色底（粉 / 蓝）
      g += `<path d="M ${f(x0 + 3)} ${f(y0 + 52 * S)} h ${f(BW / 2 - 3)} v ${f(BH - 55 * S)} a ${f(15 * S)} ${f(15 * S)} 0 0 1 ${f(-15 * S)} ${f(15 * S)} h ${f(-(BW / 2 - 18 * S))} a ${f(15 * S)} ${f(15 * S)} 0 0 1 ${f(-15 * S)} ${f(-15 * S)} Z" fill="${R.half}" opacity="0.10"/>`;
      g += `<path d="M ${f(x0 + BW / 2)} ${f(y0 + 52 * S)} h ${f(BW / 2 - 3)} v ${f(BH - 70 * S)} a ${f(15 * S)} ${f(15 * S)} 0 0 1 ${f(-15 * S)} ${f(15 * S)} h ${f(-(BW / 2 - 18 * S))} Z" fill="${R.full}" opacity="0.10"/>`;
      // 顶条
      g += `<path d="M ${f(x0 + 3)} ${f(y0 + 21 * S)} a ${f(18 * S)} ${f(18 * S)} 0 0 1 ${f(18 * S)} ${f(-18 * S)} h ${f(BW - 42 * S)} a ${f(18 * S)} ${f(18 * S)} 0 0 1 ${f(18 * S)} ${f(18 * S)} v ${f(31 * S)} h ${f(-(BW - 6))} Z" fill="#16324F"/>`;
      g += `<text x="0" y="${f(y0 + 38 * S)}" text-anchor="middle" font-family="${FONT.cn}" font-weight="700" font-size="${f(fsH)}" fill="#FFFFFF" letter-spacing="3">分流点 · SPLIT</text>`;
      // 中缝
      g += `<path d="M 0 ${f(y0 + 58 * S)} L 0 ${f(y0 + BH - 12 * S)}" stroke="#C9D6E4" stroke-width="2" stroke-dasharray="5 6"/>`;
      // 左：半马（箭头朝左）
      g += `<path d="M ${f(-BW / 2 + 30 * S)} ${f(y0 + 108 * S)} h ${f(-26 * S)} m 0 0 l ${f(12 * S)} ${f(-12 * S)} m ${f(-12 * S)} ${f(12 * S)} l ${f(12 * S)} ${f(12 * S)}" fill="none" stroke="${R.half}" stroke-width="${f(7 * S)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      g += `<text x="${f(-BW / 2 + 46 * S)}" y="${f(y0 + 118 * S)}" font-family="${FONT.cn}" font-weight="900" font-size="${f(fsT)}" fill="${R.half}">半马 · 左转</text>`;
      g += `<text x="${f(-BW / 2 + 33 * S)}" y="${f(y0 + 156 * S)}" font-family="${FONT.cn}" font-weight="600" font-size="${f(fsS)}" fill="#1F2D3D">${esc(SPLIT_ROADS.half)}</text>`;
      // 右：全马（箭头朝右）
      g += `<path d="M ${f(BW / 2 - 30 * S)} ${f(y0 + 108 * S)} h ${f(26 * S)} m 0 0 l ${f(-12 * S)} ${f(-12 * S)} m ${f(12 * S)} ${f(12 * S)} l ${f(-12 * S)} ${f(12 * S)}" fill="none" stroke="${R.full}" stroke-width="${f(7 * S)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      g += `<text x="${f(BW / 2 - 46 * S)}" y="${f(y0 + 118 * S)}" text-anchor="end" font-family="${FONT.cn}" font-weight="900" font-size="${f(fsT)}" fill="${R.full}">全马 · 右转</text>`;
      g += `<text x="${f(BW / 2 - 33 * S)}" y="${f(y0 + 156 * S)}" text-anchor="end" font-family="${FONT.cn}" font-weight="600" font-size="${f(fsS)}" fill="#1F2D3D">${esc(SPLIT_ROADS.full)}</text>`;
      // 客户 2026-11-06：牌面**永远排在螃蟹后面**（1540 帧实测牌子把母蟹整个盖住了）。
      //   items 层按 z 从大到小画，给 1e6 就等于“最先画” ⇒ 螃蟹一定压在牌子前面。
      out.push(grp(T(sp0.x, sp0.y, sc), g, tk), 1e6, null);
    }
  }
}

/** 终点前直道约 230 m：沿最后 230 m 画一条金色冲刺带 */
export function drawSprint(w, st, view, ground) {
  const items = []; let labeled = false;
  // 标签单独收起来，等所有冲刺带都画完再落层：半马/全马终点同一处时，两条带子会重叠，
  // 后画的那条会盖住先画的标签，把白色文字糊成一片黄（“230m”只剩“23(”）
  const labels = [];
  if (st.t < 37.6) return;          // 分流箭头出现期间不叠冲刺带
  // 片尾总结卡出来时整块撤掉：否则“直道 约230m”胶囊会被总结卡下沿切掉一半
  if (cardsAt(st.t).some((c) => c.kind === 'summary')) return;
  if (view.crabs.includes('female')) items.push([HALF, st.female.km, HALF.len]);
  if (view.crabs.includes('male')) items.push([FULL, st.male.km, FULL.len]);
  for (const [route, km, L] of items) {
    const d = L - km;
    if (d > 0.6 || d < 0) continue;
    const op = clamp((0.6 - d) / 0.15);
    const pts = [];
    for (let x = L - 0.23; x <= L; x += 0.01) pts.push(route.pos(x));
    const scr = pts.map(([x, y]) => w.project(x, y, 0.6));
    // 另一只螃蟹的终点直道常在画外（镜头跟着这只跑）：整条带子出屏就不画，免得只剩一个被裁一半的标签
    if (!scr.some((p) => p.ok && inRect(p, view.rect, 60))) continue;
    const sw = clamp(scr[0].ppp * 10, 8, 24);
    const dd = scr.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ');
    ground.push(`<path d="M ${dd}" fill="none" stroke="#FFC83D" stroke-width="${f(sw)}" stroke-linecap="round" opacity="${f(op * 0.9)}" stroke-dasharray="${f(sw * 1.4)} ${f(sw * 0.9)}"/>`);
    const m = scr[Math.floor(scr.length * 0.4)];
    if (labeled) continue; labeled = true;
    // 标签宽度约 220px：锚点必须离屏幕边缘 160px 以上，否则整块会被裁掉一半
    if (!m.ok || !inRect(m, view.rect, -160)) continue;
    // 海拔窗是不透明面板：胶囊落在面板范围内会被上沿切掉一截（57.2s 实测少 16/35px）。
    // 不整段丢掉——把它抬到面板上沿之上，标签还在，只是让开。
    let ly = m.y - 30;
    if (inElevRect({ x: m.x, y: ly }, st.t)) ly = ELEV_RECT.y0 - 34;
    // pad 给足：中文+数字混合时 textW 略保守，pad 小了右侧会把“m”切进圆角
    labels.push(grp(T(m.x, ly), pill(0, 0, '直道 约230m', { fs: 22, fill: '#FFC83D', color: OUT, stroke: OUT, sw: 2.5, pad: 22 }), op));
  }
  ground.push(labels.join(''));
}
