# 数据与素材

> 赛道、地图、三维世界的数据从哪来，改了素材之后跑什么。

## 两类赛事包

**虚构赛事（当前 `races/lanwan-2026`）** —— 地图与赛道都是自绘，不依赖官方文件：

```bash
node tools/gen_fictional_map.mjs      # → data/map_layers.json
node tools/gen_fictional_course.mjs   # → data/course.json（42.195 km 折线、分流点、地标投影）
uv run --with numpy --with shapely python tools/build_world.py   # → data/world.json
```

主会场平面图在 `data/venue_plan.json`（按客户平面图手工登记的分区/门头/舞台坐标）。

**真实赛事** —— 需要官方矢量稿与已核验的路线数据：

```bash
npm run data
# extract_map.py   官方 races/<id>/source/*.ai  → data/map_layers.json
# build_course.py  races/<id>/prior/ 的公里标定  → data/course.json
# build_world.py   → data/world.json
```

## 口径

- **屏幕文字一律照抄口播脚本**，**位置一律取官方图或自绘平面图**；两者冲突处以脚本文字为准。
- 海拔小窗默认官方剖面，`story.js` 的 `ELEV_MODE` 可切到脚本口径。
- 公里/折返/分流点的里程锚点写在 `config/story.js`，由 `buildScript()` 反推秒数。

## 改完素材必跑

```bash
npm run assets     # 抠图（去白底/去脚下阴影）+ 打包 preview 版与设定集高清版
npm run preview    # 三套 stage 重新打包
npm run bible      # 打包 stage → 截关键帧 + 环境图 → 三册设定集 → 总览页
npm run shots      # 冒烟：三套各截 3 帧，检查位图是否真的在用、有无 JS 报错
npm run check      # 校验：设定集章节数、图片是否全部加载、缺图占位
```
