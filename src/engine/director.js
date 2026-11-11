// 导演：把 t 变成一帧画面（three.js 底图 + SVG 叠加层）。render(t) 为纯函数式调用，可任意跳帧。
import { World } from './world3d.js';
import { VenueWorld } from './venue3d.js';
import { SplitWorld } from './split3d.js';
import { venueAt, venuePose, venueCamera, venueAlpha, VENUE_WINDOWS, CROSS, WIN_T } from '../config/venue.js';
import { stateAt, activeEvents, eventsOf } from './timeline.js';
import { liftAt, BRIDGE_BASE } from './course.js';
import { SPLIT, ELEV_WIN, T_FEMALE_FINISH } from '../config/story.js';
import { THEME } from '../config/theme.js';
import { crabDefs } from '../art/crab.js';
import { archDefs } from '../art/props.js';
import { easeOutBack, clamp, smooth } from '../art/svg.js';
import { drawCrabs, drawStart, drawWarn } from './viewlayer.js';
import { drawKm, drawRoadNames, drawStations, drawStickers, drawUturns, drawFork, drawSprint } from './annotations.js';
import { drawHUD, hudDefs } from './hud.js';
import { Layer } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

export class Director {
  constructor(root, { dpr = 1 } = {}) {
    this.W = 1920; this.H = 1080;
    root.style.cssText += ';position:relative;width:1920px;height:1080px;overflow:hidden;background:#0B2440';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px';
    root.appendChild(cv);
    // 副本场景（主会场近景）单独一块画布：透明底叠在全图之上，只在自己的视口里画东西
    const cvV = document.createElement('canvas');
    cvV.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px';
    root.appendChild(cvV);
    // 第二副本（分流丁字路口）再一块画布：两套场景各画各的，切场景时只切 canvas 的 opacity
    const cvS = document.createElement('canvas');
    cvS.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;opacity:0';
    root.appendChild(cvS);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1920 1080');
    svg.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;pointer-events:none';
    svg.innerHTML = `<defs>${crabDefs()}${archDefs()}${hudDefs()}<clipPath id="vc-main"><rect id="vc-main-r"/></clipPath><clipPath id="vc-left"><rect id="vc-left-r"/></clipPath></defs><g id="ov"></g>`;
    root.appendChild(svg);
    this.svg = svg; this.ov = svg.querySelector('#ov');
    this.world = new World(cv, { dpr });
    this.venueWorld = new VenueWorld(cvV, { dpr });
    this.splitWorld = new SplitWorld(cvS, { dpr });
    this.worlds = { course: this.world, venue: this.venueWorld, split: this.splitWorld };
    this.override = null;   // {cam, crabs, hud}
  }

  bridgeState(t) {
    let lift = BRIDGE_BASE, color = THEME.route.bridge1, build = 0;
    for (const e of eventsOf('bridge')) {
      if (t < e.T) continue;
      color = THEME.route[e.color];
      const dt = t - e.T;
      // 客户 2026-11-01：**桥一旦隆起/塔一旦长出来就不许回落**。
      //   原来这里有两个毛病，两个都让人看着像"桥凭空消失"：
      //   ① `down` 项在事件末 1.2 s 把桥面抹平 —— 第二次过桥 54.8–56.0 s，桥就在螃蟹脚下塌了；
      //   ② `build`（桥塔 + 斜拉索）靠实例变量 `this._built` 记忆 —— 分段渲染每段都是新页面，
      //      从 50 s 直接开跳时它还是 null ⇒ 塔和索一根都没有（网页预览从 0 播放则有）。
      //   现在整段改成 t 的**纯函数**：事件结束后按"满隆起 + 已建成"算，既不回退也不依赖历史。
      const up = dt > e.d ? 1 : Math.min(1, easeOutBack(clamp(dt / (e.rise || 1.0))));
      lift = Math.max(lift, BRIDGE_BASE + (1 - BRIDGE_BASE) * up);
      if (e.build) build = Math.max(build, dt > e.d ? 1 : clamp(dt / 1.6));
    }
    return { lift, color, build };
  }

  render(t) {
    const w = this.world, O = this.override || {};
    w.uTime.value = t;
    const br = this.bridgeState(t);
    if (O.lift !== undefined) br.lift = O.lift;
    if (O.bridge) br.color = THEME.route[O.bridge];
    w.setBridge(br.lift, br.color, br.build);
    const lf = (key, km) => liftAt(key, km, br.lift);
    const st = stateAt(t, lf);
    st.bridgeLift = br.lift;   // 供 drawCrabs 算“脚下的桥面有多宽”
    // ── 副本场景（客户 2026-10-28）：开场 / 蟹后冲线 / 片尾三处切到主会场近景舞台
    // 分屏窗口（pane='left'）在分屏真正拉开之前仍按全图处理：否则分屏宽度还是 0 的那一两帧
    // 会切进副本、而副本视口又没建立 —— 两只螃蟹一起消失（check_pair 会抓到）
    // 客户 2026-11-05 ⑥：取消分屏后副本窗口**整屏接管**，不再需要“等分屏拉开才切”的守卫
    const win = O.venue === false ? null : venueAt(t);
    // 2026-11-06：分流副本是另一套场景，标签单独给 'split'（渲染分支用 win.scene 判，这里只做标注/自检）
    st.scene = win ? (win.scene === 'split' ? 'split' : 'venue') : 'course';
    st.venueWin = win;
    if (win) {
      const pose = venuePose(win, t);
      st.venuePose = pose;
      // 副本里的角色状态：以 pose 为准。公母各自一份（片尾母蟹早已是蟹后、公蟹要到 L40 才加冕），
      // 旧的单一 mood/stage 字段只作回退
      const base = pose.still ? 'cheer' : 'run';
      // 客户 2026-10-31 ④：半马窗口里 pose.stage 讲的是**母蟹**的状态，之前公蟹被一起写成 2
      //   ⇒ F1445–1544 右屏的公蟹也顶着皇冠。现在只有 pose 明确给了 maleStage / 公蟹确实在场时才动他
      const maleInPose = pose.maleStage !== undefined || pose.maleX != null;
      const mMood = maleInPose ? (pose.maleMood || pose.mood || base) : st.male.mood;
      const fMood = pose.femaleMood || pose.mood || base;
      const mStage = maleInPose ? (pose.maleStage ?? pose.stage ?? 0) : st.male.stage;
      const fStage = pose.femaleStage ?? pose.stage ?? 0;
      // 加冕特效：副本里 stage 变成 2 的那一刻（与全图 CRAB_STATE 的 crown 时刻一致）
      st.male = { ...st.male, mood: mMood, stage: mStage, venue: true };
      st.female = { ...st.female, mood: fMood, stage: fStage, venue: true };
      // 注意：**不能**覆盖 st.cam —— 分屏时右屏还要用全图机位拍公蟹
      st.venueCam = { target: [0, 0], dist: 60, az: 0, pitch: 20, frame: 0, ...venueCamera(t, win), venue: true };
      // 起跑线 / 终点标识：只有冲线镜头才显示黑白终点棋盘带（客户 2026-10-29 ②）
      const vw0 = win.scene === 'split' ? this.splitWorld : this.venueWorld;
      vw0.setPhase(win.kind);
      // 撒花：撞线那一刻起爆（半马 48.15 / 全马 65.20）—— 客户 2026-10-29 ⑤⑥
      vw0.tt = t;
      // 撒花时刻与冲线 / 主舞台同源（客户 2026-10-29 ⑤⑥）
      // 客户 2026-11-05 ④：**戴皇冠那一刻**才撒花（原来比她解锁蟹后早 0.1s）
      const burst = win.kind === 'half' ? [{ at: CROSS.half + 0.10, origin: [0.9, 0] }]
        : win.kind === 'finale' ? [{ at: CROSS.full, origin: [1.4, 0] }, { at: WIN_T.stage, origin: [20.3, 17.0] }] : [];
      const hit = burst.filter((q) => t >= q.at).pop();
      if (hit && this._confettiAt !== hit.at) { this._confettiAt = hit.at; vw0.setConfetti(hit.origin, hit.at); }
      if (!burst.length) this._confettiAt = null;
      // 发枪波纹：读 story.js 的 gun 事件（A/B 首发、C 第二枪），波纹持续 1.1s
      const guns = activeEvents(t, 'gun');
      vw0.setGun('AB', guns.find((g) => g.zones === 'AB') ? clamp((t - (guns.find((g) => g.zones === 'AB')).T) / 1.1) : -1);
      vw0.setGun('C', guns.find((g) => g.zones === 'C') ? clamp((t - (guns.find((g) => g.zones === 'C')).T) / 1.1) : -1);
    }
    if (O.cam) { st.cam = { ...st.cam, ...O.cam }; st.split = 0; }

    // 赛道线：点亮（开场）、进度、半马变暗
    const rv = activeEvents(t, 'reveal')[0];
    const revealK = t < 1.5 ? 0 : rv ? smooth(rv.k) : 1;
    const R = w.ribbons;
    R.full.uReveal.value = revealK >= 1 ? 99 : revealK * 42.3;
    R.half.uReveal.value = revealK >= 1 ? 99 : revealK * 21.2;
    R.full.uProg.value = O.prog ?? st.male.km;
    R.half.uProg.value = O.prog !== undefined ? fullToHalfSafe(O.prog) : st.female.km;
    R.half.uDim.value = activeEvents(t, 'dimHalf').length ? 0.55 : 0;

    // 视口
    const lw = Math.round(960 * st.split);
    const views = [];
    if (lw > 4) views.push({ id: 'left', rect: { x: 0, y: 0, w: lw, h: 1080 }, cam: st.camLeft, crabs: ['female'] });
    // 客户 2026-10-29 ⑧：母蟹完赛之后（48.44s 起）主图里不再出现她 —— 她已经"在去主舞台的路上"，
    //   片尾 67.00s 才和公蟹一起在主舞台出镜；门头与起终点标志仍然常驻
    //   但 67.00s 起她要在主舞台上出镜（客户 2026-10-29 ⑤），所以只在她"消失"到主舞台之间不画
    // 母蟹完赛之后在全图里不再出镜，直到片尾副本窗口把她和公蟹一起放到主舞台上
    const STAGE_T2 = WIN_T.fin0;
    const femaleGone = t >= T_FEMALE_FINISH && t < STAGE_T2;
    // 客户 2026-11-05 ①：副本窗口里“谁出场”由 venuePose 决定，**不能**再套用全图那条
    //   “母蟹完赛后消失”的规则 —— 原来她 59.08s（T_FEMALE_FINISH）就在副本里被剔除，
    //   于是 1773 帧之后戴冠的蟹后整只不见了（这次报的 bug）。
    const venueWin = !!win;
    views.push({ id: 'main', rect: { x: lw, y: 0, w: 1920 - lw, h: 1080 }, cam: st.cam,
      crabs: O.crabs ?? (venueWin ? ['male', 'female'] : (lw > 4 || femaleGone ? ['male'] : ['male', 'female'])) });

    // 两块画布各自清屏：全图画布铺满，副本画布透明（只在自己的视口里画）
    w.clear();
    this.venueWorld.clear();
    this.splitWorld.clear();
    let svg = '';
    // 深度探针只跟主视口相机走：整帧渲一遍深度到 1/4 分辨率再回读一次，
    // 供“钉在地图上的图元是否被大桥/楼/树挡住”判断（分屏左屏不测，视口很短）
    w.setCamera(views[views.length - 1].cam, views[views.length - 1].rect);
    w.renderProbe();
    for (const v of views) {
      // 这个视口用哪套世界：副本窗口里全屏=venue/split；分屏时左屏=venue、右屏=course
      v.scene = win ? (win.pane === 'left' ? (v.id === 'left' ? 'venue' : 'course') : (win.scene === 'split' ? 'split' : 'venue')) : 'course';
      // 客户 2026-10-30 ②：副本首尾各 0.5s 淡入淡出；淡出淡入期间底下还要画主图，否则会露黑
      v.venueAlpha = v.scene === 'course' ? 0 : venueAlpha(t, win);
      v.needsCourseUnder = v.scene !== 'course' && v.venueAlpha < 0.999;
      const vw = this.worlds[v.scene];
      vw.setCamera(v.scene === 'course' ? v.cam : st.venueCam, v.rect);
      if (v.needsCourseUnder) {          // 淡入淡出：先把主图铺满这个视口
        this.world.setCamera(v.cam, v.rect);
        this.world.renderView(v.rect);
      }
      // 两套副本画布各自只在自己上场时可见（另一块必须先归零，否则切场景会留残影）
      this.venueWorld.renderer.domElement.style.opacity = String(v.scene === 'venue' ? v.venueAlpha : 0);
      this.splitWorld.renderer.domElement.style.opacity = String(v.scene === 'split' ? v.venueAlpha : 0);
      // 2026-11-08：分流副本的螃蟹是**场景内的精灵**（真遮挡），每帧按走位摆一次；
      //   其它场景里必须显式隐藏，否则会残留在 split 画布上
      this.splitWorld.setCrabs(v.scene === 'split' ? st.venuePose : null, st, t);
      // 客户 2026-11-08：起跑窗口显示 A/B/C 分区；冲刺窗口去掉分区、换成水马 + 反光锥
      this.venueWorld.setCorralPhase(win && win.id === 'start' ? 'start' : 'race');
      vw.renderView(v.rect);
      // 六层（自下而上）：地面贴花 → 地图锚定件（按深度排）→ 路名 → **公里牌** → 角色/拱门 → 贴纸卡与屏幕提示
      //   客户 2026-11-01：地名标签一律压在公里牌**下面**（闻莺路那块原来把 12.5 公里的牌子盖掉了）。
      //   公里牌单独成层（而不是并回 deep）是为了让它仍然按深度排序、仍然吃三维遮挡，
      //   但排在路名之后画 —— 否则 km 会比路名先画，照样被盖。
      const ground = new Layer(), deep = new Layer(), names = new Layer();
      const kmL = new Layer(), items = new Layer(), top = new Layer();
      // HUD 占位（贴纸、功能点会避开）：左上状态、右上图例/信息卡、底部字幕、左下海拔窗
      v.occ = [{ x0: 0, x1: 380, y0: 0, y1: 300 }, { x0: 1540, x1: 1920, y0: 0, y1: 170 }, { x0: 0, x1: 1920, y0: 870, y1: 1080 }];
      // 海拔窗现在常驻（片头片尾除外）⇒ 左下角一直当作被占用区域
      if (t >= ELEV_WIN.t0 - 0.45 && t <= ELEV_WIN.t1 + 0.45) v.occ.push({ x0: 0, x1: 610, y0: 730, y1: 1080 });
      if (v.id === 'left' || st.split > 0) v.occ.push({ x0: 0, x1: 1920, y0: 150, y1: 230 });
      const stV = v.scene === 'venue' ? st : st;      // 状态同源，位置由 scene 决定
      if (v.scene === 'course') {
        // 顺序有依赖：先画公里牌（记下牌位）→ 再画补给卡（记下卡片矩形）→ 最后画路名（避让前两者）。
        //   三层各自独立，SVG 里的先后由下面那段模板字符串决定，跟这里的调用顺序无关。
        drawKm(vw, st, v, br.lift, kmL);
        drawStations(vw, st, v, br.lift, deep);
        drawRoadNames(vw, st, v, names);
        drawFork(vw, st, v, ground, top);
        drawSprint(vw, st, v, ground);
        drawStart(vw, st, v, items, ground);
      }
      const info = v.crabs.length ? drawCrabs(vw, stV, v, br.lift, items) : [];
      drawWarn(vw, st, v, info, items);
      if (v.scene === 'course') {
        drawUturns(vw, st, v, ground);   // 折返点＝地面刷漆标识，不占屏幕层
        if (O.hud !== false) drawStickers(vw, st, v, info, top, deep);
      }
      // 三维遮挡：地图锚定件按“离相机多远”从远到近画，且被场景实体挡住的直接不画
      deep.sortFar();
      kmL.sortFar();
      items.sortFar();
      // 分屏时主视口只占右半屏、相机长宽比也变了，深度探针那张“整帧图”不再对应 ⇒ 该段不做场景遮挡
      const probeOn = v.scene === 'course' && v.id === 'main' && st.split <= 0.02;
      let hidden = 0;
      const hid = [];
      // 三维遮挡对「地图锚定件」和「公里牌」两套都生效（牌被桥/树挡住就整块不画）
      const paint = (layer, count) => layer.items.map((o) => {
        if (probeOn && o.hit && vw.occluded(o.hit.x, o.hit.y, o.hit.z)) {
          if (count) hidden++;
          if (count && hid.length < 6) hid.push({ x: Math.round(o.hit.x), y: Math.round(o.hit.y), z: +o.hit.z.toFixed(3), scene: Math.round(vw.viewDist(vw.probeZ(o.hit.x, o.hit.y))), point: Math.round(vw.viewDist(o.hit.z)) });
          return '';
        }
        return o.s;
      }).join('');
      const deepSvg = paint(deep, true), kmSvg = paint(kmL, false);
      this.stats = { view: v.id, scene: v.scene, deep: deep.items.length, hidden, hid };
      const r = v.rect;
      this.svg.querySelector(`#vc-${v.id}-r`).setAttribute('x', r.x);
      this.svg.querySelector(`#vc-${v.id}-r`).setAttribute('width', r.w);
      this.svg.querySelector(`#vc-${v.id}-r`).setAttribute('y', 0);
      this.svg.querySelector(`#vc-${v.id}-r`).setAttribute('height', 1080);
      svg += `<g clip-path="url(#vc-${v.id})">${ground}${deepSvg}${names}${kmSvg}${items}${top}</g>`;
    }
    if (O.hud !== false && !O.noHud) svg += drawHUD(st, { splitTitles: [SPLIT.leftTitle, SPLIT.rightTitle] });
    this.ov.innerHTML = svg;
    this.state = st;
    return st;
  }
}
import { fullToHalf } from './course.js';
const fullToHalfSafe = (k) => (k > 20.8 ? 21.0975 : fullToHalf(k));
