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

  const { createInteractionSubmissionState, reduceInteractionSubmission } = await import("../src/interaction-state");
  const submitting = reduceInteractionSubmission(createInteractionSubmissionState(), {
    kind: "submit",
    decision: {
      inputId: "input-1",
      command: {
        kind: "answer_ask_user",
        runId: "run-1",
        requestId: "ask-1",
        answers: [{ questionId: "source", optionIds: ["approved"] }],
      },
    },
  });
  const busyHtml = await render({ submission: submitting });
  assert.match(busyHtml, /Stop run/);
  assert.match(busyHtml, /Sending your decision/);
  assert.equal((busyHtml.match(/Send answers/g) ?? []).length, 1);
  assert.match(busyHtml, /disabled/);
});

test("结果不明时冻结原身份并提供核验与同身份重试", async () => {
  const { createInteractionSubmissionState, reduceInteractionSubmission, resolveDecisionInputId } = await import("../src/interaction-state");
  const command = (content: string) => ({
    kind: "reply_to_question" as const,
    runId: "run-1",
    requestId: "ask-1",
    content,
  });
  const frozen = reduceInteractionSubmission(createInteractionSubmissionState(), {
    kind: "submit",
    decision: { inputId: "input-frozen", command: command("Original decision") },
  });
  const unverified = reduceInteractionSubmission(frozen, { kind: "unverified", message: "Network failed" });
  assert.equal(resolveDecisionInputId(unverified, command("Original decision"), () => "new-id"), "input-frozen");
  assert.equal(resolveDecisionInputId(unverified, command("Changed decision"), () => "new-id"), "new-id");

  const html = await render({ submission: unverified });
  assert.match(html, /Check saved decision/);
  assert.match(html, /Retry the same decision/);
  assert.match(html, /The result could not be confirmed/);
  assert.match(html, /Network failed/);
});

test("失效请求不再提供任何决定操作", async () => {
  const { createInteractionSubmissionState, reduceInteractionSubmission } = await import("../src/interaction-state");
  const invalidated = reduceInteractionSubmission(createInteractionSubmissionState(), {
    kind: "invalidated",
    message: "This request is no longer current.",
  });
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
