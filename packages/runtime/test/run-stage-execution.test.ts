import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, Runner, type AgentProfile, type StepExecutor } from "../src/index";
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

function createTestToolRegistry(): ToolRegistry {
    const reg = createToolRegistration({
        definition: sampleTool,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async ({ input }: { input: { value: string } }) => ({
            kind: "success" as const,
            output: { echoed: input.value },
            summary: "Echoed",
        }),
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
    await store.save(hasPreviousStage ? initialWithAcceptedStage : initial);

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

test("未声明任何阶段时提议执行业务工具被严格拦截拒绝", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-no-stage",
        intent: "test stage interception when currentStage is undefined",
        profile,
        runId: "run-no-stage",
        maxSteps: 5,
    });
    // 确保 currentStage 为 undefined
    assert.equal(initial.state.run.currentStage, undefined);
    await store.save(initial);

    let sideEffectCalled = false;
    const toolRegistry = {
        get(id: string) {
            return id === "sample_tool" ? createToolRegistration({
                definition: sampleTool,
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                execute: async () => {
                    sideEffectCalled = true;
                    return { kind: "success" as const, output: { echoed: "done" }, summary: "done" };
                },
            }) : undefined;
        },
        has(id: string) { return id === "sample_tool"; },
        list() { return []; },
        entries() { return []; },
    } as unknown as ToolRegistry;

    let feedbackReceived: any = undefined;
    let step = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide({ runtimeFeedback }) {
            step++;
            if (runtimeFeedback) {
                feedbackReceived = runtimeFeedback;
                return {
                    kind: "decision",
                    decision: { kind: "fail", error: "Interrupted after expected feedback" },
                };
            }
            return {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "act-biz-1",
                        toolId: "sample_tool",
                        input: { value: "test" },
                    },
                },
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry,
        executor,
    });

    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);
    assert.equal(sideEffectCalled, false, "业务工具绝不能被执行");
    assert.ok(feedbackReceived !== undefined, "必须收到纠错 feedback");
    assert.equal(feedbackReceived.code, "STAGE_DECLARATION_REQUIRED");
});
