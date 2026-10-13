import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal, Runner, type AgentProfile, type StepExecutor } from "../src/index";
import { contract } from "../../contracts/src/index";
import { createToolRegistration, type ToolRegistry } from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const sampleTool = {
    id: "sample_business_tool",
    description: "A business test tool with observable side effect",
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
    id: "notes-exec-profile",
    systemPrompt: "Test System",
    instructions: ["Test Instructions"],
    toolIds: ["sample_business_tool"],
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
                summary: "Echoed successfully",
            };
        },
    });
    return {
        get(id: string) {
            return id === "sample_business_tool" ? reg : undefined;
        },
        has(id: string) {
            return id === "sample_business_tool";
        },
        list() {
            return [reg];
        },
        entries() {
            return [["sample_business_tool", reg]];
        },
    } as unknown as ToolRegistry;
}

test("2.1 & 2.4: 非法 contextNotes 提议在业务副作用发生前被拦截拒绝", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-notes-exec-1",
        intent: "用户要求：必须使用 SQLite 数据库存储",
        profile,
        runId: "run-notes-exec-1",
        maxSteps: 5,
    });
    const initialWithStage = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_business_tool"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "初始化数据库模块",
                    acceptanceCriteria: ["使用 SQLite 数据库存储"],
                },
            },
        },
    };
    await store.save(initialWithStage);

    let sideEffectCount = 0;
    const toolRegistry = createTestToolRegistry(() => {
        sideEffectCount++;
    });

    let decideCount = 0;
    const feedbacksReceived: unknown[] = [];
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide({ runtimeFeedback }) {
            decideCount++;
            if (runtimeFeedback !== undefined) {
                feedbacksReceived.push(runtimeFeedback);
            }
            return {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: `act-${decideCount}`,
                        toolId: "sample_business_tool",
                        input: { value: "run-test" },
                    },
                    // 非法提议：verbatimSnippet 在初始用户消息中并不存在
                    contextNotes: [
                        {
                            category: "user_emphasis",
                            content: "用户要求使用 PostgreSQL",
                            source: {
                                kind: "user_message",
                                messageId: "msg-0",
                                verbatimSnippet: "必须使用 PostgreSQL", // 用户原话是 SQLite
                            },
                        },
                    ],
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

    // 断言：由于提议非法且纠错重试耗尽，业务工具绝对没有执行
    assert.equal(sideEffectCount, 0, "业务工具不应产生任何副作用");
    assert.ok(feedbacksReceived.length > 0, "应收到针对非法 contextNotes 的 feedback 纠错");

    // 检查 trajectory 中绝对没有记录 tool_started 或 context_note_declared
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    const toolEvents = events.filter((e) => e.eventType === "tool_started");
    const noteEvents = events.filter((e) => e.eventType === "context_note_declared");
    assert.equal(toolEvents.length, 0);
    assert.equal(noteEvents.length, 0);
});

test("2.1 & 3.1: 合法 contextNotes 随 tool_call 提交到 Trajectory，不增加额外 Step", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-notes-exec-2",
        intent: "请实现用户模块，必须使用 SQLite 数据库存储",
        profile,
        runId: "run-notes-exec-2",
        maxSteps: 5,
    });
    const initialWithStage = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                exposedToolIds: ["sample_business_tool"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "实现用户模块",
                    acceptanceCriteria: ["使用 SQLite 数据库存储"],
                },
            },
        },
    };
    await store.save(initialWithStage);

    let sideEffectCount = 0;
    const toolRegistry = createTestToolRegistry(() => {
        sideEffectCount++;
    });

    let stepOrdinal = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide({ runtimeFeedback }) {
            stepOrdinal++;
            if (runtimeFeedback) console.log("TEST 2 FEEDBACK:", JSON.stringify(runtimeFeedback));
            if (stepOrdinal === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call",
                        action: {
                            actionId: "act-1",
                            toolId: "sample_business_tool",
                            input: { value: "init" },
                        },
                        contextNotes: [
                            {
                                category: "user_emphasis",
                                content: "数据库选用 SQLite",
                                source: {
                                    kind: "user_message",
                                    messageId: "msg-0",
                                    verbatimSnippet: "必须使用 SQLite 数据库存储",
                                },
                            },
                            {
                                category: "decision",
                                content: "数据表命名采用小写复数形式",
                                source: {
                                    kind: "agent_decision",
                                    summary: "统一数据表命名规范",
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
                    summary: "全部任务完成",
                    evidenceSequences: [1, 2, 3],
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
    assert.equal(sideEffectCount, 1, "业务工具正常执行一次");

    // 检查 trajectory 中成功提交了 context_note_declared 事件
    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    const noteEvents = events.filter((e) => e.eventType === "context_note_declared");
    assert.equal(noteEvents.length, 2, "应记录两个 context_note_declared 事件");

    const note1 = noteEvents[0]!.payload as any;
    assert.equal(note1.noteId, "note-1");
    assert.equal(note1.revision, 1);
    assert.equal(note1.category, "user_emphasis");
    assert.equal(note1.content, "数据库选用 SQLite");

    const note2 = noteEvents[1]!.payload as any;
    assert.equal(note2.noteId, "note-2");
    assert.equal(note2.revision, 1);
    assert.equal(note2.category, "decision");
    assert.equal(note2.content, "数据表命名采用小写复数形式");
});

test("2.1 & 2.4: 覆盖阶段操作与 complete 路径中的 contextNotes 提交", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-notes-exec-3",
        intent: "支持分阶段完成与 contextNotes 提议",
        profile,
        runId: "run-notes-exec-3",
        maxSteps: 5,
    });
    await store.save(initial);

    let stepOrdinal = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async think() { throw new Error("unexpected think"); },
        async decide() {
            stepOrdinal++;
            if (stepOrdinal === 1) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_update",
                        target: "阶段一：初始化",
                        acceptanceCriteria: ["完成环境搭建"],
                        contextNotes: [
                            {
                                category: "decision",
                                content: "初始化阶段环境选型确定",
                                source: {
                                    kind: "agent_decision",
                                    summary: "阶段一技术选型",
                                },
                            },
                        ],
                    },
                };
            }
            if (stepOrdinal === 2) {
                return {
                    kind: "decision",
                    decision: {
                        kind: "run_stage_complete",
                        stageId: "stage-1",
                        summary: "阶段一完成",
                        contextNotes: [
                            {
                                category: "decision",
                                content: "阶段一验收结论通过",
                                source: {
                                    kind: "agent_decision",
                                    summary: "验收通过",
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
                    summary: "最终交付确认",
                    evidenceSequences: [],
                    contextNotes: [
                        {
                            category: "decision",
                            content: "最终交付确认",
                            source: {
                                kind: "agent_decision",
                                summary: "全部任务验收达成",
                            },
                        },
                    ],
                },
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        toolRegistry: createTestToolRegistry(),
        executor,
    });

    const result = await runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    assert.equal(result.ok, true);

    const events = await trajectory.read({ goalId: initial.id, runId: initial.state.run.id });
    const noteEvents = events.filter((e) => e.eventType === "context_note_declared");
    assert.equal(noteEvents.length, 3, "阶段更新、阶段完成与交付均成功提交 context_note_declared");
});
