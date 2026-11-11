"""
美化底图几何 → data/world.json（供 three.js 直接三角化）

输入 data/map_layers.json（官方矢量层）+ data/course.json（赛道）
输出
  board          地图板块外框（= 官方图有效区）
  water          水面；water_outer（外扩 = 沙岸）；water_deep（内缩 = 深水）
  green          公园绿地
  roads_minor / roads_major / roads_casing   路面多边形（中心线按等级加宽后合并）
  trees          [[x,y,s],...] 公园散布树
  sequoia        [[x,y,s],...] 水杉大道两侧行道树（11.2–12.7 km）
  flowers        [[x,y,c],...] 水慢城花海（12.8–17 km 赛道两侧）
  reeds          [[x,y],...]   湿地公园芦苇（40–41 km）
  buildings      [[x,y,w,d,h,rot,colorIdx],...] 城区体块
所有参数集中在 P，便于后续微调。

用法：uv run --with numpy --with shapely python tools/build_world.py
"""
import json, math, pathlib, random
import numpy as np
from shapely.geometry import Polygon, LineString, Point, box, MultiPolygon
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[1]
LAY = json.loads((ROOT / 'data' / 'map_layers.json').read_text(encoding='utf-8'))
CRS = json.loads((ROOT / 'data' / 'course.json').read_text(encoding='utf-8'))
OUT = ROOT / 'data' / 'world.json'

P = dict(
    seed=2026,
    road_half_minor=3.0,      # 官方 6.67pt 描边 → 我们 6pt
    road_half_major=7.0,      # 官方 20pt → 14pt（收窄，让赛道更醒目）
    casing=1.4,
    shore_sand=6.0, deep_inset=14.0,
    tree_grid=15.0, tree_clear_road=6.0, tree_clear_route=12.0,
    bld_grid=27.0, bld_clear_road=5.0, bld_clear_route=22.0,
    sequoia_km=(11.2, 12.7), sequoia_off=13.0, sequoia_step=9.0,
    flower_km=(12.8, 17.0), flower_band=(9.0, 60.0), flower_n=2600,
    reed_km=(40.0, 41.0), reed_band=(10.0, 70.0), reed_n=900,
)
FRAME = LAY['meta']['frame']
BOARD = box(*FRAME)
# 板块外扩：官方图有效区之外补一圈陆地，镜头靠边时不露底
PAD = (-700, -420, 4300, 3200)
PADBOX = box(*PAD)
# 建筑分区（城区北岸老城 + 东侧新城 + 南部零散村落），pt 坐标
ZONES = [
    ('city', 1.00, Polygon([(0, 300), (1160, 300), (1160, 840), (900, 880), (700, 930), (330, 1000), (0, 960)])),
    ('east', 0.75, Polygon([(1160, 300), (2150, 300), (2150, 520), (1700, 700), (1500, 820), (1160, 840)])),
    ('south', 0.18, Polygon([(0, 1120), (780, 1250), (780, 2551), (0, 2551)])),
    ('pad_n', 0.38, Polygon([(-700, -420), (2300, -420), (2300, 300), (-700, 300)])),
    ('pad_w', 0.2, Polygon([(-700, 300), (0, 300), (0, 2600), (-700, 2600)])),
    ('north_e', 0.22, Polygon([(2150, 300), (3606, 300), (3606, 900), (2150, 700)])),
]


def mp(polys):
    out = []
    for outer, holes in polys:
        g = make_valid(Polygon(outer, holes))
        if not g.is_empty:
            out.append(g)
    return unary_union(out)


def lines(lst):
    return [LineString(r['pts']) for r in lst if len(r['pts']) >= 2]


def export(g, simp=0.35, min_area=3.0):
    if g is None or g.is_empty:
        return []
    g = g.simplify(simp, preserve_topology=True)
    parts = g.geoms if hasattr(g, 'geoms') else [g]
    out = []
    for p in parts:
        if p.geom_type == 'Polygon':
            if p.area < min_area:
                continue
            out.append([[[round(x, 1), round(y, 1)] for x, y in p.exterior.coords[:-1]],
                        [[[round(x, 1), round(y, 1)] for x, y in h.coords[:-1]] for h in p.interiors if Polygon(h).area > min_area]])
        elif hasattr(p, 'geoms'):
            out += export(p, simp, min_area)
    return out


def route_line(key, k0=None, k1=None):
    pts = CRS[key]
    i0 = 0 if k0 is None else int(k0 / 0.01)
    i1 = len(pts) if k1 is None else int(k1 / 0.01) + 1
    return LineString(pts[i0:i1])


def offset_points(key, k0, k1, off, step_pt, rng):
    """沿赛道两侧（法线 ±off）按弧长 step_pt 取点"""
    pts = np.array(CRS[key][int(k0 / 0.01):int(k1 / 0.01) + 1])
    seg = np.hypot(*np.diff(pts, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)])
    out = []
    for d in np.arange(0, s[-1], step_pt):
        i = min(np.searchsorted(s, d), len(pts) - 2)
        t = pts[i + 1] - pts[i]; n = np.array([-t[1], t[0]]) / (np.hypot(*t) + 1e-9)
        for sgn in (-1, 1):
            p = pts[i] + n * off * sgn + rng.normal(0, 0.6, 2)
            out.append(p)
    return out


def main():
    rng = np.random.default_rng(P['seed']); random.seed(P['seed'])

    water = mp(LAY['water'])
    rivers = unary_union([l.buffer(max(r['w'] / 2, 1.2), cap_style=2) for l, r in zip(lines(LAY['rivers']), LAY['rivers'])])
    water = unary_union([water, rivers]).intersection(BOARD)
    # 贴着官方图边缘的水面向外延伸到板块边（避免湖面在图边被直线截断）
    ext = []
    x0, y0, x1, y1 = FRAME
    for strip, mk in ((box(x0, y1 - 6, x1, y1), lambda a, b: box(a, y1 - 6, b, PAD[3])),
                      (box(x0, y0, x1, y0 + 6), lambda a, b: box(a, PAD[1], b, y0 + 6)),
                      (box(x0, y0, x0 + 6, y1), lambda a, b: box(PAD[0], a, x0 + 6, b)),
                      (box(x1 - 6, y0, x1, y1), lambda a, b: box(x1 - 6, a, PAD[2], b))):
        cut = water.intersection(strip)
        for g in (cut.geoms if hasattr(cut, 'geoms') else [cut]):
            if g.is_empty or g.area < 2: continue
            bx0, by0, bx1, by1 = g.bounds
            ext.append(mk(bx0, bx1) if strip.bounds[1] in (y1 - 6, y0) and strip.bounds[3] - strip.bounds[1] < 10 else mk(by0, by1))
    water = unary_union([water] + ext).intersection(PADBOX)
    green = mp(LAY['green']).intersection(BOARD).difference(water.buffer(1))

    minor = [l for l, r in zip(lines(LAY['roads']), LAY['roads']) if r['w'] < 10]
    major = [l for l, r in zip(lines(LAY['roads']), LAY['roads']) if r['w'] >= 10]
    rmin = unary_union([l.buffer(P['road_half_minor'], cap_style=1, join_style=1) for l in minor])
    rmaj = unary_union([l.buffer(P['road_half_major'], cap_style=1, join_style=1) for l in major])
    roads_all = unary_union([rmin, rmaj])
    casing = roads_all.buffer(P['casing'])
    rmin, rmaj, casing = (g.intersection(BOARD) for g in (rmin, rmaj, casing))

    full = route_line('full'); half = route_line('half')
    route = unary_union([full, half])

    # ── 树
    no_tree = prep(unary_union([roads_all.buffer(P['tree_clear_road']), route.buffer(P['tree_clear_route']), water.buffer(2)]))
    g_green = prep(green)
    trees = []
    gx0, gy0, gx1, gy1 = green.bounds
    for x in np.arange(gx0, gx1, P['tree_grid']):
        for y in np.arange(gy0, gy1, P['tree_grid']):
            px, py = x + rng.uniform(-6, 6), y + rng.uniform(-6, 6)
            pt = Point(px, py)
            if g_green.contains(pt) and not no_tree.contains(pt) and rng.random() < 0.72:
                trees.append([round(px, 1), round(py, 1), round(float(rng.uniform(0.75, 1.3)), 2)])
    # 城区/郊区零散行道树
    land = BOARD.difference(water).difference(green)
    g_land = prep(land)
    for _ in range(2600):
        px, py = rng.uniform(FRAME[0], FRAME[2]), rng.uniform(FRAME[1], FRAME[3])
        pt = Point(px, py)
        if g_land.contains(pt) and not no_tree.contains(pt) and roads_all.distance(pt) < 14:
            trees.append([round(px, 1), round(py, 1), round(float(rng.uniform(0.6, 0.95)), 2)])

    # ── 水杉大道（金色锥形行道树）
    seq = offset_points('full', *P['sequoia_km'], P['sequoia_off'], P['sequoia_step'], rng)
    seq += offset_points('full', *P['sequoia_km'], P['sequoia_off'] + 8, P['sequoia_step'] * 1.3, rng)
    sequoia = [[round(float(x), 1), round(float(y), 1), round(float(rng.uniform(0.9, 1.25)), 2)] for x, y in seq
               if not water.contains(Point(x, y))]

    # ── 花海 / 芦苇（赛道一侧带状随机点）
    def band_points(k0, k1, band, n, ok_geom):
        L = route_line('full', k0, k1)
        ring = L.buffer(band[1]).difference(L.buffer(band[0])).intersection(ok_geom)
        rp = prep(ring); x0, y0, x1, y1 = ring.bounds; pts = []
        tries = 0
        while len(pts) < n and tries < n * 40:
            tries += 1
            px, py = rng.uniform(x0, x1), rng.uniform(y0, y1)
            if rp.contains(Point(px, py)):
                pts.append((px, py))
        return pts
    flowers = [[round(x, 1), round(y, 1), int(rng.integers(0, 4))]
               for x, y in band_points(*P['flower_km'], P['flower_band'], P['flower_n'], green.union(land).difference(roads_all.buffer(2)))]
    reeds = [[round(x, 1), round(y, 1)] for x, y in band_points(*P['reed_km'], P['reed_band'], P['reed_n'],
                                                                   BOARD.difference(roads_all.buffer(2)).difference(water.buffer(-3)))]

    # ── 建筑体块
    no_bld = prep(unary_union([roads_all.buffer(P['bld_clear_road']), route.buffer(P['bld_clear_route']),
                               water.buffer(4), green.buffer(3)]))
    buildings = []
    for name, dens, zone in ZONES:
        zp = prep(zone.intersection(PADBOX))
        x0, y0, x1, y1 = zone.bounds
        for x in np.arange(x0, x1, P['bld_grid']):
            for y in np.arange(y0, y1, P['bld_grid']):
                if rng.random() > dens:
                    continue
                px, py = x + rng.uniform(-5, 5), y + rng.uniform(-5, 5)
                w, d = rng.uniform(9, 19), rng.uniform(8, 16)
                fp = Point(px, py).buffer(max(w, d) * 0.55)
                if not zp.contains(Point(px, py)) or no_bld.intersects(fp):
                    continue
                h = rng.uniform(5, 13) if name != 'city' else rng.uniform(6, 22) * (1.5 if rng.random() < 0.08 else 1)
                if name in ('south', 'north_e', 'pad_n', 'pad_w'):
                    w, d, h = w * 0.7, d * 0.7, rng.uniform(4, 7)
                rot = float(rng.normal(0, 0.12))
                buildings.append([round(px, 1), round(py, 1), round(w, 1), round(d, 1), round(h, 1),
                                  round(rot, 3), int(rng.integers(0, 5))])

    out = {
        'meta': {'params': P, 'frame': FRAME, 'note': '由 tools/build_world.py 生成，勿手改'},
        'board': PAD, 'frame': FRAME,
        'water_outer': export(water.buffer(P['shore_sand']).intersection(PADBOX).difference(water), 0.6),
        'water': export(water, 0.4),
        'water_deep': export(water.buffer(-P['deep_inset']), 0.8, 20),
        'green': export(green, 0.5),
        'road_lines': [{'w': 2 * (P['road_half_major'] if r['w'] >= 10 else P['road_half_minor']), 'pts': [[round(x, 1), round(y, 1)] for x, y in LineString(r['pts']).intersection(BOARD.buffer(2)).coords]}
                       for r in LAY['roads'] if LineString(r['pts']).intersection(BOARD.buffer(2)).geom_type == 'LineString' and not LineString(r['pts']).intersection(BOARD.buffer(2)).is_empty],
        'trees': trees, 'sequoia': sequoia, 'flowers': flowers, 'reeds': reeds,
        'buildings': buildings,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for k in ('water_outer', 'water', 'water_deep', 'green', 'road_lines',
              'trees', 'sequoia', 'flowers', 'reeds', 'buildings'):
        print(f'{k:13s} {len(out[k])}')
    print('KB', OUT.stat().st_size // 1024)


if __name__ == '__main__':
    main()
