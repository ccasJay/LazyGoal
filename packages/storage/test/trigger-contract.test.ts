import test from "node:test";
import assert from "node:assert/strict";
import type { GoalUserAction, Trigger } from "../../runtime/src/trigger";
import { triggerBinding } from "../src/generated/trigger-binding";
import { readTrigger, readTriggerWireRequest } from "../src/trigger-wire";

const base = {
    id: "trigger-1",
    name: "Trigger",
    source: { role: "external", externalId: "actor-1" },
    target: "supervisor",
    sentAt: "2026-11-09T00:00:00.000Z",
} as const;

const interactionAnswers: readonly GoalUserAction[] = [
    { kind: "message", content: "Continue", inputId: "input-1" },
    { kind: "approve_task", requestId: "task-1" },
    { kind: "feedback_task", requestId: "task-1", feedback: "Clarify the scope" },
    { kind: "answer_ask_user", requestId: "ask-1", answers: [{ questionId: "q-1", optionIds: ["o-1"], otherText: "details" }] },
    { kind: "reply_to_question", requestId: "ask-1", content: "Answer" },
    { kind: "skip_question", requestId: "ask-1" },
    { kind: "approve_action", actionId: "action-1", scope: "action", approvalInputId: "input-1" },
    { kind: "approve_action_revision", actionId: "action-1", input: { path: "src/index.ts" }, reviewRef: "review-1", approvalInputId: "input-1" },
    { kind: "retry_unknown_action", actionId: "action-1", recoveryRef: "recovery-1" },
    { kind: "decline_unknown_action_retry", actionId: "action-1", recoveryRef: "recovery-1", reason: "Do not retry" },
    { kind: "reject_action", actionId: "action-1", reason: "Not approved" },
    { kind: "approve", requestId: "approval-1" },
];

const interactionTriggers: readonly Trigger[] = interactionAnswers.map((answer, index) => ({
    ...base,
    id: `interaction-${index}`,
    type: "interaction",
    payload: { action: "answered", answer },
    goalId: "goal-1",
    replyTo: "request-1",
}));

const acceptedTriggers: readonly Trigger[] = [
    { ...base, type: "work", payload: { action: "submitted", material: { kind: "text", text: "Inspect the failing test" } } },
    { ...base, type: "response", payload: { action: "goal_created" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "response", payload: { action: "progress", runId: "run-1", status: "running" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "response", payload: { action: "progress", runId: "run-1", status: "waiting", waitingFor: "ask_user" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "response", payload: { action: "completed", runId: "run-1", answer: "Done" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "response", payload: { action: "failed", runId: "run-1" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "response", payload: { action: "cancelled", runId: "run-1" }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "permission", payload: { action: "requested", runId: "run-1", actionId: "action-1", interactionId: "action_approval:action-1", commitRevision: 4 }, goalId: "goal-1" },
    { ...base, type: "permission", payload: { action: "decided", decision: "approve", scope: "action" }, goalId: "goal-1", replyTo: "permission-request-1" },
    { ...base, type: "permission", payload: { action: "decided", decision: "reject", scope: "action", reason: "Not approved" }, goalId: "goal-1", replyTo: "permission-request-1" },
    { ...base, type: "interaction", payload: { action: "answered", answer: { kind: "approve_task", requestId: "task-1" } }, goalId: "goal-1", replyTo: "work-1" },
    { ...base, type: "instruction", payload: { action: "cancel", runId: "run-1" }, goalId: "goal-1" },
    { ...base, type: "instruction", payload: { action: "resume", runId: "run-1", acknowledgeUnknownEffects: true }, goalId: "goal-1", replyTo: "exit-1" },
    { ...base, type: "lifecycle", payload: { action: "started" } },
    { ...base, type: "lifecycle", payload: { action: "exited", outcome: "unexpected" } },
    { ...base, type: "collaboration", payload: { action: "requested" } },
    { ...base, type: "collaboration", payload: { action: "result" }, replyTo: "collaboration-1" },
    ...interactionTriggers,
];

test("generated Trigger binding accepts every declared type/action branch", () => {
    for (const trigger of acceptedTriggers) {
        const decoded = triggerBinding.read(trigger, "reject");
        assert.equal(decoded.ok, true, `${trigger.type}.${trigger.payload.action}`);
        if (decoded.ok) assert.deepEqual(decoded.data, trigger);
    }
});

test("generated Trigger binding rejects missing and extra fields on every branch", () => {
    for (const trigger of acceptedTriggers) {
        const payload = trigger.payload as unknown as Record<string, unknown>;
        const { action: _action, ...withoutAction } = payload;
        assert.equal(triggerBinding.read({ ...trigger, payload: withoutAction }, "reject").ok, false,
            `missing action: ${trigger.type}.${trigger.payload.action}`);
        assert.equal(triggerBinding.read({ ...trigger, extra: true }, "reject").ok, false,
            `extra root field: ${trigger.type}.${trigger.payload.action}`);
        assert.equal(triggerBinding.read({ ...trigger, payload: { ...payload, extra: true } }, "reject").ok, false,
            `extra payload field: ${trigger.type}.${trigger.payload.action}`);
    }
});

test("generated Trigger binding rejects missing branch-specific fields", () => {
    const incomplete: readonly unknown[] = [
        { ...acceptedTriggers[0], payload: { action: "submitted" } },
        { ...acceptedTriggers[2], payload: { action: "progress", status: "running" } },
        { ...acceptedTriggers[3], payload: { action: "progress", runId: "run-1", status: "waiting" } },
        { ...acceptedTriggers[4], payload: { action: "completed", runId: "run-1" } },
        { ...acceptedTriggers[5], payload: { action: "failed" } },
        { ...acceptedTriggers[7], payload: { action: "requested", runId: "run-1", actionId: "action-1", interactionId: "wait-1" } },
        { ...acceptedTriggers[8], payload: { action: "decided", decision: "approve" } },
        { ...acceptedTriggers[9], payload: { action: "decided", decision: "reject", scope: "action" } },
        { ...acceptedTriggers[10], payload: { action: "answered" } },
        { ...acceptedTriggers[11], payload: { action: "cancel" } },
        { ...acceptedTriggers[12], payload: { action: "resume", runId: "run-1" } },
        { ...acceptedTriggers[14], payload: { action: "exited" } },
        { ...acceptedTriggers[1], replyTo: undefined },
    ];
    for (const trigger of incomplete) assert.equal(triggerBinding.read(trigger, "reject").ok, false);
});

test("generated Trigger binding rejects type/action mismatches and arbitrary JSON payloads", () => {
    for (const trigger of acceptedTriggers) {
        const otherType = trigger.type === "work" ? "response" : "work";
        assert.equal(triggerBinding.read({ ...trigger, type: otherType }, "reject").ok, false,
            `mismatched type/action: ${trigger.type}.${trigger.payload.action}`);
    }
    assert.equal(triggerBinding.read({ ...base, type: "work", payload: { action: "submitted", extra: { arbitrary: true } } }, "reject").ok, false);
    assert.equal(triggerBinding.read({ ...base, type: "work", payload: { action: "unlisted", value: "x" } }, "reject").ok, false);
});


test("direct Trigger and wire parsers use the generated Trigger binding", () => {
    for (const trigger of acceptedTriggers) {
        assert.deepEqual(readTrigger(trigger), trigger);
        assert.deepEqual(readTriggerWireRequest({ secret: "connection-secret", trigger }), { secret: "connection-secret", trigger });
        assert.equal(readTrigger({ ...trigger, extra: true }), undefined);
        assert.equal(readTriggerWireRequest({ secret: "connection-secret", trigger, extra: true }), undefined);
    }
    const malformed = { ...acceptedTriggers[0]!, payload: { action: "submitted", extra: true } };
    assert.equal(readTrigger(malformed), undefined);
    assert.equal(readTriggerWireRequest({ secret: "connection-secret", trigger: malformed }), undefined);
});


test("generated interaction payload validates every GoalUserAction branch and rejects incomplete or open actions", () => {
    for (const trigger of interactionTriggers) {
        if (trigger.type !== "interaction") throw new Error("Expected interaction Trigger fixture");
        assert.equal(triggerBinding.read(trigger, "reject").ok, true, `interaction.${trigger.payload.action}.${trigger.payload.answer.kind}`);
        assert.equal(triggerBinding.read({ ...trigger, payload: { ...trigger.payload, answer: { ...trigger.payload.answer, extra: true } } }, "reject").ok, false,
            `extra answer field: ${trigger.payload.answer.kind}`);
    }
    const incompleteAnswers: readonly unknown[] = [
        { kind: "message", inputId: "input-1" },
        { kind: "approve_task" },
        { kind: "feedback_task", requestId: "task-1" },
        { kind: "answer_ask_user", requestId: "ask-1" },
        { kind: "reply_to_question", requestId: "ask-1" },
        { kind: "skip_question" },
        { kind: "approve_action", approvalInputId: "input-1" },
        { kind: "approve_action_revision", actionId: "action-1", input: {}, approvalInputId: "input-1" },
        { kind: "retry_unknown_action", actionId: "action-1" },
        { kind: "decline_unknown_action_retry", actionId: "action-1", recoveryRef: "recovery-1" },
        { kind: "reject_action", actionId: "action-1" },
        { kind: "approve" },
    ];
    for (const answer of incompleteAnswers) {
        assert.equal(triggerBinding.read({
            ...base,
            type: "interaction",
            payload: { action: "answered", answer },
            goalId: "goal-1",
            replyTo: "request-1",
        }, "reject").ok, false, `incomplete GoalUserAction: ${JSON.stringify(answer)}`);
    }
});


test("generated Trigger binding requires all common and branch-specific fields", () => {
    for (const trigger of acceptedTriggers) {
        for (const key of ["id", "name", "type", "source", "target", "payload", "sentAt"] as const) {
            const value = structuredClone(trigger) as unknown as Record<string, unknown>;
            delete value[key];
            assert.equal(triggerBinding.read(value, "reject").ok, false, `missing ${key}: ${trigger.type}.${trigger.payload.action}`);
        }
        for (const key of Object.keys(trigger.payload)) {
            const payload = structuredClone(trigger.payload) as unknown as Record<string, unknown>;
            delete payload[key];
            assert.equal(triggerBinding.read({ ...trigger, payload }, "reject").ok, false,
                `missing payload.${key}: ${trigger.type}.${trigger.payload.action}`);
        }
        if ("replyTo" in trigger) {
            const value = structuredClone(trigger) as unknown as Record<string, unknown>;
            delete value.replyTo;
            assert.equal(triggerBinding.read(value, "reject").ok, false, `missing replyTo: ${trigger.type}.${trigger.payload.action}`);
        }
        if (trigger.type === "response" || trigger.type === "permission" || trigger.type === "interaction" || trigger.type === "instruction") {
            const value = structuredClone(trigger) as unknown as Record<string, unknown>;
            delete value.goalId;
            assert.equal(triggerBinding.read(value, "reject").ok, false, `missing goalId: ${trigger.type}.${trigger.payload.action}`);
        }
    }
    assert.equal(triggerBinding.read({
        ...acceptedTriggers[0],
        payload: { action: "submitted", material: { kind: "text" } },
    }, "reject").ok, false);
    assert.equal(triggerBinding.read({
        ...acceptedTriggers[0],
        payload: { action: "submitted", material: { text: "work" } },
    }, "reject").ok, false);
});
