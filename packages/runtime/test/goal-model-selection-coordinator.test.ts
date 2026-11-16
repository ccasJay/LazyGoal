import assert from "node:assert/strict";
import test from "node:test";

import {
    createGoal,
    DEFAULT_GOAL_MODEL_SELECTION,
    DefaultGoalModelSelectionCoordinator,
    GoalCoordinator,
    isSafeWaitingPointForModelSwitching,
    transition,
    type AgentProfile,
    type Goal,
    type GoalModelSelection,
    type GoalStore,
} from "../src/index.js";
import { currentProtocols } from "./current-fixtures.js";

const profile: AgentProfile = {
    id: "profile-test",
    systemPrompt: "You are a test agent.",
    instructions: ["测试指令"],
    toolIds: ["read_file"],
};

function createBaseTestGoal(runId = "run-1"): Goal {
    return createGoal({
        ...currentProtocols,
        id: "goal-test-1",
        intent: "测试模型选择协调器",
        promptBundleVersion: 1,
        profile,
        runId,
    });
}

class FakeGoalStore implements GoalStore {
    public goal: Goal | undefined;
    public saveError: Error | undefined;
    public savedGoals: Goal[] = [];

    constructor(initialGoal?: Goal) {
        this.goal = initialGoal;
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        if (this.goal?.id === goalId) {
            return structuredClone(this.goal);
        }
        return undefined;
    }

    async save(goal: Goal): Promise<void> {
        if (this.saveError) {
            throw this.saveError;
        }
        this.savedGoals.push(structuredClone(goal));
        this.goal = structuredClone(goal);
    }
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

class GateSaveGoalStore extends FakeGoalStore {
    readonly entered = deferred();
    readonly release = deferred();
    private blockNextSave = true;

    override async save(goal: Goal): Promise<void> {
        if (this.blockNextSave) {
            this.blockNextSave = false;
            this.entered.resolve();
            await this.release.promise;
        }
        await super.save(goal);
    }
}

const targetSelection: GoalModelSelection = {
    provider: "opencode-go",
    profileId: "provider-opencode-go",
    modelId: "minimax-m3.1-flash-free",
    executionApi: "openai-completions",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 524_288,
    inputEstimator: { kind: "character-v1" },
};

test("GoalModelSelectionCoordinator: 三类安全等待点允许更新并保存模型选择", async () => {
    // 1. ask_user 等待点
    const questionGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal().state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "plan",
                    questions: [],
                },
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(questionGoal), true);

    const store1 = new FakeGoalStore(questionGoal);
    const coordinator1 = new DefaultGoalModelSelectionCoordinator({ store: store1 });
    const res1 = await coordinator1.updateModelSelection({
        ref: { goalId: questionGoal.id, runId: questionGoal.state.run.id },
        selection: targetSelection,
    });
    assert.equal(res1.ok, true);
    if (res1.ok) {
        assert.deepEqual(res1.goal.state.modelSelection, targetSelection);
        assert.equal(store1.savedGoals.length, 1);
        assert.deepEqual(store1.goal?.state.modelSelection, targetSelection);
    }

    // 2. task approval 等待点
    const taskApprovalGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    planRouteCandidate: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] },
                    requestId: "proposal-1",
                    proposal: {
                        objective: "测试目标",
                        completionCriteria: [{ text: "标准 1" }],
                    },
                    approvalRequest: "请审批",
                },
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(taskApprovalGoal), true);

    const store2 = new FakeGoalStore(taskApprovalGoal);
    const coordinator2 = new DefaultGoalModelSelectionCoordinator({ store: store2 });
    const res2 = await coordinator2.updateModelSelection({
        ref: { goalId: taskApprovalGoal.id, runId: taskApprovalGoal.state.run.id },
        selection: targetSelection,
    });
    assert.equal(res2.ok, true);
    if (res2.ok) {
        assert.deepEqual(res2.goal.state.modelSelection, targetSelection);
        assert.equal(store2.savedGoals.length, 1);
    }

    // 3. executing blocked 等待点 (executing / run waiting 且无 pendingAction)
    const blockedGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",

                mode: "plan", approvedTask: {
                    objective: "执行中任务",
                    completionCriteria: [{ text: "标准 1" }],
                },
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(blockedGoal), true);

    const store3 = new FakeGoalStore(blockedGoal);
    const coordinator3 = new DefaultGoalModelSelectionCoordinator({ store: store3 });
    const res3 = await coordinator3.updateModelSelection({
        ref: { goalId: blockedGoal.id, runId: blockedGoal.state.run.id },
        selection: targetSelection,
    });
    assert.equal(res3.ok, true);
    if (res3.ok) {
        assert.deepEqual(res3.goal.state.modelSelection, targetSelection);
        assert.equal(store3.savedGoals.length, 1);
    }
});

test("ask_user 决定在排队等待换模提交后保留最新模型选择", async () => {
    const created = createBaseTestGoal("run-model-switch-resume-race");
    const started = transition(created.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const waiting = transition(started.state, {
        kind: "stage_interaction",
        interaction: {
            kind: "ask_user",
            requestId: "ask-model-switch-race",
            mode: "execution",
            questions: [{
                id: "continue",
                header: "继续执行",
                question: "是否继续？",
                options: [{ id: "yes", label: "是" }, { id: "no", label: "否" }],
                multiSelect: false,
            }],
        },
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    const goal: Goal = {
        ...created,
        state: { ...created.state, run: waiting.state },
    };
    const store = new GateSaveGoalStore(goal);
    const modelCoordinator = new DefaultGoalModelSelectionCoordinator({ store });
    const goalCoordinator = new GoalCoordinator({
        store,
        scheduler: {
            async schedule() {
                return {
                    ok: false as const,
                    error: { code: "RUN_NOT_FOUND" as const, message: "test scheduler stop" },
                };
            },
        },
    });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    const changingModel = modelCoordinator.updateModelSelection({ ref, selection: targetSelection });
    await store.entered.promise;
    const answering = goalCoordinator.resume({
        ref,
        action: { kind: "skip_question", requestId: "ask-model-switch-race" },
    });
    store.release.resolve();

    const changed = await changingModel;
    assert.equal(changed.ok, true);
    const resumed = await answering;
    assert.equal(resumed.ok, false);
    const latest = await store.restore(goal.id);
    assert.deepEqual(latest?.state.modelSelection, targetSelection);
    assert.equal(latest?.state.run.status, "running");
    assert.equal(latest?.state.messages.at(-1)?.content, "The user did not answer this question and asked to continue the current task without an answer to it.");
});

test("同一 ask_user 等待只接受一次并发决定", async () => {
    const created = createBaseTestGoal("run-two-resume-decisions");
    const started = transition(created.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const waiting = transition(started.state, {
        kind: "stage_interaction",
        interaction: {
            kind: "ask_user",
            requestId: "ask-two-resume-decisions",
            mode: "execution",
            questions: [{
                id: "continue",
                header: "继续执行",
                question: "是否继续？",
                options: [{ id: "yes", label: "是" }, { id: "no", label: "否" }],
                multiSelect: false,
            }],
        },
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;
    const goal: Goal = {
        ...created,
        state: { ...created.state, run: waiting.state },
    };
    const store = new FakeGoalStore(goal);
    let schedules = 0;
    const coordinator = new GoalCoordinator({
        store,
        scheduler: {
            async schedule() {
                schedules += 1;
                return {
                    ok: false as const,
                    error: { code: "RUN_NOT_FOUND" as const, message: "test scheduler stop" },
                };
            },
        },
    });
    const ref = { goalId: goal.id, runId: goal.state.run.id };

    const results = await Promise.all([
        coordinator.resume({
            ref,
            action: { kind: "skip_question", requestId: "ask-two-resume-decisions" },
        }),
        coordinator.resume({
            ref,
            action: { kind: "skip_question", requestId: "ask-two-resume-decisions" },
        }),
    ]);

    assert.equal(schedules, 1);
    assert.equal(store.savedGoals.length, 1);
    assert.equal(store.goal?.state.run.status, "running");
    assert.equal(store.goal?.state.messages.filter((message) => message.source.kind === "interaction_response").length, 1);
    assert.equal(results.filter((result) => result.ok === false && result.error.code === "GOAL_NOT_WAITING").length, 1);
});

test("GoalModelSelectionCoordinator: 运行中、Action 审批点与取消态严格拒绝换模", async () => {
    // 1. active executing 阶段
    const activeGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(activeGoal), false);

    const store = new FakeGoalStore(activeGoal);
    const coordinator = new DefaultGoalModelSelectionCoordinator({ store });
    const resActive = await coordinator.updateModelSelection({
        ref: { goalId: activeGoal.id, runId: activeGoal.state.run.id },
        selection: targetSelection,
    });
    assert.equal(resActive.ok, false);
    if (!resActive.ok) {
        assert.equal(resActive.error.code, "GOAL_NOT_WAITING");
    }

    // 2. Action 审批等待点（非普通文本等待）
    const actionApprovalGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "a1", toolId: "read_file", input: {} },
                    status: "awaiting_approval",
                },

                mode: "plan", approvedTask: { objective: "t", completionCriteria: [] },
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(actionApprovalGoal), false);
    store.goal = actionApprovalGoal;
    const resApproval = await coordinator.updateModelSelection({
        ref: { goalId: actionApprovalGoal.id, runId: actionApprovalGoal.state.run.id },
        selection: targetSelection,
    });
    assert.equal(resApproval.ok, false);
    if (!resApproval.ok) {
        assert.equal(resApproval.error.code, "GOAL_NOT_WAITING");
    }

    // 3. 终态允许预选下一 Run，未结算的中断拒绝。
    for (const status of ["completed", "failed", "cancelled"] as const) {
        const terminalGoal: Goal = {
            ...createBaseTestGoal(),
            state: {
                ...createBaseTestGoal().state,
                run: {
                    ...createBaseTestGoal().state.run,
                    status,
                },
            },
        };
        assert.equal(isSafeWaitingPointForModelSwitching(terminalGoal), true);
        store.goal = terminalGoal;
        const res = await coordinator.updateModelSelection({
            ref: { goalId: terminalGoal.id, runId: terminalGoal.state.run.id },
            selection: targetSelection,
        });
        assert.equal(res.ok, true);
        if (res.ok) assert.deepEqual(res.goal.state.modelSelection, targetSelection);
    }
    const goal = store.goal!;
    const stopping = { ...goal, state: { ...goal.state, run: { ...goal.state.run,
        interruption: { requestId: "interrupt-1", status: "requested" as const },
    } } };
    assert.equal(isSafeWaitingPointForModelSwitching(stopping), false);
});

test("GoalModelSelectionCoordinator: Goal 不存在与 Run 不匹配明确失败且无副作用", async () => {
    const store = new FakeGoalStore(undefined);
    const coordinator = new DefaultGoalModelSelectionCoordinator({ store });

    // 1. GOAL_NOT_FOUND
    const res1 = await coordinator.updateModelSelection({
        ref: { goalId: "missing-goal", runId: "run-1" },
        selection: targetSelection,
    });
    assert.equal(res1.ok, false);
    if (!res1.ok) {
        assert.equal(res1.error.code, "GOAL_NOT_FOUND");
        assert.equal(res1.goal, undefined);
    }

    // 2. RUN_MISMATCH
    const questionGoal: Goal = {
        ...createBaseTestGoal("active-run-99"),
        state: {
            ...createBaseTestGoal("active-run-99").state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal("active-run-99").state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "plan",
                    questions: [],
                },
            },
        },
    };
    store.goal = questionGoal;
    const res2 = await coordinator.updateModelSelection({
        ref: { goalId: questionGoal.id, runId: "wrong-run-id" },
        selection: targetSelection,
    });
    assert.equal(res2.ok, false);
    if (!res2.ok) {
        assert.equal(res2.error.code, "RUN_MISMATCH");
        assert.deepEqual(res2.goal, questionGoal);
    }
    assert.equal(store.savedGoals.length, 0);
});

test("GoalModelSelectionCoordinator: Store 保存失败返回旧 Goal，状态与字段保持不变", async () => {
    const questionGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "plan",
                    questions: [],
                },
            },
        },
    };

    const store = new FakeGoalStore(questionGoal);
    store.saveError = new Error("Disk write failed: ENOSPC");

    const coordinator = new DefaultGoalModelSelectionCoordinator({ store });
    const res = await coordinator.updateModelSelection({
        ref: { goalId: questionGoal.id, runId: questionGoal.state.run.id },
        selection: targetSelection,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
        assert.equal(res.error.code, "SAVE_FAILED");
        assert.match(res.error.message, /ENOSPC/);
        // 返回旧 Goal
        assert.ok(res.goal);
        assert.deepEqual(res.goal.state.modelSelection, DEFAULT_GOAL_MODEL_SELECTION);
        assert.deepEqual(res.goal.state.messages, questionGoal.state.messages);
        assert.deepEqual(res.goal.state.run, questionGoal.state.run);
    }
});
