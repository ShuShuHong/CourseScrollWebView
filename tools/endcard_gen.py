"""落版画面 · AI 背景生成（RunningHub seedream-v5-pro）

依据：
  ① 最初脚本（高马赛道介绍视频脚本10.25.xlsx 第 10 条）：
     公蟹冲线戴王冠、母蟹戴后冠，两只螃蟹**在终点并排站立**；
     数据线 = 公蟹 42.195 / 母蟹 21.0975 / 累计爬升 61m / 海拔 4—26m /
              全马 6:00、半马 3:00 关门 / A、B、C 混编，A、B 第一枪，C 第二枪。
  ② 官方 .ai 设计稿（第 1 页赛道路线图 / 第 2 页主会场平面图）：
     蓝白底、清透湖面、路线洋红、字体粗斜无衬线；品牌锁定「2026 高淳马拉松 / GAOCHUN MARATHON」。
  ③ 片子的画风口径（客户 2026-11-03 定调）：**清新** —— 高明度、几乎无黑线、低对比。

只生成**背景**（会场 + 湖 + 黄昏 + 彩屑），不放任何文字与角色：
  · 文字交给 SVG 排版（4K 屏上必须是矢量、可以随时改字）；
  · 角色用项目自己的蟹王/蟹后位图（客户对形象准确性极敏感，绝不让 AI 重画）。

用法：
  uv run --with requests python tools/endcard_gen.py                 # 2 个候选，4K
  uv run --with requests python tools/endcard_gen.py --n 4           # 4 个候选
  uv run --with requests python tools/endcard_gen.py --w 2560 --h 1440
  uv run --with requests python tools/endcard_gen.py --mode t2i      # 不用参考图
产物：out/endcard/raw/bg_<i>.png + out/endcard/raw/manifest.json
"""
import argparse
import importlib.util
import json
import pathlib
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RHM)

OUT = ROOT / 'out' / 'endcard' / 'raw'

# ── 内容参考：片子自己的片尾主舞台（白模会场 + 蓝 LED 背板 + 红毯）
REF_STAGE = ROOT / 'out' / 'venue' / 'navi' / '74.0s.png'
# ── 风格参考：同画风的「清新」地标卡（滨湖公园）
REF_STYLE = ROOT / 'assets' / 'landmarks' / 'navi' / 'lakepark.jpg'

STYLE = """风格（必须严格遵守）：清新插画风 —— 高明度、低饱和、低对比，几乎不用黑线与深灰描边，
结构用同色系深一点的色块表达；色块干净、边缘利落，像精修过的城市导航插画。
不要写实照片质感，不要厚重笔触、不要噪点/纸张纹理、不要强对比硬阴影、不要赛博霓虹、不要复古滤镜。"""

COMPOSE = """构图（16:9 超宽）：天空占上部约 45%，主体（终点拱门、主舞台、秋季树列）集中在中上部；
画面**底部 35% 必须安静**：只有偏暗的广场地面与平静湖水，可以有一条淡淡的水面反光，
这块区域不要放任何复杂元素、不要放人和物体，留给落版文字。
主体不要居中堆成一团，左侧放拱门与舞台，右侧留出湖面与晚霞的空旷感。"""

BAN = """画面里绝对不要出现：任何文字、字母、数字、汉字、LOGO、水印、横幅标语、旗帜上的字；
任何人物、真人、卡通角色、螃蟹、动物；画框、边框、贴纸白边；过曝的太阳光斑；浓雾。"""

PROMPT = f"""2026 高淳马拉松终点主会场与固城湖的黄昏全景插画，晴好的秋日傍晚。
暖金色夕阳从画面右侧低角度斜照，天空从顶部的清透天蓝（约 RGB 100,190,240）渐变到地平线的暖橙与淡粉；
远处固城湖湖面平静如镜，把晚霞反射成一条暖色光带。画面左中：简洁的终点拱门（白色门架 + 蓝色 LED 背板），
旁边是低矮的主舞台与几级台阶、铺着红毯；舞台后方一排秋季水杉与银杏，暖黄与砖红交织，树形干净成块。
天上飘着细碎的金色彩纸屑，被夕阳照亮，零星不密集。前景广场地面湿润，只有淡淡的、柔和的反射。

{STYLE}

{COMPOSE}

{BAN}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=2, help='候选张数')
    ap.add_argument('--mode', choices=['i2i', 't2i'], default='i2i')
    # 接口硬限制：单张面积 ≤ 4,194,304 px（seedream 1007）。16:9 最大只能 2730×1536，
    # 这里取 2688×1512 = 4.06 M px，之后 Lanczos 放大到 3840×2160（插画背景，放大无损观感）。
    ap.add_argument('--w', type=int, default=2688)
    ap.add_argument('--h', type=int, default=1512)
    ap.add_argument('--resolution', default='', help='设 2k 就忽略 --w/--h')
    ap.add_argument('--prompt', default='', help='覆盖内置提示词（试验用）')
    a = ap.parse_args()

    prompt = a.prompt or PROMPT
    OUT.mkdir(parents=True, exist_ok=True)
    rh = RHM.RH(RHM.load_api_key())

    refs = []
    if a.mode == 'i2i':
        for p in (REF_STAGE, REF_STYLE):
            if p.exists():
                print(f'上传 {p.relative_to(ROOT)}', flush=True)
                refs.append(rh.upload(p))
            else:
                print(f'  ! 缺参考图 {p}')

    made = []
    for i in range(a.n):
        payload = {'prompt': prompt, 'outputFormat': 'png'}
        if a.resolution:
            payload['resolution'] = a.resolution
        else:
            payload['width'], payload['height'] = a.w, a.h
        if refs:
            payload['imageUrls'] = refs
        t0 = time.time()
        try:
            task = rh.submit(RHM.ENDPOINTS[a.mode], payload)
            print(f'[{i + 1}/{a.n}] taskId {task}', flush=True)
            res = rh.wait(task).get('results') or []
            if not res:
                raise RuntimeError('SUCCESS 但没有结果')
            import requests
            r = requests.get(res[0]['url'], timeout=180)
            r.raise_for_status()
            dest = OUT / f'bg_{i + 1}.png'
            dest.write_bytes(r.content)
            made.append({'file': str(dest.relative_to(ROOT)), 'taskId': task, 'seconds': round(time.time() - t0, 1)})
            print(f'  → {dest.relative_to(ROOT)}  {time.time() - t0:.0f}s  {len(r.content) / 1048576:.1f} MB', flush=True)
        except Exception as e:
            print(f'  ✗ {str(e)[:300]}', flush=True)

    (OUT / 'manifest.json').write_text(json.dumps({
        'model': 'seedream-v5-pro', 'mode': a.mode, 'size': [a.w, a.h] if not a.resolution else a.resolution,
        'refs': [str(p.relative_to(ROOT)) for p in (REF_STAGE, REF_STYLE) if p.exists()],
        'prompt': prompt, 'made': made,
    }, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\n{len(made)}/{a.n} 张成功 → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
