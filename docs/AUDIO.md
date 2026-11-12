# 口播与音效

> 本模板不引用任何客户录音：口播由 **edge-tts 逐句现场合成**，再按冻结的时间轴铺回原时刻。
> 画面、字幕、排程都只依赖时间表，换音色/换文案不需要重排画面。

## 数据流

```
races/<id>/config/vo1031.js   AUDIO / SEGS / CUE_LINES（冻结时间轴）
        │                     └─ inserts.js  后补插句
        ▼
tools/tts_edge.mjs            汇总 45 句 → out/plan/tts.json
        ▼
tools/tts_edge.py             edge-tts 逐句合成 mp3 → atempo 贴合目标时长 → 铺到原时刻
        ▼
audio/tts/timeline.wav        整条口播，123.043 s / 44.1 kHz / 双声道
        ▼
tools/vo_encode.mjs           → dist/vo.mp3（网页内嵌）
tools/sfx_cues.mjs            → 音效 cue 表
tools/sfx_render.py           → dist/sfx.mp3（音效床）+ dist/mix.mp3（口播 + 音效，成片用）
```

## 改文案

只改 `CUE_LINES[].vo`，**不要动 `t0 / t1 / d`** —— 那是画面与字幕共用的时间轴：

```bash
# 1. 编辑 races/<id>/config/vo1031.js 的 CUE_LINES[].vo
npm run timeline     # = node tools/tts_edge.mjs --force，重新合成 audio/tts/timeline.wav
npm run preview      # 重新编码 dist/vo.mp3 并打包 stage
npm run voice        # 校验：45 行字幕切行、拼回原文、逐行时长
```

后补的句子写在 `inserts.js`（`text` + `head` + `dur` + 公里窗口），不塞进 25 段排程。

## 换音色

```bash
$env:TTS_VOICE='zh-CN-XiaoxiaoNeural'; npm run timeline
```

默认 `zh-CN-YunjianNeural`。edge-tts 需要网络与 `uv`。

## 音效

音效全部由 `tools/sfx_render.py` 用 numpy 程序化合成（无第三方素材）：

```bash
npm run sfx          # cue 表 → 合成 → 审计 → 接触表
npm run sfx:check    # 与画面时间轴的一致性（25 项）
npm run stems        # 分轨核对（口播 / 音效 / 混音 6 项）
```

## 校验清单

| 命令 | 查什么 |
|---|---|
| `npm run voice` | 字幕切行自检 + 段落速度表 |
| `npm run sfx:check` | 音效 cue 与画面同步、两轨漂移 |
| `npm run stems` | 分轨相关度、峰值、静音段 |
