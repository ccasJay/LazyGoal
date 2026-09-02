import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createEmptyWorkingMemory,
    createGoal,
    GOAL_PROTOCOL_ERROR_CODE,
    GoalProtocolError,
    isMemoryProtocol,
} from "../src/index";
import type {
    AgentProfile,
    GoalProtocolValidator,
    MemoryPatch,
    StepExecutionInput,
    WorkingMemory,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "contract-profile",
    systemPrompt: "You are a contract test agent.",
    instructions: [],
    toolIds: [],
};

test("Memory protocol accepts only the current structured@1 shape", () => {
    assert.equal(isMemoryProtocol({ kind: "checkpoint", version: 1 }), false);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 1 }), true);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 2 }), false);
    assert.equal(
        isMemoryProtocol({ kind: "structured", version: 1, experimental: true }),
        false,
    );

});

test("createGoal freezes the complete current protocol combination", () => {
    const supplied = { kind: "structured" as const, version: 1 as const };
    const goal = createGoal({
        ...currentProtocols,
        id: "structured-goal",
        intent: "验证结构化协议",
        promptBundleVersion: 1,
        memoryProtocol: supplied,
        profile,
        runId: "structured-run",
    });

    (supplied as { kind: string }).kind = "checkpoint";
    assert.deepEqual(goal.definition.memoryProtocol, {
        kind: "structured",
        version: 1,
    });
    assert.notEqual(goal.definition.memoryProtocol, supplied);

    assert.deepEqual(goal.definition.modelContextProtocol, currentProtocols.modelContextProtocol);
    assert.deepEqual(goal.definition.contextRetrievalProtocol, currentProtocols.contextRetrievalProtocol);
    assert.throws(() => createGoal({
        ...currentProtocols,
        id: "historical-memory-goal",
        intent: "拒绝历史 Memory 协议",
        memoryProtocol: { kind: "checkpoint", version: 1 } as never,
        promptBundleVersion: 1,
        profile,
        runId: "historical-memory-run",
    }), /protocol/i);
});

test("Working Memory keeps only derived entries and validates its revision boundary", () => {
    const revision = { eventId: "patch-1", sequence: 4 };
    const memory = createEmptyWorkingMemory(5, revision);

    assert.deepEqual(memory, {
        protocolVersion: 1,
        derivedThroughSequence: 5,
        revision,
        facts: [],
        hypotheses: [],
        plan: [],
        blockers: [],
    });
    for (const forbiddenField of [
        "checkpoint",
        "previousStep",
        "pendingAction",
        "stepCount",
        "status",
    ]) {
        assert.equal(forbiddenField in memory, false, forbiddenField);
    }

    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "patch-1", sequence: 4 }),
        /revision/i,
    );
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "", sequence: 1 }),
        /revision/i,
    );
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: "patch-1", sequence: 1.5 }),
        /revision/i,
    );
    assert.throws(
        () => createEmptyWorkingMemory(3, { eventId: 42, sequence: 1 } as never),
        /revision/i,
    );
});

test("protocol validator is a side-effect-free boundary and object input carries Memory separately", async () => {
    const calls: StepExecutionInput[] = [];
    const validator: GoalProtocolValidator = {
        validate(input) {
            if (input.memoryProtocol.kind !== "structured") {
                throw new GoalProtocolError("Prompt 与 Memory 协议不匹配");
            }
        },
    };

    validator.validate({
        ...currentProtocols,
        promptBundleVersion: 1,
    });
    assert.throws(
        () => validator.validate({
            ...currentProtocols,
            promptBundleVersion: 1,
            memoryProtocol: { kind: "checkpoint", version: 1 },
        } as never),
        GoalProtocolError,
    );

    const memory: WorkingMemory = createEmptyWorkingMemory();
    const input: StepExecutionInput = {
        goal: createGoal({
            ...currentProtocols,
            id: "input-goal",
            intent: "对象输入",
            promptBundleVersion: 1,
            profile,
            runId: "input-run",
        }),
        authorizedTools: [],
        workingMemory: memory,
    };
    const executor = {
        async execute(received: StepExecutionInput) {
            calls.push(received);
            return {
                kind: "complete" as const,
                completionEvidence: [],
                summary: "contract test",
            };
        },
    };

    await executor.execute(input);
    assert.equal(calls[0]?.goal.id, "input-goal");
    assert.equal(calls[0]?.workingMemory, memory);
    assert.equal("checkpoint" in memory, false);
});

test("Memory Patch DTO contains only model-owned memory operations", () => {
    const patch: MemoryPatch = {
        protocolVersion: 1,
        operations: [{
            type: "upsert_fact",
            fact: {
                subject: "workspace",
                predicate: "config_exists",
                value: true,
                stability: "stable",
                evidenceSequences: [1],
            },
        }],
    };

    assert.deepEqual(Object.keys(patch), ["protocolVersion", "operations"]);
    assert.equal("checkpoint" in patch, false);
    assert.equal("pendingAction" in patch, false);
    assert.equal("stepCount" in patch, false);
    assert.equal("status" in patch, false);
});
