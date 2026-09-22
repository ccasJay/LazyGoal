import { LlmConfigurationError, readLlmConfig } from "../../llm/src/config";
import assert from "node:assert/strict";
import { access, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    ConversationBudgetConfigurationError,
    createCompositionRoot,
    mountTuiApp,
    parseCliArgs,
    readConversationCharBudget,
    runCli,
} from "../src/cli";
import { SessionController } from "../src/index";
import {
    createGoal,
    createToolRegistration,
    InMemoryToolRegistry,
    type AgentProfile,
    type ToolPolicy,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures.js";
import { ReadFileTool, READ_FILE_TOOL_ID } from "../../tools/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import { AgentProfileConfigurationError } from "../../storage/src/index";
import { resolveLazyGoalHomePaths, resolveWorkspaceHomePaths } from "../../llm/src/xdg";
import {
    DEFAULT_PROFILE_FILE,
    writeDefaultProfile,
} from "./profile-fixture";

function environment(homeDirectory?: string): NodeJS.ProcessEnv {
    return {
        LLM_PROVIDER: "openai",
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: "https://llm.example.test/v1",
        LLM_MODEL: "test-model",
        LLM_STRUCTURED_OUTPUT_MODE: "strict",
        ...(homeDirectory === undefined ? {} : { LAZYGOAL_HOME: homeDirectory }),
    };
}

test("parseCliArgs routes the supported entry intents", () => {
    assert.deepEqual(parseCliArgs([]), { kind: "home" });
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
            assert.ok(error instanceof LlmConfigurationError);
            assert.deepEqual(error.missing, [
                "LLM_PROVIDER",
                "LLM_MODEL",
                "LLM_API_KEY",
            ]);
            assert.match(error.message, /LLM_PROVIDER, LLM_MODEL, LLM_API_KEY/);
            return true;
        },
    );
});

test("readLlmConfig accepts both strict and prompt_only modes", () => {
    const strictConfig = readLlmConfig({
        LLM_PROVIDER: "openai",
        LLM_API_KEY: "key",
        LLM_BASE_URL: "https://llm.example.test/v1",
        LLM_MODEL: "model",
        LLM_STRUCTURED_OUTPUT_MODE: "strict",
    });
    assert.equal(strictConfig.structuredOutputMode, "strict");

    const promptOnlyConfig = readLlmConfig({
        LLM_PROVIDER: "openai",
        LLM_API_KEY: "key",
        LLM_BASE_URL: "https://llm.example.test/v1",
        LLM_MODEL: "model",
        LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
    });
    assert.equal(promptOnlyConfig.structuredOutputMode, "prompt_only");
});

test("readLlmConfig rejects invalid LLM_STRUCTURED_OUTPUT_MODE", () => {
    assert.throws(
        () => readLlmConfig({
            LLM_PROVIDER: "openai",
            LLM_API_KEY: "key",
            LLM_BASE_URL: "https://llm.example.test/v1",
            LLM_MODEL: "model",
            LLM_STRUCTURED_OUTPUT_MODE: "auto",
        }),
        (error: unknown) => {
            assert.ok(error instanceof LlmConfigurationError);
            assert.equal(error.code, "INVALID_LLM_CONFIG");
            assert.match(error.message, /Invalid LLM_STRUCTURED_OUTPUT_MODE "auto"/);
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
        ...environment(join(workspace, "lazygoal-home")),
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
            env: environment(join(workspace, "lazygoal-home")),
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
        createCompositionRoot({ cwd: workspace, env: environment(join(workspace, "lazygoal-home")) }),
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
        createCompositionRoot({ cwd: workspace, env: environment(join(workspace, "lazygoal-home")) }),
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
        env: environment(join(workspace, "lazygoal-home")),
        goalIdGenerator: () => "goal-test",
        runIdGenerator: () => "run-test",
    });

    assert.equal(root.workspaceRoot, await realpath(workspace));
    const expectedHome = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: join(workspace, "lazygoal-home") });
    const expectedWorkspace = await resolveWorkspaceHomePaths(expectedHome, root.workspaceRoot);
    assert.equal(root.goalsDirectory, expectedWorkspace.goalsDirectory);
    assert.equal(root.trajectoriesDirectory, expectedWorkspace.trajectoriesDirectory);
    assert.equal(root.tracesDirectory, expectedWorkspace.tracesDirectory);
    assert.equal(root.contextSidecarsDirectory, expectedWorkspace.contextSidecarsDirectory);
    assert.ok(root.trajectoryStore !== undefined);
    assert.equal((root as any).sidecarStore, undefined);
    assert.equal((root as any).contextMaintenanceWorker, undefined);
    assert.ok(root.retrievalIndexStore !== undefined);
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
            ...environment(join(workspace, "lazygoal-home")),
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
        env: { LAZYGOAL_HOME: join(workspace, "lazygoal-home") },
        writeError: (message) => errors.push(message),
    });

    assert.equal(exitCode, 1);
    assert.equal(errors.length, 1);
    assert.match(
        errors[0] ?? "",
        /缺少必要的 LLM 配置项|Missing required environment variable/,
    );
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("runCli rejects invalid LLM_STRUCTURED_OUTPUT_MODE before Store or Goal side effects", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-invalid-mode-"));
    const errors: string[] = [];
    const exitCode = await runCli([], {
        cwd: workspace,
        env: {
            LLM_PROVIDER: "openai",
            LLM_API_KEY: "test-key",
            LLM_BASE_URL: "https://llm.example.test/v1",
            LLM_MODEL: "test-model",
            LLM_STRUCTURED_OUTPUT_MODE: "unsupported_mode",
            LAZYGOAL_HOME: join(workspace, "lazygoal-home"),
        },
        writeError: (message) => errors.push(message),
    });

    assert.equal(exitCode, 1);
    assert.match(errors[0] ?? "", /Invalid LLM_STRUCTURED_OUTPUT_MODE "unsupported_mode"/);
    await assert.rejects(access(join(workspace, ".lazygoal")));
});

test("-c reports an empty project without creating a Goal or rendering the TUI", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-empty-"));
    await writeDefaultProfile(workspace);
    const errors: string[] = [];
    let rendered = false;
    const exitCode = await runCli(["-c"], {
        cwd: workspace,
        env: environment(join(workspace, "lazygoal-home")),
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
        env: environment(join(workspace, "lazygoal-home")),
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
        env: environment(join(workspace, "lazygoal-home")),
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

test("provider and catalog failures precede workspace access and Goal creation", async () => {
    for (const override of [
        { LLM_PROVIDER: "anthropic", LLM_BASE_URL: "" },
        { LLM_MODEL: "not-in-catalog", LLM_STRUCTURED_OUTPUT_MODE: "prompt_only" },
        { LLM_MODEL: "gpt-4.1-mini", LLM_STRUCTURED_OUTPUT_MODE: "prompt_only", LLM_MAX_OUTPUT_TOKENS: "999999999" },
    ]) {
        await assert.rejects(createCompositionRoot({
            cwd: "/nonexistent/lazygoal-provider-configuration-test", env: { ...environment(join("/nonexistent/lazygoal-provider-configuration-test", "home")), ...override },
        }), LlmConfigurationError);
    }
});

test("createCompositionRoot 接受外部显式依赖注入且无需磁盘 Profile 与 LLM 环境变量", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-explicit-"));
    const customTool = new ReadFileTool(workspace);
    const customRegistry = new InMemoryToolRegistry([createToolRegistration(customTool)]);
    const customProfile: AgentProfile = {
        id: "custom-sandbox",
        name: "Custom Sandbox Profile",
        description: "Sandbox profile for testing",
        systemPrompt: "You are in sandbox",
        instructions: ["Follow rules"],
        toolIds: [READ_FILE_TOOL_ID],
    };
    const customPolicy: ToolPolicy = {
        evaluate: () => "allow",
    };
    const customAdapter: LLMAdapter = {
        chat: async () => ({
            content: "ok",
            usage: { inputTokens: 0, outputTokens: 0 },
        }),
    } as unknown as LLMAdapter;

    const root = await createCompositionRoot({
        cwd: workspace,
        env: { LAZYGOAL_HOME: join(workspace, "lazygoal-home") }, // 空环境变量，不含 LLM 配置
        adapter: customAdapter,
        profile: customProfile,
        toolRegistry: customRegistry,
        toolPolicy: customPolicy,
    });

    assert.equal(root.profile.id, "custom-sandbox");
    assert.deepEqual(root.profile.toolIds, [READ_FILE_TOOL_ID]);
    assert.equal(root.toolRegistry.get(READ_FILE_TOOL_ID)?.definition.id, READ_FILE_TOOL_ID);
    assert.equal(root.toolRegistry.get("write_file"), undefined); // 宿主工具未混入
    assert.equal(root.toolPolicy, customPolicy);
    assert.equal(root.adapter, customAdapter);
    // 验证未创建默认 profile
    await assert.rejects(access(join(workspace, "lazygoal-home", "agent-profiles", "default.json")));
});

test("显式注入的 Profile 引用了未注册的 Tool 时快速失败", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-explicit-fail-"));
    const customTool = new ReadFileTool(workspace);
    const customRegistry = new InMemoryToolRegistry([createToolRegistration(customTool)]);
    const customProfile: AgentProfile = {
        id: "custom-sandbox-invalid",
        name: "Invalid Profile",
        description: "Invalid",
        systemPrompt: "Invalid",
        instructions: ["Invalid"],
        toolIds: [READ_FILE_TOOL_ID, "unregistered_tool"],
    };

    await assert.rejects(
        createCompositionRoot({
            cwd: workspace,
            env: { LAZYGOAL_HOME: join(workspace, "lazygoal-home") },
            adapter: {} as LLMAdapter,
            profile: customProfile,
            toolRegistry: customRegistry,
        }),
        (error: unknown) => error instanceof AgentProfileConfigurationError
            && /toolIds 引用了未注册的 Tool "unregistered_tool"/.test(error.message),
    );
    await assert.rejects(access(join(workspace, ".lazygoal", "goals")));
});

test("mountTuiApp 挂载控制器并支持正常退出与 unmount", async () => {
    let unmounted = false;
    let exitWaitCalls = 0;
    const mockController = {
        getSnapshot: () => ({ screen: "session", busy: false }),
        subscribe: () => () => {},
    } as unknown as SessionController;

    const mockRender = (() => ({
        unmount: () => { unmounted = true; },
        waitUntilExit: async () => { exitWaitCalls += 1; },
    })) as never;

    const handle = mountTuiApp({
        controller: mockController,
        onShutdown: async () => {},
        render: mockRender,
    });

    assert.equal(unmounted, false);
    handle.unmount();
    assert.equal(unmounted, true);
    await handle.waitUntilExit();
    assert.equal(exitWaitCalls, 1);
});

test("createCompositionRoot 装配 NotifyingGoalStore 并注入 SessionController", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-cli-notifying-"));
    await writeDefaultProfile(workspace);

    const root = await createCompositionRoot({
        cwd: workspace,
        env: environment(join(workspace, "lazygoal-home")),
        adapter: {} as LLMAdapter,
    });

    assert.ok(root.notifyingStore !== undefined);

    let notificationFired = false;
    const unsubscribe = root.notifyingStore.onSave(() => {
        notificationFired = true;
    });

    const testGoal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-notify-test",
        intent: "test intent",
        profile: { id: "default", systemPrompt: "test", instructions: [], toolIds: [] },
        runId: "run-notify-test",
    });

    await root.checkpointStore.save(testGoal);
    assert.equal(notificationFired, true);

    unsubscribe();
    root.controller.dispose();
});
