import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionAbortedError } from "../../execution-control/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { StepExecutionInput, StepExecutor, AgentDecision } from "../src/index";
import {
    createGoal,
    DEFAULT_GOAL_MODEL_SELECTION,
    GoalCoordinator,
    InlineScheduler,
    RuntimeSubagentSpawner,
    Runner,
    SPAWN_SUBAGENT_TOOL_ID,

    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type AgentProfileRegistry,

    type SessionManagerDependencies,
} from "../src/index";
import { currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const profile: AgentProfile = {
    id: "subagent-integration-profile",
    name: "Subagent integration profile",
    description: "Profile used by subagent lifecycle tests",
    systemPrompt: "Complete the assigned task.",
    instructions: ["Execute the task autonomously."],
    toolIds: [SPAWN_SUBAGENT_TOOL_ID],
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

function createHarness(options: {
    readonly decide: (input: StepExecutionInput) => Promise<AgentDecision> | AgentDecision;
}) {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });
    const profiles: AgentProfileRegistry = {
        get(profileId) {
            return profileId === profile.id ? profile : undefined;
        },
    };
    let runNumber = 0;
    const runIdGenerator = () => `subagent-run-${++runNumber}`;
    const executionStream = new InMemoryExecutionStreamPublisher();
    const executor: StepExecutor = {
        async reviewCompletion() {
            return { kind: "accept" };
        },
        async decide(input) {
            return {
                kind: "decision",
                decision: await options.decide(input),
                modelContextFrame: {
                    stage: "decide",
                    epochNumber: input.goal.state.run.contextEpoch.number,
                    conversationPosition: input.goal.state.messages.length,
                    sections: [],
                },
            };
        },
        async think() {
            throw new Error("Unexpected Think call");
        },
    };
    const runner = new Runner({ store, trajectoryStore, executor, checkpointCommitter: committer, executionStream });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator,
        executionStream,
    });
    const dependencies: SessionManagerDependencies = {
        store,
        executionStream,
        committer,
        coordinator,
        profiles,
        runIdGenerator,
    };
    const parentGoal = createGoal({
        id: "subagent-parent-goal",
        intent: "Delegate an independent task",
        promptBundleVersion: 1,
        ...currentProtocols,
        profile,
        runId: "subagent-parent-run",
        modelSelection: {
            ...DEFAULT_GOAL_MODEL_SELECTION,
            provider: "test-provider",
            modelId: "test-model",
        },
    });
    const parentContext = {
        goalId: parentGoal.id,
        runId: parentGoal.state.run.id,
    };
    const spawner = new RuntimeSubagentSpawner(store, dependencies);

    return {
        store,
        parentContext,
        async initialize() {
            await store.save(parentGoal);
        },
        spawn(input: { readonly intent: string }, signal?: AbortSignal) {
            return spawner.spawn(input, parentContext, signal === undefined ? undefined : { signal });
        },
    };
}

function assertChildCannotSpawn(input: StepExecutionInput): void {
    assert.ok(!input.goal.definition.profile.toolIds.includes(SPAWN_SUBAGENT_TOOL_ID));
}

test("RuntimeSubagentSpawner creates a real child Session and returns its final answer", async () => {
    const harness = createHarness({
        decide(input) {
            assertChildCannotSpawn(input);
            return { kind: "complete", summary: "Child task completed", evidenceSequences: [] };
        },
    });
    await harness.initialize();

    const result = await harness.spawn({ intent: "Run the focused test suite" });

    assert.equal(result.status, "completed");
    assert.equal(result.answer, "Child task completed");
    const child = await harness.store.restore(result.childGoalId);
    assert.equal(child?.state.run.status, "completed");
    assert.ok(child !== undefined);
    assert.ok(!child.definition.profile.toolIds.includes(SPAWN_SUBAGENT_TOOL_ID));
});

test("RuntimeSubagentSpawner observes a real child Run failure", async () => {
    const harness = createHarness({
        decide(input) {
            assertChildCannotSpawn(input);
            return { kind: "fail", error: "Child task failed" };
        },
    });
    await harness.initialize();

    const result = await harness.spawn({ intent: "Run the failing task" });

    assert.equal(result.status, "failed");
    assert.match(result.reason ?? "", /failed/);
    assert.equal((await harness.store.restore(result.childGoalId))?.state.run.status, "failed");
});

test("RuntimeSubagentSpawner waits for child cancellation to reach persisted terminal state", async () => {
    const entered = deferred<void>();
    const harness = createHarness({
        decide(input) {
            assertChildCannotSpawn(input);
            entered.resolve();
            const signal = input.control?.signal;
            if (signal === undefined) throw new Error("Missing child execution signal");
            if (signal.aborted) throw new ExecutionAbortedError();
            return new Promise<AgentDecision>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new ExecutionAbortedError()), { once: true });
            });
        },
    });
    await harness.initialize();
    const parentCancellation = new AbortController();
    const spawnPromise = harness.spawn({ intent: "Wait until the parent cancels" }, parentCancellation.signal);
    await entered.promise;

    parentCancellation.abort("Parent Run cancelled");
    const result = await spawnPromise;

    assert.equal(result.status, "cancelled");
    assert.equal(result.reason, "Parent Run cancelled");
    assert.equal((await harness.store.restore(result.childGoalId))?.state.run.status, "cancelled");
});
