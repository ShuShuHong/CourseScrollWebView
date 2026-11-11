"""
赛道语义层 → data/course.json

输入
  races/<id>/prior/route_2026_final.json   全程/半程折线（AI pt 坐标）+ 逐点公里数（已用 42 个官方公里圆标标定，中位误差 88 m）
  races/<id>/prior/elevation_2026.json     官方剖面（每公里一点）
  （<id> = 当前激活赛事包，见 src/config/active-race.js）
  官方图「赛事功能点分布表」          → STATIONS（本文件内人工逐格核读，见下方注释）

输出 data/course.json
  full / half       10 m 间隔重采样点列（index * 0.01 = km）
  half_on_full      半程 km → 共线段对应的全程 km（共线段内）
  split             全/半马分流点
  km_badges         1..42 公里圆标位置
  stations          16 个功能点（km + 服务项）
  elevation         官方剖面
  bridge            固城湖大桥：两次通过的 km 区间与桥面中线
  pois              地图上官方地标/医院图标的坐标与其在赛道上的投影 km
  turnarounds       折返点

用法：uv run --with numpy python tools/build_course.py
"""
import json, math, pathlib, bisect
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
# 模板结构：官方路线数据属于**赛事包**（races/<id>/prior/），换赛事只改 active-race.js
_ACTIVE = (ROOT / 'src' / 'config' / 'active-race.js').read_text(encoding='utf-8')
_PACK = (_ACTIVE.split("ACTIVE_RACE = '")[1].split("'")[0]) if "ACTIVE_RACE = '" in _ACTIVE else ''
PRIOR = ROOT / 'races' / _PACK / 'prior'
if not PRIOR.is_dir():
    raise SystemExit(f'缺少官方路线数据：{PRIOR}（把 route_*.json / elevation_*.json 放进当前赛事包的 prior/ 目录）')
OUT = ROOT / 'data' / 'course.json'

# ── 功能点：官方图右下「赛事功能点分布表」逐格核读（2026-10-26，200 dpi 放大图）
# 图例 7 类：计时点 / 医疗点 / 饮料站 / 饮水站 / 用水站 / 食品补给站 / 洗手间；顺序按表内图标顺序
T, M, D, W, S, FOOD, WC = 'timing', 'medical', 'drink', 'water', 'sponge', 'food', 'wc'
STATIONS = [
    (2.5,  [M, WC]),
    (5,    [T, M, D, W, WC]),
    (7.5,  [M, S, W, WC]),
    (10,   [T, M, D, W, WC]),
    (12.5, [M, S, W, FOOD, WC]),
    (15,   [T, M, D, W, FOOD, WC]),
    (17.5, [M, S, W, FOOD, WC]),
    (20,   [T, M, D, W, FOOD, WC]),
    (23,   [M, S, W, FOOD, WC]),   # 客户 2026-11-06：22.5km 改为 23km
    (25,   [T, M, D, W, FOOD, WC]),
    (27.5, [M, S, W, FOOD, WC]),
    (30,   [T, M, D, W, FOOD, WC]),
    (32.5, [M, S, W, FOOD, WC]),
    (35,   [T, M, D, W, FOOD, WC]),
    (37.5, [M, S, W, FOOD, WC]),
    (40,   [T, M, D, W, FOOD, WC]),
]

# 官方图上图标/文字的中心坐标（pt），由 tools 里的聚类脚本读出
POIS = {
    'baosheng_temple': (1002, 624),   # 保圣寺（塔）
    'museum':          (964, 734),    # 高淳博物馆
    'old_street':      (428, 763),    # 高淳老街（牌坊）
    'water_town':      (1085, 1687),  # 固城湖水慢城（楼阁）
    'laizhuzhou_park': (1227, 710),   # 濑渚洲公园
    'wetland_park':    (1390, 683),   # 固城湖国家城市湿地公园
    'tcm_hospital':    (381, 613),    # 南京市高淳中医院
    'people_hospital': (1754, 334),   # 南京市高淳人民医院
    'timing_21':       (1242, 898),   # 21.0975 公里计时点
    'timing_east':     (2769, 1163),  # 东端折返计时点
}

BRIDGE_LEN_M = 537.4   # 脚本口径（图上无标注）


def resample(P, K, step=0.01):
    P = np.asarray(P); K = np.asarray(K)
    ks = np.arange(0, K[-1] + 1e-9, step)
    if ks[-1] < K[-1] - 1e-6:
        ks = np.append(ks, K[-1])
    x = np.interp(ks, K, P[:, 0]); y = np.interp(ks, K, P[:, 1])
    return np.stack([x, y], 1), ks


def nearest(P, x, y, lo=0, hi=None):
    hi = len(P) if hi is None else hi
    d = np.hypot(P[lo:hi, 0] - x, P[lo:hi, 1] - y)
    i = int(d.argmin())
    return lo + i, float(d[i])


def main():
    r = json.loads((PRIOR / 'route_2026_final.json').read_text(encoding='utf-8'))
    elev = json.loads((PRIOR / 'elevation_2026.json').read_text(encoding='utf-8'))
    m_per_pt = r['meta']['m_per_pt']

    F, FK = resample(r['full'], r['full_km'])
    H, HK = resample(r['half'], r['half_km'])
    # 终点精确落在官方里程
    FK[-1] = 42.195; HK[-1] = 21.0975

    # 半程 → 全程（共线段）
    half_on_full, split = [], None
    j_prev = 0
    for i in range(0, len(H), 5):
        j, d = nearest(F, H[i, 0], H[i, 1], max(0, j_prev - 50), min(len(F), j_prev + 400))
        if d > 10.5 and HK[i] > 15:
            split = {'half_km': round(float(HK[i]), 3), 'full_km': round(float(FK[j_prev]), 3),
                     'pt': [round(float(H[i, 0]), 1), round(float(H[i, 1]), 1)]}
            break
        half_on_full.append([round(float(HK[i]), 3), round(float(FK[j]), 3)])
        j_prev = j

    def at(P, K, km):
        i = min(bisect.bisect_left(list(K), km), len(P) - 1)
        return [round(float(P[i, 0]), 1), round(float(P[i, 1]), 1)]

    km_badges = [{'km': k, 'pt': at(F, FK, k)} for k in range(1, 43)]
    half_badges = [{'km': k, 'pt': at(H, HK, k)} for k in range(1, 22)]

    # 桥：第一次通过以跨水段中点 8.27 km 为桥心；回程取 17.5–19.6 km 内离桥心最近处
    c_out = 8.27
    bc = at(F, FK, c_out)
    i0, i1 = int(17.5 / 0.01), int(19.6 / 0.01)
    jb, db = nearest(F, bc[0], bc[1], i0, i1)
    c_back = float(FK[jb])
    half_span = BRIDGE_LEN_M / 1000 / 2
    deck = [at(F, FK, c_out - half_span + t * 2 * half_span / 40) for t in range(41)]
    bridge = {
        'name': '固城湖大桥', 'length_m': BRIDGE_LEN_M,
        'pass1_km': [round(c_out - half_span, 3), round(c_out + half_span, 3)],
        'pass2_km': [round(c_back - half_span, 3), round(c_back + half_span, 3)],
        'pass2_offset_pt': round(db, 1),
        'deck': deck,
    }

    pois = {}
    for k, (x, y) in POIS.items():
        jf, df = nearest(F, x, y)
        jh, dh = nearest(H, x, y)
        pois[k] = {'pt': [x, y], 'full_km': round(float(FK[jf]), 2), 'full_d_pt': round(df, 1),
                   'half_km': round(float(HK[jh]), 2) if dh < 80 else None}

    out = {
        'meta': {
            'source': f'races/{_PACK}/source/ 官方路线图；路线/公里标定沿用已验证数据',
            'coord': 'AI 页面 pt，原点左上，y 向下', 'm_per_pt': m_per_pt, 'step_km': 0.01,
            'start_finish': r['meta']['start_finish_px'],
            'notes': [
                '全/半马共线段在官方图上画成相距约 7 pt 的平行双线，本数据保留这一画法',
                '功能点按官方图右下分布表逐格核读',
                '桥长 537.4 m 取自脚本（图上无标注）',
            ],
        },
        'full': [[round(float(x), 1), round(float(y), 1)] for x, y in F],
        'half': [[round(float(x), 1), round(float(y), 1)] for x, y in H],
        'full_len_km': 42.195, 'half_len_km': 21.0975,
        'half_on_full': half_on_full,
        'split': split,
        'km_badges': km_badges, 'half_badges': half_badges,
        'stations': [{'km': k, 'services': s, 'half': k < 21} for k, s in STATIONS],
        'elevation': {
            'title': elev['meta']['title'],
            'official_annotation': elev['meta']['official_annotation'],
            'profile': [p['alt_m'] for p in elev['profile_annotation']],
            'profile_axis_reading': [p['alt_m'] for p in elev['profile_axis']],
        },
        'bridge': bridge,
        'turnarounds': [{'km': 19.61, 'pt': at(F, FK, 19.61), 'name': '南漪路折返'},
                        {'km': 29.2, 'pt': at(F, FK, 29.2), 'name': '全马折返点'}],
        'pois': pois,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('full pts', len(F), 'half pts', len(H))
    print('split', split)
    print('bridge', {k: v for k, v in bridge.items() if k != 'deck'})
    for k, v in pois.items(): print(k, v)
    print('KB', OUT.stat().st_size // 1024)


if __name__ == '__main__':
    main()
