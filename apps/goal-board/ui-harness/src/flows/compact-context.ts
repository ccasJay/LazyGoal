import { sessionCompactUnavailableScenario } from "../scenarios/session-command-scenario";
import type { UiFlow } from "./types";

/**
 * 在已完成会话中输入 `/compact`。
 *
 * @remarks
 * 命令只作为会话输入派发，不进入对话；拒绝原因由命令错误区域呈现。
 */
export const compactContextFlow: UiFlow = {
  id: "compact-context",
  description: "Dispatch /compact from the session composer without writing a message",
  view: "session",
  goalId: "goal-session-command",
  scenario: sessionCompactUnavailableScenario,
  steps: [
    { action: "expect", selector: ".composer textarea", visible: true, disabled: false },
    { action: "fill", selector: ".composer textarea", value: "/compact" },
    { action: "click", selector: ".composer-actions .send" },
    { action: "expectControl", kind: "session_input", inputKind: "compact", count: 1, timeoutMs: 8000 },
    {
      action: "expect",
      selector: ".command-error",
      visible: true,
      text: "working window cannot be compacted right now",
      timeoutMs: 8000,
    },
    { action: "expect", selector: ".composer textarea", value: "" },
    { action: "expectControl", kind: "session_input", inputKind: "message", count: 0 },
  ],
};
