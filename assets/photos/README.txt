真·地标照片放这里，文件名 = 地标 id（museum / oldstreet / sequoia / watertown / lakepark / wetland / baosi / hospital）。
跑 tools/card_art.py batch assets/photos 就会按图卡比例(2.66:1)出图。

⚠️ 这是一个**构建输入目录**，不是运行时素材：
   运行时用的是 assets/landmarks/<画风>/<id>.jpg（在 pack_assets.py 里打进 assets_*.js）。
   所以这里压到 1800px 宽 / JPEG q90 完全够用 —— 出图只要够 AI 看清建筑细节。
   原始 3840×2160 的 PNG 已备份到 _work/assets_orig/photos/（不入库；96 MB → 3.6 MB）。
