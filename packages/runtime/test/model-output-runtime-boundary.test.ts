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
    GoalStore,
    PreparationExecutionInput,
    PreparationExecutor,
    PreparationResult,
    RunRef,
    RunScheduler,
    StepExecutionInput,
    StepExecutor,
    TrajectoryStore,
} from "../src/index";

const unusedScheduler: RunScheduler = {
    schedule: async () => {
        throw new Error("Unexpected Scheduler call");
    },
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Follow instructions strictly."],
    toolIds: [],
};

function createCoordinatorGoal(id: string): Goal {
    return createGoal({
        ...currentProtocols,
        id,
        intent: "Test model output runtime boundary",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        maxSteps: 5,
    });
}

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
                preparation: { status: "completed" },
                task: {
                    objective: "Test objective",
                    completionCriteria: ["Test criteria"],
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

class MaliciousPreparationExecutor implements PreparationExecutor {
    constructor(private readonly result: unknown) {}

    async execute(_input: PreparationExecutionInput): Promise<PreparationResult> {
        return this.result as PreparationResult;
    }
}

class MaliciousStepExecutor implements StepExecutor {
    constructor(private readonly decision: unknown) {}

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        return this.decision as AgentDecision;
    }
}

test("Coordinator 在任何副作用前拦截额外字段并无副作用失败（Req 6.2）", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const goal = createCoordinatorGoal("coord-extra-field");
    await store.save(goal);

    const maliciousResult = {
        kind: "question",
        question: "需要什么？",
        extraUnexpectedField: "malicious_payload",
    };
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new MaliciousPreparationExecutor(maliciousResult),
        scheduler: unusedScheduler,
        trajectoryStore,
    });

    const result = await coordinator.advance(createRef(goal));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_PHASE_RESULT");

    // 确认无副作用：Goal 快照未被更新、Trajectory 未写入任何事件
    const restored = await store.restore(goal.id);
    assert.deepEqual(restored, goal);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(events.length, 0);
});

test("Coordinator 在任何副作用前拦截缺失必填字段（Req 6.2）", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const goal = createCoordinatorGoal("coord-missing-field");
    await store.save(goal);

    // 缺失 question 字段
    const maliciousResult = {
        kind: "question",
    };
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new MaliciousPreparationExecutor(maliciousResult),
        scheduler: unusedScheduler,
        trajectoryStore,
    });

    const result = await coordinator.advance(createRef(goal));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_PHASE_RESULT");

    const restored = await store.restore(goal.id);
    assert.deepEqual(restored, goal);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(events.length, 0);
});

test("Coordinator 在任何副作用前拦截循环引用对象（Req 6.2）", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const goal = createCoordinatorGoal("coord-cyclic");
    await store.save(goal);

    const cyclic: Record<string, unknown> = {
        kind: "question",
        question: "循环？",
    };
    cyclic.self = cyclic;

    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new MaliciousPreparationExecutor(cyclic),
        scheduler: unusedScheduler,
        trajectoryStore,
    });

    const result = await coordinator.advance(createRef(goal));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_PHASE_RESULT");

    const restored = await store.restore(goal.id);
    assert.deepEqual(restored, goal);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(events.length, 0);
});

test("Coordinator 在任何副作用前拦截空白文本语义（Req 6.2）", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const goal = createCoordinatorGoal("coord-blank-string");
    await store.save(goal);

    const blankResult = {
        kind: "question",
        question: "   \t\n   ",
    };

    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new MaliciousPreparationExecutor(blankResult),
        scheduler: unusedScheduler,
        trajectoryStore,
    });

    const result = await coordinator.advance(createRef(goal));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_PHASE_RESULT");

    const restored = await store.restore(goal.id);
    assert.deepEqual(restored, goal);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(events.length, 0);
});

test("Coordinator 在任何副作用前拦截非法 Fact value（Req 2.5, Req 6.2）", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const goal = createCoordinatorGoal("coord-invalid-fact-value");
    await store.save(goal);

    // Fact value 是对象，违反 Req 2.5（必须为标量或一维标量数组）
    const invalidFactPatchResult = {
        kind: "context_ready",
        memoryPatch: {
            protocolVersion: 1,
            operations: [
                {
                    type: "upsert_fact",
                    fact: {
                        subject: "file",
                        predicate: "info",
                        value: { nested: "object" },
                        stability: "stable",
                        evidenceSequences: [1],
                    },
                },
            ],
        },
    };

    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new MaliciousPreparationExecutor(invalidFactPatchResult),
        scheduler: unusedScheduler,
        trajectoryStore,
    });

    const result = await coordinator.advance(createRef(goal));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "INVALID_PHASE_RESULT");

    const restored = await store.restore(goal.id);
    assert.deepEqual(restored, goal);
    const events = await trajectoryStore.read({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(events.length, 0);
});

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
