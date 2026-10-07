import assert from "node:assert/strict";
import { test } from "node:test";

import { allocateImmutableEvent, type TrajectoryEvent, type TrajectoryEventPayload } from "../../runtime/src/index";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import { collectNativeModelExchanges } from "../src/native-model-history";
import { TrajectoryEventProjector } from "../src/trajectory-event-projector";

test("native history pairs an interrupted unknown Tool result without asserting tool_finished", () => {
    const identity: NativeConversationIdentity = {
        provider: "google",
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
        model: "test",
        protocol: "gemini-content",
    };
    const events: TrajectoryEvent[] = [];
    const add = (payload: TrajectoryEventPayload) => {
        const event = allocateImmutableEvent({
            goalId: "goal-interrupt-history",
            runId: "run-interrupt-history",
            phase: "executing",
            executionUnitId: "unit-interrupted",
            eventType: payload.type,
            payload,
        } as any, events.length + 1);
        events.push(event);
    };
    add({
        type: "model_response_received",
        stage: "decide",
        modelCallId: "model-call-1",
        epochNumber: 0,
        conversationPosition: 0,
        message: {
            role: "assistant",
            content: "Calling tool",
            toolCalls: [{ callId: "provider-call-1", toolId: "write_file", argumentsJson: "{}" }],
            continuation: { identity, parts: [{ functionCall: { name: "write_file", args: {} }, thoughtSignature: "sig" }] },
        },
    });
    add({ type: "decision_received", decision: { kind: "tool_call", action: { actionId: "action-1", toolId: "write_file", input: {} } } });
    add({
        type: "observation_recorded",
        actionId: "action-1",
        observation: {
            kind: "failure",
            code: "TOOL_INTERRUPTED_OUTCOME_UNKNOWN",
            message: "Tool was interrupted; external effect is unknown.",
            retryable: false,
        },
    });
    add({ type: "run_interrupted_action_unknown", requestId: "interrupt-1", actionId: "action-1", toolId: "write_file" });

    const exchanges = collectNativeModelExchanges(events, identity, new TrajectoryEventProjector({ previewLimit: 100 }));
    const tool = exchanges.get("unit-interrupted")?.[0]?.messages[1];
    assert.equal(tool?.role, "tool");
    if (tool?.role !== "tool") return;
    const result = JSON.parse(tool.content);
    assert.equal(result.observation.code, "TOOL_INTERRUPTED_OUTCOME_UNKNOWN");
    assert.equal(result.observation.retryable, false);
    assert.equal(events.some((event) => event.eventType === "tool_finished"), false);
});
