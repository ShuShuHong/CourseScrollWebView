"""背面奔跑底图（i2i）：以同风格同级的正面奔跑图为参考，改画成正后方视角。

  uv run --with requests python tools/gen_back.py navi                  # 公母各一张
  uv run --with requests python tools/gen_back.py navi --only m1_back   # 只做一张
  uv run --with requests python tools/gen_back.py navi --force

输出 races/<id>/mascots/<style>/<m1_back|f1_back>.jpg —— 之后照常跑
  uv run --with requests python tools/gen_seq.py <style> --only m1_back,f1_back
把这张底图扩成四格动作分解图。
"""
import argparse
import importlib.util
import json
import pathlib
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import crab_prompts as CP  # noqa: E402
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

spec = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RHM)

OUT = MASCOTS
MAN = OUT / 'manifest.json'


def record(key, info):
    m = json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}
    m[key] = info
    MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('style', nargs='?', default='navi')
    ap.add_argument('--only')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--res', default='2k')
    a = ap.parse_args()

    style = a.style
    ids = a.only.split(',') if a.only else ['m1_back', 'f1_back']
    rh = RHM.RH(RHM.load_api_key())

    for vid in ids:
        dest = OUT / style / f'{vid}.jpg'
        if dest.exists() and not a.force:
            print('skip', dest.relative_to(ROOT))
            continue
        sex = CP.VARIANTS[vid][0]
        src = OUT / style / f'{sex}1_run.jpg'
        if not src.exists():
            print('缺正面参考图', src.relative_to(ROOT))
            continue
        prompt = CP.variant_prompt(style, vid)
        urls = [rh.upload(src)]
        payload = {'prompt': prompt, 'outputFormat': 'jpeg', 'imageUrls': urls}
        t0 = time.time()
        tid = rh.submit(RHM.ENDPOINTS['i2i'], payload)
        data = rh.wait(tid, interval=4, timeout=900)
        url = data['results'][0]['url']
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        dest.write_bytes(r.content)
        record(f'{style}/{vid}', {'mode': 'i2i-back', 'prompt': prompt, 'taskId': tid, 'url': url,
                                  'refs': urls, 'file': str(dest.relative_to(ROOT)),
                                  'at': time.strftime('%Y-%m-%d %H:%M:%S')})
        print(f'OK   {style}/{vid}  {time.time() - t0:.0f}s  → {dest.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
