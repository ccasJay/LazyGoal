import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";
import type {
    AgentProfile,
    Goal,
    GoalProgressResult,
    GoalStore,
    PreparationExecutionInput,
    PreparationExecutor,
    PreparationResult,
    RunnerResult,
    RunExecutionOptions,
    RunInput,
    RunRef,
    RunScheduler,
    RunState,
    StepExecutor,
    Tool,
    ToolDefinition,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

function createTool(definition: ToolDefinition): Tool {
    return {
        definition,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            return { kind: "success", output: null, summary: "完成" };
        },
    };
}

type PreparationAction =
    | PreparationResult
    | ((goal: Goal) => PreparationResult | Promise<PreparationResult>);

class FakePreparationExecutor implements PreparationExecutor {
    readonly receivedGoals: Goal[] = [];
    readonly receivedTools: ToolDefinition[][] = [];

    constructor(
        private readonly actions: readonly PreparationAction[],
        private readonly events: string[] = [],
    ) {}

    async execute({ goal, authorizedTools }: PreparationExecutionInput): Promise<PreparationResult> {
        const action = this.actions[this.receivedGoals.length];
        this.receivedGoals.push(goal);
        this.receivedTools.push(structuredClone([...authorizedTools]));
        this.events.push(`execute:${goal.state.workflow.phase}`);

        if (action === undefined) {
            throw new Error("Unexpected PreparationExecutor call");
        }

        return typeof action === "function" ? action(goal) : action;
    }
}

class RecordingGoalStore implements GoalStore {
    readonly savedGoals: Goal[] = [];
    private readonly delegate = new InMemoryGoalStore();

    constructor(
        private readonly events: string[] = [],
        private readonly saveFailure?: { readonly call: number; readonly error: Error },
    ) {}

    async seed(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
    }

    async save(goal: Goal): Promise<void> {
        const call = this.savedGoals.length + 1;
        this.events.push(`save:${goal.state.workflow.phase}`);

        if (this.saveFailure?.call === call) {
            throw this.saveFailure.error;
        }

        this.savedGoals.push(structuredClone(goal));
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        this.events.push(`restore:${goalId}`);
        return this.delegate.restore(goalId);
    }
}

class FakeScheduler implements RunScheduler {
    readonly receivedRefs: RunRef[] = [];
    readonly receivedOptions: (RunExecutionOptions | undefined)[] = [];

    constructor(
        private readonly scheduleAction: (
            ref: RunRef,
            options?: RunExecutionOptions,
        ) => Promise<RunnerResult>,
        private readonly events: string[] = [],
    ) {}

    async schedule(
        ref: RunRef,
        options?: RunExecutionOptions,
    ): Promise<RunnerResult> {
        this.receivedRefs.push(ref);
        this.receivedOptions.push(options);
        this.events.push(`schedule:${ref.goalId}`);
        return this.scheduleAction(ref, options);
    }
}

function createPreparationGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Build a resumable workflow",
        profile,
        runId: "run-1",
    });
}

function createGatheringWaitingGoal(): Goal {
    const goal = createPreparationGoal();

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Which database should be used?",
                },
            ],
        },
    };
}

function createPlanningWaitingGoal(
    proposal = {
        objective: "Implement persistence",
        completionCriteria: ["Snapshots can be restored"],
    },
): Goal {
    const goal = createPreparationGoal();

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal,
                },
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Approve the persistence task?",
                },
            ],
        },
    };
}

function createExecutingWaitingGoal(): Goal {
    const goal = createExecutingGoal({
        id: "goal-blocked-resume",
        objective: "Deploy release",
        completionCriteria: ["Deployed"],
        profile,
        runId: "run-blocked-resume",
    });
    const waitingRun = applyRunTransition(
        applyRunTransition(goal.state.run, { kind: "start" }),
        {
            kind: "decision",
            decision: {
                kind: "wait",
                reason: "Production permission required",
            },
        },
    );

    return {
        ...goal,
        state: {
            ...goal.state,
            messages: [
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Production permission required",
                },
            ],
            run: waitingRun,
        },
    };
}

function createActionApprovalGoal(): Goal {
    const goal = createExecutingGoal({
        id: "goal-action-approval",
        objective: "Read a protected file",
        completionCriteria: [],
        profile: { ...profile, toolIds: ["read_file"] },
        runId: "run-action-approval",
    });
    const waitingRun = applyRunTransition(
        applyRunTransition(goal.state.run, { kind: "start" }),
        {
            kind: "stage_action",
            status: "awaiting_approval",
            action: {
                actionId: "action-approval",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
    );

    return {
        ...goal,
        state: { ...goal.state, run: waitingRun },
    };
}

function createActionRecoveryGoal(): Goal {
    const approval = createActionApprovalGoal();
    const approvedRun = applyRunTransition(approval.state.run, {
        kind: "approve_action",
        actionId: "action-approval",
    });
    const recoveredRun = applyRunTransition(approvedRun, {
        kind: "recover_action",
        actionId: "action-approval",
    });

    return {
        ...approval,
        state: { ...approval.state, run: recoveredRun },
    };
}

function createApprovedActionGoal(): Goal {
    const approval = createActionApprovalGoal();
    const approvedRun = applyRunTransition(approval.state.run, {
        kind: "approve_action",
        actionId: "action-approval",
    });

    return {
        ...approval,
        state: { ...approval.state, run: approvedRun },
    };
}

function createUnusedScheduler(): RunScheduler {
    return new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
}

function requireSuccess(
    result: GoalProgressResult,
): Extract<GoalProgressResult, { readonly ok: true }> {
    if (!result.ok) {
        assert.fail(`Expected success, received ${result.error.code}`);
    }

    return result;
}

function requireFailure(
    result: GoalProgressResult,
): Extract<GoalProgressResult, { readonly ok: false }> {
    if (result.ok) {
        assert.fail("Expected a GoalCoordinator failure");
    }

    return result;
}

function applyRunTransition(
    state: RunState,
    input: RunInput,
): RunState {
    const result = transition(state, input);

    if (!result.ok) {
        assert.fail(result.error.message);
    }

    return result.state;
}

function createExecutingGoal(
    input: {
        readonly id: string;
        readonly objective: string;
        readonly completionCriteria: readonly string[];
        readonly profile: typeof profile;
        readonly runId: string;
    },
): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: input.id,
        intent: input.objective,
        profile: input.profile,
        runId: input.runId,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: input.objective,
                    completionCriteria: [...input.completionCriteria],
                },
            },
            messages: [],
        },
    };
}

test("persists a gathering question as a real assistant message without consuming a Step", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const executor = new FakePreparationExecutor([
        { kind: "question", question: "Which database should be used?" },
    ]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "gathering_context");
    assert.equal(result.waitingFor, "question");
    assert.deepEqual(result.goal.state.workflow, {
        phase: "gathering_context",
        preparation: { status: "waiting_input" },
    });
    assert.equal(result.goal.state.run.status, initial.state.run.status);
    assert.equal(result.goal.state.run.stepCount, initial.state.run.stepCount);
    assert.deepEqual(result.goal.state.run.contextEpoch, initial.state.run.contextEpoch);
    assert.ok(result.goal.state.run.committedThroughSequence > initial.state.run.committedThroughSequence);
    assert.deepEqual(result.goal.state.messages, [
        { role: "user", content: "Build a resumable workflow" },
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "Which database should be used?",
        },
    ]);
    assert.deepEqual(store.savedGoals, [result.goal]);
});

test("saves planning before the next model call and persists the complete proposal", async () => {
    const events: string[] = [];
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(initial);
    events.length = 0;
    const task = {
        objective: "Implement GoalCoordinator",
        completionCriteria: ["Questions are persisted", "Execution is delegated"],
    } as const;
    const executor = new FakePreparationExecutor([
        { kind: "context_ready" },
        (goal) => {
            assert.equal(goal.state.workflow.phase, "planning");
            assert.equal(goal.state.run.stepCount, 0);
            return {
                kind: "task_proposal",
                task,
                approvalRequest: "Approve this task?",
            };
        },
    ], events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.deepEqual(events, [
        "restore:goal-1",
        "execute:gathering_context",
        "save:planning",
        "execute:planning",
        "save:planning",
    ]);
    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "planning");
    assert.equal(result.waitingFor, "approval");
    assert.deepEqual(result.goal.state.workflow, {
        phase: "planning",
        preparation: {
            status: "waiting_approval",
            proposal: task,
        },
    });
    assert.deepEqual(result.goal.state.messages.at(-1), {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: [
            "Objective: Implement GoalCoordinator",
            "Completion criteria:",
            "1. Questions are persisted",
            "2. Execution is delegated",
            "Approval request: Approve this task?",
        ].join("\n"),
    });
    assert.equal(result.goal.state.run.status, initial.state.run.status);
    assert.equal(result.goal.state.run.stepCount, initial.state.run.stepCount);
    assert.deepEqual(result.goal.state.run.contextEpoch, initial.state.run.contextEpoch);
    assert.ok(result.goal.state.run.committedThroughSequence > initial.state.run.committedThroughSequence);
    assert.deepEqual(store.savedGoals.at(-1), result.goal);
    assert.deepEqual(executor.receivedTools, [[], []]);
});

test("planning 只接收 Profile 授权且 Registry 已注册的 ToolDefinition 副本", async () => {
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-planning-tools",
        intent: "规划可验证任务",
        profile: {
            ...profile,
            toolIds: ["write_file", "missing", "read_file"],
        },
        runId: "run-planning-tools",
    });
    const planning: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
    const store = new RecordingGoalStore();
    await store.seed(planning);
    const readDefinition: ToolDefinition = {
        id: "read_file",
        description: "读取文件",
        inputSchema: { type: "object", properties: { path: { type: "string" } } },
    };
    const writeDefinition: ToolDefinition = {
        id: "write_file",
        description: "写入文件",
        inputSchema: { type: "object" },
    };
    const tools = new Map<string, Tool>([
        ["read_file", createTool(readDefinition)],
        ["write_file", createTool(writeDefinition)],
        ["not_authorized", createTool({
            id: "not_authorized",
            description: "未授权",
            inputSchema: { type: "object" },
        })],
    ]);
    const executor = new FakePreparationExecutor([{
        kind: "task_proposal",
        task: { objective: "完成规划", completionCriteria: ["有可验证证据"] },
        approvalRequest: "Approve?",
    }]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: { get: (toolId) => tools.get(toolId) },
    });

    await coordinator.advance({ goalId: planning.id, runId: planning.state.run.id });

    assert.deepEqual(executor.receivedTools, [[writeDefinition, readDefinition]]);
    assert.notStrictEqual(executor.receivedTools[0]?.[0], writeDefinition);
    assert.notStrictEqual(
        executor.receivedTools[0]?.[0]?.inputSchema,
        writeDefinition.inputSchema,
    );
});

test("planning ToolDefinition 解析失败时不调用 Executor、不追加消息或保存", async () => {
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-planning-registry-error",
        intent: "规划失败边界",
        profile: { ...profile, toolIds: ["read_file"] },
        runId: "run-planning-registry-error",
    });
    const planning: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
        },
    };
    const store = new RecordingGoalStore();
    await store.seed(planning);
    const executor = new FakePreparationExecutor([]);
    const registryError = new Error("registry unavailable");
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
        toolRegistry: { get: () => { throw registryError; } },
    });

    await assert.rejects(
        coordinator.advance({ goalId: planning.id, runId: planning.state.run.id }),
        (error: unknown) => error === registryError,
    );
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual((await store.restore(planning.id))?.state.messages, planning.state.messages);
});

test("stops before the planning call when saving the phase transition fails", async () => {
    const saveError = new Error("save failed");
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore([], { call: 1, error: saveError });
    await store.seed(initial);
    const executor = new FakePreparationExecutor([
        { kind: "context_ready" },
        {
            kind: "task_proposal",
            task: { objective: "Must not run", completionCriteria: [] },
            approvalRequest: "Must not run",
        },
    ]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    await assert.rejects(
        () => coordinator.advance({ goalId: "goal-1", runId: "run-1" }),
        (error: unknown) => {
            assert.strictEqual(error, saveError);
            return true;
        },
    );
    assert.equal(executor.receivedGoals.length, 1);

    const persisted = await store.restore(initial.id);
    assert.deepEqual(persisted, initial);
});

test("rejects a Preparation result that does not match the current phase without saving", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const invalidResult = {
        kind: "task_proposal",
        task: { objective: "Invalid", completionCriteria: [] },
        approvalRequest: "Invalid",
    } as const;
    const executor = new FakePreparationExecutor([invalidResult]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireFailure(await coordinator.advance({
        goalId: initial.id,
        runId: initial.state.run.id,
    }));

    assert.equal(result.error.code, "INVALID_PHASE_RESULT");
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(await store.restore(initial.id), initial);
});

test("returns an existing preparation waiting point without executing or saving", async () => {
    const initial = createPreparationGoal();
    const waiting: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const store = new RecordingGoalStore();
    await store.seed(waiting);
    const executor = new FakePreparationExecutor([]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: waiting.id,
        runId: waiting.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.deepEqual(result.goal, waiting);
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(store.savedGoals, []);
});

test("delegates an executing Goal and returns the latest persisted terminal snapshot", async () => {
    const executing = createExecutingGoal({
        id: "goal-executing",
        objective: "Execute",
        completionCriteria: ["Done"],
        profile,
        runId: "run-executing",
    });
    const store = new RecordingGoalStore();
    await store.seed(executing);
    const completedRun = applyRunTransition(
        applyRunTransition(executing.state.run, { kind: "start" }),
        {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "Done",
            },
        },
    );
    const completedGoal: Goal = {
        ...executing,
        state: { ...executing.state, run: completedRun },
    };
    const scheduler = new FakeScheduler(async () => {
        await store.save(completedGoal);
        return { ok: true, state: completedRun };
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: executing.id,
        runId: executing.state.run.id,
    }));

    assert.equal(result.kind, "terminal");
    assert.deepEqual(result.goal, completedGoal);
    assert.deepEqual(scheduler.receivedRefs, [
        { goalId: "goal-executing", runId: "run-executing" },
    ]);
});

test("returns an executing blocked Goal without scheduling it again", async () => {
    const executing = createExecutingGoal({
        id: "goal-blocked",
        objective: "Execute",
        completionCriteria: [],
        profile,
        runId: "run-blocked",
    });
    const waitingRun = applyRunTransition(
        applyRunTransition(executing.state.run, { kind: "start" }),
        {
            kind: "decision",
            decision: {
                kind: "wait",
                reason: "Permission required",
            },
        },
    );
    const blockedGoal: Goal = {
        ...executing,
        state: { ...executing.state, run: waitingRun },
    };
    const store = new RecordingGoalStore();
    await store.seed(blockedGoal);
    const scheduler = new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: blockedGoal.id,
        runId: blockedGoal.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "executing");
    assert.equal(result.waitingFor, "blocked");
    assert.deepEqual(result.goal, blockedGoal);
    assert.deepEqual(scheduler.receivedRefs, []);
});

test("exposes Action approval as a distinct executing waiting type", async () => {
    const waiting = createActionApprovalGoal();
    const store = new RecordingGoalStore();
    await store.seed(waiting);
    const scheduler = new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.advance({
        goalId: waiting.id,
        runId: waiting.state.run.id,
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "executing");
    assert.equal(result.waitingFor, "action_approval");
    assert.deepEqual(result.goal, waiting);
    assert.deepEqual(scheduler.receivedRefs, []);
});

test("saves Action approval before scheduling the matching transient authorization", async () => {
    const events: string[] = [];
    const waiting = createActionApprovalGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const scheduler = new FakeScheduler(async (ref, options) => {
        assert.deepEqual(options, { authorizedActionId: "action-approval" });
        const approved = await store.restore(ref.goalId);
        assert.ok(approved);
        assert.equal(approved.state.run.status, "running");
        assert.equal(approved.state.run.stepCount, 0);
        assert.deepEqual(approved.state.run.pendingAction, {
            action: waiting.state.run.pendingAction?.action,
            status: "approved",
        });

        const observedRun = applyRunTransition(approved.state.run, {
            kind: "observe_action",
            actionId: "action-approval",
            observation: {
                kind: "success",
                output: "文件内容",
                summary: "读取完成",
            },
        });
        const completedRun = applyRunTransition(observedRun, {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "任务完成",
            },
        });
        await store.save({
            ...approved,
            state: { ...approved.state, run: completedRun },
        });
        return { ok: true, state: completedRun };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "approve_action", actionId: "action-approval" },
    }));

    assert.equal(result.kind, "terminal");
    assert.equal(result.goal.state.run.stepCount, 2);
    assert.deepEqual(result.goal.state.messages, waiting.state.messages);
    assert.deepEqual(scheduler.receivedOptions, [
        { authorizedActionId: "action-approval" },
    ]);
    assert.ok(
        events.indexOf("save:executing") < events.indexOf("schedule:goal-action-approval"),
    );
});

test("reject_action completes a rejected Observation and continues without a message", async () => {
    const events: string[] = [];
    const waiting = createActionApprovalGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const scheduler = new FakeScheduler(async (ref, options) => {
        assert.equal(options, undefined);
        const rejected = await store.restore(ref.goalId);
        assert.ok(rejected);
        assert.equal(rejected.state.run.stepCount, 1);
        assert.equal(rejected.state.run.pendingAction, undefined);
        assert.deepEqual(rejected.state.run.lastStep, {
            kind: "action",
            action: waiting.state.run.pendingAction?.action,
            observation: {
                kind: "rejected",
                reason: "用户拒绝读取",
            },
        });
        assert.deepEqual(rejected.state.messages, waiting.state.messages);

        const completedRun = applyRunTransition(rejected.state.run, {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "任务完成",
            },
        });
        await store.save({
            ...rejected,
            state: { ...rejected.state, run: completedRun },
        });
        return { ok: true, state: completedRun };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: {
            kind: "reject_action",
            actionId: "action-approval",
            reason: "用户拒绝读取",
        },
    }));

    assert.equal(result.kind, "terminal");
    assert.equal(result.goal.state.run.stepCount, 2);
    assert.deepEqual(result.goal.state.messages, waiting.state.messages);
    assert.deepEqual(scheduler.receivedOptions, [undefined]);
});

test("allows re-approval of manual recovery and preserves the Action identity", async () => {
    const recovery = createActionRecoveryGoal();
    const store = new RecordingGoalStore();
    await store.seed(recovery);
    const scheduler = new FakeScheduler(async (ref, options) => {
        assert.deepEqual(options, { authorizedActionId: "action-approval" });
        const approved = await store.restore(ref.goalId);
        assert.ok(approved);
        assert.equal(approved.state.run.status, "running");
        assert.equal(approved.state.run.stepCount, 0);
        assert.equal(
            approved.state.run.pendingAction?.action.actionId,
            "action-approval",
        );

        const observedRun = applyRunTransition(approved.state.run, {
            kind: "observe_action",
            actionId: "action-approval",
            observation: {
                kind: "success",
                output: "恢复后内容",
                summary: "恢复读取完成",
            },
        });
        const completedRun = applyRunTransition(observedRun, {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "任务完成",
            },
        });
        await store.save({
            ...approved,
            state: { ...approved.state, run: completedRun },
        });
        return { ok: true, state: completedRun };
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const waiting = requireSuccess(await coordinator.advance({
        goalId: recovery.id,
        runId: recovery.state.run.id,
    }));
    assert.equal(waiting.kind, "waiting");
    assert.equal(waiting.waitingFor, "action_recovery");

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: recovery.id, runId: recovery.state.run.id },
        action: { kind: "approve_action", actionId: "action-approval" },
    }));

    assert.equal(result.kind, "terminal");
    assert.equal(result.goal.state.run.stepCount, 2);
    assert.deepEqual(result.goal.state.messages, recovery.state.messages);
});

test("Coordinator 与 Runner 协作恢复 manual Action 后等待重新批准", async () => {
    const interrupted = createApprovedActionGoal();
    const store = new InMemoryGoalStore();
    await store.save(interrupted);
    let executedActionId: string | undefined;
    const manualTool: Tool = {
        definition: {
            id: "read_file",
            description: "需要人工确认的读取 Tool",
            inputSchema: { type: "object" },
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute(request) {
            executedActionId = request.actionId;
            return {
                kind: "success",
                output: "人工确认后的内容",
                summary: "读取完成",
            };
        },
    };
    const executor: StepExecutor = {
        async execute() {
            return {
                kind: "complete",
                completionEvidence: [],
                summary: "任务完成",
            };
        },
    };
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler: new InlineScheduler(new Runner({
        trajectoryStore: trajectoryStoreFor(store),
            store,
            executor,
            toolRegistry: { get: () => manualTool },
        })),
    });
    const ref = { goalId: interrupted.id, runId: interrupted.state.run.id };

    const recovery = requireSuccess(await coordinator.advance(ref));
    assert.equal(recovery.kind, "waiting");
    assert.equal(recovery.waitingFor, "action_recovery");
    assert.equal(executedActionId, undefined);

    const completed = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "approve_action", actionId: "action-approval" },
    }));
    assert.equal(completed.kind, "terminal");
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.stepCount, 2);
    assert.equal(executedActionId, "action-approval");
});

test("rejects Action controls with the wrong waiting type or actionId without side effects", async () => {
    const actions = [
        { kind: "message", content: "直接继续" },
        { kind: "approve" },
        { kind: "approve_action", actionId: "action-other" },
        {
            kind: "reject_action",
            actionId: "action-other",
            reason: "拒绝",
        },
    ] as const;

    for (const action of actions) {
        const waiting = createActionApprovalGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const scheduler = new FakeScheduler(async () => {
            throw new Error("Unexpected Scheduler call");
        });
        const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
            store,
            preparationExecutor: new FakePreparationExecutor([]),
            scheduler,
        });

        const result = requireFailure(await coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action,
        }));

        assert.equal(result.error.code, "INVALID_GOAL_INPUT");
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(scheduler.receivedRefs, []);
        assert.deepEqual(await store.restore(waiting.id), waiting);
    }
});

test("returns RUN_NOT_FOUND for a missing Goal or mismatched runId", async () => {
    const initial = createPreparationGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler: createUnusedScheduler(),
    });

    for (const ref of [
        { goalId: "missing", runId: "run-1" },
        { goalId: "goal-1", runId: "other-run" },
    ]) {
        const result = requireFailure(await coordinator.advance(ref));
        assert.equal(result.error.code, "RUN_NOT_FOUND");
    }
});

test("saves a gathering answer before continuing and preserves its original text", async () => {
    const events: string[] = [];
    const waiting = createGatheringWaitingGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const executor = new FakePreparationExecutor([
        { kind: "question", question: "Which region should be used?" },
    ], events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "message", content: "  PostgreSQL  " },
    }));

    assert.deepEqual(events, [
        "restore:goal-1",
        "save:gathering_context",
        "restore:goal-1",
        "execute:gathering_context",
        "save:gathering_context",
    ]);
    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "gathering_context");
    assert.deepEqual(result.goal.state.messages.slice(-2), [
        { role: "user", content: "  PostgreSQL  " },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: "Which region should be used?",
        },
    ]);
    assert.equal(result.goal.state.run.status, waiting.state.run.status);
    assert.equal(result.goal.state.run.stepCount, waiting.state.run.stepCount);
    assert.deepEqual(result.goal.state.run.contextEpoch, waiting.state.run.contextEpoch);
    assert.ok(result.goal.state.run.committedThroughSequence > waiting.state.run.committedThroughSequence);
    assert.equal(executor.receivedGoals[0]?.state.workflow.phase, "gathering_context");
    assert.deepEqual(executor.receivedGoals[0]?.state.messages.at(-1), {
        role: "user",
        content: "  PostgreSQL  ",
    });
});

test("saves planning feedback without the current proposal before replanning", async () => {
    const events: string[] = [];
    const waiting = createPlanningWaitingGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const revisedTask = {
        objective: "Implement encrypted persistence",
        completionCriteria: ["Snapshots are encrypted and restorable"],
    } as const;
    const executor = new FakePreparationExecutor([
        (goal) => {
            assert.deepEqual(goal.state.workflow, {
                phase: "planning",
                preparation: { status: "active" },
            });
            assert.deepEqual(goal.state.messages.at(-1), {
                role: "user",
                content: "Encrypt snapshots at rest",
            });
            return {
                kind: "task_proposal",
                task: revisedTask,
                approvalRequest: "Approve the revised task?",
            };
        },
    ], events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "message", content: "Encrypt snapshots at rest" },
    }));

    assert.deepEqual(events, [
        "restore:goal-1",
        "save:planning",
        "restore:goal-1",
        "execute:planning",
        "save:planning",
    ]);
    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "planning");
    assert.deepEqual(result.goal.state.workflow, {
        phase: "planning",
        preparation: {
            status: "waiting_approval",
            proposal: revisedTask,
        },
    });
    assert.equal(result.goal.state.run.status, waiting.state.run.status);
    assert.equal(result.goal.state.run.stepCount, waiting.state.run.stepCount);
    assert.deepEqual(result.goal.state.run.contextEpoch, waiting.state.run.contextEpoch);
    assert.ok(result.goal.state.run.committedThroughSequence > waiting.state.run.committedThroughSequence);
});

test("saves an approved proposal as the final task before scheduling execution", async () => {
    const events: string[] = [];
    const proposal = {
        objective: "Implement persistence",
        completionCriteria: ["Snapshots can be restored"],
    };
    const waiting = createPlanningWaitingGoal(proposal);
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const scheduler = new FakeScheduler(async (ref) => {
        const approved = await store.restore(ref.goalId);
        assert.ok(approved);
        assert.deepEqual(approved.state.workflow, {
            phase: "executing",
            preparation: { status: "completed" },
            task: proposal,
        });
        assert.deepEqual(approved.state.messages, waiting.state.messages);

        const completedRun = applyRunTransition(
            applyRunTransition(approved.state.run, { kind: "start" }),
            {
                kind: "decision",
                decision: {
                    kind: "complete",
                    completionEvidence: [],
                    summary: "Done",
                },
            },
        );
        await store.save({
            ...approved,
            state: { ...approved.state, run: completedRun },
        });
        return { ok: true, state: completedRun };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "approve" },
    }));

    assert.ok(events.indexOf("save:executing") < events.indexOf("schedule:goal-1"));
    assert.equal(result.kind, "terminal");
    assert.equal(result.phase, "executing");
    assert.deepEqual(result.goal.state.messages, waiting.state.messages);
    assert.notStrictEqual(
        result.goal.state.workflow.phase === "executing"
            ? result.goal.state.workflow.task
            : undefined,
        proposal,
    );
});

test("rejects empty or mismatched preparation actions without side effects", async () => {
    const cases = [
        {
            goal: createGatheringWaitingGoal(),
            action: { kind: "message", content: "   " } as const,
            code: "INVALID_GOAL_INPUT",
        },
        {
            goal: createGatheringWaitingGoal(),
            action: { kind: "approve" } as const,
            code: "INVALID_GOAL_INPUT",
        },
        {
            goal: createPreparationGoal(),
            action: { kind: "message", content: "Too early" } as const,
            code: "GOAL_NOT_WAITING",
        },
        {
            goal: {
                ...createPreparationGoal(),
                state: {
                    ...createPreparationGoal().state,
                    workflow: {
                        phase: "planning",
                        preparation: { status: "active" },
                    },
                },
            } as Goal,
            action: { kind: "approve" } as const,
            code: "GOAL_NOT_WAITING",
        },
    ] as const;

    for (const testCase of cases) {
        const store = new RecordingGoalStore();
        await store.seed(testCase.goal);
        const executor = new FakePreparationExecutor([]);
        const scheduler = new FakeScheduler(async () => {
            throw new Error("Unexpected Scheduler call");
        });
        const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
            store,
            preparationExecutor: executor,
            scheduler,
        });

        const result = requireFailure(await coordinator.resume({
            ref: {
                goalId: testCase.goal.id,
                runId: testCase.goal.state.run.id,
            },
            action: testCase.action,
        }));

        assert.equal(result.error.code, testCase.code);
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(executor.receivedGoals, []);
        assert.deepEqual(scheduler.receivedRefs, []);
        assert.deepEqual(await store.restore(testCase.goal.id), testCase.goal);
    }
});

test("propagates a resume save failure without continuing preparation", async () => {
    const waiting = createGatheringWaitingGoal();
    const saveError = new Error("resume save failed");
    const store = new RecordingGoalStore([], { call: 1, error: saveError });
    await store.seed(waiting);
    const executor = new FakePreparationExecutor([]);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: executor,
        scheduler: createUnusedScheduler(),
    });

    await assert.rejects(
        () => coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: { kind: "message", content: "PostgreSQL" },
        }),
        (error: unknown) => {
            assert.strictEqual(error, saveError);
            return true;
        },
    );
    assert.deepEqual(executor.receivedGoals, []);
    assert.deepEqual(await store.restore(waiting.id), waiting);
});

test("resume returns RUN_NOT_FOUND for a missing Goal or mismatched runId", async () => {
    const waiting = createGatheringWaitingGoal();
    const store = new RecordingGoalStore();
    await store.seed(waiting);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler: createUnusedScheduler(),
    });

    for (const ref of [
        { goalId: "missing", runId: waiting.state.run.id },
        { goalId: waiting.id, runId: "other-run" },
    ]) {
        const result = requireFailure(await coordinator.resume({
            ref,
            action: { kind: "message", content: "PostgreSQL" },
        }));
        assert.equal(result.error.code, "RUN_NOT_FOUND");
    }
});

test("saves a blocked user message and running state before scheduling", async () => {
    const events: string[] = [];
    const waiting = createExecutingWaitingGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const scheduler = new FakeScheduler(async (ref) => {
        const resumed = await store.restore(ref.goalId);
        assert.ok(resumed);
        assert.equal(resumed.state.run.status, "running");
        assert.deepEqual(resumed.state.run.lastStep, waiting.state.run.lastStep);
        assert.deepEqual(resumed.state.messages.at(-1), {
            role: "user",
            content: "  Permission granted  ",
        });

        const completedRun = applyRunTransition(resumed.state.run, {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "Deployed",
            },
        });
        await store.save({
            ...resumed,
            state: { ...resumed.state, run: completedRun },
        });
        return { ok: true, state: completedRun };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "message", content: "  Permission granted  " },
    }));

    assert.ok(
        events.indexOf("save:executing")
        < events.indexOf(`schedule:${waiting.id}`),
    );
    assert.equal(result.kind, "terminal");
    assert.deepEqual(result.goal.state.messages, [
        ...waiting.state.messages,
        { role: "user", content: "  Permission granted  " },
    ]);
});

test("rejects invalid blocked actions without saving or scheduling", async () => {
    for (const action of [
        { kind: "approve" } as const,
        { kind: "message", content: "   " } as const,
    ]) {
        const waiting = createExecutingWaitingGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const scheduler = new FakeScheduler(async () => {
            throw new Error("Unexpected Scheduler call");
        });
        const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
            store,
            preparationExecutor: new FakePreparationExecutor([]),
            scheduler,
        });

        const result = requireFailure(await coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action,
        }));

        assert.equal(result.error.code, "INVALID_GOAL_INPUT");
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(scheduler.receivedRefs, []);
    }
});

test("does not schedule when saving a blocked resume fails", async () => {
    const waiting = createExecutingWaitingGoal();
    const saveError = new Error("blocked resume save failed");
    const store = new RecordingGoalStore([], { call: 1, error: saveError });
    await store.seed(waiting);
    const scheduler = new FakeScheduler(async () => {
        throw new Error("Unexpected Scheduler call");
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        preparationExecutor: new FakePreparationExecutor([]),
        scheduler,
    });

    await assert.rejects(
        () => coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: { kind: "message", content: "Permission granted" },
        }),
        (error: unknown) => {
            assert.strictEqual(error, saveError);
            return true;
        },
    );
    assert.deepEqual(scheduler.receivedRefs, []);
    assert.deepEqual(await store.restore(waiting.id), waiting);
});
