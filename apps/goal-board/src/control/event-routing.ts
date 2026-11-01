import type { BrowserControlScope, BrowserGoalEvent } from "../../../../packages/web-contracts/src/index";

/**
 * 一条 Goal SSE 事件需要重新读取的投影作用域。
 *
 * @remarks
 * 控制事实已经在 reducer 中直接应用，不要求 HTTP 重读；只有内容事实、提交边界
 * 与流故障声明自己的失效范围。
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
    case "tool_activity":
    case "closed":
    case "activity":
      return [];
  }
}
