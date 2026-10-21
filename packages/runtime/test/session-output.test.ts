import assert from "node:assert/strict";
import { test } from "node:test";

import {
    classifySessionStreamEvent,
    createGoal,
    GoalSessionStream,
    projectGoalSessionState,
    type Goal,
    type GoalStore,
    type SessionOutputEvent,
} from "../src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { ExecutionStreamEventDraft } from "../../execution-stream/src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class MemoryStore implements GoalStore {
    private readonly goals = new Map<string, Goal>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }
}

function goalFor(goalId: string, runId = "run-1"): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent: "观察类型化会话输出",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId,
    });
}

/** 用固定身份构造一条实时事件，便于断言来源信封。 */
function streamEvent(
    draft: Partial<ExecutionStreamEventDraft> & Pick<ExecutionStreamEventDraft, "kind" | "payload">,
    options: { readonly goalId: string; readonly runId: string; readonly eventId: string; readonly cursor: number },
): Parameters<typeof classifySessionStreamEvent>[0] {
    return {
        goalId: options.goalId,
        runId: options.runId,
        kind: draft.kind,
        visibility: draft.visibility ?? "public",
        durability: draft.durability ?? "live",
        delivery: draft.delivery ?? "control",
        ...(draft.executionUnitId === undefined ? {} : { executionUnitId: draft.executionUnitId }),
        ...(draft.actionId === undefined ? {} : { actionId: draft.actionId }),
        ...(draft.coalescingKey === undefined ? {} : { coalescingKey: draft.coalescingKey }),
        payload: draft.payload,
        eventId: options.eventId,
        cursor: options.cursor,
        occurredAt: "2026-01-01T00:00:00.000Z",
        schemaVersion: 1,
    };
}

test("会话输出按来源事件分类为可辨识联合，不依赖任意 kind 猜测", () => {
    const source = { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 };
    const generated = classifySessionStreamEvent(streamEvent({
        kind: "model_block_delta",
        delivery: "delta",
        payload: { deltaKind: "text", delta: "先检查配置" },
    }, source));
    assert.equal(generated?.type, "generation_event");
    assert.ok(generated?.type === "generation_event" && generated.event.kind === "text_delta");
    if (generated?.type !== "generation_event" || generated.event.kind !== "text_delta") return;
    assert.equal(generated.event.text, "先检查配置");
    assert.equal(generated.event.truncated, false);

    const tool = classifySessionStreamEvent(streamEvent({
        kind: "tool_started",
        actionId: "action-1",
        executionUnitId: "unit-1",
        payload: { toolId: "read_file", input: { path: "src/a.ts" } },
    }, { ...source, eventId: "event-2", cursor: 2 }));
    assert.equal(tool?.type, "tool_activity");
    if (tool?.type !== "tool_activity") return;
    assert.equal(tool.event.kind, "started");
    assert.equal(tool.event.actionId, "action-1");
    assert.equal(tool.event.executionUnitId, "unit-1");

    const terminal = classifySessionStreamEvent(streamEvent({
        kind: "run_completed",
        payload: {},
    }, { ...source, eventId: "event-3", cursor: 3 }));
    assert.equal(terminal?.type, "run_result");
    if (terminal?.type !== "run_result") return;
    assert.equal(terminal.event.kind, "completed");
    assert.equal(terminal.event.runId, "run-1");
});

test("工具生成阶段不产生可响应审批，等待不产生终态结果", () => {
    const source = { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 };
    // 模型仍在生成工具块：只报告生成状态，不报告可响应审批。
    const generating = classifySessionStreamEvent(streamEvent({
        kind: "model_block_delta",
        delivery: "delta",
        payload: { deltaKind: "tool_arguments", delta: "{}" },
    }, source));
    assert.equal(generating, undefined);

    const waiting = classifySessionStreamEvent(streamEvent({
        kind: "run_waiting",
        payload: {},
    }, { ...source, eventId: "event-2", cursor: 2 }));
    assert.equal(waiting?.type, "run_status");
    assert.equal(waiting?.type === "run_status" ? waiting.event.kind : "", "waiting");

    const result = classifySessionStreamEvent(streamEvent({
        kind: "run_completed",
        payload: {},
    }, { ...source, eventId: "event-3", cursor: 3 }));
    assert.equal(result?.type, "run_result");
});

test("私有阶段输出与工具参数不进入公开会话输出", () => {
    const source = { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 };
    for (const kind of [
        "model_response_received",
        "model_context_frame",
        "think_requested",
        "think_completed",
        "model_repair_attempt_started",
        "action_staged",
        "action_approved",
        "action_recovered",
        "observation_recorded",
        "state_committed",
        "memory_patch_accepted",
        "context_lookup_requested",
    ]) {
        const classified = classifySessionStreamEvent(streamEvent({ kind, payload: { secret: "private" } }, source));
        assert.equal(classified, undefined, `${kind} must not produce public output`);
    }
    // 工具原始参数只保留白名单摘要。
    const tool = classifySessionStreamEvent(streamEvent({
        kind: "tool_started",
        actionId: "action-1",
        executionUnitId: "unit-1",
        payload: { toolId: "read_file", input: { path: "src/a.ts", secret: "never expose" } },
    }, source));
    const serialized = JSON.stringify(tool);
    assert.equal(serialized.includes("never expose"), false);
    assert.equal(serialized.includes("src/a.ts"), true);
});

test("提交边界与流故障保持各自语义，不伪装业务终态", () => {
    const source = { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 };
    const boundary = classifySessionStreamEvent(streamEvent({
        kind: "step_committed",
        durability: "checkpoint",
        payload: { commitRevision: 7 },
    }, source));
    assert.equal(boundary?.type, "commit_boundary");
    assert.equal(boundary?.type === "commit_boundary" ? boundary.event.commitRevision : 0, 7);

    const gap = classifySessionStreamEvent(streamEvent({ kind: "live_gap", payload: {} }, source));
    assert.equal(gap?.type, "stream_fault");
    assert.equal(gap?.type === "stream_fault" ? gap.event.kind : "", "gap");
});

test("已提交来源事件保留语义类型并标注提交边界", () => {
    const source = { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 };
    // 已随 Snapshot 落盘的语义事件仍然表达其语义，并标注提交边界。
    const committedTool = classifySessionStreamEvent(streamEvent({
        kind: "tool_started",
        durability: "checkpoint",
        actionId: "action-1",
        executionUnitId: "unit-1",
        payload: { toolId: "read_file", input: { path: "src/a.ts" } },
    }, source));
    assert.equal(committedTool?.type, "tool_activity");
    assert.equal(committedTool?.type === "tool_activity" ? committedTool.event.source.durability : "", "checkpoint");

    // 没有公开语义但已落盘的事实只报告提交边界。
    const committedFact = classifySessionStreamEvent(streamEvent({
        kind: "observation_recorded",
        durability: "checkpoint",
        payload: { observation: { kind: "success" } },
    }, source));
    assert.equal(committedFact?.type, "commit_boundary");

    // 实时来源的同一事实不产生提交边界通知。
    const liveFact = classifySessionStreamEvent(streamEvent({
        kind: "observation_recorded",
        durability: "live",
        payload: { observation: { kind: "success" } },
    }, source));
    assert.equal(liveFact, undefined);
});

test("正式消息通知携带稳定身份、用途与提交修订", () => {
    const committed = classifySessionStreamEvent(streamEvent({
        kind: "message_committed",
        payload: {
            messageId: "msg-1",
            role: "assistant",
            purpose: "answer",
            runId: "run-1",
            position: { afterSequence: 0, order: 0 },
            commitRevision: 9,
            previewId: "candidate-1",
        },
    }, { goalId: "goal-1", runId: "run-1", eventId: "event-1", cursor: 1 }));
    assert.equal(committed?.type, "message_committed");
    assert.equal(committed?.type === "message_committed" ? committed.event.messageId : "", "msg-1");
    assert.equal(committed?.type === "message_committed" ? committed.event.purpose : "", "answer");
    assert.equal(committed?.type === "message_committed" ? committed.event.commitRevision : 0, 9);
    assert.equal(committed?.type === "message_committed" ? committed.event.previewId : "", "candidate-1");
});

test("会话状态投影携带等待引用与有界消息范围", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-state");
    await store.save(goal);
    const state = projectGoalSessionState({ goal, executionOwner: true });
    // Goal 创建时已保存首条用户意图消息：范围必须包含它并给出末尾身份。
    assert.equal(state.messages.count, 1);
    assert.equal(typeof state.messages.throughMessageId, "string");
    assert.equal(state.messages.recent.length, 1);
    assert.equal(state.messages.recent[0]?.role, "user");
    assert.equal(state.messages.recent[0]?.sourceKind, "goal_intent");
    assert.equal(state.interaction, undefined);
});

test("订阅在保存后发出正式消息通知，并按稳定身份去重", async () => {
    const store = new MemoryStore();
    const goal = goalFor("goal-messages");
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const stream = new GoalSessionStream({
        publisher,
        goalId: goal.id,
        readState: async (target) => {
            const current = await store.restore(target);
            return current === undefined ? undefined : projectGoalSessionState({ goal: current, executionOwner: true });
        },
    });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events[0]?.type, "state_sync");

    // 保存一条正式消息后同步：通知只发一次，重复同步不追加第二条。
    const withMessage: Goal = {
        ...goal,
        state: {
            ...goal.state,
            commitRevision: 3,
            messages: [{
                role: "assistant",
                assistant: { profileId: "default" },
                content: "已完成",
                messageId: "msg-1",
                runId: goal.state.run.id,
                position: { afterSequence: 0, order: 0 },
                purpose: "answer",
                source: { kind: "completion_candidate", candidateId: "candidate-1" },
            }],
        },
    };
    await store.save(withMessage);
    await stream.resync();
    await stream.resync();
    const committed = events.filter((event) => event.type === "message_committed");
    assert.equal(committed.length, 1);
    assert.equal(committed[0]?.type === "message_committed" ? committed[0].event.messageId : "", "msg-1");
    assert.equal(committed[0]?.type === "message_committed" ? committed[0].event.previewId : "", "candidate-1");
    assert.equal(committed[0]?.type === "message_committed" ? committed[0].event.commitRevision : 0, 3);

    stream.close();
    await consumed;
});
