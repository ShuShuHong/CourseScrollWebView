# 赛事实例数据 Checklist

> 给新一场赛事准备"实例数据"时按此清单逐项收集/制作。
> 参照案例：`races/lanwan-2026`（虚构城市澜湾市，全部地名/地标杜撰，可直接当模板复制）。
>
> 用法：`robocopy races\lanwan-2026 races\<你的id> /E` → 按下表逐项替换 → `npm run race <你的id>` 切换 → `npm run preview` 重建。

## 一、身份层（必须）

| # | 项目 | 位置 | 说明 |
|---|------|------|------|
| 1.1 | 赛事全称（含冠名） | `races/<id>/race.js` → `RACE.brand` | 片头/门头/落版，例：`2026「澜湾银行」澜湾马拉松` |
| 1.2 | 短名 / 英文名 | `race.js` → `short` / `en` | 图卡、数据卡、落版副标题 |
| 1.3 | 城市 · 区县 | `race.js` → `city` | 地图标题、简介行 |
| 1.4 | 举办日期 | `race.js` → `date` / `dateCN` | 落版 + 片尾口播 |
| 1.5 | 赛制（全马/半马里程、关门、集结区） | `race.js` → `routes` | 决定双角色各跑哪条线 |
| 1.6 | 海拔区间与爬升 | `race.js` → `elevation` | 数据卡 + 海拔窗 |
| 1.7 | 吉祥物表 | `race.js` → `mascots` | 几只、几阶段、几种情绪、名字/加冕名；素材 id 规则 `{id}{stage}_{mood}` |
| 1.8 | 赛道水域/主区域名 | `race.js` → `landmark` | AI 生图提示与文案兜底 |

## 二、赛事包 config（13 个文件，缺一不可）

`npm run race` 的完整性校验（`tools/set-race.mjs → validatePack`）要求以下全部存在：

| # | 文件 | 要准备什么 |
|---|------|-----------|
| 2.1 | `config/theme.js` | 三套画风的色板；一般直接沿用，只改 `DEFAULT_STYLE` |
| 2.2 | `config/story.js` | 全片"剧本"：分镜、地标卡/贴纸/数据卡出现的公里点与文案、机位表、事件表。地标名称在此定义（`STICKERS` / `CARDS` / `POINTS`） |
| 2.3 | `config/schedule.js` | 25+ 段口播的排程、场景切分（**主会场副本 / 地图主场景 / 分流副本**）、场景色 |
| 2.4 | `config/voice.js` | 口播原文（`ORIGINAL` / `LINES` / `PARAGRAPHS`），每句里程窗口 |
| 2.5 | `config/vo1031.js` | 配音段落表 + 字幕（与录音分段一一对应） |
| 2.6 | `config/inserts.js` | 后补录的插句（接在哪段后、自带公里窗口、字幕位移） |
| 2.7 | `config/roads.js` | **路名锚点表**：路名 + 全马里程；覆盖整条赛道、无缝；末尾 `SPLIT_ROADS` 填分流路牌两侧路名。配套 `node tools/check_*.mjs` 自检 |
| 2.8 | `config/labels.js` | 旧版取字点标签（保留兼容，新项目主要维护 roads.js） |
| 2.9 | `config/keyframes.js` | 关键帧（地标特写机位、标题）+ `ENV_SHOTS` 环境镜头 |
| 2.10 | `config/sfx.js` | 音效提示点（起跑枪、欢呼、卡片弹出…）+ 环境声床 |
| 2.11 | `config/bgm.js` | BGM 文件路径、小节对齐、地标点 |
| 2.12 | `config/split.js` | **分流副本**数据：全/半马分流岛几何、引导牌、两角色分道轨迹 |
| 2.13 | `config/venue.js` | **主会场副本**数据：集结区/安检/舞台/拱门的平面坐标与镜头窗口（坐标系与 `data/venue_plan.json` 对应） |

## 三、角色与美术

| # | 项目 | 位置 | 说明 |
|---|------|------|------|
| 3.1 | 矢量兜底角色 | `races/<id>/art/crab.js` | 无位图时的程序化角色，必须存在（校验项） |
| 3.2 | 角色锚点表 | `races/<id>/mascots/cut.json` | 每张位图的脚底锚点；纯矢量兜底可放 `{}`（校验项） |
| 3.3 | 角色位图（可选） | `races/<id>/mascots/<画风>/cut/*.png` | AI 生成 → `npm run assets` 抠图打包；缺省时引擎自动用 3.1 |
| 3.4 | 地标图 | `assets/landmarks/<画风>/<id>.jpg` | **全局目录**（非赛事包内）。贴纸取图顺序：PHOTOS → 此目录 jpg → 引擎内置 SVG 简笔画兜底。案例的 9 张 SVG 简笔画在 `races/lanwan-2026/landmarks/`，可用 `node tools/shot.mjs in.svg out.jpg 640 400` 栅格化后按 id 放入 |
| 3.5 | 片尾图 | `assets/endcard/` | 全局目录，按赛事替换 |
| 3.6 | 起终点拱门/主视觉 | `mainset/` | 全局目录，按赛事替换 |

## 四、赛道几何（全局 `data/`，非赛事包内）

| # | 项目 | 命令 | 说明 |
|---|------|------|------|
| 4.1 | 官方路线图 .ai | — | 放入 `races/<id>/source/` 备查 |
| 4.2 | 提取 + 建模 | `npm run data` | 从 .ai 提取图层 → `data/course.json` / `world.json` / `venue_plan.json`（会覆盖上一份赛事的几何，换赛事需重跑） |
| 4.3 | 主会场平面 | 同上 | venue.js 的坐标系基准 |

## 五、音频

| # | 项目 | 位置 | 说明 |
|---|------|------|------|
| 5.1 | 口播整轨 + 分段 | `audio/`（全局） | 分段命名与 `vo1031.js` 段表对应 |
| 5.2 | 插句录音 | `audio/` | 与 `inserts.js` 的 `file` 字段一致 |
| 5.3 | BGM | `audio/` + `bgm.js` | 换曲后重跑 `npm run bgm` 分析小节 |
| 5.4 | 时间轴/音效床 | `npm run timeline && npm run sfx` | 确定性再合成，产物在 git 忽略目录 |

## 六、验收

```powershell
npm run race <id>        # 切换（缺文件会列出来）
npm run race             # 复查：目标行前无 ⚠
npm run bootstrap        # 全量重建（assets+timeline+sfx+preview）
# 打开 dist/stage-B-导航地图.html 人工过一遍
```

逐项自检（按需）：`npm run voice`（口播对账）、`npm run sync`（音画同步）、`npm run stations`、`npm run layers`、`npm run check`（设定集）。

## 注意事项

- **引擎零地名**：城市/赛事/吉祥物名只允许出现在 `races/<id>/`，不要写进 `src/`。
- **会泄露上一场赛事的三处全局目录**：`data/`、`assets/landmarks`、`assets/endcard`、`mainset/`、`audio/` —— 交付前务必确认已替换。
- **页面模板品牌槽**：`src/pages/*.html` 里的赛事全称一律写 `<!--BRAND-->` 占位，build 时自动替换为当前赛事包的 `RACE.brand`；新增模板页照此写法，不要把赛事名写进模板。
- **引擎里的派生地名**（不要在引擎里写死，已配置化，准备数据时保证源头正确即可）：
  - 落版"起终点"行（`src/art/endcard.js`）与副本俯视图标题（`src/pages/plan.js`）取自 `story.js` 的 `POINTS` 里 `kind:'start'` 那一条的 `name`；
  - 副本俯视图的横路名取自 `roads.js` 的 `SPLIT_ROADS.half`；
  - 分镜表"口径核对"表（`src/pages/board.js`）的项目点名按公里数就近匹配 `POINTS`。
- lanwan-2026 是**结构示例**：里程/帧号/时长沿用占位值，换真赛事时以真实口播与官方图重排。
