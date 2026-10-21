import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal, type AgentProfile, type Goal, type SessionInputDigest } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    goalSnapshotCodec,
    GoalSnapshotProtocolError,
    JsonFileGoalStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "session-snapshot-profile",
    systemPrompt: "Test",
    instructions: [],
    toolIds: [],
};

const digest = `sha256:${"a".repeat(64)}` as const;

function createGoalWithSessionState(): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-session-snapshot",
        intent: "Snapshot session inputs",
        profile,
        runId: "run-session-snapshot",
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            commitRevision: 7,
            inputLedger: [
                {
                    inputId: "input-1",
                    kind: "message",
                    digest,
                    sequence: 1,
                    status: "applied",
                    admittedAtRevision: 2,
                    appliedRunId: "run-session-snapshot",
                    messageIndex: 0,
                },
                {
                    inputId: "input-2",
                    kind: "message",
                    digest,
                    sequence: 2,
                    status: "pending",
                    admittedAtRevision: 3,
                },
            ],
            messageQueue: {
                revision: 2,
                items: [{ inputId: "input-2", content: "尚未应用的任务", sequence: 2 }],
                pause: { reason: "user_interrupt", runId: "run-session-snapshot" },
            },
        },
    };
}

test("Snapshot round-trips the input ledger, queue revision and pause state", () => {
    const goal = createGoalWithSessionState();
    const encoded = goalSnapshotCodec.encode(goal);
    const restored = goalSnapshotCodec.decode(encoded);

    assert.equal(restored.state.commitRevision, 7);
    assert.deepEqual(restored.state.inputLedger, goal.state.inputLedger);
    assert.deepEqual(restored.state.messageQueue, goal.state.messageQueue);

    // 编解码不与输入共享可变引用。
    assert.notEqual(restored.state.inputLedger, goal.state.inputLedger);
    assert.notEqual(restored.state.messageQueue, goal.state.messageQueue);
});

test("a file Store persists the session ledger and queue and restores them across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-session-snapshot-"));
    try {
        const goal = createGoalWithSessionState();
        await new JsonFileGoalStore(directory).save(goal);

        const raw = await readFile(join(directory, `${Buffer.from(goal.id, "utf8").toString("base64url")}.json`), "utf8");
        const parsed = JSON.parse(raw) as {
            readonly state: {
                readonly commitRevision?: number;
                readonly inputLedger?: readonly unknown[];
                readonly messageQueue?: { readonly items?: readonly unknown[] };
            };
        };
        assert.equal(parsed.state.commitRevision, 7);
        assert.equal(parsed.state.inputLedger?.length, 2);
        assert.equal(parsed.state.messageQueue?.items?.length, 1);

        const restored = await new JsonFileGoalStore(directory).restore(goal.id);
        assert.deepEqual(restored?.state.inputLedger, goal.state.inputLedger);
        assert.deepEqual(restored?.state.messageQueue, goal.state.messageQueue);
        assert.equal(restored?.state.commitRevision, 7);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Snapshot rejects inconsistent session ledgers and queues", () => {
    const goal = createGoalWithSessionState();
    const { messageQueue: _queue, ...stateWithoutQueue } = goal.state;

    const duplicateInput = {
        ...goal,
        state: {
            ...stateWithoutQueue,
            inputLedger: [
                { ...goal.state.inputLedger![0]!, inputId: "same", messageIndex: undefined, appliedRunId: undefined, status: "cleared" as const },
                { ...goal.state.inputLedger![0]!, inputId: "same" },
            ],
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(duplicateInput), GoalSnapshotProtocolError);

    const appliedWithoutRun = {
        ...goal,
        state: {
            ...stateWithoutQueue,
            inputLedger: [{ ...goal.state.inputLedger![0]!, appliedRunId: undefined, messageIndex: undefined }],
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(appliedWithoutRun), GoalSnapshotProtocolError);

    const pendingWithoutQueue = {
        ...goal,
        state: { ...stateWithoutQueue },
    };
    assert.throws(() => goalSnapshotCodec.encode(pendingWithoutQueue), GoalSnapshotProtocolError);

    const queueWithoutRecord = {
        ...goal,
        state: {
            ...goal.state,
            inputLedger: [goal.state.inputLedger![0]!],
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(queueWithoutRecord), GoalSnapshotProtocolError);

    const badDigest = {
        ...goal,
        state: {
            ...stateWithoutQueue,
            inputLedger: [{ ...goal.state.inputLedger![0]!, digest: "md5:not-a-sha256" as SessionInputDigest }],
        },
    };
    assert.throws(() => goalSnapshotCodec.encode(badDigest), GoalSnapshotProtocolError);
});

test("Snapshot accepts documents without session state and reports no committed revision", () => {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-without-session",
        intent: "Snapshot without session inputs",
        profile,
        runId: "run-without-session",
    });
    const parsed = JSON.parse(JSON.stringify(goalSnapshotCodec.encode(goal))) as {
        readonly state: Record<string, unknown>;
    };
    delete parsed.state.commitRevision;
    delete parsed.state.inputLedger;
    delete parsed.state.messageQueue;

    const restored = goalSnapshotCodec.decode(parsed);
    assert.equal(restored.state.commitRevision, undefined);
    assert.equal(restored.state.inputLedger, undefined);
    assert.equal(restored.state.messageQueue, undefined);
});
