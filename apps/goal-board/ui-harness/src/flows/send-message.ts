import { sessionCommandScenario } from "../scenarios";
import type { UiFlow } from "./types";

const MESSAGE = "Rotate the OAuth client secret before the next deploy.";

/**
 * 从空闲会话发送一条消息，并等待 Run 2 的助手回复提交。
 *
 * @remarks
 * 受理时场景先提交用户消息和 `running` 状态；Run 完成后，`state_committed` 触发活动与
 * 消息重读。继续执行的 Run 内联呈现，因此流程断言持久化助手正文，而非 Run 摘要。
 */
export const sendMessageFlow: UiFlow = {
  id: "send-message",
  description: "Send one message and observe its persisted assistant response",
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
    { action: "click", selector: '.composer button[aria-label="Current model: Test Model. Change model"]' },
    { action: "click", selector: '.model-option[data-value="model-2"]' },
    { action: "expect", selector: '.composer button[aria-label="Current model: Alternate Model. Change model"]', visible: true },
    { action: "expectControl", kind: "model_selection", count: 1 },
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
      selector: "[data-run-id='run-command-2'].message.assistant:not(.transient-message) .message-body",
      text: "The deployment checklist is ready for review.",
      timeoutMs: 8000,
    },
    { action: "expectControl", kind: "session_input", inputKind: "message", count: 1 },
  ],
};
