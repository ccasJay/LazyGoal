import assert from "node:assert/strict";
import { test } from "node:test";

import { launch } from "../src/index";
import type {
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalMessage,
    GoalStore,
    RunnerResult,
    RunRef,
    RunScheduler,
    RunState,
    StepResult,
} from "../src/index";

const goal = {
    id: "goal-1",
    objective: "启动一个可调度的 Run",
    completionCriteria: ["初始 Goal 已保存并完成调度"],
} as const;

function createProfile(): AgentProfile {
    return {
        id: "profile-1",
        systemPrompt: "You are a focused coding agent.",
        instructions: ["完成目标", "报告结果"],
        toolIds: ["read", "write"],
    };
}

function createScheduledState(
    runId: string,
    status: "waiting" | "completed" | "failed",
): RunState {
    let lastResult: StepResult;

    switch (status) {
        case "waiting":
            lastResult = { kind: "wait", reason: "等待调用方输入" };
            break;
        case "completed":
            lastResult = { kind: "complete", summary: "目标已完成" };
            break;
        case "failed":
            lastResult = { kind: "fail", error: "执行失败" };
            break;
    }

    return {
        id: runId,
        status,
        stepCount: 1,
        lastResult,
    };
}

const unusedSchedulerResult: RunnerResult = {
    ok: false,
    error: {
        code: "RUN_NOT_FOUND",
        message: "Scheduler should not be called",
    },
};

class FakeProfileRegistry implements AgentProfileRegistry {
    private readonly profiles = new Map<string, AgentProfile>();
    readonly requestedProfileIds: string[] = [];

    constructor(profiles: readonly AgentProfile[] = []) {
        for (const profile of profiles) {
            this.set(profile);
        }
    }

    get(profileId: string): AgentProfile | undefined {
        this.requestedProfileIds.push(profileId);
        return this.profiles.get(profileId);
    }

    set(profile: AgentProfile): void {
        this.profiles.set(profile.id, profile);
    }
}

class RecordingGoalStore implements GoalStore {
    readonly savedGoals: Goal[] = [];

    constructor(private readonly events: string[] = []) {}

    async save(goalSnapshot: Goal): Promise<void> {
        this.savedGoals.push(goalSnapshot);
        this.events.push(`save:${goalSnapshot.id}`);
    }

    async restore(): Promise<Goal | undefined> {
        return this.savedGoals.at(-1);
    }
}

class FakeScheduler implements RunScheduler {
    readonly scheduledRefs: RunRef[] = [];

    constructor(
        private readonly result: RunnerResult,
        private readonly events: string[] = [],
        private readonly failure?: Error,
    ) {}

    async schedule(ref: RunRef): Promise<RunnerResult> {
        this.scheduledRefs.push(ref);
        this.events.push(`schedule:${ref.goalId}:${ref.runId}`);

        if (this.failure !== undefined) {
            throw this.failure;
        }

        return this.result;
    }
}

async function assertRejectsWithSameError(
    operation: () => Promise<unknown>,
    expectedError: Error,
): Promise<void> {
    await assert.rejects(operation, (actualError: unknown) => {
        assert.strictEqual(actualError, expectedError);
        return true;
    });
}

test("launch saves a complete frozen Goal before scheduling", async () => {
    const events: string[] = [];
    const instructions = ["完成目标", "报告结果"];
    const toolIds = ["read", "write"];
    const mutableProfile = {
        id: "profile-1",
        systemPrompt: "You are a focused coding agent.",
        instructions,
        toolIds,
    };
    const profile: AgentProfile = mutableProfile;
    const messages: GoalMessage[] = [
        { role: "user", content: "请开始" },
    ];
    const profiles = new FakeProfileRegistry([profile]);
    const store = new RecordingGoalStore(events);
    const finalState = createScheduledState("run-1", "waiting");
    const scheduler = new FakeScheduler({ ok: true, state: finalState }, events);
    let generatorCalls = 0;

    const result = await launch(
        { goal, profileId: profile.id, messages },
        {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "run-1";
            },
            store,
            scheduler,
        },
    );

    assert.deepEqual(result, {
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        profileId: "profile-1",
        state: finalState,
    });
    assert.equal(generatorCalls, 1);
    assert.deepEqual(profiles.requestedProfileIds, ["profile-1"]);
    assert.deepEqual(events, ["save:goal-1", "schedule:goal-1:run-1"]);
    assert.deepEqual(scheduler.scheduledRefs, [
        { goalId: "goal-1", runId: "run-1" },
    ]);

    const savedGoal = store.savedGoals[0];
    assert.ok(savedGoal);
    assert.deepEqual(savedGoal, {
        id: "goal-1",
        metadata: { schemaVersion: 1 },
        task: {
            objective: "启动一个可调度的 Run",
            completionCriteria: ["初始 Goal 已保存并完成调度"],
        },
        profile: {
            id: "profile-1",
            systemPrompt: "You are a focused coding agent.",
            instructions: ["完成目标", "报告结果"],
            toolIds: ["read", "write"],
        },
        messages,
        run: {
            id: "run-1",
            status: "created",
            stepCount: 0,
        },
    });
    assert.notStrictEqual(savedGoal.profile, profile);
    assert.notStrictEqual(savedGoal.profile.instructions, instructions);
    assert.notStrictEqual(savedGoal.profile.toolIds, toolIds);
    assert.notStrictEqual(savedGoal.messages, messages);

    mutableProfile.systemPrompt = "Changed prompt";
    instructions[0] = "改变已有指令";
    toolIds.push("network");
    messages[0] = { role: "assistant", content: "已改变" };
    assert.deepEqual(savedGoal.profile, createProfile());
    assert.deepEqual(savedGoal.messages, [
        { role: "user", content: "请开始" },
    ]);
});

for (const status of ["completed", "failed"] as const) {
    test(`launch returns the Scheduler's final ${status} RunState`, async () => {
        const runId = `run-${status}`;
        const finalState = createScheduledState(runId, status);
        const profiles = new FakeProfileRegistry([createProfile()]);
        const store = new RecordingGoalStore();
        const scheduler = new FakeScheduler({ ok: true, state: finalState });

        const result = await launch(
            { goal, profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => runId,
                store,
                scheduler,
            },
        );

        assert.deepEqual(result, {
            ok: true,
            goalId: "goal-1",
            runId,
            profileId: "profile-1",
            state: finalState,
        });
    });
}

test("returns PROFILE_NOT_FOUND without generating, saving, or scheduling", async () => {
    const profiles = new FakeProfileRegistry();
    const store = new RecordingGoalStore();
    const scheduler = new FakeScheduler(unusedSchedulerResult);
    let generatorCalls = 0;

    const result = await launch(
        { goal, profileId: "missing-profile" },
        {
            profiles,
            runIdGenerator: () => {
                generatorCalls += 1;
                return "unexpected-run";
            },
            store,
            scheduler,
        },
    );

    if (result.ok) {
        assert.fail("expected PROFILE_NOT_FOUND");
    }

    assert.equal(result.error.code, "PROFILE_NOT_FOUND");
    assert.equal(generatorCalls, 0);
    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(scheduler.scheduledRefs, []);
});

test("propagates a RunIdGenerator error without saving or scheduling", async () => {
    const generatorError = new Error("ID generation failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingGoalStore();
    const scheduler = new FakeScheduler(unusedSchedulerResult);

    await assertRejectsWithSameError(
        () => launch(
            { goal, profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => {
                    throw generatorError;
                },
                store,
                scheduler,
            },
        ),
        generatorError,
    );

    assert.deepEqual(store.savedGoals, []);
    assert.deepEqual(scheduler.scheduledRefs, []);
});

test("propagates a GoalStore error without scheduling", async () => {
    const storeError = new Error("save failed");
    let saveCalls = 0;
    const store: Pick<GoalStore, "save"> = {
        async save(): Promise<void> {
            saveCalls += 1;
            throw storeError;
        },
    };
    const profiles = new FakeProfileRegistry([createProfile()]);
    const scheduler = new FakeScheduler(unusedSchedulerResult);

    await assertRejectsWithSameError(
        () => launch(
            { goal, profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => "run-save-failure",
                store,
                scheduler,
            },
        ),
        storeError,
    );

    assert.equal(saveCalls, 1);
    assert.deepEqual(scheduler.scheduledRefs, []);
});

test("propagates a Scheduler error after the initial Goal is saved", async () => {
    const schedulerError = new Error("schedule failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingGoalStore();
    const scheduler = new FakeScheduler(
        unusedSchedulerResult,
        [],
        schedulerError,
    );

    await assertRejectsWithSameError(
        () => launch(
            { goal, profileId: "profile-1" },
            {
                profiles,
                runIdGenerator: () => "run-schedule-failure",
                store,
                scheduler,
            },
        ),
        schedulerError,
    );

    assert.equal(store.savedGoals.length, 1);
    assert.equal(store.savedGoals[0]?.id, "goal-1");
    assert.deepEqual(scheduler.scheduledRefs, [
        { goalId: "goal-1", runId: "run-schedule-failure" },
    ]);
});

test("returns a Scheduler business failure without fabricating launch success", async () => {
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingGoalStore();
    const scheduler = new FakeScheduler(unusedSchedulerResult);

    const result = await launch(
        { goal, profileId: "profile-1" },
        {
            profiles,
            runIdGenerator: () => "run-business-failure",
            store,
            scheduler,
        },
    );

    assert.deepEqual(result, unusedSchedulerResult);
    assert.equal(store.savedGoals.length, 1);
});
