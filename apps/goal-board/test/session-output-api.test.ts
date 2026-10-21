import assert from "node:assert/strict";
import { test } from "node:test";

import { isLiveEvent } from "../../../packages/web-contracts/src/index";

test("会话输出 wire 守卫接受新的类型化事件", () => {
    const state = {
        goalId: "goal-1",
        runId: "run-1",
        runStatus: "running",
        mode: "normal",
        commitRevision: 3,
        queueRevision: 0,
        queuePaused: false,
        pendingMessageCount: 0,
        pendingSteerCount: 0,
        needsRecovery: false,
        executionOwner: true,
        messages: { count: 0, recent: [] },
    };
    assert.equal(isLiveEvent({ type: "state_sync", goalId: "goal-1", state }), true);
    assert.equal(isLiveEvent({
        type: "message_committed",
        goalId: "goal-1",
        runId: "run-1",
        message: {
            messageId: "msg-1",
            role: "assistant",
            runId: "run-1",
            purpose: "answer",
            commitRevision: 4,
            previewId: "candidate-1",
        },
    }), true);
    assert.equal(isLiveEvent({
        type: "interaction_required",
        goalId: "goal-1",
        runId: "run-1",
        interaction: { interactionId: "question:ask-1", kind: "ask_user", runId: "run-1" },
    }), true);
    assert.equal(isLiveEvent({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "candidate_preview",
            sourceEventId: "event-1",
            sourceCursor: 1,
            candidateId: "candidate-1",
            text: "候选正文",
            startOffset: 0,
            truncated: false,
            complete: true,
        },
    }), true);
    assert.equal(isLiveEvent({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "candidate_invalidated",
            sourceEventId: "event-2",
            sourceCursor: 2,
            candidateId: "candidate-1",
            reason: "rejected",
        },
    }), true);
});

test("会话输出 wire 守卫拒绝缺少身份或位置的事件", () => {
    assert.equal(isLiveEvent({
        type: "message_committed",
        goalId: "goal-1",
        runId: "run-1",
        message: { role: "assistant", runId: "run-1", commitRevision: 1 },
    }), false);
    assert.equal(isLiveEvent({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "candidate_preview",
            sourceEventId: "event-1",
            sourceCursor: 1,
            candidateId: "candidate-1",
            text: "候选正文",
            truncated: false,
            complete: true,
        },
    }), false);
    assert.equal(isLiveEvent({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "candidate_invalidated",
            sourceEventId: "event-2",
            sourceCursor: 2,
            candidateId: "candidate-1",
            reason: "unknown_reason",
        },
    }), false);
    assert.equal(isLiveEvent({
        type: "interaction_required",
        goalId: "goal-1",
        runId: "run-1",
        interaction: { interactionId: "question:ask-1", kind: "unknown", runId: "run-1" },
    }), false);
});

test("旧的未标注事件种类不再被接受为会话输出", () => {
    assert.equal(isLiveEvent({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: { kind: "unknown_future_kind", sourceEventId: "event-1", sourceCursor: 1 },
    }), false);
});
