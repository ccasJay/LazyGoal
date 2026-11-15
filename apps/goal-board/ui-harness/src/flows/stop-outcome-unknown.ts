import { sessionWaitingScenario } from "../scenarios";
import type { UiFlow } from "./types";

/**
 * 模拟暂停请求返回结果不明，并确认同一 Run 不会再提交新的暂停身份。
 */
export const stopOutcomeUnknownFlow: UiFlow = {
  id: "stop-outcome-unknown",
  description: "Keep an unresolved stop request actionable without creating duplicate stop intents",
  view: "session",
  scenario: sessionWaitingScenario,
  goalId: "goal-session-waiting",
  steps: [
    { action: "expect", selector: ".interaction-stop", visible: true, disabled: false },
    { action: "click", selector: ".interaction-stop" },
    {
      action: "expect",
      selector: ".unverified-submission",
      visible: true,
      text: "Pause Run result is unknown. Verify it before retrying.",
    },
    { action: "expect", selector: ".interaction-stop", disabled: true },
    { action: "expectControl", kind: "session_input", inputKind: "interrupt", count: 1 },
  ],
};
