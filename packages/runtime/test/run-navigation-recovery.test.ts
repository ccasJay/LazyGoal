import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    allocateImmutableEvent,
    createGoal,
    RunNavigationRecoveryError,
    Runner,
    TrajectoryProtocolError,
    type AgentDecision,
    type Goal,
    type GoalStore,
    type RunStageState,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import {
    currentProtocols,
    InMemoryTrajectoryStore,
    testUserMessage,
} from "./current-fixtures";

const profile = {
    id: "navigation-recovery",
    systemPrompt: "Test",
    instructions: [],
    toolIds: [],
};

class PerRunTrajectoryStore implements TrajectoryStore {
    private readonly byRun = new Map<string, TrajectoryEvent[]>();

    seed(goalId: string, runId: string, drafts: readonly TrajectoryEventDraft[]): void {
        const key = `${goalId}\u0000${runId}`;
        const events = this.byRun.get(key) ?? [];
        for (const draft of drafts) {
            const sequence = (events.at(-1)?.sequence ?? 0) + 1;
            events.push(allocateImmutableEvent(draft, sequence));
        }
        this.byRun.set(key, events);
    }

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const key = `${draft.goalId}\u0000${draft.runId}`;
        const events = this.byRun.get(key) ?? [];
        const event = allocateImmutableEvent(draft, (events.at(-1)?.sequence ?? 0) + 1);
        events.push(event);
        this.byRun.set(key, events);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        const events = this.byRun.get(`${query.goalId}\u0000${query.runId}`) ?? [];
        return events.filter((event) =>
            (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence));
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<TrajectoryReadResult> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

function stageDeclared(
    goalId: string,
    runId: string,
    stageId: string,
    target: string,
): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "run_stage_declared",
        payload: {
            type: "run_stage_declared",
            stageId,
            revision: 1,
            target,
            acceptanceCriteria: ["条件"],
        },
    };
}

function stageAccepted(
    goalId: string,
    runId: string,
    stageId: string,
    summary: string,
): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "run_stage_accepted",
        payload: { type: "run_stage_accepted", stageId, revision: 1, summary },
    };
}

function noteDeclared(
    goalId: string,
    runId: string,
    noteId: string,
    revision: number,
    content: string,
): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "context_note_declared",
        payload: {
            type: "context_note_declared",
            noteId,
            revision,
            category: "decision",
            content,
            source: { kind: "agent_decision", summary: "测试决策" },
        },
    };
}

function navigationGoal(input: {
    readonly id: string;
    readonly currentRunId: string;
    readonly currentBoundary: number;
    readonly completed: readonly {
        readonly runId: string;
        readonly boundary: number;
    }[];
}): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: input.id,
        runId: input.currentRunId,
        intent: "恢复导航",
        promptBundleVersion: 1,
        profile,
    });
    return {
        ...created,
        state: {
            ...created.state,
            completedRuns: input.completed.map((run, index) => ({
                runId: run.runId,
                status: "completed" as const,
                stepCount: 1,
                committedThroughSequence: run.boundary,
                messageRange: { start: index, end: index },
            })),
            run: {
                ...created.state.run,
                status: "running",
                committedThroughSequence: input.currentBoundary,
            },
        },
    };
}

function capturingExecutor(
    capture: (input: StepExecutionInput) => void,
    decision: AgentDecision,
): StepExecutor {
    return {
        async decide(input) {
            capture(input);
            return { kind: "decision", decision };
        },
        async think(): Promise<never> { throw new Error("Unexpected Think"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };
}

interface NavigationSnapshot {
    readonly stages: readonly {
        readonly stageId: string;
        readonly runId: string;
        readonly revision: number;
        readonly status: "executing" | "accepted";
        readonly target: string;
        readonly summary?: string | undefined;
    }[];
    readonly notes: readonly { readonly noteId: string; readonly revision: number; readonly category: string; readonly content: string }[];
    readonly currentStage: RunStageState | undefined;
}

function modelVisibleNavigation(input: StepExecutionInput): NavigationSnapshot {
    return {
        stages: (input.goal.state.historicalStages ?? []).map(({ stageId, runId, revision, status, target, summary }) => ({
            stageId, runId: runId ?? "", revision, status, target, summary,
        })),
        notes: (input.goal.state.notes ?? []).map(({ noteId, revision, category, content }) => ({
            noteId, revision, category, content,
        })),
        currentStage: input.goal.state.run.currentStage,
    };
}

test("当前与归档 Run 各用自己的提交水位恢复导航，未提交尾部不进入投影", async () => {
    const goal = navigationGoal({
        id: "navigation-watermarks",
        currentRunId: "run-current",
        currentBoundary: 3,
        completed: [{ runId: "run-old", boundary: 5 }],
    });
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const trajectoryStore = new PerRunTrajectoryStore();
    trajectoryStore.seed(goal.id, "run-old", [
        stageDeclared(goal.id, "run-old", "stage-1", "旧阶段"),
        stageAccepted(goal.id, "run-old", "stage-1", "旧阶段完成"),
        noteDeclared(goal.id, "run-old", "note-1", 1, "旧决策 v1"),
        noteDeclared(goal.id, "run-old", "note-1", 2, "旧决策 v2"),
        stageDeclared(goal.id, "run-old", "stage-2", "旧尾部阶段"),
        stageAccepted(goal.id, "run-old", "stage-2", "旧尾部接受"),
        noteDeclared(goal.id, "run-old", "note-1", 3, "旧尾部修订"),
    ]);
    trajectoryStore.seed(goal.id, "run-current", [
        stageDeclared(goal.id, "run-current", "stage-1", "当前阶段"),
        stageAccepted(goal.id, "run-current", "stage-1", "当前阶段完成"),
        noteDeclared(goal.id, "run-current", "note-current", 1, "当前决策"),
        stageAccepted(goal.id, "run-current", "stage-2", "当前尾部接受"),
        noteDeclared(goal.id, "run-current", "note-current", 2, "当前尾部修订"),
    ]);
    let captured: { readonly stages: readonly RunStageState[]; readonly notes: readonly { readonly noteId: string; readonly revision: number; readonly content: string }[] } | undefined;
    const result = await new Runner({
        store,
        trajectoryStore,
        executor: capturingExecutor((input) => {
            captured = {
                stages: input.goal.state.historicalStages ?? [],
                notes: input.goal.state.notes ?? [],
            };
        }, { kind: "wait", reason: "Captured" }),
    }).run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.ok(captured);

    const stages = captured.stages;
    assert.deepEqual(
        stages.map(({ runId, stageId, status, summary }) => ({ runId, stageId, status, summary })),
        [
            { runId: "run-old", stageId: "stage-1", status: "accepted", summary: "旧阶段完成" },
            { runId: "run-current", stageId: "stage-1", status: "accepted", summary: "当前阶段完成" },
        ],
        "only accepted facts inside each Run boundary are visible",
    );
    assert.equal(stages.some((stage) => stage.summary === "旧尾部接受"), false);
    assert.equal(stages.some((stage) => stage.summary === "当前尾部接受"), false);

    const notes = captured.notes;
    assert.deepEqual(
        notes.map(({ noteId, revision, content }) => ({ noteId, revision, content })),
        [
            { noteId: "note-1", revision: 2, content: "旧决策 v2" },
            { noteId: "note-current", revision: 1, content: "当前决策" },
        ],
        "the latest committed note revision is visible; uncommitted revisions are not",
    );
});

test("导航读取失败或非零水位缺少提交边界时返回保留身份的恢复失败并停止模型推进", async () => {
    const goal = navigationGoal({
        id: "navigation-failure",
        currentRunId: "run-current",
        currentBoundary: 0,
        completed: [{ runId: "run-old", boundary: 1 }],
    });
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const base = new PerRunTrajectoryStore();
    base.seed(goal.id, "run-current", [stageDeclared(goal.id, "run-current", "stage-1", "当前阶段")]);
    base.seed(goal.id, "run-old", [stageDeclared(goal.id, "run-old", "stage-1", "旧阶段")]);
    let modelCalls = 0;
    const executor: StepExecutor = {
        async decide() {
            modelCalls += 1;
            return { kind: "decision", decision: { kind: "wait", reason: "Should not run" } };
        },
        async think(): Promise<never> { throw new Error("Unexpected Think"); },
        async reviewCompletion() { return { kind: "accept" }; },
    };

    class FailingStore implements TrajectoryStore {
        constructor(
            private readonly delegate: PerRunTrajectoryStore,
            private readonly runId: string,
            private readonly error: Error,
        ) {}
        append(draft: TrajectoryEventDraft) { return this.delegate.append(draft); }
        read(query: TrajectoryReadQuery) { return this.delegate.read(query); }
        async readWithBoundary(query: TrajectoryReadQuery, boundary: number): Promise<TrajectoryReadResult> {
            if (query.runId === this.runId) throw this.error;
            return this.delegate.readWithBoundary(query, boundary);
        }
    }

    const currentFailure = new TrajectoryProtocolError("current run history is corrupt");
    await assert.rejects(
        new Runner({
            store,
            trajectoryStore: new FailingStore(base, "run-current", currentFailure),
            executor,
        }).run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) => error instanceof RunNavigationRecoveryError
            && error.goalId === goal.id
            && error.runId === "run-current"
            && error.cause === currentFailure,
    );
    assert.equal(modelCalls, 0);

    const oldFailure = new Error("archived run history is unavailable");
    await assert.rejects(
        new Runner({
            store,
            trajectoryStore: new FailingStore(base, "run-old", oldFailure),
            executor,
        }).run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) => error instanceof RunNavigationRecoveryError
            && error.goalId === goal.id
            && error.runId === "run-old"
            && error.cause === oldFailure,
    );
    assert.equal(modelCalls, 0);

    const missingBoundaryGoal = navigationGoal({
        id: "navigation-missing-boundary",
        currentRunId: "run-current",
        currentBoundary: 3,
        completed: [],
    });
    await store.save(missingBoundaryGoal);
    const missingBoundaryStore = new PerRunTrajectoryStore();
    missingBoundaryStore.seed(missingBoundaryGoal.id, "run-current", [
        stageDeclared(missingBoundaryGoal.id, "run-current", "stage-1", "当前阶段"),
        stageAccepted(missingBoundaryGoal.id, "run-current", "stage-1", "当前阶段完成"),
    ]);
    await assert.rejects(
        new Runner({
            store,
            trajectoryStore: missingBoundaryStore,
            executor,
        }).run({ goalId: missingBoundaryGoal.id, runId: missingBoundaryGoal.state.run.id }),
        (error: unknown) => error instanceof RunNavigationRecoveryError
            && error.runId === "run-current"
            && /boundary is missing/.test(error.message),
    );
    assert.equal(modelCalls, 0);

    const emptyGoal = navigationGoal({
        id: "navigation-empty",
        currentRunId: "run-empty",
        currentBoundary: 0,
        completed: [],
    });
    await store.save(emptyGoal);
    let emptyCaptured: unknown;
    const emptyResult = await new Runner({
        store,
        trajectoryStore: new InMemoryTrajectoryStore(),
        executor: capturingExecutor((input) => {
            emptyCaptured = input.goal.state.historicalStages;
        }, { kind: "wait", reason: "Empty history" }),
    }).run({ goalId: emptyGoal.id, runId: emptyGoal.state.run.id });
    assert.equal(emptyResult.ok, true);
    assert.equal(emptyCaptured, undefined);
});

test("实时推进与冷恢复提供相同的历史接受结果、有效 note 版本与重开阶段状态", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const created = createGoal({
        ...currentProtocols,
        id: "navigation-live-cold",
        runId: "run-live-cold",
        intent: "比较实时与冷恢复导航",
        promptBundleVersion: 1,
        profile,
        maxSteps: 20,
    });
    const initial: Goal = {
        ...created,
        state: {
            ...created.state,
            messages: [...created.state.messages, testUserMessage("比较实时与冷恢复导航", { goal: created })],
        },
    };
    await store.save(initial);
    const ref = { goalId: initial.id, runId: initial.state.run.id };
    let liveNavigation: NavigationSnapshot | undefined;

    class LiveExecutor implements StepExecutor {
        private index = 0;

        async decide(input: StepExecutionInput): Promise<{ readonly kind: "decision"; readonly decision: AgentDecision }> {
            this.index += 1;
            if (this.index === 1) {
                return { kind: "decision", decision: {
                    kind: "run_stage_update",
                    target: "阶段一",
                    acceptanceCriteria: ["条件一"],
                    contextNotes: [{
                        category: "decision",
                        content: "决定 A",
                        source: { kind: "agent_decision", summary: "选择" },
                    }],
                } };
            }
            if (this.index === 2) {
                return { kind: "decision", decision: { kind: "run_stage_complete", stageId: "stage-1", summary: "阶段一完成" } };
            }
            if (this.index === 3) {
                return { kind: "decision", decision: {
                    kind: "run_stage_update",
                    target: "阶段二",
                    acceptanceCriteria: ["条件二"],
                    contextNotes: [{
                        noteId: "note-1",
                        baseRevision: 1,
                        category: "decision",
                        content: "决定 B",
                        source: { kind: "agent_decision", summary: "修订" },
                    }],
                } };
            }
            if (this.index === 4) {
                return { kind: "decision", decision: { kind: "run_stage_complete", stageId: "stage-2", summary: "阶段二完成" } };
            }
            if (this.index === 5) {
                return { kind: "decision", decision: { kind: "complete", summary: "Incomplete delivery", evidenceSequences: [] } };
            }
            liveNavigation = modelVisibleNavigation(input);
            throw new ExecutionAbortedError();
        }

        async think(): Promise<never> { throw new Error("Unexpected Think"); }

        async reviewCompletion(input: Parameters<StepExecutor["reviewCompletion"]>[0]) {
            return input.candidate.kind === "complete" && input.candidate.summary === "Incomplete delivery"
                ? { kind: "reject" as const, feedback: "缺少最终建议" }
                : { kind: "accept" as const };
        }
    }

    await assert.rejects(
        new Runner({ store, trajectoryStore, executor: new LiveExecutor() }).run(ref),
        ExecutionAbortedError,
    );
    assert.ok(liveNavigation);
    assert.equal(liveNavigation.currentStage?.stageId, "stage-2");
    assert.equal(liveNavigation.currentStage?.status, "executing");
    assert.equal(liveNavigation.currentStage?.latestReviewRejection?.feedback, "缺少最终建议");
    assert.deepEqual(
        liveNavigation.stages.map(({ stageId, status, summary }) => ({ stageId, status, summary })),
        [
            { stageId: "stage-1", status: "accepted", summary: "阶段一完成" },
            { stageId: "stage-2", status: "accepted", summary: "阶段二完成" },
        ],
        "the reopened stage keeps its latest committed acceptance",
    );
    assert.deepEqual(
        liveNavigation.notes.map(({ noteId, revision, content }) => ({ noteId, revision, content })),
        [{ noteId: "note-1", revision: 2, content: "决定 B" }],
    );

    let coldNavigation: NavigationSnapshot | undefined;
    await assert.rejects(
        new Runner({
            store,
            trajectoryStore,
            executor: {
                async decide(input) {
                    coldNavigation = modelVisibleNavigation(input);
                    throw new ExecutionAbortedError();
                },
                async think(): Promise<never> { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref),
        ExecutionAbortedError,
    );
    assert.deepEqual(coldNavigation, liveNavigation);

    let liveAfterReaccept: NavigationSnapshot | undefined;
    let reacceptIndex = 0;
    await assert.rejects(new Runner({
        store,
        trajectoryStore,
        executor: {
            async decide(input) {
                reacceptIndex += 1;
                if (reacceptIndex === 1) {
                    return { kind: "decision", decision: { kind: "run_stage_complete", stageId: "stage-2", summary: "修订后完成" } };
                }
                liveAfterReaccept = modelVisibleNavigation(input);
                throw new ExecutionAbortedError();
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "accept" }; },
        },
    }).run(ref), ExecutionAbortedError);
    assert.ok(liveAfterReaccept);
    assert.equal(liveAfterReaccept.currentStage?.status, "accepted");
    assert.equal(
        liveAfterReaccept.stages.find((stage) => stage.stageId === "stage-2")?.summary,
        "修订后完成",
    );

    let coldAfterReaccept: NavigationSnapshot | undefined;
    const coldAfterResult = await new Runner({
        store,
        trajectoryStore,
        executor: capturingExecutor((input) => {
            coldAfterReaccept = modelVisibleNavigation(input);
        }, { kind: "wait", reason: "Cold rebuild after reaccept" }),
    }).run(ref);
    assert.equal(coldAfterResult.ok, true);
    assert.deepEqual(coldAfterReaccept, liveAfterReaccept);
});

test("Snapshot 已保存但 marker 缺失时导航仍读取到提交水位内的事实", async () => {
    const backingStore = new InMemoryGoalStore();
    const backingTrajectory = new InMemoryTrajectoryStore();
    const created = createGoal({
        ...currentProtocols,
        id: "navigation-marker-missing",
        runId: "run-marker-missing",
        intent: "marker 缺失后的导航",
        promptBundleVersion: 1,
        profile,
        maxSteps: 10,
    });
    await backingStore.save(created);
    const ref = { goalId: created.id, runId: created.state.run.id };
    let failNextMarker = false;
    const store: GoalStore = {
        restore: (goalId) => backingStore.restore(goalId),
        save: async (goal) => {
            await backingStore.save(goal);
            if (goal.state.run.currentStage?.status === "accepted") {
                failNextMarker = true;
            }
        },
    };
    const failingTrajectory: TrajectoryStore = {
        append(draft: TrajectoryEventDraft) {
            if (failNextMarker && draft.eventType === "state_committed") {
                failNextMarker = false;
                return Promise.reject(new Error("marker unavailable"));
            }
            return backingTrajectory.append(draft);
        },
        read(query: TrajectoryReadQuery) { return backingTrajectory.read(query); },
        readWithBoundary(query: TrajectoryReadQuery, boundary: number) {
            return backingTrajectory.readWithBoundary(query, boundary);
        },
    };
    let calls = 0;
    await assert.rejects(new Runner({
        store,
        trajectoryStore: failingTrajectory,
        executor: {
            async decide() {
                calls += 1;
                if (calls === 1) {
                    return { kind: "decision", decision: { kind: "run_stage_update", target: "阶段一", acceptanceCriteria: ["条件一"] } };
                }
                return { kind: "decision", decision: { kind: "run_stage_complete", stageId: "stage-1", summary: "阶段一完成" } };
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "accept" }; },
        },
    }).run(ref), /marker unavailable/);

    const saved = await backingStore.restore(created.id);
    assert.ok(saved);
    assert.equal(saved.state.run.currentStage?.status, "accepted");
    const boundary = saved.state.run.committedThroughSequence;
    assert.ok(boundary > 0);
    const events = await backingTrajectory.read(ref);
    assert.equal(events.some((event) => event.eventType === "state_committed"
        && event.payload.committedThroughSequence === boundary), false);
    assert.equal(events.at(-1)?.sequence, boundary);

    let captured: NavigationSnapshot | undefined;
    await assert.rejects(
        new Runner({
            store: backingStore,
            trajectoryStore: backingTrajectory,
            executor: {
                async decide(input) {
                    captured = modelVisibleNavigation(input);
                    throw new ExecutionAbortedError();
                },
                async think(): Promise<never> { throw new Error("Unexpected Think"); },
                async reviewCompletion() { return { kind: "accept" }; },
            },
        }).run(ref),
        ExecutionAbortedError,
    );
    assert.ok(captured);
    assert.deepEqual(
        captured.stages.map(({ stageId, status, summary }) => ({ stageId, status, summary })),
        [{ stageId: "stage-1", status: "accepted", summary: "阶段一完成" }],
        "a missing marker must not lower the Snapshot visibility boundary",
    );
});

test("旧 Run 的历史阶段可用于导航，但不能作为当前 Run 的完成 Evidence", async () => {
    const goal = navigationGoal({
        id: "navigation-old-evidence",
        currentRunId: "run-current",
        currentBoundary: 0,
        completed: [{ runId: "run-old", boundary: 2 }],
    });
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const trajectoryStore = new PerRunTrajectoryStore();
    trajectoryStore.seed(goal.id, "run-old", [
        stageDeclared(goal.id, "run-old", "stage-1", "旧阶段"),
        stageAccepted(goal.id, "run-old", "stage-1", "旧阶段完成"),
    ]);
    let calls = 0;
    let feedback: string | undefined;
    const result = await new Runner({
        store,
        trajectoryStore,
        executor: {
            async decide(input) {
                calls += 1;
                if (calls === 1) {
                    assert.equal(input.goal.state.historicalStages?.length, 1);
                    assert.equal(input.goal.state.historicalStages?.[0]?.runId, "run-old");
                    return { kind: "decision", decision: { kind: "complete", summary: "Old evidence", evidenceSequences: [2] } };
                }
                feedback = input.runtimeFeedback?.issues[0]?.message;
                return { kind: "decision", decision: { kind: "wait", reason: "Captured" } };
            },
            async think(): Promise<never> { throw new Error("Unexpected Think"); },
            async reviewCompletion() { return { kind: "accept" }; },
        },
    }).run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(feedback ?? "", /evidence/i);
});
