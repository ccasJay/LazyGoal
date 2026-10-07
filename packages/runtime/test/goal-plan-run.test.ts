import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createEmptyGoalPlan,
    createRun,
    createStepExecutor,
    reduceGoalPlan,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type GoalTask,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
    type ToolDefinition,
} from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { BaseTestStepExecutor, currentProtocols, InMemoryTrajectoryStore, trajectoryStoreFor } from "./current-fixtures";
import { contract } from "../../contracts/src/index";

const profile: AgentProfile = {
    id: "plan-run-profile",
    systemPrompt: "You execute one planned Todo at a time.",
    instructions: [],
    toolIds: [],
};

const task: GoalTask = {
    objective: "执行计划项",
    completionCriteria: [],
};

const OBSERVATION_TOOL_INPUT = contract.object({});
const OBSERVATION_TOOL_DEFINITION: ToolDefinition<typeof OBSERVATION_TOOL_INPUT> = {
    id: "record_observation",
    description: "产生可引用的当前 Run Observation",
    inputContract: OBSERVATION_TOOL_INPUT,
    isReadOnly: true,
};

const observationTool: Tool<typeof OBSERVATION_TOOL_INPUT> = {
    definition: OBSERVATION_TOOL_DEFINITION,
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    async execute() {
        return { kind: "success", output: { verified: true }, summary: "已生成验证 Observation" };
    },
};

class SequenceExecutor extends BaseTestStepExecutor {
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {
        super();
    }

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        const decision = this.decisions[this.index];
        this.index += 1;
        if (decision === undefined) throw new Error("unexpected executor call");
        return structuredClone(decision);
    }
}

class TodoCompletionExecutor extends BaseTestStepExecutor {
    private index = 0;

    constructor(private readonly trajectory: ReturnType<typeof trajectoryStoreFor>) {
        super();
    }

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1) {
            return {
                kind: "tool_call",
                action: { actionId: "observation-action", toolId: OBSERVATION_TOOL_DEFINITION.id, input: {} },
            };
        }
        if (this.index === 2) {
            const observations = this.trajectory.events.filter((candidate) =>
                candidate.goalId === goal.id
                && candidate.runId === goal.state.run.id
                && candidate.eventType === "observation_recorded");
            const event = observations[observations.length - 1];
            if (event === undefined) throw new Error("current Run Observation was not committed");
            return {
                kind: "goal_plan_update",
                baseRevision: goal.state.goalPlan?.revision ?? 0,
                operations: [
                    { type: "update", id: "todo-1", status: "in_progress" },
                    {
                        type: "update",
                        id: "todo-1",
                        status: "completed",
                        evidenceSequences: [event.sequence],
                    },
                ],
            };
        }
        return { kind: "complete", summary: "Run 已完成", completionEvidence: [] };
    }
}

class MultiTodoExecutor extends BaseTestStepExecutor {
    private index = 0;

    constructor(private readonly trajectory: ReturnType<typeof trajectoryStoreFor>) {
        super();
    }

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.index += 1;
        if (this.index === 1 || this.index === 3) {
            return {
                kind: "tool_call",
                action: {
                    actionId: `observation-action-${this.index}`,
                    toolId: OBSERVATION_TOOL_DEFINITION.id,
                    input: {},
                },
            };
        }
        if (this.index === 2 || this.index === 4) {
            const observations = this.trajectory.events.filter((candidate) =>
                candidate.goalId === goal.id
                && candidate.runId === goal.state.run.id
                && candidate.eventType === "observation_recorded");
            const event = observations[observations.length - 1];
            if (event === undefined) throw new Error("current Run Observation was not committed");
            const id = this.index === 2 ? "todo-1" : "todo-2";
            return {
                kind: "goal_plan_update",
                baseRevision: goal.state.goalPlan?.revision ?? 0,
                operations: [
                    { type: "update", id, status: "in_progress" },
                    { type: "update", id, status: "completed", evidenceSequences: [event.sequence] },
                ],
            };
        }
        if (this.index === 5) {
            return { kind: "complete", summary: "两个计划项均已完成", completionEvidence: [] };
        }
        throw new Error("unexpected executor call");
    }
}

function withObservationTool(goal: Goal): Goal {
    return {
        ...goal,
        definition: {
            ...goal.definition,
            profile: { ...goal.definition.profile, toolIds: [OBSERVATION_TOOL_DEFINITION.id] },
        },
        state: {
            ...goal.state,
            run: { ...goal.state.run, exposedToolIds: [OBSERVATION_TOOL_DEFINITION.id] },
        },
    };
}

function planGoal(
    runStatus: "running" | "created" = "running",
    decisionTask: GoalTask | undefined = task,
): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: "plan-run-goal",
        intent: "执行计划",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        mode: "plan",
    });
    const added = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [{ type: "add", content: "执行计划项" }],
    }, { idFactory: () => "todo-1" });
    if (!added.ok) throw new Error(added.error.message);
    const run = runStatus === "running"
        ? transition(createRun("run-1", "plan"), { kind: "start" })
        : { ok: true as const, state: createRun("run-1", "plan") };
    if (!run.ok) throw new Error(run.error.message);
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            goalPlan: added.plan,
            run: {
                ...run.state,
                ...(decisionTask === undefined ? {} : { approvedTask: decisionTask }),
            },
        },
    };
}

function emptyPlanGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "plan-update-goal",
        intent: "维护计划",
        promptBundleVersion: 1,
        profile,
        runId: "run-plan-update",
        mode: "plan",
    });
}

test("首次成功 GoalPlan Patch 才创建计划，并作为非终态 Step 持久化", async () => {
    const store = new InMemoryGoalStore();
    const created = emptyPlanGoal();
    const initial = {
        ...created,
        state: {
            ...created.state,
            run: createRun("run-plan-update", "plan"),
        },
    };
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new SequenceExecutor([
            {
                kind: "goal_plan_update",
                baseRevision: 0,
                operations: [{ type: "add", content: "先建立清单" }],
            },
            {
                kind: "task_proposal",
                task: { objective: "执行当前计划请求", completionCriteria: [{ text: "请求已完成" }] },
                approvalRequest: "请批准执行目标",
            },
        ]),
    });

    const result = await runner.run({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    assert.equal(result.state.stepCount, 1);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.mode, "plan");
    assert.equal(saved?.state.run.pendingInteraction?.kind, "task_approval");
    assert.deepEqual(saved?.state.goalPlan, {
        revision: 1,
        items: [{ id: "todo-1-1", content: "先建立清单", position: 0, status: "pending" }],
    });
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "run_started",
        "state_committed",
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "goal_plan_updated",
        "state_committed",
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "run_waiting",
        "state_committed",
    ]);
});

test("首次失败 GoalPlan Patch 不创建计划", async () => {
    const store = new InMemoryGoalStore();
    const initial = emptyPlanGoal();
    await store.save(initial);
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceExecutor([{
            kind: "goal_plan_update",
            baseRevision: 0,
            operations: [{ type: "reorder", id: "unknown-todo", position: 0 }],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan, undefined);
});

test("当前 Run 完成后，GoalPlan Todo 状态独立保留", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new SequenceExecutor([{
            kind: "complete",
            summary: "计划项已完成",
            completionEvidence: [],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.status, "completed");
    assert.deepEqual(saved?.state.goalPlan?.items, [{
        id: "todo-1",
        content: "执行计划项",
        position: 0,
        status: "pending",
    }]);
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "model_repair_attempt_started",
        "state_committed",
        "decision_received",
        "run_completed",
        "context_epoch_closed",
        "memory_patch_accepted",
        "state_committed",
    ]);
});

test("同一 Run 可以依次完成多个 Todo，计划更新不会结束或创建 Run", async () => {
    const store = new InMemoryGoalStore();
    const created = withObservationTool(planGoal());
    const added = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [
            { type: "add", content: "完成第一个计划项" },
            { type: "add", content: "完成第二个计划项" },
        ],
    }, { idFactory: (ordinal) => `todo-${ordinal}` });
    if (!added.ok) throw new Error(added.error.message);
    const initial: Goal = {
        ...created,
        state: { ...created.state, goalPlan: added.plan },
    };
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry: new InMemoryToolRegistry([createToolRegistration(observationTool)]),
        executor: new MultiTodoExecutor(trajectory),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 5);
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.run.id, "run-1");
    assert.equal(saved?.state.run.status, "completed");
    assert.deepEqual(saved?.state.goalPlan?.items.map(({ id, status }) => ({ id, status })), [
        { id: "todo-1", status: "completed" },
        { id: "todo-2", status: "completed" },
    ]);
    assert.equal(trajectory.events.filter((event) => event.eventType === "run_created").length, 0);
    assert.ok(trajectory.events.every((event) => event.runId === "run-1"));
});

test("GoalPlan 提交遇到 Snapshot 或 Trajectory 故障时停在最后有效边界", async () => {
    for (const failingBoundary of ["snapshot", "trajectory"] as const) {
        const store = new InMemoryGoalStore();
        const initial = withObservationTool(planGoal());
        await store.save(initial);
        const originalSave = store.save.bind(store);
        const saveError = new Error("goal plan snapshot failed");
        store.save = async (goal) => {
            if (failingBoundary === "snapshot" && goal.state.goalPlan?.revision === 2) {
                throw saveError;
            }
            await originalSave(goal);
        };

        const trajectory = new InMemoryTrajectoryStore();
        const originalAppend = trajectory.append.bind(trajectory);
        trajectory.append = async (draft) => {
            if (failingBoundary === "trajectory" && draft.eventType === "goal_plan_updated") {
                throw new Error("goal plan trajectory append failed");
            }
            return originalAppend(draft);
        };

        let modelCalls = 0;
        let toolCalls = 0;
        const countingTool: Tool<typeof OBSERVATION_TOOL_INPUT> = {
            ...observationTool,
            async execute() {
                toolCalls += 1;
                return { kind: "success", output: "unexpected", summary: "unexpected tool call" };
            },
        };
        const executor: StepExecutor = createStepExecutor(async (): Promise<AgentDecision> => {
            modelCalls += 1;
            return modelCalls === 1
                ? {
                    kind: "goal_plan_update",
                    baseRevision: initial.state.goalPlan!.revision,
                    operations: [{ type: "update", id: "todo-1", content: "提交后的内容" }],
                }
                : {
                    kind: "tool_call",
                    action: {
                        actionId: "must-not-run",
                        toolId: OBSERVATION_TOOL_DEFINITION.id,
                        input: {},
                    },
                };
        }, async () => ({ kind: "accept" }));

        await assert.rejects(
            () => new Runner({
                store,
                trajectoryStore: trajectory,
                toolRegistry: new InMemoryToolRegistry([createToolRegistration(countingTool)]),
                executor,
            }).run({ goalId: initial.id, runId: initial.state.run.id }),
            failingBoundary === "snapshot" ? saveError : /goal plan trajectory append failed/,
        );

        assert.equal(modelCalls, 1);
        assert.equal(toolCalls, 0);
        const interrupted = await store.restore(initial.id);
        assert.equal(interrupted?.state.run.status, "running");
        assert.equal(interrupted?.state.run.stepCount, 0);
        assert.equal(interrupted?.state.run.pendingModelRepair?.attemptsStarted, 1);
        assert.equal(trajectory.events.some((event) => event.eventType === "state_committed"), true);
        assert.equal(
            trajectory.events.some((event) => event.eventType === "goal_plan_updated"),
            failingBoundary === "snapshot",
        );
    }
});

test("失败 Run 不隐式改变 GoalPlan Todo", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceExecutor([{ kind: "fail", error: "执行失败" }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.deepEqual(saved?.state.goalPlan?.items, [{
        id: "todo-1",
        content: "执行计划项",
        position: 0,
        status: "pending",
    }]);
});

test("GoalPlan Patch 缺少完成证据时拒绝且不改变 Todo", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const result = await new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new SequenceExecutor([{
            kind: "goal_plan_update",
            baseRevision: initial.state.goalPlan!.revision,
            operations: [{ type: "update", id: "todo-1", status: "completed" }],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan?.items[0]?.status, "pending");
});

test("GoalPlan Todo 可以引用当前 Run 已提交 Observation 完成", async () => {
    const store = new InMemoryGoalStore();
    const initial = withObservationTool(planGoal());
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry: new InMemoryToolRegistry([createToolRegistration(observationTool)]),
        executor: new TodoCompletionExecutor(trajectory),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan?.items[0]?.status, "completed");
    const recordedObservation = trajectory.events.find((event) =>
        event.runId === initial.state.run.id && event.eventType === "observation_recorded");
    const updateFact = trajectory.events.find((event) => event.eventType === "goal_plan_updated");
    assert.ok(recordedObservation);
    assert.ok(updateFact);
    if (updateFact?.payload.type === "goal_plan_updated") {
        assert.deepEqual(updateFact.payload.operations[1], {
            type: "update",
            id: "todo-1",
            status: "completed",
            evidenceSequences: [recordedObservation.sequence],
        });
    }
});

test("旧 Run 的 Observation 不能让 GoalPlan Patch 部分生效", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    const oldObservation = await trajectory.append({
        goalId: initial.id,
        runId: "run-old",
        phase: "executing",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "old-action",
            observation: { kind: "success", output: "旧结果", summary: "旧 Run 结果" },
        },
    });
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new SequenceExecutor([{
            kind: "goal_plan_update",
            baseRevision: initial.state.goalPlan!.revision,
            operations: [
                { type: "update", id: "todo-1", status: "in_progress" },
                {
                    type: "update",
                    id: "todo-1",
                    status: "completed",
                    evidenceSequences: [oldObservation.sequence],
                },
            ],
        }]),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan?.revision, initial.state.goalPlan?.revision);
    assert.equal(saved?.state.goalPlan?.items[0]?.status, "pending");
});

test("未提交 Observation 不能让 GoalPlan Patch 部分生效", async () => {
    const store = new InMemoryGoalStore();
    const initial = planGoal();
    await store.save(initial);
    const trajectory = trajectoryStoreFor(store);
    class UncommittedEvidenceExecutor extends BaseTestStepExecutor {
        constructor() {
            super();
        }
        async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
            const event = await trajectory.append({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "observation_recorded",
                payload: {
                    type: "observation_recorded",
                    actionId: "uncommitted-action",
                    observation: { kind: "success", output: "tail", summary: "未提交结果" },
                },
            });
            return {
                kind: "goal_plan_update",
                baseRevision: goal.state.goalPlan?.revision ?? 0,
                operations: [
                    { type: "update", id: "todo-1", status: "in_progress" },
                    {
                        type: "update",
                        id: "todo-1",
                        status: "completed",
                        evidenceSequences: [event.sequence],
                    },
                ],
            };
        }
    }

    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor: new UncommittedEvidenceExecutor(),
    }).run({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    const saved = await store.restore(initial.id);
    assert.equal(saved?.state.goalPlan?.revision, initial.state.goalPlan?.revision);
    assert.equal(saved?.state.goalPlan?.items[0]?.status, "pending");
});
