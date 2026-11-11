"""
批量生成角色运动序列（动作分解图）。

  uv run --with requests python tools/gen_seq.py navi                  # 全部 10 个形象
  uv run --with requests python tools/gen_seq.py navi --only m0_run    # 只做一张
  选项：--force 覆盖已有  --workers 3  --w 2048 --h 2048  --n 4

输出 races/<id>/mascots/<style>/seq_sheet/<id>.jpg（原始宫格图）+ manifest 记录。
切格见 tools/slice_seq.py（不需要再调 API，可反复切）。
"""
import argparse
import importlib.util
import json
import pathlib
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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
lock = threading.Lock()


def record(key, info):
    with lock:
        m = json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}
        m[key] = info
        MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('style', nargs='?', default='navi')
    ap.add_argument('--only')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--n', type=int, default=4)
    ap.add_argument('--w', type=int, default=2048)
    ap.add_argument('--h', type=int, default=2048)
    a = ap.parse_args()

    style = a.style
    ids = a.only.split(',') if a.only else list(CP.VARIANTS)
    jobs = []
    for vid in ids:
        dest = OUT / style / 'seq_sheet' / f'{vid}.jpg'
        if dest.exists() and not a.force:
            print('skip', dest.relative_to(ROOT))
            continue
        base = OUT / style / f'{vid}.jpg'
        if not base.exists():
            print('缺角色图', base)
            continue
        jobs.append((vid, dest, base))

    if not jobs:
        print('没有要做的')
        return

    rh = RHM.RH(RHM.load_api_key())

    def do(job):
        vid, dest, base = job
        prompt = CP.seq_prompt(style, vid, a.n)
        urls = [rh.upload(base)]
        payload = {'prompt': prompt, 'outputFormat': 'jpeg', 'width': a.w, 'height': a.h,
                   'imageUrls': urls}
        t0 = time.time()
        tid = rh.submit(RHM.ENDPOINTS['i2i'], payload)
        data = rh.wait(tid, interval=4, timeout=1200)
        url = data['results'][0]['url']
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
        record(f'{style}/seq_sheet/{vid}', {
            'mode': 'i2i-seq', 'prompt': prompt, 'taskId': tid, 'url': url,
            'refs': urls, 'w': a.w, 'h': a.h, 'n': a.n,
            'file': str(dest.relative_to(ROOT)), 'at': time.strftime('%Y-%m-%d %H:%M:%S'),
        })
        return vid, time.time() - t0

    ok = fail = 0
    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(do, j): j[0] for j in jobs}
        for f in as_completed(futs):
            try:
                vid, dt = f.result()
                ok += 1
                print(f'OK   {style}/{vid}  {dt:.0f}s', flush=True)
            except Exception as e:
                fail += 1
                print(f'FAIL {style}/{futs[f]}  {e}', flush=True)
    print(f'done ok={ok} fail={fail}')
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
