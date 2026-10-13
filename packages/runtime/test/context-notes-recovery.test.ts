import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    Runner,
    type AgentProfile,
    type StepExecutor,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { ExecutionAbortedError } from "../../execution-control/src/index";
import { createToolRegistration, type ToolRegistry } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

const sampleTool = {
    id: "sample_tool",
    description: "A test tool",
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
    id: "recovery-notes-profile",
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

test("2.4 & 3.4: 恢复后不重复创建已提交的 notes，且支持基于原 revision 修订", async () => {
    const initial = createGoal({
        ...currentProtocols,
        id: "goal-recovery-notes-1",
        runId: "run-recovery-notes-1",
        intent: "必须遵循设计模式规范",
        promptBundleVersion: 1,
        maxSteps: 8,
        profile,
    });
    const initialWithStage = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_tool"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "架构模式设计与实现",
                    acceptanceCriteria: ["遵循设计模式规范"],
                },
            },
        },
    };
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initialWithStage);

    // 实例 1：提交一个 tool_call 并在 contextNotes 中声明决策，然后模拟在下一步崩溃
    let decideCount = 0;
    const executor1: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide() {
            decideCount++;
            if (decideCount === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-1",
                            toolId: "sample_tool",
                            input: { value: "step-1" },
                        },
                        contextNotes: [
                            {
                                category: "decision",
                                content: "采用工厂模式构建模块",
                                source: {
                                    kind: "agent_decision",
                                    summary: "设计模式选型",
                                },
                            },
                        ],
                    },
                };
            }
            // 模拟在第 2 步崩溃前抛出错误中断
            throw new ExecutionAbortedError();
        },
    };

    const runner1 = new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry: createTestToolRegistry(),
        executor: executor1,
    });

    try {
        await runner1.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    } catch {
        // 预期崩溃
    }

    // 恢复：读取 snapshot 并重新运行
    const restored = await store.restore(initial.id);
    assert.ok(restored !== undefined);

    // 验证 Snapshot 中没有冗余的完整 notes 目录属性
    assert.equal((restored as any).state.run.contextNotes, undefined, "Snapshot RunState 不应包含冗余目录副本");

    // 实例 2：恢复后继续执行，并对 note-1 进行修订（baseRevision: 1）
    let recoveryDecideCount = 0;
    const executor2: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide() {
            recoveryDecideCount++;
            if (recoveryDecideCount === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-2",
                            toolId: "sample_tool",
                            input: { value: "step-2" },
                        },
                        contextNotes: [
                            {
                                noteId: "note-1",
                                baseRevision: 1,
                                category: "decision",
                                content: "调整为抽象工厂模式构建模块",
                                source: {
                                    kind: "agent_decision",
                                    summary: "升级设计模式为抽象工厂",
                                },
                            },
                        ],
                    },
                };
            }
            return {
                kind: "decision",
                decision: {
                    kind: "complete",
                    summary: "恢复后全部完成",
                    evidenceSequences: [13],
                },
            };
        },
    };

    const runner2 = new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry: createTestToolRegistry(),
        executor: executor2,
    });

    const result = await runner2.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);

    // 检查 Trajectory 中关于 context_note_declared 的记录
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    const noteEvents = events.filter((e) => e.eventType === "context_note_declared");

    assert.equal(noteEvents.length, 2, "应有一条初始声明和一条修订记录");
    const payload1 = noteEvents[0]!.payload as any;
    assert.equal(payload1.noteId, "note-1");
    assert.equal(payload1.revision, 1);
    assert.equal(payload1.content, "采用工厂模式构建模块");

    const payload2 = noteEvents[1]!.payload as any;
    assert.equal(payload2.noteId, "note-1");
    assert.equal(payload2.revision, 2);
    assert.equal(payload2.content, "调整为抽象工厂模式构建模块");
});
