import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    MAX_PENDING_SESSION_INPUTS,
    MAX_PENDING_SESSION_INPUT_TEXT_LENGTH,
    MAX_SESSION_INPUT_TEXT_LENGTH,
    Runner,
    SessionInputAdmission,
    SessionInputAdmissionError,
    TrajectoryCheckpointCommitter,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type GoalStore,
    type StepExecutor,
} from "../src/index";
import { InMemoryGoalStore, JsonFileGoalStore } from "../../storage/src/index";
import { BaseTestStepExecutor, currentProtocols, InMemoryTrajectoryStore, messageOutline, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "session-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

function createSessionGoal(options?: {
    readonly goalId?: string;
    readonly runId?: string;
}): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: options?.goalId ?? "goal-session-input",
        intent: "test session inputs",
        profile,
        runId: options?.runId ?? "run-session-input",
    });
    // 与 Launcher 首次保存一致：首个成功提交的修订为 1。
    return { ...created, state: { ...created.state, commitRevision: 1 } };
}

function createAdmission(store: GoalStore, trajectory = new InMemoryTrajectoryStore()) {
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    return {
        trajectory,
        admission: new SessionInputAdmission({ store, committer }),
    };
}

test("an accepted message is persisted with a stable receipt that survives a rebuilt Store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-session-input-"));
    try {
        const goal = createSessionGoal();
        const store = new JsonFileGoalStore(directory);
        await store.save(goal);
        const first = createAdmission(store);
        const admitted = await first.admission.admit(goal.id, {
            kind: "message",
            inputId: "input-1",
            content: "第一条后续任务",
        });
        assert.equal(admitted.ok, true);
        assert.equal(admitted.ok && admitted.existing, false);
        assert.equal(admitted.ok && admitted.receipt.sequence, 1);
        assert.equal(admitted.ok && admitted.receipt.status, "pending");
        assert.equal(admitted.ok && admitted.receipt.admittedAtRevision, 2);

        const rebuilt = new JsonFileGoalStore(directory);
        const restored = await rebuilt.restore(goal.id);
        assert.ok(restored);
        assert.equal(restored.state.commitRevision, 2);
        assert.deepEqual(restored.state.inputLedger, [{
            inputId: "input-1",
            kind: "message",
            digest: admitted.ok ? admitted.receipt.digest : "",
            sequence: 1,
            status: "pending",
            admittedAtRevision: 2,
        }]);
        assert.deepEqual(restored.state.messageQueue?.items, [{
            inputId: "input-1",
            content: "第一条后续任务",
            sequence: 1,
        }]);
        // 受理不执行任务：Run 与真实对话保持受理前的状态。
        assert.equal(restored.state.run.status, "created");
        assert.deepEqual(messageOutline(restored.state.messages), [
            { role: "user", content: "test session inputs" },
        ]);

        const rebuiltAdmission = createAdmission(rebuilt);
        const retried = await rebuiltAdmission.admission.admit(goal.id, {
            kind: "message",
            inputId: "input-1",
            content: "第一条后续任务",
        });
        assert.equal(retried.ok, true);
        assert.equal(retried.ok && retried.existing, true);
        assert.equal(retried.ok && retried.receipt.sequence, 1);
        const afterRetry = await rebuilt.restore(goal.id);
        assert.equal(afterRetry?.state.messageQueue?.items.length, 1);
        assert.equal(afterRetry?.state.commitRevision, 2);

        const conflicted = await rebuiltAdmission.admission.admit(goal.id, {
            kind: "message",
            inputId: "input-1",
            content: "改写的正文",
        });
        assert.equal(conflicted.ok, false);
        assert.equal(conflicted.ok === false && conflicted.code, "INPUT_CONFLICT");
        const afterConflict = await rebuilt.restore(goal.id);
        assert.deepEqual(afterConflict?.state.messageQueue?.items, [{
            inputId: "input-1",
            content: "第一条后续任务",
            sequence: 1,
        }]);
        assert.equal(afterConflict?.state.commitRevision, 2);

        const queried = await rebuiltAdmission.admission.query(goal.id, "input-1");
        assert.equal(queried.ok, true);
        assert.equal(queried.ok && queried.found, true);
        assert.equal(queried.ok && queried.found && queried.receipt.digest, admitted.ok ? admitted.receipt.digest : "");
        const missing = await rebuiltAdmission.admission.query(goal.id, "input-unknown");
        assert.deepEqual(missing, { ok: true, found: false });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("admission records a durable fact inside the snapshot boundary", async () => {
    const store = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await store.save(goal);
    const { admission, trajectory } = createAdmission(store);

    const admitted = await admission.admit(goal.id, {
        kind: "message",
        inputId: "input-1",
        content: "记录提交边界",
    });
    assert.equal(admitted.ok, true);

    const saved = await store.restore(goal.id);
    assert.ok(saved);
    const admittedFacts = trajectory.events.filter((event) => event.payload.type === "session_input_admitted");
    assert.equal(admittedFacts.length, 1);
    assert.deepEqual(admittedFacts[0]?.payload, {
        type: "session_input_admitted",
        inputId: "input-1",
        kind: "message",
        sequence: 1,
    });
    assert.ok(saved.state.run.committedThroughSequence >= (admittedFacts[0]?.sequence ?? 0));
});

test("a failed save reports a verifiable identity and admits exactly once on retry", async () => {
    const inner = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await inner.save(goal);
    let failBeforeWrite = true;
    const failing: GoalStore = {
        save: async (next) => {
            if (failBeforeWrite) throw new Error("simulated save failure");
            await inner.save(next);
        },
        restore: (goalId) => inner.restore(goalId),
    };
    const { admission } = createAdmission(failing);

    await assert.rejects(
        () => admission.admit(goal.id, { kind: "message", inputId: "input-1", content: "重试身份" }),
        (error: unknown) => {
            assert.ok(error instanceof SessionInputAdmissionError);
            assert.equal(error.goalId, goal.id);
            assert.equal(error.inputId, "input-1");
            return true;
        },
    );
    const notAdmitted = await admission.query(goal.id, "input-1");
    assert.deepEqual(notAdmitted, { ok: true, found: false });
    const untouched = await inner.restore(goal.id);
    assert.equal(untouched?.state.messageQueue, undefined);

    failBeforeWrite = false;
    const retried = await admission.admit(goal.id, { kind: "message", inputId: "input-1", content: "重试身份" });
    assert.equal(retried.ok, true);
    assert.equal(retried.ok && retried.existing, false);
    const saved = await inner.restore(goal.id);
    assert.equal(saved?.state.messageQueue?.items.length, 1);
    assert.equal(saved?.state.inputLedger?.length, 1);
});

test("an unknown save result stays verifiable by the original identity", async () => {
    const inner = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await inner.save(goal);
    let reportFailureAfterWrite = true;
    const lossy: GoalStore = {
        save: async (next) => {
            await inner.save(next);
            if (reportFailureAfterWrite) throw new Error("simulated lost response");
        },
        restore: (goalId) => inner.restore(goalId),
    };
    const { admission } = createAdmission(lossy);

    await assert.rejects(
        () => admission.admit(goal.id, { kind: "message", inputId: "input-1", content: "响应丢失" }),
        SessionInputAdmissionError,
    );
    const recovered = await admission.query(goal.id, "input-1");
    assert.equal(recovered.ok, true);
    assert.equal(recovered.ok && recovered.found, true);
    assert.equal(recovered.ok && recovered.found && recovered.receipt.sequence, 1);
    // 提交已经发生但响应丢失时，允许没有 marker 的中间状态；不得断言消息不存在。
    assert.equal(await inner.restore(goal.id) === undefined, false);

    reportFailureAfterWrite = false;
    const retried = await admission.admit(goal.id, { kind: "message", inputId: "input-1", content: "响应丢失" });
    assert.equal(retried.ok, true);
    assert.equal(retried.ok && retried.existing, true);
    const saved = await inner.restore(goal.id);
    assert.equal(saved?.state.messageQueue?.items.length, 1);
    assert.equal(saved?.state.inputLedger?.length, 1);
});

test("text quota rejects oversized and excessive pending inputs without dropping accepted ones", async () => {
    const store = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await store.save(goal);
    const { admission } = createAdmission(store);

    const oversized = await admission.admit(goal.id, {
        kind: "message",
        inputId: "too-long",
        content: "界".repeat(MAX_SESSION_INPUT_TEXT_LENGTH + 1),
    });
    assert.equal(oversized.ok, false);
    assert.equal(oversized.ok === false && oversized.code, "TEXT_TOO_LARGE");

    const single = await admission.admit(goal.id, {
        kind: "message",
        inputId: "single-max",
        content: "界".repeat(MAX_SESSION_INPUT_TEXT_LENGTH),
    });
    assert.equal(single.ok, true);

    let total = MAX_SESSION_INPUT_TEXT_LENGTH;
    let index = 0;
    while (total + MAX_SESSION_INPUT_TEXT_LENGTH <= MAX_PENDING_SESSION_INPUT_TEXT_LENGTH) {
        const admitted = await admission.admit(goal.id, {
            kind: "message",
            inputId: `bulk-${index}`,
            content: "界".repeat(MAX_SESSION_INPUT_TEXT_LENGTH),
        });
        assert.equal(admitted.ok, true);
        total += MAX_SESSION_INPUT_TEXT_LENGTH;
        index += 1;
    }
    assert.ok(index > 0);
    const overflow = await admission.admit(goal.id, {
        kind: "message",
        inputId: "total-overflow",
        content: "界".repeat(MAX_SESSION_INPUT_TEXT_LENGTH),
    });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.ok === false && overflow.code, "QUEUE_TEXT_TOO_LARGE");

    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.messageQueue?.items.length, index + 1);
    assert.equal(saved?.state.inputLedger?.length, index + 1);
    assert.ok((saved?.state.messageQueue?.items.length ?? 0) <= MAX_PENDING_SESSION_INPUTS);
});

test("the item quota rejects new messages but keeps existing items and controls available", async () => {
    const store = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await store.save(goal);
    const { admission } = createAdmission(store);

    for (let index = 0; index < MAX_PENDING_SESSION_INPUTS; index += 1) {
        const admitted = await admission.admit(goal.id, {
            kind: "message",
            inputId: `item-${index}`,
            content: `任务 ${index}`,
        });
        assert.equal(admitted.ok, true, `item ${index} must be admitted`);
    }

    const refused = await admission.admit(goal.id, {
        kind: "message",
        inputId: "item-overflow",
        content: "超出额度",
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false && refused.code, "QUEUE_FULL");

    // 重复请求不重复占用额度：同身份同载荷仍返回原收据。
    const repeated = await admission.admit(goal.id, {
        kind: "message",
        inputId: "item-0",
        content: "任务 0",
    });
    assert.equal(repeated.ok, true);
    assert.equal(repeated.ok && repeated.existing, true);

    // 满队列仍允许清空；控制类输入不受文本额度阻塞。
    const cleared = await admission.admit(goal.id, {
        kind: "queue_control",
        inputId: "clear-1",
        action: "clear",
        queueRevision: MAX_PENDING_SESSION_INPUTS,
    });
    assert.equal(cleared.ok, true);
    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.messageQueue?.items.length, 0);
    assert.equal(saved?.state.messageQueue?.revision, MAX_PENDING_SESSION_INPUTS + 1);
    assert.equal(saved?.state.inputLedger?.filter((record) => record.status === "cleared").length, MAX_PENDING_SESSION_INPUTS);
    assert.ok(saved?.state.inputLedger?.some((record) => record.inputId === "item-0" && record.status === "cleared"));

    const afterClear = await admission.admit(goal.id, {
        kind: "message",
        inputId: "item-after-clear",
        content: "清空后的新任务",
    });
    assert.equal(afterClear.ok, true);
    assert.equal(afterClear.ok && afterClear.receipt.sequence, MAX_PENDING_SESSION_INPUTS + 2);
});

test("new messages only lift an empty queue pause after the Run has ended", async () => {
    for (const status of ["created", "running", "waiting", "completed", "failed", "cancelled"] as const) {
        const store = new InMemoryGoalStore();
        const goal = createSessionGoal();
        await store.save(goal);
        if (status === "waiting" || status === "completed" || status === "failed") {
            const executor = new class extends BaseTestStepExecutor {
                async execute(): Promise<AgentDecision> {
                    if (status === "waiting") return { kind: "wait", reason: "Waiting" };
                    if (status === "completed") return { kind: "complete", summary: "Done", evidenceSequences: [] };
                    return { kind: "fail", error: "Failed" };
                }
            }();
            const runner = new Runner({ store, trajectoryStore: trajectoryStoreFor(store), executor });
            assert.equal((await runner.runUntilBlocked({ goalId: goal.id, runId: goal.state.run.id })).ok, true);
        }
        const current = (await store.restore(goal.id))!;
        await store.save({
            ...current,
            state: {
                ...current.state,
                run: { ...current.state.run, status },
                messageQueue: { revision: 3, items: [], pause: { reason: "user_interrupt", runId: goal.state.run.id } },
            },
        });
        const { admission } = createAdmission(store);
        const input = { kind: "message", inputId: "input-after-pause", content: "New task" } as const;
        assert.equal((await admission.admit(goal.id, input)).ok, true);
        const saved = (await store.restore(goal.id))!;
        const terminal = status === "completed" || status === "failed" || status === "cancelled";
        assert.equal(saved.state.messageQueue?.pause === undefined, terminal, status);
        assert.equal(saved.state.messageQueue?.revision, terminal ? 5 : 4);
        assert.equal(saved.state.run.status, status);
        const repeated = await admission.admit(goal.id, input);
        assert.equal(repeated.ok && repeated.existing, true);
        assert.deepEqual(await store.restore(goal.id), saved);
    }
});

test("queue controls require the observed revision and a paused queue", async () => {
    const store = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await store.save(goal);
    const { admission } = createAdmission(store);

    await admission.admit(goal.id, { kind: "message", inputId: "input-1", content: "任务" });

    const stale = await admission.admit(goal.id, {
        kind: "queue_control",
        inputId: "control-stale",
        action: "clear",
        queueRevision: 0,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.ok === false && stale.code, "QUEUE_REVISION_MISMATCH");

    const resumed = await admission.admit(goal.id, {
        kind: "queue_control",
        inputId: "control-continue",
        action: "continue",
        queueRevision: 1,
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.ok === false && resumed.code, "QUEUE_NOT_PAUSED");

    const saved = await store.restore(goal.id);
    assert.equal(saved?.state.messageQueue?.items.length, 1);
    assert.equal(saved?.state.inputLedger?.length, 1);
});

test("remove deletes one queued message and rejects a stale queue revision", async () => {
    const store = new InMemoryGoalStore();
    const goal = createSessionGoal();
    await store.save(goal);
    const { admission } = createAdmission(store);

    for (const [inputId, content] of [["input-1", "保留一"], ["input-2", "删除这条"], ["input-3", "保留三"]] as const) {
        assert.equal((await admission.admit(goal.id, { kind: "message", inputId, content })).ok, true);
    }

    const stale = await admission.admit(goal.id, {
        kind: "queue_control",
        inputId: "remove-stale",
        action: "remove",
        messageId: "input-2",
        queueRevision: 2,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.ok === false && stale.code, "QUEUE_REVISION_MISMATCH");

    const removed = await admission.admit(goal.id, {
        kind: "queue_control",
        inputId: "remove-input-2",
        action: "remove",
        messageId: "input-2",
        queueRevision: 3,
    });
    assert.equal(removed.ok, true);
    const saved = (await store.restore(goal.id))!;
    assert.equal(saved.state.messageQueue?.revision, 4);
    assert.deepEqual(saved.state.messageQueue?.items.map((item) => item.inputId), ["input-1", "input-3"]);
    assert.deepEqual(
        saved.state.inputLedger?.map((record) => [record.inputId, record.status]),
        [["input-1", "pending"], ["input-2", "cleared"], ["input-3", "pending"], ["remove-input-2", "applied"]],
    );
});

test("missing Goals are reported without writing anything", async () => {
    const store = new InMemoryGoalStore();
    const { admission, trajectory } = createAdmission(store);

    const result = await admission.admit("goal-missing", {
        kind: "message",
        inputId: "input-1",
        content: "任务",
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "GOAL_NOT_FOUND");
    const queried = await admission.query("goal-missing", "input-1");
    assert.equal(queried.ok, false);
    assert.equal(trajectory.events.length, 0);
});

test("an execution commit based on an older snapshot cannot overwrite a concurrent admission", async () => {
    const store = new InMemoryGoalStore();
    const trajectory = trajectoryStoreFor(store);
    const initial = createSessionGoal({ goalId: "goal-session-race", runId: "run-session-race" });
    await store.save(initial);

    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide({ goal }) {
            calls += 1;
            entered();
            await releasePromise;
            return {
                kind: "decision",
                decision: { kind: "fail", error: "terminal after admission" },
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: goal.state.run.contextEpoch.number,
                    conversationPosition: goal.state.messages.length,
                    sections: [],
                },
            };
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({ store, trajectoryStore: trajectory, executor });
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const admission = new SessionInputAdmission({ store, committer });

    const execution = runner.runUntilBlocked({ goalId: initial.id, runId: initial.state.run.id });
    await enteredPromise;

    const admitted = await admission.admit(initial.id, {
        kind: "message",
        inputId: "input-during-run",
        content: "执行期间提交的后续任务",
    });
    assert.equal(admitted.ok, true);
    assert.equal(calls, 1);

    release();
    const result = await execution;
    assert.equal(result.ok, true);

    const saved = await store.restore(initial.id);
    assert.ok(saved);
    assert.equal(saved.state.run.status, "failed");
    assert.deepEqual(saved.state.messageQueue?.items, [{
        inputId: "input-during-run",
        content: "执行期间提交的后续任务",
        sequence: 1,
    }]);
    assert.deepEqual(saved.state.inputLedger?.map((record) => record.inputId), ["input-during-run"]);
    assert.ok((saved.state.commitRevision ?? 0) > (admitted.ok ? admitted.receipt.admittedAtRevision : 0));
});
