# CourseScrollWebView

> 把一条马拉松 / 越野 / 骑行赛道，做成 2 分钟的城市级介绍片。
> 本仓是 **模板**：引擎通用，赛事内容全部外置在 `races/<赛事>/`。

当前内置示例赛事：**`races/lanwan-2026`（2026「澜湾银行」澜湾马拉松）**，
它同时是本模板的验收基准 —— 重构后与原件逐像素一致（见文末验证）。

---

## 一、目录结构

```
CourseScrollWebView/
├── src/
│   ├── engine/          # 通用引擎：three.js 地图 + SVG 图层 + 逐帧合成（不含任何赛事信息）
│   ├── art/             # 通用美术：角色序列帧装配、图卡、图标、门头、落版
│   ├── pages/           # 预览器（stage）、设定集（bible）、分镜表（board）、对照表（plan）
│   └── config/
│       ├── active-race.js   # ← 只有这一行决定用哪个赛事包
│       ├── view.js          # 引擎参数（地名缩放等），与赛事无关
│       ├── bend.js          # 引擎参数（弯道中心线），与赛事无关
│       └── *.js             # 13 个**转发壳**，指向当前赛事包（由 npm run race 生成，别手改）
├── races/
│   └── lanwan-2026/
│       ├── race.js          # ★ 赛事身份层：全称/短名/英文名/城市/日期/距离/关门/角色表
│       ├── config/          # 赛事内容：时间轴、里程窗口、口播、路名、机位、音效、会场几何
│       ├── art/crab.js      # 角色矢量兜底（src/art/crab.js 是转发壳）
│       ├── mascots/         # 角色素材：cut.json 锚点表 + <画风>/{cut,seq,seq_sheet}
│       └── source/          # 官方设计稿（.ai）、客户脚本 —— 重抽赛道数据时才用
├── assets/ audio/ data/     # 素材、音频、赛道数据（示例赛事用）
├── tools/                   # 构建、渲染、自检（20+ 套 check_*.mjs）
└── dist/                    # 构建产物（stage*.html / 设定集 / 字幕表 …）
```

**设计原则**：引擎里不许出现任何城市的名字。跑 `grep -rn "澜湾" src/engine src/art` 应当只剩注释。
身份信息全部来自 `races/<id>/race.js`，主题文件 `theme.js` 的 `BRAND` 也由它派生。

---

## 一·五、体积口径（别把素材仓库撑爆）

**入库 126.8 MB**（473 个文件）。曾经是 515 MB —— 差的那些全是可重建产物和冗余素材。

| 部分 | 大小 | 性质 |
|---|---|---|
| `races/<id>/mascots` | 57 MB | ✅ 角色素材（cut 与 seq 都已转**无损 WebP**；跟着赛事包走） |
| `audio/1031` | — | 🗑 已清理：客户原声整轨/分段不再保留，口播由 edge-tts 现场合成 |
| `assets/landmarks` | 20 MB | ✅ 运行时素材（AI 出的图卡插画） |
| `races/<id>/art` | 20 KB | ✅ 角色矢量兜底 |
| `races/*/source` | 8 MB | ✅ 官方 `.ai` 设计稿 + 客户脚本 |
| `assets/photos` | 4 MB | ✅ `card_art.py` 的构建输入（已压到 1800px JPEG） |
| `audio/bgm` + 补录 | 7 MB | ✅ bgm 已转 mp3（本来就不进成片） |
| `assets/endcard` | 3 MB | ✅ 落版底图 |
| `mainset/` | 0.6 MB | ✅ **门头字条 / 门头 logo / 舞台背板**（漏了它会静默掉字，见下） |
| `src tools races data docs` | 2.4 MB | ✅ 代码本体 |
| `dist/ out/ node_modules/ _work/` | — | ❌ 全部 gitignore |
| `audio/sfx/` | (31 MB) | ❌ **纯合成产物**，`npm run sfx` 每次清空重建 |
| `audio/tts/` | (22 MB) | ❌ 纯合成产物，`npm run timeline` 用 edge-tts 逐句重建 |

**新克隆的三步起步**

```bash
npm ci            # 依赖
npm run bootstrap # assets → timeline → sfx → preview（一条龙）
```

### 瘦身时踩过的两个坑（都写进工具里了）

1. **`mainset/` 漏拷 = 门头字条静默掉字**
   `pack_assets.py` 会读 `mainset/arch-white.png`、`logo+title.png`、`stage-back.png` 内嵌成
   `__ASSETS.archLogo / venueLogo / stageBack`。缺了这三张，门头会自动回落到「用字体画一遍品牌名」——
   页面不报错、控制台不警告，只有逐帧比对才看得出（实测 F620 有 1115 个像素不同）。
   **只拷 `assets/` 是不够的，构建输入还有 `mainset/`。**

2. **口播不再引用客户整轨**
   成片口播由 `tools/tts_edge.mjs` 按 `vo1031.js` / `inserts.js` 的文本逐句合成
   （edge-tts），再按原排程时刻贴合回 `audio/tts/timeline.wav`。
   `audio/1031/` 客户原声已清理，`seg/`、`build_timeline_vo.py` 都不再参与构建。

### 关于 FLAC

原本打算把 `seg/` 和 `1031.wav` 转 FLAC（省 ~15 MB），实测**没必要**：
`audio/sfx/`（31 MB）和 `audio/tts/`（22 MB）本身就是纯构建产物，直接 gitignore 更干净；
`audio/1031/` 客户原声已整体清理。省下的已经比 FLAC 更多，且零风险。

## 二、换一场赛事（三步）

### 1. 复制赛事包

```bash
cp -r races/lanwan-2026 races/berlin-2026
```

### 2. 改 `races/berlin-2026/race.js`

```js
export const RACE = {
  id: 'berlin-2026',
  brand: 'BMW BERLIN-MARATHON 2026',     // 全称（片头/门头/落版）
  short: '柏林马拉松',                    // 图卡、口播
  en: 'BERLIN MARATHON',
  city: 'Berlin', country: 'DE',
  date: '2026-09-27', dateCN: '9月27日',
  routes: {
    full: { label: '全马', distance: 42.195, kmLabel: '全程', cutOff: '6:15', startZones: 'A–E' },
  },
  elevation: { min: 34, max: 68, gain: 74 },
  mascots: { left: { id: 'bear', name: '柏林熊 A' }, right: { id: 'bear', name: '柏林熊 B' } },
  landmark: { water: '施普雷河', area: '柏林' },
};
```

只有一条路线（没有半马）时，把 `routes.half` 删掉并把 `config/` 里所有引用 half 的地方去掉 ——
**半马是可选赛制**，引擎按「至少一条路线」工作。

### 3. 改比赛内容（`races/<id>/config/`）

| 文件 | 里面是什么 | 换赛事时怎么改 |
|---|---|---|
| `story.js` | 全片时间轴：`DURATION`、关键帧、图卡/贴纸窗口、公蟹里程锚点 | 先定片长（= 音轨时长），再用排程自动推 |
| `schedule.js` | **排程唯一入口**：`SEG_KM`（每句口播的公里窗口）、`PAUSE`、`GAPS`、段尾停留 | 这是调节奏的地方，改这一个文件就够 |
| `voice.js` | 口播文稿 + 40 多条句子的对齐 + 标点自检 | 客户给稿 → 换 `ORIGINAL` → 重跑 `npm run timeline`（edge-tts 重合成） |
| `vo1031.js` | 段表 + 42 条字幕（**冻结时间轴**） | 直接改 `CUE_LINES` 的 `vo`；`t0/t1` 不要动，否则画面与音轨会错位 |
| `inserts.js` | 后补句（不参与 25 段排程）+ 字幕位移 | 客户临时加一句时用 |
| `roads.js` | 沿赛道的路名锚点（Voronoi 切段，每段中点一个标签） | 按官方图填 `{name, km}`；`noLabel` 段可留空 |
| `keyframes.js` | 镜头关键帧（每个地标一段推拉） | 跟着地标改 |
| `sfx.js` | 音效事件（按里程/时刻钉）+ `MIX` 音量 | 折返、上桥、欢呼等事件点 |
| `bgm.js` | 背景音乐口径（默认不进成片） | — |
| `split.js` | **可选**：分流丁字路口的 3D 几何（有分岔才需要） | 单一路线可删 |
| `venue.js` | **可选**：主会场 / 起跑 / 冲线三个 3D 会场副本 | 没有官方平面图的赛事可整体关掉（见下） |
| `labels.js` | 官方图取字点（旧口径，仅备查） | 不用改 |

### 4. 切换并构建

```bash
npm run race berlin-2026     # 重写 13 个转发壳 + active-race.js
npm run preview              # 构建 dist/stage*.html
npm run render -- --an       # 4K 渲染（--an 只出画面；音轨另出）
```

`npm run race` 不带参数会列出所有赛事包并标出当前激活的那个，顺带检查包是否齐全。

---

## 三、每场赛事必须准备的数据

| 数据 | 放哪 | 说明 |
|---|---|---|
| 赛道轨迹 | `data/course.json` | 由 `npm run data` 从官方 kmz/ai 抽出；也可以手工给经纬度 |
| 地名锚点 | `config/roads.js` | 每条经过的路一个锚点，自动切成连续区段 |
| 补给/医疗/厕所点位 | `data/stations.json`（或 config 内联） | 图标簇按 ±2 km 显隐 |
| 口播文本 | `config/vo1031.js` / `inserts.js` | 不再需要客户录音；edge-tts 按文本逐句合成，`npm run timeline` 铺轨 |
| 角色位图/序列帧 | `races/<id>/mascots/` | 按 `RACE.mascots.spec.idTemplate` 命名 + `cut.json` 锚点 |
| 地标照片 | `assets/photos/` | 文件名 = 地标 id |
| 品牌素材 | `assets/endcard/`、`__ASSETS.venueLogo/archLogo` | 官方 logo 用位图，**不要用字体复刻** |

---

## 三·五、角色表怎么填（新增赛事最常错的地方）

角色**不再写死在引擎里**。`src/art/sprites.js` 只做两件事：按模板拼素材 id、按固定回退链兜底。
表在 `races/<id>/race.js`：

```js
mascots: {
  spec: {
    stages: 3,                                 // 成长阶段 0..stages-1
    moods: ['run', 'cheer', 'tired', 'win'],   // 情绪名
    back: true,                                // 是否支持背面（<id><stage>_back）
    idTemplate: '{id}{stage}_{mood}',          // 素材 id 模板
    stageName: ['新手', '升级', '{crown}'],     // 设定集文案用
  },
  actors: [                                    // 顺序 = 画面左→右
    { id: 'f', sex: 'f', label: '母蟹', crown: '蟹后', route: 'half', routeLabel: '半马', side: 'left' },
    { id: 'm', sex: 'm', label: '公蟹', crown: '蟹王', route: 'full', routeLabel: '全马', side: 'right' },
  ],
  showcase: [                                  // 设定集「01 角色」展示哪几张
    { actor: 'm', stage: 0, mood: 'run', caption: 'Lv1 新手 · 奔跑' },
    // ……
  ],
}
```

**素材 id 必须与 `idTemplate` 对得上**：默认模板 `{id}{stage}_{mood}` + actor `m` + stage 1 + mood run ⇒ `m1_run`。
素材放在 `races/<id>/mascots/<画风>/cut/m1_run.webp` 等位置，锚点写进 `mascots/cut.json`。

### 只有一只角色 / 没有成长阶段 / 不要背身

改 spec 就行，引擎不用动：

```js
spec: { stages: 1, moods: ['run', 'win'], back: false, idTemplate: '{id}_{mood}' },
actors: [{ id: 'bear', sex: 'bear', label: '柏林熊', route: 'full', side: 'center' }],
```

### 选帧回退链（引擎里的固定规则）

```
back        → <id><st>_back → <id>1_back
stage 末档   → 先给 <id><last>_win
mood=tired  → <id>max(1,st)_tired → <id>1_tired
mood=cheer/win → <id><st>_cheer → <id><st>_run      ← 缺 cheer 也**不降形态**
兜底        → <id><st>_run → <id>1_run → <id>0_run
```

**所以最少只要两张图就能跑全片**：`<actor>0_run` + 任意一张；其余全部回退到它。

### 自检

```bash
node tools/check_mascots.mjs        # 13 项：spec 合法 / 角色唯一 / 底图存在 /
                                    # showcase 齐全 / 全部（角色×阶段×情绪）都能选到图 / 越界钳制 / 目录结构
```

换赛事后第一时间跑这个 —— 「表里声明了、素材里没有」是这类重构最常见的坑。

## 四、没有 3D 会场平面图的赛事怎么办

`venue.js` 是本模板唯一的「官方平面图依赖」：它按 `.ai` 里的米制重建主会场、
起跑门头、C 区三岔口。没有平面图的赛事：

1. `races/<id>/config/venue.js` 里把 `VENUE_WINDOWS` 清空（只留 `finale` 段也可）；
2. `schedule.js` 的 `CUE_SCENE_CUT` 全部删掉 —— 排程就不会切进副本；
3. 片尾落到「全图 + 落版」即可，成片逻辑不变。

---

## 五、验证（本模板立过的规矩）

重构/换赛事之后必须跑：

```bash
npm run preview      # 构建三画风
node tools/check_mascots.mjs     # 角色表 vs 素材（13 项）
node tools/check_roads.mjs       # 地名覆盖（空白段豁免）
node tools/check_windows.mjs     # 每句口播落在声明的公里窗口里
node tools/check_rhythm.mjs      # 配速与画面同步
node tools/check_player.mjs      # 播放器帧号/跳转/布局
node tools/check_venue.mjs       # 副本场景 133 项
```

**模板基准**：`races/lanwan-2026` 在重构前后（引擎抽离 + 身份层外置 + 字体重生成）
用同一帧（F1368）截图对比 —— 换用同一份 `fonts.css` 时 **md5 完全一致**，
说明抽离没有改动任何一个像素。

---

## 六、字体

成片只用两族字体，全部 base64 内嵌（`dist/fonts.css`），不依赖系统：

| 字族 | 文件 | 用途 |
|---|---|---|
| HMSans | HarmonyOS Sans SC Bold / Medium | 全部中文（字幕、路名、图卡、仪表、落版） |
| FigtreeX | Figtree Black | 全部数字与拉丁（公里牌、里程、时间、英文名） |

改了任何文案（尤其赛事包里的台词）都要跑 **`npm run fonts`** —— 它扫描 `src/` **和** `races/`
下所有 `.js/.html/.json/.srt` 收集字符做子集；漏跑会出现个别字掉回系统雅黑、字形不一致。

---

## 七、渲染

```bash
npm run render -- --an --from 0 --to 499 --out out/s0.mp4     # 分段（每段 500 帧）
ffmpeg -f concat -safe 0 -i list.txt -c copy \                 # 零重编码拼接
  -bsf:v h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1 \
  dist/成片.mp4
ffmpeg -i dist/stem-vo.wav -ar 48000 -ac 2 dist/音轨-纯口播-48k.wav   # 口播分轨
ffmpeg -i dist/stem-sfx.wav -ar 48000 -ac 2 dist/音轨-纯音效-48k.wav  # 音效分轨
```

- 分段渲染必须带 `--an`，否则每段各自混一遍音轨。
- `-c copy` 会丢容器色彩标记，必须补 `-bsf:v h264_metadata`，否则播放器按 bt601 解释、全片偏黄。
- 地名缩放默认 1.4（`src/config/view.js`），4K 想改大用 `--names 2.5`。

---

## 八、这套模板解决过的坑（别重踩）

- **`maleKm` 必须分段线性**，不能 pchip（锚点处斜率被抹平 → 段末「收脚」）。
- **桥必须用 t 的纯函数**（`bridgeState(t)`），不能靠实例变量记忆播放历史 —— 分段渲染每段都是新页面。
- **字幕位移只动上屏、不动声音**；口播模型是「音频时长 → 公里窗口」，速度逐句不同。
- **地名标签只贴路面**，不做任何躲人的位移；层序是 ground → 卡片 → 路名 → 公里牌 → 角色 → HUD。
- **卡片文字只允许被角色遮挡**；路名让卡片、卡片让角色，顺序错了就看不见字。
- **文字必须 `texText()` 自动收缩**（赛事全称换成长名字会冲出纹理）。
- **`write_file` 拒绝覆盖分页读过的文件** —— 用 `os.remove()` 后重写。
