import assert from "node:assert/strict";
import { test } from "node:test";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import {
    allocateImmutableEvent,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../../runtime/src/index";
import { collectNativeModelExchanges } from "../src/native-model-history";
import { TrajectoryEventProjector } from "../src/trajectory-event-projector";
import { TrajectoryExecutionUnitAdapter } from "../src/trajectory-execution-unit-adapter";

test("PTC internal results remain auditable but stay out of native and Hot/Warm model context", () => {
    const identity: NativeConversationIdentity = {
        provider: "google", endpoint: "https://generativelanguage.googleapis.com/v1beta",
        model: "test", protocol: "gemini-content",
    };
    const parent = { actionId: "parent", toolId: "execute_program", input: { code: "return 3" } };
    const child = { actionId: "program:0", toolId: "read_file", input: { path: "large.txt" } };
    const childObservation = { kind: "success" as const, output: "private-content-".repeat(40000), summary: "Read" };
    const parentObservation = { kind: "success" as const, output: { total: 3 }, summary: "Program returned a result." };
    const events: TrajectoryEvent[] = [];
    const add = (draft: TrajectoryEventDraft): void => {
        events.push(allocateImmutableEvent(draft, events.length + 1));
    };
    const base = { goalId: "goal-1", runId: "run-1", phase: "executing" as const };
    const parentMeta = { ...base, executionUnitId: "parent-unit", actionId: "parent" };
    const childMeta = { ...base, executionUnitId: "child-unit", actionId: "program:0", programId: "program", callIndex: 0 };
    add({ ...base, executionUnitId: "parent-unit", eventType: "model_response_received", payload: {
        type: "model_response_received", modelCallId: "call-1", stage: "decide", conversationPosition: 0, epochNumber: 0,
        message: {
            role: "assistant", content: "Running program", toolCalls: [{ callId: "provider-call", toolId: "execute_program", argumentsJson: "{}" }],
            continuation: { identity, parts: [{ functionCall: { name: "execute_program", args: {} } }] },
        },
    } });
    add({ ...parentMeta, eventType: "decision_received", payload: { type: "decision_received", decision: { kind: "tool_call", action: parent } } });
    add({ ...parentMeta, eventType: "action_staged", payload: { type: "action_staged", action: parent, approvalStatus: "approved" } });
    add({ ...parentMeta, eventType: "tool_started", payload: { type: "tool_started", actionId: "parent", toolId: "execute_program", input: parent.input } });
    add({ ...parentMeta, eventType: "program_started", payload: {
        type: "program_started", programId: "program", parentActionId: "parent",
        codeHash: "code", workerHash: "worker", nodeVersion: "v22",
    } });
    add({ ...childMeta, eventType: "action_staged", payload: { type: "action_staged", action: child, approvalStatus: "approved" } });
    add({ ...childMeta, eventType: "tool_started", payload: { type: "tool_started", actionId: child.actionId, toolId: child.toolId, input: child.input } });
    add({ ...childMeta, eventType: "tool_finished", payload: { type: "tool_finished", actionId: child.actionId, toolId: child.toolId, observation: childObservation } });
    add({ ...childMeta, eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: child.actionId, observation: childObservation } });
    add({ ...parentMeta, eventType: "program_settled", payload: { type: "program_settled", programId: "program", parentActionId: "parent", outcome: "success" } });
    add({ ...parentMeta, eventType: "tool_finished", payload: { type: "tool_finished", actionId: "parent", toolId: "execute_program", observation: parentObservation } });
    add({ ...parentMeta, eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: "parent", observation: parentObservation } });

    const units = new TrajectoryExecutionUnitAdapter().adapt(events, {
        goalId: "goal-1", runId: "run-1", committedThroughSequence: events.length,
    });
    assert.equal(units.length, 1);
    assert.equal(units[0]?.executionUnitId, "parent-unit");
    assert.equal(JSON.stringify(units).includes("private-content-"), false);
    const exchanges = collectNativeModelExchanges(events, identity, new TrajectoryEventProjector({ previewLimit: 100 }));
    const result = exchanges.get("parent-unit")?.[0]?.messages[1];
    assert.equal(result?.role, "tool");
    if (result?.role === "tool") {
        assert.equal(JSON.stringify(result).includes("private-content-"), false);
        assert.equal(JSON.parse(result.content).observation.output.value.total, 3);
    }
    assert.equal(exchanges.has("child-unit"), false);
});
