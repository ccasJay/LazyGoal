import assert from "node:assert/strict";
import { test } from "node:test";

import type {
    AgentDecision,
    AgentProfile,
    DecideStageResult,
    Goal,
    GoalStore,
    ModelContextFramePayload,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
} from "../src/index";
import {
    allocateImmutableEvent,
    createGoal,
    createRuntimeFeedback,
    ExecutionAbortedError,
    ModelStageFeedbackError,
    Runner,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

const profile: AgentProfile = {
    id: "think-recovery-profile",
    systemPrompt: "恢复测试代理",
    instructions: [],
    toolIds: [],
};

type DecideInput = StepExecutionInput & {
    readonly thinkHistory: readonly ThinkExchange[];
};

type ThinkInput = StepExecutionInput & {
    readonly thinkGoal: string;
    readonly thinkHistory: readonly ThinkExchange[];
};

function createExecutingGoal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        intent: "验证 Think 阶段链恢复",
        promptBundleVersion: 1,
        profile,
        runId: "run-1",
        maxSteps: 5,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run,
                mode: "plan",
                approvedTask: {
                    objective: "完成 Think 恢复验证",
                    completionCriteria: [{ text: "只重试对应 Decide" }],
                },
            },
        },
    };
}

function frame(
    input: StepExecutionInput,
    stage: "decide" | "think",
): Omit<ModelContextFramePayload, "type"> {
    return {
        stage,
        epochNumber: input.goal.state.run.contextEpoch.number,
        conversationPosition: input.goal.state.messages.length,
        sections: [],
    };
}

class ScriptedExecutor implements StepExecutor {
    async reviewCompletion() { return { kind: "accept" as const }; }
    readonly decideInputs: DecideInput[] = [];
    readonly thinkInputs: ThinkInput[] = [];

    constructor(
        private readonly decideScript: (input: DecideInput, call: number) => Promise<DecideStageResult>,
        private readonly thinkScript: (input: ThinkInput, call: number) => Promise<ThinkStageResult>,
    ) {}

    async execute(): Promise<AgentDecision> {
        throw new Error("Runner should use the stage methods");
    }

    decide(input: DecideInput): Promise<DecideStageResult> {
        const call = this.decideInputs.length + 1;
        this.decideInputs.push({ ...input, thinkHistory: [...input.thinkHistory] });
        return this.decideScript(input, call);
    }

    think(input: ThinkInput): Promise<ThinkStageResult> {
        const call = this.thinkInputs.length + 1;
        this.thinkInputs.push({ ...input, thinkHistory: [...input.thinkHistory] });
        return this.thinkScript(input, call);
    }
}

class FailOnceGoalStore implements GoalStore {
    private readonly inner = new InMemoryGoalStore();
    failNextSave = false;

    async save(goal: Goal): Promise<void> {
        if (this.failNextSave) {
            this.failNextSave = false;
            throw new Error("snapshot write failed");
        }
        await this.inner.save(goal);
    }

    restore(goalId: string): Promise<Goal | undefined> {
        return this.inner.restore(goalId);
    }
}

function requestThink(input: DecideInput, goal = "核对阶段恢复边界"): DecideStageResult {
    return {
        kind: "request_think",
        goal,
        modelContextFrame: frame(input, "decide"),
    };
}

function waitDecision(input: DecideInput): DecideStageResult {
    return {
        kind: "decision",
        decision: { kind: "wait", reason: "恢复测试完成" },
        modelContextFrame: frame(input, "decide"),
    };
}

async function createRecoverableThinkChain(id: string) {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal(id);
    await store.save(initial);
    const executor = new ScriptedExecutor(
        async (input, call) => {
            if (call === 1) return requestThink(input);
            throw new Error("Decide unavailable");
        },
        async (input) => ({
            goal: input.thinkGoal,
            output: "已完成阶段目标并保存恢复检查点。",
            modelContextFrame: frame(input, "think"),
        }),
    );
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });

    await assert.rejects(
        runner.run({ goalId: initial.id, runId: "run-1" }),
        /Decide unavailable/,
    );
    const saved = await store.restore(initial.id);
    assert.ok(saved?.state.run.pendingThink);
    return { store, trajectory, initial, saved, executor };
}


test("Decide 阶段反馈先提交再重试，恢复链记录尝试且不推进 Step", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("decide-output-repair");
    await store.save(initial);
    const executor = new ScriptedExecutor(
        async (input, call) => {
            if (call === 1) {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: input.goal.id,
                    runId: input.goal.state.run.id,
                    executionUnitId: input.executionUnitId ?? "unbound",
                    stepOrdinal: input.goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "output_contract",
                    code: "INVALID_LLM_RESPONSE",
                    attempt: 1,
                    issues: [{ code: "missing_required_property", path: ["result"], message: "Return the required result object." }],
                }), "invalid Decide output");
            }
            assert.ok(input.runtimeFeedback);
            assert.equal(input.runtimeFeedback.stage, "decide");
            assert.equal(input.runtimeFeedback.attempt, 1);
            return waitDecision(input);
        },
        async () => { throw new Error("Decide repair must not call Think"); },
    );

    const result = await new Runner({ store, executor, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.pendingModelRepair, undefined);
    assert.equal(executor.decideInputs.length, 2);
    const persisted = await store.restore(initial.id);
    assert.equal(persisted?.state.run.stepCount, 1);
    const events = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        persisted?.state.run.committedThroughSequence ?? 0,
    );
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_attempt_started").length, 2);
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_feedback_recorded").length, 1);
    const feedback = events.committed.find((event) => event.eventType === "model_repair_feedback_recorded");
    assert.equal(feedback?.eventType === "model_repair_feedback_recorded" ? feedback.payload.feedback.attempt : -1, 1);
});

test("已提交阶段反馈后中止，恢复时重用反馈并继续同一 Decide 链", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("decide-repair-recovery");
    await store.save(initial);
    const controller = new AbortController();
    const first = new ScriptedExecutor(
        async (input, call) => {
            if (call === 1) {
                throw new ModelStageFeedbackError(createRuntimeFeedback({
                    goalId: input.goal.id,
                    runId: input.goal.state.run.id,
                    executionUnitId: input.executionUnitId ?? "unbound",
                    stepOrdinal: input.goal.state.run.stepCount + 1,
                    stage: "decide",
                    origin: "output_contract",
                    code: "INVALID_LLM_RESPONSE",
                    attempt: 1,
                    issues: [{ code: "missing_required_property", path: ["result"], message: "Return the required result object." }],
                }), "invalid Decide output");
            }
            assert.equal(input.runtimeFeedback?.attempt, 1);
            controller.abort();
            throw new ExecutionAbortedError("cancel between repair attempts");
        },
        async () => { throw new Error("Decide recovery must not call Think"); },
    );

    await assert.rejects(
        new Runner({ store, executor: first, trajectoryStore: trajectory })
            .run({ goalId: initial.id, runId: "run-1" }, {}, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    const suspended = await store.restore(initial.id);
    assert.equal(suspended?.state.run.pendingModelRepair?.stage, "decide");
    assert.equal(suspended?.state.run.pendingModelRepair?.attemptsStarted, 2);

    const resumed = new ScriptedExecutor(
        async (input) => {
            assert.equal(input.runtimeFeedback?.attempt, 1);
            return waitDecision(input);
        },
        async () => { throw new Error("Decide recovery must not call Think"); },
    );
    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "waiting");
    assert.equal(resumed.decideInputs.length, 1);
    assert.equal(resumed.decideInputs[0]?.runtimeFeedback?.attempt, 1);
    const persisted = await store.restore(initial.id);
    const events = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        persisted?.state.run.committedThroughSequence ?? 0,
    );
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_attempt_started").length, 3);
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_feedback_recorded").length, 1);
});

test("无效输出达到三次上限后明确失败并保留反馈尝试事实", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("decide-repair-exhausted");
    await store.save(initial);
    const executor = new ScriptedExecutor(
        async (input) => {
            throw new ModelStageFeedbackError(createRuntimeFeedback({
                goalId: input.goal.id,
                runId: input.goal.state.run.id,
                executionUnitId: input.executionUnitId ?? "unbound",
                stepOrdinal: input.goal.state.run.stepCount + 1,
                stage: "decide",
                origin: "output_contract",
                code: "INVALID_LLM_RESPONSE",
                attempt: 1,
                issues: [{ code: "missing_required_property", path: ["result"], message: "Return the required result object." }],
            }), "invalid Decide output");
        },
        async () => { throw new Error("Decide correction must not call Think"); },
    );

    const result = await new Runner({ store, executor, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.pendingModelRepair, undefined);
    assert.equal(executor.decideInputs.length, 3);
    const events = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        result.state.committedThroughSequence,
    );
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_attempt_started").length, 3);
    assert.equal(events.committed.filter((event) => event.eventType === "model_repair_feedback_recorded").length, 3);
});

test("已提交 Think 后 Decide 失败，恢复复用输出并只重试 Decide", async () => {
    const { store, trajectory, initial, saved, executor: firstExecutor } =
        await createRecoverableThinkChain("think-recovery-decide-failure");
    const pending = saved.state.run.pendingThink;
    assert.ok(pending);
    assert.equal(saved.state.run.status, "running");
    assert.equal(saved.state.run.stepCount, 0);
    assert.equal(firstExecutor.thinkInputs.length, 1);

    const resumed = new ScriptedExecutor(
        async (input) => {
            assert.deepEqual(input.thinkHistory, [{
                requestId: input.thinkHistory[0]?.requestId,
                goal: "核对阶段恢复边界",
                output: "已完成阶段目标并保存恢复检查点。",
            }]);
            return waitDecision(input);
        },
        async () => { throw new Error("Recovery must not repeat Think"); },
    );
    const runner = new Runner({ store, executor: resumed, trajectoryStore: trajectory });
    const result = await runner.run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "waiting", JSON.stringify(result.state.stopReason));
    assert.equal(resumed.decideInputs.length, 1);
    assert.equal(resumed.thinkInputs.length, 0);
    assert.equal(resumed.decideInputs[0]?.executionUnitId, pending.executionUnitId);
    assert.deepEqual(result.ok ? result.state.pendingThink : undefined, undefined);
    assert.equal(result.ok ? result.state.stepCount : -1, 1);
});

test("已提交 Think 后 Decide 被取消，Run 保留指针并在恢复时只调用 Decide", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("think-recovery-decide-cancelled");
    await store.save(initial);
    const controller = new AbortController();
    const cancelling = new ScriptedExecutor(
        async (input, call) => {
            if (call === 1) return requestThink(input);
            controller.abort();
            throw new ExecutionAbortedError("Decide cancelled");
        },
        async (input) => ({
            goal: input.thinkGoal,
            output: "取消前已提交的 Think 输出。",
            modelContextFrame: frame(input, "think"),
        }),
    );

    await assert.rejects(
        new Runner({ store, executor: cancelling, trajectoryStore: trajectory })
            .run({ goalId: initial.id, runId: "run-1" }, {}, { signal: controller.signal }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    const afterCancellation = await store.restore(initial.id);
    assert.ok(afterCancellation?.state.run.pendingThink);
    assert.equal(afterCancellation.state.run.status, "running");
    assert.equal(afterCancellation.state.run.stepCount, 0);

    const resumed = new ScriptedExecutor(
        async (input) => {
            assert.equal(input.thinkHistory.length, 1);
            assert.equal(input.thinkHistory[0]?.output, "取消前已提交的 Think 输出。");
            return waitDecision(input);
        },
        async () => { throw new Error("Cancellation recovery must not repeat Think"); },
    );
    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    assert.equal(resumed.decideInputs.length, 1);
    assert.equal(resumed.thinkInputs.length, 0);
});

test("Think 调用中断后从已提交请求恢复同一目标，不复用未提交输出", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("think-recovery-think-failure");
    await store.save(initial);
    const failing = new ScriptedExecutor(
        async (input) => requestThink(input),
        async () => { throw new Error("Think unavailable"); },
    );
    const firstRunner = new Runner({ store, executor: failing, trajectoryStore: trajectory });

    await assert.rejects(
        firstRunner.run({ goalId: initial.id, runId: "run-1" }),
        /Think unavailable/,
    );

    const afterFailure = await store.restore(initial.id);
    assert.ok(afterFailure);
    assert.equal(afterFailure.state.run.pendingThink, undefined);
    assert.equal(afterFailure.state.run.stepCount, 0);
    const afterFailureEvents = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        afterFailure.state.run.committedThroughSequence,
    );
    assert.equal(afterFailureEvents.committed.filter((event) => event.eventType === "think_requested").length, 1);
    assert.equal(afterFailureEvents.committed.filter((event) => event.eventType === "think_completed").length, 0);

    const resumed = new ScriptedExecutor(
        async (input) => {
            assert.deepEqual(input.thinkHistory.map((item) => item.output), ["Think 重试后完成的输出。"]);
            return waitDecision(input);
        },
        async (input) => ({
            goal: input.thinkGoal,
            output: "Think 重试后完成的输出。",
            modelContextFrame: frame(input, "think"),
        }),
    );
    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "waiting", JSON.stringify(result.state.stopReason));
    assert.equal(resumed.decideInputs.length, 1);
    assert.equal(resumed.thinkInputs.length, 1);
    assert.equal(resumed.thinkInputs[0]?.thinkGoal, "核对阶段恢复边界");
});

test("Think 输出 append 成功但 Snapshot 保存失败时，uncommitted tail 不进入恢复历史", async () => {
    const store = new FailOnceGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("think-recovery-uncommitted-output");
    await store.save(initial);
    const failing = new ScriptedExecutor(
        async (input) => requestThink(input),
        async (input) => {
            store.failNextSave = true;
            return {
                goal: input.thinkGoal,
                output: "这条输出没有跨过 Snapshot 边界。",
                modelContextFrame: frame(input, "think"),
            };
        },
    );

    await assert.rejects(
        new Runner({ store, executor: failing, trajectoryStore: trajectory })
            .run({ goalId: initial.id, runId: "run-1" }),
        /snapshot write failed/,
    );

    const afterFailure = await store.restore(initial.id);
    assert.ok(afterFailure);
    assert.equal(afterFailure.state.run.pendingThink, undefined);
    const tail = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        afterFailure.state.run.committedThroughSequence,
    );
    assert.equal(tail.committed.some((event) => event.eventType === "think_completed"), false);
    assert.equal(tail.uncommittedTail.some((event) => event.eventType === "think_completed"), true);

    const resumed = new ScriptedExecutor(
        async (input) => {
            assert.deepEqual(input.thinkHistory.map((item) => item.output), ["重试后已提交的输出。"]);
            return waitDecision(input);
        },
        async (input) => ({
            goal: input.thinkGoal,
            output: "重试后已提交的输出。",
            modelContextFrame: frame(input, "think"),
        }),
    );
    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "waiting", JSON.stringify(result.state.stopReason));
    assert.equal(resumed.decideInputs.length, 1);
    assert.equal(resumed.thinkInputs.length, 1);
});

test("多轮 Think 恢复只跟随 Snapshot 指向的父链，忽略已越过边界的旧输出", async () => {
    const store = new FailOnceGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("think-recovery-linked-tail");
    await store.save(initial);
    const firstAttempt = new ScriptedExecutor(
        async (input, call) => {
            if (call === 1) return requestThink(input, "完成第一项推演");
            if (call === 2) return requestThink(input, "完成第二项推演");
            throw new Error("第二项输出尚未进入 Snapshot");
        },
        async (input, call) => {
            if (call === 2) store.failNextSave = true;
            return {
                goal: input.thinkGoal,
                output: call === 1 ? "第一项已提交" : "第二项未提交",
                modelContextFrame: frame(input, "think"),
            };
        },
    );
    await assert.rejects(
        new Runner({ store, executor: firstAttempt, trajectoryStore: trajectory })
            .run({ goalId: initial.id, runId: "run-1" }),
        /snapshot write failed/,
    );

    const afterFailure = await store.restore(initial.id);
    assert.ok(afterFailure?.state.run.pendingThink);
    const completedBeforeRetry = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        afterFailure.state.run.committedThroughSequence,
    );
    assert.deepEqual(
        completedBeforeRetry.committed
            .filter((event) => event.eventType === "think_completed")
            .map((event) => event.eventType === "think_completed" ? event.payload.output : ""),
        ["第一项已提交"],
    );
    assert.equal(completedBeforeRetry.uncommittedTail.some((event) => event.eventType === "think_completed"), true);

    const retry = new ScriptedExecutor(
        async (input) => {
            assert.deepEqual(input.thinkHistory.map((item) => item.output), [
                "第一项已提交",
                "第二项重试后已提交",
            ]);
            return waitDecision(input);
        },
        async (input) => {
            assert.equal(input.thinkGoal, "完成第二项推演");
            return {
                goal: input.thinkGoal,
                output: "第二项重试后已提交",
                modelContextFrame: frame(input, "think"),
            };
        },
    );
    const result = await new Runner({ store, executor: retry, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    assert.equal(retry.decideInputs.length, 1);
    assert.equal(retry.thinkInputs.length, 1);
});

test("Think 链的模型输入变化时 fail-closed，不调用阶段 Executor", async () => {
    const { store, trajectory, initial, saved } = await createRecoverableThinkChain(
        "think-recovery-input-mismatch",
    );
    assert.ok(saved.state.run.pendingThink);
    await store.save({
        ...saved,
        state: {
            ...saved.state,
            modelSelection: {
                ...saved.state.modelSelection,
                modelId: "changed-after-think",
            },
        },
    });
    const resumed = new ScriptedExecutor(
        async (input) => waitDecision(input),
        async () => { throw new Error("Mismatched recovery must stop before Think"); },
    );

    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(resumed.decideInputs.length, 0);
    assert.equal(resumed.thinkInputs.length, 0);
});

test("Think event 跨 Step 身份时拒绝恢复", async () => {
    const { store, trajectory, initial, saved } = await createRecoverableThinkChain(
        "think-recovery-step-mismatch",
    );
    const pending = saved.state.run.pendingThink;
    assert.ok(pending);
    const index = trajectory.events.findIndex((event) => event.eventType === "think_completed");
    const original = trajectory.events[index];
    assert.ok(original?.eventType === "think_completed");
    trajectory.events[index] = allocateImmutableEvent({
        goalId: original.goalId,
        runId: original.runId,
        phase: original.phase,
        ...(original.executionUnitId === undefined ? {} : { executionUnitId: original.executionUnitId }),
        stepIndex: pending.stepOrdinal + 1,
        ...(original.parentEventId === undefined ? {} : { parentEventId: original.parentEventId }),
        eventType: "think_completed",
        payload: original.payload,
    }, original.sequence, original.eventId, original.occurredAt);
    const resumed = new ScriptedExecutor(
        async (input) => waitDecision(input),
        async () => { throw new Error("Mismatched recovery must stop before Think"); },
    );

    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    assert.equal(result.state.status, "failed");
    assert.equal(resumed.decideInputs.length, 0);
    assert.equal(resumed.thinkInputs.length, 0);
});

test("Think event 跨 Run 身份时拒绝恢复", async () => {
    const { store, trajectory, initial, saved } = await createRecoverableThinkChain(
        "think-recovery-run-mismatch",
    );
    const pending = saved.state.run.pendingThink;
    assert.ok(pending);
    const index = trajectory.events.findIndex((event) => event.eventType === "think_completed");
    const original = trajectory.events[index];
    assert.ok(original?.eventType === "think_completed");
    trajectory.events[index] = allocateImmutableEvent({
        goalId: original.goalId,
        runId: "foreign-run",
        phase: original.phase,
        ...(original.executionUnitId === undefined ? {} : { executionUnitId: original.executionUnitId }),
        stepIndex: pending.stepOrdinal,
        ...(original.parentEventId === undefined ? {} : { parentEventId: original.parentEventId }),
        eventType: "think_completed",
        payload: original.payload,
    }, original.sequence, original.eventId, original.occurredAt);
    const resumed = new ScriptedExecutor(
        async (input) => waitDecision(input),
        async () => { throw new Error("Mismatched recovery must stop before Think"); },
    );

    const result = await new Runner({ store, executor: resumed, trajectoryStore: trajectory })
        .run({ goalId: initial.id, runId: "run-1" });

    assert.equal(result.ok, true);
    assert.equal(result.state.status, "failed");
    assert.equal(resumed.decideInputs.length, 0);
    assert.equal(resumed.thinkInputs.length, 0);
});
