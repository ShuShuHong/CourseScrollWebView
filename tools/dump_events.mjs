// 抽出当前时间轴上的全部画面事件（供对照表使用）
import * as S from '../src/config/story.js';
import { VENUE_WINDOWS } from '../src/config/venue.js';

const F = (t) => Math.round(t * 30);
const rows = [];
const add = (t, kind, what, extra = '') => rows.push({ t, kind, what, extra });

add(0, '开场', '地图加载条', `到 ${(S.lineT('L01') + 0.7).toFixed(2)}s`);
add(S.lineT('L01') - 0.15, '开场', '赛道线从起点点亮（reveal）', 'd 2.3s');
add(S.ELEV_WIN.t0, 'UI', '海拔窗常驻（左下）', `到 ${S.ELEV_WIN.t1.toFixed(2)}s`);
add(S.lineT('L03') - 0.4, '副本', '起跑门头出现', 'START');
add(S.lineT('L03'), '镜头', '推近 SF（起终点路口）', 'dist 520 → 460');
add(S.lineT('L04') - 0.7, '地面', 'A/B/C 分区涂装点亮', 'd 4.4s');
add(S.lineT('L04') - 0.1, '赛事', 'A/B 区首发发枪', '');
add(S.lineT('L04') + 1.5, '赛事', 'C 区第二枪', '');
add(S.T_GO, '赛事', '起跑 GO', '螃蟹 mood=run');
add(S.lineT('L04') + 0.6, '镜头', '起跑机位定格', '');

for (const e of S.EVENTS) {
  if (e.type === 'cam' || e.t === undefined && e.at === undefined) continue;
}
for (const [i, e] of S.EVENTS.entries()) {
  const t = e.t !== undefined ? e.t : S.tAtKm(e.at.km);
  const tag = {
    loading: '开场', reveal: '开场', arch: '副本', zones: '地面', gun: '赛事', go: '赛事',
    bridge: '事件', autumn: '事件', uturn: '事件', fork: '提示', dimHalf: '转场',
  }[e.type] || e.type;
  if (e.type === 'loading' || e.type === 'reveal') continue;
  let what = '';
  if (e.type === 'arch') what = `门头 ${e.label}`;
  else if (e.type === 'bridge') what = `桥梁隆起 ${e.color}${e.warn ? '（' + e.warn + '）' : ''}`;
  else if (e.type === 'autumn') what = '水杉大道暖色氛围光';
  else if (e.type === 'uturn') what = `地面刷「${e.paint}」${e.label}`;
  else if (e.type === 'fork') what = '分流路牌出现（半马左 / 全马右）';
  else if (e.type === 'dimHalf') what = '半马降暗 → 切半马副本';
  else if (e.type === 'zones') what = 'A/B/C 分区涂装';
  else if (e.type === 'gun') what = `发枪 ${e.label}`;
  else what = e.type;
  add(t, tag, what, `d ${(e.d ?? 0).toFixed(2)}s`);
}

for (const c of S.CARDS) {
  const t = c.t !== undefined ? c.t : S.tAtKm(c.at.km);
  add(t, '信息卡', `${c.title}`, `d ${c.d}s · ${c.side || '右'}`);
}
for (const s of S.STICKERS) {
  const t0 = s.fromFrame !== undefined ? s.fromFrame / 30 : S.tAtKm(s.fromKm ?? s.at);
  const t1 = s.toFrame !== undefined ? s.toFrame / 30 : null;
  add(t0, '地标卡', s.name, t1 ? `到 ${t1.toFixed(2)}s` : '');
}
for (const w of VENUE_WINDOWS) {
  add(w.t0, '副本', `进场：${w.id}`, `到 ${w.t1.toFixed(2)}s · ${w.scene}`);
}
for (const c of S.CAMERA) {
  const t = c.t !== undefined ? c.t : S.tAtKm(c.at.km);
  add(t, '镜头', `机位 → ${c.target}`, `dist ${c.dist} · az ${c.az} · pitch ${c.pitch}°`);
}
for (const e of S.CRAB_STATE) {
  const t = e.t !== undefined ? e.t : S.tAtKm(e.at.km);
  if (t == null || !isFinite(t)) continue;
  add(t, '角色', `${e.who} ${e.mood || ''}${e.stage !== undefined ? ' stage' + e.stage : ''}${e.fx ? ' · ' + e.fx : ''}`, '');
}

rows.sort((a, b) => a.t - b.t);
console.log('T\t帧\t类\t事件\t备注');
for (const r of rows) console.log(`${r.t.toFixed(2)}\t${F(r.t)}\t${r.kind}\t${r.what}\t${r.extra}`);
