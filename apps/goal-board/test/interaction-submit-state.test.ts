import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const srcRoot = join(import.meta.dirname, "..", "src");

// 交互面板模块在导入时读取浏览器会话令牌；纯状态与文案测试只需要最小 window 桩。
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = { location: { hash: "", host: "localhost", protocol: "http:" } };
}

function command(content: string) {
  return { kind: "reply_to_question" as const, runId: "run-1", requestId: "ask-1", content };
}

test("提交冻结身份与载荷，结果不明只能核验或按原身份重试", async () => {
  const {
    createInteractionSubmissionState,
    reduceInteractionSubmission,
    canSubmitDecision,
    needsVerification,
    resolveDecisionInputId,
  } = await import("../src/interaction-state");

  const initial = createInteractionSubmissionState();
  assert.equal(canSubmitDecision(initial), true, "editing accepts a decision");
  assert.equal(needsVerification(initial), false);

  const submitting = reduceInteractionSubmission(initial, {
    kind: "submit",
    decision: { inputId: "input-1", command: command("First decision") },
  });
  assert.equal(submitting.phase, "submitting");
  assert.equal(canSubmitDecision(submitting), false, "an in-flight decision locks new identities");

  const unverified = reduceInteractionSubmission(submitting, { kind: "unverified", message: "Response was lost" });
  assert.equal(unverified.phase, "unverified");
  assert.equal(needsVerification(unverified), true);
  assert.equal(canSubmitDecision(unverified), false, "an unconfirmed result never opens a second identity");

  // 核验前同一决定复用原身份，修改后的新决定必须使用新身份。
  assert.equal(resolveDecisionInputId(unverified, command("First decision"), () => "new-id"), "input-1");
  assert.equal(resolveDecisionInputId(unverified, command("Changed decision"), () => "new-id"), "new-id");

  // 核验确认未提交时保留原身份，允许同一身份重试。
  const absent = reduceInteractionSubmission(unverified, { kind: "verified_absent", message: "Not saved" });
  assert.equal(absent.phase, "editing");
  assert.equal(absent.frozen?.inputId, "input-1");
  assert.equal(resolveDecisionInputId(absent, command("First decision"), () => "new-id"), "input-1");

  // 核验确认已提交时只应用一次，不能再次提交。
  const accepted = reduceInteractionSubmission(unverified, { kind: "verified_accepted" });
  assert.equal(accepted.phase, "accepted");
  assert.equal(canSubmitDecision(accepted), false);
  const afterAccepted = reduceInteractionSubmission(accepted, {
    kind: "submit",
    decision: { inputId: "input-2", command: command("Second decision") },
  });
  assert.equal(afterAccepted.phase, "accepted", "an accepted decision is never resubmitted");

  // 结果不明的重复提交不允许换身份。
  const conflicting = reduceInteractionSubmission(unverified, {
    kind: "submit",
    decision: { inputId: "input-2", command: command("Changed decision") },
  });
  assert.deepEqual(conflicting, unverified, "a different identity is rejected while unconfirmed");
});

test("明确业务拒绝保留可编辑状态并释放旧身份", async () => {
  const { createInteractionSubmissionState, reduceInteractionSubmission, resolveDecisionInputId } = await import("../src/interaction-state");
  const submitting = reduceInteractionSubmission(createInteractionSubmissionState(), {
    kind: "submit",
    decision: { inputId: "input-1", command: command("Rejected decision") },
  });
  const rejected = reduceInteractionSubmission(submitting, { kind: "rejected", message: "Questionnaire is incomplete" });
  assert.equal(rejected.phase, "editing");
  assert.equal(rejected.error, "Questionnaire is incomplete");
  assert.equal(rejected.frozen, null, "a rejected decision releases its identity");
  assert.equal(resolveDecisionInputId(rejected, command("Rejected decision"), () => "input-2"), "input-2");
  assert.equal(resolveDecisionInputId(rejected, command("Edited decision"), () => "input-3"), "input-3");
});

test("请求被其他客户端结算后不再提供决定操作", async () => {
  const { createInteractionSubmissionState, reduceInteractionSubmission, canSubmitDecision } = await import("../src/interaction-state");
  const invalidated = reduceInteractionSubmission(createInteractionSubmissionState(), {
    kind: "invalidated",
    message: "This request is no longer current.",
  });
  assert.equal(invalidated.phase, "invalidated");
  assert.equal(canSubmitDecision(invalidated), false);
  const afterInvalidated = reduceInteractionSubmission(invalidated, {
    kind: "submit",
    decision: { inputId: "input-1", command: command("Late decision") },
  });
  assert.equal(afterInvalidated.phase, "invalidated", "a settled request never accepts a late decision");
});

test("新请求重置为全新编辑状态", async () => {
  const { createInteractionSubmissionState, reduceInteractionSubmission } = await import("../src/interaction-state");
  const accepted = reduceInteractionSubmission(
    reduceInteractionSubmission(createInteractionSubmissionState(), {
      kind: "submit",
      decision: { inputId: "input-1", command: command("Old decision") },
    }),
    { kind: "accepted" },
  );
  const reset = reduceInteractionSubmission(accepted, { kind: "reset" });
  assert.deepEqual(reset, createInteractionSubmissionState(), "a new request starts without the old identity");
});

test("每个提交阶段都有可读的状态播报", async () => {
  const { submissionStatusText } = await import("../src/interaction-panel");
  const { createInteractionSubmissionState, reduceInteractionSubmission } = await import("../src/interaction-state");
  const initial = createInteractionSubmissionState();
  assert.match(submissionStatusText(initial), /Not submitted/);
  const submitting = reduceInteractionSubmission(initial, {
    kind: "submit",
    decision: { inputId: "input-1", command: command("Decision") },
  });
  assert.match(submissionStatusText(submitting), /Sending/);
  const unverified = reduceInteractionSubmission(submitting, { kind: "unverified", message: "Lost" });
  assert.match(submissionStatusText(unverified), /could not be confirmed/);
  assert.match(submissionStatusText(reduceInteractionSubmission(submitting, { kind: "accepted" })), /was saved/);
  assert.match(submissionStatusText(reduceInteractionSubmission(initial, { kind: "invalidated", message: "Stale" })), /no longer current/);
});

test("交互答案与完整参数不写入 localStorage", async () => {
  const files = (await readdir(srcRoot)).filter((name) => name.startsWith("interaction-"));
  assert.ok(files.length >= 2, "interaction modules exist");
  for (const file of files) {
    const content = await readFile(join(srcRoot, file), "utf8");
    assert.equal(/localStorage|sessionStorage/.test(content), false, `${file} must not mirror decisions or parameters to storage`);
  }
});
