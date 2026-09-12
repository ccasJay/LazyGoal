import assert from "node:assert/strict";
import test from "node:test";

import {
    createGoal,
    DEFAULT_GOAL_MODEL_SELECTION,
    DefaultGoalModelSelectionCoordinator,
    isSafeWaitingPointForModelSwitching,
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

const targetSelection: GoalModelSelection = {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
    structuredOutputMode: "prompt_only",
    contextWindowTokens: 200000,
    maxOutputTokens: 8192,
    inputEstimator: { kind: "character-v1" },
};

test("GoalModelSelectionCoordinator: 三类安全等待点允许更新并保存模型选择", async () => {
    // 1. question 等待点 (gathering_context / waiting_input)
    const questionGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
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

    // 2. planning approval feedback 等待点 (planning / waiting_approval)
    const planningGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: {
                        objective: "测试目标",
                        completionCriteria: [{ text: "标准 1" }],
                    },
                },
            },
        },
    };
    assert.equal(isSafeWaitingPointForModelSwitching(planningGoal), true);

    const store2 = new FakeGoalStore(planningGoal);
    const coordinator2 = new DefaultGoalModelSelectionCoordinator({ store: store2 });
    const res2 = await coordinator2.updateModelSelection({
        ref: { goalId: planningGoal.id, runId: planningGoal.state.run.id },
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
                preparation: { status: "completed" },
                task: {
                    objective: "执行中任务",
                    completionCriteria: [{ text: "标准 1" }],
                },
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",
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

test("GoalModelSelectionCoordinator: 运行中、Action 审批点与终态严格拒绝换模", async () => {
    // 1. active 准备阶段
    const activeGoal: Goal = {
        ...createBaseTestGoal(),
        state: {
            ...createBaseTestGoal().state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
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
                preparation: { status: "completed" },
                task: { objective: "t", completionCriteria: [] },
            },
            run: {
                ...createBaseTestGoal().state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "a1", toolId: "read_file", input: {} },
                    status: "awaiting_approval",
                },
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

    // 3. 终态 (completed / failed / cancelled)
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
        assert.equal(isSafeWaitingPointForModelSwitching(terminalGoal), false);
        store.goal = terminalGoal;
        const res = await coordinator.updateModelSelection({
            ref: { goalId: terminalGoal.id, runId: terminalGoal.state.run.id },
            selection: targetSelection,
        });
        assert.equal(res.ok, false);
        if (!res.ok) {
            assert.equal(res.error.code, "GOAL_NOT_WAITING");
        }
    }
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
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
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
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
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
