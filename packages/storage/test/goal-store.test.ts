import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rename,
    rm,
    unlink,
    utimes,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createGoal,
    createStepExecutor,
    Runner,
    transition,
} from "../../runtime/src/index";
import { currentProtocols, messageOutline, trajectoryStoreFor, testUserMessage, testAssistantMessage } from "../../runtime/test/current-fixtures";
import {
    GoalSnapshotProtocolError,
    goalSnapshotCodec,
    InMemoryGoalStore,
    INVALID_GOAL_SNAPSHOT_CODE,
    JsonFileGoalStore,
} from "../src/index";
import type {
    AgentProfile,
    CompletionCriterion,
    Goal,
    GoalMessage,
    RunStatus,
    StepExecutionInput,
} from "../../runtime/src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["先检查输入", "再执行任务"],
    toolIds: ["read"],
};

const messages: GoalMessage[] = [
    testUserMessage("请开始执行"),
    testAssistantMessage("我会先检查输入", { profileId: "profile-1" }),
];

function createExecutingGoal(input: {
    readonly id: string;
    readonly objective: string;
    readonly completionCriteria: readonly CompletionCriterion[];
    readonly profile: AgentProfile;
    readonly messages?: readonly GoalMessage[];
    readonly runId: string;
}): Goal {
    const created = createGoal({
        ...currentProtocols,
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
            },
            run: { ...created.state.run, exposedToolIds: [...input.profile.toolIds], mode: "plan", approvedTask: {
                    objective: input.objective,
                    completionCriteria: input.completionCriteria.map((criterion) => ({ ...criterion })),
                } },
        },
    };
}

function createSnapshot(runId = "run-1"): Goal {
    return createExecutingGoal({
        id: "goal-1",
        objective: "完成快照存储",
        completionCriteria: [{ text: "可以恢复最新 Goal" }],
        profile,
        messages,
        runId,
    });
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
        completionCriteria: [{ text: "完成目录测试" }],
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
            reason: "等待目录测试输入",
        }
        : status === "completed"
            ? {
                kind: "complete" as const,
                completionEvidence: [],
                summary: "目录测试完成",
            }
            : {
                kind: "fail" as const,
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
            workflow: {
                phase: "executing",
            },
            run: {
                ...goal.state.run,
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        reason: "等待外部输入",
                    },
                },

                mode: "plan", approvedTask: {
                    objective: goal.definition.intent,
                    completionCriteria: [],
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

    assert.equal(encoded.metadata.schemaVersion, 1);
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

test("GoalSnapshotCodec preserves a non-zero Trajectory boundary", () => {
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

    assert.equal(encodedAction.metadata.schemaVersion, 1);
    assert.deepEqual(goalSnapshotCodec.decode(encodedAction), actionGoal);

    const pendingGoal: Goal = {
        ...createSnapshot("run-pending"),
        state: {
            ...createSnapshot("run-pending").state,
            run: {
                id: "run-pending",
                mode: "normal",
                status: "waiting",
                stepCount: 0,
                exposedToolIds: [],
                committedThroughSequence: 0,
                contextEpoch: {
                    version: 1,
                    number: 0,
                    conversationStartIndex: 0,
                    openedAtSequence: 0,
                },
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
        ...currentProtocols,
        id: "goal-planning",
        intent: "先准备",
        promptBundleVersion: 1,
        profile,
        runId: "run-planning",
    });
    const taskApprovalWaiting: Goal = {
        ...planning,
        state: {
            ...planning.state,
            workflow: {
                phase: "executing",
            },
            messages: [
                ...planning.state.messages,
                testAssistantMessage("请批准任务", { profileId: "profile-1", goal: planning }),
            ],
            run: {
                ...planning.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    planRouteCandidate: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] },
                    requestId: "proposal-1",
                    proposal: {
                        objective: "准备后的任务",
                        completionCriteria: [{ text: "批准后执行" }],
                    },
                    approvalRequest: "请批准任务",
                },
            },
        },
    };
    const askUserWaiting: Goal = {
        ...planning,
        state: {
            ...planning.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...planning.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "req-1",
                    mode: "plan",
                    questions: [
                        {
                            id: "q-1",
                            header: "问答标题",
                            question: "选择执行语言",
                            options: [
                                { id: "opt-1", label: "TypeScript" },
                                { id: "opt-2", label: "Rust" },
                            ],
                            multiSelect: false,
                        },
                    ],
                },
            },
        },
    };
    const failed: Goal = {
        ...createSnapshot("run-failed"),
        state: {
            ...createSnapshot("run-failed").state,
            run: {
                id: "run-failed",
                mode: "normal",
                status: "failed",
                stepCount: 1,
                exposedToolIds: [],
                committedThroughSequence: 0,
                contextEpoch: {
                    version: 1,
                    number: 0,
                    conversationStartIndex: 0,
                    openedAtSequence: 0,
                },
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

    for (const goal of [planning, taskApprovalWaiting, askUserWaiting, failed]) {
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

test("GoalSnapshotCodec round-trips CompletionCriterion with acceptance", () => {
    const goal = createExecutingGoal({
        id: "goal-with-acceptance",
        objective: "验证 acceptance 持久化",
        completionCriteria: [
            { text: "纯文本标准" },
            {
                text: "带预期工具成功的标准",
                acceptance: { expectToolId: "bash", expectOutcome: "success" },
            },
            {
                text: "带预期工具失败的标准",
                acceptance: { expectToolId: "test_runner", expectOutcome: "failure" },
            },
        ],
        profile,
        runId: "run-acceptance",
    });

    const encoded = goalSnapshotCodec.encode(goal);
    assert.equal(encoded.state.workflow.phase, "executing");
    if (encoded.state.workflow.phase === "executing") {
        assert.ok(encoded.state.run.approvedTask);
        assert.deepEqual(
            encoded.state.run.approvedTask.completionCriteria,
            [
                { text: "纯文本标准" },
                {
                    text: "带预期工具成功的标准",
                    acceptance: { expectToolId: "bash", expectOutcome: "success" },
                },
                {
                    text: "带预期工具失败的标准",
                    acceptance: { expectToolId: "test_runner", expectOutcome: "failure" },
                },
            ],
        );
    }

    const restored = goalSnapshotCodec.decode(encoded);
    assert.equal(restored.state.workflow.phase, "executing");
    if (restored.state.workflow.phase === "executing") {
        assert.ok(restored.state.run.approvedTask);
        assert.deepEqual(
            restored.state.run.approvedTask.completionCriteria,
            goal.state.run.approvedTask?.completionCriteria ?? [],
        );
    }
});

test("GoalSnapshotCodec fails fast on legacy string completionCriteria", () => {
    const validSnapshot = goalSnapshotCodec.encode(createSnapshot());
    const legacySnapshot = JSON.parse(JSON.stringify(validSnapshot));
    legacySnapshot.state.workflow.task = {
        objective: "旧版任务",
        completionCriteria: ["旧版纯字符串条件 1", "旧版纯字符串条件 2"],
    };

    assert.throws(
        () => goalSnapshotCodec.decode(legacySnapshot),
        (error: unknown) => {
            return (
                error instanceof Error
                && error.message.includes("legacy string completionCriteria are no longer supported")
            );
        },
    );

    const legacyPreparationSnapshot = JSON.parse(JSON.stringify(validSnapshot));
    legacyPreparationSnapshot.state.workflow = {
        phase: "planning",
        preparation: { status: "active" },
    };
    assert.throws(
        () => goalSnapshotCodec.decode(legacyPreparationSnapshot),
        (error: unknown) => {
            return (
                error instanceof Error
                && error.message.includes("legacy preparation workflows are no longer supported")
            );
        },
    );
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
                testUserMessage("继续执行", { runId: "run-2", position: { afterSequence: 0, order: 0 } }),
            ],
            // 新 Run 接管前，旧 Run 必须留在已归档 Run 列表里。
            completedRuns: [{
                runId: "run-1",
                status: "completed",
                stepCount: initial.state.run.stepCount,
                committedThroughSequence: initial.state.run.committedThroughSequence,
                messageRange: { start: 0, end: initial.state.messages.length },
            }],
            run: {
                ...initial.state.run,
                id: "run-2",
                status: "waiting",
                stepCount: 1,
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        reason: "等待继续执行",
                    },
                },
            },
        },
    };

    await store.save(initial);
    await store.save(latest);

    assert.deepEqual(await store.restore("goal-1"), latest);
    assert.deepEqual((await store.restore("goal-1"))?.definition.profile, profile);
    assert.deepEqual(messageOutline((await store.restore("goal-1"))?.state.messages ?? []), [
        { role: "user", content: "完成快照存储" },
        { role: "user", content: "请开始执行" },
        { role: "assistant", content: "我会先检查输入", purpose: "process" },
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
    (first.state.messages as GoalMessage[]).push(testAssistantMessage("不应写回 Store", {
        profileId: "profile-1",
        runId: "run-1",
        position: { afterSequence: 0, order: first.state.messages.length },
    }));

    assert.deepEqual(await store.restore("goal-1"), createSnapshot());
});

test("InMemoryGoalStore clones Action, Observation, and pending memory", async () => {
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
        definition: {
            ...createSnapshot().definition,
            promptBundleVersion: 2,
        },
    } as unknown as Goal;

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

        const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
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

test("JsonFileGoalStore verifies a completed rename and finishes archive cleanup without replaying the save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-retry-"));

    try {
        const goal = createSnapshot("run-retry");
        const archivePath = `${snapshotPath(directory, goal.id)}.archived`;
        await writeFile(archivePath, "", { mode: 0o600 });
        let renameCalls = 0;
        let archiveDeleteCalls = 0;
        const store = new JsonFileGoalStore(directory, {
            rename: async (from, to) => {
                if (to !== snapshotPath(directory, goal.id)) {
                    await rename(from, to);
                    return;
                }
                renameCalls += 1;
                await rename(from, to);
                if (renameCalls === 1) {
                    throw Object.assign(new Error("rename result unknown"), { code: "EBUSY" });
                }
            },
            unlink: async (path) => {
                if (path === archivePath && archiveDeleteCalls === 0) {
                    archiveDeleteCalls += 1;
                    await unlink(path);
                    throw Object.assign(new Error("archive cleanup result unknown"), { code: "EAGAIN" });
                }
                await unlink(path);
            },
        });

        await store.save(goal);

        assert.equal(renameCalls, 1);
        assert.equal(archiveDeleteCalls, 1);
        assert.deepEqual(await store.restore(goal.id), goal);
        await assert.rejects(readFile(archivePath), (error: unknown) =>
            error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT");
        assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore retries only confirmed temporary failures and caps attempts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-retry-"));

    try {
        let openCalls = 0;
        const goal = createSnapshot("run-open-retry");
        const retrying = new JsonFileGoalStore(directory, {
            open: async (path, flags, mode) => {
                if (String(path).startsWith(snapshotPath(directory, goal.id))) openCalls += 1;
                if (openCalls === 1) {
                    throw Object.assign(new Error("temporary open failure"), { code: "EINTR" });
                }
                const { open } = await import("node:fs/promises");
                return open(path, flags, mode);
            },
        });
        await retrying.save(goal);
        assert.equal(openCalls, 2);
        assert.deepEqual(await retrying.restore(goal.id), goal);

        let attempts = 0;
        const unavailable = new JsonFileGoalStore(join(directory, "unavailable"), {
            open: async () => {
                attempts += 1;
                throw Object.assign(new Error("temporary open failure"), { code: "EBUSY" });
            },
        });
        await assert.rejects(
            () => unavailable.save(createSnapshot("run-exhausted")),
            (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === "EBUSY",
        );
        assert.equal(attempts, 3);
        assert.deepEqual((await readdir(join(directory, "unavailable"))).filter((name) => name.endsWith(".tmp")), []);
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
                    testUserMessage("恢复后继续执行", { runId: "run-latest", position: { afterSequence: 0, order: 0 } }),
                ],
                // 新 Run 接管前，旧 Run 必须留在已归档 Run 列表里。
                completedRuns: [{
                    runId: "run-old",
                    status: "completed",
                    stepCount: initial.state.run.stepCount,
                    committedThroughSequence: initial.state.run.committedThroughSequence,
                    messageRange: { start: 0, end: initial.state.messages.length },
                }],
                run: {
                    ...initial.state.run,
                    id: "run-latest",
                    status: "waiting",
                    stepCount: 2,
                    lastStep: {
                        kind: "decision",
                        result: {
                            kind: "wait",
                            reason: "等待恢复后输入",
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
        assert.equal((await readdir(directory)).filter((name) => name.endsWith(".json")).length, 1);
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
            completionCriteria: [{ text: "文件仍位于存储目录内" }],
            profile,
            messages,
            runId: "run-safe-path",
        });
        const store = new JsonFileGoalStore(directory);

        await store.save(goal);

        assert.deepEqual(await store.restore(goalId), goal);
        const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
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
            committedThroughSequence: 0,
            updatedAt: newest.toISOString(),
        });
        assert.deepEqual(entries[1], {
            goalId: "goal-waiting",
            runId: "run-goal-waiting",
            intent: "Intent goal-waiting",
            workflowPhase: "executing",
            runStatus: "waiting",
            committedThroughSequence: 0,
            updatedAt: newest.toISOString(),
        });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("JsonFileGoalStore.listHistory returns all goals including completed, failed, and cancelled", async () => {
    const directory = await mkdtemp(join(tmpdir(), "goal-store-history-"));
    const store = new JsonFileGoalStore(directory);

    try {
        await store.save(createCatalogGoal("goal-completed", "completed"));
        await store.save(createCatalogGoal("goal-failed", "failed"));
        await store.save(createCatalogGoal("goal-cancelled", "cancelled"));
        await store.save(createCatalogGoal("goal-running", "running"));

        const resumable = await store.listResumable();
        assert.equal(resumable.length, 1);
        assert.equal(resumable[0]?.goalId, "goal-running");

        const history = await store.listHistory();
        assert.equal(history.entries.length, 4);
        assert.equal(history.unreadableCount, 0);
        const goalIds = history.entries.map((entry) => entry.goalId);
        assert.ok(goalIds.includes("goal-completed"));
        assert.ok(goalIds.includes("goal-failed"));
        assert.ok(goalIds.includes("goal-cancelled"));
        assert.ok(goalIds.includes("goal-running"));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("终态 Goal 归档跨实例持久化，删除移除快照与归档标记", async () => {
    const directory = await mkdtemp(join(tmpdir(), "goal-store-management-"));
    try {
        const store = new JsonFileGoalStore(directory);
        await store.save(createCatalogGoal("goal-terminal", "completed"));
        await store.save(createCatalogGoal("goal-running", "running"));
        assert.equal(await store.setArchived("goal-running", true), false);
        assert.equal(await store.setArchived("goal-terminal", true), true);
        const reopened = new JsonFileGoalStore(directory);
        assert.equal((await reopened.listHistory()).entries.find((entry) => entry.goalId === "goal-terminal")?.archived, true);
        assert.equal(await reopened.setArchived("goal-terminal", false), true);
        assert.equal((await store.listHistory()).entries.find((entry) => entry.goalId === "goal-terminal")?.archived, undefined);
        await store.setArchived("goal-terminal", true);
        await store.save(createCatalogGoal("goal-terminal", "running"));
        assert.equal((await reopened.listHistory()).entries.find((entry) => entry.goalId === "goal-terminal")?.archived, undefined);
        await store.save(createCatalogGoal("goal-terminal", "completed"));
        await store.setArchived("goal-terminal", true);
        await assert.rejects(store.deleteTerminal("goal-running"), /goal_not_terminal/);
        assert.equal(await store.deleteTerminal("goal-terminal"), true);
        assert.equal(await reopened.restore("goal-terminal"), undefined);
        assert.equal((await reopened.listHistory()).entries.some((entry) => entry.goalId === "goal-terminal"), false);
        assert.equal((await readdir(directory)).some((name) => name.endsWith(".archived")), false);
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

test("JsonFileGoalStore.listHistory 跳过无法解码的历史快照并上报数量", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kai-goal-store-history-legacy-"));

    try {
        const store = new JsonFileGoalStore(directory);
        await store.save(createCatalogGoal("goal-readable", "running"));

        // 旧版本快照：JSON 合法但不符合当前快照协议。
        await writeFile(
            join(directory, `${Buffer.from("goal-legacy", "utf8").toString("base64url")}.json`),
            JSON.stringify({ id: "goal-legacy", state: { messages: [] } }),
            "utf8",
        );

        const history = await store.listHistory();
        assert.equal(history.entries.length, 1);
        assert.equal(history.entries[0]?.goalId, "goal-readable");
        assert.equal(history.unreadableCount, 1);

        // 可恢复列表保持严格语义：不可解码快照仍然阻止整次查询。
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
        trajectoryStore: trajectoryStoreFor(blockedStore),
            store: blockedStore,
            executor: createStepExecutor(async () => {
                executeCalls += 1;
                return {
                    kind: "complete" as const,
                    completionEvidence: [],
                    summary: "不应执行",
                };
            }, async () => ({ kind: "accept" })),
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
        trajectoryStore: trajectoryStoreFor(store),
            store,
            executor: createStepExecutor(async ({ goal: currentGoal }: StepExecutionInput) => {
                receivedGoals.push(currentGoal);
                return {
                    kind: "complete" as const,
                    completionEvidence: [],
                    summary: "跨进程恢复后完成",
                };
            }, async () => ({ kind: "accept" })),
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
                    testUserMessage("恢复后的输入", { goal }),
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
        assert.deepEqual(messageOutline(latest?.state.messages ?? []), [
            ...messageOutline(goal.state.messages),
            { role: "user", content: "恢复后的输入" },
            {
                role: "assistant",
                content: "跨进程恢复后完成",
                purpose: "answer",
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
            completionCriteria: [],
            profile: { ...profile, toolIds: ["read_file"] },
            runId: "run-cross-action",
        });
        const runningResult = transition(initial.state.run, { kind: "start" });

        if (!runningResult.ok) {
            assert.fail(runningResult.error.message);
        }

        const stagedResult = transition(runningResult.state, {
            kind: "stage_action",
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

test("JsonFileGoalStore creates atomically without replacing occupied or unreadable snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "goal-create-"));
    try {
        const first = new JsonFileGoalStore(directory);
        const second = new JsonFileGoalStore(directory);
        const goal = createSnapshot();
        const results = await Promise.all([first.createForDelivery("first", goal), second.createForDelivery("second", goal)]);
        assert.deepEqual([...results].sort(), [false, true]);
        assert.equal((await first.restore(goal.id))?.id, goal.id);
        const path = snapshotPath(directory, goal.id);
        await writeFile(path, "unreadable old data", "utf8");
        assert.equal(await first.createForDelivery("third", goal), false);
        assert.equal(await readFile(path, "utf8"), "unreadable old data");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("JsonFileGoalStore removes its temporary file when exclusive creation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "goal-create-failure-"));
    try {
        const store = new JsonFileGoalStore(directory, {
            link: async () => { throw new Error("injected link failure"); },
        });
        await assert.rejects(store.createForDelivery("delivery", createSnapshot()), /injected link failure/);
        assert.deepEqual(await readdir(directory), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("delivery creation verifies an interrupted publication by file identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "goal-create-recovery-"));
    try {
        const goal = createSnapshot();
        let count = 0;
        const interrupted = new JsonFileGoalStore(directory, {
            link: async (source, target) => {
                const fs = await import("node:fs/promises");
                await fs.link(source, target);
                count++;
                if (count === 2) throw new Error("response lost after publication");
            },
        });
        await assert.rejects(interrupted.createForDelivery("delivery-1", goal), /response lost/);
        const recovered = new JsonFileGoalStore(directory);
        assert.equal(await recovered.createForDelivery("delivery-1", goal), true);
        assert.equal((await recovered.restore(goal.id))?.id, goal.id);
        assert.equal(await recovered.createForDelivery("delivery-2", goal), false);
        await recovered.releaseCreationIntent("delivery-1");
        await recovered.releaseCreationIntent("delivery-2");
    } finally { await rm(directory, { recursive: true, force: true }); }
});
