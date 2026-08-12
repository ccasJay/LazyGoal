import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryRunStore, launch } from "../src/index";
import type {
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    RunScheduler,
    RunState,
    RunStore,
} from "../src/index";

const goal: Goal = {
    id: "goal-1",
    objective: "启动一个可调度的 Run",
    completionCriteria: ["初始 Run 已保存并完成调度"],
};

function createProfile(): AgentProfile {
    return {
        id: "profile-1",
        systemPrompt: "You are a focused coding agent.",
        instructions: ["完成目标", "报告结果"],
        toolIds: ["read", "write"],
    };
}

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

class RecordingRunStore extends InMemoryRunStore {
    readonly savedRunIds: string[] = [];

    constructor(private readonly events: string[] = []) {
        super();
    }

    override async save(run: RunState): Promise<void> {
        await super.save(run);
        this.savedRunIds.push(run.id);
        this.events.push(`save:${run.id}`);
    }
}

class FakeScheduler implements RunScheduler {
    readonly scheduledRunIds: string[] = [];

    constructor(
        private readonly events: string[] = [],
        private readonly failure?: Error,
    ) {}

    async schedule(runId: string): Promise<void> {
        this.scheduledRunIds.push(runId);
        this.events.push(`schedule:${runId}`);

        if (this.failure !== undefined) {
            throw this.failure;
        }
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

test("launch saves a frozen created run before scheduling its generated ID", async () => {
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
    const profiles = new FakeProfileRegistry([profile]);
    const store = new RecordingRunStore(events);
    const scheduler = new FakeScheduler(events);
    let generatorCalls = 0;

    const result = await launch(
        { goal, profileId: profile.id },
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
        runId: "run-1",
        status: "created",
        profileId: "profile-1",
    });
    assert.equal(generatorCalls, 1);
    assert.deepEqual(profiles.requestedProfileIds, ["profile-1"]);
    assert.deepEqual(events, ["save:run-1", "schedule:run-1"]);
    assert.deepEqual(store.savedRunIds, ["run-1"]);
    assert.deepEqual(scheduler.scheduledRunIds, ["run-1"]);

    const savedRun = await store.load("run-1");
    assert.ok(savedRun);
    assert.deepEqual(savedRun, {
        id: "run-1",
        goal,
        profile: {
            id: "profile-1",
            systemPrompt: "You are a focused coding agent.",
            instructions: ["完成目标", "报告结果"],
            toolIds: ["read", "write"],
        },
        status: "created",
        stepCount: 0,
    });
    assert.notStrictEqual(savedRun.profile, profile);
    assert.notStrictEqual(savedRun.profile.instructions, instructions);
    assert.notStrictEqual(savedRun.profile.toolIds, toolIds);

    mutableProfile.systemPrompt = "Changed prompt";
    instructions[0] = "改变已有指令";
    toolIds.push("network");
    profiles.set({
        id: profile.id,
        systemPrompt: "Updated prompt",
        instructions: ["新指令"],
        toolIds: ["shell"],
    });

    assert.deepEqual((await store.load("run-1"))?.profile, {
        id: "profile-1",
        systemPrompt: "You are a focused coding agent.",
        instructions: ["完成目标", "报告结果"],
        toolIds: ["read", "write"],
    });
});

test("returns PROFILE_NOT_FOUND without generating, saving, or scheduling", async () => {
    const profiles = new FakeProfileRegistry();
    const store = new RecordingRunStore();
    const scheduler = new FakeScheduler();
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
    assert.match(result.error.message, /missing-profile/);
    assert.equal("runId" in result, false);
    assert.deepEqual(profiles.requestedProfileIds, ["missing-profile"]);
    assert.equal(generatorCalls, 0);
    assert.deepEqual(store.savedRunIds, []);
    assert.deepEqual(scheduler.scheduledRunIds, []);
});

test("propagates a RunIdGenerator error without saving or scheduling", async () => {
    const generatorError = new Error("ID generation failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new RecordingRunStore();
    const scheduler = new FakeScheduler();

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

    assert.deepEqual(store.savedRunIds, []);
    assert.deepEqual(scheduler.scheduledRunIds, []);
});

test("propagates a store error without scheduling", async () => {
    const storeError = new Error("save failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const scheduler = new FakeScheduler();
    let saveCalls = 0;
    const store: RunStore = {
        async save(): Promise<void> {
            saveCalls += 1;
            throw storeError;
        },
        async load(): Promise<RunState | undefined> {
            return undefined;
        },
    };

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
    assert.deepEqual(scheduler.scheduledRunIds, []);
});

test("propagates a scheduler error while keeping the saved run created", async () => {
    const schedulerError = new Error("schedule failed");
    const profiles = new FakeProfileRegistry([createProfile()]);
    const store = new InMemoryRunStore();
    const scheduler = new FakeScheduler([], schedulerError);

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

    assert.deepEqual(scheduler.scheduledRunIds, ["run-schedule-failure"]);
    const savedRun = await store.load("run-schedule-failure");
    assert.ok(savedRun);
    assert.equal(savedRun.status, "created");
    assert.equal(savedRun.id, "run-schedule-failure");
    assert.deepEqual(savedRun.profile, createProfile());
});
