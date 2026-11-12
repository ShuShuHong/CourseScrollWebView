# 画风、角色与场景图层

> 三套画风的素材来源、AI 生图流程、图层与三维遮挡规则。
> 换画风看这里；换赛事看 [TEMPLATE](../TEMPLATE.md)。
> 文中的 `src/config/*` 现在是转发壳，实际改 `races/<ACTIVE_RACE>/config/*`（见 [README](../README.md) 的“改什么去哪里”）。

## 三套画风怎么长出来的

同一份内容，三件“外套”。差异只在两处：`src/config/theme.js` 的一套配色 token，和 `assets/` 下的一套 AI 素材。

| 画风 | 角色 | 地图 | 贴纸 / 图标 |
|---|---|---|---|
| A 卡通 | 粗黑描边 2D 卡通，平涂赛璐璐 | 暖米色地图板 + 白路网 + 高饱和湖水 | 白卡粗描边 / 深色徽章 |
| B 导航地图 | 扁平矢量吉祥物，白色粗描边贴纸感 | 浅灰米底 + 白路网 + 浅水系，已跑赛段变灰 | 白卡 + 定位尖角 + 柔和落影 / 白片彩色圆 |
| C 剪纸 | 平面剪纸，多层彩色纸叠贴 | 米黄纸底 + 红纸包边 + 剪纸树 | 花边纸框 / 红纸盘剪口边 |

### 角色与地标（AI 素材）

用 RunningHub `seedream-v5-pro`（skill: `rh-seedream`，Key 读用户变量 `RH_API`）：

```bash
# 每种画风先出一张“公母并排”的定妆图（1k），确认后再以它为参考图派生单只形态（2k）
uv run --with requests python tools/gen_crabs.py master cartoon
uv run --with requests python tools/gen_crabs.py variants cartoon --only f2_win   # 单张补
uv run --with requests python tools/gen_crabs.py landmarks cartoon                # 7 张地标
```

每个画风 10 个单只形态：`{m,f}` × `{0 新手, 1 升级, 2 王/后}` × 动作（run / cheer / tired / win）。
提示词在 `tools/crab_prompts.py`（改完重跑即可，已存在的图默认跳过，`--force` 重做）。

### 形象一致性（跑偏了怎么修）

AI 出图会出现“同一只螃蟹换了阶段、胸口花纹也变了”这类漂移。处理办法是**定点改图**，不是整只重生成：

```bash
# 以“现图 + 同风格已确认的 Lv2 形态”为双参考图，提示词只描述要改的那一处
uv run --with requests python tools/fix_variant.py f2_win --prompt-file tools/fix_prompts/f2_win.txt
```

- 原图自动备份到 `_work/backup/<style>/<id>_<时间>.jpg`，可随时回滚
- 结果、提示词、任务号、参考图都记进 `assets/crabs/manifest.json`（可复现、可追溯）
- 修完必须：重抠图 → 重打包 → 重截关键帧（见下），并在 `out/qc/fix_<style>.jpg` 看前后对比

### 运动序列（每个形象一段逐帧循环）

每个形象（10 个）都有自己的 4 帧循环：AI 出一张“动作分解图”（同一只角色、四格只改动作相位）→ 自动切格 → 归一化成同一块画布。

```bash
uv run --with requests python tools/gen_seq.py navi            # 宫格图 → assets/crabs/navi/seq_sheet/<id>.jpg
uv run --with numpy --with pillow --with scipy python tools/slice_seq.py navi   # 切格 → assets/crabs/navi/seq/<id>/f0*.png
npm run seq         # 上面两步 + 打包素材 + 重出“动作序列”页
node tools/check_seqpage.mjs   # 冒烟：页面是否真的在播、有无报错
```

- 切格用**列/行投影找大空隙**，不按固定网格切（模型给的宫格不会分毫不差）；标注图在 `out/qc/seq_sheet_<style>_<id>.jpg`
- 归一化：每帧按包围盒高度缩放到 720，**底线对齐 + 视觉中心对齐**，所以换帧不跳（明细页有“基线抖动 / 中心抖动”两个数）
- 引擎侧 `src/art/sprites.js`：有 `seq` 就按相位播帧，没有就退回单张静图；播帧时 bob/squash/tilt 幅度减到 0.55，避免“帧也在动、程序也在动”双重抖动
- 预览页：`dist/动作序列-B-导航地图.html`（可调 fps / 尺寸 / 底色，底部有每段序列的帧数与抖动数据）

### 云澜大桥（独塔双索面斜拉桥）

桥面是拱形隆起的简化表达，桥塔按实景补成 **H 型独塔 + 双索面斜拉索**（`src/engine/world3d.js` 的 `makeTower / setBridge`）：

```js
// story.js：第一次过桥的 bridge 事件带 build:true，从 6.75km（17.1s）开始隆起
{ type: 'bridge', at: { km: 6.75 }, d: 10.2, rise: 1.0, color: 'bridge1', build: true }
```

- 时序：17.1s 起隆起 → 18.1s 桥面到位 → 18.7s 塔长到全高、索张满 → **19.8s 螃蟹到桥头（已完整 1.0s）**
- 塔：两立腿（腿心 ±24.6，立在**桥面两侧的墩身**上，桥面从两腿之间穿过）+ 上部横梁 0.86H + 四棱台锚台 0.93H，总高 **64**（2026-11-05 客户：先砍到三分之一 32，再要求“再高一倍”回到 64）；塔位略偏中跨（0.58），免得螃蟹正好站在塔腿前
- 塔位：沿桥面轴向 **u=0.58**（不取正中）——取正中时螃蟹经过会正好站在塔腿正前方，H 形被压成“单脚”
- 索：两个索面 × 每侧 8 根，**十字截面薄带**（Line 只有 1px，沿桥轴看会整束消失）；塔上锚点 0.60–0.83H，桥面锚点 u 0.19–0.81，锚头插进桥面 1.2
- 机位：过桥段 az 46/58/64（原来 az≈30 几乎沿桥轴看，两索面叠成一条，读不出“斜拉”）
- 遮挡处理：过桥期间撤掉含“桥”字的路名（会横穿塔腿）；云澜大桥信息卡改到左侧 `side:'left', y:300`，不压塔身
- 塔基随桥面高度浮动（`g.position.y = deckMid`），桥面回落后塔跟着降，不会悬空
- 长好之后永久保留（`director._built`），第二次过桥只重演桥面隆起

### 功能点（补给点）图标簇（客户 2026-10-27 口径）

`src/engine/annotations.js` 的 `drawStations`，口径写在 `src/config/story.js` 的 `STATION_POP`：

| 口径 | 做法 |
|---|---|
| **画在角色下层** | director 把它送进 `deep`（地图锚定件层），角色跑过时自然压在它前面，虚线不再穿蟹身 |
| **只按距离显隐** | `radius: 2`：螃蟹离点位 2 km 内出现，跑出去就消失；全片同一套（含 29→40 km 段） |
| **箭头落在赛道边** | 落点与公里牌同侧、同偏移（13 pt），所以引线一定指着路边那一点 |
| **与公里牌重合就借牌** | 该里程的公里牌这一帧真画出来了 → 引线直接停在牌面上沿，**用那块牌的杆子+牌面当虚线和箭头**，不再另画针尖 |
| **卡片不漂** | 钉死在落点正上方 `lift: 260` px；不逐帧避让、不随镜头推拉上下滑。落点出画、被海拔窗压住、或与另一张卡重叠时整张不画（宁可没有，不挤在画框边缘） |

## 图层与三维遮挡（客户 2026-10-27 口径）

`src/engine/director.js` 每帧把叠加层分成五层（自下而上），`src/engine/ui.js` 的 `Layer` 负责收集：

| 层 | 内容 | 说明 |
|---|---|---|
| 1 `ground` | 分流箭头、冲刺带、分区色块 | 贴在地面上的贴花，永远最底 |
| 2 `deep` | 公里牌、补给卡、折返牌、**地标引线+黄点**、分流标签 | **按“离相机多远”从远到近排序**；同时过深度探针，被大桥/楼/树挡住的不画 |
| 3 `names` | 路名胶囊 | 客户口径：路名只允许被螃蟹盖住，别的东西不许压它 |
| 4 `items` | 两只螃蟹、起点/终点拱门、升级特效 | 也按相机距离排序（原来按屏幕 y） |
| 5 `top` | 地标照片卡、体力警告、屏幕提示 | 唯一“人为决定遮挡”的一层（客户口径） |

深度探针实现在 `World.renderProbe / probeZ / occluded`：每帧把场景按 `MeshDepthMaterial(RGBADepthPacking)`
渲到 **1/3 分辨率**离屏缓冲、回读一次像素，图元拿自己的 NDC z 换算成**相机距离**跟场景比。
两个已踩过的坑（别再退回）：

- **解码顺序**：`depth = r/256 + g/256² + b/256³`（r 是高位）。写成 `r/255 + …` 会让所有读数挤在 0.99，看着“有值”其实全错。
- **采样**：3×3 取**中值**而不是最大值；容差按距离比例给（`max(6, 3.5%×距离)`）。
  用最大值 + 固定 3 单位容差时，42 km 牌这种贴着路面的图元会被邻像素抬远误判成“被挡住”，收尾段整段消失。

`?noprobe=1` 可整体关掉探针（纯看画面时省约 6 ms/帧）。

```bash
npm run stations               # 补给簇口径：层序 / ±2km / 260px 钉死 / 引线落点
npm run layers                 # 五层顺序、地标卡尺寸、海拔窗位置、深度探针计数、帧耗时
node tools/check_layout.mjs    # 右上角站位冲突（地标卡 × 信息卡 × 图例 × 海拔窗）
```
