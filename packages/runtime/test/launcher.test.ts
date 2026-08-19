import assert from "node:assert/strict";
import { test } from "node:test";

import { launch } from "../src/index";
import type {
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalCoordinator,
    GoalProgressResult,
    GoalStore,
    RunRef,
} from "../src/index";

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
            run: { id: "run-1", status: "created", stepCount: 0 },
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
    assert.deepEqual(store.savedGoals, []);
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
