// ════════════════════════════════════════════════════════════════════════
//  赛事包身份层 —— CourseScrollWebView
//
//  这是**一场赛事**的全部身份信息。引擎（src/engine、src/art、src/pages）里
//  不许出现任何城市的名字、赛事的全称、吉祥物的名字 —— 一律从这里取。
//
//  新增一场赛事：复制 races/lanwan-2026 → races/<id>，改这个文件 + config/ 下的
//  里程/路名/口播，然后 `npm run race <id>` 切换。详见 TEMPLATE.md。
//
//  ⚠️ 本包是**虚构案例**：澜湾市、云澜湖、全部街道与地标均为杜撰，
//     仅作模板示范，不对应任何真实城市与赛事。
// ════════════════════════════════════════════════════════════════════════

export const RACE = {
  /** 赛事包 id = races/ 下的目录名，也是 `npm run race <id>` 的参数 */
  id: 'lanwan-2026',

  /** 片头/门头/落版上的全称（客户给什么就写什么，含书名号里的冠名商） */
  brand: '2026「澜湾银行」澜湾马拉松',
  /** 短名：图卡、数据卡、口播里用 */
  short: '澜湾马拉松',
  /** 英文名：落版副标题、门头背板 */
  en: 'LANWAN MARATHON',
  /** 城市 / 国家（中文简介行、地图标题） */
  city: '江州 · 澜湾',
  country: 'CN',

  /** 举办日期（落版与片尾口播） */
  date: '2026-11-08',
  dateCN: '11月8日',

  /** 赛制：本项目按「一场赛事可能有多条路线」建模 */
  routes: {
    full: { label: '全马', distance: 42.195, kmLabel: '全程', cutOff: '13:40', startZones: 'A、B、C' },
    half: { label: '半马', distance: 21.0975, kmLabel: '半程', cutOff: '10:40', startZones: 'A、B' },
  },
  /** 海拔区间与爬升（数据卡 + 海拔窗） */
  elevation: { min: 4, max: 26, gain: 61 },

  /**
   * ── 角色表（吉祥物）──────────────────────────────────────────────
   *  引擎**不再假设**「两只 / 3 阶 / 4 情绪」，全部读这里：
   *    spec    选帧规则（阶段数、情绪名、id 模板、是否支持背身）
   *    actors  出场角色（顺序 = 画面左→右）；素材 id = actor.id + 阶段 + 情绪
   *    showcase 设定集「01 角色」要展示哪几张（可省，省了就自动每个阶段挑代表动作）
   *  素材放 races/<id>/mascots/（cut.json + <画风>/cut|seq|seq_sheet），
   *  路径由 tools/mascot_path.py 解析，跟着 active-race.js 走。
   */
  mascots: {
    spec: {
      stages: 3,                                   // 成长阶段 0..stages-1
      moods: ['run', 'cheer', 'tired', 'win'],     // 情绪的合法值（缺图按下面的链回退）
      back: true,                                  // 是否支持背面视角（<id><stage>_back）
      idTemplate: '{id}{stage}_{mood}',            // {id}=角色 id / {stage}=阶段序号 / {mood}=情绪
      stageName: ['新手', '升级', '{crown}'],       // 设定集文案用（{crown} 取 actor.crown）
    },
    actors: [
      { id: 'f', sex: 'f', name: '湾湾', label: '湾湾', crown: '湖后',
        route: 'half', routeLabel: '半马', side: 'left', distance: 21.0975 },
      { id: 'm', sex: 'm', name: '蓝蓝', label: '蓝蓝', crown: '湖王',
        route: 'full', routeLabel: '全马', side: 'right', distance: 42.195 },
    ],
    showcase: [
      { actor: 'm', stage: 0, mood: 'run', caption: 'Lv1 新手 · 奔跑' },
      { actor: 'm', stage: 0, mood: 'cheer', caption: 'Lv1 新手 · 起跑欢呼' },
      { actor: 'm', stage: 1, mood: 'run', caption: 'Lv2 升级 · 奔跑' },
      { actor: 'm', stage: 1, mood: 'tired', caption: 'Lv2 升级 · 爬坡疲惫' },
      { actor: 'm', stage: 2, mood: 'win', caption: 'Lv3 湖王 · 冲线' },
      { actor: 'f', stage: 0, mood: 'run', caption: 'Lv1 新手 · 奔跑' },
      { actor: 'f', stage: 0, mood: 'cheer', caption: 'Lv1 新手 · 起跑欢呼' },
      { actor: 'f', stage: 1, mood: 'run', caption: 'Lv2 升级 · 奔跑' },
      { actor: 'f', stage: 1, mood: 'tired', caption: 'Lv2 升级 · 爬坡疲惫' },
      { actor: 'f', stage: 2, mood: 'win', caption: 'Lv3 湖后 · 冲线' },
    ],
  },

  /** 赛道所在水域 / 主地标（生成提示、文案兜底用） */
  landmark: { water: '云澜湖', area: '澜湾' },
};
