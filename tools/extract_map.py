"""
从官方 .ai（PDF 兼容）第 1 页「赛道路线图」提取底图矢量层 → data/map_layers.json

坐标系：AI 页面 pt，原点左上，x 向右、y 向下（与官方图一致）。1 pt ≈ 3.343 m（由全程线 42.195 km 定标）。
图层识别靠填充/描边颜色（见 COLORS），这些颜色是逐类渲染核对过的：
  water  水面填充 (0.282,0.778,0.905)  + 水系描边（细河道）
  green  公园绿地 (0.414,0.648,0.267)
  roads  白色描边 6.67 pt（普通路）/ 20 pt（主干道）+ 白色大块填充（快速路面）
  labels 灰色转曲文字 (0.428,0.434,0.443)  = 路名
  icons  深蓝 (0.0,0.355,0.668)            = 官方地标小图标（保圣寺/博物馆/老街/公园/水慢城）

用法：uv run --with pymupdf --with shapely python tools/extract_map.py
"""
import json, math, sys, pathlib
import pymupdf as fitz
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[1]
# 模板结构：官方设计稿属于**赛事包**（races/<id>/source/），换赛事只改 active-race.js
_ACTIVE = (ROOT / 'src' / 'config' / 'active-race.js').read_text(encoding='utf-8')
_pack = (_ACTIVE.split("ACTIVE_RACE = '")[1].split("'")[0]) if "ACTIVE_RACE = '" in _ACTIVE else ''
_SRC = ROOT / 'races' / _pack / 'source'
_cands = sorted(_SRC.glob('*.ai')) if _SRC.is_dir() else []
# 优先「路线图 / 主会场平面图」那份（source/ 里通常还有视觉稿）
_route = [p for p in _cands if '路线图' in p.name or '主会场' in p.name]
AI = (_route or _cands or [None])[0]
if AI is None:
    raise SystemExit(f'缺少官方设计稿：请把「路线图 / 主会场平面图」.ai 放进 {_SRC}/')
OUT = ROOT / 'data' / 'map_layers.json'

# 地图有效区（去掉页眉 y<300；底部图例区单独记录，渲染时由我们自己的 HUD 替代）
FRAME = (0, 300, 3606, 2551)

def r3(c):
    return tuple(round(v, 3) for v in c) if c else None

COL_WATER = (0.282, 0.778, 0.905)
COL_GREEN = (0.414, 0.648, 0.267)
COL_WHITE = (1.0, 1.0, 1.0)
COL_LABEL = (0.428, 0.434, 0.443)
COL_ICON = (0.0, 0.355, 0.668)


def flatten(items, steps=10):
    """把 drawing items 拆成若干子路径（点列），贝塞尔离散化。"""
    subs, cur = [], []

    def start(pt):
        nonlocal cur
        if cur and (abs(cur[-1][0] - pt.x) + abs(cur[-1][1] - pt.y)) < 0.01:
            return
        if cur:
            subs.append(cur)
        cur = [(pt.x, pt.y)]

    for it in items:
        k = it[0]
        if k == 'l':
            start(it[1]); cur.append((it[2].x, it[2].y))
        elif k == 'c':
            a, b, c, e = it[1:5]
            start(a)
            for i in range(1, steps + 1):
                t = i / steps; u = 1 - t
                cur.append((u**3*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t**3*e.x,
                            u**3*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t**3*e.y))
        elif k == 're':
            r = it[1]
            if cur: subs.append(cur); cur = []
            subs.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
        elif k == 'qu':
            q = it[1]
            if cur: subs.append(cur); cur = []
            subs.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
    if cur:
        subs.append(cur)
    return subs


def fill_geom(d):
    """一个填充 drawing → shapely 几何。子路径按奇偶规则合成（兼容带孔的湖心岛、文字字形）。"""
    geom = None
    for s in flatten(d['items']):
        if len(s) < 3:
            continue
        p = make_valid(Polygon(s))
        if p.is_empty:
            continue
        geom = p if geom is None else geom.symmetric_difference(p)
    return geom


def polys_out(geom, simplify=0.4, min_area=4.0):
    """shapely → [[outer,[hole...]], ...]，坐标保留 1 位小数"""
    if geom is None or geom.is_empty:
        return []
    geom = geom.simplify(simplify, preserve_topology=True)
    out = []
    parts = geom.geoms if hasattr(geom, 'geoms') else [geom]
    for g in parts:
        if g.geom_type == 'Polygon' and g.area >= min_area:
            out.append([[[round(x, 1), round(y, 1)] for x, y in g.exterior.coords[:-1]],
                        [[[round(x, 1), round(y, 1)] for x, y in h.coords[:-1]] for h in g.interiors]])
        elif g.geom_type in ('MultiPolygon', 'GeometryCollection'):
            out += polys_out(g, simplify, min_area)
    return out


def main():
    doc = fitz.open(AI)
    page = doc[0]
    drs = page.get_drawings()
    frame = box(*FRAME)

    water, green, white_fill, labels, icons = [], [], [], [], []
    roads, rivers = [], []
    for d in drs:
        f, c, w = r3(d.get('fill')), r3(d.get('color')), round(d.get('width') or 0, 2)
        if 'f' in d['type']:
            if f == COL_WATER: water.append(fill_geom(d))
            elif f == COL_GREEN: green.append(fill_geom(d))
            elif f == COL_LABEL: labels.append(fill_geom(d))
            elif f == COL_ICON: icons.append(fill_geom(d))
            elif f == COL_WHITE:
                g = fill_geom(d)
                if g is None or g.is_empty: continue
                x0, y0, x1, y1 = g.bounds
                # 去掉公里圆标的白圈、图例里的小白块：只保留大面积/细长的路面
                if max(x1 - x0, y1 - y0) > 120 and g.area > 800:
                    white_fill.append(g)
        if d['type'] in ('s', 'fs') and c == COL_WHITE and w in (6.67, 20.0):
            for s in flatten(d['items']):
                if len(s) >= 2:
                    roads.append({'w': w, 'pts': [[round(x, 1), round(y, 1)] for x, y in
                                                   LineString(s).simplify(0.4).coords]})
        if d['type'] in ('s', 'fs') and c == COL_WATER:
            for s in flatten(d['items']):
                if len(s) >= 2:
                    rivers.append({'w': w, 'pts': [[round(x, 1), round(y, 1)] for x, y in
                                                    LineString(s).simplify(0.4).coords]})

    def merged(lst, clip=True):
        g = unary_union([x for x in lst if x is not None and not x.is_empty])
        return g.intersection(frame) if clip else g

    water_g = merged(water)
    green_g = merged(green)
    road_fill_g = merged(white_fill)

    # 路名字形：保留在地图有效区内、不在底部图例区（x>1500 & y>1950 为剖面/图例）
    lab_polys = []
    for g in labels:
        if g is None or g.is_empty: continue
        x0, y0, x1, y1 = g.bounds
        if y0 < FRAME[1] or (x0 > 1500 and y0 > 1930): continue
        lab_polys.append(g)
    labels_g = unary_union(lab_polys) if lab_polys else None
    icons_g = merged(icons)

    out = {
        'meta': {
            'source': AI.name + ' · 第 1 页 · 图层 1',
            'coord': 'AI 页面 pt，原点左上，y 向下',
            'm_per_pt': 3.34302,
            'frame': FRAME,
            'legend_box': [1490, 1925, 3606, 2551],
        },
        'water': polys_out(water_g, 0.5, 6),
        'green': polys_out(green_g, 0.5, 6),
        'road_fill': polys_out(road_fill_g, 0.5, 30),
        'roads': [r for r in roads if LineString(r['pts']).intersects(frame)],
        'rivers': [r for r in rivers if LineString(r['pts']).intersects(frame)],
        'labels': polys_out(labels_g, 0.15, 0.2),
        'icons': polys_out(icons_g, 0.15, 0.2),
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for k in ('water', 'green', 'road_fill', 'roads', 'rivers', 'labels', 'icons'):
        print(f'{k:10s} {len(out[k])}')
    print('size KB', OUT.stat().st_size // 1024)


if __name__ == '__main__':
    main()
