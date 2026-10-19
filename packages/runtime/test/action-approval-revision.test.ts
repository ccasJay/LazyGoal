import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
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

/** 构造一个可执行 Tool 的 Coordinator；Tool 调用会被真实记录。 */
function createRevisionHarness(
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

test("修订批准后实际执行最终参数，原请求与暂存事实保持不变", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createExecutingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator, trajectoryStore } = createRevisionHarness(fixture, [
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
        if (!waiting.ok) return;
        assert.equal(waiting.kind, "waiting");
        assert.equal(waiting.waitingFor, "action_approval");

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "act-1",
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const resumed = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "act-1",
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(resumed.ok, true);

        // 实际工具调用使用最终参数 B。
        assert.equal(fixture.calls.length, 1);
        assert.deepEqual(fixture.calls[0]?.input, { path: "b.txt", content: "revised" });

        // 原暂存事实与修订事实同时存在，原请求不被覆盖。
        const events = await trajectoryStore.read(ref);
        const staged = events.find((event) => event.eventType === "action_staged");
        assert.ok(staged !== undefined);
        if (staged?.eventType === "action_staged") {
            assert.deepEqual(staged.payload.action.input, { path: "a.txt", content: "original" });
        }
        const revised = events.find((event) => event.eventType === "action_revised");
        assert.ok(revised !== undefined);
        if (revised?.eventType === "action_revised") {
            assert.equal(revised.payload.actionId, "act-1");
            assert.deepEqual(revised.payload.originalInput, { path: "a.txt", content: "original" });
            assert.deepEqual(revised.payload.finalInput, { path: "b.txt", content: "revised" });
        }

        // 获批版本不可再编辑：再次修订被拒绝。
        const again = await coordinator.reviewActionApproval({
            ref,
            actionId: "act-1",
            input: { path: "c.txt", content: "later" },
        });
        assert.equal(again.ok, false);
        if (!again.ok) assert.equal(again.code, "ACTION_NOT_AWAITING_APPROVAL");
    } finally {
        await fixture.dispose();
    }
});

test("审阅内容变化后旧确认被拒绝，且不执行工具", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createRevisionHarness(fixture, [COMPLETE]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        // 提交内容与审阅内容不一致：明确拒绝并要求重新审阅。
        const mismatched = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "action-approval",
                input: { path: "c.txt", content: "changed" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(mismatched.ok, false);
        if (!mismatched.ok) assert.equal(mismatched.error.code, "INVALID_GOAL_INPUT");
        assert.equal(fixture.calls.length, 0);

        // 等待保持不变，仍可按原审阅内容确认。
        const stored = await fixture.store.restore(goal.id);
        assert.equal(stored?.state.run.pendingAction?.status, "awaiting_approval");

        const confirmed = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "action-approval",
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(confirmed.ok, true);
        assert.equal(fixture.calls.length, 1);
        assert.deepEqual(fixture.calls[0]?.input, { path: "b.txt", content: "revised" });
    } finally {
        await fixture.dispose();
    }
});

test("修订后旧批次未开始项失效，模型在知晓变化后重新决策", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createExecutingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator, trajectoryStore } = createRevisionHarness(fixture, [
            {
                kind: "batch",
                decisions: [
                    {
                        kind: "tool_call",
                        action: {
                            actionId: "act-1",
                            toolId: "write_file",
                            input: { path: "a.txt", content: "original" },
                        },
                    },
                    {
                        kind: "tool_call",
                        action: {
                            actionId: "act-2",
                            toolId: "write_file",
                            input: { path: "b.txt", content: "second" },
                        },
                    },
                ],
            },
            COMPLETE,
        ]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const waiting = await coordinator.advance(ref);
        assert.equal(waiting.ok, true);
        if (!waiting.ok || waiting.kind !== "waiting") return;
        assert.equal(waiting.waitingFor, "action_approval");

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "act-1",
            input: { path: "a.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const resumed = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "act-1",
                input: { path: "a.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
            },
        });
        assert.equal(resumed.ok, true);

        // 旧批次的第二项从未执行。
        assert.equal(fixture.calls.length, 1);
        assert.deepEqual(fixture.calls[0]?.input, { path: "a.txt", content: "revised" });
        const events = await trajectoryStore.read(ref);
        const stagedActionIds = events
            .filter((event) => event.eventType === "action_staged")
            .map((event) => (event.eventType === "action_staged" ? event.payload.action.actionId : ""));
        assert.deepEqual(stagedActionIds, ["act-1"]);
        const revised = events.find((event) => event.eventType === "action_revised");
        assert.ok(revised !== undefined);
        if (revised?.eventType === "action_revised") {
            assert.deepEqual(revised.payload.invalidatedBatchActionIds, ["act-2"]);
        }
    } finally {
        await fixture.dispose();
    }
});

test("修订批准保存失败时不执行工具，等待保持可重试", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await new GoalCoordinator({
            store: fixture.store,
            scheduler: {
                async schedule() {
                    throw new Error("Unexpected Scheduler call");
                },
            },
            toolRegistry: fixture.registry,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        }).reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        // 批准快照保存失败：明确抛错，不执行工具。
        const failing = new GoalCoordinator({
            store: {
                async save(): Promise<void> {
                    throw new Error("snapshot save failed");
                },
                async restore(goalId: string) {
                    return fixture.store.restore(goalId);
                },
            },
            scheduler: {
                async schedule() {
                    throw new Error("Unexpected Scheduler call");
                },
            },
            toolRegistry: fixture.registry,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        await assert.rejects(
            failing.resume({
                ref,
                action: {
                    kind: "approve_action_revision",
                    actionId: "action-approval",
                    input: { path: "b.txt", content: "revised" },
                    reviewRef: review.review.reviewRef,
                },
            }),
            /snapshot save failed/,
        );
        assert.equal(fixture.calls.length, 0);
        const stored = await fixture.store.restore(goal.id);
        assert.equal(stored?.state.run.pendingAction?.status, "awaiting_approval");
    } finally {
        await fixture.dispose();
    }
});

test("同一决定重复提交只生效一次，不产生第二次批准", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator, trajectoryStore } = createRevisionHarness(fixture, [COMPLETE]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const action = {
            kind: "approve_action_revision" as const,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            reviewRef: review.review.reviewRef,
        };
        const first = await coordinator.resume({ ref, action });
        assert.equal(first.ok, true);
        const second = await coordinator.resume({ ref, action });
        assert.equal(second.ok, false);
        assert.equal(fixture.calls.length, 1);

        const revisedEvents = (await trajectoryStore.read(ref))
            .filter((event) => event.eventType === "action_revised");
        assert.equal(revisedEvents.length, 1);
    } finally {
        await fixture.dispose();
    }
});

test("拒绝并给出建议仍走原拒绝路径，不执行建议内容", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createRevisionHarness(fixture, [COMPLETE]);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const rejected = await coordinator.resume({
            ref,
            action: {
                kind: "reject_action",
                actionId: "action-approval",
                reason: "请改用其它工具",
            },
        });
        assert.equal(rejected.ok, true);
        assert.equal(fixture.calls.length, 0);
        const stored = await fixture.store.restore(goal.id);
        assert.equal(stored?.state.run.pendingAction, undefined);
    } finally {
        await fixture.dispose();
    }
});
