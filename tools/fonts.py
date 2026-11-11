"""
字体子集化 → dist/fonts.css（base64 woff2 内嵌，保证离线与 4K 渲染字形一致）

字库：HarmonyOS Sans SC（Bold/Medium，可免费商用）+ Figtree Black（数字/拉丁，OFL）
字符集：自动扫描 src/ 与 races/ 下全部 .js/.html/.json/.srt 里出现的字符 + ASCII + 常用标点。
        改了文案重跑本脚本即可（只扫 src 会漏掉赛事包里的台词，字形会掉回雅黑）。

用法：uv run --with fonttools --with brotli python tools/fonts.py
"""
import base64, io, os, pathlib, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCAL = pathlib.Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts'
FONTS = [
    ('HMSans', 700, pathlib.Path('C:/Windows/Fonts/HarmonyOS_Sans_SC_Bold.ttf')),
    ('HMSans', 500, pathlib.Path('C:/Windows/Fonts/HarmonyOS_Sans_SC_Medium.ttf')),
    ('FigtreeX', 900, LOCAL / 'Figtree-Black.ttf'),
]
EXTRA = '0123456789.,:;!?%+-—–/()（）：；，。、！？·…“”‘’「」《》【】→←↑↓°×km'


def charset():
    s = set(chr(c) for c in range(0x20, 0x7f)) | set(EXTRA)
    # 模板结构：赛事内容在 races/ 下，扫 src/ 会漏掉口播文案与路名 ⇒ 两个都要扫
    for p in (list((ROOT / 'src').rglob('*.js')) + list((ROOT / 'src').rglob('*.html'))
              + list((ROOT / 'races').rglob('*.js')) + list((ROOT / 'races').rglob('*.json'))
              + list((ROOT / 'races').rglob('*.srt'))):
        s |= set(p.read_text(encoding='utf-8'))
    return ''.join(sorted(c for c in s if c.isprintable()))


def main():
    chars = charset()
    css = []
    for fam, wt, path in FONTS:
        f = TTFont(str(path))
        opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = []
        sub = subset.Subsetter(opts); sub.populate(text=chars); sub.subset(f)
        buf = io.BytesIO(); f.flavor = 'woff2'; f.save(buf)
        b64 = base64.b64encode(buf.getvalue()).decode()
        css.append(f"@font-face{{font-family:'{fam}';font-weight:{wt};font-display:block;src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
        print(fam, wt, len(buf.getvalue()) // 1024, 'KB')
    (ROOT / 'dist').mkdir(exist_ok=True)
    (ROOT / 'dist/fonts.css').write_text('\n'.join(css), encoding='utf-8')
    print('chars', len(chars))


if __name__ == '__main__':
    main()
