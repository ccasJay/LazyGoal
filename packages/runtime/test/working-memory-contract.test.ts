import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createEmptyWorkingMemory,
    createGoal,
    GOAL_PROTOCOL_ERROR_CODE,
    GoalProtocolError,
    isMemoryProtocol,
    resolveMemoryProtocol,
} from "../src/index";
import type {
    AgentProfile,
    GoalProtocolValidator,
    MemoryPatch,
    StepExecutionInput,
    WorkingMemory,
} from "../src/index";

const profile: AgentProfile = {
    id: "contract-profile",
    systemPrompt: "You are a contract test agent.",
    instructions: [],
    toolIds: [],
};

test("Memory protocol defaults to legacy and rejects unknown or extended values", () => {
    assert.deepEqual(resolveMemoryProtocol({}), {
        kind: "checkpoint",
        version: 1,
    });
    assert.deepEqual(resolveMemoryProtocol({
        memoryProtocol: { kind: "structured", version: 1 },
    }), {
        kind: "structured",
        version: 1,
    });

    assert.equal(isMemoryProtocol({ kind: "checkpoint", version: 1 }), true);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 1 }), true);
    assert.equal(isMemoryProtocol({ kind: "structured", version: 2 }), false);
    assert.equal(
        isMemoryProtocol({ kind: "structured", version: 1, experimental: true }),
        false,
    );

    assert.throws(
        () => resolveMemoryProtocol({
            memoryProtocol: { kind: "structured", version: 2 } as never,
        }),
        (error: unknown) =>
            error instanceof GoalProtocolError
            && error.code === GOAL_PROTOCOL_ERROR_CODE,
    );
});

test("createGoal freezes an explicit protocol without changing legacy snapshot shape", () => {
    const supplied = { kind: "structured" as const, version: 1 as const };
    const goal = createGoal({
        id: "structured-goal",
        intent: "验证结构化协议",
        promptBundleVersion: 4,
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

    const legacyGoal = createGoal({
        id: "legacy-goal",
        intent: "保持旧协议",
        promptBundleVersion: 1,
        profile,
        runId: "legacy-run",
    });
    assert.equal("memoryProtocol" in legacyGoal.definition, false);
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
            if (
                input.promptBundleVersion === 4
                && input.memoryProtocol.kind !== "structured"
            ) {
                throw new GoalProtocolError("Prompt 与 Memory 协议不匹配");
            }
        },
    };

    validator.validate({
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
    });
    assert.throws(
        () => validator.validate({
            promptBundleVersion: 4,
            memoryProtocol: { kind: "checkpoint", version: 1 },
        }),
        GoalProtocolError,
    );

    const memory: WorkingMemory = createEmptyWorkingMemory();
    const input: StepExecutionInput = {
        goal: createGoal({
            id: "input-goal",
            intent: "对象输入",
            promptBundleVersion: 4,
            memoryProtocol: { kind: "structured", version: 1 },
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
                checkpoint: "legacy test decision",
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
