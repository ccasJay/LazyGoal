import assert from "node:assert/strict";
import { test } from "node:test";

import {
    advanceContextEpoch,
    assertValidTrajectoryEventDraft,
    createGoal,
    createInitialContextEpoch,
    TrajectoryProtocolError,
    type TrajectoryEventDraft,
} from "../src/index";
import { goalSnapshotCodec } from "../../storage/src/index";
import { currentProtocols, testAssistantMessage, testUserMessage } from "./current-fixtures";

function goal() {
    return createGoal({
        ...currentProtocols,
        id: "goal-compaction",
        runId: "run-compaction",
        intent: "验证压缩指针",
        promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "system", instructions: [], toolIds: [] },
    });
}

function epochAdvanceDraft(overrides: Record<string, unknown> = {}): TrajectoryEventDraft {
    return {
        goalId: "goal-compaction",
        runId: "run-compaction",
        phase: "executing",
        eventType: "context_epoch_advanced",
        payload: {
            type: "context_epoch_advanced",
            closedEpoch: {
                number: 0,
                conversationStartIndex: 0,
                conversationEndIndexExclusive: 4,
                closedThroughSequence: 6,
            },
            openedEpoch: {
                version: 1,
                number: 1,
                conversationStartIndex: 2,
                openedAtSequence: 7,
                compactionEventId: "event-7",
                compactionSourceRunId: "run-compaction",
            },
            reason: "threshold_compaction",
            compaction: {
                body: "已验证：改用原生 dialog；未解决：需要补充移动端回归。",
                sourceRunId: "run-compaction",
                firstSequence: 1,
                lastSequence: 6,
                eventIds: ["event-1", "event-6"],
            },
            ...overrides,
        },
    } as TrajectoryEventDraft;
}

test("advanceContextEpoch 携带压缩指针，未提供时省略该字段", () => {
    const messages = [testUserMessage("first"), testAssistantMessage("ok"), testUserMessage("second")];
    const current = createInitialContextEpoch();

    const withPointer = advanceContextEpoch(current, messages, 2, 5, {
        sourceRunId: "run-compaction",
    });
    assert.deepEqual({ ...withPointer }, {
        version: 1,
        number: 1,
        conversationStartIndex: 2,
        openedAtSequence: 5,
        compactionSourceRunId: "run-compaction",
    });

    const withoutPointer = advanceContextEpoch(current, messages, 2, 5);
    assert.equal("compactionSourceRunId" in withoutPointer, false);
    assert.throws(
        () => advanceContextEpoch(current, messages, 2, 5, { sourceRunId: "" }),
        /compaction source run must be non-empty/,
    );
});

test("context_epoch_advanced 接受带压缩正文的阈值切换", () => {
    assert.doesNotThrow(() => assertValidTrajectoryEventDraft(epochAdvanceDraft()));
});

test("context_epoch_advanced 拒绝压缩载荷与原因的错配", () => {
    assert.throws(
        () => assertValidTrajectoryEventDraft(epochAdvanceDraft({ reason: "task_approved" })),
        (error: unknown) => error instanceof TrajectoryProtocolError
            && /compaction requires the threshold_compaction reason/.test(error.message),
    );
    assert.throws(
        () => assertValidTrajectoryEventDraft(epochAdvanceDraft({ reason: "threshold_compaction", compaction: undefined })),
        (error: unknown) => error instanceof TrajectoryProtocolError
            && /requires a compaction payload/.test(error.message),
    );
});

test("context_epoch_advanced 拒绝非法压缩正文、来源范围与事件身份", () => {
    const invalidPayloads = [
        { compaction: { body: "", sourceRunId: "run-compaction", firstSequence: 1, lastSequence: 6, eventIds: ["event-1"] } },
        { compaction: { body: "x", sourceRunId: "", firstSequence: 1, lastSequence: 6, eventIds: ["event-1"] } },
        { compaction: { body: "x", sourceRunId: "run-compaction", firstSequence: 6, lastSequence: 1, eventIds: ["event-1"] } },
        { compaction: { body: "x", sourceRunId: "run-compaction", firstSequence: 1, lastSequence: 6, eventIds: [] } },
        { compaction: { body: "x", sourceRunId: "run-compaction", firstSequence: 1, lastSequence: 6, eventIds: [""] } },
        { compaction: { body: "x", sourceRunId: "run-compaction", firstSequence: 1, lastSequence: 6, eventIds: ["event-1"], extra: true } },
    ];
    for (const override of invalidPayloads) {
        assert.throws(
            () => assertValidTrajectoryEventDraft(epochAdvanceDraft(override)),
            TrajectoryProtocolError,
            JSON.stringify(override),
        );
    }
});

test("压缩指针随 Goal 快照往返，正文不进入快照", () => {
    const base = goal();
    const value = {
        ...base,
        state: {
            ...base.state,
            messages: [],
            run: {
                ...base.state.run,
                contextEpoch: {
                    version: 1 as const,
                    number: 1,
                    conversationStartIndex: 0,
                    openedAtSequence: 0,
                    compactionSourceRunId: "run-compaction",
                },
            },
        },
    };

    const encoded = goalSnapshotCodec.encode(value);
    assert.deepEqual(encoded.state.run.contextEpoch, {
        version: 1,
        number: 1,
        conversationStartIndex: 0,
        openedAtSequence: 0,
        compactionSourceRunId: "run-compaction",
    });
    assert.equal(JSON.stringify(encoded).includes("已验证"), false);
    assert.deepEqual(goalSnapshotCodec.decode(encoded).state.run.contextEpoch, value.state.run.contextEpoch);
});
