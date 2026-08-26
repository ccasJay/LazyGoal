import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    utimes,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createGoal,
    Runner,
    transition,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    GoalSnapshotV6Schema,
    goalSnapshotCodec,
    InMemoryGoalStore,
    INVALID_GOAL_SNAPSHOT_CODE,
    JsonFileGoalStore,
} from "../src/index";
import type {
    AgentProfile,
    Goal,
    GoalMessage,
    RunStatus,
} from "../../runtime/src/index";

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

function createExecutingGoal(input: {
    readonly id: string;
    readonly objective: string;
    readonly completionCriteria: readonly string[];
    readonly profile: AgentProfile;
    readonly messages?: readonly GoalMessage[];
    readonly runId: string;
}): Goal {
    const created = createGoal({
        id: input.id,
        intent: input.objective,
        promptBundleVersion: 1,
        profile: input.profile,
        runId: input.runId,
        ...(input.messages === undefined ? {} : { messages: input.messages }),
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: input.objective,
                    completionCriteria: [...input.completionCriteria],
                },
            },
        },
    };
}

function createSnapshot(runId = "run-1"): Goal {
    return createExecutingGoal({
        id: "goal-1",
        objective: "完成快照存储",
        completionCriteria: ["可以恢复最新 Goal"],
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

function createV2Snapshot() {
    const goal = createSnapshot("run-v2");

    return {
        ...goal,
        metadata: { schemaVersion: 2 },
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "running" as const,
                stepCount: 1,
                lastStep: {
                    result: {
                        kind: "continue" as const,
                        summary: "旧版累计 checkpoint",
                    },
                },
            },
        },
    };
}

function createActionSnapshot(): Goal {
    const goal = createSnapshot("run-action");
    const action = {
        actionId: "action-1",
        toolId: "read_file",
        input: { path: "README.md", options: { encoding: "utf8" } },
    } as const;

    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: 1,
                checkpoint: "已读取任务上下文",
                lastStep: {
                    kind: "action",
                    action,
                    observation: {
                        kind: "success",
                        output: { content: "ok" },
                        summary: "已读取 README.md",
                    },
                },
            },
        },
    };
}

function snapshotPath(directory: string, goalId: string): string {
    const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
    return join(directory, `${encodedGoalId}.json`);
}

function transitionGoal(
    goal: Goal,
    input: Parameters<typeof transition>[1],
): Goal {
    const result = transition(goal.state.run, input);

    if (!result.ok) {
        throw new Error(result.error.message);
    }

    return {
        ...goal,
        state: {
            ...goal.state,
            run: result.state,
        },
    };
}

function createCatalogGoal(id: string, status: RunStatus): Goal {
    const goal = createExecutingGoal({
        id,
        objective: `Intent ${id}`,
        completionCriteria: ["完成目录测试"],
        profile,
        runId: `run-${id}`,
    });

    if (status === "created") {
        return goal;
    }

    const started = transitionGoal(goal, { kind: "start" });

    if (status === "running") {
        return started;
    }

    if (status === "cancelled") {
        return transitionGoal(started, { kind: "cancel" });
    }

    const decision = status === "waiting"
        ? {
            kind: "wait" as const,
            checkpoint: `Checkpoint ${id}`,
            reason: "等待目录测试输入",
        }
        : status === "completed"
            ? {
                kind: "complete" as const,
                checkpoint: `Checkpoint ${id}`,
                summary: "目录测试完成",
            }
            : {
                kind: "fail" as const,
                checkpoint: `Checkpoint ${id}`,
                error: "目录测试失败",
            };

    return transitionGoal(started, { kind: "decision", decision });
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
                    kind: "decision",
                    result: {
                        kind: "wait",
                        checkpoint: "等待外部输入",
                        reason: "等待外部输入",
                    },
                },
            },
        },
    };
}

function assertProtocolError(error: unknown): boolean {
    assert.ok(error instanceof GoalSnapshotProtocolError);
    assert.equal(error.code, INVALID_GOAL_SNAPSHOT_CODE);
    return true;
}

test("GoalSnapshotCodec round-trips a complete Goal and rejects extra fields", () => {
    const goal = createSnapshot();
    const encoded = goalSnapshotCodec.encode(goal);

    assert.equal(encoded.metadata.schemaVersion, 6);
    assert.equal(encoded.definition.promptBundleVersion, 1);
    assert.deepEqual(goalSnapshotCodec.decode(encoded), goal);

    assert.throws(
        () => goalSnapshotCodec.decode({ ...encoded, extra: true }),
        assertProtocolError,
    );
    assert.throws(
        () => goalSnapshotCodec.decode({
            ...encoded,
            definition: {
                ...encoded.definition,
                profile: {
                    ...encoded.definition.profile,
                    extra: true,
                },
            },
        }),
        assertProtocolError,
    );
    const { promptBundleVersion: _version, ...definitionWithoutVersion }
        = encoded.definition;
    assert.throws(
        () => goalSnapshotCodec.decode({
            ...encoded,
            definition: definitionWithoutVersion,
        }),
        assertProtocolError,
    );
});

test("GoalSnapshotCodec reads legacy v5 with a zero Trajectory boundary without rewriting it", () => {
    const encoded = goalSnapshotCodec.encode(createSnapshot("run-v5-boundary"));
    const { committedThroughSequence: _boundary, ...legacyRun } = encoded.state.run;
    const legacy = {
        ...encoded,
        metadata: { schemaVersion: 5 as const },
        state: {
            ...encoded.state,
            run: legacyRun,
        },
    };
    const source = JSON.stringify(legacy);
    const restored = goalSnapshotCodec.decode(legacy);

    assert.equal(restored.state.run.committedThroughSequence, 0);
    assert.equal(JSON.stringify(legacy), source);
});

test("GoalSnapshotCodec preserves a non-zero v6 Trajectory boundary", () => {
    const goal = createSnapshot("run-v6-boundary");
    const boundedGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                committedThroughSequence: 42,
            },
        },
    };
    const encoded = goalSnapshotCodec.encode(boundedGoal);

    assert.equal(encoded.state.run.committedThroughSequence, 42);
    assert.equal(
        goalSnapshotCodec.decode(encoded).state.run.committedThroughSequence,
        42,
    );
});

test("GoalSnapshotCodec round-trips bounded Action memory and approval state", () => {
    const actionGoal = createActionSnapshot();
    const encodedAction = goalSnapshotCodec.encode(actionGoal);

    assert.equal(encodedAction.metadata.schemaVersion, 6);
    assert.deepEqual(goalSnapshotCodec.decode(encodedAction), actionGoal);

    const pendingGoal: Goal = {
        ...createSnapshot("run-pending"),
        state: {
            ...createSnapshot("run-pending").state,
            run: {
                id: "run-pending",
                status: "waiting",
                stepCount: 0,
                checkpoint: "等待用户批准读取",
                pendingAction: {
                    action: {
                        actionId: "action-pending",
                        toolId: "read_file",
                        input: { path: "README.md" },
                    },
                    status: "awaiting_approval",
                },
            },
        },
    };

    assert.deepEqual(
        goalSnapshotCodec.decode(goalSnapshotCodec.encode(pendingGoal)),
        pendingGoal,
    );
});

test("GoalSnapshotCodec restores the complete Runtime State for every phase", () => {
    const planning: Goal = createGoal({
        id: "goal-planning",
        intent: "先准备",
        promptBundleVersion: 1,
        profile,
        runId: "run-planning",
    });
    const planningWaiting: Goal = {
        ...planning,
        state: {
            ...planning.state,
            workflow: {
                phase: "planning",
                preparation: {
                    status: "waiting_approval",
                    proposal: {
                        objective: "准备后的任务",
                        completionCriteria: ["批准后执行"],
                    },
                },
            },
            messages: [
                ...planning.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: "profile-1" },
                    content: "请批准任务",
                },
            ],
        },
    };
    const failed: Goal = {
        ...createSnapshot("run-failed"),
        state: {
            ...createSnapshot("run-failed").state,
            run: {
                id: "run-failed",
                status: "failed",
                stepCount: 1,
                checkpoint: "执行中断",
                lastStep: {
                    kind: "action",
                    action: {
                        actionId: "action-done",
                        toolId: "read_file",
                        input: { path: "a.txt" },
                    },
                    observation: {
                        kind: "success",
                        output: "ok",
                        summary: "已读取",
                    },
                },
                pendingAction: {
                    action: {
                        actionId: "action-unknown",
                        toolId: "read_file",
                        input: { path: "b.txt" },
                    },
                    status: "outcome_unknown",
                },
                stopReason: {
                    kind: "execution_error",
                    code: "TOOL_EXECUTION_ERROR",
                    message: "进程中断",
                },
            },
        },
    };

    for (const goal of [planning, planningWaiting, failed]) {
        const restored = goalSnapshotCodec.decode(
            goalSnapshotCodec.encode(goal),
        );

        assert.deepEqual(restored, goal);
        assert.notStrictEqual(restored, goal);
    }

    const restoredFailed = goalSnapshotCodec.decode(
        goalSnapshotCodec.encode(failed),
    );

    assert.equal(restoredFailed.state.workflow.phase, "executing");
    assert.equal(restoredFailed.state.run.status, "failed");
    assert.equal(restoredFailed.state.run.stepCount, 1);
    assert.equal(restoredFailed.state.run.checkpoint, "执行中断");
    assert.equal(restoredFailed.state.run.lastStep?.kind, "action");
    assert.equal(
        restoredFailed.state.run.pendingAction?.status,
        "outcome_unknown",
    );
    assert.equal(
        restoredFailed.state.run.pendingAction?.action.actionId,
        "action-unknown",
    );
    assert.deepEqual(restoredFailed.state.run.stopReason, {
        kind: "execution_error",
        code: "TOOL_EXECUTION_ERROR",
        message: "进程中断",
    });
});

test("GoalSnapshotCodec isolates objects between Runtime and Snapshot", () => {
    const goal = createActionSnapshot();
    const encoded = goalSnapshotCodec.encode(goal);

    const goalStep = goal.state.run.lastStep;
    assert.equal(goalStep?.kind, "action");
    if (goalStep?.kind !== "action") {
        return;
    }
    (goalStep.action.input as { path: string }).path = "mutated-by-runtime.json";
    (goal.definition.profile.instructions as string[]).push("运行时修改");

    assert.deepEqual(
        encoded.state.run.lastStep?.kind === "action"
            ? encoded.state.run.lastStep.action.input
            : undefined,
        { path: "README.md", options: { encoding: "utf8" } },
    );
    assert.deepEqual(
        encoded.definition.profile.instructions,
        ["先检查输入", "再执行任务"],
    );

    const first = goalSnapshotCodec.decode(encoded);
    const second = goalSnapshotCodec.decode(encoded);

    assert.deepEqual(first, second);
    assert.deepEqual(first, goalSnapshotCodec.decode(JSON.parse(
        JSON.stringify(goalSnapshotCodec.encode(createActionSnapshot())),
    )));

    const encodedStep = encoded.state.run.lastStep;
    assert.equal(encodedStep?.kind, "action");
    if (encodedStep?.kind !== "action") {
        return;
    }
    (encodedStep.action.input as { path: string }).path = "mutated-by-storage.json";
    (encoded.definition.profile.instructions as string[]).push("存储修改");

    assert.deepEqual(first, goalSnapshotCodec.decode(
        goalSnapshotCodec.encode(createActionSnapshot()),
    ));

    const firstStep = first.state.run.lastStep;
    assert.equal(firstStep?.kind, "action");
    if (firstStep?.kind !== "action") {
        return;
    }
    (firstStep.action.input as { path: string }).path = "mutated-by-caller.json";

    assert.equal(second.state.run.lastStep?.kind, "action");
    if (second.state.run.lastStep?.kind !== "action") {
        return;
    }
    assert.deepEqual(
        second.state.run.lastStep.action.input,
        { path: "README.md", options: { encoding: "utf8" } },
    );
});

test("GoalSnapshotCodec rejects v1-v4, invalid v5, and unknown versions without changing the source", () => {
    const v1 = createV1Snapshot();
    const v1Source = JSON.stringify(v1);
    const v2 = createV2Snapshot();
    const v2Source = JSON.stringify(v2);
    const encoded = goalSnapshotCodec.encode(createSnapshot());
    const v3 = {
        ...encoded,
        metadata: { schemaVersion: 3 },
    };
    const v4 = {
        ...encoded,
        metadata: { schemaVersion: 4 },
    };
    const invalidV5 = {
        ...encoded,
        state: {
            ...encoded.state,
            run: {
                ...encoded.state.run,
                status: "waiting" as const,
                stepCount: 1,
                lastStep: {
                    kind: "legacy",
                    result: { kind: "wait", reason: "旧执行协议" },
                },
            },
        },
    };
    const v3Source = JSON.stringify(v3);
    const v4Source = JSON.stringify(v4);
    const invalidV5Source = JSON.stringify(invalidV5);

    assert.throws(() => goalSnapshotCodec.decode(v1), assertProtocolError);
    assert.throws(() => goalSnapshotCodec.decode(v2), assertProtocolError);
    assert.throws(() => goalSnapshotCodec.decode(v3), assertProtocolError);
    assert.throws(() => goalSnapshotCodec.decode(v4), assertProtocolError);
    assert.throws(() => goalSnapshotCodec.decode(invalidV5), assertProtocolError);
    assert.throws(
        () => goalSnapshotCodec.decode({
            ...encoded,
            metadata: { schemaVersion: 99 },
        }),
        assertProtocolError,
    );

    assert.equal(JSON.stringify(v1), v1Source);
    assert.equal(JSON.stringify(v2), v2Source);
    assert.equal(JSON.stringify(v3), v3Source);
    assert.equal(JSON.stringify(v4), v4Source);
    assert.equal(JSON.stringify(invalidV5), invalidV5Source);
});

test("GoalSnapshotV6Schema rejects invalid v6 cross-field combinations", () => {
    const encoded = goalSnapshotCodec.encode(createSnapshot("run-invalid-v4"));
    const action = {
        actionId: "action-invalid",
        toolId: "read_file",
        input: { path: "README.md" },
    } as const;
    const invalidSnapshots: unknown[] = [
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    ...encoded.state.run,
                    committedThroughSequence: -1,
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    ...encoded.state.run,
                    committedThroughSequence: 1.5,
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-invalid-v4",
                    status: "running",
                    stepCount: 1,
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-invalid-v4",
                    status: "running",
                    stepCount: 0,
                    checkpoint: "等待批准",
                    pendingAction: { action, status: "awaiting_approval" },
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-invalid-v4",
                    status: "waiting",
                    stepCount: 0,
                    pendingAction: { action, status: "approved" },
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-invalid-v4",
                    status: "running",
                    stepCount: 0,
                    pendingAction: { action, status: "approved" },
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-invalid-v4",
                    status: "completed",
                    stepCount: 0,
                    pendingAction: { action, status: "awaiting_approval" },
                    checkpoint: "不应存在",
                },
            },
        },
    ];

    for (const invalidSnapshot of invalidSnapshots) {
        assert.equal(GoalSnapshotV6Schema.safeParse(invalidSnapshot).success, false);
    }
});

test("GoalSnapshotV6Schema enforces workflow and Run cross-field invariants", () => {
    const encoded = goalSnapshotCodec.encode(createSnapshot());
    const waitStep = {
        kind: "decision",
        result: {
            kind: "wait",
            checkpoint: "等待输入",
            reason: "等待外部输入",
        },
    } as const;
    const completeStep = {
        kind: "decision",
        result: {
            kind: "complete",
            checkpoint: "已完成",
            summary: "不应出现在 waiting Run",
        },
    } as const;
    const invalidSnapshots: unknown[] = [
        (() => {
            const preparation = goalSnapshotCodec.encode(createGoal({
                id: "goal-preparation",
                intent: "先准备",
                promptBundleVersion: 1,
                profile,
                runId: "run-preparation",
            }));

            return {
                ...preparation,
                state: {
                    ...preparation.state,
                    run: {
                        id: "run-preparation",
                        status: "running" as const,
                        stepCount: 0,
                    },
                },
            };
        })(),
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: { id: "run-1", status: "running", stepCount: 1 },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-1",
                    status: "waiting",
                    stepCount: 1,
                    lastStep: completeStep,
                    checkpoint: "等待输入",
                },
            },
        },
        {
            ...encoded,
            state: {
                ...encoded.state,
                run: {
                    id: "run-1",
                    status: "failed",
                    stepCount: 1,
                    lastStep: waitStep,
                    checkpoint: "等待输入",
                },
            },
        },
        {
            ...encoded,
            definition: {
                ...encoded.definition,
                executionPolicy: { maxSteps: 1 },
            },
            state: {
                ...encoded.state,
                run: {
                    id: "run-1",
                    status: "failed",
                    stepCount: 1,
                    lastStep: completeStep,
                    checkpoint: "等待输入",
                    stopReason: { kind: "max_steps_exceeded" },
                },
            },
        },
    ];

    for (const invalidSnapshot of invalidSnapshots) {
        assert.equal(GoalSnapshotV6Schema.safeParse(invalidSnapshot).success, false);
    }
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
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        checkpoint: "等待继续执行",
                        reason: "等待继续执行",
                    },
                },
                checkpoint: "等待继续执行",
            },
        },
    };

    await store.save(initial);
    await store.save(latest);

    assert.deepEqual(await store.restore("goal-1"), latest);
    assert.deepEqual((await store.restore("goal-1"))?.definition.profile, profile);
    assert.deepEqual((await store.restore("goal-1"))?.state.messages, [
        { role: "user", content: "完成快照存储" },
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
    assert.deepEqual(first?.state.messages, createSnapshot().state.messages);

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

test("InMemoryGoalStore clones Action, Observation, checkpoint, and pending memory", async () => {
    const store = new InMemoryGoalStore();
    const input = createActionSnapshot();
    const expected = structuredClone(input);

    await store.save(input);

    const inputStep = input.state.run.lastStep;
    if (
        inputStep === undefined
        || !("kind" in inputStep)
        || inputStep.kind !== "action"
    ) {
        assert.fail("expected an Action Step");
    }

    (inputStep.action.input as { path: string }).path = "changed.txt";
    Object.assign(inputStep, {
        observation: {
            kind: "failure",
            code: "MUTATED",
            message: "外部修改",
            retryable: false,
        },
    });

    const first = await store.restore(input.id);
    assert.deepEqual(first, expected);

    const firstStep = first?.state.run.lastStep;
    if (
        firstStep === undefined
        || !("kind" in firstStep)
        || firstStep.kind !== "action"
    ) {
        assert.fail("expected an Action Step");
    }

    (firstStep.action.input as { path: string }).path = "restored.txt";
    assert.deepEqual(await store.restore(input.id), expected);
});

test("InMemoryGoalStore validates before saving and returns undefined when missing", async () => {
    const store = new InMemoryGoalStore();
    const invalid = {
        ...createSnapshot(),
        extra: true,
    } as Goal;

    await assert.rejects(store.save(invalid), assertProtocolError);
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
            goalSnapshotCodec.encode(goal),
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore rejects v1 and v2 snapshots without rewriting their files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        for (const [index, legacy] of [
            createV1Snapshot(),
            createV2Snapshot(),
        ].entries()) {
            const directory = join(parent, `legacy-${index}`);
            const path = snapshotPath(directory, legacy.id);
            const originalContent = `${JSON.stringify(legacy, null, 2)}\n`;
            await mkdir(directory, { recursive: true });
            await writeFile(path, originalContent, "utf8");
            const store = new JsonFileGoalStore(directory);

            await assert.rejects(store.restore(legacy.id), assertProtocolError);
            assert.equal(await readFile(path, "utf8"), originalContent);
            assert.equal((await readdir(directory)).length, 1);
        }
    } finally {
        await rm(parent, { recursive: true, force: true });
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
                    status: "waiting",
                    stepCount: 2,
                    lastStep: {
                        kind: "decision",
                        result: {
                            kind: "wait",
                            checkpoint: "已保存最新进度",
                            reason: "等待恢复后输入",
                        },
                    },
                    checkpoint: "已保存最新进度",
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
        const goal = createExecutingGoal({
            id: goalId,
            objective: "验证路径安全",
            completionCriteria: ["文件仍位于存储目录内"],
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

test("JsonFileGoalStore returns an empty catalog for an empty directory", async () => {
    const parent = await mkdtemp(join(tmpdir(), "kai-goal-store-"));
    const emptyDirectory = join(parent, "empty");
    const missingDirectory = join(parent, "missing");

    try {
        await mkdir(emptyDirectory);

        assert.deepEqual(
            await new JsonFileGoalStore(emptyDirectory).listResumable(),
            [],
        );
        assert.deepEqual(
            await new JsonFileGoalStore(missingDirectory).listResumable(),
            [],
        );
    } finally {
        await rm(parent, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore catalogs non-terminal snapshots with stable mtime ordering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const store = new JsonFileGoalStore(directory);
        const goals = [
            createCatalogGoal("goal-created", "created"),
            createCatalogGoal("goal-running", "running"),
            createCatalogGoal("goal-waiting", "waiting"),
            createCatalogGoal("goal-completed", "completed"),
            createCatalogGoal("goal-failed", "failed"),
            createCatalogGoal("goal-cancelled", "cancelled"),
        ];

        for (const goal of goals) {
            await store.save(goal);
        }

        const older = new Date("2024-01-01T00:00:00.000Z");
        const newest = new Date("2024-01-02T00:00:00.000Z");
        await utimes(snapshotPath(directory, "goal-created"), older, older);
        await utimes(snapshotPath(directory, "goal-running"), newest, newest);
        await utimes(snapshotPath(directory, "goal-waiting"), newest, newest);

        await writeFile(
            join(directory, "ignored.json.tmp"),
            JSON.stringify(createCatalogGoal("goal-temp", "running")),
            "utf8",
        );

        const entries = await store.listResumable();

        assert.deepEqual(
            entries.map((entry) => entry.goalId),
            ["goal-running", "goal-waiting", "goal-created"],
        );
        assert.deepEqual(entries[0], {
            goalId: "goal-running",
            runId: "run-goal-running",
            intent: "Intent goal-running",
            workflowPhase: "executing",
            runStatus: "running",
            updatedAt: newest.toISOString(),
        });
        assert.deepEqual(entries[1], {
            goalId: "goal-waiting",
            runId: "run-goal-waiting",
            intent: "Intent goal-waiting",
            workflowPhase: "executing",
            runStatus: "waiting",
            updatedAt: newest.toISOString(),
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore rejects a damaged formal catalog snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        await writeFile(
            join(directory, "broken.json"),
            "{invalid-json",
            "utf8",
        );

        await assert.rejects(
            new JsonFileGoalStore(directory).listResumable(),
            assertProtocolError,
        );

        await rm(join(directory, "broken.json"), { force: true });
        await writeFile(
            join(directory, "wrong-name.json"),
            JSON.stringify(goalSnapshotCodec.encode(
                createCatalogGoal("goal-valid", "running"),
            )),
            "utf8",
        );

        await assert.rejects(
            new JsonFileGoalStore(directory).listResumable(),
            assertProtocolError,
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
        await assert.rejects(store.restore(goal.id), assertProtocolError);

        await writeFile(
            path,
            JSON.stringify({ ...goalSnapshotCodec.encode(goal), extra: true }),
            "utf8",
        );
        await assert.rejects(store.restore(goal.id), assertProtocolError);

        await writeFile(
            path,
            JSON.stringify({
                ...goalSnapshotCodec.encode(goal),
                id: "another-goal",
            }),
            "utf8",
        );
        await assert.rejects(store.restore(goal.id), assertProtocolError);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore rejects a legacy snapshot without rewriting it or executing Steps", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const v1 = createV1Snapshot();
        const path = snapshotPath(directory, v1.id);
        const originalContent = JSON.stringify(v1);
        await mkdir(directory, { recursive: true });
        await writeFile(path, originalContent, "utf8");
        const store = new JsonFileGoalStore(directory);

        await assert.rejects(store.restore(v1.id), assertProtocolError);
        let executeCalls = 0;
        const runner = new Runner({
            store,
            executor: {
                async execute() {
                    executeCalls += 1;
                    return {
                        kind: "complete" as const,
                        checkpoint: "不应执行",
                        summary: "不应执行",
                    };
                },
            },
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
                        kind: "complete" as const,
                        checkpoint: "不应执行",
                        summary: "不应执行",
                    };
                },
            },
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

test("JsonFileGoalStore rejects v1 across tsx processes without rewriting the file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));

    try {
        const v1 = createV1Snapshot();
        const originalContent = JSON.stringify(v1);
        await mkdir(directory, { recursive: true });
        await writeFile(
            snapshotPath(directory, v1.id),
            originalContent,
            "utf8",
        );

        await assert.rejects(runGoalStoreProcess([
            "restore",
            directory,
            v1.id,
        ]));
        assert.equal(
            await readFile(snapshotPath(directory, v1.id), "utf8"),
            originalContent,
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
                        kind: "complete" as const,
                        checkpoint: "跨进程恢复后完成",
                        summary: "跨进程恢复后完成",
                    };
                },
            },
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

        const externallyResumed: Goal = {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    { role: "user", content: "恢复后的输入" },
                ],
                run: { ...goal.state.run, status: "running" },
            },
        };
        await store.save(externallyResumed);
        const resumed = await runner.run(ref);
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
        assert.deepEqual(latest?.state.workflow, goal.state.workflow);
        assert.deepEqual(latest?.definition.profile, goal.definition.profile);
        assert.deepEqual(latest?.state.messages, [
            ...goal.state.messages,
            { role: "user", content: "恢复后的输入" },
            {
                role: "assistant",
                assistant: { profileId: "profile-1" },
                content: "跨进程恢复后完成",
            },
        ]);
        assert.deepEqual(latest?.state.run, resumed.state);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("a cross-process Runner safely replays a persisted read_file Action once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kai-action-workspace-"));

    try {
        await writeFile(join(workspaceRoot, "README.md"), "跨进程文件内容", "utf8");
        const initial = createExecutingGoal({
            id: "goal-cross-action",
            objective: "跨进程恢复读取",
            completionCriteria: ["读取成功"],
            profile: { ...profile, toolIds: ["read_file"] },
            runId: "run-cross-action",
        });
        const runningResult = transition(initial.state.run, { kind: "start" });

        if (!runningResult.ok) {
            assert.fail(runningResult.error.message);
        }

        const stagedResult = transition(runningResult.state, {
            kind: "stage_action",
            checkpoint: "已保存跨进程读取意图",
            action: {
                actionId: "action-cross-process",
                toolId: "read_file",
                input: { path: "README.md" },
            },
            status: "approved",
        });

        if (!stagedResult.ok) {
            assert.fail(stagedResult.error.message);
        }

        const interrupted: Goal = {
            ...initial,
            state: { ...initial.state, run: stagedResult.state },
        };
        await new JsonFileGoalStore(directory).save(interrupted);

        const output = await runGoalStoreProcess([
            "run-safe-replay",
            directory,
            interrupted.id,
            "",
            interrupted.state.run.id,
            workspaceRoot,
        ]);
        const child = JSON.parse(output) as {
            readonly result: {
                readonly ok: boolean;
                readonly state?: {
                    readonly status: string;
                    readonly stepCount: number;
                    readonly pendingAction?: unknown;
                };
            };
            readonly observedActionId?: string;
        };

        assert.equal(child.result.ok, true);
        assert.equal(child.result.state?.status, "completed");
        assert.equal(child.result.state?.stepCount, 2);
        assert.equal(child.result.state?.pendingAction, undefined);
        assert.equal(child.observedActionId, "action-cross-process");

        const latest = await new JsonFileGoalStore(directory).restore(interrupted.id);
        assert.equal(latest?.state.run.status, "completed");
        assert.equal(latest?.state.run.stepCount, 2);
        assert.equal(latest?.state.run.pendingAction, undefined);
    } finally {
        await rm(directory, { recursive: true, force: true });
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
