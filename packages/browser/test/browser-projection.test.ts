import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalStore,
    type TrajectoryEvent,
    type TrajectoryReadResult,
} from "../../runtime/src/index";
import { allocateImmutableEvent } from "../../runtime/src/index";
import {
    createBrowserGoalRoutes,
    listBrowserGoals,
    readBrowserGoalSession,
    type BrowserCreateGoalCommand,
    type BrowserGoalInteractionCommand,
    type BrowserGoalListItem,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

function createTestGoal(): Goal {
    return createGoal({
        ...protocols,
        id: "goal-real-1",
        intent: "验证浏览器真实会话",
        promptBundleVersion: 1,
        profile: {
            id: "private-profile-id",
            systemPrompt: "private system prompt",
            instructions: [],
            toolIds: [],
        },
        runId: "run-real-1",
    });
}

function event(
    sequence: number,
    eventType: "decision_received" | "action_staged" | "tool_finished" | "observation_recorded",
): TrajectoryEvent {
    const executionUnitId = sequence === 5 ? "uncommitted-unit" : "unit-1";
    const stepIndex = sequence === 5 ? 2 : 1;
    if (eventType === "decision_received") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            eventType,
            payload: {
                type: eventType,
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "action-1",
                        toolId: "read_file",
                        input: { path: "PRIVATE_TOOL_INPUT" },
                    },
                },
                thought: "PRIVATE_REASONING_SHOULD_NOT_ESCAPE",
            },
        }, sequence);
    }

    if (eventType === "action_staged") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            eventType,
            payload: {
                type: eventType,
                action: {
                    actionId: "action-1",
                    toolId: "read_file",
                    input: { path: "PRIVATE_TOOL_INPUT" },
                },
                approvalStatus: "approved",
            },
        }, sequence);
    }

    if (eventType === "tool_finished") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            actionId: "action-1",
            eventType,
            payload: {
                type: eventType,
                actionId: "action-1",
                toolId: "read_file",
                observation: {
                    kind: "success",
                    output: "PRIVATE_RAW_TOOL_OUTPUT",
                    summary: "读取了一个文件",
                },
            },
        }, sequence);
    }

    return allocateImmutableEvent({
        goalId: "goal-real-1",
        runId: "run-real-1",
        phase: "executing",
        executionUnitId,
        stepIndex,
        actionId: "action-1",
        eventType,
        payload: {
            type: eventType,
            actionId: "action-1",
            observation: {
                kind: "success",
                output: "PRIVATE_RAW_TOOL_OUTPUT",
                summary: "读取了一个文件",
            },
        },
    }, sequence);
}

class TestGoalStore implements GoalStore {
    constructor(private readonly goal: Goal | undefined) {}

    async save(): Promise<void> {}

    async restore(goalId: string): Promise<Goal | undefined> {
        return goalId === this.goal?.id ? this.goal : undefined;
    }
}

class TestGoalCatalog implements GoalCatalog {
    constructor(private readonly entries: readonly GoalCatalogEntry[]) {}

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return this.entries.filter((entry) => entry.runStatus !== "completed"
            && entry.runStatus !== "failed"
            && entry.runStatus !== "cancelled");
    }

    async listHistory(): Promise<readonly GoalCatalogEntry[]> {
        return this.entries;
    }
}

test("看板列表使用正式 Catalog 摘要并投影白名单字段", async () => {
    const catalog = new TestGoalCatalog([{
        goalId: "goal-real-1",
        runId: "run-real-1",
        intent: "真实 Goal",
        workflowPhase: "executing",
        runStatus: "completed",
        updatedAt: "2026-09-26T00:00:00.000Z",
        secret: "must-not-appear",
    } as GoalCatalogEntry]);

    const result = await listBrowserGoals(catalog);
    assert.deepEqual(result, [{
        goalId: "goal-real-1",
        runId: "run-real-1",
        intent: "真实 Goal",
        workflowPhase: "executing",
        runStatus: "completed",
        updatedAt: "2026-09-26T00:00:00.000Z",
    }]);
    assert.equal(JSON.stringify(result).includes("must-not-appear"), false);
});

test("会话只返回已提交步骤、真实消息与实际存在的计划", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            messages: [
                { role: "user", content: "检查项目" },
                { role: "assistant", assistant: { profileId: "private-profile-id" }, content: "会话已完成" },
            ],
            goalPlan: {
                revision: 1,
                items: [{ id: "todo-1", content: "运行检查", position: 0, status: "completed" }],
            },
        },
    };
    const committed = [
        event(1, "decision_received"),
        event(2, "action_staged"),
        event(3, "tool_finished"),
        event(4, "observation_recorded"),
    ];
    const tail = [event(5, "decision_received")];
    const result: Readonly<TrajectoryReadResult> = { committed, uncommittedTail: tail };

    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => result,
    );

    assert.ok(session);
    assert.deepEqual(session.messages, [
        { role: "user", content: "检查项目", runId: "run-real-1" },
        { role: "assistant", content: "会话已完成", runId: "run-real-1" },
    ]);
    assert.equal(session.currentRunMode, "normal");
    assert.equal(session.nextRunMode, undefined);
    assert.equal(session.goalPlan?.items[0]?.content, "运行检查");
    assert.equal(session.runs[0]?.steps.length, 1);
    assert.deepEqual(session.runs[0]?.steps[0], {
        runId: "run-real-1",
        executionUnitId: "unit-1",
        sequence: 1,
        stepIndex: 1,
        decisionKind: "tool_call",
        toolId: "read_file",
        actionStatus: "approved",
        status: "completed",
        summary: "读取了一个文件",
    });

    const serialized = JSON.stringify(session);
    assert.equal(serialized.includes("PRIVATE_REASONING_SHOULD_NOT_ESCAPE"), false);
    assert.equal(serialized.includes("PRIVATE_TOOL_INPUT"), false);
    assert.equal(serialized.includes("PRIVATE_RAW_TOOL_OUTPUT"), false);
    assert.equal(serialized.includes("private-profile-id"), false);
    assert.equal(serialized.includes("systemPrompt"), false);
});

test("待审批 Action 只投影限长输入预览与写入目标路径", async () => {
    const initial = createTestGoal();
    const privateContent = "secret-".repeat(100);
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "waiting",
                pendingAction: {
                    action: {
                        actionId: "action-preview",
                        toolId: "write_file",
                        input: { path: "src/example.ts", content: privateContent },
                    },
                    status: "awaiting_approval",
                },
            },
        },
    };

    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => ({ committed: [], uncommittedTail: [] }),
    );

    assert.equal(session?.pendingAction?.actionId, "action-preview");
    assert.equal(session?.pendingAction?.targetPath, "src/example.ts");
    assert.equal(session?.pendingAction?.inputPreviewTruncated, true);
    assert.ok((session?.pendingAction?.inputPreview.length ?? Number.POSITIVE_INFINITY) <= 321);
    assert.equal(session?.pendingAction?.inputPreview.includes(privateContent), false);
});

test("Bash 决定与跨 execution unit 的执行合并为一行，complete 决策不重复显示", async () => {
    const goal = createTestGoal();
    const actionId = "bash-action-1";
    const committed: TrajectoryEvent[] = [
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            eventType: "model_context_frame",
            payload: {
                type: "model_context_frame",
                stage: "decide",
                epochNumber: goal.state.run.contextEpoch.number,
                conversationPosition: 0,
                sections: [],
            },
        }, 1),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            stepIndex: 1,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { actionId, toolId: "bash", input: { command: "printf ok" } },
                },
            },
        }, 2),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            stepIndex: 1,
            actionId,
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: { actionId, toolId: "bash", input: { command: "printf ok" } },
                approvalStatus: "approved",
            },
        }, 3),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "tool-unit",
            stepIndex: 1,
            actionId,
            eventType: "tool_started",
            payload: {
                type: "tool_started",
                actionId,
                toolId: "bash",
                input: { command: "printf ok" },
            },
        }, 4),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "tool-unit",
            stepIndex: 1,
            actionId,
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId,
                observation: {
                    kind: "success",
                    output: { exitCode: 0, stdout: "ok", stderr: "", privateField: "omit" },
                    summary: "命令执行成功",
                },
            },
        }, 5),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "completion-unit",
            stepIndex: 2,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "done", completionEvidence: [] },
            },
        }, 6),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "completion-unit",
            stepIndex: 2,
            eventType: "run_completed",
            payload: { type: "run_completed", summary: "done" },
        }, 7),
    ];
    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => ({ committed, uncommittedTail: [] }),
    );

    assert.equal(session?.runs[0]?.steps.length, 1);
    assert.deepEqual(session?.runs[0]?.steps[0]?.bashExecution, {
        command: "printf ok",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
    });
    assert.equal(JSON.stringify(session).includes("privateField"), false);
});

test("未创建 GoalPlan 时省略计划；不存在 Goal 返回 undefined，损坏读取拒绝", async () => {
    const goal = createTestGoal();
    const store = new TestGoalStore(goal);
    const session = await readBrowserGoalSession(goal.id, store, async () => ({ committed: [], uncommittedTail: [] }));
    assert.ok(session);
    assert.equal(Object.hasOwn(session, "goalPlan"), false);
    assert.deepEqual(session.runs[0]?.steps, []);
    assert.equal(await readBrowserGoalSession("missing", store, async () => ({ committed: [], uncommittedTail: [] })), undefined);
    await assert.rejects(readBrowserGoalSession(goal.id, store, async () => {
        throw new Error("corrupt trajectory details");
    }), /corrupt trajectory details/);
});

test("会话投影保留已归档失败 Run 的状态", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            completedRuns: [{
                runId: "run-failed",
                status: "failed",
                stepCount: 1,
                committedThroughSequence: 3,
                messageRange: { start: 0, end: 1 },
            }],
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(session?.runs[0]?.runId, "run-failed");
    assert.equal(session?.runs[0]?.status, "failed");
});

test("读取 API 区分缺失与读取失败且不泄漏底层错误", async () => {
    const port = {
        async list(): Promise<readonly BrowserGoalListItem[]> {
            throw new Error("private filesystem path");
        },
        async read(goalId: string) {
            if (goalId === "broken") throw new Error("corrupt snapshot internals");
            return undefined;
        },
        async create() {
            return { ok: false as const, error: "goal_create_failed" as const };
        },
        async interact() {
            return { ok: false as const, error: "interaction_failed" as const };
        },
        async message() {
            return { ok: false as const, error: "message_failed" as const };
        },
        async enterPlanMode() {
            return { ok: false as const, error: "plan_mode_failed" as const };
        },
        async openStream() {
            return { ok: false as const, error: "goal_not_found" as const };
        },
    };
    const routes = createBrowserGoalRoutes(port);

    const missing = await routes.request("http://localhost/api/goals/missing");
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "goal_not_found" });

    const broken = await routes.request("http://localhost/api/goals/broken");
    assert.equal(broken.status, 500);
    assert.deepEqual(await broken.json(), { error: "goal_read_failed" });

    const listFailure = await routes.request("http://localhost/api/goals");
    assert.equal(listFailure.status, 500);
    assert.deepEqual(await listFailure.json(), { error: "goal_list_unavailable" });
});

test("创建与交互路由拒绝非法 wire 输入并要求稳定身份", async () => {
    const calls: BrowserCreateGoalCommand[] = [];
    const interactions: Array<{ goalId: string; command: BrowserGoalInteractionCommand }> = [];
    const planModes: Array<{ goalId: string; runId: string }> = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async create(command) {
            calls.push(command);
            return {
                ok: true as const,
                goalId: command.goalId,
                runId: "run-created-1",
                existing: false,
            };
        },
        async interact(goalId, command) {
            interactions.push({ goalId, command });
            if ("requestId" in command && command.requestId === "old-request") {
                return { ok: false as const, error: "stale_request" as const };
            }
            return { ok: true as const, goalId, runId: command.runId, existing: false };
        },
        async message(goalId, command) {
            return { ok: true as const, goalId, runId: command.runId, existing: false };
        },
        async enterPlanMode(goalId, command) {
            planModes.push({ goalId, runId: command.runId });
            return { ok: true as const, goalId, runId: command.runId, existing: false };
        },
        async openStream() {
            return { ok: false as const, error: "goal_not_found" as const };
        },
    });
    const send = (body: string) => routes.request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
    });

    const extraField = await send(JSON.stringify({ goalId: "goal-create-1", intent: "检查", profileId: "admin" }));
    assert.equal(extraField.status, 400);
    assert.deepEqual(await extraField.json(), { error: "invalid_goal_input" });
    const emptyIntent = await send(JSON.stringify({ goalId: "goal-create-1", intent: "  " }));
    assert.equal(emptyIntent.status, 400);
    const invalidId = await send(JSON.stringify({ goalId: "goal with spaces", intent: "检查" }));
    assert.equal(invalidId.status, 400);
    const malformed = await send("{invalid json");
    assert.equal(malformed.status, 400);
    assert.equal(calls.length, 0);

    const accepted = await send(JSON.stringify({ goalId: "goal-create-1", intent: "检查当前项目" }));
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), {
        goalId: "goal-create-1",
        runId: "run-created-1",
        existing: false,
    });
    assert.deepEqual(calls, [{ goalId: "goal-create-1", intent: "检查当前项目" }]);

    const acceptedPlan = await send(JSON.stringify({ goalId: "goal-create-2", intent: "显式计划", mode: "plan" }));
    assert.equal(acceptedPlan.status, 202);
    assert.deepEqual(calls[1], { goalId: "goal-create-2", intent: "显式计划", mode: "plan" });
    const unsupportedMode = await send(JSON.stringify({ goalId: "goal-create-3", intent: "普通模式", mode: "normal" }));
    assert.equal(unsupportedMode.status, 400);
    assert.equal(calls.length, 2);

    const selectedPlan = await routes.request("http://localhost/api/goals/goal-create-2/plan-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-current" }),
    });
    assert.equal(selectedPlan.status, 202);
    assert.deepEqual(planModes, [{ goalId: "goal-create-2", runId: "run-current" }]);
    const invalidPlanCommand = await routes.request("http://localhost/api/goals/goal-create-2/plan-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-current", intent: "unexpected" }),
    });
    assert.equal(invalidPlanCommand.status, 400);
    assert.equal(planModes.length, 1);

    const interaction = await routes.request("http://localhost/api/goals/goal-create-1/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            kind: "answer_ask_user",
            runId: "run-1",
            requestId: "ask-1",
            answers: [{ questionId: "q-1", optionIds: ["o-2"] }],
        }),
    });
    assert.equal(interaction.status, 202);
    assert.deepEqual(interactions, [{
        goalId: "goal-create-1",
        command: {
            kind: "answer_ask_user",
            runId: "run-1",
            requestId: "ask-1",
            answers: [{ questionId: "q-1", optionIds: ["o-2"] }],
        },
    }]);
    const stale = await routes.request("http://localhost/api/goals/goal-create-1/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "approve_task", runId: "run-1", requestId: "old-request" }),
    });
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "stale_request", refresh: true });
    assert.equal(interactions.length, 2);
    const plainTextMessage = await routes.request("http://localhost/api/goals/goal-create-1/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "message", runId: "run-1", content: "approve plan" }),
    });
    assert.equal(plainTextMessage.status, 400);
    assert.equal(interactions.length, 2);

    const unsupportedMedia = await routes.request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ goalId: "goal-create-3", intent: "检查" }),
    });
    assert.equal(unsupportedMedia.status, 415);
    const tooLarge = await send(JSON.stringify({ goalId: "goal-create-2", intent: "x".repeat(20_000) }));
    assert.equal(tooLarge.status, 413);
    assert.equal(calls.length, 2);
});
