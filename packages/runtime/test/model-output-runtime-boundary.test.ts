import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    Runner,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    RunRef,
    RunScheduler,
    StepExecutionInput,
    StepExecutor,
    TrajectoryStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Follow instructions strictly."],
    toolIds: [],
};

function createExecutingGoal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        intent: "Test model output runtime boundary",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        maxSteps: 5,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                task: {
                    objective: "Test objective",
                    completionCriteria: [{ text: "Test criteria" }],
                },
            },
        },
    };
}

function createRef(goal: Goal, runId = "run-1"): RunRef {
    return {
        goalId: goal.id,
        runId,
    };
}

class MaliciousStepExecutor implements StepExecutor {
    constructor(private readonly decision: unknown) {}

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        return this.decision as AgentDecision;
    }
}


test("Runner 拦截恶意替换 Executor 返回的额外字段并记录 INVALID_AGENT_DECISION", async () => {
    const store = new InMemoryGoalStore();
    const initial = createExecutingGoal("runner-extra-field");
    await store.save(initial);

    const maliciousDecision = {
        kind: "wait",
        reason: "等待",
        extraUnauthorizedField: 123,
    };

    const runner = new Runner({
        store,
        executor: new MaliciousStepExecutor(maliciousDecision),
        trajectoryStore: trajectoryStoreFor(store),
    });

    const result = await runner.run(createRef(initial));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
});

test("Runner 拦截缺失必填字段的 Decision", async () => {
    const store = new InMemoryGoalStore();
    const initial = createExecutingGoal("runner-missing-field");
    await store.save(initial);

    // complete 缺失 completionEvidence
    const maliciousDecision = {
        kind: "complete",
        summary: "全部完成",
    };

    const runner = new Runner({
        store,
        executor: new MaliciousStepExecutor(maliciousDecision),
        trajectoryStore: trajectoryStoreFor(store),
    });

    const result = await runner.run(createRef(initial));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
});

test("Runner 拦截空白文本语义的 Decision", async () => {
    const store = new InMemoryGoalStore();
    const initial = createExecutingGoal("runner-blank-text");
    await store.save(initial);

    const blankDecision = {
        kind: "wait",
        reason: "   \n\t  ",
    };

    const runner = new Runner({
        store,
        executor: new MaliciousStepExecutor(blankDecision),
        trajectoryStore: trajectoryStoreFor(store),
    });

    const result = await runner.run(createRef(initial));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
});

test("Runner 拦截包含非法 Fact value 的 Decision（Req 2.5）", async () => {
    const store = new InMemoryGoalStore();
    const initial = createExecutingGoal("runner-invalid-fact");
    await store.save(initial);

    // Fact value 是多维嵌套数组
    const invalidFactDecision = {
        kind: "wait",
        reason: "等待分析",
        memoryPatch: {
            protocolVersion: 1,
            operations: [
                {
                    type: "upsert_fact",
                    fact: {
                        subject: "data",
                        predicate: "matrix",
                        value: [["row1"], ["row2"]],
                        stability: "stable",
                        evidenceSequences: [1],
                    },
                },
            ],
        },
    };

    const runner = new Runner({
        store,
        executor: new MaliciousStepExecutor(invalidFactDecision),
        trajectoryStore: trajectoryStoreFor(store),
    });

    const result = await runner.run(createRef(initial));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
});
