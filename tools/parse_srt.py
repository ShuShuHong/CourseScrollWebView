"""
解析客户交付的 SRT，与客户原文逐行对账，生成 voice.js 用的行表。

  uv run --with pillow python tools/parse_srt.py

做的事：
  1) 读 audio/1028/1028.srt → [{i, t0, t1, text}]
  2) 去掉标点后拼起来，与 voice.js 的 ORIGINAL 比对，逐字报告差异（ASR 常见错字单独列出）
  3) 输出 _work/srt.json（供其他脚本用）与 stdout 的对账表（字/秒、句间空隙）
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRT = ROOT / 'audio' / '1028' / '1028.srt'
OUT = ROOT / '_work' / 'srt.json'


def ts(s):
    h, m, rest = s.split(':')
    sec, ms = rest.replace(',', '.').split('.')
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms.ljust(3, '0')[:3]) / 1000


def parse(p):
    raw = p.read_text(encoding='utf-8-sig').replace('\r\n', '\n')
    cues = []
    for block in re.split(r'\n\s*\n', raw.strip()):
        lines = [l for l in block.split('\n') if l.strip()]
        if len(lines) < 2:
            continue
        idx = int(lines[0].strip())
        m = re.match(r'\s*(\d\d:\d\d:\d\d[,.]\d+)\s*-->\s*(\d\d:\d\d:\d\d[,.]\d+)', lines[1])
        if not m:
            continue
        cues.append({'i': idx, 't0': round(ts(m.group(1)), 3), 't1': round(ts(m.group(2)), 3),
                     'text': ' '.join(lines[2:]).strip()})
    return cues


PUNCT = '，。；：、,. ;:!?！？“”"\'（）()【】[]'
ASR_FIX = {'2026六高淳马拉松': '2026高淳马拉松'}


def norm(s):
    s = ASR_FIX.get(s, s)
    return ''.join(ch for ch in s if ch not in PUNCT)


def main():
    cues = parse(SRT)
    joined = ''.join(norm(c['text']) for c in cues)
    sys.path.insert(0, str(ROOT / 'tools'))
    # ORIGINAL 从 voice.js 里抓（避免 python 依赖 node 打包）
    src = (ROOT / 'src' / 'config' / 'voice.js').read_text(encoding='utf-8')
    block = src[src.index('export const ORIGINAL = ['):src.index('].join(\'\');') + 1]
    orig = ''.join(re.findall(r"'([^']*)'", block))
    orig_n = norm(orig.replace('A、B区', 'AB区'))

    print(f'SRT: {len(cues)} 条 · {cues[0]["t0"]:.2f}s → {cues[-1]["t1"]:.2f}s')
    print(f'字幕合计 {len(joined)} 字（去标点） · 原文 {len(orig_n)} 字（去标点）')
    if joined == orig_n:
        print('✅ 逐字一致（忽略标点/空格）')
    else:
        i = 0
        while i < min(len(joined), len(orig_n)) and joined[i] == orig_n[i]:
            i += 1
        print(f'✘ 第 {i+1} 字起不一致')
        print(f'  字幕 …{joined[max(0,i-15):i+20]}')
        print(f'  原文 …{orig_n[max(0,i-15):i+20]}')

    print(f'\n{"#":>2} {"入点":>7} {"出点":>7} {"时长":>5} {"字":>3} {"字/秒":>5}  空隙  文本')
    for k, c in enumerate(cues):
        d = c['t1'] - c['t0']
        ch = len(norm(c['text']))
        gap = c['t0'] - cues[k - 1]['t1'] if k else c['t0']
        flag = '' if 3.6 <= ch / d <= 6.2 else '  ← 语速异常'
        print(f'{c["i"]:>2} {c["t0"]:>7.3f} {c["t1"]:>7.3f} {d:>5.2f} {ch:>3} {ch/d:>5.2f} {gap:>5.2f}  {c["text"]}{flag}')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'dur': cues[-1]['t1'], 'cues': cues}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\n→ {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
