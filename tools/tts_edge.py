# 用 edge-tts 现场合成口播，铺成一条与画面时刻对齐的整轨 -> audio/tts/timeline.wav
#   本模板不再引用客户整条录音：每句文本经 edge-tts 合成后，**按时长贴合**塞回原来的时间槽，
#   所以画面 / 排程 / 字幕 / 音效全都不用改，只换声音来源。
#   uv run --with edge-tts --with numpy --with scipy python tools/tts_edge.py out/plan/tts.json
import asyncio
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SR = 44100
RAW = ROOT / 'audio/tts/raw'
WAV = ROOT / 'audio/tts/wav'
OUT = ROOT / 'audio/tts/timeline.wav'


async def synth(entry, voice, sem):
    """单句合成；同一句已存在就跳过（改文案后请 node tools/tts_edge.mjs --force）"""
    mp3 = RAW / f"{entry['id']}.mp3"
    async with sem:
        if mp3.exists() and mp3.stat().st_size > 512:
            return
        for attempt in range(3):
            try:
                await edge_tts.Communicate(entry['text'], voice).save(str(mp3))
                return
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(1.5)


def probe(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'csv=p=0', str(p)], capture_output=True, text=True)
    return float(r.stdout.strip())


def to_wav(mp3, wav, tempo):
    """转 44.1k 双声道；tempo = 原长/目标长，用 atempo 微调语速（不改变音高）"""
    args = ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(mp3)]
    if abs(tempo - 1) > 0.02:
        f, rest = tempo, []
        while f > 2.0:       # atempo 单次上限 2.0，超了就串级
            rest.append(2.0)
            f /= 2.0
        while f < 0.5:
            rest.append(0.5)
            f /= 0.5
        rest.append(f)
        chain = ','.join(f'atempo={x:.4f}' for x in rest)
        args += ['-filter:a', chain]
    args += ['-ar', str(SR), '-ac', '2', '-c:a', 'pcm_s16le', str(wav)]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr or 'ffmpeg 失败')


def read_wav(p):
    with wave.open(str(p), 'rb') as w:
        n, ch, sr = w.getnframes(), w.getnchannels(), w.getframerate()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype='<i2').reshape(-1, ch).astype(np.float32) / 32768.0
    if ch == 1:
        a = np.repeat(a, 2, axis=1)
    return a[:, :2]


def main():
    plan = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    voice = plan.get('voice', 'zh-CN-YunjianNeural')
    RAW.mkdir(parents=True, exist_ok=True)
    WAV.mkdir(parents=True, exist_ok=True)

    async def run():
        sem = asyncio.Semaphore(4)
        await asyncio.gather(*(synth(e, voice, sem) for e in plan['entries']))

    asyncio.run(run())

    total_n = int(round(plan['total'] * SR))
    buf = np.zeros((total_n, 2), dtype=np.float32)
    for e in plan['entries']:
        mp3 = RAW / f"{e['id']}.mp3"
        wav = WAV / f"{e['id']}.wav"
        target = float(e['dur'])
        if target <= 0:
            continue
        to_wav(mp3, wav, probe(mp3) / target)
        a = read_wav(wav)
        tn = int(round(target * SR))
        if a.shape[0] > tn:
            a = a[:tn]
        elif a.shape[0] < tn:
            a = np.vstack([a, np.zeros((tn - a.shape[0], 2), dtype=np.float32)])
        s = int(round(float(e['t']) * SR))
        end = min(total_n, s + tn)
        if end <= s:
            continue
        buf[s:end] += a[:end - s]

    peak = float(np.max(np.abs(buf))) or 1.0
    buf *= min(1.0, 0.89 / peak)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(buf, -1, 1) * 32767).astype('<i2').tobytes())
    print(f"  → {OUT.relative_to(ROOT)}  {plan['total']}s  {len(plan['entries'])} 句  ({OUT.stat().st_size / 1048576:.2f} MB)")


if __name__ == '__main__':
    main()
