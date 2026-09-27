import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    type Goal,
    type GoalProgressResult,
    type GoalStore,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import {
    BrowserGoalCommandService,
    createBrowserGoalRoutes,
    type BrowserGoalSaveNotifications,
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

function goalFor(goalId: string, status: "waiting" | "completed" = "waiting"): Goal {
    const goal = createGoal({
        ...protocols,
        id: goalId,
        intent: "验证普通消息",
        promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: `run-${goalId}`,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            run: { ...goal.state.run, status },
        },
    };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

function waitingResult(goal: Goal): GoalProgressResult {
    return { ok: true, kind: "waiting", phase: "executing", waitingFor: "blocked", goal };
}

test("普通等待消息恢复同一 Run，在途相同重试只保存并调用一次", async () => {
    const goal = goalFor("goal-message-waiting");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    const releaseResume = deferred<void>();
    const resumeRequests: ResumeGoalRequest[] = [];
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume(request) {
                resumeRequests.push(request);
                assert.deepEqual(request.action, { kind: "message", content: "继续处理" });
                const current = await store.restore(goal.id);
                assert.ok(current);
                const updated: Goal = {
                    ...current,
                    state: {
                        ...current.state,
                        messages: [...current.state.messages, { role: "user", content: "继续处理" }],
                    },
                };
                await store.save(updated);
                await releaseResume.promise;
                return waitingResult(updated);
            },
            async continue() { throw new Error("completed Run continuation is not used here"); },
        },
    });

    const command = { runId: goal.state.run.id, content: "继续处理" };
    const firstPromise = service.message(goal.id, command);
    const first = await firstPromise;
    assert.deepEqual(first, {
        ok: true,
        goalId: goal.id,
        runId: goal.state.run.id,
        existing: false,
    });
    assert.deepEqual(await service.message(goal.id, command), { ...first, existing: true });
    assert.deepEqual(await service.message(goal.id, { ...command, content: "改写请求" }), {
        ok: false,
        error: "message_conflict",
    });
    assert.equal(resumeRequests.length, 1);
    assert.equal(resumeRequests[0]?.ref.runId, goal.state.run.id);

    releaseResume.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.run.id, goal.state.run.id);
    assert.deepEqual(saved?.state.messages, [
        ...goal.state.messages,
        { role: "user", content: "继续处理" },
    ]);
});

test("已完成 Run 的普通输入调用 continue 并持久化唯一后继 Run", async () => {
    const goal = goalFor("goal-message-completed", "completed");
    const store = new NotifyingMemoryStore();
    await store.save(goal);
    let continueCalls = 0;
    let resumeCalls = 0;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume() {
                resumeCalls += 1;
                throw new Error("completed Run must not resume");
            },
            async continue(ref, content) {
                continueCalls += 1;
                assert.deepEqual(ref, { goalId: goal.id, runId: goal.state.run.id });
                assert.equal(content, "开始后续任务");
                const updated: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        messages: [...goal.state.messages, { role: "user", content }],
                        completedRuns: [{
                            runId: goal.state.run.id,
                            stepCount: goal.state.run.stepCount,
                            committedThroughSequence: goal.state.run.committedThroughSequence,
                            messageRange: { start: 0, end: goal.state.messages.length },
                        }],
                        run: createRun("run-next"),
                    },
                };
                await store.save(updated);
                return waitingResult(updated);
            },
        },
    });

    const result = await service.message(goal.id, {
        runId: goal.state.run.id,
        content: "开始后续任务",
    });
    assert.deepEqual(result, {
        ok: true,
        goalId: goal.id,
        runId: "run-next",
        existing: false,
    });
    assert.equal(continueCalls, 1);
    assert.equal(resumeCalls, 0);
    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.run.id, "run-next");
    assert.deepEqual(saved?.state.messages, [
        ...goal.state.messages,
        { role: "user", content: "开始后续任务" },
    ]);
});

test("结构化等待、过期 Run、空消息和非接收状态不调用 Coordinator", async () => {
    const goal = goalFor("goal-message-invalid");
    const askUserGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "execution",
                    questions: [{
                        id: "q-1",
                        header: "问题",
                        question: "选择什么？",
                        options: [{ id: "a", label: "A" }],
                        multiSelect: false,
                    }],
                },
            },
        },
    };
    const store = new NotifyingMemoryStore();
    await store.save(askUserGoal);
    let coordinatorCalls = 0;
    const service = new BrowserGoalCommandService({
        store,
        saveNotifications: store,
        profileId: "default",
        launcher: { async launch() { throw new Error("Launcher is not used here"); } },
        coordinator: {
            async resume() {
                coordinatorCalls += 1;
                return waitingResult(askUserGoal);
            },
            async continue() {
                coordinatorCalls += 1;
                return waitingResult(askUserGoal);
            },
        },
    });
    const command = { runId: goal.state.run.id, content: "不能代替回答" };
    assert.deepEqual(await service.message(goal.id, { ...command, runId: "old-run" }), {
        ok: false,
        error: "stale_run",
    });
    assert.deepEqual(await service.message(goal.id, command), {
        ok: false,
        error: "structured_interaction_required",
    });
    assert.deepEqual(await service.message(goal.id, { ...command, content: "  " }), {
        ok: false,
        error: "invalid_message",
    });
    const { pendingInteraction: _pendingInteraction, ...runWithoutInteraction } = askUserGoal.state.run;
    const runningGoal: Goal = {
        ...askUserGoal,
        state: {
            ...askUserGoal.state,
            run: { ...runWithoutInteraction, status: "running" },
        },
    };
    await store.save(runningGoal);
    assert.deepEqual(await service.message(goal.id, command), {
        ok: false,
        error: "goal_not_waiting",
    });
    assert.equal(coordinatorCalls, 0);
    assert.deepEqual(await store.restore(goal.id), runningGoal);
});

test("消息路由严格校验 Goal/Run 与正文并返回受理身份", async () => {
    const calls: Array<{ goalId: string; runId: string; content: string }> = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async create() { return { ok: false as const, error: "goal_create_failed" as const }; },
        async interact() { return { ok: false as const, error: "interaction_failed" as const }; },
        async message(goalId, command) {
            calls.push({ goalId, ...command });
            return { ok: true as const, goalId, runId: "run-next", existing: false };
        },
        async openStream() {
            return { ok: false as const, error: "goal_not_found" as const };
        },
    });
    const send = (goalId: string, body: unknown) => routes.request(
        `http://localhost/api/goals/${goalId}/messages`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
    );

    const accepted = await send("goal-message-1", { runId: "run-1", content: "下一任务" });
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), {
        goalId: "goal-message-1",
        runId: "run-next",
        existing: false,
    });
    assert.deepEqual(calls, [{ goalId: "goal-message-1", runId: "run-1", content: "下一任务" }]);

    const extraField = await send("goal-message-1", {
        runId: "run-1",
        content: "下一任务",
        approve: true,
    });
    assert.equal(extraField.status, 400);
    assert.deepEqual(await extraField.json(), { error: "invalid_message" });
    const plainTextMessage = await routes.request("http://localhost/api/goals/goal with spaces/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-1", content: "text" }),
    });
    assert.equal(plainTextMessage.status, 400);
    assert.equal(calls.length, 1);
});
