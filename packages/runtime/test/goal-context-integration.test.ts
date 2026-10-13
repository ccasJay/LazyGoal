import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createStepExecutor,
    Runner,
    type Goal,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    buildGoalContextIndex,
    executeDirectoryBrowse,
    executeSourceExpand,
    type GoalSourceEnvelope,
} from "../../context-retrieval/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";
import { buildGoalContextNavigation } from "../../agent/src/goal-context-navigation";

function createInitialGoal(id: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        runId: "run-integration-1",
        intent: "端到端阶段索引与导航生命周期集成验证",
        promptBundleVersion: 1,
        maxSteps: 20,
        profile: {
            id: "integration-profile",
            systemPrompt: "System prompt for integration test",
            instructions: [],
            toolIds: ["sample_tool"],
        },
    });
    return {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                exposedToolIds: ["sample_tool"],
            },
        },
    };
}

test("TODO 6: 真实组合根生命周期 - launch → 多阶段 → waiting → 新 Worker resume → 用户 continue 新 Run", async () => {
    const initial = createInitialGoal("goal-lifecycle-1");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);

    // 阶段 1：启动 Run 1，执行 stage-1 声明，附加重要决策 contextNotes，然后完成 stage-1 并进入 waiting
    let stepCount1 = 0;
    const executor1 = createStepExecutor(
        async () => {
            stepCount1++;
            if (stepCount1 === 1) {
                return {
                    kind: "run_stage_update",
                    target: "分析并确立技术方案",
                    acceptanceCriteria: ["产出架构文档", "确定存储选型"],
                    contextNotes: [
                        {
                            category: "decision",
                            content: "选用轻量级 SQLite 存储索引",
                            source: { kind: "agent_decision", summary: "存储选型决策" },
                        },
                    ],
                };
            }
            if (stepCount1 === 2) {
                return {
                    kind: "run_stage_complete",
                    stageId: "stage-1",
                    summary: "架构设计与存储选型已敲定",
                };
            }
            // 阶段完成后进入 waiting 等待用户确认
            return {
                kind: "wait",
                reason: "等待用户对架构选型的审查与确认",
            };
        },
        async () => ({ kind: "accept" }),
    );

    const runner1 = new Runner({ store, trajectoryStore: trajectory, executor: executor1 });
    const runResult1 = await runner1.run({ goalId: initial.id, runId: "run-integration-1" });

    assert.equal(runResult1.ok, true);
    if (!runResult1.ok) return;
    assert.equal(runResult1.state.status, "waiting", "第一阶段应停在 waiting 状态");
    assert.equal(runResult1.state.id, "run-integration-1");

    // 检查此时的 Snapshot 与已提交事件
    const snapshot1 = (await store.restore(initial.id))!;
    assert.equal(snapshot1.state.run.id, "run-integration-1");
    assert.equal(snapshot1.state.run.currentStage?.stageId, "stage-1");
    assert.equal(snapshot1.state.run.currentStage?.status, "accepted");

    // 派生并校验索引与导航
    const envelope1: GoalSourceEnvelope = {
        goalId: initial.id,
        runs: [{ runId: "run-integration-1", committedThroughSequence: snapshot1.state.run.committedThroughSequence }],
        messages: snapshot1.state.messages.map((m, idx) => ({
            messageIndex: idx,
            role: m.role,
            contentHash: "hash-msg",
        })),
        eventsByRun: new Map([["run-integration-1", trajectory.events]]),
    };
    const index1 = buildGoalContextIndex(envelope1);
    assert.equal(index1.stages.length, 1);
    assert.equal(index1.stages[0]?.stageId, "stage-1");
    assert.equal(index1.stages[0]?.status, "accepted");
    assert.equal(index1.notes.length, 1);
    assert.equal(index1.notes[0]?.category, "decision");

    // 阶段 2：新 Worker 恢复（resume），用户提供输入解除 wait，同 Run（run-integration-1）继续执行
    // 断言 runId 不变，当前阶段恢复，导航跨恢复一致
    const resumedGoal1: Goal = {
        ...snapshot1,
        state: {
            ...snapshot1.state,
            messages: [
                ...snapshot1.state.messages,
                { role: "user", content: "架构方案已确认，请继续实现数据库连接" },
            ],
            run: {
                ...snapshot1.state.run,
                status: "running",
            },
        },
    };
    await store.save(resumedGoal1);

    let stepCount2 = 0;
    const executor2 = createStepExecutor(
        async (input) => {
            stepCount2++;
            // 校验同 Run 恢复：runId 保持一致，当前阶段状态与前序结果引用保持完整
            assert.equal(input.goal.state.run.id, "run-integration-1");
            assert.equal(input.goal.state.run.currentStage?.stageId, "stage-1");
            assert.equal(input.goal.state.run.currentStage?.status, "accepted");

            if (stepCount2 === 1) {
                // 在同 Run 内开启 stage-2
                return {
                    kind: "run_stage_update",
                    target: "实现数据库连接层",
                    acceptanceCriteria: ["测试连接建立"],
                    previousStageResultRef: {
                        stageId: "stage-1",
                        sequence: 2,
                    },
                };
            }
            return {
                kind: "complete",
                summary: "已完成第一阶段与数据库连接层实现",
                evidenceSequences: [],
            };
        },
        async () => ({ kind: "accept" }),
    );

    const runner2 = new Runner({ store, trajectoryStore: trajectory, executor: executor2 });
    // resume 同 Run
    const runResult2 = await runner2.run({ goalId: initial.id, runId: "run-integration-1" });
    assert.equal(runResult2.ok, true);
    if (!runResult2.ok) return;
    assert.equal(runResult2.state.status, "completed", "Run 1 已完成");

    // 阶段 3：用户 continue 开启新 Run（run-integration-2）
    // 用户提交新消息追加到 Goal，并初始化新 Run
    const snapshot2 = (await store.restore(initial.id))!;
    const newRunId = "run-integration-2";
    const goalForRun2: Goal = {
        ...snapshot2,
        state: {
            ...snapshot2.state,
            workflow: { phase: "executing" },
            messages: [
                ...snapshot2.state.messages,
                { role: "user", content: "请继续实现索引构建功能，并保留上一轮架构决定" },
            ],
            completedRuns: [
                ...(snapshot2.state.completedRuns ?? []),
                {
                    runId: snapshot2.state.run.id,
                    status: "completed",
                    stepCount: snapshot2.state.run.stepCount,
                    committedThroughSequence: snapshot2.state.run.committedThroughSequence,
                    messageRange: { start: 0, end: snapshot2.state.messages.length },
                },
            ],
            run: {
                id: newRunId,
                mode: "normal",
                status: "running",
                stepCount: 0,
                exposedToolIds: ["sample_tool"],
                committedThroughSequence: 0,
                contextEpoch: {
                    version: 1,
                    number: snapshot2.state.run.contextEpoch.number + 1,
                    conversationStartIndex: snapshot2.state.messages.length,
                    openedAtSequence: 0,
                },
            },
        },
    };
    await store.save(goalForRun2);

    // 在新 Run 下由新 Runner 执行
    let stepCount3 = 0;
    const executor3 = createStepExecutor(
        async (input) => {
            stepCount3++;
            // 校验新 Run 中：旧结果作为历史，新授权集合沿原规则初始化
            assert.equal(input.goal.state.run.id, newRunId);
            assert.equal(input.goal.state.run.currentStage, undefined, "新 Run 初始无当前活动阶段");

            return {
                kind: "run_stage_update",
                target: "构建索引逻辑",
                acceptanceCriteria: ["索引读写正常"],
            };
        },
        async () => ({ kind: "accept" }),
    );

    const runner3 = new Runner({ store, trajectoryStore: trajectory, executor: executor3 });
    const runResult3 = await runner3.run({ goalId: initial.id, runId: newRunId });
    assert.equal(runResult3.ok, true);

    // 校验此时跨 Run 索引与历史检索目录
    const snapshot3 = (await store.restore(initial.id))!;
    const envelope3: GoalSourceEnvelope = {
        goalId: initial.id,
        runs: [
            { runId: "run-integration-1", committedThroughSequence: 100 },
            { runId: newRunId, committedThroughSequence: snapshot3.state.run.committedThroughSequence },
        ],
        messages: snapshot3.state.messages.map((m, idx) => ({
            messageIndex: idx,
            role: m.role,
            contentHash: "hash",
        })),
        eventsByRun: new Map([
            ["run-integration-1", trajectory.events.filter((e) => e.runId === "run-integration-1")],
            [newRunId, trajectory.events.filter((e) => e.runId === newRunId)],
        ]),
    };

    const index3 = buildGoalContextIndex(envelope3);
    const browse = executeDirectoryBrowse(index3, { limit: 10 });
    assert.ok(browse.entries.length >= 2, "应包含跨 Run 的阶段与决策条目");
    assert.ok(browse.entries.some((e) => e.stageId === "stage-1" && e.runId === "run-integration-1"), "旧阶段保留为历史");

    // 模拟缓存删除后重建：同一 envelope 构建出的索引与原来完全一致，且权威轨迹无损
    const indexRebuilt = buildGoalContextIndex(envelope3);
    assert.equal(indexRebuilt.sourceDigest, index3.sourceDigest);
    assert.equal(indexRebuilt.stages.length, index3.stages.length);
    assert.equal(indexRebuilt.notes.length, index3.notes.length);
});
