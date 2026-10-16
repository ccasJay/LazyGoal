import type { BrowserSessionMessage, BrowserSessionRun } from "../../../packages/web-contracts/src/index";

/**
 * 超长会话的渐进加载窗口边界。
 *
 * @remarks
 * 窗口以完整 Run 为不可分割边界：同一 Run 的消息与活动组要么整体渲染，要么整体省略，
 * 不切割 Run 内部呈现。没有 Run 归属的更早消息始终渲染，不参与窗口计算
 * （它们位于历史最前部，属于会话的固定上下文）。`omittedMessages` 是窗口外
 * 尚未渲染的已保存 Run 消息数，用于扩页按钮与省略提示的文案。
 * 消息归属按 `session.messages` 的 `runId` 统计：`BrowserSessionRun` 本身不携带消息。
 *
 * @example
 * ```ts
 * const initial = resolveInitialWindow(session.runs, session.messages, threshold);
 * const next = resolveExpandedWindow(session.runs, session.messages, visibleRunCount);
 * setRunCount(next.runCount);
 * ```
 */
export interface SessionWindow {
  /** 渲染窗口包含的最近 Runs 数量。 */
  readonly runCount: number;
  /** 窗口外尚未渲染的已保存 Run 消息数。 */
  readonly omittedMessages: number;
  /** 窗口外仍有内容的 Runs 数；为 0 时不应显示扩页控件。 */
  readonly pendingMessages: number;
}

/** 默认的窗口消息阈值；窗口至少包含最近一个完整 Run。 */
export const SESSION_WINDOW_MESSAGE_THRESHOLD = 50;

function messageCountForRun(messages: readonly BrowserSessionMessage[], runId: string): number {
  return messages.reduce((total, message) => total + (message.runId === runId ? 1 : 0), 0);
}

function windowFor(
  runs: readonly BrowserSessionRun[],
  messages: readonly BrowserSessionMessage[],
  runCount: number,
): SessionWindow {
  const visibleRuns = runs.slice(Math.max(0, runs.length - runCount));
  const visibleMessages = visibleRuns.reduce((total, run) => total + messageCountForRun(messages, run.runId), 0);
  const totalRunMessages = runs.reduce((total, run) => total + messageCountForRun(messages, run.runId), 0);
  return {
    runCount,
    omittedMessages: Math.max(0, totalRunMessages - visibleMessages),
    pendingMessages: runs.length - visibleRuns.length,
  };
}

/**
 * 计算首次渲染应显示的窗口：从最近 Run 起向尾部前累积该 Run 的消息数，
 * 取第一个达到阈值的完整 Run 后缀；整个会话低于阈值时包含全部 Runs。
 *
 * @param runs - 按时间顺序的 Run 列表。
 * @param messages - 会话全部已保存消息（按 `runId` 归属统计）。
 * @param threshold - 窗口应覆盖的最近消息数下限。
 */
export function resolveInitialWindow(
  runs: readonly BrowserSessionRun[],
  messages: readonly BrowserSessionMessage[],
  threshold: number = SESSION_WINDOW_MESSAGE_THRESHOLD,
): SessionWindow {
  let accumulated = 0;
  for (let runCount = 0; runCount < runs.length; runCount++) {
    accumulated += messageCountForRun(messages, runs[runs.length - 1 - runCount]!.runId);
    if (accumulated >= threshold) {
      return windowFor(runs, messages, runCount + 1);
    }
  }
  return windowFor(runs, messages, runs.length);
}

/**
 * 计算当前窗口的省略状态：给定已渲染的最近 Runs 数量，
 * 返回窗口外的剩余 Runs 与消息数；全部渲染时 pendingMessages 为 0。
 *
 * @param runs - 按时间顺序的 Run 列表。
 * @param messages - 会话全部已保存消息（按 `runId` 归属统计）。
 * @param runCount - 当前已渲染窗口包含的最近 Runs 数量。
 */
export function resolveCurrentWindow(
  runs: readonly BrowserSessionRun[],
  messages: readonly BrowserSessionMessage[],
  runCount: number,
): SessionWindow {
  return windowFor(runs, messages, Math.min(runs.length, Math.max(0, runCount)));
}

/**
 * 在当前窗口基础上再向上扩展一个完整 Run，直到覆盖全部 Runs。
 *
 * @param runs - 按时间顺序的 Run 列表。
 * @param messages - 会话全部已保存消息（按 `runId` 归属统计）。
 * @param currentRunCount - 当前已渲染窗口包含的 Runs 数；扩展按 Run 边界逐个推进。
 * @param threshold - 与初始窗口一致的阈值语义；扩展不因阈值重新裁剪。
 */
export function resolveExpandedWindow(
  runs: readonly BrowserSessionRun[],
  messages: readonly BrowserSessionMessage[],
  currentRunCount: number,
  threshold: number = SESSION_WINDOW_MESSAGE_THRESHOLD,
): SessionWindow {
  void threshold;
  return windowFor(runs, messages, Math.min(runs.length, Math.max(1, currentRunCount) + 1));
}
