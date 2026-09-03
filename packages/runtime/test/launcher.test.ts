import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    computeContentHash,
    launch,
} from "../src/index";
import type {
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalCoordinator,
    GoalProgressResult,
    GoalStore,
    RunRef,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";
import { GoalProtocolError } from "../src/index";
import { currentProtocols } from "./current-fixtures";

function createProfile(): AgentProfile {
    return {
        id: "profile-1",
        systemPrompt: "You are a focused coding agent.",
        instructions: ["Prepare before execution."],
        toolIds: [],
    };
}

class FakeProfileRegistry implements AgentProfileRegistry {
    private readonly profiles = new Map<string, AgentProfile>();
    readonly requestedProfileIds: string[] = [];

    constructor(profiles: readonly AgentProfile[] = []) {
        for (const profile of profiles) {
            this.profiles.set(profile.id, profile);
        }
    }

    get(profileId: string): AgentProfile | undefined {
        this.requestedProfileIds.push(profileId);
        return this.profiles.get(profileId);
    }
}

class RecordingGoalStore implements GoalStore {
    readonly savedGoals: Goal[] = [];

    constructor(
        private readonly events: string[] = [],
        private readonly saveError?: Error,
    ) {}

    async save(goal: Goal): Promise<void> {
        this.events.push(`save:${goal.id}`);

        if (this.saveError !== undefined) {
            throw this.saveError;
        }

        this.savedGoals.push(structuredClone(goal));
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        const goal = this.savedGoals.find(({ id }) => id === goalId);
        return goal === undefined ? undefined : structuredClone(goal);
    }
}

class RecordingTrajectorySink implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];
    private sequence = 0;

    constructor(private readonly failureType?: TrajectoryEvent["eventType"]) {}

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        if (draft.eventType === this.failureType) {
            throw new Error(`failed to append ${draft.eventType}`);
        }

        this.sequence += 1;
        const event = allocateImmutableEvent(
            draft,
            this.sequence,
            `launcher-event-${this.sequence}`,
        );
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence),
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

class FakeCoordinator implements Pick<GoalCoordinator, "advance"> {
    readonly receivedRefs: RunRef[] = [];

    constructor(
        private readonly result: GoalProgressResult,
        private readonly events: string[] = [],
        private readonly failure?: Error,
    ) {}

    async advance(ref: RunRef): Promise<GoalProgressResult> {
        this.receivedRefs.push(ref);
        this.events.push(`advance:${ref.goalId}:${ref.runId}`);

        if (this.failure !== undefined) {
            throw this.failure;
        }

        return this.result;
    }
}

function waitingResult(goal: Goal): GoalProgressResult {
    return {
        ok: true,
        kind: "waiting",
        phase: "gathering_context",
        waitingFor: "question",
        goal,
    };
}

const unusedResult: GoalProgressResult = {
    ok: false,
    error: {
        code: "RUN_NOT_FOUND",
        message: "Coordinator should not be called",
    },
};

async function assertRejectsWithSameError(
    operation: () => Promise<unknown>,
    expectedError: Error,
): Promise<void> {
    await assert.rejects(operation, (actualError: unknown) => {
        assert.strictEqual(actualError, expectedError);
        return true;
    });
}

test("launch saves an initial gathering Goal before Coordinator.advance", async () => {
    const events: string[] = [];
    const instructions = ["Prepare before execution."];
    const mutableProfile = {
        ...createProfile(),
        instructions,
    };
    const profiles = new FakeProfileRegistry([mutableProfile]);
    const store = new RecordingGoalStore(events);
    let generatorCalls = 0;
    const expectedGoal: Goal = {
        id: "goal-1",
        definition: {
            intent: "  Build a resumable workflow  ",
            promptBundleVersion: 1,
            ...currentProtocols,
            profile: createProfile(),
            executionPolicy: { maxSteps: 7 },
        },
        state: {
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
            messages: [
                { role: "user", content: "  Build a resumable workflow  " },
            ],
            run: {
                id: "run-1",
                status: "created",
                stepCount: 0,
                committedThroughSequence: 0,
                contextEpoch: {
                    version: 1,
                    number: 0,
                    conversationStartIndex: 0,
                    openedAtSequence: 0,
                },
            },
        },
    };
    const coordinator = new FakeCoordinator(waitingResult(expectedGoal), events);

    const result = await launch(
        {
            goalId: "goal-1",
            intent: "  Build a resumable workflow  ",
            profileId: "profile-1",
            maxSteps: 7,
        },
        {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "run-1";
            },
            store,
            coordinator,
        },
    );

    assert.deepEqual(result, waitingResult(expectedGoal));
    assert.equal(generatorCalls, 1);
    assert.deepEqual(profiles.requestedProfileIds, ["profile-1"]);
    assert.deepEqual(events, ["save:goal-1", "advance:goal-1:run-1"]);
    assert.deepEqual(store.savedGoals, [expectedGoal]);
    assert.deepEqual(coordinator.receivedRefs, [
        { goalId: "goal-1", runId: "run-1" },
    ]);

    mutableProfile.systemPrompt = "Changed";
    instructions[0] = "Changed";
    assert.deepEqual(store.savedGoals[0]?.definition.profile, createProfile());
});

test("launch records the initial intent provenance before saving the Snapshot", async () => {
    const events: string[] = [];
    const sink = new RecordingTrajectorySink();
    const store = new RecordingGoalStore(events);
    const coordinator = new FakeCoordinator(unusedResult, events);

    await launch(
        {
            goalId: "goal-provenance",
            intent: "  Preserve the original intent  ",
            profileId: "profile-1",
        },
        {
            profiles: new FakeProfileRegistry([createProfile()]),
            runIdGenerator: () => "run-provenance",
            store,
            coordinator,
            trajectoryStore: sink,
        },
    );

    assert.deepEqual(sink.events.map((event) => event.eventType), [
        "goal_created",
        "preparation_input_recorded",
        "state_committed",
    ]);
    assert.deepEqual(sink.events[0]?.payload, {
        type: "goal_created",
        intent: "  Preserve the original intent  ",
    });
    assert.deepEqual(sink.events[1]?.payload, {
        type: "preparation_input_recorded",
        messageIndex: 0,
        contentHash: computeContentHash("  Preserve the original intent  "),
    });
    assert.deepEqual(sink.events[2]?.payload, {
        type: "state_committed",
        committedThroughSequence: 2,
    });
    assert.equal(store.savedGoals[0]?.state.run.committedThroughSequence, 2);
    assert.deepEqual(events, [
        "save:goal-provenance",
        "advance:goal-provenance:run-provenance",
    ]);
});

test("launch stops before saving or advancing when initial provenance append fails", async () => {
    const sink = new RecordingTrajectorySink("preparation_input_recorded");
    const store = new RecordingGoalStore();
    const coordinator = new FakeCoordinator(unusedResult);

    await assert.rejects(
        () => launch(
            {
                goalId: "goal-provenance-failure",
                intent: "Preserve provenance",
                profileId: "profile-1",
            },
            {
                profiles: new FakeProfileRegistry([createProfile()]),
                runIdGenerator: () => "run-provenance-failure",
                store,
                coordinator,
                trajectoryStore: sink,
            },
        ),
        (error: unknown) => error instanceof Error
            && error.message.includes("failed to append preparation_input_recorded"),
    );

    assert.deepEqual(sink.events.map((event) => event.eventType), ["goal_created"]);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(coordinator.receivedRefs, []);
});

test("launch validates intent and maxSteps before all dependencies", async () => {
    for (const request of [
        {
            goalId: "goal-empty",
            intent: "   ",
            profileId: "profile-1",
        },
        {
            goalId: "goal-negative",
            intent: "Valid",
            profileId: "profile-1",
            maxSteps: -1,
        },
        {
            goalId: "goal-fractional",
            intent: "Valid",
            profileId: "profile-1",
            maxSteps: 1.5,
        },
    ]) {
        const profiles = new FakeProfileRegistry([createProfile()]);
        const store = new RecordingGoalStore();
        const coordinator = new FakeCoordinator(unusedResult);
        let generatorCalls = 0;

        const result = await launch(request, {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "unexpected-run";
            },
            store,
            coordinator,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.error.code, "INVALID_GOAL_INPUT");
        }
        assert.deepEqual(profiles.requestedProfileIds, []);
        assert.equal(generatorCalls, 0);
        assert.deepEqual(store.savedGoals, []);
        assert.deepEqual(coordinator.receivedRefs, []);
    }
});

test("launch returns PROFILE_NOT_FOUND without generating, saving, or advancing", async () => {
    const profiles = new FakeProfileRegistry();
    const store = new RecordingGoalStore();
    const coordinator = new FakeCoordinator(unusedResult);
    let generatorCalls = 0;

    const result = await launch(
        { goalId: "goal-1", intent: "Valid", profileId: "missing" },
        {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "unexpected-run";
            },
            store,
            coordinator,
        },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, "PROFILE_NOT_FOUND");
    }
    assert.equal(generatorCalls, 0);
    assert.equal(store.savedGoals.length, 0);
    assert.deepEqual(coordinator.receivedRefs, []);
});

test("launch propagates ID generation and initial save failures without advancing", async () => {
    const generatorError = new Error("ID generation failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const generatorCoordinator = new FakeCoordinator(unusedResult);

    await assertRejectsWithSameError(
        () => launch(
            { goalId: "goal-1", intent: "Valid", profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => {
                    throw generatorError;
                },
                store: new RecordingGoalStore(),
                coordinator: generatorCoordinator,
            },
        ),
        generatorError,
    );
    assert.deepEqual(generatorCoordinator.receivedRefs, []);

    const saveError = new Error("Initial save failed");
    const saveCoordinator = new FakeCoordinator(unusedResult);
    await assertRejectsWithSameError(
        () => launch(
            { goalId: "goal-1", intent: "Valid", profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => "run-1",
                store: new RecordingGoalStore([], saveError),
                coordinator: saveCoordinator,
            },
        ),
        saveError,
    );
    assert.deepEqual(saveCoordinator.receivedRefs, []);
});

test("launch propagates Coordinator failures only after saving the initial Goal", async () => {
    const coordinatorError = new Error("Coordinator failed");
    const events: string[] = [];
    const store = new RecordingGoalStore(events);
    const coordinator = new FakeCoordinator(unusedResult, events, coordinatorError);

    await assertRejectsWithSameError(
        () => launch(
            { goalId: "goal-1", intent: "Valid", profileId: "profile-1" },
            {
                profiles: new FakeProfileRegistry([createProfile()]),
                runIdGenerator: () => "run-1",
                store,
                coordinator,
            },
        ),
        coordinatorError,
    );

    assert.equal(store.savedGoals.length, 1);
    assert.deepEqual(events, ["save:goal-1", "advance:goal-1:run-1"]);
});

test("launch returns Coordinator business failures unchanged", async () => {
    const coordinatorResult: GoalProgressResult = {
        ok: false,
        error: {
            code: "INVALID_PHASE_RESULT",
            message: "Invalid preparation result",
        },
    };
    const coordinator = new FakeCoordinator(coordinatorResult);

    const result = await launch(
        { goalId: "goal-1", intent: "Valid", profileId: "profile-1" },
        {
            profiles: new FakeProfileRegistry([createProfile()]),
            runIdGenerator: () => "run-1",
            store: new RecordingGoalStore(),
            coordinator,
        },
    );

    assert.strictEqual(result, coordinatorResult);
});

test("launch validates the fixed current protocol before external side effects", async () => {
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingGoalStore();
    const coordinator = new FakeCoordinator(unusedResult);
    let generatorCalls = 0;
    const seen: unknown[] = [];

    const result = await launch(
        { goalId: "goal-structured", intent: "Use structured memory", profileId: "profile-1" },
        {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "run-structured";
            },
            store,
            coordinator,
            protocolValidator: { validate: (input) => seen.push(input) },
        },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(seen, [{
        promptBundleVersion: 1,
        ...currentProtocols,
    }]);
    assert.deepEqual(profiles.requestedProfileIds, ["profile-1"]);
    assert.equal(generatorCalls, 1);
    assert.equal(store.savedGoals.length, 1);
    assert.equal(store.savedGoals[0]?.definition.promptBundleVersion, 1);
    assert.deepEqual(store.savedGoals[0]?.definition.memoryProtocol, currentProtocols.memoryProtocol);
    assert.deepEqual(store.savedGoals[0]?.definition.modelContextProtocol, currentProtocols.modelContextProtocol);
    assert.deepEqual(store.savedGoals[0]?.definition.contextRetrievalProtocol, currentProtocols.contextRetrievalProtocol);
    assert.deepEqual(coordinator.receivedRefs, [
        { goalId: "goal-structured", runId: "run-structured" },
    ]);
});

test("launch propagates protocol validator failures before Profile lookup", async () => {
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingGoalStore();
    const coordinator = new FakeCoordinator(unusedResult);
    let generatorCalls = 0;
    const error = new GoalProtocolError("当前协议不受支持");

    await assertRejectsWithSameError(
        () => launch(
            { goalId: "goal-mismatch", intent: "Reject mismatch", profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => {
                    generatorCalls += 1;
                    return "run-mismatch";
                },
                store,
                coordinator,
                protocolValidator: {
                    validate: () => {
                        throw error;
                    },
                },
            },
        ),
        error,
    );

    assert.deepEqual(profiles.requestedProfileIds, []);
    assert.equal(generatorCalls, 0);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(coordinator.receivedRefs, []);
});
