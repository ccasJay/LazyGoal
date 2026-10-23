import assert from "node:assert/strict";
import { test } from "node:test";

import {
    computeActionRecoveryRef,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    transition,
    type DecideStageResult,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import {
    createApprovalFixture,
    createAwaitingApprovalGoal,
    createExecutingApprovalGoal,
    REQUIRE_APPROVAL_POLICY,
} from "./action-approval-fixtures";
import { trajectoryStoreFor } from "./current-fixtures";

/** 构造一个执行真实 Runner 的审批 Coordinator；Tool 为 manual 重放策略。 */
function createReexecutionHarness(
    fixture: Awaited<ReturnType<typeof createApprovalFixture>>,
    decisions: readonly DecideStageResult[],
) {
    let index = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
        async decide(_input: StepExecutionInput): Promise<DecideStageResult> {
            const decision = decisions[Math.min(index, decisions.length - 1)];
            index += 1;
            assert.ok(decision !== undefined);
            return decision;
        },
        async think(): Promise<never> {
            throw new Error("Unexpected Think call");
        },
    };
    const trajectoryStore = trajectoryStoreFor(fixture.store);
    const runner = new Runner({
        store: fixture.store,
        trajectoryStore,
        executor,
        toolRegistry: fixture.registry,
        toolPolicy: REQUIRE_APPROVAL_POLICY,
        workspaceRoot: fixture.workspaceRoot,
        workspaceId: "ws-1",
    });
    const coordinator = new GoalCoordinator({
        store: fixture.store,
        trajectoryStore,
        scheduler: new InlineScheduler(runner),
        toolRegistry: fixture.registry,
        toolGrantStore: fixture.toolGrantStore,
        sandboxGrantStore: fixture.sandboxGrantStore,
        workspaceId: "ws-1",
        workspaceRoot: fixture.workspaceRoot,
    });
    return { coordinator, runner, trajectoryStore };
}

const COMPLETE: DecideStageResult = {
    kind: "decision",
    decision: { kind: "complete", summary: "done", completionEvidence: [] },
};

test("首次批准不消费未知结果等待，重执行命令不消费首次审批", async () => {
    const fixture = await createApprovalFixture({ throws: () => true });
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createReexecutionHarness(fixture, [COMPLETE]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        // 首次审批：重执行命令被拒绝。
        const wrongRetry = await coordinator.resume({
            ref,
            action: {
                kind: "retry_unknown_action",
                actionId: "action-approval",
                recoveryRef: computeActionRecoveryRef("action-approval", 1),
            },
        });
        assert.equal(wrongRetry.ok, false);
        if (!wrongRetry.ok) assert.equal(wrongRetry.error.code, "INVALID_GOAL_INPUT");

        const approved = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "action-approval" },
        });
        assert.equal(approved.ok, true);
        if (!approved.ok) return;
        assert.equal(approved.kind, "waiting");
        assert.equal(approved.waitingFor, "action_recovery");

        // 未知结果等待：首次批准命令被拒绝。
        const wrongApprove = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "action-approval" },
        });
        assert.equal(wrongApprove.ok, false);
        if (!wrongApprove.ok) assert.equal(wrongApprove.error.code, "INVALID_GOAL_INPUT");

        // 拒绝命令也不能消费未知结果等待。
        const wrongReject = await coordinator.resume({
            ref,
            action: { kind: "reject_action", actionId: "action-approval", reason: "拒绝" },
        });
        assert.equal(wrongReject.ok, false);
    } finally {
        await fixture.dispose();
    }
});

test("重执行绑定本次恢复身份，按获批版本再次执行", async () => {
    const fixture = await createApprovalFixture({ throws: () => true });
    try {
        const goal = createExecutingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createReexecutionHarness(fixture, [
            {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "act-1",
                        toolId: "write_file",
                        input: { path: "a.txt", content: "original" },
                    },
                },
            },
            COMPLETE,
        ]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const waiting = await coordinator.advance(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok || waiting.kind !== "waiting") return;
        assert.equal(waiting.waitingFor, "action_approval");

        // 修订为 B 并批准；manual 策略下执行进入未知结果等待。
        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "act-1",
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;
        const approved = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "act-1",
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(approved.ok, true);
        if (!approved.ok || approved.kind !== "waiting") return;
        assert.equal(approved.waitingFor, "action_recovery");

        const stored = await fixture.store.restore(goal.id);
        const recoveryRef = stored?.state.run.pendingAction?.recoveryRef;
        assert.ok(recoveryRef !== undefined);
        assert.equal(recoveryRef, computeActionRecoveryRef("act-1", 1));

        // 旧恢复身份不能授权本次重执行。
        const staleRef = await coordinator.resume({
            ref,
            action: {
                kind: "retry_unknown_action",
                actionId: "act-1",
                recoveryRef: computeActionRecoveryRef("act-1", 99),
            },
        });
        assert.equal(staleRef.ok, false);

        // 明确重执行：只按获批版本再次执行，不接受新参数。
        const retried = await coordinator.resume({
            ref,
            action: { kind: "retry_unknown_action", actionId: "act-1", recoveryRef },
        });
        assert.equal(retried.ok, true);
        if (!retried.ok || retried.kind !== "waiting") return;
        assert.equal(retried.waitingFor, "action_recovery");

        // 再次未知产生新的恢复身份，旧决定不能授权新一轮。
        const afterRetry = await fixture.store.restore(goal.id);
        const nextRecoveryRef = afterRetry?.state.run.pendingAction?.recoveryRef;
        assert.ok(nextRecoveryRef !== undefined);
        assert.notEqual(nextRecoveryRef, recoveryRef);
        assert.equal(nextRecoveryRef, computeActionRecoveryRef("act-1", 2));

        const reusedOldDecision = await coordinator.resume({
            ref,
            action: { kind: "retry_unknown_action", actionId: "act-1", recoveryRef },
        });
        assert.equal(reusedOldDecision.ok, false);
    } finally {
        await fixture.dispose();
    }
});

test("重执行不产生持续授权，拒绝重执行保留此前未知效果事实", async () => {
    const fixture = await createApprovalFixture({ throws: () => true });
    try {
        const goal = createExecutingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator, trajectoryStore } = createReexecutionHarness(fixture, [
            {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "act-1",
                        toolId: "write_file",
                        input: { path: "a.txt", content: "original" },
                    },
                },
            },
            COMPLETE,
        ]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const waiting = await coordinator.advance(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok || waiting.kind !== "waiting") return;
        const approved = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "act-1" },
        });
        assert.equal(approved.ok, true);
        if (!approved.ok || approved.kind !== "waiting") return;

        const stored = await fixture.store.restore(goal.id);
        const recoveryRef = stored?.state.run.pendingAction?.recoveryRef;
        assert.ok(recoveryRef !== undefined);

        const declined = await coordinator.resume({
            ref,
            action: {
                kind: "decline_unknown_action_retry",
                actionId: "act-1",
                recoveryRef,
                reason: "不再允许重复执行",
            },
        });
        assert.equal(declined.ok, true);

        // 拒绝重执行不产生持续授权。
        assert.deepEqual(await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id }), []);

        // 此前效果未知的事实保留在轨迹中，且没有伪造成功结果。
        const events = await trajectoryStore.read(ref);
        assert.equal(
            events.some((event) => event.eventType === "tool_attempt_failed"
                && event.payload.type === "tool_attempt_failed"
                && event.payload.reason === "outcome_unknown"),
            true,
        );
        const declinedEvent = events.find((event) => event.eventType === "action_reexecution_declined");
        assert.ok(declinedEvent !== undefined);
        const observations = events.filter((event) => event.eventType === "observation_recorded");
        assert.equal(
            observations.some((event) => event.eventType === "observation_recorded"
                && event.payload.observation.kind === "success"),
            false,
            "拒绝重执行不得伪造工具成功",
        );
    } finally {
        await fixture.dispose();
    }
});

test("显式恢复只重建等待，不授权再次执行", async () => {
    const fixture = await createApprovalFixture({ throws: () => true });
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createReexecutionHarness(fixture, [COMPLETE]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const approved = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "action-approval" },
        });
        assert.equal(approved.ok, true);
        if (!approved.ok || approved.kind !== "waiting") return;
        assert.equal(approved.waitingFor, "action_recovery");

        // 显式恢复重建等待，但等待身份不变、工具也不再执行。
        const before = await fixture.store.restore(goal.id);
        const beforeRef = before?.state.run.pendingAction?.recoveryRef;
        const attemptsBefore = fixture.calls.length;
        const after = await coordinator.advance(ref);
        assert.equal(after.ok, true);
        const restored = await fixture.store.restore(goal.id);
        assert.equal(restored?.state.run.pendingAction?.recoveryRef, beforeRef);
        assert.equal(restored?.state.run.pendingAction?.status, "outcome_unknown");
        assert.equal(fixture.calls.length, attemptsBefore);
    } finally {
        await fixture.dispose();
    }
});

test("状态层拒绝用首次批准消费未知结果等待", () => {
    const goal = createAwaitingApprovalGoal();
    const approved = transition(goal.state.run, {
        kind: "approve_action",
        actionId: "action-approval",
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const unknown = transition(approved.state, {
        kind: "recover_action",
        actionId: "action-approval",
    });
    assert.equal(unknown.ok, true);
    if (!unknown.ok) return;

    const wrongApprove = transition(unknown.state, {
        kind: "approve_action",
        actionId: "action-approval",
    });
    assert.equal(wrongApprove.ok, false);

    const wrongRetry = transition(unknown.state, {
        kind: "retry_unknown_action",
        actionId: "action-approval",
        recoveryRef: computeActionRecoveryRef("action-approval", 1),
    });
    assert.equal(wrongRetry.ok, true);
    if (!wrongRetry.ok) return;
    assert.equal(wrongRetry.state.pendingAction?.status, "approved");
    assert.equal(wrongRetry.state.pendingAction?.approvalScope, "action");
});

test("已被中断的 Run 拒绝重执行决定，原任务不越过中断", async () => {
    const fixture = await createApprovalFixture({ throws: () => true });
    try {
        const goal = createExecutingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createReexecutionHarness(fixture, [
            {
                kind: "decision",
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "act-1",
                        toolId: "write_file",
                        input: { path: "a.txt", content: "original" },
                    },
                },
            },
            COMPLETE,
        ]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const waiting = await coordinator.advance(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok || waiting.kind !== "waiting") return;
        const approved = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "act-1" },
        });
        assert.equal(approved.ok, true);
        if (!approved.ok || approved.kind !== "waiting") return;
        assert.equal(approved.waitingFor, "action_recovery");

        // 模拟已受理但尚未处理的停止：旧等待的任何回答与批准都必须失效。
        const interrupted = await fixture.store.restore(goal.id);
        assert.ok(interrupted !== undefined);
        await fixture.store.save({
            ...interrupted,
            state: {
                ...interrupted.state,
                run: {
                    ...interrupted.state.run,
                    interruption: {
                        requestId: "interrupt-1",
                        status: "requested",
                    },
                },
            },
        });

        const stored = await fixture.store.restore(goal.id);
        const recoveryRef = stored?.state.run.pendingAction?.recoveryRef;
        assert.ok(recoveryRef !== undefined);

        const rejected = await coordinator.resume({
            ref,
            action: { kind: "retry_unknown_action", actionId: "act-1", recoveryRef },
        });
        assert.equal(rejected.ok, false);
        if (!rejected.ok) assert.equal(rejected.error.code, "INVALID_GOAL_INPUT");
    } finally {
        await fixture.dispose();
    }
});
