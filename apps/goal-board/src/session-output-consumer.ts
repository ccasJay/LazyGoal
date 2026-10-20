import type { BrowserGoalLiveEvent } from "../../../packages/web-contracts/src/index";

/**
 * 会话输出在页面上的临时显示状态。
 *
 * @remarks
 * 未确认候选只进入临时区域：它尚未保存，不能当作正式消息展示。正式消息到达时
 * 临时正文被替换而不是追加，因此同一份内容不会在页面上出现两次。
 *
 * @example
 * ```ts
 * const display: SessionOutputDisplay = { liveText: "", liveActivity: "", unconfirmed: false };
 * ```
 */
export interface SessionOutputDisplay {
    /** 当前展示的临时正文。 */
    readonly liveText: string;
    /** 当前展示的活动提示。 */
    readonly liveActivity: string;
    /** 当前正文是否来自未确认候选。 */
    readonly unconfirmed: boolean;
}

/** 没有候选或正式消息时使用的空显示状态。 */
export const EMPTY_SESSION_OUTPUT_DISPLAY: SessionOutputDisplay = {
  liveText: "",
  liveActivity: "",
  unconfirmed: false,
};

/**
 * 把一条会话输出事件归约为页面临时显示状态。
 *
 * @remarks
 * 只处理候选预览、候选作废与正式消息三类事件：它们决定“尚未保存”的临时区域
 * 如何被替换。其余事件返回 `undefined`，表示显示状态不变。
 *
 * @param current - 当前显示状态。
 * @param event - 会话输出事件。
 * @returns 新的显示状态；该事件不改变显示时返回 `undefined`。
 * @example
 * ```ts
 * const next = applySessionOutputEvent(EMPTY_SESSION_OUTPUT_DISPLAY, event);
 * ```
 */
export function applySessionOutputEvent(
  current: SessionOutputDisplay,
  event: BrowserGoalLiveEvent,
): SessionOutputDisplay | undefined {
  if (event.type === "message_committed") {
    // 正式消息替换未确认预览：清空临时正文，不追加第二份内容。
    return { liveText: "", liveActivity: "The answer was saved", unconfirmed: false };
  }
  if (event.type === "interaction_required") {
    return { ...current, liveActivity: "Waiting for your answer" };
  }
  if (event.type !== "activity") return undefined;
  if (event.activity.kind === "candidate_preview") {
    return {
      liveText: event.activity.text,
      liveActivity: "A draft answer is ready but not saved yet",
      unconfirmed: true,
    };
  }
  if (event.activity.kind === "candidate_invalidated") {
    return { liveText: "", liveActivity: "The draft answer was discarded", unconfirmed: false };
  }
  return undefined;
}
