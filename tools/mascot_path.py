"""角色（吉祥物）素材的**唯一路径解析** —— 所有角色相关工具都从这里取路径。

模板结构：角色素材属于**赛事包**，不再放全局 assets/crabs：
    races/<ACTIVE_RACE>/mascots/
        cut.json                 锚点表（每张图的 ax/ay/cx + seq 帧清单）
        <style>/<id>.webp|jpg    单帧立绘（抠好的透明图在 cut/ 下）
        <style>/cut/             pack_assets 打包用的抠图
        <style>/seq/<id>/        序列帧（无损 WebP）
        <style>/seq_sheet/<id>.jpg  切格前的宫格原图
        manifest.json            生成记录（提示词 / taskId）

新增一场赛事：把上面这一坨整个复制进 races/<新id>/mascots/，改 cut.json 即可；
工具不用改，它们跟着 src/config/active-race.js 走。
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def active_race():
    p = ROOT / 'src' / 'config' / 'active-race.js'
    if not p.exists():
        return ''
    m = re.search(r"ACTIVE_RACE\s*=\s*'([^']+)'", p.read_text(encoding='utf-8'))
    return m.group(1) if m else ''


ACTIVE = active_race()
PACK = ROOT / 'races' / ACTIVE if ACTIVE else None

#: 角色素材根目录（赛事包优先；老工程退回全局 assets/crabs）
MASCOTS = (PACK / 'mascots') if PACK and (PACK / 'mascots').exists() else (ROOT / 'assets' / 'crabs')
#: 锚点表
CUT_JSON = MASCOTS / 'cut.json'
#: 生成记录
MANIFEST = MASCOTS / 'manifest.json'

if __name__ == '__main__':
    print('ACTIVE   ', ACTIVE)
    print('MASCOTS  ', MASCOTS, '存在' if MASCOTS.exists() else '不存在')
    print('CUT_JSON ', CUT_JSON, '存在' if CUT_JSON.exists() else '不存在')
