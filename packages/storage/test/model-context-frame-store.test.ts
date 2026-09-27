import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { TrajectoryEventDraft } from "../../runtime/src/index";
import { TrajectoryProtocolError } from "../../runtime/src/index";
import { JsonFileTrajectoryStore } from "../src/index";

const frameDraft: TrajectoryEventDraft = {
    goalId: "frame-store-goal",
    runId: "frame-store-run",
    phase: "executing",
    eventType: "model_context_frame",
    payload: {
        type: "model_context_frame",
        stage: "think",
        epochNumber: 3,
        conversationPosition: 7,
        sections: [
            {
                sectionId: "working_memory",
                order: 50,
                source: "RunState.workingMemory",
                role: "user",
                templateId: "working-memory@1",
                status: "active",
                projection: { revision: 4, facts: ["theory"] },
                content: "[Dynamic section: working_memory]\nTheory",
            },
        ],
    },
};

test("Trajectory Store persists structured model frames and classifies Snapshot tail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-model-context-frame-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        const first = await store.append(frameDraft);
        await store.append({
            ...frameDraft,
            payload: {
                ...frameDraft.payload,
                stage: "decide",
                sections: [],
            },
        });

        const restored = new JsonFileTrajectoryStore(directory);
        const result = await restored.readWithBoundary(
            { goalId: "frame-store-goal", runId: "frame-store-run" },
            first.sequence,
        );

        assert.equal(result.committed.length, 1);
        assert.equal(result.uncommittedTail.length, 1);
        const persisted = result.committed[0];
        assert.equal(persisted?.eventType, "model_context_frame");
        if (persisted?.eventType === "model_context_frame") {
            assert.equal(persisted.payload.stage, "think");
            assert.deepEqual(persisted.payload.sections[0]?.projection, {
                revision: 4,
                facts: ["theory"],
            });
            assert.equal(persisted.payload.sections[0]?.content, frameDraft.payload.sections[0]?.content);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("Trajectory Store rejects malformed model frame protocol data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-model-context-frame-invalid-"));
    try {
        const store = new JsonFileTrajectoryStore(directory);
        const malformed = {
            ...frameDraft,
            payload: {
                ...frameDraft.payload,
                sections: [{
                    ...frameDraft.payload.sections[0],
                    status: "invalidated",
                }],
            },
        } as unknown as TrajectoryEventDraft;

        assert.throws(() => store.append(malformed), TrajectoryProtocolError);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
