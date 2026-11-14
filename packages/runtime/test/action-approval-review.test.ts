import assert from "node:assert/strict";
import { realpath } from "node:fs/promises";
import { test } from "node:test";

import {
    GoalCoordinator,
    transition,
    type DiagnosticTraceSink,
    type TraceRecord,
} from "../src/index";
import {
    createApprovalFixture,
    createAwaitingApprovalGoal,
} from "./action-approval-fixtures";
import { trajectoryStoreFor } from "./current-fixtures";

class RecordingTraceSink implements DiagnosticTraceSink {
    readonly records: TraceRecord[] = [];

    async append(record: TraceRecord): Promise<void> {
        this.records.push(structuredClone(record));
    }
}

/** 构造一个只用于预检的 Coordinator；不调度执行。 */
function createReviewCoordinator(
    fixture: Awaited<ReturnType<typeof createApprovalFixture>>,
    traceSink?: DiagnosticTraceSink,
) {
    return new GoalCoordinator({
        store: fixture.store,
        scheduler: {
            async schedule() {
                throw new Error("Unexpected Scheduler call");
            },
        },
        toolRegistry: fixture.registry,
        sandboxGrantStore: fixture.sandboxGrantStore,
        workspaceId: "ws-1",
        workspaceRoot: fixture.workspaceRoot,
        trajectoryStore: trajectoryStoreFor(fixture.store),
        ...(traceSink === undefined ? {} : { traceSink }),
    });
}

test("预检返回最终 canonical 参数、实际目标与审阅引用，且不写入任何状态", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const result = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            scope: "action",
        });

        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.review.actionId, "action-approval");
        assert.equal(result.review.toolId, "write_file");
        assert.deepEqual(result.review.originalInput, { path: "a.txt", content: "original" });
        assert.deepEqual(result.review.finalInput, { path: "b.txt", content: "revised" });
        assert.equal(result.review.changed, true);
        assert.equal(result.review.scope, "action");
        assert.deepEqual([...result.review.availableScopes], ["action"]);
        assert.equal(result.review.requiresSandboxApproval, false);
        assert.match(result.review.reviewRef, /^review:[0-9a-f]{32}$/);
        assert.deepEqual(result.review.capability.targetPaths, []);

        // 预检不保存批准、不暂存授权、不执行工具。
        const stored = await fixture.store.restore(goal.id);
        assert.equal(stored?.state.run.pendingAction?.status, "awaiting_approval");
        assert.equal(stored?.state.run.pendingAction?.executionVersion, undefined);
        assert.deepEqual(await fixture.sandboxGrantStore.list({ workspaceId: "ws-1" }), []);
        assert.deepEqual(await fixture.sandboxGrantStore.list({ workspaceId: "ws-1" }), []);
        assert.equal(fixture.calls.length, 0);
    } finally {
        await fixture.dispose();
    }
});

test("审批参数预审记录工具输入剥离诊断且不泄露外部键名", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const traceSink = new RecordingTraceSink();
        const coordinator = createReviewCoordinator(fixture, traceSink);

        const result = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-approval",
            input: {
                path: "b.txt",
                content: "revised",
                "secret-example-token": "secret-value",
            },
            scope: "action",
        });

        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.deepEqual(result.review.finalInput, { path: "b.txt", content: "revised" });

        const records = traceSink.records.filter(record => record.kind === "tool_input_diagnostic");
        assert.equal(records.length, 1);
        assert.deepEqual(records[0]!.payload, {
            contractId: "test.tool",
            version: 1,
            paths: ["/*"],
            truncated: false,
        });
        assert.equal(JSON.stringify(records).includes("secret-example-token"), false);
        assert.equal(JSON.stringify(records).includes("secret-value"), false);
    } finally {
        await fixture.dispose();
    }
});

test("预检原样审阅时 changed 为 false 且沿用原参数", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const result = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-approval",
        });

        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.review.changed, false);
        assert.deepEqual(result.review.finalInput, { path: "a.txt", content: "original" });
        assert.deepEqual(result.review.capability.targetPaths, []);
    } finally {
        await fixture.dispose();
    }
});

test("预检拒绝无效参数并给出可定位字段，且保留原等待", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const result = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-approval",
            input: { path: 42 } as never,
        });

        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.equal(result.code, "INVALID_TOOL_INPUT");
        assert.ok(result.issues !== undefined && result.issues.length > 0);
        assert.equal(fixture.calls.length, 0);
        const stored = await fixture.store.restore(goal.id);
        assert.equal(stored?.state.run.pendingAction?.status, "awaiting_approval");
    } finally {
        await fixture.dispose();
    }
});

test("预检拒绝错 Action、旧 Run 与未知结果等待", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const wrongAction = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-other",
        });
        assert.equal(wrongAction.ok, false);
        if (!wrongAction.ok) assert.equal(wrongAction.code, "ACTION_ID_MISMATCH");

        const wrongRun = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: "run-other" },
            actionId: "action-approval",
        });
        assert.equal(wrongRun.ok, false);
        if (!wrongRun.ok) assert.equal(wrongRun.code, "ACTION_NOT_AWAITING_APPROVAL");

        const unknown = createAwaitingApprovalGoal({ goalId: "goal-unknown", runId: "run-unknown" });
        const approved = transition(unknown.state.run, { kind: "approve_action", actionId: "action-approval" });
        assert.equal(approved.ok, true);
        if (!approved.ok) return;
        const recovered = transition(approved.state, { kind: "recover_action", actionId: "action-approval" });
        assert.equal(recovered.ok, true);
        if (!recovered.ok) return;
        const recoveredGoal = { ...unknown, state: { ...unknown.state, run: recovered.state } };
        await fixture.store.save(recoveredGoal);
        const recoveryResult = await coordinator.reviewActionApproval({
            ref: { goalId: recoveredGoal.id, runId: recoveredGoal.state.run.id },
            actionId: "action-approval",
        });
        assert.equal(recoveryResult.ok, false);
        if (!recoveryResult.ok) {
            assert.equal(recoveryResult.code, "ACTION_NOT_AWAITING_APPROVAL");
        }
    } finally {
        await fixture.dispose();
    }
});

test("预检拒绝未注册工具与不可用的持续授权期限", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ toolId: "unknown_tool" });
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const unknownTool = await coordinator.reviewActionApproval({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            actionId: "action-approval",
        });
        assert.equal(unknownTool.ok, false);
        if (!unknownTool.ok) assert.equal(unknownTool.code, "TOOL_NOT_FOUND");

        const scoped = createAwaitingApprovalGoal({ goalId: "goal-scope", runId: "run-scope" });
        await fixture.store.save(scoped);
        const noWorkspaceCoordinator = new GoalCoordinator({
            store: fixture.store,
            scheduler: {
                async schedule() {
                    throw new Error("Unexpected Scheduler call");
                },
            },
            toolRegistry: fixture.registry,
        });
        const scopedResult = await noWorkspaceCoordinator.reviewActionApproval({
            ref: { goalId: scoped.id, runId: scoped.state.run.id },
            actionId: "action-approval",
            scope: "goal",
        });
        assert.equal(scopedResult.ok, false);
        if (!scopedResult.ok) assert.equal(scopedResult.code, "SCOPE_UNAVAILABLE");
    } finally {
        await fixture.dispose();
    }
});

test("并行预检各自保留结果，互不覆盖", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const coordinator = createReviewCoordinator(fixture);

        const [first, second] = await Promise.all([
            coordinator.reviewActionApproval({
                ref: { goalId: goal.id, runId: goal.state.run.id },
                actionId: "action-approval",
                input: { path: "b.txt", content: "revised" },
            }),
            coordinator.reviewActionApproval({
                ref: { goalId: goal.id, runId: goal.state.run.id },
                actionId: "action-approval",
                input: { path: "c.txt", content: "other" },
            }),
        ]);

        assert.equal(first.ok, true);
        assert.equal(second.ok, true);
        if (!first.ok || !second.ok) return;
        assert.notEqual(first.review.reviewRef, second.review.reviewRef);
        assert.deepEqual(first.review.finalInput, { path: "b.txt", content: "revised" });
        assert.deepEqual(second.review.finalInput, { path: "c.txt", content: "other" });
    } finally {
        await fixture.dispose();
    }
});
