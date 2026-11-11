// 视图级可调参数（客户 2026-11-01：「地图上地名文字偏小，右侧控制区加个缩放控件」）
//
//   nameScale —— 只影响**地图上的地名（路名）**，不影响仪表、字幕、图卡、角色。
//     默认 1.4（客户 2026-11-01：「所有的标志默认大小定为 1.4」），范围 1.0–5.0，步进 0.1。
//   为什么放在可变对象里：renders 是纯函数式（每次只给 t），没有别的通道能把这个
//     交互参数带进 SVG 层；预览器改它、4K 渲染用 ?names= 初始化，两边同一份口径。
export const NAME_SCALE = { min: 1, max: 5, step: 0.1, def: 1.4 };

export const VIEW = { nameScale: NAME_SCALE.def };

/** 取（渲染时读） */
export const nameScale = () => VIEW.nameScale;

/** 设（夹到 [min,max] 并量化到 0.1），返回真正生效的值 */
export function setNameScale(v) {
  const x = Number.isFinite(+v) ? +v : NAME_SCALE.def;
  const clamped = Math.min(NAME_SCALE.max, Math.max(NAME_SCALE.min, x));
  VIEW.nameScale = Math.round(clamped * 10) / 10;
  return VIEW.nameScale;
}
