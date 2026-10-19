import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hash: "", host: "localhost", protocol: "http:" },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

const approvalDetail = {
  kind: "action_approval",
  actionId: "act-1",
  toolId: "write_file",
  approvalKind: "tool",
  input: { path: "a.txt", content: "original" },
} as const;

const recoveryDetail = {
  kind: "action_recovery",
  actionId: "act-2",
  toolId: "write_file",
  input: { path: "b.txt", content: "written" },
  recoveryRef: "recovery:0123456789abcdef0123456789abcdef",
} as const;

async function renderAction(overrides: Record<string, unknown> = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ActionInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState } = await import("../src/interaction-state");
  return renderToStaticMarkup(
    React.createElement(ActionInteractionView, {
      detail: approvalDetail,
      summary: undefined,
      scope: "action",
      rejection: "",
      editing: false,
      draftInput: "",
      review: undefined,
      reviewError: undefined,
      reviewing: false,
      submission: createInteractionSubmissionState(),
      chrome: { label: "Action", stopping: false, busy: false },
      onEvent: () => {},
      ...overrides,
    }),
  );
}

test("审批区域提供同一工具的 JSON 参数编辑与只读预检入口", async () => {
  const html = await renderAction();
  assert.match(html, /Edit parameters/);
  assert.match(html, /Tool input/);
  assert.match(html, /a\.txt/);
  // 未进入编辑时不展示编辑器与预检按钮。
  assert.doesNotMatch(html, /Preview changes/);
  assert.doesNotMatch(html, /Edited tool parameters/);

  const editing = await renderAction({ editing: true, draftInput: "{\n  \"path\": \"b.txt\"\n}" });
  assert.match(editing, /Edited tool parameters/);
  assert.match(editing, /Preview changes/);
  assert.match(editing, /b\.txt/);
  assert.match(editing, /Cancel editing/);
});

test("预检结果展示原参数、最终参数与实际范围，并提供明确确认入口", async () => {
  const html = await renderAction({
    editing: true,
    draftInput: "{\"path\":\"b.txt\"}",
    review: {
      actionId: "act-1",
      toolId: "write_file",
      originalInput: { path: "a.txt", content: "original" },
      finalInput: { path: "b.txt", content: "revised" },
      changed: true,
      scope: "action",
      availableScopes: ["action", "goal", "workspace"],
      capability: { network: "none", extraFiles: [], targetPaths: ["/workspace/b.txt"] },
      requiresSandboxApproval: false,
      reviewRef: "review:0123456789abcdef0123456789abcdef",
    },
  });
  assert.match(html, /Reviewed changes/);
  assert.match(html, /Original parameters/);
  assert.match(html, /Final parameters/);
  assert.match(html, /a\.txt/);
  assert.match(html, /b\.txt/);
  assert.match(html, /\/workspace\/b\.txt/);
  assert.match(html, /Approve revision once/);
});

test("预检失败时展示可定位说明并保留原操作", async () => {
  const html = await renderAction({
    editing: true,
    draftInput: "not json",
    reviewError: "This is not valid JSON. Fix the syntax and preview again.",
  });
  assert.match(html, /not valid JSON/);
  assert.match(html, /Approve once/);
});

test("未知结果恢复视图只提供重执行与拒绝，不提供参数编辑", async () => {
  const html = await renderAction({ detail: recoveryDetail });
  assert.match(html, /Retry action/);
  assert.match(html, /Do not run again/);
  assert.match(html, /may already have run/);
  assert.doesNotMatch(html, /Edit parameters/);
  assert.doesNotMatch(html, /This Goal/);
});

test("编辑内容解析失败时不提交任何参数", async () => {
  const { parseEditedInput } = await import("../src/interaction-panel");
  assert.deepEqual(parseEditedInput("{\"path\":\"b.txt\"}"), {
    ok: true,
    value: { path: "b.txt" },
  });
  const empty = parseEditedInput("   ");
  assert.equal(empty.ok, false);
  const invalid = parseEditedInput("{oops");
  assert.equal(invalid.ok, false);
  const notObject = parseEditedInput("[1,2]");
  assert.equal(notObject.ok, false);
});

test("新的决定映射为统一会话输入载荷", async () => {
  const { toSessionInteractionResponse } = await import("../src/types");
  assert.deepEqual(
    toSessionInteractionResponse({
      kind: "approve_action_revision",
      runId: "run-1",
      actionId: "act-1",
      input: { path: "b.txt" },
      reviewRef: "review:0123456789abcdef",
      scope: "action",
    }),
    {
      kind: "approve_action_revision",
      actionId: "act-1",
      input: { path: "b.txt" },
      reviewRef: "review:0123456789abcdef",
      scope: "action",
    },
  );
  assert.deepEqual(
    toSessionInteractionResponse({
      kind: "retry_unknown_action",
      runId: "run-1",
      actionId: "act-1",
      recoveryRef: "recovery:0123456789abcdef",
    }),
    { kind: "retry_unknown_action", actionId: "act-1", recoveryRef: "recovery:0123456789abcdef" },
  );
  assert.deepEqual(
    toSessionInteractionResponse({
      kind: "decline_unknown_action_retry",
      runId: "run-1",
      actionId: "act-1",
      recoveryRef: "recovery:0123456789abcdef",
      reason: "不再重复执行",
    }),
    {
      kind: "decline_unknown_action_retry",
      actionId: "act-1",
      recoveryRef: "recovery:0123456789abcdef",
      reason: "不再重复执行",
    },
  );
});

test("审阅错误说明区分参数无效、工具不可用与授权不可用", async () => {
  const { actionReviewErrorText } = await import("../src/interaction-panel");
  assert.match(actionReviewErrorText("invalid_tool_input"), /not valid for this tool/);
  assert.match(actionReviewErrorText("tool_not_found"), /no longer available/);
  assert.match(actionReviewErrorText("scope_unavailable"), /unavailable for this workspace/);
  assert.match(actionReviewErrorText("review_unavailable"), /could not be reviewed/);
});
