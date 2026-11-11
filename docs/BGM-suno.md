# Suno 提示词 · 2026 澜湾马拉松赛道介绍片（76.81 s）

片子调性：**清新 / 明亮 / 通透**（客户选的是 B 导航地图那版粉彩插画），赛事宣传 + 文旅，
旁白是绝对主角，音乐要"抬情绪但不抢话"。

**速度：90 BPM，4/4**（一小节 2.667 s，**29 小节 = 77.33 s**，比片长多 0.52 s，剪掉）
**调性建议：D 大调**（明亮但不甜腻；避免小调，全程没有"悲伤"的时刻）

---

## ① 主用（Suno「Style of Music」框，直接粘）

```
instrumental cinematic corporate, bright and airy, 90 bpm, D major,
warm piano ostinato, pizzicato strings, soft analog pad, light electronic pulse,
hand claps and soft taiko on the downbeats, bamboo flute and guqin accents,
glockenspiel sparkle, clean modern mix, wide stereo, no lead vocal, no EDM drop,
uplifting and hopeful, made to sit under a Chinese voiceover
```

（约 360 字符。如果你的 Suno 版本 Style 框只给 200 字符，用下面这条精简版：）

```
instrumental cinematic corporate, 90 bpm, D major, warm piano ostinato,
pizzicato strings, soft analog pad, light electronic pulse, handclaps,
soft taiko, clean airy mix, uplifting, no vocals
```

## ② 主用（Suno v5「Custom Mode」长描述，粘在 Style 里，能写长就写这条）

```
A 90 BPM instrumental in D major for a 77-second Chinese marathon course-introduction film.
Tone: bright, clean, airy, hopeful — like premium tourism advertising, not a sports anthem.
Core texture: warm felt-piano ostinato (4-note motif, never fully resolved),
pizzicato strings answering it, a soft analog pad underneath, and a gentle electronic pulse
as the pulse of running feet. Percussion is light and dry: finger snaps and soft taiko on
downbeats, a brushed electronic kick, almost no snare rolls. Accents of bamboo flute (dizi)
and a plucked guqin-like instrument for a Jiangnan lake-town flavour, plus glockenspiel
sparkle on transitions.
Production: modern and transparent, wide stereo, mixed to leave 1–4 kHz open for a voiceover,
no low-end mud, no distorted guitars, no big EDM drop, no drum fills that draw attention.
No vocals, no chanting, no lyrics. Emotion arc: intimate opening → confident groove →
lift at the bridge → softest at the lake → tension on the second climb → first climax at
the half-marathon finish → open and expansive for the long lake loop → full climax at the
finish line → a single warm resolving chord.
```

## ③ 结构标签（粘在「Lyrics」框；纯器乐也要写，Suno 会照它排段落）

```
[Intro: soft pad, one distant piano note, 2 bars]
[Theme: piano ostinato enters, light electronic pulse, 2 bars]
[Groove: pizzicato strings, snaps, soft taiko, 4 bars]
[Lift: cello and warm brass pads join, 3 bars]
[Pull back: strings drop out, only groove, 1 bar]
[Soft: plucked strings and flute, half-time feel, 1 bar]
[Tension: rising half-step sequence, denser percussion, 2 bars]
[Split: rhythmic stabs, stereo call-and-response, 2 bars]
[Climax 1: full ensemble, brass swell, 3 bars]
[Open: steady running groove, long string lines, 5 bars]
[Climax 2: full ensemble, timpani, rising scale, 4 bars]
[Outro: one warm resolving chord, 1 bar]
[End]
```

## ④ 排除项（Suno v5「Exclude Styles」框）

```
vocals, choir, rap, spoken word, edm drop, dubstep, distorted guitar, heavy metal,
dark minor key, horror, sad piano, orchestral trailer hit, marching band, national anthem,
busy drum fills, high-frequency sizzle, lo-fi tape hiss, chiptune
```

---

## ⑤ 三个备选（同一片子，换味）

**A · 江南水乡（更"文旅"，民乐多一点）**

```
instrumental Chinese modern folk, 90 bpm, D major, guzheng and dizi lead,
pizzicato strings, warm piano, soft frame-drum, hand bells, airy reverb,
bright and clean, uplifting, no vocals, no erhu sadness
```

**B · 赛事宣传片（更有推进力，适合社媒版）**

```
instrumental modern sports promo, 90 bpm, D major, driving piano eighth-notes,
punchy but soft kick, claps, string ostinato, bright synth pluck, brass stabs,
confident and uplifting, clean wide mix, no vocals, no EDM drop
```

**C · 极简氛围（旁白最清楚，适合长版本/展厅循环）**

```
instrumental minimal ambient, 90 bpm, D major, felt piano, soft pad, single cello line,
subtle pulse, no drums, very sparse, warm and hopeful, lots of space for narration, no vocals
```

---

## ⑥ 生成与后期怎么落地（不要硬求 Suno 给你 77 秒）

1. 用 ①/② + ③ 生成 **3–5 条**，选一条"前 30 小节结构最像"的。
2. 在 DAW 里裁到 **77.33 s**（29 小节 @90 BPM），首尾各 0.3 s 淡入淡出。
3. 若生成的 BPM 不精确（Suno 常给 88–92），用**变速不变调**（time-stretch，±3% 内听不出）拉到 90，再对齐小节。
4. **对点**：把这 7 个时刻对上（小节号见 `_work/bgm-spec.md`）——
   发枪 6.42 / 第二枪 8.02 / 起跑 8.64 / 桥顶 25.45 / 折返 39.33 / 母蟹撞线 48.44 / 公蟹撞线 65.26。
   实在对不上就微调 BGM 起点（±0.3 s 内不影响观感），**不要剪画面**。
5. **混音**（和现有音效同一套口径）：
   - BGM 说话时比口播低 **18–22 dB**，空隙时抬到只低 **8–10 dB**（用侧链压音，别手画）
   - BGM 峰值 ≤ **−6 dBFS**；EQ 在 **1–4 kHz 挖 2 dB** 的坑（把说话频段让出来）
   - 音效（现有，说话时 −35.1 dBFS RMS、峰值 −6.5）是**短促中高频**，BGM 的节奏型别写在同一频段，
     低音放在 80–300 Hz、亮点放在 6 kHz 以上
   - 全片峰值硬线 **−1.5 dBFS**

---

## ⑦ 一句话给客户看

> 90 BPM、D 大调的清新器乐，钢琴动机 + 拨弦弦乐 + 轻电子脉冲，江南笛箫做点缀；
> 六段情绪跟片子走：开场克制 → 城区律动 → 上桥抬高 → 悦水湾最柔 → 二次爬坡紧张 →
> 半马第一个高潮 → 环湖开阔 → 终点全奏 → 落版一记温软的和弦。
