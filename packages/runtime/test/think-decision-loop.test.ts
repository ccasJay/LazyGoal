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
    createGoal,
    Runner,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

const profile: AgentProfile = {
    id: "think-loop-profile",
    systemPrompt: "执行测试代理",
    instructions: [],
    toolIds: [],
};

function createExecutingGoal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        intent: "验证 Decide 与 Think 阶段循环",
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
                    objective: "完成阶段循环测试",
                    completionCriteria: [{ text: "Think 提交后继续 Decide" }],
                },
            },
        },
    };
}

function frame(input: StepExecutionInput, stage: "decide" | "think"): Omit<ModelContextFramePayload, "type"> {
    return {
        stage,
        epochNumber: input.goal.state.run.contextEpoch.number,
        conversationPosition: input.goal.state.messages.length,
        sections: [],
    };
}

class StagedExecutor implements StepExecutor {
    readonly decideHistorySizes: number[] = [];
    readonly thinkTargets: string[] = [];
    readonly committedThinkCountsSeenByDecide: number[] = [];
    thinkCalls = 0;

    constructor(
        private readonly store: Pick<GoalStore, "restore">,
        private readonly trajectory: InMemoryTrajectoryStore,
        private readonly requestCount: number,
        private readonly beforeRequestThink?: () => void,
    ) {}

    async execute(): Promise<AgentDecision> {
        throw new Error("Runner should use the stage methods");
    }

    async decide(input: StepExecutionInput & {
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<DecideStageResult> {
        this.decideHistorySizes.push(input.thinkHistory.length);
        const snapshot = await this.store.restore(input.goal.id);
        const committed = snapshot?.state.run.committedThroughSequence ?? 0;
        const events = await this.trajectory.readWithBoundary({
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
        }, committed);
        const completed = events.committed.filter((event) => event.eventType === "think_completed").length;
        this.committedThinkCountsSeenByDecide.push(completed);

        if (input.thinkHistory.length < this.requestCount) {
            this.beforeRequestThink?.();
            return {
                kind: "request_think" as const,
                goal: `验证第 ${input.thinkHistory.length + 1} 个阶段边界`,
                modelContextFrame: frame(input, "decide"),
            };
        }
        return {
            kind: "decision" as const,
            decision: { kind: "wait", reason: "阶段循环验证完成" },
            modelContextFrame: frame(input, "decide"),
        };
    }

    async think(input: StepExecutionInput & {
        readonly thinkGoal: string;
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<ThinkStageResult> {
        this.thinkCalls += 1;
        this.thinkTargets.push(input.thinkGoal);
        const snapshot = await this.store.restore(input.goal.id);
        assert.ok(snapshot);
        const committed = snapshot.state.run.committedThroughSequence ?? 0;
        const events = await this.trajectory.readWithBoundary({
            goalId: input.goal.id,
            runId: input.goal.state.run.id,
        }, committed);
        assert.ok(events.committed.some((event) =>
            event.eventType === "think_requested"
            && event.payload.goal === input.thinkGoal,
        ));
        return {
            goal: input.thinkGoal,
            output: `已完成：${input.thinkGoal}`,
            modelContextFrame: frame(input, "think"),
        };
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

async function runStaged(requestCount: number) {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal(`think-loop-${requestCount}`);
    await store.save(initial);
    const executor = new StagedExecutor(store, trajectory, requestCount);
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });
    const result = await runner.run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    const committed = await trajectory.readWithBoundary({ goalId: initial.id, runId: "run-1" }, result.state.committedThroughSequence ?? 0);
    return { result, executor, committed };
}

test("直接 Decide 只推进一个 Step，不调用 Think", async () => {
    const { result, executor, committed } = await runStaged(0);
    assert.equal(executor.thinkCalls, 0);
    assert.deepEqual(executor.decideHistorySizes, [0]);
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastStep?.kind, "decision");
    assert.equal(committed.committed.filter((event) => event.eventType === "think_completed").length, 0);
});

test("同一 Step 可连续请求三次 Think；每个输出提交后才继续 Decide", async () => {
    const { result, executor, committed } = await runStaged(3);
    assert.equal(executor.thinkCalls, 3);
    assert.deepEqual(executor.decideHistorySizes, [0, 1, 2, 3]);
    assert.deepEqual(executor.committedThinkCountsSeenByDecide, [0, 1, 2, 3]);
    assert.equal(executor.thinkTargets.length, 3);
    assert.equal(new Set(executor.thinkTargets).size, 3);
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastStep?.kind, "decision");
    assert.equal(committed.committed.filter((event) => event.eventType === "think_requested").length, 3);
    assert.equal(committed.committed.filter((event) => event.eventType === "think_completed").length, 3);
    const frames = committed.committed.filter((event) => event.eventType === "model_context_frame");
    assert.equal(frames.filter((event) =>
        event.eventType === "model_context_frame" && event.payload.stage === "think",
    ).length, 3);
    assert.equal(frames.filter((event) =>
        event.eventType === "model_context_frame" && event.payload.stage === "decide",
    ).length, 4);
});

test("Think 请求检查点写入失败时不伪造决策，也不调用 Think", async () => {
    const store = new FailOnceGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const initial = createExecutingGoal("think-loop-checkpoint-failure");
    await store.save(initial);
    const executor = new StagedExecutor(
        store,
        trajectory,
        1,
        () => { store.failNextSave = true; },
    );
    const runner = new Runner({ store, executor, trajectoryStore: trajectory });

    await assert.rejects(
        runner.run({ goalId: initial.id, runId: "run-1" }),
        /snapshot write failed/,
    );

    assert.equal(executor.thinkCalls, 0);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.stepCount, 0);
    assert.equal(saved.state.run.lastStep, undefined);
    const boundary = await trajectory.readWithBoundary(
        { goalId: initial.id, runId: "run-1" },
        saved.state.run.committedThroughSequence ?? 0,
    );
    assert.equal(boundary.committed.some((event) =>
        event.eventType === "decision_received" || event.eventType === "think_completed",
    ), false);
    assert.equal(boundary.uncommittedTail.some((event) => event.eventType === "think_requested"), true);
});
