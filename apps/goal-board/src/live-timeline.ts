import type { BrowserGoalEvent } from "../../../packages/web-contracts/src/index";

/**
 * 当前连接观察到的实时事件及其发生顺序。
 *
 * @remarks
 * `order` 在连接内单调递增，同时分配给实时正文块、进度节点与工具事件。时间线只按该
 * 顺序排列尚未提交的节点；已提交来源仍使用服务端 Activity 位置。
 *
 * @example
 * ```ts
 * const observed: OrderedGoalEvent = { event, order: 3 };
 * ```
 */
export interface OrderedGoalEvent {
  readonly event: BrowserGoalEvent;
  /** 本条事件在连接内首次被观察到的顺序。 */
  readonly order: number;
}

/**
 * 一段尚未提交的助手正文及其固定时间线顺序。
 *
 * @remarks
 * 顺序在正文块首次创建时确定，后续增量只更新 `content`，不改变 `order`。工具调用或
 * 新的模型阶段会关闭当前块，恢复输出时创建新块，因此不同轮次的正文不会合并。
 *
 * @example
 * ```ts
 * const block: LiveTextBlock = { sourceKey, runId, content, truncated: false, order: 5 };
 * ```
 */
export interface LiveTextBlock {
  /** 连接的正文块身份。 */
  readonly sourceKey: string;
  readonly runId: string;
  readonly content: string;
  readonly truncated: boolean;
  /** 该块是否仍在接收增量；已关闭的块不再显示流式光标。 */
  readonly active: boolean;
  /** 该块首次创建时的连接顺序。 */
  readonly order: number;
}
