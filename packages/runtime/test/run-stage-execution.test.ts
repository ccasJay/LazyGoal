import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, Runner, type AgentProfile, type Goal, type StepExecutor } from "../src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type ToolRegistry } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const sampleTool = {
    id: "sample_tool",
    description: "A business test tool",
    parametersSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
    },
    inputContract: contract.object({ value: contract.string() }),
    isReadOnly: false,
    execute: async ({ value }: { value: string }) => ({ echoed: value }),
};

const profile: AgentProfile = {
    id: "stage-exec-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: ["sample_tool"],
};

function createTestToolRegistry(onExecute?: () => void): ToolRegistry {
    const reg = createToolRegistration({
        definition: sampleTool,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async ({ input }: { input: { value: string } }) => {
            onExecute?.();
            return {
                kind: "success" as const,
                output: { echoed: input.value },
                summary: "Echoed",
            };
        },
    });
    return {
        get(id: string) {
            return id === "sample_tool" ? reg : undefined;
        },
        has(id: string) {
            return id === "sample_tool";
        },
        list() {
            return [reg];
        },
        entries() {
            return [["sample_tool", reg]];
        },
    } as unknown as ToolRegistry;
}

for (const hasPreviousStage of [true]) {
test(`accepted stage: Business tool call without an active run stage is rejected with feedback requiring stage declaration`, async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-exec-1",
        intent: "test stage interception",
        profile,
        runId: "run-stage-exec-1",
        maxSteps: 5,
    });
    const initialWithAcceptedStage = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_tool"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "accepted" as const,
                    target: "前序阶段",
                    acceptanceCriteria: ["已完成"],
                    acceptedSequence: 10,
                },
            },
        },
    };
    await store.save(hasPreviousStage ? initialWithAcceptedStage : {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_tool"],
            },
        },
    });

    let decideCount = 0;
    const feedbacksReceived: unknown[] = [];

    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal, runtimeFeedback }) {
            decideCount += 1;
            if (runtimeFeedback !== undefined) {
                feedbacksReceived.push(runtimeFeedback);
            }

            if (decideCount === 1) {
                // 上一阶段已结束，未声明新阶段直接尝试调用业务工具
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-1",
                            toolId: "sample_tool",
                            input: { value: "hello" },
                        },
                    },
                };
            }

            // 收到反馈后，先声明下一阶段
            if (decideCount === 2) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "完成第二阶段测试",
                        acceptanceCriteria: ["成功调用一次工具"],
                    },
                };
            }

            // 之后再调用业务工具
            if (decideCount === 3) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-2",
                            toolId: "sample_tool",
                            input: { value: "hello again" },
                        },
                    },
                };
            }

            return {
                kind: "decision",
                decision: { kind: "fail", error: "done" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const toolRegistry = createTestToolRegistry();
    const runner = new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    // 应该收到了要求先声明阶段的反馈
    assert.ok(feedbacksReceived.length >= 1, "Should receive runtimeFeedback for missing stage");
    const feedback = feedbacksReceived[0] as { code?: string; constraints?: string[] };
    assert.equal(feedback.code, "STAGE_DECLARATION_REQUIRED");

    // 检查快照中已成功声明下一阶段 stage-2，并保留了前序 stage-1 引用
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.ok(saved.state.run.currentStage);
    assert.equal(saved.state.run.currentStage.stageId, hasPreviousStage ? "stage-2" : "stage-1");
    assert.equal(saved.state.run.currentStage.target, "完成第二阶段测试");
    assert.deepEqual(saved.state.run.currentStage.previousStageResultRef, hasPreviousStage ? {
        stageId: "stage-1",
        sequence: 10,
    } : undefined);
});

}

test("1.1 & 2.2: Stage update with invalid target or stale revision is rejected with feedback", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-exec-2",
        intent: "test invalid stage rejection",
        profile,
        runId: "run-stage-exec-2",
        maxSteps: 5,
    });
    await store.save(initial);

    let decideCount = 0;
    const feedbacksReceived: unknown[] = [];

    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ runtimeFeedback }) {
            decideCount += 1;
            if (runtimeFeedback !== undefined) {
                feedbacksReceived.push(runtimeFeedback);
            }

            if (decideCount === 1) {
                // 提交目标为空的阶段
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "   ",
                        acceptanceCriteria: ["条件 1"],
                    },
                };
            }

            if (decideCount === 2) {
                // 正常声明阶段 1
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "有效阶段 1",
                        acceptanceCriteria: ["条件 1"],
                    },
                };
            }

            if (decideCount === 3) {
                // 尝试提交过期修订（当前 revision 为 1，但传入 baseRevision: 99）
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        stageId: "stage-1",
                        baseRevision: 99,
                        reason: "过期修订测试",
                        target: "新目标",
                        acceptanceCriteria: ["新条件"],
                    },
                };
            }

            return {
                kind: "decision",
                decision: { kind: "fail", error: "test stop" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    assert.ok(feedbacksReceived.length >= 2, "Should receive feedback for both empty target and stale revision");

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    // 阶段未被错误覆盖为过期修订，保持 revision 为 1
    assert.equal(saved.state.run.currentStage?.revision, 1);
    assert.equal(saved.state.run.currentStage?.target, "有效阶段 1");
});

test("1.2, 1.3 & 1.4: Stage declarations advance Step, keep Goal/Run identity and do not call continue", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-exec-3",
        intent: "test identity and step count",
        profile,
        runId: "run-stage-exec-3",
        maxSteps: 5,
    });
    await store.save(initial);

    let decideCount = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide() {
            decideCount += 1;
            if (decideCount === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "阶段 1",
                        acceptanceCriteria: ["条件 A"],
                    },
                };
            }
            if (decideCount === 2) {
                // 修订阶段 1
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        stageId: "stage-1",
                        baseRevision: 1,
                        reason: "补充条件 B",
                        target: "阶段 1 (修订后)",
                        acceptanceCriteria: ["条件 A", "条件 B"],
                    },
                };
            }
            return {
                kind: "decision",
                decision: { kind: "fail", error: "end of test" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    const saved = await store.restore(initial.id);
    assert.ok(saved);
    // 确认 runId 和 goalId 保持不变
    assert.equal(saved.id, initial.id);
    assert.equal(saved.state.run.id, initial.state.run.id);

    // 两个阶段声明操作各计入一个 Step，最后 fail 终止，总共至少 2 个已提交 step
    assert.ok(saved.state.run.stepCount >= 2);

    // 阶段状态正确
    assert.equal(saved.state.run.currentStage?.stageId, "stage-1");
    assert.equal(saved.state.run.currentStage?.revision, 2);
    assert.equal(saved.state.run.currentStage?.target, "阶段 1 (修订后)");

    // 验证 Trajectory 记录了 run_stage_declared 事件
    const stageEvents = trajectory.events.filter(e => e.eventType === "run_stage_declared");
    assert.equal(stageEvents.length, 2);
    assert.equal(stageEvents[0]?.payload.type, "run_stage_declared");
    assert.equal((stageEvents[0]?.payload as any).revision, 1);
    assert.equal((stageEvents[1]?.payload as any).revision, 2);
    assert.equal((stageEvents[1]?.payload as any).reason, "补充条件 B");
});

test("1.2 & 2.4: Steer inputs are durably accepted and applied during stage updates without loss", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-steer",
        intent: "test steer with stage update",
        profile,
        runId: "run-stage-steer",
        maxSteps: 5,
    });
    await store.save(initial);

    function deferred() {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
    }

    const entered = deferred();
    const release = deferred();
    let calls = 0;
    const sampledMessages: string[][] = [];

    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            sampledMessages.push(goal.state.messages.map(m => m.content));
            if (calls === 1) {
                entered.resolve();
                await release.promise;
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "初始阶段",
                        acceptanceCriteria: ["条件 1"],
                    },
                };
            }
            return {
                kind: "decision",
                decision: { kind: "fail", error: "test terminal" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await entered.promise;

    const steerResult = await runner.steer({ goalId: initial.id, runId: initial.state.run.id }, "steer-stage-1", "用户补充说明");
    assert.equal(steerResult.ok, true);
    release.resolve();

    const result = await execution;
    assert.equal(result.ok, true);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    // 确认 steer 消息在 messages 中被持久化记录且索引正确
    assert.ok(saved.state.messages.some(m => m.content === "用户补充说明"));
    assert.ok(saved.state.run.steerInputs);
    assert.equal(saved.state.run.steerInputs.length, 1);
    assert.equal(saved.state.run.steerInputs[0]?.messageId, "steer-stage-1");
    assert.equal(saved.state.run.steerInputs[0]?.status, "applied");
});

test("Item 5: Business tool call without declared stage (currentStage === undefined) is rejected with STAGE_DECLARATION_REQUIRED and executes zero side effects", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-exec-undefined",
        intent: "test stage interception when currentStage is undefined",
        profile,
        runId: "run-stage-exec-undefined",
        maxSteps: 5,
    });
    await store.save({
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_tool"],
            },
        },
    });

    let decideCount = 0;
    let toolExecutionCount = 0;
    const feedbacksReceived: unknown[] = [];

    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ runtimeFeedback }) {
            decideCount += 1;
            if (runtimeFeedback !== undefined) {
                feedbacksReceived.push(runtimeFeedback);
            }

            if (decideCount === 1) {
                // 未声明阶段，直接尝试调用业务工具
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-1",
                            toolId: "sample_tool",
                            input: { value: "hello" },
                        },
                    },
                };
            }

            if (decideCount === 2) {
                // 收到反馈后先声明阶段
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "执行阶段 1",
                        acceptanceCriteria: ["业务工具执行成功"],
                    },
                };
            }

            if (decideCount === 3) {
                // 声明阶段后再次调用业务工具
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-2",
                            toolId: "sample_tool",
                            input: { value: "hello after stage" },
                        },
                    },
                };
            }

            return {
                kind: "decision",
                decision: { kind: "fail", error: "done" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const toolRegistry = createTestToolRegistry(() => {
        toolExecutionCount += 1;
    });
    const runner = new Runner({ store, trajectoryStore: trajectory, executor, toolRegistry });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });

    assert.equal(result.ok, true);
    assert.ok(feedbacksReceived.length >= 1, "Should receive runtimeFeedback for missing stage");
    const feedback = feedbacksReceived[0] as { code?: string; constraints?: string[] };
    assert.equal(feedback.code, "STAGE_DECLARATION_REQUIRED");
    // 第 1 步被拦截（零副作用），仅第 3 步在声明阶段后执行了一次业务工具
    assert.equal(toolExecutionCount, 1);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.ok(saved.state.run.currentStage);
    assert.equal(saved.state.run.currentStage.stageId, "stage-1");
    assert.equal(saved.state.run.currentStage.status, "executing");
});

test("Item 1: 阶段完成与 notes 提交后，历史阶段与 notes 真实接入后续 Step 的模型请求与导航投影", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stage-nav-e2e",
        intent: "test historical stages and notes wired into model requests",
        profile,
        runId: "run-stage-nav-1",
        maxSteps: 10,
    });
    await store.save(initial);

    let step = 0;
    const observedHistoricalStagesInDecide: unknown[] = [];
    const observedNotesInDecide: unknown[] = [];

    const executor: StepExecutor = {
        async reviewCompletion() {
            return { kind: "accept" };
        },
        async decide(input) {
            step += 1;
            observedHistoricalStagesInDecide.push(input.goal.state.historicalStages);
            observedNotesInDecide.push(input.goal.state.notes);

            if (step === 1) {
                // 第 1 步：声明阶段 1，附带一个 Agent 决策 note
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "第一阶段目标",
                        acceptanceCriteria: ["条件 1"],
                        contextNotes: [
                            {
                                category: "decision",
                                content: "决定采用方案 A",
                                source: { kind: "agent_decision", summary: "技术选型" },
                            },
                        ],
                    },
                };
            }

            if (step === 2) {
                // 第 2 步：完成阶段 1
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_complete",
                        stageId: "stage-1",
                        summary: "第一阶段圆满完成",
                    },
                };
            }

            if (step === 3) {
                // 第 3 步：声明阶段 2
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "第二阶段目标",
                        acceptanceCriteria: ["条件 2"],
                    },
                };
            }

            if (step === 4) {
                // 第 4 步：完成阶段 2
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_complete",
                        stageId: "stage-2",
                        summary: "第二阶段也完成",
                    },
                };
            }

            // 第 5 步：完成测试
            return {
                kind: "decision",
                decision: {
                    kind: "fail",
                    error: "done",
                },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);

    // 检查第 1 步执行前（初始化状态）：尚未产生历史阶段
    assert.equal(observedHistoricalStagesInDecide[0], undefined);

    // 检查第 2 步（阶段 1 已声明，note 已提交）：notes 接入
    const notesInStep2 = observedNotesInDecide[1] as any[];
    assert.ok(notesInStep2 && notesInStep2.length === 1, "第 2 步应能够看到第 1 步提交的 note");
    assert.equal(notesInStep2[0]?.noteId, "note-1");
    assert.equal(notesInStep2[0]?.content, "决定采用方案 A");

    // 检查第 3 步（阶段 1 已 accept 完成）：阶段 1 成为历史阶段，接入后续模型请求！
    const histInStep3 = observedHistoricalStagesInDecide[2] as any[];
    assert.ok(histInStep3 && histInStep3.length === 1, "第 3 步应能够看到已完成的阶段 1");
    assert.equal(histInStep3[0]?.stageId, "stage-1");
    assert.equal(histInStep3[0]?.status, "accepted");
    assert.equal(histInStep3[0]?.summary, "第一阶段圆满完成");

    // 检查第 4 步：阶段 1 仍在历史阶段中，notes 仍然保留
    const histInStep4 = observedHistoricalStagesInDecide[3] as any[];
    assert.ok(histInStep4 && histInStep4.length === 1);
    assert.equal(histInStep4[0]?.stageId, "stage-1");

    // 检查第 5 步：阶段 1 和阶段 2 均已成为历史阶段
    const histInStep5 = observedHistoricalStagesInDecide[4] as any[];
    assert.ok(histInStep5 && histInStep5.length === 2, "第 5 步应看到阶段 1 与阶段 2 均已成为历史阶段");
    assert.equal(histInStep5[0]?.stageId, "stage-1");
    assert.equal(histInStep5[1]?.stageId, "stage-2");
    assert.equal(histInStep5[1]?.summary, "第二阶段也完成");

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.status, "failed");
});

test("Item 2: 跨 Run 场景下，新 Run 自动恢复前序 Run 的历史阶段与 notes，且新分配的 noteId 单调递增不发生冲突", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);

    // 1. 先运行 Run 1
    const goalRun1 = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-cross-run-nav",
        intent: "test cross-run navigation and note sequence",
        profile,
        runId: "run-first",
        maxSteps: 5,
    });
    await store.save(goalRun1);

    let stepRun1 = 0;
    const executorRun1: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide() {
            stepRun1 += 1;
            if (stepRun1 === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "Run1 阶段 1",
                        acceptanceCriteria: ["Run1 条件"],
                        contextNotes: [
                            {
                                category: "decision",
                                content: "Run1 技术决策",
                                source: { kind: "agent_decision", summary: "选型" },
                            },
                        ],
                    },
                };
            }
            if (stepRun1 === 2) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_complete",
                        stageId: "stage-1",
                        summary: "Run1 阶段 1 达成",
                    },
                };
            }
            return {
                kind: "decision",
                decision: { kind: "fail", error: "Run 1 done" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner1 = new Runner({ store, trajectoryStore: trajectory, executor: executorRun1 });
    await runner1.runUntilBlocked({ goalId: goalRun1.id, runId: "run-first" });

    // 2. 模拟新 Run 2（归档 Run 1 到 completedRuns）
    const savedAfterRun1 = await store.restore(goalRun1.id);
    assert.ok(savedAfterRun1);
    const { historicalStages: _h, notes: _n, ...cleanState } = savedAfterRun1.state;
    const goalRun2: Goal = {
        ...savedAfterRun1,
        state: {
            ...cleanState,
            completedRuns: [
                {
                    runId: "run-first",
                    status: "failed",
                    stepCount: savedAfterRun1.state.run.stepCount,
                    messageRange: { start: 0, end: savedAfterRun1.state.messages.length - 1 },
                    committedThroughSequence: savedAfterRun1.state.run.committedThroughSequence,
                },
            ],
            run: {
                id: "run-second",
                status: "created",
                mode: "normal",
                stepCount: 0,
                exposedToolIds: [],
                committedThroughSequence: 0,
                contextEpoch: savedAfterRun1.state.run.contextEpoch,
            },
        },
    };
    await store.save(goalRun2);

    // 3. 运行 Run 2
    let observedHistInRun2: unknown = undefined;
    let observedNotesInRun2: unknown = undefined;
    let stepRun2 = 0;

    const executorRun2: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input) {
            stepRun2 += 1;
            if (stepRun2 === 1) {
                observedHistInRun2 = input.goal.state.historicalStages;
                observedNotesInRun2 = input.goal.state.notes;

                // 在 Run 2 中提议新 note，不传 noteId，应分配 note-2 而不是冲突覆盖 note-1
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "Run2 阶段 1",
                        acceptanceCriteria: ["Run2 条件"],
                        contextNotes: [
                            {
                                category: "decision",
                                content: "Run2 新决策",
                                source: { kind: "agent_decision", summary: "新规划" },
                            },
                        ],
                    },
                };
            }
            if (stepRun2 === 2) {
                // 检查 Run 2 第 2 步的 notes
                observedNotesInRun2 = input.goal.state.notes;
                return {
                    kind: "decision",
                    decision: { kind: "fail", error: "Run 2 done" },
                };
            }
            return {
                kind: "decision",
                decision: { kind: "fail", error: "done" },
            };
        },
        async think() { throw new Error("unexpected think"); },
    };

    const runner2 = new Runner({ store, trajectoryStore: trajectory, executor: executorRun2 });
    await runner2.runUntilBlocked({ goalId: goalRun2.id, runId: "run-second" });

    // 验证 Run 2 第 1 步成功继承 Run 1 的历史阶段与 notes
    const histRun2 = observedHistInRun2 as any[];
    assert.ok(histRun2 && histRun2.length === 1, "Run 2 应继承 Run 1 已完成的阶段");
    assert.equal(histRun2[0]?.stageId, "stage-1");
    assert.equal(histRun2[0]?.runId, "run-first");
    assert.equal(histRun2[0]?.summary, "Run1 阶段 1 达成");

    const notesAtStartRun2 = observedNotesInRun2 as any[];
    assert.ok(notesAtStartRun2 && notesAtStartRun2.length === 2, "Run 2 第 2 步应同时包含 note-1 与新分配的 note-2");
    assert.equal(notesAtStartRun2[0]?.noteId, "note-1");
    assert.equal(notesAtStartRun2[1]?.noteId, "note-2", "新分配的 noteId 必须自增为 note-2，避免跨 Run 覆盖");
    assert.equal(notesAtStartRun2[1]?.content, "Run2 新决策");
});


