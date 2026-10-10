/**
 * 轨迹看板时间轴视口缩放与平移计算。
 *
 * @remarks
 * 定义时间轴视口允许的缩放上下限（0.5x 紧凑模式至 25x 放大模式），
 * 并提供视口位置夹紧、水平平移与以光标为锚点的平滑缩放纯函数。
 */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 25;
export const MIN_VIEW_WIDTH = 1 / MAX_ZOOM; // 0.04 (25x)
export const MAX_VIEW_WIDTH = 1 / MIN_ZOOM; // 2.0 (0.5x)

/**
 * 规范化并限制视口左边界，防止内容在紧凑或放大模式下异常越界。
 *
 * @param left - 目标视口左边界。
 * @param width - 视口宽度。
 * @returns 夹紧后的视口元组 `[left, right]`。
 */
export function clampViewport(left: number, width: number): [number, number] {
  const minLeft = Math.min(0, 1 - width);
  const maxLeft = Math.max(0, 1 - width);
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));
  return [clampedLeft, clampedLeft + width];
}

/**
 * 平移时间轴视口。
 *
 * @param viewport - 当前视口 `[left, right]`。
 * @param delta - 平移增量。
 * @returns 平移后的视口元组。
 */
export function shiftViewport(viewport: [number, number], delta: number): [number, number] {
  const width = viewport[1] - viewport[0];
  return clampViewport(viewport[0] + delta, width);
}

/**
 * 以指定锚点缩放时间轴视口，受 `MIN_VIEW_WIDTH` 与 `MAX_VIEW_WIDTH` 限制。
 *
 * @param viewport - 当前视口 `[left, right]`。
 * @param factor - 缩放比例因子（< 1 为放大，> 1 为缩小）。
 * @param anchor - 缩放锚点（0 ~ 1）。
 * @returns 缩放后的视口元组。
 */
export function scaleViewport(viewport: [number, number], factor: number, anchor: number): [number, number] {
  const oldWidth = viewport[1] - viewport[0];
  const width = Math.max(MIN_VIEW_WIDTH, Math.min(MAX_VIEW_WIDTH, oldWidth * factor));
  const left = viewport[0] + oldWidth * anchor - width * anchor;
  return clampViewport(left, width);
}

