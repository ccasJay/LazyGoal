import assert from "node:assert/strict";
import { test } from "node:test";

import {
    TrajectoryCheckpointCommitter,
    allocateImmutableEvent,
    createGoal,
    selectCommittedModelContextFrames,
} from "../src/index";
import type {
    Goal,
    GoalStore,
    ModelContextFramePayload,
    ModelContextSectionIdentity,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile = {
    id: "frame-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

function createTestGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "frame-goal",
        intent: "保存模型可见 Section frame",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        profile,
        runId: "frame-run",
    });
}

const identity: ModelContextSectionIdentity = {
    sectionId: "run_mode",
    order: 10,
    source: "Goal.intent + RunState.mode",
    role: "user",
    templateId: "run-mode@1",
};

function sectionUpdate(
    sectionIdentity: ModelContextSectionIdentity = identity,
): ModelContextFramePayload["sections"][number] {
    return {
        ...sectionIdentity,
        status: "active",
        projection: { mode: "normal" },
        content: "[Dynamic section: run_mode]\nNormal Run",
    };
}

function frameDraft(
    payload: ModelContextFramePayload,
    goalId = "frame-goal",
    runId = "frame-run",
): TrajectoryEventDraft {
    return {
        goalId,
        runId,
        phase: "executing",
        eventType: "model_context_frame",
        payload,
    };
}

class MemoryGoalStore implements GoalStore {
    saved?: Goal;
    fail = false;

    async save(goal: Goal): Promise<void> {
        if (this.fail) throw new Error("snapshot failed");
        this.saved = structuredClone(goal);
    }

    async restore(): Promise<Goal | undefined> {
        return this.saved === undefined ? undefined : structuredClone(this.saved);
    }
}

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(draft, this.events.length + 1);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId && event.runId === query.runId,
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

test("committer saves a model context frame within the Snapshot boundary", async () => {
    const goal = createTestGoal();
    const snapshotStore = new MemoryGoalStore();
    const trajectoryStore = new MemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store: snapshotStore, trajectoryStore });

    const result = await committer.commit(goal, {
        modelContextFrame: {
            stage: "decide",
            epochNumber: goal.state.run.contextEpoch.number,
            conversationPosition: goal.state.messages.length,
            sections: [sectionUpdate()],
        },
    });

    assert.equal(result.modelContextFrameEvent?.eventType, "model_context_frame");
    assert.equal(result.goal.state.run.committedThroughSequence, 1);
    assert.equal(snapshotStore.saved?.state.run.committedThroughSequence, 1);
    assert.equal(trajectoryStore.events[0]?.eventType, "model_context_frame");
    assert.equal(trajectoryStore.events[1]?.eventType, "state_committed");
});

test("frame updates beyond the Snapshot boundary and from another Goal or Run are excluded", () => {
    const payload: ModelContextFramePayload = {
        type: "model_context_frame",
        stage: "decide",
        epochNumber: 2,
        conversationPosition: 5,
        sections: [
            sectionUpdate(),
            sectionUpdate({ ...identity, sectionId: "unregistered_section", order: 20 }),
        ],
    };
    const valid = allocateImmutableEvent(frameDraft(payload), 4, "valid-frame");
    const uncommitted = allocateImmutableEvent(frameDraft(payload), 8, "tail-frame");
    const otherGoal = allocateImmutableEvent(frameDraft(payload, "other-goal"), 3, "other-goal-frame");
    const otherRun = allocateImmutableEvent(frameDraft(payload, "frame-goal", "other-run"), 2, "other-run-frame");
    const staleIdentity = allocateImmutableEvent(frameDraft({
        ...payload,
        sections: [sectionUpdate({ ...identity, source: "stale source" })],
    }), 5, "stale-identity-frame");

    const frames = selectCommittedModelContextFrames(
        [otherRun, otherGoal, valid, staleIdentity, uncommitted],
        {
            goalId: "frame-goal",
            runId: "frame-run",
            committedThroughSequence: 4,
            stage: "decide",
            epochNumber: 2,
            conversationStartPosition: 4,
            sectionIdentities: [identity],
        },
    );

    assert.deepEqual(frames.map((frame) => frame.eventId), ["valid-frame"]);
    assert.deepEqual(frames[0]?.payload.sections.map((section) => section.sectionId), ["run_mode"]);
});

test("frame selector separates stage and Epoch and ignores stale conversation positions", () => {
    const make = (
        sequence: number,
        stage: "decide" | "think",
        epochNumber: number,
        conversationPosition: number,
    ) => allocateImmutableEvent(frameDraft({
        type: "model_context_frame",
        stage,
        epochNumber,
        conversationPosition,
        sections: [sectionUpdate()],
    }), sequence, `frame-${sequence}`);

    const selected = selectCommittedModelContextFrames([
        make(1, "decide", 2, 5),
        make(2, "think", 2, 5),
        make(3, "decide", 1, 5),
        make(4, "decide", 2, 4),
    ], {
        goalId: "frame-goal",
        runId: "frame-run",
        committedThroughSequence: 4,
        stage: "decide",
        epochNumber: 2,
        conversationStartPosition: 5,
        sectionIdentities: [identity],
    });

    assert.deepEqual(selected.map((frame) => frame.eventId), ["frame-1"]);
});

test("uncommitted frame left by failed Snapshot save cannot be restored as a baseline", async () => {
    const goal = createTestGoal();
    const snapshotStore = new MemoryGoalStore();
    snapshotStore.fail = true;
    const trajectoryStore = new MemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store: snapshotStore, trajectoryStore });

    await assert.rejects(committer.commit(goal, {
        modelContextFrame: {
            stage: "decide",
            epochNumber: goal.state.run.contextEpoch.number,
            conversationPosition: goal.state.messages.length,
            sections: [sectionUpdate()],
        },
    }), /snapshot failed/);

    const frame = trajectoryStore.events[0];
    assert.equal(frame?.eventType, "model_context_frame");
    if (frame?.eventType !== "model_context_frame") return;
    assert.deepEqual(selectCommittedModelContextFrames([frame], {
        goalId: goal.id,
        runId: goal.state.run.id,
        committedThroughSequence: 0,
        stage: "decide",
        epochNumber: goal.state.run.contextEpoch.number,
        conversationStartPosition: 0,
        sectionIdentities: [identity],
    }), []);
});
