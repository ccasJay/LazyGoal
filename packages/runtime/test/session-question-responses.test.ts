import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore, JsonFileGoalStore } from "../../storage/src/index";
import { ModelInferenceProjector } from "../../model-context/src/index";
import type { WorkingMemory } from "../../working-memory/src/index";
import { trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-question-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

const profiles: AgentProfileRegistry = {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    },
};

const workingMemory: WorkingMemory = {
    protocolVersion: 1,
    derivedThroughSequence: 0,
    facts: [],
    hypotheses: [],
    blockers: [],
};

let harnessCounter = 0;

interface QuestionHarness {
    readonly sessions: SessionManager;
    readonly calls: () => number;
    readonly inputs: () => readonly StepExecutionInput[];
    readonly failures: () => readonly unknown[];
    /** 第二次 Decide 时按真实投影器生成的模型会话；用于断言下一轮模型输入。 */
    readonly projections: () => readonly (readonly { readonly role: string; readonly content: string }[])[];
}

function createHarness(options: {
    readonly store: InMemoryGoalStore | JsonFileGoalStore;
    readonly decide: (input: StepExecutionInput, callIndex: number) => AgentDecision;
}): QuestionHarness {
    const trajectory = trajectoryStoreFor(options.store as InMemoryGoalStore);
    const committer = new TrajectoryCheckpointCommitter({ store: options.store, trajectoryStore: trajectory });
    let calls = 0;
    harnessCounter += 1;
    const harnessId = harnessCounter;
    let runCounter = 0;
    const nextRunId = (): string => `run-question-${harnessId}-${++runCounter}`;
    const inputs: StepExecutionInput[] = [];
    const projections: (readonly { readonly role: string; readonly content: string }[])[] = [];
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            calls += 1;
            inputs.push(input);
            if (calls === 2) {
                // 问答结算后的下一轮请求组装就在此时发生：使用真实投影器捕获模型会话。
                projections.push(new ModelInferenceProjector().project(input.goal, [], workingMemory)
                    .conversation.map((message) => ({ role: message.role, content: message.content })));
            }
            return {
                kind: "decision",
                decision: await options.decide(input, calls),
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: input.goal.state.run.contextEpoch.number,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                },
            };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store: options.store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store: options.store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
    });
    const failures: unknown[] = [];
    const sessions = new SessionManager({
        store: options.store,
        committer,
        coordinator,
        profiles,
        runIdGenerator: nextRunId,
        onBackgroundFailure: (_goalId, error) => { failures.push(error); },
    });
    return {
        sessions,
        calls: () => calls,
        inputs: () => [...inputs],
        failures: () => [...failures],
        projections: () => [...projections],
    };
}

const askUserDecision: AgentDecision = {
    kind: "ask_user",
    questions: [{
        header: "Delivery scope",
        question: "Which delivery scope should be implemented?",
        options: [{ label: "Minimal" }, { label: "Complete" }],
        multiSelect: false,
    }],
};

async function reachQuestion(
    options: { readonly secondDecision?: (input: StepExecutionInput) => AgentDecision } = {},
): Promise<{
    readonly store: InMemoryGoalStore;
    readonly goalId: string;
    readonly goal: Goal;
    readonly requestId: string;
    readonly questionId: string;
    readonly optionId: string;
    readonly harness: QuestionHarness;
}> {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (input, callIndex) => callIndex === 1
            ? askUserDecision
            : options.secondDecision?.(input) ?? { kind: "complete", summary: "完成", evidenceSequences: [] },
    });
    const goalId = "goal-question-responses";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "需要回答问卷的任务",
        profileId: profile.id,
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const goal = (await store.restore(goalId))!;
    assert.equal(goal.state.run.status, "waiting");
    const pending = goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "ask_user");
    const question = pending.questions[0]!;
    return {
        store,
        goalId,
        goal,
        requestId: pending.requestId,
        questionId: question.id,
        optionId: question.options[0]!.id,
        harness,
    };
}

test("逐题回答在同一 Run 结算一次并恢复真实模型输入", async () => {
    const scenario = await reachQuestion();
    const goal = scenario.goal;
    const runId = goal.state.run.id;
    const messageCount = goal.state.messages.length;

    const result = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-answer",
        runId,
        requestId: scenario.requestId,
        response: {
            kind: "answer_ask_user",
            answers: [{ questionId: scenario.questionId, optionIds: [scenario.optionId] }],
        },
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.receipt.kind, "respond");
    assert.equal(result.ok && result.receipt.status, "applied");
    assert.equal(result.ok && result.receipt.appliedRunId, runId);
    await scenario.harness.sessions.waitForIdle();

    const settled = (await scenario.store.restore(scenario.goalId))!;
    assert.equal(settled.state.run.id, runId, "回答继续原 Run，不创建后继 Run");
    const answerMessages = settled.state.messages.filter((message) =>
        message.role === "user" && message.content.includes("Answer: Minimal"));
    assert.equal(answerMessages.length, 1, "逐题答案只追加一条消息");
    assert.match(answerMessages[0]!.content, /Which delivery scope/);
    assert.equal(settled.state.messages.length, messageCount + 2, "答案消息与最终助手回复各一条");
    assert.equal(settled.state.run.pendingInteraction, undefined);
    assert.equal(settled.state.completedRuns?.length ?? 0, 0);
    assert.equal(scenario.harness.calls(), 2, "回答后调用一次下一模型阶段");

    // 下一模型阶段收到的真实用户消息就是已提交的答案。
    const nextInput = scenario.harness.inputs().at(-1)!;
    assert.equal(nextInput.goal.state.messages.some((message) =>
        message.role === "user" && message.content.includes("Answer: Minimal")), true);

    // 重复提交返回原收据，不追加第二条消息。
    const replay = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-answer",
        runId,
        requestId: scenario.requestId,
        response: {
            kind: "answer_ask_user",
            answers: [{ questionId: scenario.questionId, optionIds: [scenario.optionId] }],
        },
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.ok && replay.existing, true);
    await scenario.harness.sessions.waitForIdle();
    assert.equal((await scenario.store.restore(scenario.goalId))!.state.messages.length, messageCount + 2);
});

test("整体回复替代整份问卷：原文成为真实用户消息且不伪造逐题答案", async () => {
    const scenario = await reachQuestion();
    const runId = scenario.goal.state.run.id;
    const messageCount = scenario.goal.state.messages.length;
    const reply = "请按完整范围交付，并补充兼容性说明。";

    const result = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-reply",
        runId,
        requestId: scenario.requestId,
        response: { kind: "reply_to_question", content: reply },
    });
    assert.equal(result.ok, true);
    await scenario.harness.sessions.waitForIdle();

    const settled = (await scenario.store.restore(scenario.goalId))!;
    assert.equal(settled.state.run.id, runId);
    assert.equal(settled.state.messages.length, messageCount + 2);
    assert.deepEqual(settled.state.messages.at(-2), { role: "user", content: reply });
    assert.equal(settled.state.run.pendingInteraction, undefined);
    assert.equal(settled.state.completedRuns?.length ?? 0, 0);

    const nextInput = scenario.harness.inputs().at(-1)!;
    assert.deepEqual(nextInput.goal.state.messages.at(-1), { role: "user", content: reply });

    // 模型可见输入来自真实投影：原文完整保留，且不包含伪造的逐题 Answer 块。
    const conversation = scenario.harness.projections().at(-1);
    assert.ok(conversation !== undefined);
    assert.deepEqual(conversation.at(-1), { role: "user", content: reply });
    assert.equal(conversation.some((message) => message.role === "user" && message.content.includes("Answer: ")), false);
});

test("跳过问卷提交未回答并要求继续的控制语义，不把 Run 标记为 cancelled", async () => {
    const scenario = await reachQuestion();
    const runId = scenario.goal.state.run.id;
    const messageCount = scenario.goal.state.messages.length;

    const result = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-skip",
        runId,
        requestId: scenario.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(result.ok, true);
    await scenario.harness.sessions.waitForIdle();

    const settled = (await scenario.store.restore(scenario.goalId))!;
    assert.equal(settled.state.run.id, runId);
    assert.equal(settled.state.messages.length, messageCount + 2);
    const content = settled.state.messages.at(-2)!.content;
    assert.match(content, /did not answer/i);
    assert.match(content, /continue/i);
    assert.equal(settled.state.run.status, "completed");
    assert.equal(settled.state.run.stopReason?.kind === "cancelled", false);
    assert.equal(settled.state.run.pendingInteraction, undefined);
    assert.equal(scenario.harness.calls(), 2);

    const conversation = scenario.harness.projections().at(-1);
    assert.ok(conversation !== undefined);
    assert.deepEqual(conversation.at(-1), { role: "user", content });
    // 跳过不伪造默认选项或“已回答”声明。
    assert.equal(settled.state.messages.some((message) => message.content.includes("Answer: ")), false);
});

test("整体回复或跳过中的“批准”字样不批准路线扩展，明确批准选项仍然生效", async () => {
    const base = await reachQuestionForRoute();
    const replyScenario = base;
    const runId = replyScenario.goal.state.run.id;

    const replied = await replyScenario.harness.sessions.sendSessionInput(replyScenario.goalId, {
        kind: "respond",
        inputId: "input-route-reply",
        runId,
        requestId: replyScenario.requestId,
        response: { kind: "reply_to_question", content: "我批准扩展后的路线，直接执行。" },
    });
    assert.equal(replied.ok, true);
    await replyScenario.harness.sessions.waitForIdle();
    const afterReply = (await replyScenario.store.restore(replyScenario.goalId))!;
    assert.equal(afterReply.state.run.planRoute?.revision, 1, "整体回复不能改变路线修订");

    const skipBase = await reachQuestionForRoute();
    const skipped = await skipBase.harness.sessions.sendSessionInput(skipBase.goalId, {
        kind: "respond",
        inputId: "input-route-skip",
        runId: skipBase.goal.state.run.id,
        requestId: skipBase.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(skipped.ok, true);
    await skipBase.harness.sessions.waitForIdle();
    const afterSkip = (await skipBase.store.restore(skipBase.goalId))!;
    assert.equal(afterSkip.state.run.planRoute?.revision, 1, "跳过不能改变路线修订");

    const approveBase = await reachQuestionForRoute();
    const approveOptionId = approveBase.goal.state.run.pendingInteraction?.kind === "ask_user"
        ? approveBase.goal.state.run.pendingInteraction.routeRevision?.approvalOptionId
        : undefined;
    assert.ok(approveOptionId);
    const approved = await approveBase.harness.sessions.sendSessionInput(approveBase.goalId, {
        kind: "respond",
        inputId: "input-route-approve",
        runId: approveBase.goal.state.run.id,
        requestId: approveBase.requestId,
        response: {
            kind: "answer_ask_user",
            answers: [{ questionId: approveBase.questionId, optionIds: [approveOptionId!] }],
        },
    });
    assert.equal(approved.ok, true);
    await approveBase.harness.sessions.waitForIdle();
    const afterApprove = (await approveBase.store.restore(approveBase.goalId))!;
    assert.equal(afterApprove.state.run.planRoute?.revision, 2, "只有明确批准选项改变路线修订");
});

/** 构造带路线扩展审批的问答等待；第一轮提案建立版本 1 的路线。 */
async function reachQuestionForRoute(): Promise<Awaited<ReturnType<typeof reachQuestion>>> {
    const store = new InMemoryGoalStore();
    const harness = createHarness({
        store,
        decide: (_input, callIndex) => {
            if (callIndex === 1) {
                return {
                    kind: "task_proposal",
                    task: { objective: "处理修复", completionCriteria: [] },
                    planRoute: { stages: [{ target: "完成修复", acceptanceCriteria: ["行为正确"] }] },
                    approvalRequest: "请批准当前任务路线。",
                };
            }
            if (callIndex === 2) {
                return { kind: "run_stage_update", target: "完成修复", acceptanceCriteria: ["行为正确"] };
            }
            if (callIndex === 3) {
                return {
                    kind: "run_plan_route_update",
                    baseRevision: 1,
                    reason: "要求扩大交付范围",
                    route: { stages: [
                        { target: "完成修复", acceptanceCriteria: ["行为正确"] },
                        { target: "编写兼容性报告", acceptanceCriteria: ["报告覆盖受影响调用方"] },
                    ] },
                    approvalRequest: "是否批准扩展后的路线？",
                };
            }
            return { kind: "complete", summary: "完成", evidenceSequences: [] };
        },
    });
    const goalId = "goal-question-route";
    const created = await harness.sessions.create({
        goalId,
        inputId: "input-first",
        content: "需要路线审批的任务",
        profileId: profile.id,
        mode: "plan",
    });
    assert.equal(created.ok, true);
    await harness.sessions.waitForIdle();
    const proposed = (await store.restore(goalId))!;
    const proposalId = proposed.state.run.pendingInteraction?.requestId;
    assert.ok(proposalId);
    const approvedTask = await harness.sessions.sendSessionInput(goalId, {
        kind: "respond",
        inputId: "input-approve-task",
        runId: proposed.state.run.id,
        requestId: proposalId!,
        response: { kind: "approve_task" },
    });
    assert.equal(approvedTask.ok, true);
    await harness.sessions.waitForIdle();

    const goal = (await store.restore(goalId))!;
    const pending = goal.state.run.pendingInteraction;
    assert.ok(pending !== undefined && pending.kind === "ask_user");
    assert.ok(pending.routeRevision !== undefined);
    assert.equal(pending.routeRevision.approvalOptionId, "o-1");
    return {
        store,
        goalId,
        goal,
        requestId: pending.requestId,
        questionId: pending.questions[0]!.id,
        optionId: pending.questions[0]!.options[0]!.id,
        harness,
    };
}

test("缺题、空正文与身份载荷冲突保留等待且不写入收据", async () => {
    const scenario = await reachQuestion();
    const runId = scenario.goal.state.run.id;
    const before = await scenario.store.restore(scenario.goalId);

    const missing = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-invalid-missing",
        runId,
        requestId: scenario.requestId,
        response: { kind: "answer_ask_user", answers: [] },
    });
    assert.equal(missing.ok, false);

    const emptyReply = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-invalid-empty",
        runId,
        requestId: scenario.requestId,
        response: { kind: "reply_to_question", content: "   " },
    });
    assert.equal(emptyReply.ok, false);

    const accepted = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-conflict",
        runId,
        requestId: scenario.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(accepted.ok, true);
    await scenario.harness.sessions.waitForIdle();
    const conflict = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-conflict",
        runId,
        requestId: scenario.requestId,
        response: { kind: "reply_to_question", content: "另一个决定" },
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.ok === false && conflict.code, "INPUT_CONFLICT");
    assert.equal(before?.state.run.pendingInteraction !== undefined, true, "非法提交前等待仍存在");
    const queried = await scenario.harness.sessions.querySessionInput(scenario.goalId, "input-invalid-missing");
    assert.equal(queried.ok, true);
    assert.equal(queried.ok && queried.found, false, "业务拒绝不写入受理账本");
});

test("普通消息只排队：不解除问答等待也不回答问题", async () => {
    const scenario = await reachQuestion();
    const runId = scenario.goal.state.run.id;
    const queued = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "message",
        inputId: "input-plain",
        content: "这是后续任务，不是回答。",
    });
    assert.equal(queued.ok, true);
    await scenario.harness.sessions.waitForIdle();

    const goal = (await scenario.store.restore(scenario.goalId))!;
    assert.equal(goal.state.run.id, runId);
    assert.equal(goal.state.run.status, "waiting");
    assert.ok(goal.state.run.pendingInteraction !== undefined);
    assert.equal(goal.state.messageQueue?.items.length, 1);
    assert.equal(goal.state.messages.some((message) => message.content === "这是后续任务，不是回答。"), false);
    assert.equal(scenario.harness.calls(), 1);
});

test("文件存储重建后，已提交回答与模型输入保持一致", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-question-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const harness = createHarness({
            store,
            decide: (_input, callIndex) => callIndex === 1
                ? askUserDecision
                : { kind: "complete", summary: "完成", evidenceSequences: [] },
        });
        const goalId = "goal-question-file";
        const created = await harness.sessions.create({
            goalId,
            inputId: "input-first",
            content: "文件存储问答",
            profileId: profile.id,
        });
        assert.equal(created.ok, true);
        await harness.sessions.waitForIdle();
        const waiting = (await store.restore(goalId))!;
        const pending = waiting.state.run.pendingInteraction;
        assert.ok(pending !== undefined && pending.kind === "ask_user");
        const reply = "使用完整范围，保持原文不变。";
        const sent = await harness.sessions.sendSessionInput(goalId, {
            kind: "respond",
            inputId: "input-file-reply",
            runId: waiting.state.run.id,
            requestId: pending.requestId,
            response: { kind: "reply_to_question", content: reply },
        });
        assert.equal(sent.ok, true);
        await harness.sessions.waitForIdle();

        // 用新实例与新 Store 实例从磁盘重建，不共享内存状态。
        const rebuiltStore = new JsonFileGoalStore(directory);
        const restored = (await rebuiltStore.restore(goalId))!;
        assert.deepEqual(restored.state.messages.at(-2), { role: "user", content: reply });
        assert.equal(restored.state.run.pendingInteraction, undefined);
        const receipt = restored.state.inputLedger?.find((record) => record.inputId === "input-file-reply");
        assert.ok(receipt !== undefined);
        assert.equal(receipt.kind, "respond");
        assert.equal(receipt.status, "applied");

        // 会话投影只在 Run running 时可用：使用重建前真实请求组装时捕获的会话。
        const conversation = harness.projections().at(-1);
        assert.ok(conversation !== undefined);
        assert.deepEqual(conversation.at(-1), { role: "user", content: reply });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("当前交互读取反映最新等待身份，结算后不再返回问题等待", async () => {
    const scenario = await reachQuestion();
    const view = await scenario.harness.sessions.readSessionInteraction(scenario.goalId);
    assert.equal(view?.kind, "question");
    assert.equal(view?.runId, scenario.goal.state.run.id);

    const sent = await scenario.harness.sessions.sendSessionInput(scenario.goalId, {
        kind: "respond",
        inputId: "input-view-once",
        runId: scenario.goal.state.run.id,
        requestId: scenario.requestId,
        response: { kind: "skip_question" },
    });
    assert.equal(sent.ok, true);
    await scenario.harness.sessions.waitForIdle();
    assert.equal(await scenario.harness.sessions.readSessionInteraction(scenario.goalId), undefined);
});
