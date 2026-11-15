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

const questions = [
  {
    id: "source",
    header: "Choose a source",
    question: "Which notes should I include?",
    multiSelect: false,
    options: [
      { id: "approved", label: "Approved notes" },
      { id: "all", label: "All notes" },
    ],
  },
  {
    id: "sections",
    header: "Choose sections",
    question: "Which sections should I include?",
    multiSelect: true,
    options: [
      { id: "summary", label: "Summary" },
      { id: "details", label: "Details" },
    ],
  },
] as const;

const detail = { kind: "question", mode: "execution", questions } as const;

async function render(overrides: Record<string, unknown> = {}): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { QuestionInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState, createQuestionDraft } = await import("../src/interaction-state");
  return renderToStaticMarkup(
    React.createElement(QuestionInteractionView, {
      interactionId: "question:ask-1",
      detail,
      draft: createQuestionDraft(),
      submission: createInteractionSubmissionState(),
      chrome: { label: "Question", stopping: false, busy: false },
      skipConfirmOpen: false,
      onEvent: () => {},
      ...overrides,
    }),
  );
}

test("新问答区域提供问题导航、逐题状态与完整答案审阅", async () => {
  const { createQuestionDraft, setOtherText, toggleOption } = await import("../src/interaction-state");
  const draft = toggleOption(createQuestionDraft(), questions[0], "approved", true);
  const html = await render({ draft });

  assert.match(html, /Your answer is needed/);
  assert.match(html, /aria-label="Questions"/);
  assert.match(html, /Question 1/);
  assert.match(html, /Question 2/);
  assert.match(html, /Answered 1 of 2/);
  assert.match(html, /aria-label="Answer review"/);
  assert.match(html, /Approved notes/);
  assert.match(html, /Not answered/);
  assert.match(html, /Previous question/);
  assert.match(html, /Next question/);
  // 导航与审阅不产生提交操作；只有“Send answers”提交完整问卷。
  assert.equal((html.match(/Send answers/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Confirm skip/);

  const otherDraft = setOtherText(createQuestionDraft(), questions[0], "Notes I wrote");
  assert.match(await render({ draft: otherDraft }), /Other: Notes I wrote/);
});

test("完整问卷提交前必须每题作答，单选 Other 与选项互斥", async () => {
  const { canSubmitAnswers, createQuestionDraft, toggleOption, setOtherText, buildAnswers } = await import("../src/interaction-state");
  let draft = createQuestionDraft();
  assert.equal(canSubmitAnswers(draft, questions), false);
  draft = toggleOption(draft, questions[0], "approved", true);
  assert.equal(canSubmitAnswers(draft, questions), false);
  draft = toggleOption(draft, questions[1], "summary", true);
  draft = toggleOption(draft, questions[1], "details", true);
  assert.equal(canSubmitAnswers(draft, questions), true);
  assert.deepEqual(buildAnswers(draft, questions), [
    { questionId: "source", optionIds: ["approved"] },
    { questionId: "sections", optionIds: ["summary", "details"] },
  ]);

  // 单选 Other 文本清空选项，输入选项清空 Other，保持互斥。
  draft = setOtherText(draft, questions[0], "Use the wiki");
  assert.deepEqual(buildAnswers(draft, questions)[0], { questionId: "source", optionIds: [], otherText: "Use the wiki" });
  draft = toggleOption(draft, questions[0], "all", true);
  assert.deepEqual(buildAnswers(draft, questions)[0], { questionId: "source", optionIds: ["all"] });
});

test("切换整体回复保留两份草稿且只提交当前模式", async () => {
  const { buildAnswers, createQuestionDraft, setReplyText, setResponseMode, toggleOption } = await import("../src/interaction-state");
  let draft = toggleOption(createQuestionDraft(), questions[0], "approved", true);
  draft = setResponseMode(draft, "reply");
  draft = setReplyText(draft, "Please handle this my way.");
  // 切回逐题回答：草稿保留；整体回复也保留。
  draft = setResponseMode(draft, "answers");
  assert.deepEqual(buildAnswers(draft, questions), [{ questionId: "source", optionIds: ["approved"] }]);
  draft = setResponseMode(draft, "reply");
  assert.equal(draft.replyText, "Please handle this my way.");
  assert.equal(draft.answers.source.optionIds[0], "approved");
});

test("整体回复是并列模式：说明只提交当前方式，跳过需要显式确认", async () => {
  const { createQuestionDraft, setReplyText, setResponseMode } = await import("../src/interaction-state");
  const draft = setReplyText(setResponseMode(createQuestionDraft(), "reply"), "Send one overall reply");
  const html = await render({ draft });
  assert.match(html, /Response method/);
  assert.match(html, /Reply instead/);
  assert.match(html, /Only the selected response method is submitted/);
  assert.match(html, />Overall reply</);
  assert.match(html, /Send reply/);
  assert.doesNotMatch(html, /Confirm skip/);

  const confirmed = await render({ draft: createQuestionDraft(), skipConfirmOpen: true });
  assert.match(confirmed, /Skipping continues this Run without answers/);
  assert.match(confirmed, /Confirm skip/);
  assert.match(confirmed, /Keep answering/);
});

test("停止 Run 独立可达，不在回答提交中或文本框内隐式触发", async () => {
  const html = await render();
  assert.match(html, /Stop run/);
  // 文本框只由提交按钮提交；没有把 Enter／Escape 绑定为批准、跳过或停止的提示。
  assert.doesNotMatch(html, /Enter to send|Press Enter/);

  const submitting = {
    phase: "submitting" as const,
    frozen: {
      inputId: "input-1",
      command: {
        kind: "answer_ask_user" as const,
        runId: "run-1",
        requestId: "ask-1",
        answers: [{ questionId: "source", optionIds: ["approved"] }],
      },
    },
    error: null,
  };
  const busyHtml = await render({ submission: submitting });
  assert.match(busyHtml, /Stop run/);
  assert.match(busyHtml, /Sending your decision/);
  assert.equal((busyHtml.match(/Send answers/g) ?? []).length, 1);
  assert.match(busyHtml, /disabled/);
});

test("结果不明时冻结原身份并提供核验与同身份重试", async () => {
  const { resolveDecisionInputId } = await import("../src/interaction-state");
  const command = (content: string) => ({
    kind: "reply_to_question" as const,
    runId: "run-1",
    requestId: "ask-1",
    content,
  });
  const unverified = {
    phase: "unverified" as const,
    frozen: { inputId: "input-frozen", command: command("Original decision") },
    error: "Network failed",
  };
  assert.equal(resolveDecisionInputId(unverified, command("Original decision"), () => "new-id"), "input-frozen");
  assert.equal(resolveDecisionInputId(unverified, command("Changed decision"), () => "new-id"), "new-id");

  const html = await render({ submission: unverified });
  assert.match(html, /Check saved decision/);
  assert.match(html, /Retry the same decision/);
  assert.match(html, /The result could not be confirmed/);
  assert.match(html, /Network failed/);
});

test("核验确认未保存后回到可编辑并保留原决定身份", async () => {
  const { selectInteractionSubmission } = await import("../src/interaction-state");
  const submission = selectInteractionSubmission([
    {
      intent: {
        kind: "session_input",
        intentId: "input-frozen",
        goalId: "goal-1",
        input: {
          kind: "respond",
          inputId: "input-frozen",
          runId: "run-1",
          requestId: "ask-1",
          response: { kind: "skip_question" },
        },
      },
      phase: "unknown",
      receipt: { intentId: "input-frozen", status: "unknown" },
      verification: "not_applied",
    },
  ], { goalId: "goal-1", runId: "run-1", requestId: "ask-1" }, () => "unused");
  assert.equal(submission.phase, "editing");
  assert.equal(submission.frozen?.inputId, "input-frozen");
  assert.equal(submission.error, null);
});

test("失效请求不再提供任何决定操作", async () => {
  const invalidated = {
    phase: "invalidated" as const,
    frozen: null,
    error: "This request is no longer current.",
  };
  const html = await render({ submission: invalidated });
  assert.match(html, /no longer current/);
  assert.doesNotMatch(html, /Send answers|Send reply|Confirm skip/);
});

test("路线扩展问卷展示审批性质、理由与完整候选阶段", async () => {
  const { createQuestionDraft } = await import("../src/interaction-state");
  const html = await render({
    draft: createQuestionDraft(),
    detail: {
      kind: "question",
      mode: "execution",
      questions,
      routeRevision: {
        baseRevision: 2,
        reason: "New evidence adds a promised deliverable",
        approvalRequest: "Approve adding this report to the task?",
        approvalOptionId: "approve-route",
        stages: [
          { target: "Repair the feature", acceptanceCriteria: ["Behavior works"] },
          { target: "Write compatibility report", acceptanceCriteria: ["Report covers affected callers"] },
        ],
      },
    },
  });
  assert.match(html, /New evidence adds a promised deliverable/);
  assert.match(html, /Approve adding this report to the task\?/);
  assert.match(html, /Write compatibility report/);
  assert.match(html, /Report covers affected callers/);
  assert.match(html, /an overall reply or a skip keeps the current route/);
});

test("任务审批区域完整展示目标、验收与有序阶段，反馈不是批准", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TaskApprovalInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState } = await import("../src/interaction-state");
  const html = renderToStaticMarkup(React.createElement(TaskApprovalInteractionView, {
    detail: {
      kind: "task_approval",
      objective: "Deliver the import pipeline",
      approvalRequest: "Approve the deterministic task?",
      completionCriteria: ["Import succeeds", "Regression checks pass"],
      stages: [
        { target: "Parse the input", acceptanceCriteria: ["Formats covered"] },
        { target: "Store the result", acceptanceCriteria: ["Rows persisted"] },
      ],
    },
    submission: createInteractionSubmissionState(),
    feedback: "",
    chrome: { label: "task_approval", stopping: false, busy: false },
    onEvent: () => {},
  }));
  assert.match(html, /Review the proposed task/);
  assert.match(html, /Approve the deterministic task\?/);
  assert.match(html, /Parse the input/);
  assert.match(html, /Rows persisted/);
  assert.ok(html.indexOf("Parse the input") < html.indexOf("Approve task"));
  assert.match(html, /Send feedback/);
  assert.match(html, /Stop run/);
});

test("工具审批区域默认单次授权，完整输入可见且拒绝需要非空理由", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ActionInteractionView } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState } = await import("../src/interaction-state");
  const base = {
    detail: {
      kind: "action_approval" as const,
      actionId: "action-1",
      toolId: "write_file",
      approvalKind: "tool" as const,
      input: { path: "src/file.ts", content: "complete body" },
    },
    summary: {
      actionId: "action-1",
      toolId: "write_file",
      status: "awaiting_approval" as const,
      inputPreview: "{...}",
      inputPreviewTruncated: true,
      targetPath: "src/file.ts",
    },
    scope: "action" as const,
    rejection: "",
    rejectionOpen: false,
    submission: createInteractionSubmissionState(),
    chrome: { label: "action_approval", stopping: false, busy: false },
    onEvent: () => {},
  };
  const html = renderToStaticMarkup(React.createElement(ActionInteractionView, base));
  assert.match(html, /Your approval is needed/);
  assert.match(html, /Tool permission request/);
  assert.match(html, /Approve once/);
  assert.match(html, /complete body/, "the complete canonical input is reviewable");
  assert.match(html, /src\/file\.ts/);
  assert.match(html, /Reject action/);
  assert.equal(html.includes("Retry action"), false, "a normal approval never asks for a retry");

  const recovery = renderToStaticMarkup(React.createElement(ActionInteractionView, {
    ...base,
    detail: { ...base.detail, kind: "action_recovery" as const },
    summary: { ...base.summary, status: "outcome_unknown" as const },
    rejection: "Not safe to repeat",
  }));
  assert.match(recovery, /Action result needs review/);
  assert.match(recovery, /may already have run/);
  assert.match(recovery, /Retry action/);
  assert.equal(recovery.includes("Approve once"), false, "recovery only allows the single retry decision");
  assert.equal(recovery.includes("Approve for this Goal"), false, "recovery never offers ongoing permission");
});

test("详情读取失败时保留等待并说明限制", async () => {
  const { interactionDetailErrorText } = await import("../src/interaction-panel");
  assert.match(interactionDetailErrorText("interaction_details_unavailable"), /Retry before making a decision/);
  assert.match(interactionDetailErrorText("stale_run"), /latest saved state/);
  assert.match(interactionDetailErrorText("goal_not_found"), /no longer available/);
});
