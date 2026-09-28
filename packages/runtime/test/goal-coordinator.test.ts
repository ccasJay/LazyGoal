import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    computeContentHash,
    createGoal,
    createToolRegistration,
    createToolGrantMatcher,
    InMemoryToolRegistry,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    TrajectoryCheckpointCommitter,
    transition,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { JsonFileToolGrantStore } from "../../storage/src/index";
import { contract } from "../../contracts/src/index";
import { currentProtocols, InMemoryTrajectoryStore, trajectoryStoreFor } from "./current-fixtures";
import type {
    AgentProfile,
    CompletionCriterion,
    Goal,
    GoalProgressResult,
    GoalStore,
    RunnerResult,
    RunExecutionOptions,
    RunInput,
    RunRef,
    RunScheduler,
    RunState,
    StepExecutor,
    Tool,
    ToolDefinition,
    ToolGrantStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

const TEST_INPUT_CONTRACT = contract.record(contract.string());

function createTool(definition: ToolDefinition<typeof TEST_INPUT_CONTRACT>): Tool<typeof TEST_INPUT_CONTRACT> {
    return {
        definition,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            return { kind: "success", output: null, summary: "完成" };
        },
    };
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

class SaveLatchGoalStore implements GoalStore {
    private readonly delegate = new InMemoryGoalStore();
    private predicate: ((goal: Goal) => boolean) | undefined;
    private enteredResolve!: () => void;
    private releaseResolve!: () => void;
    readonly entered = new Promise<void>((resolve) => {
        this.enteredResolve = resolve;
    });
    private readonly released = new Promise<void>((resolve) => {
        this.releaseResolve = resolve;
    });

    arm(predicate: (goal: Goal) => boolean): void {
        this.predicate = predicate;
    }

    release(): void {
        this.releaseResolve();
    }

    async save(goal: Goal): Promise<void> {
        if (this.predicate?.(goal) === true) {
            this.predicate = undefined;
            this.enteredResolve();
            await this.released;
        }
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
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

function createInitialGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Build a resumable workflow",
        profile,
        runId: "run-1",
    });
}

function createAskUserWaitingGoal(): Goal {
    const goal = createInitialGoal();

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Which database should be used?",
                },
            ],
            run: {
                ...goal.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "plan",
                    questions: [
                        {
                            id: "q-1",
                            header: "选择数据库",
                            question: "Which database should be used?",
                            options: [{ id: "opt-1", label: "PostgreSQL" }, { id: "opt-2", label: "MySQL" }],
                            multiSelect: false,
                        },
                    ],
                },
            },
        },
    };
}

function createTaskApprovalWaitingGoal(
    proposal = {
        objective: "Implement persistence",
        completionCriteria: [{ text: "Snapshots can be restored" }],
    },
): Goal {
    const goal = createInitialGoal();

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Approve the persistence task?",
                },
            ],
            run: {
                ...goal.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    requestId: "prop-1",
                    proposal,
                    approvalRequest: "Approve the persistence task?",
                },
            },
        },
    };
}

function createExecutingWaitingGoal(): Goal {
    const goal = createExecutingGoal({
        id: "goal-blocked-resume",
        objective: "Deploy release",
        completionCriteria: [{ text: "Deployed" }],
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
        readonly completionCriteria: readonly CompletionCriterion[];
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
            },
            run: { ...created.state.run, mode: "plan", approvedTask: {
                    objective: input.objective,
                    completionCriteria: input.completionCriteria.map((criterion) => ({ ...criterion })),
                } },
            messages: [],
        },
    };
}

test("delegates an executing Goal and returns the latest persisted terminal snapshot", async () => {
    const executing = createExecutingGoal({
        id: "goal-executing",
        objective: "Execute",
        completionCriteria: [{ text: "Done" }],
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
            approvalScope: "action",
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

test("persists a goal Grant before approving and activates it before scheduling", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-coordinator-grant-"));
    try {
        const waiting = createActionApprovalGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const grants = new JsonFileToolGrantStore(directory);
        const matcher = await createToolGrantMatcher("read_file", { path: "README.md" });
        const registration = createToolRegistration(createTool({
            id: "read_file",
            description: "Read a file",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        }));
        let scheduled = false;
        const coordinator = new GoalCoordinator({
            store,
            scheduler: new FakeScheduler(async () => {
                scheduled = true;
                const active = await grants.findActiveMatching({
                    workspaceId: "workspace-1",
                    goalId: waiting.id,
                    matcher,
                });
                assert.ok(active);
                const approved = await store.restore(waiting.id);
                assert.equal(approved?.state.run.pendingAction?.approvalScope, "goal");
                assert.equal(approved?.state.run.pendingAction?.grantId, active.id);
                throw new Error("scheduler reached after authorization commit");
            }),
            toolGrantStore: grants,
            workspaceId: "workspace-1",
            toolRegistry: new InMemoryToolRegistry([registration]),
        });

        await assert.rejects(coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: { kind: "approve_action", actionId: "action-approval", scope: "goal" },
        }), /scheduler reached after authorization commit/);
        assert.equal(scheduled, true);
        assert.equal((await grants.list({ workspaceId: "workspace-1", goalId: waiting.id })).filter((grant) => grant.status === "active").length, 1);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("rejecting an Action never creates a persistent Grant", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-coordinator-grant-reject-"));
    try {
        const waiting = createActionApprovalGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const grants = new JsonFileToolGrantStore(directory);
        const coordinator = new GoalCoordinator({
            store,
            scheduler: new FakeScheduler(async () => { throw new Error("rejection was scheduled"); }),
            toolGrantStore: grants,
            workspaceId: "workspace-1",
        });
        await assert.rejects(coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: { kind: "reject_action", actionId: "action-approval", reason: "拒绝" },
        }), /rejection was scheduled/);
        assert.deepEqual(await grants.list({ workspaceId: "workspace-1", goalId: waiting.id }), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("manual unknown outcomes cannot widen an Action approval into a persistent Grant", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-coordinator-grant-unknown-"));
    try {
        const waiting = createActionRecoveryGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const grants = new JsonFileToolGrantStore(directory);
        const coordinator = new GoalCoordinator({
            store,
            scheduler: new FakeScheduler(async () => { throw new Error("unknown outcome was scheduled"); }),
            toolGrantStore: grants,
            workspaceId: "workspace-1",
        });
        const result = await coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: { kind: "approve_action", actionId: "action-approval", scope: "workspace" },
        });
        assert.equal(result.ok, false);
        assert.deepEqual(await grants.list({ workspaceId: "workspace-1", goalId: waiting.id }), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Coordinator lists only the current Goal grants and commits revocation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-coordinator-grant-revoke-"));
    try {
        const waiting = createActionApprovalGoal();
        const store = new RecordingGoalStore();
        await store.seed(waiting);
        const ledger = new JsonFileToolGrantStore(directory);
        const matcher = await createToolGrantMatcher("bash", { command: "git status" });
        const goalGrant = await ledger.stage({
            scope: "goal",
            goalId: waiting.id,
            workspaceId: "workspace-1",
            source: { goalId: waiting.id, runId: "earlier-run", actionId: "goal-action" },
            matcher,
        });
        const workspaceGrant = await ledger.stage({
            scope: "workspace",
            workspaceId: "workspace-1",
            source: { goalId: "another-goal", runId: "another-run", actionId: "workspace-action" },
            matcher,
        });
        await ledger.activate(goalGrant.id, goalGrant.source);
        await ledger.activate(workspaceGrant.id, workspaceGrant.source);
        const coordinator = new GoalCoordinator({
            store,
            scheduler: new FakeScheduler(async () => { throw new Error("unexpected schedule"); }),
            trajectoryStore: trajectoryStoreFor(store),
            toolGrantStore: ledger,
            workspaceId: "workspace-1",
        });
        const ref = { goalId: waiting.id, runId: waiting.state.run.id };

        const visible = await coordinator.listToolGrants(ref);
        assert.deepEqual(visible.map((grant) => grant.id).sort(), [goalGrant.id, workspaceGrant.id].sort());
        const revoked = await coordinator.revokeToolGrant({ ref, grantId: goalGrant.id, scope: "goal" });
        assert.equal(revoked.status, "revoked");
        assert.equal((await ledger.findActiveMatching({ workspaceId: "workspace-1", goalId: waiting.id, matcher }))?.id, workspaceGrant.id);
        const restored = await store.restore(waiting.id);
        assert.equal(restored?.state.run.status, "waiting");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("recovers a committed approval by activating its pending Grant before retry scheduling", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-coordinator-grant-recovery-"));
    try {
        const waiting = createActionApprovalGoal();
        const goalStore = new RecordingGoalStore();
        await goalStore.seed(waiting);
        const ledger = new JsonFileToolGrantStore(directory);
        let activationFailures = 1;
        const grantStore: ToolGrantStore = {
            findActiveMatching: (query) => ledger.findActiveMatching(query),
            stage: (grant) => ledger.stage(grant),
            list: (query) => ledger.list(query),
            revoke: (query) => ledger.revoke(query),
            async activate(grantId, source) {
                if (activationFailures > 0) {
                    activationFailures -= 1;
                    throw new Error("temporary grant activation failure");
                }
                return ledger.activate(grantId, source);
            },
        };
        const registration = createToolRegistration(createTool({
            id: "read_file",
            description: "Read a file",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        }));
        const matcher = await createToolGrantMatcher("read_file", { path: "README.md" });
        const coordinator = new GoalCoordinator({
            store: goalStore,
            scheduler: new FakeScheduler(async () => {
                assert.ok(await ledger.findActiveMatching({ workspaceId: "workspace-1", goalId: waiting.id, matcher }));
                throw new Error("resumed scheduler");
            }),
            toolGrantStore: grantStore,
            workspaceId: "workspace-1",
            toolRegistry: new InMemoryToolRegistry([registration]),
        });
        const ref = { goalId: waiting.id, runId: waiting.state.run.id };

        await assert.rejects(coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "action-approval", scope: "workspace" },
        }), /temporary grant activation failure/);
        const committed = await goalStore.restore(waiting.id);
        assert.equal(committed?.state.run.pendingAction?.status, "approved");
        assert.equal(committed?.state.run.pendingAction?.approvalScope, "workspace");
        assert.equal(await ledger.findActiveMatching({ workspaceId: "workspace-1", goalId: waiting.id, matcher }), undefined);

        await assert.rejects(coordinator.advance(ref), /resumed scheduler/);
        assert.ok(await ledger.findActiveMatching({ workspaceId: "workspace-1", goalId: waiting.id, matcher }));
    } finally { await rm(directory, { recursive: true, force: true }); }
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
    const manualTool: Tool<typeof TEST_INPUT_CONTRACT> = {
        definition: {
            id: "read_file",
            description: "需要人工确认的读取 Tool",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: true,
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
        scheduler: new InlineScheduler(new Runner({
        trajectoryStore: trajectoryStoreFor(store),
            store,
            executor,
            toolRegistry: { get: () => createToolRegistration(manualTool) },
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

test("/plan 与 run_started 按 Snapshot 提交顺序线性化", async () => {
    for (const winner of ["plan", "run_started"] as const) {
        const store = new SaveLatchGoalStore();
        const initial = createInitialGoal();
        await store.save(initial);
        const trajectoryStore = new InMemoryTrajectoryStore();
        const checkpointCommitter = new TrajectoryCheckpointCommitter({ store, trajectoryStore });
        const observedModes: string[] = [];
        const runner = new Runner({
            store,
            trajectoryStore,
            checkpointCommitter,
            executor: {
                async execute({ goal }) {
                    observedModes.push(goal.state.run.mode);
                    return goal.state.run.mode === "plan"
                        ? {
                            kind: "task_proposal",
                            task: { objective: "完成本次请求", completionCriteria: [{ text: "请求已处理" }] },
                            approvalRequest: "请批准任务提案",
                        }
                        : { kind: "wait", reason: "等待本次运行结束" };
                },
            },
        });
        const coordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            checkpointCommitter,
            scheduler: new InlineScheduler(runner),
        });
        const ref = { goalId: initial.id, runId: initial.state.run.id };

        if (winner === "plan") {
            store.arm((saved) => saved.state.run.status === "created" && saved.state.run.mode === "plan");
            const planPromise = coordinator.enterPlanMode(ref);
            await store.entered;
            const runPromise = runner.run(ref);
            store.release();

            const [planResult, runResult] = await Promise.all([planPromise, runPromise]);
            assert.equal(planResult.ok, true);
            assert.equal(runResult.ok, true);
            if (runResult.ok) assert.equal(runResult.state.status, "waiting");
            assert.deepEqual(observedModes, ["plan"]);
            assert.deepEqual(trajectoryStore.events
                .filter((event) => event.payload.type === "plan_mode_entered" || event.payload.type === "run_started")
                .map((event) => event.payload.type), ["plan_mode_entered", "run_started"]);
        } else {
            store.arm((saved) => saved.state.run.status === "running");
            const runPromise = runner.run(ref);
            await store.entered;
            const planPromise = coordinator.enterPlanMode(ref);
            store.release();

            const [runResult, planResult] = await Promise.all([runPromise, planPromise]);
            assert.equal(runResult.ok, true);
            if (runResult.ok) assert.equal(runResult.state.status, "waiting");
            assert.deepEqual(observedModes, ["normal"]);
            assert.deepEqual(planResult, {
                ok: false,
                error: {
                    code: "PLAN_MODE_BUSY",
                    message: "Plan Mode can only be selected before run_started is committed or after a Run completes or fails",
                },
            });
            assert.deepEqual(trajectoryStore.events
                .filter((event) => event.payload.type === "plan_mode_entered" || event.payload.type === "run_started")
                .map((event) => event.payload.type), ["run_started"]);
        }
    }
});

test("rejects Action controls with the wrong waiting type or actionId without side effects", async () => {
    const actions = [
        { kind: "message", content: "直接继续" },
        { kind: "approve", requestId: "stale" },
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
    const initial = createInitialGoal();
    const store = new RecordingGoalStore();
    await store.seed(initial);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
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

test("saves an ask_user answer before continuing and preserves its original text", async () => {
    const events: string[] = [];
    const waiting = createAskUserWaitingGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const trajectory = trajectoryStoreFor(store);
    const scheduler = new FakeScheduler(async (ref) => {
        const current = await store.restore(ref.goalId);
        assert.ok(current);
        const next = {
            ...current,
            state: {
                ...current.state,
                workflow: {
                    phase: "executing" as const,
                },
                run: {
                    ...current.state.run,
                    status: "completed" as const,
                    lastStep: {
                        kind: "decision" as const,
                        result: { kind: "complete" as const, summary: "Done", completionEvidence: [] },
                    },
                    stepCount: 1,

                    mode: "plan" as const, approvedTask: { objective: "Done", completionCriteria: [] },
                },
            },
        };
        await store.save(next);
        return { ok: true, state: next.state.run };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectory,
        store,
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: {
            kind: "answer_ask_user",
            requestId: "ask-1",
            answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
        },
    }));

    assert.equal(result.kind, "terminal");
    assert.equal(result.phase, "executing");
    assert.equal(result.goal.state.messages.at(-1)?.role, "user");
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "run_resumed",
        "ask_user_answered",
        "state_committed",
    ]);
});

test("saves task proposal feedback without the current proposal before replanning", async () => {
    const events: string[] = [];
    const waiting = createTaskApprovalWaitingGoal();
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const trajectory = trajectoryStoreFor(store);
    const scheduler = new FakeScheduler(async (ref) => {
        const current = await store.restore(ref.goalId);
        assert.ok(current);
        const next = {
            ...current,
            state: {
                ...current.state,
                run: {
                    ...current.state.run,
                    mode: "plan" as const,
                    status: "waiting" as const,
                    pendingInteraction: {
                        kind: "task_approval" as const,
                        requestId: "prop-2",
                        proposal: {
                            objective: "Implement encrypted persistence",
                            completionCriteria: [],
                        },
                        approvalRequest: "Approve the revised task?",
                    },
                },
            },
        };
        await store.save(next);
        return { ok: true, state: next.state.run };
    }, events);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectory,
        store,
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: {
            kind: "feedback_task",
            requestId: "prop-1",
            feedback: "Encrypt snapshots at rest",
        },
    }));

    assert.equal(result.kind, "waiting");
    assert.equal(result.phase, "executing");
    assert.equal(result.waitingFor, "task_approval");
    assert.equal(result.goal.state.run.approvedTask, undefined);
    assert.deepEqual(trajectory.events.map((event) => event.eventType), [
        "run_resumed",
        "task_feedback_received",
        "state_committed",
    ]);
    const feedbackEvent = trajectory.events.find((event) => event.eventType === "task_feedback_received");
    assert.equal(
        feedbackEvent?.payload.type === "task_feedback_received" ? feedbackEvent.payload.requestId : undefined,
        "prop-1",
    );
});

test("saves an approved proposal as the final task before scheduling execution", async () => {
    const events: string[] = [];
    const proposal = {
        objective: "Implement persistence",
        completionCriteria: [{ text: "Snapshots can be restored" }],
    };
    const waiting = createTaskApprovalWaitingGoal(proposal);
    const store = new RecordingGoalStore(events);
    await store.seed(waiting);
    events.length = 0;
    const scheduler = new FakeScheduler(async (ref) => {
        const approved = await store.restore(ref.goalId);
        assert.ok(approved);
        assert.deepEqual(approved.state.workflow, { phase: "executing" });
        assert.deepEqual(approved.state.run.approvedTask, proposal);
        const completedRun = applyRunTransition(approved.state.run, {
            kind: "decision",
            decision: {
                kind: "complete",
                completionEvidence: [],
                summary: "Done",
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
        scheduler,
    });

    const result = requireSuccess(await coordinator.resume({
        ref: { goalId: waiting.id, runId: waiting.state.run.id },
        action: { kind: "approve", requestId: "prop-1" },
    }));

    assert.ok(events.indexOf("save:executing") < events.indexOf("schedule:goal-1"));
    assert.equal(result.kind, "terminal");
    assert.equal(result.phase, "executing");
    assert.deepEqual(result.goal.state.messages, waiting.state.messages);
});

test("rejects empty or mismatched task interactions without side effects", async () => {
    const cases = [
        {
            goal: createAskUserWaitingGoal(),
            action: { kind: "message", content: "   " } as const,
            code: "INVALID_GOAL_INPUT",
        },
        {
            goal: createAskUserWaitingGoal(),
            action: { kind: "approve", requestId: "stale" } as const,
            code: "INVALID_GOAL_INPUT",
        },
        {
            goal: createInitialGoal(),
            action: { kind: "message", content: "Too early" } as const,
            code: "GOAL_NOT_WAITING",
        },
        {
            goal: createInitialGoal(),
            action: { kind: "approve", requestId: "stale" } as const,
            code: "GOAL_NOT_WAITING",
        },
    ] as const;

    for (const testCase of cases) {
        const store = new RecordingGoalStore();
        await store.seed(testCase.goal);
        const scheduler = new FakeScheduler(async () => {
            throw new Error("Unexpected Scheduler call");
        });
        const coordinator = new GoalCoordinator({
            trajectoryStore: trajectoryStoreFor(store),
            store,
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
        assert.deepEqual(scheduler.receivedRefs, []);
        assert.deepEqual(await store.restore(testCase.goal.id), testCase.goal);
    }
});

test("propagates a resume save failure without continuing unified execution", async () => {
    const waiting = createAskUserWaitingGoal();
    const saveError = new Error("resume save failed");
    const store = new RecordingGoalStore([], { call: 1, error: saveError });
    await store.seed(waiting);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        scheduler: createUnusedScheduler(),
    });

    await assert.rejects(
        () => coordinator.resume({
            ref: { goalId: waiting.id, runId: waiting.state.run.id },
            action: {
                kind: "answer_ask_user",
                requestId: "ask-1",
                answers: [{ questionId: "q-1", optionIds: ["opt-1"] }],
            },
        }),
        (error: unknown) => {
            assert.strictEqual(error, saveError);
            return true;
        },
    );
    assert.deepEqual(await store.restore(waiting.id), waiting);
});

test("resume returns RUN_NOT_FOUND for a missing Goal or mismatched runId", async () => {
    const waiting = createAskUserWaitingGoal();
    const store = new RecordingGoalStore();
    await store.seed(waiting);
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
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
        { kind: "approve", requestId: "stale" } as const,
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
