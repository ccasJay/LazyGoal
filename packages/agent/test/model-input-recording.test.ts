import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoal } from "../../runtime/src/index";
import type { TraceRecord } from "../../runtime/src/index";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import type { LLMRequest } from "../../llm/src/core/types";
import { createDefaultPromptBundleRenderer, DropOldestContextCompactor, LLMStepExecutor } from "../src/index";
import { createCurrentContextAssembler, currentProtocols, currentWorkingMemory } from "./current-fixtures";

test("model input is saved before failed Adapter calls and shares call identity with successful Think frames", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const created = createGoal({ id: "goal-input", runId: "run-input", intent: "Inspect architecture", promptBundleVersion: 1, ...currentProtocols, profile: { id: "profile", systemPrompt: "Inspect source evidence.", instructions: [], toolIds: [] } });
    const goal = { ...created, state: { ...created.state, run: { ...created.state.run, status: "running" as const } } };
    const saved: ModelInputRecord[] = [];
    const traces: TraceRecord[] = [];
    let fail = true;
    const executor = new LLMStepExecutor({ renderer, contextCompactor: new DropOldestContextCompactor(), trajectoryContextAssembler: createCurrentContextAssembler(),
        traceSink: { append: async record => { traces.push(record); } },
        modelInputStore: { append: async record => { saved.push(record); }, read: async () => saved },
        adapter: { structuredOutputMode: "strict", generate: async (request: LLMRequest) => {
            assert.deepEqual(saved.at(-1)!.messages.map(({ role, content }) => ({ role, content })), request.messages);
            if (fail) throw new Error("provider failed");
            return { content: "Inspect Runtime and Storage ownership." };
        } },
    });
    const input = { goal, authorizedTools: [], workingMemory: currentWorkingMemory, executionUnitId: "unit-input", thinkHistory: [] };
    await assert.rejects(executor.decide(input), /provider failed/);
    assert.equal(saved.length, 1); assert.equal(saved[0]!.stage, "decide");
    assert.equal(saved[0]!.messages[0]!.role, "system"); assert.ok(saved[0]!.messages[0]!.content.includes("Inspect source evidence."));
    fail = false;
    const result = await executor.think({ ...input, thinkGoal: "Trace ownership" });
    assert.equal(saved.length, 2); assert.equal(saved[1]!.stage, "think");
    assert.equal(result.modelContextFrame!.modelCallId, saved[1]!.callId);
    assert.notEqual(saved[0]!.callId, saved[1]!.callId);
    assert.deepEqual(traces.filter(trace => trace.kind === "model_request").map(trace => trace.payload), saved.map(call => ({ modelInputCallId: call.callId })));
});

test("configured model input storage failure prevents sending an unrecorded request", async () => {
    const renderer = await createDefaultPromptBundleRenderer();
    const created = createGoal({ id: "goal-input", runId: "run-input", intent: "Inspect architecture", promptBundleVersion: 1, ...currentProtocols, profile: { id: "profile", systemPrompt: "Inspect evidence.", instructions: [], toolIds: [] } });
    const goal = { ...created, state: { ...created.state, run: { ...created.state.run, status: "running" as const } } };
    let calls = 0;
    const executor = new LLMStepExecutor({ renderer, contextCompactor: new DropOldestContextCompactor(), trajectoryContextAssembler: createCurrentContextAssembler(),
        modelInputStore: { append: async () => { throw new Error("storage unavailable"); }, read: async () => [] },
        adapter: { structuredOutputMode: "strict", generate: async () => { calls++; return { content: "unused" }; } },
    });
    await assert.rejects(executor.execute({ goal, authorizedTools: [], workingMemory: currentWorkingMemory }), /storage unavailable/);
    assert.equal(calls, 0);
});
