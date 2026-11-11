"""
批量生成螃蟹角色（调用 ~/.claude/skills/rh-seedream 的 RunningHub 客户端，API Key 读用户变量 RH_API）

  uv run --with requests python tools/gen_crabs.py master [style ...]          # 每种风格一张定妆图（1k）
  uv run --with requests python tools/gen_crabs.py variants [style ...]        # 以定妆图为参考生成全部单只形态（2k）
  选项：--only m0_run,f2_win   --force（覆盖已有）  --res 1k|2k  --workers 4

输出 races/<id>/mascots/<style>/<id>.jpg，记录 races/<id>/mascots/manifest.json（提示词、taskId、参考图）。
每次调用都计费：已存在的文件默认跳过。
"""
import argparse, importlib.util, json, pathlib, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import crab_prompts as CP  # noqa: E402
from mascot_path import MASCOTS  # 角色素材跟着赛事包走（races/<id>/mascots）

spec = importlib.util.spec_from_file_location('rh', pathlib.Path.home() / '.claude/skills/rh-seedream/rh_seedream.py')
RHM = importlib.util.module_from_spec(spec); spec.loader.exec_module(RHM)

OUT = MASCOTS
MAN = OUT / 'manifest.json'
lock = threading.Lock()


def manifest():
    return json.loads(MAN.read_text(encoding='utf-8')) if MAN.exists() else {}


def record(key, info):
    with lock:
        m = manifest(); m[key] = info
        MAN.parent.mkdir(parents=True, exist_ok=True)
        MAN.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')


def run(rh, mode, prompt, dest, refs=(), res='2k'):
    payload = {'prompt': prompt, 'outputFormat': 'jpeg'}
    if isinstance(res, tuple): payload |= {'width': res[0], 'height': res[1]}
    else: payload['resolution'] = res
    if refs:
        payload['imageUrls'] = refs
    t0 = time.time()
    tid = rh.submit(RHM.ENDPOINTS[mode], payload)
    data = rh.wait(tid, interval=4, timeout=900)
    url = data['results'][0]['url']
    r = requests.get(url, timeout=180); r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return tid, url, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=['master', 'variants', 'landmarks'])
    ap.add_argument('styles', nargs='*')
    ap.add_argument('--only'); ap.add_argument('--force', action='store_true')
    ap.add_argument('--res'); ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    styles = a.styles or list(CP.STYLES)
    rh = RHM.RH(RHM.load_api_key())
    jobs = []
    for s in styles:
        if a.what == 'master':
            dest = OUT / s / 'master.jpg'
            if dest.exists() and not a.force: print('skip', dest.relative_to(ROOT)); continue
            jobs.append((f'{s}/master', 't2i', CP.master_prompt(s), dest, [], a.res or '1k'))
        elif a.what == 'landmarks':
            ids = a.only.split(',') if a.only else list(CP.LANDMARKS)
            for lid in ids:
                dest = ROOT / 'assets' / 'landmarks' / s / f'{lid}.jpg'
                if dest.exists() and not a.force: print('skip', dest.relative_to(ROOT)); continue
                jobs.append((f'landmark/{s}/{lid}', 't2i', CP.landmark_prompt(s, lid), dest, [], (1632, 1024)))
        else:
            mp = OUT / s / 'master.jpg'
            if not mp.exists(): print('缺少定妆图', mp); continue
            ref = manifest().get(f'{s}/master', {}).get('url')
            ids = a.only.split(',') if a.only else list(CP.VARIANTS)
            for vid in ids:
                dest = OUT / s / f'{vid}.jpg'
                if dest.exists() and not a.force: print('skip', dest.relative_to(ROOT)); continue
                # 双参考图：图1 = 定妆图（公母并排），图2 = 该性别“已确认的基础形象”(Lv1 run)，用来锁死身体
                sex = CP.VARIANTS[vid][0]
                basep = OUT / s / f'{sex}0_run.jpg'
                refs = [ref] if ref else [str(mp)]
                if basep.exists() and basep.stem != vid:
                    refs.append(str(basep))
                jobs.append((f'{s}/{vid}', 'i2i', CP.variant_prompt(s, vid), dest, refs, a.res or '2k'))

    def do(job):
        key, mode, prompt, dest, refs, res = job
        urls = [r if r.startswith('http') else rh.upload(pathlib.Path(r)) for r in refs]
        tid, url, dt = run(rh, mode, prompt, dest, urls, res)
        record(key, {'mode': mode, 'prompt': prompt, 'taskId': tid, 'url': url, 'refs': urls, 'res': res, 'file': str(dest.relative_to(ROOT))})
        return key, dt

    ok = fail = 0
    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(do, j): j[0] for j in jobs}
        for f in as_completed(futs):
            try:
                k, dt = f.result(); ok += 1; print(f'OK   {k}  {dt:.0f}s', flush=True)
            except Exception as e:
                fail += 1; print(f'FAIL {futs[f]}  {e}', flush=True)
    print(f'done ok={ok} fail={fail}')
    sys.exit(1 if fail else 0)


if __name__ == '__main__':
    main()
