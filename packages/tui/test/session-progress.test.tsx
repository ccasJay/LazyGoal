import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
    type GoalProgressResult,
    type LaunchResult,
    type StepExecutionInput,
    type AgentDecision,
} from "../../runtime/src/index.js";
import { InMemoryGoalStore } from "../../storage/src/index.js";
import { currentProtocols } from "../../runtime/test/current-fixtures.js";
import {
    NotifyingGoalStore,
    SessionController,
    SessionScreen,
    type SessionControllerDependencies,
    type SessionCoordinator,
    type SessionLauncher,
    type UiSessionViewModel,
} from "../src/index.js";

afterEach(() => {
    cleanup();
});

const profile = {
    id: "profile-test",
    systemPrompt: "You are a test agent.",
    instructions: [],
    toolIds: ["bash", "read_file"],
};

function createTestGoal(id: string, stepCount = 0): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test task execution",
        profile,
        runId: `run-${id}`,
        messages: [{ role: "user", content: "Test intent" }],
    });

    const lastStep = stepCount > 0 ? {
        kind: "action" as const,
        action: { actionId: `act-${stepCount}`, toolId: "bash", input: {} },
        observation: { kind: "success" as const, output: { stdout: "ok" }, summary: "done" },
    } : undefined;

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Test objective",
                    completionCriteria: [{ text: "Criteria 1" }],
                },
            },
            run: {
                ...created.state.run,
                status: "running",
                stepCount,
                ...(lastStep !== undefined ? { lastStep } : {}),
            },
        },
    };
}

test("实时提交投影：阻塞下一次模型响应时上一已提交 Action 和 Step 数已经可见且 busy 期间无法提交审批", async () => {
    const baseStore = new InMemoryGoalStore();
    const notifyingStore = new NotifyingGoalStore(baseStore);

    const goalId = "goal-progress-1";
    const initialGoal = createTestGoal(goalId, 0);
    await notifyingStore.save(initialGoal);

    let resolveAdvancePromise!: (result: GoalProgressResult) => void;
    const controlledAdvancePromise = new Promise<GoalProgressResult>((resolve) => {
        resolveAdvancePromise = resolve;
    });

    const coordinator: SessionCoordinator = {
        async advance() {
            return controlledAdvancePromise;
        },
        async resume() {
            return controlledAdvancePromise;
        },
    };

    const launcher: SessionLauncher = {
        async launch(): Promise<LaunchResult> {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
    };

    const deps: SessionControllerDependencies = {
        launcher,
        coordinator,
        store: notifyingStore,
        catalog: { listResumable: async () => [] },
        notifyingStore,
        profileId: profile.id,
        goalIdGenerator: () => goalId,
        mode: "review",
        taskTitle: "SWE-bench astropy__astropy-12907",
    };

    const controller = new SessionController(deps);

    // 1. 建立 session
    await controller.dispatch({ kind: "create", intent: "Test intent" });
    let snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.screen, "session");
    assert.equal(snapshot.stepCount, 0);
    assert.equal(snapshot.busy, false);

    // 2. 模拟发起一个执行推进命令（进入 busy 状态，被受控 Promise 阻塞）
    let approveCalled = false;
    let approveActionId = "";
    const onApprove = (actionId: string) => {
        approveCalled = true;
        approveActionId = actionId;
    };

    const dispatchPromise = controller.dispatch({ kind: "submitMessage", content: "Go" });

    // 此时 controller 处于 busy: true
    snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.busy, true);

    // 3. 在底层模型仍在计算/阻塞期间，模拟 Runtime 原子提交了 Step 1
    const committedGoal: Goal = {
        ...initialGoal,
        state: {
            ...initialGoal.state,
            run: {
                ...initialGoal.state.run,
                status: "running",
                stepCount: 1,
                lastStep: {
                    kind: "action",
                    action: {
                        actionId: "act-step-1",
                        toolId: "bash",
                        input: { command: "pytest" },
                    },
                    observation: {
                        kind: "success",
                        output: { stdout: "running tests" },
                        summary: "running tests",
                    },
                },
            },
        },
    };

    // 保存到 notifyingStore，会触发 onGoalCommitted 实时投影
    await notifyingStore.save(committedGoal);

    // 4. 验证 snapshot 已经实时反映了 Step 1，并且 busy 依然为 true（没有提前解除门控）
    snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.stepCount, 1);
    assert.equal(snapshot.busy, true);
    assert.equal(snapshot.lastCommittedAction?.toolId, "bash");
    assert.equal(snapshot.lastCommittedAction?.actionId, "act-step-1");

    // 5. 使用 Ink 渲染断言画面包含中间帧
    const { lastFrame, stdin } = render(
        <SessionScreen
            session={snapshot}
            onSubmitMessage={() => {}}
            onApproveAction={onApprove}
            onRejectAction={() => {}}
        />,
    );

    const frameText = lastFrame() ?? "";
    assert.match(frameText, /Steps: 1/);
    assert.match(frameText, /Step 1:\s*\[bash\]/);
    assert.match(frameText, /\[REVIEW\]/);
    assert.match(frameText, /SWE-bench astropy__astropy-12907/);

    // 尝试在 busy 期间输入确认按键，断言无法触发审批
    stdin.write("y");
    assert.equal(approveCalled, false);

    // 6. 解决受控 Promise，完成 dispatch 调用
    const waitingGoal: Goal = {
        ...committedGoal,
        state: {
            ...committedGoal.state,
            run: {
                ...committedGoal.state.run,
                status: "waiting",
                pendingAction: {
                    action: {
                        actionId: "act-step-2",
                        toolId: "bash",
                        input: { command: "pytest" },
                    },
                    status: "awaiting_approval",
                },
            },
        },
    };

    resolveAdvancePromise({
        ok: true,
        kind: "waiting",
        phase: "executing",
        waitingFor: "action_approval",
        goal: waitingGoal,
    });

    await dispatchPromise;

    // 7. dispatch 结束后，busy 恢复为 false，处于 action_approval 等待点
    snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.busy, false);
    assert.equal(snapshot.waitingFor, "action_approval");

    controller.dispose();
});

test("实时提交投影：单调递增去重拒绝迟到的旧快照", async () => {
    const baseStore = new InMemoryGoalStore();
    const notifyingStore = new NotifyingGoalStore(baseStore);

    const goalId = "goal-progress-dedup";
    const initialGoal = createTestGoal(goalId, 0);
    await notifyingStore.save(initialGoal);

    const coordinator: SessionCoordinator = {
        async advance() {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
        async resume() {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
    };

    const launcher: SessionLauncher = {
        async launch(): Promise<LaunchResult> {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
    };

    const deps: SessionControllerDependencies = {
        launcher,
        coordinator,
        store: notifyingStore,
        catalog: { listResumable: async () => [] },
        notifyingStore,
        profileId: profile.id,
        goalIdGenerator: () => goalId,
    };

    const controller = new SessionController(deps);
    await controller.dispatch({ kind: "create", intent: "Test" });

    // 先收到 Step 5
    const goalStep5 = createTestGoal(goalId, 5);
    await notifyingStore.save(goalStep5);

    let snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.stepCount, 5);

    // 模拟迟到的 Step 3
    const goalStep3 = createTestGoal(goalId, 3);
    await notifyingStore.save(goalStep3);

    // 断言迟到的旧读取结果被拒绝，保持 Step 5
    snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.stepCount, 5);

    controller.dispose();
});

test("实时提交投影：dispose 注销后不再接收保存通知", async () => {
    const baseStore = new InMemoryGoalStore();
    const notifyingStore = new NotifyingGoalStore(baseStore);

    const goalId = "goal-progress-dispose";
    const initialGoal = createTestGoal(goalId, 0);
    await notifyingStore.save(initialGoal);

    const coordinator: SessionCoordinator = {
        async advance() {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
        async resume() {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
    };

    const launcher: SessionLauncher = {
        async launch(): Promise<LaunchResult> {
            return {
                ok: true,
                kind: "waiting",
                phase: "executing",
                waitingFor: "blocked",
                goal: initialGoal,
            };
        },
    };

    const deps: SessionControllerDependencies = {
        launcher,
        coordinator,
        store: notifyingStore,
        catalog: { listResumable: async () => [] },
        notifyingStore,
        profileId: profile.id,
        goalIdGenerator: () => goalId,
    };

    const controller = new SessionController(deps);
    await controller.dispatch({ kind: "create", intent: "Test" });

    // 注销订阅
    controller.dispose();

    // 再次保存 Step 10
    const goalStep10 = createTestGoal(goalId, 10);
    await notifyingStore.save(goalStep10);

    // snapshot 不受影响
    const snapshot = controller.getSnapshot() as UiSessionViewModel;
    assert.equal(snapshot.stepCount, 0);
});
