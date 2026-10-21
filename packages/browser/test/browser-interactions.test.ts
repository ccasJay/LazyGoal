import assert from "node:assert/strict";
import { test } from "node:test";

import {
    computeActionRecoveryRef,
    createGoal,
    type Goal,
    type GoalStore,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    createBrowserGoalRoutes,
    readBrowserGoalSession,
    type BrowserGoalApiPort,
    type BrowserGoalSession,
} from "../src/index";

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

function baseGoal(goalId: string): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent: "需要人工决定",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
    });
}

/** 用空轨迹投影一个已保存 Goal 的安全会话视图。 */
async function project(goal: Goal, store: MemoryStore): Promise<BrowserGoalSession> {
    await store.save(goal);
    const session = await readBrowserGoalSession(goal.id, store, async () => ({
        committed: [],
        uncommittedTail: [],
    }));
    assert.ok(session !== undefined);
    return session;
}

function waitingGoal(goalId: string, patch: Partial<Goal["state"]["run"]>): Goal {
    const goal = baseGoal(goalId);
    return {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, status: "waiting", ...patch } },
    };
}

test("会话投影为四种等待提供统一身份、可用决定与截断标记", async () => {
    const store = new MemoryStore();
    const question = waitingGoal("goal-interaction-question", {
        pendingInteraction: {
            kind: "ask_user",
            requestId: "ask-1",
            mode: "execution",
            questions: [{
                id: "q-1",
                header: "Scope",
                question: "Which scope?",
                multiSelect: false,
                options: [{ id: "o-1", label: "All" }],
            }],
        },
    });
    const questionView = (await project(question, store)).interaction;
    assert.equal(questionView?.kind, "question");
    assert.deepEqual(questionView, {
        goalId: "goal-interaction-question",
        runId: "run-goal-interaction-question",
        kind: "question",
        interactionId: "question:ask-1",
        requestId: "ask-1",
        decisions: ["answer_questions", "reply_to_question", "skip_question"],
        truncated: false,
    });

    const proposal = waitingGoal("goal-interaction-proposal", {
        pendingInteraction: {
            kind: "task_approval",
            requestId: "proposal-1",
            proposal: { objective: "实现导入", completionCriteria: [{ text: "导入成功" }] },
            planRouteCandidate: { stages: [{ target: "解析", acceptanceCriteria: ["覆盖主要格式"] }] },
            approvalRequest: "请确认任务目标",
        },
    });
    assert.deepEqual((await project(proposal, store)).interaction, {
        goalId: "goal-interaction-proposal",
        runId: "run-goal-interaction-proposal",
        kind: "task_approval",
        interactionId: "task_approval:proposal-1",
        requestId: "proposal-1",
        decisions: ["approve_task", "send_task_feedback"],
        truncated: false,
    });

    const approval = waitingGoal("goal-interaction-approval", {
        pendingAction: {
            action: { actionId: "act-1", toolId: "bash", input: { command: "npm test" } },
            status: "awaiting_approval",
            approvalKind: "sandbox",
        },
    });
    assert.deepEqual((await project(approval, store)).interaction, {
        goalId: "goal-interaction-approval",
        runId: "run-goal-interaction-approval",
        kind: "action_approval",
        interactionId: "action_approval:act-1",
        actionId: "act-1",
        decisions: ["approve_action", "approve_action_revision", "reject_action"],
        truncated: false,
    });

    const recovery = waitingGoal("goal-interaction-recovery", {
        pendingAction: {
            action: { actionId: "act-2", toolId: "write_file", input: { path: "a.txt", content: "x" } },
            status: "outcome_unknown",
        },
    });
    assert.deepEqual((await project(recovery, store)).interaction, {
        goalId: "goal-interaction-recovery",
        runId: "run-goal-interaction-recovery",
        kind: "action_recovery",
        interactionId: "action_recovery:act-2",
        actionId: "act-2",
        recoveryRef: computeActionRecoveryRef("act-2", 1),
        decisions: ["retry_unknown_action", "decline_unknown_action_retry"],
        truncated: false,
    });
});

test("重复投影与未提交等待不产生新交互，超过上限的展示标记为截断", async () => {
    const store = new MemoryStore();
    const goal = waitingGoal("goal-interaction-stable", {
        pendingInteraction: {
            kind: "ask_user",
            requestId: "ask-2",
            mode: "execution",
            questions: [{
                id: "q-1",
                header: "Scope",
                question: "q".repeat(2_500),
                multiSelect: false,
                options: [{ id: "o-1", label: "All" }],
            }],
        },
    });
    const first = (await project(goal, store)).interaction;
    const second = (await project(goal, store)).interaction;
    assert.deepEqual(first, second);
    assert.equal(first?.truncated, true);

    const running: Goal = {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, status: "running" } },
    };
    assert.equal((await project(running, store)).interaction, undefined);

    const approved = waitingGoal("goal-interaction-approved", {
        pendingAction: {
            action: { actionId: "act-3", toolId: "bash", input: { command: "ls" } },
            status: "approved",
        },
    });
    assert.equal((await project(approved, store)).interaction, undefined);
});

test("交互详情按当前身份返回完整问题、任务范围与 Action 输入", async () => {
    const store = new MemoryStore();
    const service = new BrowserGoalCommandService({
        store,
        coordinator: { async enterPlanMode() { throw new Error("plan mode is not used here"); } },
    });

    const question = waitingGoal("goal-detail-question", {
        pendingInteraction: {
            kind: "ask_user",
            requestId: "ask-3",
            mode: "plan",
            questions: [{
                id: "q-1",
                header: "Scope",
                question: "q".repeat(2_500),
                multiSelect: true,
                options: [{ id: "o-1", label: "All", description: "Everything" }],
            }],
            routeRevision: {
                baseRevision: 1,
                candidate: { stages: [{ target: "扩展阶段", acceptanceCriteria: ["报告完整"] }] },
                reason: "范围扩大",
                approvalRequest: "是否批准扩展？",
                approvalOptionId: "o-1",
            },
        },
    });
    await store.save(question);
    const questionDetail = await service.readInteractionDetails(
        question.id,
        question.state.run.id,
        "question:ask-3",
    );
    assert.ok(questionDetail.ok);
    assert.equal(questionDetail.detail.kind, "question");
    assert.ok(questionDetail.detail.kind === "question");
    assert.equal(questionDetail.detail.questions[0]!.question.length, 2_500);
    assert.equal(questionDetail.detail.routeRevision?.approvalOptionId, "o-1");
    assert.deepEqual(
        questionDetail.detail.routeRevision?.stages.map((stage) => stage.target),
        ["扩展阶段"],
    );

    const approval = waitingGoal("goal-detail-approval", {
        pendingAction: {
            action: { actionId: "act-4", toolId: "bash", input: { command: "npm test", env: { TOKEN: "secret" } } },
            status: "awaiting_approval",
            approvalKind: "tool",
        },
    });
    await store.save(approval);
    const actionDetail = await service.readInteractionDetails(
        approval.id,
        approval.state.run.id,
        "action_approval:act-4",
    );
    assert.deepEqual(actionDetail, {
        ok: true,
        goalId: approval.id,
        runId: approval.state.run.id,
        interactionId: "action_approval:act-4",
        detail: {
            kind: "action_approval",
            actionId: "act-4",
            toolId: "bash",
            approvalKind: "tool",
            input: { command: "npm test", env: { TOKEN: "secret" } },
        },
    });
});

test("交互详情拒绝过期 Run、错引用与其他 Action，且不改变快照", async () => {
    const store = new MemoryStore();
    const service = new BrowserGoalCommandService({
        store,
        coordinator: { async enterPlanMode() { throw new Error("plan mode is not used here"); } },
    });
    const goal = waitingGoal("goal-detail-refusals", {
        pendingAction: {
            action: { actionId: "act-current", toolId: "write_file", input: { path: "a.txt", content: "x" } },
            status: "awaiting_approval",
        },
    });
    await store.save(goal);

    assert.deepEqual(
        await service.readInteractionDetails(goal.id, "run-other", "action_approval:act-current"),
        { ok: false, error: "stale_run" },
    );
    assert.deepEqual(
        await service.readInteractionDetails(goal.id, goal.state.run.id, "action_approval:act-other"),
        { ok: false, error: "interaction_mismatch" },
    );
    assert.deepEqual(
        await service.readInteractionDetails("goal-missing", "run-1", "action_approval:act-1"),
        { ok: false, error: "goal_not_found" },
    );

    await store.save({
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, status: "running" } },
    });
    assert.deepEqual(
        await service.readInteractionDetails(goal.id, goal.state.run.id, "action_approval:act-current"),
        { ok: false, error: "interaction_not_waiting" },
    );

    await store.save(goal);
    const before = JSON.stringify(await store.restore(goal.id));
    await service.readInteractionDetails(goal.id, goal.state.run.id, "action_approval:act-current");
    assert.equal(JSON.stringify(await store.restore(goal.id)), before);
});

/** 只挂载交互详情读取的最小 Goal API。 */
function interactionDetailsPort(
    readInteractionDetails: NonNullable<BrowserGoalApiPort["readInteractionDetails"]>,
): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        readInteractionDetails,
    };
}

test("结算后的重复投影不再产生可操作交互，旧引用也不会读到新等待", async () => {
    const goal = waitingGoal("goal-settled", {
        pendingInteraction: {
            kind: "ask_user",
            requestId: "ask-settled-1",
            mode: "execution",
            questions: [{
                id: "source",
                header: "Choose a source",
                question: "Which notes should I include?",
                multiSelect: false,
                options: [{ id: "approved", label: "Approved notes" }],
            }],
        },
    });
    const store = new MemoryStore();
    const projected = await project(goal, store);
    assert.equal(projected.interaction?.interactionId, "question:ask-settled-1");

    // 另一客户端提交决定：快照结算，等待清除。
    const { pendingInteraction: _settledInteraction, ...settledRun } = goal.state.run;
    const settled: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: { ...settledRun, status: "completed" },
        },
    };
    const afterSettlement = await project(settled, store);
    assert.equal(afterSettlement.interaction, undefined, "a settled request no longer exposes a decision");
    assert.equal(afterSettlement.pendingAction, undefined);

    // 第二次结算同一引用不产生新交互；旧引用也无法读到已结算的等待。
    const service = new BrowserGoalCommandService({
        store,
        coordinator: {
            resume: async () => ({ ok: false as const, error: { code: "GOAL_NOT_WAITING", message: "no wait" } }),
        },
    } as never);
    assert.deepEqual(
        await service.readInteractionDetails(settled.id, settled.state.run.id, "question:ask-settled-1"),
        { ok: false, error: "interaction_not_waiting" },
    );
    const reparsed = await project(settled, store);
    assert.equal(reparsed.interaction, undefined, "repeat projection stays settled without a new interaction");
});

test("交互详情路由校验身份参数并只返回服务端授权读取结果", async () => {
    const requests: string[] = [];
    const routes = createBrowserGoalRoutes(interactionDetailsPort(async (goalId, runId, interactionId) => {
        requests.push(`${goalId}:${runId}:${interactionId}`);
        if (runId === "run-old") return { ok: false, error: "stale_run" };
        return {
            ok: true,
            goalId,
            runId,
            interactionId,
            detail: {
                kind: "task_approval",
                objective: "实现导入",
                approvalRequest: "请确认任务目标",
                completionCriteria: ["导入成功"],
                stages: [{ target: "解析", acceptanceCriteria: ["覆盖主要格式"] }],
            },
        };
    }));

    const response = await routes.request(
        "http://localhost/api/goals/goal-1/interaction-details?runId=run-1&interactionId=task_approval%3Aproposal-1",
    );
    assert.equal(response.status, 200);
    // 详情读取保留完整审阅内容：身份、完整目标、验收条件与有序候选阶段。
    assert.deepEqual(await response.json(), {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "task_approval:proposal-1",
        detail: {
            kind: "task_approval",
            objective: "实现导入",
            approvalRequest: "请确认任务目标",
            completionCriteria: ["导入成功"],
            stages: [{ target: "解析", acceptanceCriteria: ["覆盖主要格式"] }],
        },
    });

    const stale = await routes.request(
        "http://localhost/api/goals/goal-1/interaction-details?runId=run-old&interactionId=task_approval%3Aproposal-1",
    );
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "stale_run" });

    const invalid = await routes.request(
        "http://localhost/api/goals/goal%20bad/interaction-details?runId=run-1&interactionId=task_approval%3Aproposal-1",
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_interaction_details_request" });

    assert.deepEqual(requests, [
        "goal-1:run-1:task_approval:proposal-1",
        "goal-1:run-old:task_approval:proposal-1",
    ]);
});

test("交互详情路由未接线时返回稳定不可用码", async () => {
    const routes = createBrowserGoalRoutes({
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
    });
    const response = await routes.request(
        "http://localhost/api/goals/goal-1/interaction-details?runId=run-1&interactionId=question%3Aask-1",
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "interaction_details_unavailable" });
});

/** 只挂载审批预检的最小 Goal API。 */
function actionReviewPort(
    reviewActionApproval: NonNullable<BrowserGoalApiPort["reviewActionApproval"]>,
): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        reviewActionApproval,
    };
}

test("审批预检路由只接受严格 wire 请求并返回可审阅内容", async () => {
    const received: unknown[] = [];
    const routes = createBrowserGoalRoutes(actionReviewPort(async (goalId, command) => {
        received.push({ goalId, command });
        return {
            ok: true,
            goalId,
            runId: command.runId,
            review: {
                actionId: command.actionId,
                toolId: "write_file",
                originalInput: { path: "a.txt", content: "original" },
                finalInput: { path: "b.txt", content: "revised" },
                changed: true,
                scope: command.scope ?? "action",
                availableScopes: ["action", "goal", "workspace"],
                capability: { network: "none", extraFiles: [], targetPaths: ["/workspace/b.txt"] },
                requiresSandboxApproval: false,
                reviewRef: "review:0123456789abcdef0123456789abcdef",
            },
        };
    }));

    const response = await routes.request("http://localhost/api/goals/goal-1/action-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            runId: "run-1",
            actionId: "act-1",
            scope: "action",
            input: { path: "b.txt", content: "revised" },
        }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; review: { reviewRef: string } };
    assert.equal(body.ok, true);
    assert.equal(body.review.reviewRef, "review:0123456789abcdef0123456789abcdef");
    assert.deepEqual(received, [{
        goalId: "goal-1",
        command: {
            runId: "run-1",
            actionId: "act-1",
            scope: "action",
            input: { path: "b.txt", content: "revised" },
        },
    }]);

    const invalidScope = await routes.request("http://localhost/api/goals/goal-1/action-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", actionId: "act-1", scope: "everything" }),
    });
    assert.equal(invalidScope.status, 400);
    assert.deepEqual(await invalidScope.json(), { error: "invalid_action_review_request" });

    const invalidInput = await routes.request("http://localhost/api/goals/goal-1/action-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", actionId: "act-1", toolId: "write_file" }),
    });
    assert.equal(invalidInput.status, 400);

    const malformed = await routes.request("http://localhost/api/goals/goal-1/action-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
    });
    assert.equal(malformed.status, 400);
});

test("审批预检路由未接线时返回稳定不可用码", async () => {
    const routes = createBrowserGoalRoutes({
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
    });
    const response = await routes.request("http://localhost/api/goals/goal-1/action-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", actionId: "act-1" }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "review_unavailable" });
});

test("审批预检服务把 Runtime 拒绝投影为稳定 wire 错误码", async () => {
    const store = new MemoryStore();
    const goal = waitingGoal("goal-review-service", {
        pendingAction: {
            action: { actionId: "act-9", toolId: "write_file", input: { path: "a.txt", content: "x" } },
            status: "awaiting_approval",
        },
    });
    await store.save(goal);
    const service = new BrowserGoalCommandService({
        store,
        coordinator: {
            async enterPlanMode() { throw new Error("plan mode is not used here"); },
            async reviewActionApproval(request) {
                assert.equal(request.ref.goalId, goal.id);
                assert.equal(request.ref.runId, goal.state.run.id);
                return {
                    ok: false as const,
                    code: "INVALID_TOOL_INPUT" as const,
                    message: "输入无效",
                    issues: [{ path: ["path"], message: "必须是字符串" }],
                };
            },
        },
    });

    assert.deepEqual(
        await service.reviewActionApproval(goal.id, {
            runId: goal.state.run.id,
            actionId: "act-9",
            input: { path: 1 },
        }),
        {
            ok: false,
            error: "invalid_tool_input",
            issues: [{ path: ["path"], message: "必须是字符串" }],
        },
    );
    assert.deepEqual(
        await service.reviewActionApproval(goal.id, { runId: "run-old", actionId: "act-9" }),
        { ok: false, error: "stale_run" },
    );
    assert.deepEqual(
        await service.reviewActionApproval("goal-missing", { runId: "run-1", actionId: "act-9" }),
        { ok: false, error: "goal_not_found" },
    );
});
