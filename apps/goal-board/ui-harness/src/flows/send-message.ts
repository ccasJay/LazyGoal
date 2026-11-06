import { sessionCommandScenario } from "../scenarios";
import type { UiFlow } from "./types";

const MESSAGE = "Rotate the OAuth client secret before the next deploy.";

/**
 * 从空闲会话发送一条消息，并观察 Run 由命令受理推进到事件提交的终态。
 *
 * @remarks
 * 场景在受理时只提交到 `running`，终态延后通过 `state_committed` 推送。因此最后
 * 一步的 `Run finished` 只能由 SSE 失效后重新读取得到，不能由提交后的同步刷新得到。
 */
export const sendMessageFlow: UiFlow = {
  id: "send-message",
  description: "Send one message and observe the command plus the event-driven Run terminal state",
  view: "session",
  goalId: "goal-session-command",
  scenario: sessionCommandScenario,
  steps: [
    { action: "expect", selector: ".composer textarea", visible: true, disabled: false },
    {
      action: "expect",
      selector: ".composer-actions .send",
      disabled: true,
      attribute: { name: "aria-label", value: "Type a message to send" },
    },
    { action: "fill", selector: ".composer textarea", value: MESSAGE },
    {
      action: "expect",
      selector: ".composer-actions .send",
      disabled: false,
      attribute: { name: "aria-label", value: "Send message" },
    },
    { action: "click", selector: ".composer-actions .send" },
    {
      action: "expect",
      selector: "[data-run-id='run-command-2']",
      visible: true,
      text: MESSAGE,
    },
    {
      action: "expect",
      selector: "[data-run-id='run-command-2'] .timeline-run-result",
      text: "Run finished",
      timeoutMs: 8000,
    },
    { action: "expectControl", kind: "session_input", inputKind: "message", count: 1 },
  ],
};
