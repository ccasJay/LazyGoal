import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import {
    createModelContextBudgetPolicy,
    CharacterModelInputEstimator,
} from "../../context-budget/src/index";
import {
    ModelInferenceProjector,
    TrajectoryModelContextAssembler,
} from "../../model-context/src/index";
import {
    allocateImmutableEvent,
    createGoal,
    type Goal,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
} from "../src/index";
import {
    TrajectoryCheckpointCommitter,
} from "../src/trajectory-checkpoint-committer";
import { goalSnapshotCodec, InMemoryGoalStore } from "../../storage/src/index";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import {
    InMemoryTrajectoryStore,
    testUserMessage,
} from "./current-fixtures";

const SCALES = [100, 1_000, 5_000] as const;

const benchmarkProfile = {
    id: "benchmark-profile",
    systemPrompt: "Benchmark.",
    instructions: [],
    toolIds: [],
};

function benchmarkGoal(scale: number, boundary: number): Goal {
    const goal = createGoal({
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        id: `goal-long-session-${scale}`,
        runId: `run-long-session-${scale}`,
        intent: `long session benchmark ${scale}`,
        promptBundleVersion: 1,
        profile: benchmarkProfile,
    });
    const messages = Array.from({ length: scale }, (_, index) => testUserMessage(
        `message-${index} ${"x".repeat(128)}`,
        {
            runId: goal.state.run.id,
            position: { afterSequence: 0, order: index },
        },
    ));
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: { phase: "executing" },
            messages,
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: boundary,
            },
        },
    };
}

function completeUnitEvents(goal: Goal, unitCount: number): readonly TrajectoryEvent[] {
    const events: TrajectoryEvent[] = [];
    let sequence = 0;
    for (let unit = 0; unit < unitCount; unit += 1) {
        const executionUnitId = `unit-${unit}`;
        const summary = `unit-${unit}-summary`;
        events.push(allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "complete",
                    summary,
                    completionEvidence: [],
                },
            },
        }, ++sequence));
        events.push(allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            eventType: "run_completed",
            payload: { type: "run_completed", summary },
        }, ++sequence));
    }
    return events;
}

function createTrajectory(events: readonly TrajectoryEvent[]): InMemoryTrajectoryStore {
    const store = new InMemoryTrajectoryStore();
    for (const event of events) {
        store.events.push(event);
    }
    return store;
}

function fixedInputPolicy(goal: Goal): ReturnType<typeof createModelContextBudgetPolicy> {
    const view = new ModelInferenceProjector().project(
        goal,
        [],
        createEmptyWorkingMemory(),
    );
    const fixedInputCount = new CharacterModelInputEstimator().estimate({
        prompt: view.prompt,
        conversation: view.conversation,
        workingContext: view.workingContext,
        workingMemory: view.workingMemory,
    });
    return createModelContextBudgetPolicy({
        modelInputBudget: fixedInputCount + Math.max(1_000, Math.floor(fixedInputCount * 0.1)),
        responseReserve: 1,
        warmShare: 0.5,
    });
}

test("long-session benchmark: commit, assembly and snapshot codec across three scales", async () => {
    const results: Array<{
        readonly scale: number;
        readonly encodeMs: number;
        readonly decodeMs: number;
        readonly commitMs: number;
        readonly coldAssemblyMs: number;
        readonly warmAssemblyMs: number;
    }> = [];

    for (const scale of SCALES) {
        const snapshotGoal = benchmarkGoal(scale, 0);

        const encodeStartedAt = performance.now();
        const snapshot = goalSnapshotCodec.encode(snapshotGoal);
        const encodeMs = performance.now() - encodeStartedAt;

        const decodeStartedAt = performance.now();
        const decoded = goalSnapshotCodec.decode(snapshot);
        const decodeMs = performance.now() - decodeStartedAt;
        assert.equal(decoded.id, snapshotGoal.id);
        assert.equal(decoded.state.messages.length, scale);

        const commitStore = new InMemoryGoalStore();
        await commitStore.save(snapshotGoal);
        const committer = new TrajectoryCheckpointCommitter({
            store: commitStore,
            trajectoryStore: new InMemoryTrajectoryStore(),
        });
        const fact: TrajectoryEventDraft = {
            goalId: snapshotGoal.id,
            runId: snapshotGoal.state.run.id,
            phase: "executing",
            eventType: "run_started",
            payload: { type: "run_started" },
        };
        const commitStartedAt = performance.now();
        const committed = await committer.commit(snapshotGoal, { facts: [fact] });
        const commitMs = performance.now() - commitStartedAt;
        assert.equal(committed.goal.id, snapshotGoal.id);
        assert.ok(committed.goal.state.run.committedThroughSequence >= 1);

        const assemblyGoal = benchmarkGoal(scale, scale * 2);
        const trajectoryStore = createTrajectory(completeUnitEvents(assemblyGoal, scale));
        const assembler = new TrajectoryModelContextAssembler({
            trajectoryStore,
            policy: fixedInputPolicy(assemblyGoal),
        });
        const view = new ModelInferenceProjector().project(
            assemblyGoal,
            [],
            createEmptyWorkingMemory(),
        );

        const coldStartedAt = performance.now();
        const cold = await assembler.assemble({ goal: assemblyGoal, view });
        const coldAssemblyMs = performance.now() - coldStartedAt;
        assert.ok(cold.trajectoryContext?.hot.length !== undefined);

        const warmStartedAt = performance.now();
        const warm = await assembler.assemble({ goal: assemblyGoal, view });
        const warmAssemblyMs = performance.now() - warmStartedAt;
        assert.deepEqual(
            warm.trajectoryContext?.hot.map(unit => unit.executionUnitId),
            cold.trajectoryContext?.hot.map(unit => unit.executionUnitId),
        );

        results.push({
            scale,
            encodeMs,
            decodeMs,
            commitMs,
            coldAssemblyMs,
            warmAssemblyMs,
        });
    }

    for (const result of results) {
        console.log(
            `[long-session-benchmark] scale=${result.scale}`
            + ` encode=${result.encodeMs.toFixed(1)}ms`
            + ` decode=${result.decodeMs.toFixed(1)}ms`
            + ` commit=${result.commitMs.toFixed(1)}ms`
            + ` cold-assembly=${result.coldAssemblyMs.toFixed(1)}ms`
            + ` warm-assembly=${result.warmAssemblyMs.toFixed(1)}ms`,
        );
    }
});
