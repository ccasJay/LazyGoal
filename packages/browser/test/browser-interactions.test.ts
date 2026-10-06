import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalStore,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    type BrowserGoalInteractionCommand,
    type BrowserGoalSaveNotifications,
    createBrowserGoalRoutes,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

class NotifyingMemoryStore implements GoalStore, BrowserGoalSaveNotifications {
    private readonly goals = new Map<string, Goal>();
    private readonly listeners = new Set<(goal: Goal) => void>();

    async save(goal: Goal): Promise<void> {
        this.goals.set(goal.id, goal);
        for (const listener of this.listeners) listener(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goals.get(goalId);
    }

    onSave(listener: (goal: Goal) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

function goalFor(goalId: string, intent: string): Goal {
    return createGoal({
        ...protocols,
        id: goalId,
        intent,
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
    });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

type WaitPoint = "ask_user" | "task_approval" | "action_approval";

function goalAtWaitPoint(goalId: string, waitPoint: WaitPoint): Goal {
    const initial = goalFor(goalId, "等待用户操作");
    const run = { ...initial.state.run, status: "waiting" as const };
    if (waitPoint === "ask_user") {
        return {
            ...initial,
            state: {
                ...initial.state,
                run: {
                    ...run,
                    pendingInteraction: {
                        kind: "ask_user",
                        requestId: "ask-1",
                        mode: "execution",
                        questions: [{
                            id: "q-1",
                            header: "选择方案",
                            question: "选哪一个？",
                            options: [{ id: "o-1", label: "方案 A" }, { id: "o-2", label: "方案 B" }],
                            multiSelect: false,
                        }],
                    },
                },
            },
        };
    }
    if (waitPoint === "task_approval") {
        return {
            ...initial,
            state: {
                ...initial.state,
                run: {
                    ...run,
                    pendingInteraction: {
                        kind: "task_approval",
                        requestId: "proposal-1",
                        proposal: { objective: "执行任务", completionCriteria: [{ text: "通过检查" }] },
                        approvalRequest: "请批准",
                    },
                },
            },
        };
    }
    return {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...run,
                pendingAction: {
                    action: { actionId: "action-1", toolId: "write_file", input: { path: "a.txt" } },
                    status: "awaiting_approval",
                },
            },
        },
    };
}

const interactionCases: readonly {
    readonly name: string;
    readonly waitPoint: WaitPoint;
    readonly command: Exclude<BrowserGoalInteractionCommand, { readonly kind: "cancel_ask_user" }>;
    readonly expectedAction: ResumeGoalRequest["action"]["kind"];
}[] = [
    {
        name: "AskUser 回答",
        waitPoint: "ask_user",
        command: {
            kind: "answer_ask_user",
            runId: "run-goal-interaction-1",
            requestId: "ask-1",
            answers: [{ questionId: "q-1", optionIds: ["o-1"] }],
        },
        expectedAction: "answer_ask_user",
    },
    {
        name: "任务提案批准",
        waitPoint: "task_approval",
        command: { kind: "approve_task", runId: "run-goal-interaction-1", requestId: "proposal-1" },
        expectedAction: "approve_task",
    },
    {
        name: "任务提案反馈",
        waitPoint: "task_approval",
        command: {
            kind: "feedback_task",
            runId: "run-goal-interaction-1",
            requestId: "proposal-1",
            feedback: "缩小任务范围",
        },
        expectedAction: "feedback_task",
    },
    {
        name: "Tool Action 批准",
        waitPoint: "action_approval",
        command: { kind: "approve_action", runId: "run-goal-interaction-1", actionId: "action-1" },
        expectedAction: "approve_action",
    },
    {
        name: "Tool Action 拒绝",
        waitPoint: "action_approval",
        command: {
            kind: "reject_action",
            runId: "run-goal-interaction-1",
            actionId: "action-1",
            reason: "不允许修改此文件",
        },
        expectedAction: "reject_action",
    },
];

for (const scenario of interactionCases) {
    test(`${scenario.name} 只恢复匹配等待点并在同一在途请求上幂等`, async () => {
        const goal = goalAtWaitPoint("goal-interaction-1", scenario.waitPoint);
        const store = new NotifyingMemoryStore();
        await store.save(goal);
        const releaseCoordinator = deferred<void>();
        const coordinatorRequests: ResumeGoalRequest[] = [];
        const service = new BrowserGoalCommandService({
            store,
            saveNotifications: store,
            profileId: "default",
            launcher: { async launch() { throw new Error("Launcher is not used here"); } },
            coordinator: {
                async resume(request) {
                    coordinatorRequests.push(request);
                    const current = await store.restore(goal.id);
                    assert.ok(current);
                    const {
                        pendingInteraction: _pendingInteraction,
                        pendingAction: _pendingAction,
                        ...runWithoutPending
                    } = current.state.run;
                    const updated: Goal = {
                        ...current,
                        state: {
                            ...current.state,
                            run: { ...runWithoutPending, status: "completed" },
                        },
                    };
                    await store.save(updated);
                    await releaseCoordinator.promise;
                    return { ok: true as const, kind: "terminal" as const, phase: "executing" as const, goal: updated };
                },
                async continue() { throw new Error("continuation is not used here"); },
                async enterPlanMode() { throw new Error("plan mode is not used here"); },
            },
        });

        const acceptedPromise = service.interact(goal.id, scenario.command);
        const accepted = await acceptedPromise;
        assert.deepEqual(accepted, {
            ok: true,
            goalId: goal.id,
            runId: goal.state.run.id,
            existing: false,
        });
        assert.equal(coordinatorRequests.length, 1);
        assert.equal(coordinatorRequests[0]?.ref.goalId, goal.id);
        assert.equal(coordinatorRequests[0]?.ref.runId, scenario.command.runId);
        assert.equal(coordinatorRequests[0]?.action.kind, scenario.expectedAction);
        assert.deepEqual(await service.interact(goal.id, scenario.command), { ...accepted, existing: true });
        const conflictingCommand: BrowserGoalInteractionCommand = "requestId" in scenario.command
            ? { ...scenario.command, requestId: "another-request" }
            : { ...scenario.command, actionId: "another-action" };
        assert.deepEqual(await service.interact(goal.id, conflictingCommand), {
            ok: false,
            error: "goal_busy",
        });

        releaseCoordinator.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(await service.interact(goal.id, scenario.command), {
            ok: false,
            error: "goal_not_waiting",
        });
        assert.equal(coordinatorRequests.length, 1);
    });
}

test("cancel_ask_user 转为 Runtime 询问取消操作并等待快照保存", async () => {
    const goal = goalAtWaitPoint("goal-cancel-run-1", "ask_user");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const requestsSeen: ResumeGoalRequest[] = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume(request) {
                requestsSeen.push(request);
                const current = await store.restore(goal.id);
                assert.ok(current);
                const { pendingInteraction: _pendingInteraction, ...runWithoutPending } = current.state.run;
                const resumed: Goal = {
                    ...current,
                    state: {
                        ...current.state,
                        messages: [
                            ...current.state.messages,
                            {
                                role: "user",
                                content: "I cancelled this question. Continue the current task without relying on an answer to it.",
                            },
                        ],
                        run: { ...runWithoutPending, status: "running" as const },
                    },
                };
                await store.save(resumed);
                return { ok: true as const, kind: "waiting" as const, phase: "executing" as const, waitingFor: "blocked" as const, goal: resumed };
            },
            async continue() { throw new Error("continuation is not used here"); },
            async enterPlanMode() { throw new Error("plan mode is not used here"); },
        },
    });

    const stale = await service.interact(goal.id, {
        kind: "cancel_ask_user",
        runId: goal.state.run.id,
        requestId: "old-ask",
    });
    assert.deepEqual(stale, { ok: false, error: "stale_request" });
    assert.equal(requestsSeen.length, 0);

    const result = await service.interact(goal.id, {
        kind: "cancel_ask_user",
        runId: goal.state.run.id,
        requestId: "ask-1",
    });
    assert.deepEqual(result, {
        ok: true,
        goalId: goal.id,
        runId: goal.state.run.id,
        existing: false,
    });
    assert.deepEqual(requestsSeen[0]?.action, { kind: "cancel_ask_user", requestId: "ask-1" });
    const resumed = await store.restore(goal.id);
    assert.equal(resumed?.state.run.status, "running");
    assert.equal(resumed?.state.run.pendingInteraction, undefined);
    assert.equal(resumed?.state.messages.some((message) => message.content.includes("I cancelled this question")), true);
});

test("过期 Run 或请求身份在 Coordinator 调用前被拒绝", async () => {
    const goal = goalAtWaitPoint("goal-stale-1", "ask_user");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    let coordinatorCalls = 0;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume() {
                coordinatorCalls += 1;
                return { ok: true as const, kind: "terminal" as const, phase: "executing" as const, goal };
            },
            async continue() { throw new Error("continuation is not used here"); },
            async enterPlanMode() { throw new Error("plan mode is not used here"); },
        },
    });

    const command: BrowserGoalInteractionCommand = {
        kind: "answer_ask_user",
        runId: goal.state.run.id,
        requestId: "ask-1",
        answers: [{ questionId: "q-1", optionIds: ["o-1"] }],
    };
    assert.deepEqual(await service.interact(goal.id, { ...command, runId: "old-run" }), {
        ok: false,
        error: "stale_run",
    });
    assert.deepEqual(await service.interact(goal.id, { ...command, requestId: "old-request" }), {
        ok: false,
        error: "stale_request",
    });
    assert.deepEqual(await store.restore(goal.id), goal);
    assert.equal(coordinatorCalls, 0);
});

test("完整 Action 详情只对当前等待中的 Goal/Run/Action 身份开放", async () => {
    const goal = goalAtWaitPoint("goal-action-details-1", "action_approval");
    const fullInput = { path: "a.txt", content: "private complete content", metadata: { mode: 0o600 } };
    const waitingGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                pendingAction: {
                    action: { actionId: "action-1", toolId: "write_file", input: fullInput },
                    status: "awaiting_approval",
                },
            },
        },
    };
    const store = new NotifyingMemoryStore();
    await store.save(waitingGoal);
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume() { throw new Error("resume is not used here"); },
            async continue() { throw new Error("continue is not used here"); },
            async enterPlanMode() { throw new Error("plan mode is not used here"); },
        },
    });

    assert.deepEqual(await service.readActionDetails(
        waitingGoal.id,
        waitingGoal.state.run.id,
        "action-1",
    ), {
        ok: true,
        goalId: waitingGoal.id,
        runId: waitingGoal.state.run.id,
        actionId: "action-1",
        toolId: "write_file",
        input: fullInput,
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, "stale-run", "action-1"), {
        ok: false,
        error: "stale_run",
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, waitingGoal.state.run.id, "stale-action"), {
        ok: false,
        error: "action_not_waiting",
    });

    await store.save({
        ...waitingGoal,
        state: { ...waitingGoal.state, run: { ...waitingGoal.state.run, status: "running" } },
    });
    assert.deepEqual(await service.readActionDetails(waitingGoal.id, waitingGoal.state.run.id, "action-1"), {
        ok: false,
        error: "action_not_waiting",
    });
});

test("浏览器交互路由传递审批与取消命令并拒绝非法字段", async () => {
    const interactions: BrowserGoalInteractionCommand[] = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async create() { return { ok: false as const, error: "goal_create_failed" as const }; },
        async interact(_goalId, command) {
            interactions.push(command);
            return { ok: true as const, goalId: "goal-1", runId: command.runId, existing: false };
        },
        async message() { return { ok: false as const, error: "message_failed" as const }; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        async openStream() { return { ok: false as const, error: "goal_not_found" as const }; },
    });
    const approve = (scope: string) => routes.request("http://localhost/api/goals/goal-1/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "approve_action", runId: "run-1", actionId: "action-1", scope }),
    });

    assert.equal((await approve("workspace")).status, 202);
    assert.deepEqual(interactions, [{
        kind: "approve_action",
        runId: "run-1",
        actionId: "action-1",
        scope: "workspace",
    }]);
    assert.equal((await approve("unbounded")).status, 400);
    assert.equal(interactions.length, 1);

    const cancelQuestion = (extra: Record<string, unknown> = {}) => routes.request(
        "http://localhost/api/goals/goal-1/interactions",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "cancel_ask_user", runId: "run-1", requestId: "ask-1", ...extra }),
        },
    );
    assert.equal((await cancelQuestion()).status, 202);
    assert.deepEqual(interactions[1], { kind: "cancel_ask_user", runId: "run-1", requestId: "ask-1" });
    assert.equal((await cancelQuestion({ reason: "unexpected" })).status, 400);
    assert.equal(interactions.length, 2);
});

test("Action 详情路由验证身份参数并只返回服务端授权读取结果", async () => {
    const requests: string[] = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async create() { return { ok: false as const, error: "goal_create_failed" as const }; },
        async interact() { return { ok: false as const, error: "interaction_failed" as const }; },
        async message() { return { ok: false as const, error: "message_failed" as const }; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        async openStream() { return { ok: false as const, error: "goal_not_found" as const }; },
        async readActionDetails(goalId, runId, actionId) {
            requests.push(`${goalId}:${runId}:${actionId}`);
            return runId === "run-old"
                ? { ok: false as const, error: "stale_run" as const }
                : {
                    ok: true as const,
                    goalId,
                    runId,
                    actionId,
                    toolId: "write_file",
                    input: { path: "src/a.ts", content: "private" },
                };
        },
    });

    const details = await routes.request("http://localhost/api/goals/goal-1/actions/action-1?runId=run-1");
    assert.equal(details.status, 200);
    assert.deepEqual(await details.json(), {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        actionId: "action-1",
        toolId: "write_file",
        input: { path: "src/a.ts", content: "private" },
    });
    const stale = await routes.request("http://localhost/api/goals/goal-1/actions/action-1?runId=run-old");
    assert.equal(stale.status, 409);
    const invalid = await routes.request("http://localhost/api/goals/goal%20bad/actions/action-1?runId=run-1");
    assert.equal(invalid.status, 400);
    assert.deepEqual(requests, ["goal-1:run-1:action-1", "goal-1:run-old:action-1"]);
});
