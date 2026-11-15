import type { BrowserControlScope, BrowserGoalEvent } from "../../../../packages/web-contracts/src/index";

/**
 * 一条 Goal SSE 事件需要重新读取的投影作用域。
 *
 * @remarks
 * 等待与终态事实触发窄状态读取，实时活动无需重读。调用方先核对事件归属。
 *
 * @param event - Goal SSE 事件。
 * @returns 需要定向读取的作用域；空数组表示只更新本地控制状态。
 * @example
 * ```ts
 * await readScopes(readScopesForEvent(event));
 * ```
 */
export function readScopesForEvent(event: BrowserGoalEvent): readonly BrowserControlScope[] {
  switch (event.type) {
    case "state_sync":
      return [];
    case "state_committed":
      return event.changed;
    case "stream_fault":
      return event.resync;
    case "input_result":
      return ["session"];
    case "message_committed":
      return ["activity", "session"];
    case "run_status_changed":
    case "run_result":
    case "interaction_opened":
    case "interaction_settled":
      return ["session"];
    case "tool_activity":
    case "closed":
    case "activity":
      return [];
  }
}
