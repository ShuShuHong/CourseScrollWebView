// 单个视口的“世界贴片”层：螃蟹、拱门、分区、发枪、升级/加冕特效、体力警告
// 所有元素按屏幕 y 排序后输出（越靠下越靠前），螃蟹穿门时前后关系自然。
import { crabSVG } from '../art/crab.js';
import { crabSprite, hasSprites } from '../art/sprites.js';
import { THEME } from '../config/theme.js';
import { ELEV_WIN, T_FEMALE_FINISH } from '../config/story.js';
import { pairLock, growOf } from '../config/venue.js';
import { archSVG, zoneBoards, gunRipple } from '../art/props.js';
import { heart } from '../art/icons.js';
import { easeOutBack, clamp, smooth, rand } from '../art/svg.js';
import { FULL, HALF, COURSE, liftAt } from './course.js';
import { activeEvents, eventsOf, maleKm, femaleKm, cardsAt } from './timeline.js';
import { pill, grp, T, f, OUT, HUD, FONT, warnTri, Z } from './ui.js';

const SF = COURSE.meta.start_finish;
const CRAB_W = 300;            // crab.js 原始宽度（单位）
const CRAB_PX = 168;           // 标准镜头下螃蟹屏幕宽度（1080p）

/** 螃蟹尺寸：主要恒定，随距离轻微变化（远小近大但不夸张） */
export const crabScale = (dist) => clamp(Math.pow(820 / dist, 0.35), 0.5, 1.3) * CRAB_PX / CRAB_W;

function crabInfo(w, st, who, lift) {
  const c = st[who], route = who === 'male' ? FULL : HALF, key = who === 'male' ? 'full' : 'half';
  const kmF = who === 'male' ? maleKm : femaleKm;
  const vel = (kmF(st.t + 0.06) - kmF(st.t - 0.06)) / 0.12;      // km/s
  const p = w.project(c.pos3[0], c.pos3[1], c.pos3[2]);
  const ahead = Math.min(route.len, c.km + 0.03);
  const pa = route.pos(ahead), q = w.project(pa[0], pa[1], liftAt(key, ahead, lift));
  let dx = q.x - p.x, dy = q.y - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const moving = Math.abs(vel) > 0.02;
  return { who, c, p, dir: [dx, dy], vel, moving };
}

export function drawCrabs(w, st, view, lift, items) {
  // 分屏时两个视口拍的不是同一个世界：左屏（副本）画副本里的螃蟹，右屏（全图）继续用全图那套
  //   —— 客户 2026-10-29 把分屏提前到 40s 后暴露出来的：原来只要 st.scene==='venue' 就整条走副本路径，
  //   右屏的公蟹当场消失（副本的 venuePose 里母蟹是唯一主角，maleX 为 null）
  // 副本有两种（主会场 venue / 分流 split），螃蟹都由 drawVenueCrabs 画
  if ((st.scene === 'venue' || st.scene === 'split') && view.scene !== 'course') return drawVenueCrabs(w, st, view, items);
  const whoList = view.crabs;
  const S = crabScale(w._dist);
  let gapDbg = '-', snapDbg = '-';
  const info = whoList.map((who) => crabInfo(w, st, who, lift));
  // 两只同框的站位（客户 2026-10-27 口径）：
  //   · 母蟹永远在画面左边、公蟹永远在右边，间距恒定；
  //   · 不再按路线切线推开/旋转——赛道有多次掉头，跟着转向会让两只蟹疯狂打转。
  // 只在“两只确实跑在一起（投影足够近且都在画内）”时做屏幕空间归位；
  // 分流之后母蟹留在终点、公蟹继续环湖，各自按真实位置画（否则会把她硬拽到公蟹身边）。
  if (info.length === 2) {
    const male = info.find((i) => i.who === 'male') || info[0];
    const fem = info.find((i) => i.who === 'female') || info[1];
    // 以公蟹（全马路中心）为基准左右分开：用两者的中点会把整对推到湖侧外缘
    const mx = male.p.x, my = male.p.y;
    // 位图蟹的屏幕宽度 ≈ 1.36 × 身高（236×S）；间距取 1.06 倍宽，留一点空隙不粘连
    // （戴冠后两只都放大，间距要跟着放大，否则会叠在一起）
    const pairGrow = Math.max(growOf(st.male.stage), growOf(st.female.stage));
    let gap = Math.max(236 * S * 1.36 * 1.06 * pairGrow, 168);
    // 但两个人并排不能宽过脚下的路面：桥上近景时桥面只有 ~80px，硬拉开会把两只都推到路外
    try {
      const kmC = (st.male.km + Math.min(st.female.km, st.male.km)) / 2;
      // 量法要点（客户 2026-10-28 报的“突然拉开再复原”就是这里来的）：
      //   ① 必须量**二维**投影宽度。原来只看 |a2.x - a1.x|，路面在屏幕上接近竖直时几乎只差在 y 上
      //      ⇒ deckPx 掉到 8 以下 ⇒ 整条 clamp 失效 ⇒ gap 从 84 弹回 200，两只当场炸开一两帧；
      //   ② 单点采样在急弯/掉头处不稳定（法向在弯心附近会翻面）⇒ 取 ±0.08km 五点的**均值**，
      //      均值比中位数/最大值都平滑（实测残余抖动从 30px 降到 0）。
      let acc = 0;
      for (let i = 0; i < 5; i++) {
        const km = Math.max(0, kmC - 0.08 + 0.16 * i / 4);
        const dC = FULL.dir(km), px = FULL.pos(km);
        const lift2 = liftAt('full', km, st.bridgeLift ?? 1);
        const a1 = w.project(px[0] - dC[1] * 18, px[1] + dC[0] * 18, lift2);
        const a2 = w.project(px[0] + dC[1] * 18, px[1] - dC[0] * 18, lift2);
        acc += Math.hypot(a2.x - a1.x, a2.y - a1.y);
      }
      const deckPx = acc / 5;
      if (deckPx > 2) gap = Math.min(gap, Math.max(84, deckPx * 1.15));
    } catch { /* 取不到就退回原间距 */ }
    // 并列权重（客户 2026-10-28）：原来是 `close` 布尔开关，一旦 dist 跨过阈值就整帧切换
    // ⇒ 分流那一刻公蟹会瞬间弹回自己的真实位置（实测一帧跳 55px）。改成**连续权重**：
    //   · dist ≤ gap*1.7  → 1（稳稳并排）
    //   · dist ≥ gap*3.4  → 0（各走各的）
    //   中间用 smoothstep 过渡；再把“是否在画框竖向范围内”也做成连续量，避免进出画面时闪。
    // 客户 2026-11-05：**分流之后必须解绑**。原来只按“里程差 < 3km”判同框 ——
    //   母蟹拐上粉线（半马 20.85km）后与公蟹只差 0.3km，仍被判成“跑在一起”，
    //   于是被硬拽到公蟹身边、落在蓝色全马线上（客户看到的就是这个“走错道”）。
    //   再加上一条**路线方向一致性**：两条线在分叉后夹角接近 90°，点积掉到 0 附近就自然解绑；
    //   共线段两条平行线方向一致，点积 ≈1，仍按母左公右并排。
    let dirDot = 1;
    try {
      const dm = FULL.dir(st.male.km), dh = HALF.dir(st.female.km);
      dirDot = Math.abs(dm[0] * dh[0] + dm[1] * dh[1]);
    } catch { /* 取不到方向就按同框处理 */ }
    const together = Math.abs(st.male.km - st.female.km) < 3.0 && dirDot > 0.75;
    const dist = Math.hypot(male.p.x - fem.p.x, male.p.y - fem.p.y);
    // 方向一致度：0（已经分叉、各走各的）→ 1（共线段两条平行线）
    //   只判 together 不够 —— 屏幕上的 near 权重仍会把刚拐上粉线的母蟹拽回公蟹身边（实测 t=52 wgt 仍有 0.94）
    const align = smooth(clamp((dirDot - 0.35) / 0.40));
    const near = smooth(clamp((gap * 3.4 - dist) / (gap * 1.7))) * align;
    const inY = (p) => (p.ok ? smooth(clamp(Math.min(p.y - (view.rect.y - 120), (view.rect.y + view.rect.h + 120) - p.y) / 60)) : 0);
    let wgt = (together ? 1 : near) * align * Math.min(inY(male.p), inY(fem.p));
    wgt = clamp(wgt);
    gapDbg = `${gap.toFixed(1)}|${dist.toFixed(1)}|${S.toFixed(3)}|${w._dist ? w._dist.toFixed(0) : '?'}|${wgt.toFixed(3)}`;
    snapDbg = wgt > 0.5 ? '1' : '0';
    if (wgt > 0.002) {
      // 客户 2026-11-05：**公蟹不许被挪**。原来两只都往“中点 ± gap/2”上收，解耦那一刻
      //   公蟹要从 mx+gap/2 弹回 mx（向左 100+px），看起来就是“往回走了一截”。
      //   现在公蟹永远踩自己的真实投影，只有母蟹被摆到他左侧 gap 处。
      fem.p = { ...fem.p, x: fem.p.x + (male.p.x - gap / 2 - fem.p.x) * wgt, y: fem.p.y + (male.p.y - fem.p.y) * wgt };
    }
  }
  for (const it of info) {
    const { c, p } = it;
    if (!p.ok) continue;
    // 出画 320px 以上的角色不画（否则会在画面边缘留半只蟹或负数坐标的图）
    if (p.x < view.rect.x - 320 || p.x > view.rect.x + view.rect.w + 320) continue;
    // 母蟹已完赛、镜头又已经跟着公蟹走远时，她会缩成一只小蟹正好压在左下角海拔窗后面 →
    // 这种“残留物”不画（她在自己冲线那一刻由镜头切过去单独拍）
    const inElevWin = p.x > 10 && p.x < 660 && p.y > 575 && p.y < 890;
    if (it.who === 'female' && st.t > T_FEMALE_FINISH && inElevWin && Math.abs(st.male.km - st.female.km) > 5) continue;
    const appear = easeOutBack(clamp((st.t - 2.5) / 0.5));
    if (appear <= 0) continue;
    // 朝向固定：不跟着道路左右翻转（拐弯、掉头时来回翻会很鬼畜）
    const facing = 0;
    let mood = c.mood;
    if (!it.moving && (mood === 'run' || mood === 'tired')) mood = c.stage >= 2 ? 'win' : 'cheer';
    // 动画节拍恒定：不随地图速度/跑步速度变化（客户口径）。跑/累 2.35 循环每秒，欢呼/胜利 1.5
    const cad = mood === 'cheer' || mood === 'win' ? 1.5 : 2.35;
    const phase = (st.t * cad + (it.who === 'female' ? 0.5 : 0)) % 1;
    const sex = it.who === 'male' ? 'm' : 'f';
    const ringColor = it.who === 'male' ? THEME.route.full : THEME.route.half;
    if (hasSprites()) {
      // 位图角色：屏幕高度 ≈ SVG 版身高（约 220 单位）× S
      // 客户 2026-11-09：戴冠序列（stage 2）的素材偏小 ⇒ 按 growOf(stage) 补回 1.5 倍
      const hp = 236 * S * appear * growOf(c.stage);
      items.push(grp(T(p.x, p.y), crabSprite({ sex, stage: c.stage, mood, phase, facing, heightPx: hp, moving: it.moving, ring: true, ringColor }), 1, ` data-crab="${it.who}" data-x="${f(p.x)}" data-y="${f(p.y)}" data-gap="${gapDbg}" data-snap="${snapDbg}"`), ...Z(p, false));
    } else {
      items.push(grp(T(p.x, p.y, S * appear), crabSVG({ sex, stage: c.stage, mood, phase, facing }), 1, ` data-crab="${it.who}" data-x="${f(p.x)}" data-y="${f(p.y)}"`), ...Z(p, false));
    }
    // 特效
    if (c.fx === 'levelup') items.push(levelUp(p, S, st.t - c.fxT, it.who), -1e9, null);
    if (c.fx === 'crown') items.push(crownFx(p, S, st.t - c.fxT, it.who), -1e9, null);
    it.box = { x0: p.x - 150 * S, x1: p.x + 150 * S, y0: p.y - 205 * S, y1: p.y + 22 * S };
  }
  return info;
}

function burst(n, r0, r1, color, k, sw = 6) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2, ra = r0 + (r1 - r0) * k, rb = ra + 26 * (1 - k);
    s += `<path d="M ${f(Math.cos(a) * ra)} ${f(Math.sin(a) * ra * 0.8)} L ${f(Math.cos(a) * rb)} ${f(Math.sin(a) * rb * 0.8)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  return s;
}
const star = (x, y, r, c) => `<path transform="translate(${f(x)} ${f(y)})" d="M 0 ${-r} L ${r * 0.3} ${-r * 0.3} L ${r} 0 L ${r * 0.3} ${r * 0.3} L 0 ${r} L ${-r * 0.3} ${r * 0.3} L ${-r} 0 L ${-r * 0.3} ${-r * 0.3} Z" fill="${c}"/>`;

function levelUp(p, S, dt, who) {
  if (dt < 0 || dt > 2.2) return '';
  const k = clamp(dt / 0.7), op = clamp((2.2 - dt) / 0.4);
  const cy = p.y - 90;
  let s = `<g transform="translate(${f(p.x)} ${f(cy)})">${burst(14, 50, 150, '#FFC83D', k)}`;
  for (let i = 0; i < 8; i++) s += star(Math.cos(i * 0.8 + dt * 2) * (70 + 60 * k), Math.sin(i * 0.8 + dt * 2) * (50 + 40 * k) - 20 * k, 9 * (1 - k * 0.5), i % 2 ? '#fff' : '#FFE27A');
  if (who === 'male') {
    const sc = easeOutBack(clamp((dt - 0.15) / 0.45));
    s += grp(T(0, -150, sc), pill(0, 0, 'LEVEL UP! 形态升级', { fs: 34, fill: '#FFC83D', color: OUT, stroke: OUT, sw: 4 }));
  }
  return grp('', s + '</g>', op);
}

function crownFx(p, S, dt, who) {
  if (dt < 0 || dt > 3.4) return '';
  const k = clamp(dt / 0.8), op = clamp((3.4 - dt) / 0.5);
  let s = `<g transform="translate(${f(p.x)} ${f(p.y - 80)})">`;
  s += `<ellipse rx="${f(80 + 80 * k)}" ry="${f(60 + 50 * k)}" fill="#FFE27A" opacity="${f((1 - k) * 0.45)}"/>`;
  s += burst(18, 60, 180, who === 'male' ? '#FFC83D' : '#FF9AD2', k, 5);
  for (let i = 0; i < 14; i++) {
    const a = rand(i, 3) * 6.28, r = 60 + rand(i, 4) * 120 * k;
    s += star(Math.cos(a) * r, Math.sin(a) * r * 0.7 - 30 * k, 6 + rand(i, 5) * 6, i % 3 ? '#FFE27A' : '#fff');
  }
  // 客户 2026-10-29 ⑦：不要"解锁 蟹王/蟹后"字卡 —— 皇冠 + 星爆本身已经说明解锁
  return grp('', s + '</g>', op);
}

/** 拱门（世界尺寸，透视缩放）+ 分区牌 + 发枪波纹 + 区块地贴 */
export function drawStart(w, st, view, items, ground) {
  const t = st.t;
  const arches = eventsOf('arch').filter((e) => e.T <= t);
  if (!arches.length) return;
  const a = arches[arches.length - 1];
  const label = view.id === 'left' || a.label.startsWith('终点') ? '终点 FINISH' : t < 6.6 ? '起点 START' : '起终点';
  const pop = easeOutBack(clamp((t - arches[0].T) / 0.6));
  // 只在真正拍起终点时才画门架：它是个“门框”，跟远处的桥塔外形太像，
  // 拍桥（20–26s）与东岸（30–60s）时若留在画面里会被误认成桥塔
  // 客户 2026-10-29 ⑧：门头与起点/终点标志**一直保留**（原来超过 320 pt 就不画，
  //   片尾主图里门头会凭空消失）；远景靠 clamp(ppp*128/400, 0.08, 2.2) 缩到很小即可
  const p = w.project(SF[0], SF[1] - 4, 0);
  if (!p.ok) return;
  // 客户 2026-11-06：**把起终点门头写死在图上** —— 上一版加了“顶端出画就不画”的判据，
  //   结果 866/867 两帧里它在画面上沿一隐一现（客户看得很清楚）。
  //   现在无论镜头扫到哪儿它都在（远景时自然缩得很小），只在 p.ok 为假（落到相机背后）时不画。
  const R0 = view.rect;
  if (p.y < R0.y - 40 || p.y > R0.y + R0.h + 40) return;
  const sc0 = clamp(p.ppp * 128 / 400, 0.08, 2.2);
  // 客户 2026-11-06 追加：门头“常驻”之后出现新问题 —— 远景时整座门在画面上沿之外，
  //   只剩两根蓝柱子从顶边垂下来（23.9 / 30 / 45 s 都是这样）。
  //   这里用**顶端是否进画**做连续淡出：门架顶边 y = p.y − 318×sc0。
  //   顶端进画 80px 才满显，越往上越淡，完全出画就是 0 —— 连续量，不会再像 866/867 那样一隐一现。
  const topY = p.y - 318 * sc0;
  const visTop = clamp((topY - 6) / 80, 0, 1);
  if (visTop <= 0.01) return;
  const sc = sc0 * pop;
  // 拱门横幅有 412 个设计单位宽（412×sc 像素）。以前只按中心点 ±40 判断，
  // 结果贴边时留下“被裁一半的字”（右半屏露 THON、左缘露半截“起终点”卡）。
  // 现在要求整幅在视口内，否则整个门架不画。
  const hw = 206 * sc;
  // 横向剔除改成按**梁的真实半宽**（206×sc）：以前写死 ±140，梁在画面里还露着 5–30% 时整座门就被砍掉，
  //   第 497–499 帧从右缘滑出、第 635 帧从右缘滑入都表现为「一帧消失 / 一帧从画面外冒出来」——也是客户说的门头闪现。
  //   现在只有连梁都碰不到画框（完全出画）才不画，滑出/滑入的过程自然被画框裁，不会被截断。
  if (p.x < R0.x - hw || p.x > R0.x + R0.w + hw) return;
  const time = '';
  // 客户 2026-11-06（第三次反馈门头）：横梁上的**官方字条图必须常显**。
  //   原来的判据是「左侧有卡就把赛事名抹掉」—— 当年横梁还是两行白字，会和左侧卡的标题重复；
  //   换成官方字条图（arch-white.png）之后，这条判据把全片唯一一次出镜的门头（第 738–866 帧）
  //   抹掉了 96 帧（738–833），到第 834 帧云澜大桥数据卡收起的瞬间字条突然冒出来 —— 就是客户看到的「闪现」。
  //   现在只给**居中大卡**（summary，1000×540，正好盖住横梁）让位；左右两侧的卡贴着画框边缘，压不到横梁。
  const cardUp = cardsAt(t).some((c) => c.kind === 'summary');
  items.push(grp(T(p.x, p.y, sc), archSVG({ label, time, part: 'back', bare: cardUp }), visTop, ' data-arch="1"'), p.d + 2, { x: p.x, y: p.y, z: p.z });
  // 区块地贴：起点线后方按 A/B/C 三段（世界坐标投影的四边形）
  const zk = clamp((t - 2.6) / 0.6) * clamp((8.2 - t) / 0.8);
  if (zk > 0 && view.id === 'main') {
    const segs = [['A', '#F2453D', 0.0, 0.11], ['B', '#1A6FD8', 0.11, 0.22], ['C', '#16A88C', 0.22, 0.34]];
    for (const [k, c, d0, d1] of segs) {
      const q = [];
      for (const [d, s] of [[d0, -1], [d1, -1], [d1, 1], [d0, 1]]) {
        const P = FULL.pos(-d - 0.015), D = FULL.dir(0.02), off = 15 * s;
        q.push(w.project(P[0] - D[1] * off, P[1] + D[0] * off, 0));
      }
      const gun = (k === 'C' ? activeEvents(t, 'gun').some((g) => g.zones === 'C') : activeEvents(t, 'gun').some((g) => g.zones === 'AB'));
      ground.push(`<path d="M ${q.map((v) => `${f(v.x)} ${f(v.y)}`).join(' L ')} Z" fill="${c}" fill-opacity="${(gun ? 0.62 : 0.34) * zk}" stroke="#fff" stroke-width="3" stroke-opacity="${zk}"/>`);
      const m = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 };
      ground.push(grp(T(m.x, m.y), `<text y="12" text-anchor="middle" font-family="${FONT.num}" font-weight="900" font-size="34" fill="#fff" stroke="${OUT}" stroke-width="6" paint-order="stroke">${k}</text>`, zk));
    }
  }
  // 分区牌（拱门上方）— 客户 2026-10-30 ②：主图上这块 ABC 卡与 GO! 一并去掉，
  //   起跑信息已经在副本场景里表达，主图不再重复
  void zoneBoards;
  for (const g of activeEvents(t, 'gun')) {
    if (view.id !== 'main') continue;
    const k = clamp(g.dt / 1.4);
    ground.push(grp(T(p.x, p.y - 6, sc * 1.4), gunRipple(k, g.zones === 'C' ? '#5FF0C8' : '#FFC83D')));
    const lk = easeOutBack(clamp(g.dt / 0.35)) * clamp((1.5 - g.dt) / 0.3);
    // 客户 2026-11-09：**主场景里的「C区 第二枪」字卡和那条红色导引线整组撤掉** ——
    //   C 区的位置在起跑副本里已经用分区带表达过，主图这枚角标 + 虚线拉到大路口只会误导
    //   （它指的其实是终点直道拐进来的路口，不是 C 区）。发枪波纹保留。
    if (g.zones === 'C') continue;
    items.push(grp(T(p.x + 330 * sc + 150, p.y - 200 * sc, lk), pill(0, 0, g.label, { fs: 34, fill: '#F2453D', sw: 4 })), 8e5, null);
  }
  // GO! 大字：客户 2026-10-30 ② 去掉（改由副本里的发枪波纹与冲线表达）
}

/** 第二次上桥：体力警告气泡 + 掉心 */
export function drawWarn(w, st, view, info, items) {
  if (view.id !== 'main') return;
  for (const b of activeEvents(st.t, 'bridge')) {
    if (!b.warn) continue;
    const t0 = 1.2, dt = b.dt - t0;
    if (dt < 0 || dt > 3.2) continue;
    const xs = info.map((i) => i.p.x), ys = info.map((i) => i.p.y);
    const x = xs.reduce((a, c) => a + c, 0) / xs.length, y = Math.min(...ys) - 230;
    const k = easeOutBack(clamp(dt / 0.4)), op = clamp((3.2 - dt) / 0.4);
    const shake = Math.sin(dt * 40) * 6 * clamp(1 - dt / 0.6);
    const tw = 300;
    let s = `<rect x="${-tw / 2}" y="-34" width="${tw}" height="68" rx="16" fill="${HUD.red}" stroke="#fff" stroke-width="4"/>`;
    s += `<g transform="translate(${-tw / 2 + 36} 0)">${warnTri(1.1)}</g>`;
    s += `<text x="20" y="11" text-anchor="middle" font-family="${FONT.cn}" font-weight="700" font-size="32" fill="#fff">${b.warn}</text>`;
    s += `<g transform="translate(${tw / 2 + 44} 0)">${heart(false)}<text x="0" y="-26" text-anchor="middle" font-family="${FONT.num}" font-weight="900" font-size="30" fill="${HUD.red}" stroke="#fff" stroke-width="5" paint-order="stroke">-1</text></g>`;
    items.push(grp(T(clamp(x + shake, view.rect.x + 240, view.rect.x + view.rect.w - 300), Math.max(view.rect.y + 150, y), k), s, op), 9e5, null);
  }
}

/**
 * 副本场景里的螃蟹（客户 2026-10-28）：舞台是米制的近景，角色按**真实身高**换算屏幕像素
 * （1.9 m 高 × 每米像素数 ppp），越推近越大；不跟赛道切线，朝向固定，母左公右。
 */
/** 副本螃蟹的屏幕身高：真实 1.9 m × 每米像素数。地板 46 px 只兜底极远处（客户 2026-10-28：
 *  机位已收紧到 dist ≤ 65 m，65 m 处真实身高 52 px，地板基本不再生效 ⇒ 远景里的尺度是真的） */
export const VENUE_CRAB_M = 1.9;
export const VENUE_CRAB_MIN_PX = 46;

/** 接地影：螃蟹脚下一块柔和的椭圆，不然位图像贴纸浮在沥青上。三套画风各自的影色 */
function contactShadow(hpx, long = 0) {
  const col = THEME.key === 'cartoon' ? '#3A2414' : THEME.key === 'papercut' ? '#3A120E' : '#1F2D3D';
  const rx = 0.55 * hpx / 2, ry = rx * 0.26, dy = 0.10 * hpx * 0.3;
  if (long <= 0) return `<ellipse cx="0" cy="${f(dy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${col}" opacity=".18"/>`;
  // 逆光长影（分流副本）：影子朝镜头方向拖长，淡出到无
  const L = rx * (1 + long * 0.9);
  return `<g opacity=".26"><ellipse cx="${f(-L * 0.35)}" cy="${f(dy + ry * 0.4)}" rx="${f(L)}" ry="${f(ry * 0.78)}" fill="${col}" opacity=".55"/>` +
    `<ellipse cx="${f(-L * 0.9)}" cy="${f(dy + ry * 0.5)}" rx="${f(L * 0.75)}" ry="${f(ry * 0.6)}" fill="${col}" opacity=".28"/></g>`;
}

/**
 * 分流副本的螃蟹已经搬进 three.js 场景（splitWorld.setCrabs）⇒ SVG 层不再画角色，
 * 只留一套**隐形的探针标记**（同名的 data-crab / data-x / data-y / data-hpx / data-d），
 * 这样 check_venue / check_pair 这些读 DOM 的自检工具一行都不用改。
 */
function splitCrabMarkers(w, st, view) {
  const pose = st.venuePose || {};
  const out = [];
  for (const who of ['female', 'male']) {
    if (!view.crabs.includes(who)) continue;
    const x = who === 'male' ? pose.maleX : pose.femaleX;
    const z = who === 'male' ? pose.maleZ : pose.femaleZ;
    if (x == null || z == null) continue;
    const q = w.project(x, z, pose.y ?? 0);
    if (!q.ok) continue;
    // 客户 2026-11-09：**戴冠序列（stage 2）的素材偏小** ⇒ 按 growOf(stage) 补 1.5 倍
    //   （只跟 stage 走，没有时间缓入；母蟹半马冲线后同样 ×1.5）
    const grow = growOf(st[who] && st[who].stage);
    const hpx = clamp(VENUE_CRAB_M * (q.ppp || 0), VENUE_CRAB_MIN_PX, 520) * grow;
    // 有 AI 位图时：角色在 three.js 场景里（splitWorld.setCrabs），SVG 层只留隐形探针。
    // 没有位图时：three.js 那边是空的，SVG 层直接画矢量兜底角色，否则分流副本看不到人。
    const c2 = st[who] || {};
    const ph = (st.t * 2.35 + (who === 'female' ? 0.5 : 0)) % 1;
    const probe = hasSprites()
      ? '<rect width="0.01" height="0.01" fill="none"/>'
      : contactShadow(hpx, 0) + grp(`scale(${(hpx / 208).toFixed(3)})`, crabSVG({ sex: who === 'male' ? 'm' : 'f', stage: c2.stage, mood: c2.mood, phase: ph, facing: 0 }));
    out.push({
      svg: grp(T(q.x, q.y), probe, 1,
        ` data-crab="${who}" data-x="${f(q.x)}" data-y="${f(q.y)}" data-venue="1" data-3d="1"`
        + ` data-hpx="${f(hpx)}" data-ppp="${q.ppp.toFixed(3)}" data-d="${q.d.toFixed(2)}"`),
      who, x: q.x, y: q.y, h: hpx, mood: c2.mood, stage: c2.stage,
    });
  }
  return out;
}

function drawVenueCrabs(w, st, view, items) {
  if (st.scene === 'split') {
    const mk = splitCrabMarkers(w, st, view);
    for (const m of mk) if (m.svg) items.push({ s: m.svg, z: Infinity, hit: null });
    return mk.map((m) => ({ who: m.who, x: m.x, y: m.y, h: m.h, mood: m.mood, stage: m.stage }));
  }
  const pose = st.venuePose || {};
  const t = st.t;
  const show = (who) => view.crabs.includes(who);
  const maleX = pose.maleX, femaleX = pose.femaleX;
  const hasM = show('male') && maleX !== null && maleX !== undefined;
  const hasF = show('female') && femaleX !== null && femaleX !== undefined;
  if (!hasM && !hasF) return [];
  const out = [];
  // 并排锁定：两只靠近时按"母左公右"并排（锚点 = 中点、间距 0.95 个身高）；
  // 远离时（片尾公蟹从 230 m 冲进来）各画在自己的真实位置。权重连续，跨阈值不跳帧
  const L = hasM && hasF ? pairLock(pose) : 0;
  const baseY = pose.y ?? 0;      // 主舞台上的螃蟹要抬到台面高度
  const put = (who, wx, wz, dxPair, anchor) => {
    const q = w.project(wx, wz, baseY);
    if (!q.ok) return null;
    // 屏幕位置：真实投影 → 并排位置 按 L 混合
    const x = q.x + ((anchor ? anchor.x + dxPair : q.x) - q.x) * L;
    const y = q.y + ((anchor ? anchor.y : q.y) - q.y) * L;
    // 客户 2026-11-09：**戴冠序列（stage 2）的素材偏小** ⇒ 按 growOf(stage) 补 1.5 倍。
    //   只跟 stage 走、没有时间缓入；锚点在脚底 ⇒ 向上长，不离地。
    const grow = growOf(st[who] && st[who].stage);
    const hpx = clamp(VENUE_CRAB_M * (q.ppp || 0), VENUE_CRAB_MIN_PX, 520) * grow;
    const c = st[who];
    const sex = who === 'male' ? 'm' : 'f';
    const cad = c.mood === 'cheer' || c.mood === 'win' ? 1.5 : 2.35;
    const phase = (t * cad + (who === 'female' ? 0.5 : 0)) % 1;
    const ringColor = who === 'male' ? THEME.route.full : THEME.route.half;
    const still = who === 'male' ? (pose.maleStill ?? pose.still) : (pose.femaleStill ?? pose.still);
    // 分流副本：背面奔跑（m1_back / f1_back 四帧序列）+ 转向时的小幅侧倾；逆光长影取代接地小椭圆
    const lean = who === 'male' ? (pose.maleLean || 0) : (pose.femaleLean || 0);
    // 没有 AI 位图时回退到赛事包矢量角色（crabSVG 原生高约 208 单位，按 hpx 缩放对齐）
    const crabBody = hasSprites()
      ? crabSprite({ sex, stage: c.stage, mood: c.mood, phase, facing: 0, heightPx: hpx, moving: !still, ring: !!ringColor && !pose.noLock, ringColor, back: !!pose.back })
      : grp(`scale(${(hpx / 208).toFixed(3)})`, crabSVG({ sex, stage: c.stage, mood: c.mood, phase, facing: 0 }));
    items.push(
      grp(T(x, y) + (lean ? ` rotate(${f(lean)})` : ''), contactShadow(hpx, pose.longShadow || 0) + crabBody, 1, ` data-crab="${who}" data-x="${f(x)}" data-y="${f(y)}" data-venue="1" data-hpx="${f(hpx)}" data-ppp="${q.ppp.toFixed(3)}" data-d="${q.d.toFixed(2)}"`),
      q.d + 2, { x, y, z: q.z },
    );
    // 加冕特效：副本里按"副本里真正变成 stage 2 的那一刻"起算（pose.maleCrownAt / femaleCrownAt），
    // 不用全图时间轴的 fxT —— 母蟹的 fxT 在她撞线之前，直接用会在冲刺途中就放烟花
    const crownAt = who === 'male' ? pose.maleCrownAt : pose.femaleCrownAt;
    if (c.stage >= 2 && crownAt != null && t - crownAt >= 0 && t - crownAt <= 3.4) items.push(crownFx({ x, y }, hpx / 236, t - crownAt, who), -1e9, null);
    return { who, x, y, h: hpx, mood: c.mood, stage: c.stage };
  };
  if (hasM && hasF) {
    const mid = w.project((maleX + femaleX) / 2, ((pose.maleZ ?? 0) + (pose.femaleZ ?? 0)) / 2, baseY);
    // 戴冠后要跟着拉开站位，否则两只叠在一起
    const gap = clamp(VENUE_CRAB_M * (mid.ppp || 0), VENUE_CRAB_MIN_PX, 520) * 0.95
      * (0.5 + 0.5 * Math.max(growOf(st.male.stage), growOf(st.female.stage)));
    const anchor = mid.ok ? mid : null;
    const fo = put('female', femaleX, pose.femaleZ ?? 0, -gap / 2, anchor);
    const mo = put('male', maleX, pose.maleZ ?? 0, +gap / 2, anchor);
    if (fo) out.push(fo);
    if (mo) out.push(mo);
  } else if (hasM) { const o = put('male', maleX, pose.maleZ ?? 0, 0, null); if (o) out.push(o); }
  else { const o = put('female', femaleX, pose.femaleZ ?? 0, 0, null); if (o) out.push(o); }
  return out;
}
