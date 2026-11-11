"""RunningHub seedream-v5-pro 文生图 / 图生图 接口测试。

流程：
  1. 文生图  POST /openapi/v2/seedream-v5-pro/text-to-image
  2. 下载结果图
  3. 上传图片 POST /openapi/v2/media/upload/binary（--image 指定本地图，否则用第 2 步的图）
  4. 图生图  POST /openapi/v2/seedream-v5-pro/image-to-image
  每个任务提交后轮询 POST /openapi/v2/query 直到 SUCCESS / FAILED。

API Key 读环境变量 RH_API；当前进程没有时，从 Windows 用户变量（HKCU\\Environment）读。

用法：
  python tools/rh_seedream_test.py                 # 文生图 + 图生图
  python tools/rh_seedream_test.py --only t2i
  python tools/rh_seedream_test.py --only i2i --image path/to/ref.png
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

BASE = "https://www.runninghub.cn/openapi/v2"
OUT_DIR = Path(__file__).resolve().parent.parent / "out" / "rh_test"

T2I_PROMPT = "一只卡通大闸蟹穿着马拉松号码布在湖边赛道上奔跑，扁平插画风格，明亮配色，干净背景。16:9"
I2I_PROMPT = "保持构图和角色不变，把画面改成水彩手绘风格，暖色夕阳光线"


def load_api_key() -> str:
    key = os.environ.get("RH_API")
    if not key and sys.platform == "win32":
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                key, _ = winreg.QueryValueEx(k, "RH_API")
        except FileNotFoundError:
            key = None
    if not key:
        sys.exit("找不到 API Key：请设置环境变量 / 用户变量 RH_API")
    return key.strip()


class RH:
    def __init__(self, api_key: str):
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Bearer {api_key}"

    def _check(self, r: requests.Response) -> dict:
        try:
            data = r.json()
        except ValueError:
            raise RuntimeError(f"HTTP {r.status_code}，非 JSON 响应：{r.text[:500]}")
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}：{json.dumps(data, ensure_ascii=False)}")
        return data

    def submit(self, endpoint: str, payload: dict) -> str:
        r = self.s.post(f"{BASE}/{endpoint}", json=payload, timeout=60)
        data = self._check(r)
        print("  提交响应:", json.dumps(data, ensure_ascii=False))
        task_id = data.get("taskId") or (data.get("data") or {}).get("taskId")
        if not task_id:
            raise RuntimeError("提交失败，响应中没有 taskId")
        return task_id

    def wait(self, task_id: str, interval: float = 5, timeout: float = 600) -> dict:
        start = time.time()
        last = None
        while True:
            r = self.s.post(f"{BASE}/query", json={"taskId": task_id}, timeout=60)
            data = self._check(r)
            status = data.get("status")
            if status != last:
                print(f"  [{time.time() - start:5.0f}s] {status}")
                last = status
            if status == "SUCCESS":
                return data
            if status == "FAILED":
                raise RuntimeError(f"任务失败：{data.get('errorCode')} {data.get('errorMessage')}")
            if time.time() - start > timeout:
                raise TimeoutError(f"等待超时（{timeout}s），最后状态 {status}")
            time.sleep(interval)

    def upload(self, path: Path) -> str:
        with path.open("rb") as f:
            r = self.s.post(f"{BASE}/media/upload/binary", files={"file": (path.name, f)}, timeout=120)
        data = self._check(r)
        print("  上传响应:", json.dumps(data, ensure_ascii=False)[:400])
        body = data.get("data") or data
        url = body.get("download_url") or body.get("downloadUrl")
        if not url:
            raise RuntimeError("上传响应中没有 download_url")
        return url

    def download(self, url: str, dest: Path) -> Path:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return dest


def run_task(rh: RH, name: str, endpoint: str, payload: dict) -> Path:
    print(f"\n== {name}  /{endpoint}")
    print("  参数:", json.dumps(payload, ensure_ascii=False))
    t0 = time.time()
    task_id = rh.submit(endpoint, payload)
    print("  taskId:", task_id)
    result = rh.wait(task_id)
    results = result.get("results") or []
    if not results:
        raise RuntimeError(f"SUCCESS 但没有 results：{result}")
    url = results[0]["url"]
    ext = results[0].get("outputType") or payload.get("outputFormat", "jpg")
    ext = "jpg" if ext == "jpeg" else ext
    dest = rh.download(url, OUT_DIR / f"{name}_{task_id}.{ext}")
    print(f"  完成，耗时 {time.time() - t0:.0f}s，已保存 {dest}")
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["t2i", "i2i"])
    ap.add_argument("--image", type=Path, help="图生图参考图（本地 PNG/JPEG），默认用文生图结果")
    ap.add_argument("--resolution", default="1k", choices=["1k", "2k"])
    ap.add_argument("--format", default="jpeg", choices=["jpeg", "png"])
    ap.add_argument("--t2i-prompt", default=T2I_PROMPT)
    ap.add_argument("--i2i-prompt", default=I2I_PROMPT)
    args = ap.parse_args()

    if args.only == "i2i" and not args.image:
        ap.error("--only i2i 需要 --image")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rh = RH(load_api_key())
    common = {"resolution": args.resolution, "outputFormat": args.format}
    ok = True

    ref = args.image
    if args.only in (None, "t2i"):
        try:
            t2i_img = run_task(rh, "t2i", "seedream-v5-pro/text-to-image", {"prompt": args.t2i_prompt, **common})
            ref = ref or t2i_img
        except Exception as e:
            ok = False
            print("  文生图失败:", e)

    if args.only in (None, "i2i") and ref:
        try:
            print(f"\n== 上传参考图 {ref}")
            ref_url = rh.upload(ref)
            run_task(
                rh,
                "i2i",
                "seedream-v5-pro/image-to-image",
                {"prompt": args.i2i_prompt, "imageUrls": [ref_url], **common},
            )
        except Exception as e:
            ok = False
            print("  图生图失败:", e)

    print("\n全部通过" if ok else "\n有失败项，见上方日志")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
