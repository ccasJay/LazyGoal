import assert from "node:assert/strict";
import { access, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    CliConfigurationError,
    ConversationBudgetConfigurationError,
    createCompositionRoot,
    parseCliArgs,
    readConversationCharBudget,
    readLlmConfig,
    runCli,
} from "../src/cli";
import { AgentProfileConfigurationError } from "../../storage/src/index";
import {
    DEFAULT_PROFILE_FILE,
    writeDefaultProfile,
} from "./profile-fixture";

function environment(): NodeJS.ProcessEnv {
    return {
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: "https://llm.example.test/v1",
        LLM_MODEL: "test-model",
    };
}

test("parseCliArgs routes the three supported entry intents", () => {
    assert.deepEqual(parseCliArgs([]), { kind: "create" });
    assert.deepEqual(parseCliArgs(["-c"]), { kind: "continueLatest" });
    assert.deepEqual(parseCliArgs(["resume"]), { kind: "resume" });
    assert.throws(
        () => parseCliArgs(["-c", "resume"]),
        /Invalid command line arguments/,
    );
});

test("readLlmConfig reports every missing variable before creating a root", () => {
    assert.throws(
        () => readLlmConfig({ LLM_API_KEY: "  " }),
        (error: unknown) => {
            assert.ok(error instanceof CliConfigurationError);
            assert.deepEqual(error.missing, [
                "LLM_API_KEY",
                "LLM_BASE_URL",
                "LLM_MODEL",
            ]);
            assert.match(error.message, /LLM_API_KEY, LLM_BASE_URL, LLM_MODEL/);
            return true;
        },
    );
});

test("readConversationCharBudget 使用默认值并接受正安全整数覆盖", () => {
    assert.equal(readConversationCharBudget({}), 196608);
    assert.equal(readConversationCharBudget({
        LLM_CONVERSATION_CHAR_BUDGET: "   ",
    }), 196608);
    assert.equal(readConversationCharBudget({
        LLM_CONVERSATION_CHAR_BUDGET: " 4096 ",
    }), 4096);
    assert.equal(readConversationCharBudget({
        LLM_CONVERSATION_CHAR_BUDGET: "01",
    }), 1);
});

test("readConversationCharBudget 拒绝所有非正安全整数形式", () => {
    for (const value of [
        "0",
        "-1",
        "1.5",
        "1e3",
        "+1",
        "not-a-number",
        String(Number.MAX_SAFE_INTEGER + 1),
    ]) {
        assert.throws(
            () => readConversationCharBudget({
                LLM_CONVERSATION_CHAR_BUDGET: value,
            }),
            (error: unknown) => {
                assert.ok(error instanceof ConversationBudgetConfigurationError);
                assert.equal(
                    error.code,
                    "INVALID_LLM_CONVERSATION_CHAR_BUDGET",
                );
                return true;
            },
        );
    }
});

test("非法 Conversation 预算在访问工作区或创建 Goal 数据前失败", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-budget-"));
    const invalidEnv = {
        ...environment(),
        LLM_CONVERSATION_CHAR_BUDGET: "0",
    };

    await assert.rejects(
        createCompositionRoot({ cwd: workspace, env: invalidEnv }),
        (error: unknown) => error instanceof ConversationBudgetConfigurationError,
    );
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("非法 Model Context 预算在创建 Goal Store 或 Sidecar 前失败", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-model-budget-"));
    await writeDefaultProfile(workspace);

    await assert.rejects(
        createCompositionRoot({
            cwd: workspace,
            env: environment(),
            modelContextBudget: { modelInputBudget: 0 },
        }),
        (error: unknown) => error instanceof RangeError,
    );
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
    await assert.rejects(access(join(workspace, ".lazygoal", "context-sidecars")));
});

test("missing default Profile fails before creating the workspace Store", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-profile-missing-"));

    await assert.rejects(
        createCompositionRoot({ cwd: workspace, env: environment() }),
        (error: unknown) => error instanceof AgentProfileConfigurationError
            && /Profile 文件不存在/.test(error.message),
    );
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("an unregistered Profile Tool fails before creating a Goal Store", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-profile-tool-"));
    await writeDefaultProfile(workspace, {
        ...DEFAULT_PROFILE_FILE,
        toolIds: ["missing_tool"],
    });

    await assert.rejects(
        createCompositionRoot({ cwd: workspace, env: environment() }),
        (error: unknown) => error instanceof AgentProfileConfigurationError
            && /未注册的 Tool/.test(error.message),
    );
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
});

test("composition root isolates workspace, freezes the default identity, and does not write a Goal", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-"));
    await writeDefaultProfile(workspace);
    const root = await createCompositionRoot({
        cwd: workspace,
        env: environment(),
        goalIdGenerator: () => "goal-test",
        runIdGenerator: () => "run-test",
    });

    assert.equal(root.workspaceRoot, await realpath(workspace));
    assert.equal(root.goalsDirectory, join(root.workspaceRoot, ".lazygoal", "goals"));
    assert.equal(
        root.trajectoriesDirectory,
        join(root.workspaceRoot, ".lazygoal", "trajectories"),
    );
    assert.equal(
        root.tracesDirectory,
        join(root.workspaceRoot, ".lazygoal", "traces"),
    );
    assert.equal(
        root.contextSidecarsDirectory,
        join(root.workspaceRoot, ".lazygoal", "context-sidecars"),
    );
    assert.ok(root.trajectoryStore !== undefined);
    assert.ok(root.sidecarStore !== undefined);
    assert.ok(root.trajectoryContextAssembler !== undefined);
    assert.equal(root.modelInputEstimator.unit, "character");
    assert.equal(root.modelContextPolicy.modelInputBudget, 196608);
    assert.ok(root.traceSink !== undefined);
    assert.equal(root.conversationCharBudget, 196608);
    assert.ok(root.contextCompactor !== undefined);
    assert.deepEqual(root.profile, {
        id: DEFAULT_PROFILE_FILE.id,
        name: DEFAULT_PROFILE_FILE.name,
        description: DEFAULT_PROFILE_FILE.description,
        systemPrompt: DEFAULT_PROFILE_FILE.systemPrompt,
        instructions: DEFAULT_PROFILE_FILE.instructions,
        toolIds: DEFAULT_PROFILE_FILE.toolIds,
    });
    assert.ok(root.profiles.get("default") !== undefined);
    assert.equal(root.profiles.get("other"), undefined);
    assert.equal(root.goalIdGenerator(), "goal-test");
    assert.equal(root.runIdGenerator(), "run-test");
    assert.deepEqual(await root.store.listResumable(), []);
    await assert.rejects(access(join(root.workspaceRoot, ".lazygoal", "goals")));
});

test("Composition Root 使用覆盖预算创建共享 Compactor", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-budget-root-"));
    await writeDefaultProfile(workspace);
    const root = await createCompositionRoot({
        cwd: workspace,
        env: {
            ...environment(),
            LLM_CONVERSATION_CHAR_BUDGET: "32",
        },
    });

    assert.equal(root.conversationCharBudget, 32);
    assert.deepEqual(
        await root.contextCompactor.compact([
            { items: ["old"], characterCount: 32 },
            { items: ["new"], characterCount: 1 },
        ]),
        [{ items: ["new"], characterCount: 1 }],
    );
});

test("missing CLI configuration exits before touching the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-missing-"));
    const errors: string[] = [];
    const exitCode = await runCli([], {
        cwd: workspace,
        env: {},
        writeError: (message) => errors.push(message),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [
        "Missing required environment variable(s): LLM_API_KEY, LLM_BASE_URL, LLM_MODEL",
    ]);
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("-c reports an empty project without creating a Goal or rendering the TUI", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-empty-"));
    await writeDefaultProfile(workspace);
    const errors: string[] = [];
    let rendered = false;
    const exitCode = await runCli(["-c"], {
        cwd: workspace,
        env: environment(),
        writeError: (message) => errors.push(message),
        render: (() => {
            rendered = true;
            throw new Error("render should not be called");
        }) as never,
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ["No resumable Goal was found"]);
    assert.equal(rendered, false);
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
});

test("CLI handles SIGINT through one shutdown path and requests exit 130", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-sigint-"));
    await writeDefaultProfile(workspace);
    const exitCodes: number[] = [];
    let waitCalls = 0;
    let unmountCalls = 0;
    const exitPort = {
        exit(code: number): void {
            exitCodes.push(code);
        },
    };
    const exitInstance = {
        unmount(): void {
            unmountCalls += 1;
        },
        async waitUntilExit(): Promise<void> {
            waitCalls += 1;
            if (waitCalls === 1) {
                process.emit("SIGINT");
            }
        },
    };
    const errors: string[] = [];
    const exitCode = await runCli([], {
        cwd: workspace,
        env: environment(),
        exitPort,
        writeError: (message) => errors.push(message),
        render: (() => exitInstance) as never,
    });

    assert.equal(exitCode, 130);
    assert.deepEqual(exitCodes, [130]);
    assert.equal(unmountCalls, 1);
    assert.equal(waitCalls, 2);
    assert.deepEqual(errors, []);
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
});

test("composition root shares the checkpoint gate and abort signal with shutdown", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-root-shutdown-"));
    await writeDefaultProfile(workspace);
    const exitCodes: number[] = [];
    const root = await createCompositionRoot({
        cwd: workspace,
        env: environment(),
        exitPort: { exit: (code) => { exitCodes.push(code); } },
        gracePeriodMs: 0,
    });

    await root.shutdownCoordinator.shutdown();

    assert.equal(root.checkpointStore.isFrozen, true);
    assert.equal(root.abortController.signal.aborted, true);
    assert.deepEqual(exitCodes, [130]);
    await assert.rejects(
        root.checkpointStore.save({} as never),
        (error: unknown) => typeof error === "object"
            && error !== null
            && "code" in error
            && error.code === "CHECKPOINT_GATE_FROZEN",
    );
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
});
