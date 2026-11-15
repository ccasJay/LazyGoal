import assert from "node:assert/strict";
import { test } from "node:test";

import type { ModelLegacyAssistantMessage, NativeConversationIdentity } from "../../model-contracts/src/index";
import { readModelToolCalls } from "../../model-contracts/src/index";
import {
    allocateImmutableEvent,
    type TrajectoryEvent,
    type TrajectoryEventPayload,
} from "../../runtime/src/index";
import { collectNativeModelExchanges } from "../src/native-model-history";
import { TrajectoryEventProjector } from "../src/trajectory-event-projector";

const identity: NativeConversationIdentity = {
    provider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "test",
    protocol: "gemini-content",
};
const projector = new TrajectoryEventProjector({ previewLimit: 100 });

function message(toolId: string, args: Record<string, unknown>): ModelLegacyAssistantMessage {
    return {
        role: "assistant",
        content: "Calling",
        reasoning: "Summary",
        toolCalls: [{
            callId: "provider-call",
            toolId,
            argumentsJson: JSON.stringify(args),
        }],
        continuation: {
            identity,
            parts: [
                { text: "Calling" },
                { functionCall: { name: toolId, args } },
            ],
        },
    };
}

/** 构造一次带修订的直接调用轨迹事实。 */
function revisedActionFixture(): { events: TrajectoryEvent[] } {
    const events: TrajectoryEvent[] = [];
    const add = (
        payload: TrajectoryEventPayload,
        unit = "unit-1",
        extra: { readonly programId?: string; readonly callIndex?: number } = {},
    ) => {
        const event = allocateImmutableEvent({
            goalId: "revision-goal",
            runId: "revision-run",
            phase: "executing",
            executionUnitId: unit,
            eventType: payload.type,
            payload,
            ...extra,
        } as never, events.length + 1);
        events.push(event);
        return event;
    };

    const originalInput = { path: "a.txt", content: "original" };
    const finalInput = { path: "b.txt", content: "revised" };
    const action = { actionId: "runtime-action", toolId: "write_file", input: originalInput };

    add({
        type: "model_response_received",
        stage: "decide",
        modelCallId: "call-1",
        epochNumber: 0,
        conversationPosition: 0,
        message: message("write_file", originalInput),
    });
    add({ type: "decision_received", decision: { kind: "tool_call", action } });
    add({ type: "action_staged", action, approvalStatus: "awaiting_approval" });
    add({
        type: "action_revised",
        actionId: action.actionId,
        reviewRef: "review:0123456789abcdef0123456789abcdef",
        originalInput,
        finalInput,
        approvalScope: "action",
        revisionSource: "user",
    });
    add({
        type: "tool_started",
        actionId: action.actionId,
        toolId: action.toolId,
        input: finalInput,
        revision: { reviewRef: "review:0123456789abcdef0123456789abcdef", originalInput },
    });
    add({
        type: "tool_finished",
        actionId: action.actionId,
        toolId: action.toolId,
        observation: { kind: "success", output: "saved", summary: "Wrote" },
    } as never);
    add({
        type: "observation_recorded",
        actionId: action.actionId,
        observation: { kind: "success", output: "saved", summary: "Wrote" },
    });
    return { events };
}

test("修订后的下一模型请求说明实际执行参数与原请求差异，且原生调用保持原文", () => {
    const { events } = revisedActionFixture();
    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;

    // 原生调用保持原始身份与参数，不把新参数冒充原始调用。
    const assistant = exchange.messages[0]!;
    assert.equal(assistant.role, "assistant");
    assert.deepEqual(readModelToolCalls(assistant)[0]?.argumentsJson, JSON.stringify({ path: "a.txt", content: "original" }));

    // 真实结果只出现一次。
    const toolMessages = exchange.messages.filter((entry) => entry.role === "tool");
    assert.equal(toolMessages.length, 1);

    const result = JSON.parse(String(toolMessages[0]!.content)) as {
        readonly actionId: string;
        readonly sourceSequence: number;
        readonly observation: { readonly kind: string };
        readonly revision?: {
            readonly reviewRef: string;
            readonly originalInput: { readonly text: string; readonly truncated: boolean };
            readonly executedInput: { readonly text: string; readonly truncated: boolean };
        };
    };
    assert.equal(result.actionId, "runtime-action");
    assert.equal(result.observation.kind, "success");
    assert.ok(result.revision !== undefined);
    assert.equal(result.revision.reviewRef, "review:0123456789abcdef0123456789abcdef");
    assert.equal(result.revision.originalInput.truncated, false);
    assert.match(result.revision.originalInput.text, /"a\.txt"/);
    assert.match(result.revision.executedInput.text, /"b\.txt"/);
});

test("修订说明的最终参数摘要保持有界，不展开完整输入", () => {
    const { events } = revisedActionFixture();
    const oversized = { path: "b.txt", content: "x".repeat(2_000) };
    const started = events.find((event) => event.eventType === "tool_started");
    assert.ok(started !== undefined);

    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;
    const tool = exchange.messages.find((entry) => entry.role === "tool")!;
    const result = JSON.parse(String(tool.content)) as {
        readonly revision?: { readonly executedInput: { readonly text: string; readonly truncated: boolean } };
    };
    assert.equal(result.revision?.executedInput.truncated, false);
    assert.ok((result.revision?.executedInput.text.length ?? 0) < 1_000);
    assert.ok(oversized.content.length > 1_000);
});

test("PTC 子调用修订在下一个模型边界提供有界修订说明", () => {
    const events: TrajectoryEvent[] = [];
    const add = (
        payload: TrajectoryEventPayload,
        unit = "unit-1",
        extra: { readonly programId?: string; readonly callIndex?: number } = {},
    ) => {
        const event = allocateImmutableEvent({
            goalId: "revision-goal",
            runId: "revision-run",
            phase: "executing",
            executionUnitId: unit,
            eventType: payload.type,
            payload,
            ...extra,
        } as never, events.length + 1);
        events.push(event);
        return event;
    };

    add({
        type: "model_response_received",
        stage: "decide",
        modelCallId: "call-1",
        epochNumber: 0,
        conversationPosition: 0,
        message: message("execute_program", { code: "return 1" }),
    });
    add({
        type: "decision_received",
        decision: { kind: "tool_call", action: { actionId: "parent-1", toolId: "execute_program", input: { code: "return 1" } } },
    });
    add({
        type: "program_started",
        programId: "program-1",
        parentActionId: "parent-1",
        codeHash: "a".repeat(64),
        workerHash: "b".repeat(64),
        nodeVersion: "v22",
    } as never);
    // 程序子调用的修订事实位于子调用自己的执行单元。
    add({
        type: "action_revised",
        actionId: "program-1:0",
        reviewRef: "review:0123456789abcdef0123456789abcdef",
        originalInput: { path: "a.txt" },
        finalInput: { path: "b.txt" },
        approvalScope: "action",
        revisionSource: "user",
    }, "unit-1:call:0", { programId: "program-1", callIndex: 0 });
    add({
        type: "observation_recorded",
        actionId: "parent-1",
        observation: { kind: "success", output: { result: 1 }, summary: "Program returned a result." },
    });

    const exchange = collectNativeModelExchanges(events, identity, projector).get("unit-1")![0]!;
    const tool = exchange.messages.find((entry) => entry.role === "tool")!;
    const result = JSON.parse(String(tool.content)) as {
        readonly programRevisions?: readonly {
            readonly actionId: string;
            readonly reviewRef: string;
            readonly finalInput: { readonly text: string; readonly truncated: boolean };
            readonly sourceSequence: number;
        }[];
    };
    assert.ok(result.programRevisions !== undefined);
    assert.equal(result.programRevisions.length, 1);
    assert.equal(result.programRevisions[0]?.actionId, "program-1:0");
    assert.match(result.programRevisions[0]?.finalInput.text ?? "", /"b\.txt"/);
    // 其余内部子调用事实不进入模型上下文。
    assert.equal((result as { observation?: unknown }).observation !== undefined, true);
});
