import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    GoalSnapshotV9Schema,
    goalSnapshotCodec,
} from "../src/index";

const profile: AgentProfile = {
    id: "snapshot-v7-profile",
    systemPrompt: "You are a test agent.",
    instructions: [],
    toolIds: [],
};

function createGoalForProtocol(
    memoryProtocol: Goal["definition"]["memoryProtocol"],
): Goal {
    return createGoal({
        id: `goal-${memoryProtocol?.kind ?? "legacy"}`,
        intent: "验证 Snapshot v7",
        promptBundleVersion: memoryProtocol?.kind === "structured" ? 4 : 1,
        ...(memoryProtocol === undefined ? {} : { memoryProtocol }),
        profile,
        runId: `run-${memoryProtocol?.kind ?? "legacy"}`,
    });
}

function assertProtocolError(error: unknown): boolean {
    assert.ok(error instanceof GoalSnapshotProtocolError);
    assert.equal(error.code, "INVALID_GOAL_SNAPSHOT");
    return true;
}

test("Snapshot v10 round-trips structured protocol and Memory revision", () => {
    const goal = createGoalForProtocol({ kind: "structured", version: 1 });
    const withRevision: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence: 7,
                memoryRevision: {
                    eventId: "patch-7",
                    sequence: 7,
                },
            },
        },
    };

    const snapshot = goalSnapshotCodec.encode(withRevision);

    assert.equal(snapshot.metadata.schemaVersion, 10);
    assert.deepEqual(snapshot.definition.memoryProtocol, {
        kind: "structured",
        version: 1,
    });
    assert.deepEqual(snapshot.state.run.memoryRevision, {
        eventId: "patch-7",
        sequence: 7,
    });
    assert.deepEqual(goalSnapshotCodec.decode(snapshot), withRevision);
});

test("Snapshot v10 persists checkpoint protocol without a revision and preserves legacy access", () => {
    const goal = createGoalForProtocol({ kind: "checkpoint", version: 1 });
    const snapshot = goalSnapshotCodec.encode(goal);

    assert.equal(snapshot.metadata.schemaVersion, 10);
    assert.deepEqual(snapshot.definition.memoryProtocol, {
        kind: "checkpoint",
        version: 1,
    });
    assert.equal("memoryRevision" in snapshot.state.run, false);
    assert.deepEqual(goalSnapshotCodec.decode(snapshot).definition.memoryProtocol, {
        kind: "checkpoint",
        version: 1,
    });
});

test("v5 and v6 decode as read-only legacy and upgrade only on the next encode", () => {
    const encoded = goalSnapshotCodec.encode(createGoalForProtocol(undefined));
    const {
        memoryProtocol: _protocol,
        modelContextProtocol: _modelContext,
        contextRetrievalProtocol: _retrieval,
        ...legacyDefinition
    } = encoded.definition;
    const { committedThroughSequence: _boundary, ...v5Run } = encoded.state.run;
    const v6 = {
        ...encoded,
        metadata: { schemaVersion: 6 as const },
        definition: legacyDefinition,
    };
    const v5 = {
        ...v6,
        metadata: { schemaVersion: 5 as const },
        state: { ...encoded.state, run: v5Run },
    };

    for (const legacy of [v5, v6]) {
        const source = JSON.stringify(legacy);
        const restored = goalSnapshotCodec.decode(legacy);
        assert.deepEqual(restored.definition.memoryProtocol, {
            kind: "checkpoint",
            version: 1,
        });
        assert.equal(JSON.stringify(legacy), source);
        assert.equal(goalSnapshotCodec.encode(restored).metadata.schemaVersion, 10);
    }
});

test("Snapshot v9 rejects unknown protocols, corrupt revisions, and cross-protocol fields", () => {
    const structured = goalSnapshotCodec.encode(
        createGoalForProtocol({ kind: "structured", version: 1 }),
    );
    const checkpoint = goalSnapshotCodec.encode(
        createGoalForProtocol({ kind: "checkpoint", version: 1 }),
    );

    const invalidSnapshots: unknown[] = [
        {
            ...structured,
            definition: {
                ...structured.definition,
                memoryProtocol: { kind: "future", version: 1 },
            },
        },
        {
            ...structured,
            state: {
                ...structured.state,
                run: {
                    ...structured.state.run,
                    committedThroughSequence: 2,
                    memoryRevision: { eventId: "patch-3", sequence: 3 },
                },
            },
        },
        {
            ...structured,
            state: {
                ...structured.state,
                run: {
                    ...structured.state.run,
                    checkpoint: "legacy checkpoint",
                },
            },
        },
        {
            ...checkpoint,
            state: {
                ...checkpoint.state,
                run: {
                    ...checkpoint.state.run,
                    committedThroughSequence: 3,
                    memoryRevision: { eventId: "patch-3", sequence: 3 },
                },
            },
        },
        {
            ...structured,
            state: {
                ...structured.state,
                run: {
                    ...structured.state.run,
                    memoryRevision: { eventId: "patch-0", sequence: 0 },
                },
            },
        },
    ];

    for (const invalid of invalidSnapshots) {
        assert.equal(GoalSnapshotV9Schema.safeParse(invalid).success, false);
        assert.throws(() => goalSnapshotCodec.decode(invalid), assertProtocolError);
    }
});
