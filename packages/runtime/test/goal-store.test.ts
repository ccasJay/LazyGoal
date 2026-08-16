import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createGoal,
    GoalSnapshotSchema,
    GoalSnapshotProtocolError,
    InMemoryGoalStore,
    INVALID_GOAL_SNAPSHOT_CODE,
    JsonFileGoalStore,
    Runner,
} from "../src/index";
import type { AgentProfile, Goal, GoalMessage } from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["先检查输入", "再执行任务"],
    toolIds: ["read"],
};

const messages: GoalMessage[] = [
    { role: "user", content: "请开始执行" },
    { role: "assistant", assistant: { profileId: "profile-1" }, content: "我会先检查输入" },
];

function createSnapshot(runId = "run-1"): Goal {
    return createGoal({
        id: "goal-1",
        task: {
            objective: "完成快照存储",
            completionCriteria: ["可以恢复最新 Goal"],
        },
        profile,
        messages,
        runId,
    });
}

function createV1Snapshot() {
    return {
        id: "goal-v1",
        metadata: { schemaVersion: 1 },
        task: {
            objective: "恢复旧版任务",
            completionCriteria: ["消息与 Run 进度保持一致"],
        },
        profile: {
            ...profile,
            instructions: [...profile.instructions],
            toolIds: [...profile.toolIds],
        },
        messages: [
            { role: "user", content: "旧版真实输入" },
            { role: "assistant", content: "旧版真实响应" },
            { role: "user", content: "可能是历史 Working Context" },
        ],
        run: {
            id: "run-v1",
            status: "waiting",
            stepCount: 1,
            lastResult: { kind: "wait", reason: "等待旧版输入" },
        },
    } as const;
}

function snapshotPath(directory: string, goalId: string): string {
    const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
    return join(directory, `${encodedGoalId}.json`);
}

const tsxCliPath = fileURLToPath(
    new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const processFixturePath = fileURLToPath(
    new URL("./fixtures/goal-store-process.ts", import.meta.url),
);

function runGoalStoreProcess(args: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [tsxCliPath, processFixturePath, ...args],
            {
                cwd: process.cwd(),
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(
                `Goal store child exited with ${code}: ${stderr}`,
            ));
        });
    });
}

function createWaitingSnapshot(runId = "run-1"): Goal {
    const goal = createSnapshot(runId);

    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    result: {
                        kind: "wait",
                        reason: "等待外部输入",
                    },
                },
            },
        },
    };
}

test("GoalSnapshotSchema validates a complete Goal and rejects extra fields", () => {
    const goal = createSnapshot();
    const restored = GoalSnapshotSchema.parse(JSON.parse(JSON.stringify(goal)));

    assert.deepEqual(restored, goal);
    assert.throws(() => GoalSnapshotSchema.parse({
        ...goal,
        extra: true,
    }));
    assert.throws(() => GoalSnapshotSchema.parse({
        ...goal,
        definition: {
            ...goal.definition,
            profile: {
                ...goal.definition.profile,
                extra: true,
            },
        },
    }));
});

test("GoalSnapshotSchema enforces v2 workflow and Run cross-field invariants", () => {
    const snapshot = createSnapshot();
    const continueStep = {
        lastStep: {
            result: { kind: "continue", summary: "继续" },
        },
    } as const;
    const invalidSnapshots: unknown[] = [
        {
            ...createGoal({
                id: "goal-preparation",
                intent: "先准备",
                profile,
                runId: "run-preparation",
            }),
            state: {
                ...createGoal({
                    id: "goal-preparation",
                    intent: "先准备",
                    profile,
                    runId: "run-preparation",
                }).state,
                run: { id: "run-preparation", status: "running", stepCount: 0 },
            },
        },
        {
            ...snapshot,
            state: {
                ...snapshot.state,
                run: { id: "run-1", status: "running", stepCount: 1 },
            },
        },
        {
            ...snapshot,
            state: {
                ...snapshot.state,
                run: {
                    id: "run-1",
                    status: "waiting",
                    stepCount: 1,
                    ...continueStep,
                },
            },
        },
        {
            ...snapshot,
            state: {
                ...snapshot.state,
                run: {
                    id: "run-1",
                    status: "failed",
                    stepCount: 1,
                    ...continueStep,
                },
            },
        },
        {
            ...snapshot,
            state: {
                ...snapshot.state,
                run: {
                    id: "run-1",
                    status: "failed",
                    stepCount: 1,
                    ...continueStep,
                    stopReason: { kind: "max_steps_exceeded" },
                },
            },
        },
    ];

    for (const invalidSnapshot of invalidSnapshots) {
        assert.equal(GoalSnapshotSchema.safeParse(invalidSnapshot).success, false);
    }
});

test("schemaVersion 1 snapshot migrates deterministically without changing source", () => {
    const v1 = createV1Snapshot();
    const sourceBefore = JSON.stringify(v1);
    const migrated = GoalSnapshotSchema.parse(v1);

    assert.equal(JSON.stringify(v1), sourceBefore);
    assert.deepEqual(migrated, {
        id: "goal-v1",
        metadata: { schemaVersion: 2 },
        definition: {
            intent: "恢复旧版任务",
            profile: v1.profile,
            executionPolicy: { maxSteps: 0 },
        },
        state: {
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: v1.task,
            },
            messages: [
                { role: "user", content: "旧版真实输入" },
                {
                    role: "assistant",
                    assistant: { profileId: "profile-1" },
                    content: "旧版真实响应",
                },
                { role: "user", content: "可能是历史 Working Context" },
            ],
            run: {
                id: "run-v1",
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    result: { kind: "wait", reason: "等待旧版输入" },
                },
            },
        },
    });
});

test("unknown versions and cross-field-invalid v1 snapshots are rejected", () => {
    const v1 = createV1Snapshot();

    assert.equal(GoalSnapshotSchema.safeParse({
        ...v1,
        metadata: { schemaVersion: 99 },
    }).success, false);
    assert.equal(GoalSnapshotSchema.safeParse({
        ...v1,
        run: {
            ...v1.run,
            status: "completed",
        },
    }).success, false);
    assert.equal(GoalSnapshotSchema.safeParse({
        ...v1,
        run: {
            ...v1.run,
            stepCount: 0,
        },
    }).success, false);
});

test("InMemoryGoalStore keeps only the latest complete snapshot", async () => {
    const store = new InMemoryGoalStore();
    const initial = createSnapshot("run-1");
    const latest: Goal = {
        ...initial,
        state: {
            ...initial.state,
            messages: [
                ...initial.state.messages,
                { role: "user", content: "继续执行" },
            ],
            run: {
                ...initial.state.run,
                id: "run-2",
                status: "running",
                stepCount: 1,
                lastStep: {
                    result: { kind: "continue", summary: "继续执行" },
                },
            },
        },
    };

    await store.save(initial);
    await store.save(latest);

    assert.deepEqual(await store.restore("goal-1"), latest);
    assert.deepEqual((await store.restore("goal-1"))?.definition.profile, profile);
    assert.deepEqual((await store.restore("goal-1"))?.state.messages, [
        { role: "user", content: "请开始执行" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "我会先检查输入" },
        { role: "user", content: "继续执行" },
    ]);
});

test("InMemoryGoalStore clones on save and restore", async () => {
    const store = new InMemoryGoalStore();
    const input = createSnapshot();

    await store.save(input);
    (input.definition.profile.instructions as string[]).push("外部修改");
    (input.state.messages as GoalMessage[]).reverse();

    const first = await store.restore("goal-1");
    assert.deepEqual(first?.definition.profile.instructions, ["先检查输入", "再执行任务"]);
    assert.deepEqual(first?.state.messages, messages);

    if (first === undefined) {
        assert.fail("expected a saved Goal");
    }

    (first.definition.profile.instructions as string[]).push("恢复结果修改");
    (first.state.messages as GoalMessage[]).push({
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: "不应写回 Store",
    });

    assert.deepEqual(await store.restore("goal-1"), createSnapshot());
});

test("InMemoryGoalStore validates before saving and returns undefined when missing", async () => {
    const store = new InMemoryGoalStore();
    const invalid = {
        ...createSnapshot(),
        extra: true,
    } as Goal;

    await assert.rejects(store.save(invalid));
    assert.equal(await store.restore("missing-goal"), undefined);
});

test("JsonFileGoalStore saves a full snapshot and restores it in a new instance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const goal = createSnapshot("run-file");
        const store = new JsonFileGoalStore(directory);

        await store.save(goal);

        const restored = await new JsonFileGoalStore(directory).restore(goal.id);
        assert.deepEqual(restored, goal);
        assert.notStrictEqual(restored, goal);
        assert.deepEqual(restored?.definition.profile, goal.definition.profile);
        assert.deepEqual(restored?.state.messages, goal.state.messages);
        assert.deepEqual(restored?.state.run, goal.state.run);

        const files = await readdir(directory);
        assert.equal(files.length, 1);
        assert.match(files[0] ?? "", /^[A-Za-z0-9_-]+\.json$/);
        assert.deepEqual(
            JSON.parse(await readFile(join(directory, files[0] ?? ""), "utf8")),
            goal,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore restores v1 read-only and upgrades it on the next save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const v1 = createV1Snapshot();
        const path = snapshotPath(directory, v1.id);
        const originalContent = `${JSON.stringify(v1, null, 2)}\n`;
        await mkdir(directory, { recursive: true });
        await writeFile(path, originalContent, "utf8");
        const store = new JsonFileGoalStore(directory);

        const restored = await store.restore(v1.id);

        assert.ok(restored);
        assert.equal(restored.metadata.schemaVersion, 2);
        assert.equal(await readFile(path, "utf8"), originalContent);

        await store.save(restored);
        const saved = JSON.parse(await readFile(path, "utf8")) as {
            readonly metadata: { readonly schemaVersion: number };
            readonly task?: unknown;
        };

        assert.equal(saved.metadata.schemaVersion, 2);
        assert.equal(saved.task, undefined);
        assert.deepEqual(await store.restore(v1.id), restored);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore overwrites the previous snapshot for the same Goal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const store = new JsonFileGoalStore(directory);
        const initial = createSnapshot("run-old");
        const latest: Goal = {
            ...initial,
            state: {
                ...initial.state,
                messages: [
                    ...initial.state.messages,
                    { role: "user", content: "恢复后继续执行" },
                ],
                run: {
                    ...initial.state.run,
                    id: "run-latest",
                    status: "running",
                    stepCount: 2,
                    lastStep: {
                        result: {
                            kind: "continue",
                            summary: "已保存最新进度",
                        },
                    },
                },
            },
        };

        await store.save(initial);
        await store.save(latest);

        assert.deepEqual(
            await new JsonFileGoalStore(directory).restore(initial.id),
            latest,
        );
        assert.equal((await readdir(directory)).length, 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore uses a safe encoded filename for arbitrary Goal IDs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const goalId = "goal/with/slash/../危险";
        const goal = createGoal({
            id: goalId,
            task: {
                objective: "验证路径安全",
                completionCriteria: ["文件仍位于存储目录内"],
            },
            profile,
            messages,
            runId: "run-safe-path",
        });
        const store = new JsonFileGoalStore(directory);

        await store.save(goal);

        assert.deepEqual(await store.restore(goalId), goal);
        const files = await readdir(directory);
        assert.equal(files.length, 1);
        assert.match(files[0] ?? "", /^[A-Za-z0-9_-]+\.json$/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore returns undefined for a missing Goal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        assert.equal(
            await new JsonFileGoalStore(directory).restore("missing-goal"),
            undefined,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore normalizes invalid JSON, schema, and ID errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const goal = createSnapshot("run-protocol");
        const store = new JsonFileGoalStore(directory);
        const path = snapshotPath(directory, goal.id);

        await store.save(goal);

        await writeFile(path, "{invalid-json", "utf8");
        await assert.rejects(
            store.restore(goal.id),
            (error: unknown) => {
                assert.ok(error instanceof GoalSnapshotProtocolError);
                assert.equal(error.code, INVALID_GOAL_SNAPSHOT_CODE);
                return true;
            },
        );

        await writeFile(path, JSON.stringify({ ...goal, extra: true }), "utf8");
        await assert.rejects(
            store.restore(goal.id),
            (error: unknown) => {
                assert.ok(error instanceof GoalSnapshotProtocolError);
                assert.equal(error.code, INVALID_GOAL_SNAPSHOT_CODE);
                return true;
            },
        );

        await writeFile(
            path,
            JSON.stringify({ ...goal, id: "another-goal" }),
            "utf8",
        );
        await assert.rejects(
            store.restore(goal.id),
            (error: unknown) => {
                assert.ok(error instanceof GoalSnapshotProtocolError);
                assert.equal(error.code, INVALID_GOAL_SNAPSHOT_CODE);
                return true;
            },
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore rejects damaged v1 without rewriting its file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const v1 = createV1Snapshot();
        const damaged = {
            ...v1,
            run: { ...v1.run, status: "completed" },
        };
        const path = snapshotPath(directory, v1.id);
        const originalContent = JSON.stringify(damaged);
        await mkdir(directory, { recursive: true });
        await writeFile(path, originalContent, "utf8");
        const store = new JsonFileGoalStore(directory);

        await assert.rejects(
            store.restore(v1.id),
            (error: unknown) => {
                assert.ok(error instanceof GoalSnapshotProtocolError);
                assert.equal(error.code, INVALID_GOAL_SNAPSHOT_CODE);
                return true;
            },
        );
        let executeCalls = 0;
        const runner = new Runner({
            store,
            executor: {
                async execute() {
                    executeCalls += 1;
                    return {
                        result: { kind: "complete", summary: "不应执行" },
                        appendedMessages: [],
                    };
                },
            },
            maxSteps: 1,
        });
        await assert.rejects(
            runner.run({ goalId: v1.id, runId: v1.run.id }),
            GoalSnapshotProtocolError,
        );
        assert.equal(executeCalls, 0);
        assert.equal(await readFile(path, "utf8"), originalContent);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore preserves filesystem errors and cleans failed temp files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const blockingPath = join(parent, "not-a-directory");
        await writeFile(blockingPath, "blocking file", "utf8");
        const blockedStore = new JsonFileGoalStore(blockingPath);
        let restoreError: unknown;

        try {
            await blockedStore.restore("goal-io");
        } catch (error) {
            restoreError = error;
        }

        assert.ok(restoreError instanceof Error);
        assert.notEqual(
            (restoreError as NodeJS.ErrnoException).code,
            INVALID_GOAL_SNAPSHOT_CODE,
        );

        let executeCalls = 0;
        const runner = new Runner({
            store: blockedStore,
            executor: {
                async execute() {
                    executeCalls += 1;
                    return {
                        result: { kind: "complete", summary: "不应执行" },
                        appendedMessages: [],
                    };
                },
            },
            maxSteps: 1,
        });

        await assert.rejects(
            runner.run({ goalId: "goal-io", runId: "run-io" }),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.notEqual(
                    (error as NodeJS.ErrnoException).code,
                    INVALID_GOAL_SNAPSHOT_CODE,
                );
                return true;
            },
        );
        assert.equal(executeCalls, 0);

        const directory = join(parent, "snapshots");
        await mkdir(directory);
        const goal = createSnapshot("run-io");
        await mkdir(snapshotPath(directory, goal.id));
        const store = new JsonFileGoalStore(directory);
        let saveError: unknown;

        try {
            await store.save(goal);
        } catch (error) {
            saveError = error;
        }

        assert.ok(saveError instanceof Error);
        assert.notEqual(
            (saveError as NodeJS.ErrnoException).code,
            INVALID_GOAL_SNAPSHOT_CODE,
        );
        assert.deepEqual(
            (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
            [],
        );
    } finally {
        await rm(parent, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore supports complete recovery across tsx processes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const goal = createWaitingSnapshot("run-cross-process");

        await runGoalStoreProcess([
            "save",
            directory,
            goal.id,
            JSON.stringify(goal),
        ]);
        const restoredOutput = await runGoalStoreProcess([
            "restore",
            directory,
            goal.id,
        ]);

        assert.deepEqual(JSON.parse(restoredOutput), goal);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore migrates v1 across tsx processes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const v1 = createV1Snapshot();
        await mkdir(directory, { recursive: true });
        await writeFile(
            snapshotPath(directory, v1.id),
            JSON.stringify(v1),
            "utf8",
        );

        const restoredOutput = await runGoalStoreProcess([
            "restore",
            directory,
            v1.id,
        ]);
        const restored = JSON.parse(restoredOutput) as Goal;

        assert.equal(restored.metadata.schemaVersion, 2);
        assert.equal(restored.state.workflow.phase, "executing");
        assert.deepEqual(restored.state.messages[1], {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "旧版真实响应",
        });
        assert.equal(
            (JSON.parse(await readFile(snapshotPath(directory, v1.id), "utf8")) as {
                readonly metadata: { readonly schemaVersion: number };
            }).metadata.schemaVersion,
            1,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a cross-process waiting Goal resumes with its run and latest snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const goal = createWaitingSnapshot("run-cross-resume");
        await runGoalStoreProcess([
            "save",
            directory,
            goal.id,
            JSON.stringify(goal),
        ]);
        const restoredOutput = await runGoalStoreProcess([
            "restore",
            directory,
            goal.id,
        ]);
        assert.deepEqual(JSON.parse(restoredOutput), goal);

        const receivedGoals: Goal[] = [];
        const store = new JsonFileGoalStore(directory);
        const runner = new Runner({
            store,
            executor: {
                async execute(currentGoal: Goal) {
                    receivedGoals.push(currentGoal);
                    return {
                        result: {
                            kind: "complete",
                            summary: "跨进程恢复后完成",
                        },
                        appendedMessages: [
                            { role: "user", content: "恢复后的输入" },
                            { role: "assistant", assistant: { profileId: "profile-1" }, content: "恢复后的响应" },
                        ],
                    };
                },
            },
            maxSteps: 3,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const blocked = await runner.run(ref);
        assert.equal(blocked.ok, true);
        if (!blocked.ok) {
            return;
        }

        assert.equal(blocked.state.status, "waiting");
        assert.equal(blocked.state.stepCount, 1);
        assert.equal(receivedGoals.length, 0);

        const resumed = await runner.resume(ref);
        assert.equal(resumed.ok, true);
        if (!resumed.ok) {
            return;
        }

        assert.equal(resumed.state.id, goal.state.run.id);
        assert.equal(resumed.state.status, "completed");
        assert.equal(resumed.state.stepCount, 2);
        assert.equal(receivedGoals.length, 1);
        assert.equal((receivedGoals[0] as Goal).state.run.stepCount, 1);

        const latest = await new JsonFileGoalStore(directory).restore(goal.id);
        assert.deepEqual(latest?.metadata, goal.metadata);
        assert.deepEqual(latest?.state.workflow, goal.state.workflow);
        assert.deepEqual(latest?.definition.profile, goal.definition.profile);
        assert.deepEqual(latest?.state.messages, [
            ...goal.state.messages,
            { role: "user", content: "恢复后的输入" },
            { role: "assistant", assistant: { profileId: "profile-1" }, content: "恢复后的响应" },
        ]);
        assert.deepEqual(latest?.state.run, resumed.state);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
