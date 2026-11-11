// ⚠️ 冻结时间轴：42 条字幕 / 25 段由排程确定，不要动 t0/t1；改文案直接改 CUE_LINES.vo（成片口播由 edge-tts 现合成）

// 42 条字幕 / 25 段 铺到 V=0.80 的匀速时间轴上
// 片头留白 1.2s，片尾留白 1.2s，成片 123.043s
export const AUDIO = {
  file: 'audio/tts/timeline.wav',         // node tools/tts_edge.mjs 用 edge-tts 现合成的整轨
  dur: 123.043,
  cues: 45,
  segments: 26,
};
export const TIMING = { lead: 1.2, tail: 1.2, v: 0.80, total: 120.643, duration: 123.043 };
export const FINISH = 42.195;

/** 25 段 + 1 段加冕停留（kind: line | gap | hold；pause = 副本内主里程轴暂停） */
export const SEGS = [
  {
    "n": 1,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 1.2,
    "t1": 4.36,
    "d": 3.16,
    "km0": 0,
    "km1": 0,
    "pause": true,
    "v": 0,
    "span": 3.16,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      1,
      2
    ],
    "note": "副本内（主里程轴暂停）"
  },
  {
    "n": 2,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 4.36,
    "t1": 7.22,
    "d": 2.86,
    "km0": 0,
    "km1": 0,
    "pause": true,
    "v": 0,
    "span": 2.86,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      3
    ],
    "note": "副本内（主里程轴暂停）"
  },
  {
    "n": 3,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 7.22,
    "t1": 9.86,
    "d": 2.64,
    "km0": 0,
    "km1": 0,
    "pause": true,
    "v": 0,
    "span": 2.64,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      4
    ],
    "note": "副本内（主里程轴暂停）"
  },
  {
    "n": 4,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 9.86,
    "t1": 11.24,
    "d": 1.38,
    "km0": 0.1,
    "km1": 0.45,
    "pause": false,
    "v": 0.2536,
    "span": 1.38,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      5
    ],
    "note": ""
  },
  {
    "n": 5,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 11.24,
    "t1": 13.2,
    "d": 1.96,
    "km0": 0.45,
    "km1": 1.4,
    "pause": false,
    "v": 0.4847,
    "span": 1.96,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      6
    ],
    "note": ""
  },
  {
    "n": 6,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 13.2,
    "t1": 16.74,
    "d": 3.54,
    "km0": 1.4,
    "km1": 2.5,
    "pause": false,
    "v": 0.3107,
    "span": 3.54,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      7,
      8
    ],
    "note": ""
  },
  {
    "n": "L08b",
    "kind": "ins",
    "scene": "地图主场景",
    "t0": 16.74,
    "t1": 20.11,
    "d": 3.37,
    "km0": 2.5,
    "km1": 3.4,
    "pause": false,
    "v": 0.2671,
    "span": 3.37,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      9
    ],
    "note": "客户 2026-11-01：博物馆之后新增，录音 3.634 s"
  },
  {
    "n": "G7",
    "kind": "gap",
    "scene": "地图主场景",
    "t0": 20.11,
    "t1": 23.11,
    "d": 3,
    "km0": 3.4,
    "km1": 5.8,
    "pause": false,
    "v": 0.8,
    "span": 3,
    "freeze": null,
    "cuts": [],
    "note": "空档：无字幕无配音"
  },
  {
    "n": 7,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 23.11,
    "t1": 25.17,
    "d": 2.06,
    "km0": 5.8,
    "km1": 6.6,
    "pause": false,
    "v": 0.3883,
    "span": 2.06,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      9
    ],
    "note": ""
  },
  {
    "n": 8,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 25.17,
    "t1": 27.35,
    "d": 2.18,
    "km0": 6.6,
    "km1": 7.5,
    "pause": false,
    "v": 0.4128,
    "span": 2.18,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      10
    ],
    "note": ""
  },
  {
    "n": 9,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 27.35,
    "t1": 30.37,
    "d": 3.02,
    "km0": 7.5,
    "km1": 8.1,
    "pause": false,
    "v": 0.1987,
    "span": 3.02,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      11
    ],
    "note": ""
  },
  {
    "n": 10,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 30.37,
    "t1": 35.89,
    "d": 5.52,
    "km0": 8.1,
    "km1": 9,
    "pause": false,
    "v": 0.163,
    "span": 5.52,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      12,
      13,
      14
    ],
    "note": ""
  },
  {
    "n": 11,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 35.89,
    "t1": 38.47,
    "d": 2.58,
    "km0": 9,
    "km1": 10,
    "pause": false,
    "v": 0.3876,
    "span": 2.58,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      15
    ],
    "note": ""
  },
  {
    "n": "G13",
    "kind": "gap",
    "scene": "地图主场景",
    "t0": 38.47,
    "t1": 39.72,
    "d": 1.25,
    "km0": 10,
    "km1": 11,
    "pause": false,
    "v": 0.8,
    "span": 1.25,
    "freeze": null,
    "cuts": [],
    "note": "空档：无字幕无配音"
  },
  {
    "n": 12,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 39.72,
    "t1": 42.04,
    "d": 2.32,
    "km0": 11,
    "km1": 12,
    "pause": false,
    "v": 0.431,
    "span": 2.32,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      16
    ],
    "note": ""
  },
  {
    "n": 13,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 42.04,
    "t1": 45.1,
    "d": 3.06,
    "km0": 12,
    "km1": 13,
    "pause": false,
    "v": 0.3268,
    "span": 3.06,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      17
    ],
    "note": ""
  },
  {
    "n": 14,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 45.1,
    "t1": 48.82,
    "d": 3.72,
    "km0": 13,
    "km1": 16,
    "pause": false,
    "v": 0.8065,
    "span": 3.72,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      18,
      19
    ],
    "note": ""
  },
  {
    "n": "G17",
    "kind": "gap",
    "scene": "地图主场景",
    "t0": 48.82,
    "t1": 51.32,
    "d": 2.5,
    "km0": 16,
    "km1": 18,
    "pause": false,
    "v": 0.8,
    "span": 2.5,
    "freeze": null,
    "cuts": [],
    "note": "空档：无字幕无配音"
  },
  {
    "n": 15,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 51.32,
    "t1": 55.56,
    "d": 4.24,
    "km0": 18,
    "km1": 19,
    "pause": false,
    "v": 0.2358,
    "span": 4.24,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      20,
      21
    ],
    "note": ""
  },
  {
    "n": 16,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 55.56,
    "t1": 58.88,
    "d": 3.32,
    "km0": 19,
    "km1": 20,
    "pause": false,
    "v": 0.3012,
    "span": 3.32,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      22
    ],
    "note": ""
  },
  {
    "n": 17,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 58.88,
    "t1": 66.697,
    "d": 7.817,
    "km0": 20,
    "km1": 20.518,
    "pause": false,
    "v": 0.3012,
    "span": 1.72,
    "freeze": 60.6,
    "cuts": [
      {
        "t": 60.6,
        "scene": "分流副本"
      }
    ],
    "cueIds": [
      23,
      24,
      25
    ],
    "note": ""
  },
  {
    "n": 18,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 66.697,
    "t1": 70.977,
    "d": 4.28,
    "km0": 20.518,
    "km1": 20.518,
    "pause": true,
    "v": 0,
    "span": 0.06,
    "freeze": 66.7571,
    "cuts": [
      {
        "t": 66.7571,
        "scene": "主会场副本"
      }
    ],
    "cueIds": [
      26,
      27
    ],
    "note": "副本内（主里程轴暂停）"
  },
  {
    "n": "H18",
    "kind": "hold",
    "scene": "主会场副本",
    "t0": 70.977,
    "t1": 73.58,
    "d": 2.602,
    "km0": 20.518,
    "km1": 22.6,
    "pause": false,
    "v": 0.8,
    "span": 2.6025,
    "freeze": null,
    "cuts": [],
    "note": "湾湾冲线／加冕期间蓝蓝继续跑"
  },
  {
    "n": 19,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 73.58,
    "t1": 78.421,
    "d": 4.841,
    "km0": 22.6,
    "km1": 27,
    "pause": false,
    "v": 0.9088,
    "span": 4.8414,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      28,
      29
    ],
    "note": ""
  },
  {
    "n": 20,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 78.421,
    "t1": 81.624,
    "d": 3.203,
    "km0": 27,
    "km1": 29.1,
    "pause": false,
    "v": 0.6556,
    "span": 3.2033,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      30
    ],
    "note": ""
  },
  {
    "n": "G25",
    "kind": "gap",
    "scene": "地图主场景",
    "t0": 81.624,
    "t1": 85.874,
    "d": 4.25,
    "km0": 29.1,
    "km1": 32.5,
    "pause": false,
    "v": 0.8,
    "span": 4.25,
    "freeze": null,
    "cuts": [],
    "note": "空档：无字幕无配音"
  },
  {
    "n": "L31b",
    "kind": "ins",
    "scene": "地图主场景",
    "t0": 85.874,
    "t1": 88.924,
    "d": 3.05,
    "km0": 32.5,
    "km1": 34.94,
    "pause": false,
    "v": 0.8,
    "span": 3.05,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      31
    ],
    "note": "客户 2026-11-08：旧版这句是在 1029 音轨里 splice 进去的，新版换成单独录音、单独钉一句话"
  },
  {
    "n": "G27",
    "kind": "gap",
    "scene": "地图主场景",
    "t0": 88.924,
    "t1": 93.999,
    "d": 5.075,
    "km0": 34.94,
    "km1": 39,
    "pause": false,
    "v": 0.8,
    "span": 5.075,
    "freeze": null,
    "cuts": [],
    "note": "空档：无字幕无配音"
  },
  {
    "n": 21,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 93.999,
    "t1": 96.039,
    "d": 2.04,
    "km0": 39,
    "km1": 40,
    "pause": false,
    "v": 0.4902,
    "span": 2.04,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      31
    ],
    "note": ""
  },
  {
    "n": 22,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 96.039,
    "t1": 98.719,
    "d": 2.68,
    "km0": 40,
    "km1": 40.75,
    "pause": false,
    "v": 0.2799,
    "span": 2.68,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      32
    ],
    "note": ""
  },
  {
    "n": 23,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 98.719,
    "t1": 100.239,
    "d": 1.52,
    "km0": 40.75,
    "km1": 41.35,
    "pause": false,
    "v": 0.3947,
    "span": 1.52,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      33
    ],
    "note": ""
  },
  {
    "n": 24,
    "kind": "line",
    "scene": "地图主场景",
    "t0": 100.239,
    "t1": 104.399,
    "d": 4.16,
    "km0": 41.35,
    "km1": 41.965,
    "pause": false,
    "v": 0.2985,
    "span": 2.06,
    "freeze": 102.2993,
    "cuts": [
      {
        "t": 102.2993,
        "scene": "主会场副本"
      }
    ],
    "cueIds": [
      34,
      35
    ],
    "note": ""
  },
  {
    "n": "H24",
    "kind": "hold",
    "scene": "主会场副本",
    "t0": 104.399,
    "t1": 107.749,
    "d": 3.35,
    "km0": 41.965,
    "km1": 42.195,
    "pause": false,
    "v": 0.0687,
    "span": 3.35,
    "freeze": null,
    "cuts": [],
    "note": "蓝蓝冲刺（最后 230 m）+ 冲线 + 加冕 + 欢呼（无口播）"
  },
  {
    "n": 25,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 107.749,
    "t1": 115.749,
    "d": 8,
    "km0": 42.195,
    "km1": 42.195,
    "pause": true,
    "v": 0,
    "span": 8,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      36,
      37,
      38,
      39
    ],
    "note": "副本内（主里程轴暂停）"
  },
  {
    "n": "L41",
    "kind": "ins",
    "scene": "主会场副本",
    "t0": 115.749,
    "t1": 117.609,
    "d": 1.86,
    "km0": 42.195,
    "km1": 42.195,
    "pause": false,
    "v": 0,
    "span": 1.86,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      41
    ],
    "note": "客户 2026-11-09：新稿把这句加回来，单独录音 1.579 s"
  },
  {
    "n": 26,
    "kind": "line",
    "scene": "主会场副本",
    "t0": 117.609,
    "t1": 121.843,
    "d": 4.234,
    "km0": 42.195,
    "km1": 42.195,
    "pause": true,
    "v": 0,
    "span": 4.2336,
    "freeze": null,
    "cuts": [],
    "cueIds": [
      40,
      41,
      42
    ],
    "note": "副本内（主里程轴暂停）"
  }
];

/** 42 条字幕（dt = 相对所在段起点的偏移，d = 时长） */
export const CUE_LINES = [
  {
    "id": "L01",
    "seg": 1,
    "cue": 1,
    "dt": 0.12,
    "d": 1.84,
    "vo": "2026澜湾马拉松，",
    "color": null
  },
  {
    "id": "L02",
    "seg": 1,
    "cue": 2,
    "dt": 1.96,
    "d": 1.08,
    "vo": "赛道解锁。",
    "color": null
  },
  {
    "id": "L03",
    "seg": 2,
    "cue": 3,
    "dt": 0.12,
    "d": 2.72,
    "vo": "起点澜渚洲公园星湖南路，",
    "color": null
  },
  {
    "id": "L04",
    "seg": 3,
    "cue": 4,
    "dt": 0.02,
    "d": 2.48,
    "vo": "A、B区首发，C区第二枪",
    "color": null
  },
  {
    "id": "L05",
    "seg": 4,
    "cue": 5,
    "dt": 0.12,
    "d": 1.24,
    "vo": "今年赛段调整，",
    "color": null
  },
  {
    "id": "L06",
    "seg": 5,
    "cue": 6,
    "dt": 0.02,
    "d": 1.92,
    "vo": "增加约2公里城区段；",
    "color": null
  },
  {
    "id": "L07",
    "seg": 6,
    "cue": 7,
    "dt": 0.02,
    "d": 1.32,
    "vo": "目前位于城区段，",
    "color": null
  },
  {
    "id": "L08",
    "seg": 6,
    "cue": 8,
    "dt": 1.34,
    "d": 2.16,
    "vo": "约2.5公里澜湾博物馆。",
    "color": null
  },
  {
    "id": "L09",
    "seg": 7,
    "cue": 9,
    "dt": 0.04,
    "d": 1.96,
    "vo": "约5.8公里澜湾老街，",
    "color": null
  },
  {
    "id": "L10",
    "seg": 8,
    "cue": 10,
    "dt": 0.06,
    "d": 1.96,
    "vo": "即将逐个解锁澜湾地标。",
    "color": null
  },
  {
    "id": "L11",
    "seg": 9,
    "cue": 11,
    "dt": 0.12,
    "d": 2.8,
    "vo": "约8.1公里上云澜大桥，",
    "color": null
  },
  {
    "id": "L12",
    "seg": 10,
    "cue": 12,
    "dt": 0.1,
    "d": 2.2,
    "vo": "桥长537.4米，",
    "color": null
  },
  {
    "id": "L13",
    "seg": 10,
    "cue": 13,
    "dt": 2.3,
    "d": 1.96,
    "vo": "桥顶海拔约26米，",
    "color": null
  },
  {
    "id": "L14",
    "seg": 10,
    "cue": 14,
    "dt": 4.26,
    "d": 1.24,
    "vo": "赛道最高点。",
    "color": null
  },
  {
    "id": "L15",
    "seg": 11,
    "cue": 15,
    "dt": 0.02,
    "d": 2.48,
    "vo": "记住这个坡，后面还有一次。",
    "color": null
  },
  {
    "id": "L16",
    "seg": 12,
    "cue": 16,
    "dt": 0.08,
    "d": 2.2,
    "vo": "穿过秋日限定的银杏大道，",
    "color": null
  },
  {
    "id": "L17",
    "seg": 13,
    "cue": 17,
    "dt": 0.04,
    "d": 2.88,
    "vo": "金黄交织，随手一拍就是大片。",
    "color": null
  },
  {
    "id": "L18",
    "seg": 14,
    "cue": 18,
    "dt": 0.12,
    "d": 1.2,
    "vo": "进入悦水湾，",
    "color": null
  },
  {
    "id": "L19",
    "seg": 14,
    "cue": 19,
    "dt": 1.32,
    "d": 2.32,
    "vo": "湖水清澈，花海环绕。",
    "color": null
  },
  {
    "id": "L20",
    "seg": 15,
    "cue": 20,
    "dt": 0.08,
    "d": 2,
    "vo": "第二次上云澜大桥，",
    "color": null
  },
  {
    "id": "L21",
    "seg": 15,
    "cue": 21,
    "dt": 2.08,
    "d": 2.08,
    "vo": "上桥控制心率，别冲。",
    "color": null
  },
  {
    "id": "L22",
    "seg": 16,
    "cue": 22,
    "dt": 0.08,
    "d": 3.2,
    "vo": "下桥约19.5公里，澜湾北路折返，",
    "color": null
  },
  {
    "id": "L23",
    "seg": 17,
    "cue": 23,
    "dt": 0.04,
    "d": 1.68,
    "vo": "回环湖大道分流：",
    "color": null
  },
  {
    "id": "L24",
    "seg": 17,
    "cue": 24,
    "dt": 1.72,
    "d": 2.08,
    "vo": "半马左转星湖南路，",
    "color": "half"
  },
  {
    "id": "L25",
    "seg": 17,
    "cue": 25,
    "dt": 3.8,
    "d": 3.59,
    "vo": "全马靠右直行随后右转至柳堤南路。",
    "color": "full"
  },
  {
    "id": "L26",
    "seg": 18,
    "cue": 26,
    "dt": 0.06,
    "d": 2.44,
    "vo": "半马最后约230米直道，",
    "color": "half"
  },
  {
    "id": "L27",
    "seg": 18,
    "cue": 27,
    "dt": 2.5,
    "d": 1.72,
    "vo": "3小时关门内冲线。",
    "color": "half"
  },
  {
    "id": "L29",
    "seg": 19,
    "cue": 28,
    "dt": 0.16,
    "d": 2.39,
    "vo": "全马约22.6到36公里",
    "color": "full"
  },
  {
    "id": "L30",
    "seg": 19,
    "cue": 29,
    "dt": 2.73,
    "d": 1.9,
    "vo": "穿过云澜水岸滨湖公园，",
    "color": null
  },
  {
    "id": "L31",
    "seg": 20,
    "cue": 30,
    "dt": 0.19,
    "d": 2.66,
    "vo": "约29.1公里全马折返点掉头；",
    "color": null
  },
  {
    "id": "L32",
    "seg": 21,
    "cue": 31,
    "dt": 0.06,
    "d": 1.96,
    "vo": "约40到41公里",
    "color": null
  },
  {
    "id": "L33",
    "seg": 22,
    "cue": 32,
    "dt": 0.02,
    "d": 2.64,
    "vo": "经过云澜湖国家城市湿地公园，",
    "color": null
  },
  {
    "id": "L34",
    "seg": 23,
    "cue": 33,
    "dt": 0.02,
    "d": 1.44,
    "vo": "回到环湖大道，",
    "color": null
  },
  {
    "id": "L35",
    "seg": 24,
    "cue": 34,
    "dt": 0.06,
    "d": 2,
    "vo": "右转进入星湖南路，",
    "color": null
  },
  {
    "id": "L36",
    "seg": 24,
    "cue": 35,
    "dt": 2.06,
    "d": 2,
    "vo": "最后约230米直道。",
    "color": null
  },
  {
    "id": "L37",
    "seg": 25,
    "cue": 36,
    "dt": 0.1,
    "d": 2.24,
    "vo": "全马42.195公里，",
    "color": null
  },
  {
    "id": "L38",
    "seg": 25,
    "cue": 37,
    "dt": 2.34,
    "d": 2.36,
    "vo": "半马21.0975公里，",
    "color": null
  },
  {
    "id": "L39",
    "seg": 25,
    "cue": 38,
    "dt": 4.7,
    "d": 1.64,
    "vo": "累计爬升61米，",
    "color": null
  },
  {
    "id": "L40",
    "seg": 25,
    "cue": 39,
    "dt": 6.34,
    "d": 1.68,
    "vo": "海拔4到26米。",
    "color": null
  },
  {
    "id": "L42",
    "seg": 26,
    "cue": 40,
    "dt": 0.02,
    "d": 2,
    "vo": "2026澜湾马拉松，",
    "color": null
  },
  {
    "id": "L43",
    "seg": 26,
    "cue": 41,
    "dt": 2.02,
    "d": 1.2,
    "vo": "11月8日，",
    "color": null
  },
  {
    "id": "L44",
    "seg": 26,
    "cue": 42,
    "dt": 3.22,
    "d": 0.92,
    "vo": "赛道见。",
    "color": null
  }
];
