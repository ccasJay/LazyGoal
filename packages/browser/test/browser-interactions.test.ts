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
    readonly command: BrowserGoalInteractionCommand;
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
