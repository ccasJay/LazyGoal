import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryAppendError,
    TrajectoryCheckpointCommitter,
    TrajectoryCommitMarkerError,
    allocateImmutableEvent,
    createGoal,
} from "../src/index";
import type {
    AgentProfile,
    CanonicalMemoryOperation,
    Goal,
    GoalStore,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectorySink,
} from "../src/index";

const profile: AgentProfile = {
    id: "committer-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function goal(): Goal {
    return createGoal({
        id: "committer-goal",
        intent: "验证共享提交器",
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        profile,
        runId: "committer-run",
    });
}

class RecordingStore implements GoalStore {
    saved: Goal[] = [];
    fail = false;

    async save(value: Goal): Promise<void> {
        if (this.fail) throw new Error("snapshot failed");
        this.saved.push(structuredClone(value));
    }

    async restore(): Promise<Goal | undefined> {
        const value = this.saved.at(-1);
        return value === undefined ? undefined : structuredClone(value);
    }
}

class RecordingSink implements TrajectorySink {
    events: TrajectoryEvent[] = [];
    failType?: string;

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        if (draft.eventType === this.failType) throw new Error(`${draft.eventType} failed`);
        const event = allocateImmutableEvent(
            draft,
            this.events.length + 1,
            `committer-event-${this.events.length + 1}`,
        );
        this.events.push(event);
        return event;
    }
}

const findingOperation: CanonicalMemoryOperation = {
    type: "upsert_fact",
    fact: {
        kind: "fact",
        id: "fact:5e11b5946524fcdb59bb43f8f7258d2b",
        subject: "workspace",
        predicate: "file_read",
        value: true,
        stability: "last_observed",
        originPhase: "executing",
        originSequence: 2,
        updatedAtSequence: 2,
        scope: "goal",
        evidenceSequences: [1],
        reinforcementCount: 1,
        lastEvidenceSequence: 1,
        source: "model",
    },
};

function factDraft(): TrajectoryEventDraft {
    return {
        goalId: "committer-goal",
        runId: "committer-run",
        phase: "executing",
        eventType: "observation_recorded",
        actionId: "action-1",
        payload: {
            type: "observation_recorded",
            actionId: "action-1",
            observation: { kind: "success", output: "ok", summary: "读取成功" },
        },
    };
}

test("committer appends facts then accepted Patch and saves revision only in Snapshot copy", async () => {
    const store = new RecordingStore();
    const sink = new RecordingSink();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink: sink });
    const initial = goal();

    const result = await committer.commit(initial, {
        facts: [factDraft()],
        acceptedPatch: {
            phase: "executing",
            producers: ["runtime_lifecycle", "model", "model"],
            operations: [findingOperation],
        },
    });

    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "observation_recorded",
        "memory_patch_accepted",
        "state_committed",
    ]);
    const patchEvent = sink.events[1]!;
    assert.deepEqual(patchEvent.payload.type, "memory_patch_accepted");
    if (patchEvent.payload.type === "memory_patch_accepted") {
        assert.deepEqual(patchEvent.payload.producers, ["model", "runtime_lifecycle"]);
    }
    assert.equal(initial.state.run.committedThroughSequence, undefined);
    assert.equal(initial.state.run.memoryRevision, undefined);
    assert.equal(result.goal.state.run.committedThroughSequence, 2);
    assert.deepEqual(result.goal.state.run.memoryRevision, {
        eventId: patchEvent.eventId,
        sequence: patchEvent.sequence,
    });
    assert.equal(store.saved[0]?.state.run.memoryRevision?.eventId, patchEvent.eventId);
    assert.equal(result.memoryPatchEvent?.eventId, patchEvent.eventId);
});

test("append failures stop before Snapshot and disabled Trajectory rejects accepted Patch", async () => {
    const store = new RecordingStore();
    const sink = new RecordingSink();
    sink.failType = "memory_patch_accepted";
    const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink: sink });

    await assert.rejects(
        committer.commit(goal(), {
            acceptedPatch: {
                producers: ["model"],
                operations: [findingOperation],
            },
        }),
        (error: unknown) => error instanceof TrajectoryAppendError,
    );
    assert.equal(store.saved.length, 0);

    const disabled = new TrajectoryCheckpointCommitter({ store: new RecordingStore() });
    await assert.rejects(
        disabled.commit(goal(), {
            acceptedPatch: { producers: ["model"], operations: [findingOperation] },
        }),
        TrajectoryAppendError,
    );
});

test("Snapshot failure leaves appended Patch as tail and does not update returned Memory revision", async () => {
    const store = new RecordingStore();
    store.fail = true;
    const sink = new RecordingSink();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink: sink });
    const initial = goal();

    await assert.rejects(
        committer.commit(initial, {
            acceptedPatch: { producers: ["model"], operations: [findingOperation] },
        }),
        /snapshot failed/,
    );
    assert.equal(sink.events.map((event) => event.eventType).includes("memory_patch_accepted"), true);
    assert.equal(initial.state.run.memoryRevision, undefined);
    assert.equal(store.saved.length, 0);
});

test("marker failure keeps Snapshot boundary and memory revision authoritative", async () => {
    const store = new RecordingStore();
    const sink = new RecordingSink();
    sink.failType = "state_committed";
    const committer = new TrajectoryCheckpointCommitter({ store, trajectorySink: sink });

    await assert.rejects(
        committer.commit(goal(), {
            acceptedPatch: { producers: ["model"], operations: [findingOperation] },
        }),
        (error: unknown) => error instanceof TrajectoryCommitMarkerError,
    );
    assert.equal(store.saved[0]?.state.run.committedThroughSequence, 1);
    assert.equal(store.saved[0]?.state.run.memoryRevision?.sequence, 1);
});
