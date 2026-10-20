import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    GoalSessionStream,
    projectGoalSessionState,
    Runner,
    type AgentDecision,
    type DecideStageResult,
    type Goal,
    type GoalStore,
    type SessionOutputEvent,
    type StepExecutor,
} from "../src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

/**
 * 构造一个只返回完成候选、并携带稳定模型调用身份的 Decide 执行器。
 */
function createCandidateExecutor(options: {
    readonly modelCallId: string;
    readonly summaries: readonly string[];
    readonly review: (attempt: number) => { readonly kind: "accept" | "reject"; readonly feedback?: string };
}): StepExecutor {
    let decideCalls = 0;
    let reviewCalls = 0;
    return {
        async reviewCompletion() {
            reviewCalls += 1;
            return options.review(reviewCalls) as never;
        },
        async decide(input): Promise<DecideStageResult> {
            decideCalls += 1;
            const summary = options.summaries[Math.min(decideCalls - 1, options.summaries.length - 1)]!;
            const decision: AgentDecision = { kind: "complete", summary, evidenceSequences: [] };
            return {
                kind: "decision",
                decision,
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: input.goal.state.run.contextEpoch.number,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                    modelCallId: options.modelCallId,
                },
            };
        },
        async think() {
            throw new Error("unexpected Think call");
        },
    };
}

function createGoalFor(goalId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id: goalId,
        runId: "run-1",
        intent: "交付最终答复",
        promptBundleVersion: 1,
        maxSteps: 8,
        profile: { id: "candidate-test", systemPrompt: "Deliver.", instructions: [], toolIds: [] },
    });
}

test("完成候选在审查接受并保存消息后才成为正式答复", async () => {
    const initial = createGoalFor("candidate-accepted");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const publisher = new InMemoryExecutionStreamPublisher();
    await store.save(initial);
    const executor = createCandidateExecutor({
        modelCallId: "call-accepted",
        summaries: ["最终答复正文"],
        review: () => ({ kind: "accept" }),
    });
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        executionStream: publisher,
    }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");

    const saved = (await store.restore(initial.id))!;
    const answers = saved.state.messages.filter((message) => message.role === "assistant");
    assert.equal(answers.length, 1);
    const answer = answers[0]!;
    assert.equal(answer.role === "assistant" && answer.purpose, "answer");
    assert.equal(answer.content, "最终答复正文");
    assert.equal(answer.runId, "run-1");
    assert.deepEqual(answer.source, { kind: "completion_candidate", candidateId: "call-accepted" });
});

test("审查拒绝的候选被明确作废，且不产生正式答复", async () => {
    const initial = createGoalFor("candidate-rejected");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const publisher = new InMemoryExecutionStreamPublisher();
    await store.save(initial);
    const events: string[] = [];
    const subscription = publisher.subscribe({
        goalId: initial.id,
        runId: initial.state.run.id,
    });
    subscription.onEvent((event) => {
        if (event.kind === "candidate_invalidated") {
            events.push(`${String((event.payload as { candidateId?: unknown }).candidateId)}:${String((event.payload as { reason?: unknown }).reason)}`);
        }
    });

    const executor = createCandidateExecutor({
        modelCallId: "call-rejected",
        summaries: ["被拒绝的候选", "被拒绝的候选", "被拒绝的候选"],
        review: (attempt) => attempt === 1
            ? { kind: "reject", feedback: "缺少证据" }
            : { kind: "reject", feedback: "仍缺少证据" },
    });
    const result = await new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        executionStream: publisher,
    }).run({ goalId: initial.id, runId: "run-1" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // 候选作废不等同于 Run 失败：Run 仍按既有纠错预算结束。
    assert.equal(result.state.status, "failed");
    assert.equal(events.length >= 1, true, JSON.stringify(events));
    assert.equal(events[0], "call-rejected:rejected");
    const saved = (await store.restore(initial.id))!;
    assert.equal(saved.state.messages.some((message) => message.role === "assistant"
        && message.content === "被拒绝的候选"), false);
    assert.equal(trajectory.events.some((event) => event.eventType === "run_completed"), false);
});

test("正式消息通知关联被其替换的预览来源", async () => {
    const initial = createGoalFor("candidate-notify");
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(initial);
    const publisher = new InMemoryExecutionStreamPublisher();
    const executor = createCandidateExecutor({
        modelCallId: "call-notify",
        summaries: ["正式答复"],
        review: () => ({ kind: "accept" }),
    });
    const stream = new GoalSessionStream({
        publisher,
        goalId: initial.id,
        readState: async (target) => {
            const goal = await store.restore(target);
            return goal === undefined ? undefined : projectGoalSessionState({ goal, executionOwner: true });
        },
    });
    const events: SessionOutputEvent[] = [];
    const consumed = (async () => {
        for await (const event of stream) events.push(event);
    })();
    await new Promise((resolve) => setImmediate(resolve));
    // 初始同步只建立基线：订阅前已保存的消息由状态范围表达，不重复通知。
    assert.equal(events.filter((event) => event.type === "message_committed").length, 0);

    const runner = new Runner({ store, trajectoryStore: trajectory, executor, executionStream: publisher });
    await runner.run({ goalId: initial.id, runId: "run-1" });
    await stream.resync();
    await new Promise((resolve) => setImmediate(resolve));

    const committed = events.filter((event) => event.type === "message_committed");
    assert.equal(committed.length, 1);
    const committedEvent = committed[0]!;
    assert.equal(committedEvent.type === "message_committed" ? committedEvent.event.previewId : "", "call-notify");
    assert.equal(committedEvent.type === "message_committed" ? committedEvent.event.purpose : "", "answer");
    const saved = (await store.restore(initial.id))!;
    const answer = saved.state.messages.find((message) => message.role === "assistant");
    assert.equal(committedEvent.type === "message_committed" ? committedEvent.event.messageId : "", answer?.messageId);
    stream.close();
    await consumed;
});
