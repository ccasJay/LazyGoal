import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import React, { useRef, useSyncExternalStore } from "react";
import { useInput, render as inkRender } from "ink";

import {
    CheckpointGateGoalStore,
    createToolRegistration,
    DEFAULT_WORKING_MEMORY_LIMITS,
    ManagedResourceRegistry,
    ProcessExitPort,
    ShutdownCoordinator,
    GoalCoordinator,
    InMemoryToolRegistry,
    InlineScheduler,
    Runner,
    TrajectoryCheckpointCommitter,
    readTrajectoryAtSnapshot,
    launch,
    type AgentProfile,
    type AgentProfileRegistry,
    type GoalCatalog,
    type GoalStore,
    type ExitPort,
    type GoalProtocolValidator,
    type PreparationExecutor,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
    type ToolPolicy,
    type WorkingMemoryLimits,
    IndexedContextLookupService,
} from "../../runtime/src/index";
import {
    AgentProfileConfigurationError,
    JsonFileDiagnosticTraceSink,
    JsonFileAgentProfileStore,
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
    JsonFileContextRetrievalIndexStore,
} from "../../storage/src/index";
import {
    createDefaultModelContextBudgetPolicy,
    createDefaultPromptBundleRenderer,
    createDefaultPromptBundleProtocolValidator,
    createModelContextBudgetPolicy,
    DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    DropOldestContextCompactor,
    LLMPreparationExecutor,
    LLMStepExecutor,
    resolveModelInputEstimator,
    createModelCapabilities,
    ModelCapabilitiesError,
    resolveTokenEstimatorEncoding,
    type ModelCapabilities,
    type ModelContextBudgetPolicy,
    type ModelContextBudgetPolicyInput,
    type ModelInputEstimator,
    TrajectoryModelContextAssembler,
} from "../../agent/src/index";
import { readLlmConfig, type LlmConfig } from "../../llm/src/config";
import { loadRuntimeConfig } from "../../llm/src/config-loader";
import { resolveXdgPaths } from "../../llm/src/xdg";
import { loadProfileToml } from "../../llm/src/toml-config";
import { createLlmAdapter } from "../../llm/src/factory";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import {
    BashTool,
    EditFileTool,
    GREP_TOOL_ID,
    GrepTool,
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WriteFileTool,
} from "../../tools/src/index";
import {
    SessionController,
    TuiApp,
    projectTrajectoryEvents,
    AggregatedGoalStore,
    AggregatedTrajectoryStore,
} from "./index";
import { StatusSpinner } from "./status-spinner";
import type { SessionLauncher, UiScreen } from "./types";

/** 默认 Profile 的稳定标识。 */
const DEFAULT_PROFILE_ID = "default";

/**
 * 组合根的默认 Tool 授权策略：只读 Tool 自动放行，其余全部需要批准。
 *
 * @remarks
 * fail-closed：只有显式列入白名单的只读 Tool（当前为 `read_file` 与
 * `grep`）会被 `allow` 自动放行；`write_file`、`edit_file`、`bash` 以及
 * 任何未识别的 Tool 都返回 `require_approval`，由 Runner 保存等待中的
 * Action 并交给用户批准或拒绝。该策略不执行 Tool、不推进 Run，也不持久化
 * 授权。
 *
 * @example
 * ```ts
 * const policy = createDefaultToolPolicy();
 * policy.evaluate({ goal, action, tool: { id: "bash" } }); // "require_approval"
 * ```
 */
export function createDefaultToolPolicy(): ToolPolicy {
    const autoAllowedToolIds = new Set([READ_FILE_TOOL_ID, GREP_TOOL_ID]);

    return {
        evaluate: ({ tool }) =>
            autoAllowedToolIds.has(tool.id)
                ? "allow"
                : "require_approval",
    };
}


/**
 * 表示 Conversation 字符预算无法在启动期安全解析。
 *
 * @remarks
 * 错误不包含环境变量原值，只提供稳定错误码和变量名。Composition Root 在解析
 * 工作区、加载 Profile 或创建任何运行时对象之前抛出该错误。
 *
 * @example
 * ```ts
 * try {
 *     readConversationCharBudget({ LLM_CONVERSATION_CHAR_BUDGET: "0" });
 * } catch (error) {
 *     if (error instanceof ConversationBudgetConfigurationError) {
 *         console.error(error.code);
 *     }
 * }
 * ```
 */
export class ConversationBudgetConfigurationError extends Error {
    /** 供 CLI 与自动化测试识别的稳定错误码。 */
    readonly code = "INVALID_LLM_CONVERSATION_CHAR_BUDGET" as const;
    /** 配置来源的稳定环境变量名。 */
    readonly variableName = "LLM_CONVERSATION_CHAR_BUDGET" as const;

    constructor() {
        super(
            "LLM_CONVERSATION_CHAR_BUDGET must be a positive safe integer",
        );
        this.name = "ConversationBudgetConfigurationError";
    }
}

/**
 * 读取单轮模型请求可使用的 Conversation 字符预算。
 *
 * @param env - 要读取的环境对象；默认使用当前进程环境。
 * @returns 缺失或空白时返回 `196608`，否则返回已校验的正安全整数覆盖值。
 * @throws `ConversationBudgetConfigurationError` 当非空值不是十进制正安全整数。
 *
 * @example
 * ```ts
 * readConversationCharBudget({}); // 196608
 * readConversationCharBudget({ LLM_CONVERSATION_CHAR_BUDGET: "4096" });
 * ```
 */
export function readConversationCharBudget(
    env: NodeJS.ProcessEnv = process.env,
): number {
    const raw = env.LLM_CONVERSATION_CHAR_BUDGET;

    if (raw === undefined || raw.trim() === "") {
        return DEFAULT_LLM_CONVERSATION_CHAR_BUDGET;
    }

    const normalized = raw.trim();

    if (!/^\d+$/.test(normalized)) {
        throw new ConversationBudgetConfigurationError();
    }

    const budget = Number(normalized);

    if (!Number.isSafeInteger(budget) || budget <= 0) {
        throw new ConversationBudgetConfigurationError();
    }

    return budget;
}

/** 读取当前模型上下文使用的能力配置。 */
export function readModelCapabilities(
    env: NodeJS.ProcessEnv = process.env,
    estimator?: ModelInputEstimator,
): ModelCapabilities | undefined {
    const windowRaw = env.LLM_CONTEXT_WINDOW_TOKENS;
    const outputRaw = env.LLM_MAX_OUTPUT_TOKENS;
    const encoding = env.LLM_TOKENIZER_ENCODING?.trim();
    if (
        (windowRaw === undefined || windowRaw.trim() === "")
        && (outputRaw === undefined || outputRaw.trim() === "")
        && !encoding
    ) {
        return undefined;
    }
    const parse = (raw: string | undefined, name: string): number => {
        if (raw === undefined || !/^\d+$/.test(raw.trim())) {
            throw new ModelCapabilitiesError(`${name} must be a positive safe integer`);
        }
        const value = Number(raw.trim());
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new ModelCapabilitiesError(`${name} must be a positive safe integer`);
        }
        return value;
    };
    if (!encoding && estimator?.unit !== "token") {
        throw new ModelCapabilitiesError(
            "LLM_TOKENIZER_ENCODING is required when the estimator does not provide token counts",
        );
    }
    return createModelCapabilities({
        contextWindowTokens: parse(windowRaw, "LLM_CONTEXT_WINDOW_TOKENS"),
        maxOutputTokens: parse(outputRaw, "LLM_MAX_OUTPUT_TOKENS"),
        tokenEstimator: estimator?.unit === "token"
            ? estimator
            : resolveTokenEstimatorEncoding(encoding!),
    });
}

/** CLI 支持的入口意图。 */
export type CliCommand =
    | { readonly kind: "home" }
    | { readonly kind: "create" }
    | { readonly kind: "continueLatest" }
    | { readonly kind: "resume" }
    | { readonly kind: "inspect"; readonly goalId?: string; readonly dir?: string };

/**
 * 使用 Node `parseArgs` 解析 CLI 参数。
 *
 * @param argv - 不包含 Node 和 bin 路径的参数数组。
 * @returns 空参数、`-c`、`resume` 或 `inspect [--dir <dir>] [goalId]` 对应的入口意图。
 * @throws 参数未知、重复或组合不合法时抛出带英文用法的 `Error`。
 * @example
 * ```ts
 * parseCliArgs([]); // { kind: "home" }
 * parseCliArgs(["-c"]); // { kind: "continueLatest" }
 * parseCliArgs(["inspect"]); // { kind: "inspect" }
 * parseCliArgs(["inspect", "goal-1"]); // { kind: "inspect", goalId: "goal-1" }
 * parseCliArgs(["inspect", "--dir", ".lazygoal/benchmarks/run", "goal-1"]); // { kind: "inspect", goalId: "goal-1", dir: ".lazygoal/benchmarks/run" }
 * ```
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
    let parsed: ReturnType<typeof parseArgs>;

    try {
        parsed = parseArgs({
            args: [...argv],
            options: {
                continue: { type: "boolean", short: "c" },
                dir: { type: "string" },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid command line arguments: ${message}`);
    }

    const hasContinue = parsed.values.continue === true;
    const customDir = typeof parsed.values.dir === "string" && parsed.values.dir.trim().length > 0
        ? parsed.values.dir.trim()
        : undefined;

    if (hasContinue && parsed.positionals.length === 0 && customDir === undefined) {
        return { kind: "continueLatest" };
    }

    if (!hasContinue && parsed.positionals.length === 1
        && parsed.positionals[0] === "resume" && customDir === undefined) {
        return { kind: "resume" };
    }

    if (!hasContinue && parsed.positionals.length >= 1
        && parsed.positionals[0] === "inspect") {
        if (parsed.positionals.length === 1) {
            return { kind: "inspect", ...(customDir ? { dir: customDir } : {}) };
        }
        const goalId = parsed.positionals[1];
        if (parsed.positionals.length === 2 && goalId !== undefined) {
            return { kind: "inspect", goalId, ...(customDir ? { dir: customDir } : {}) };
        }
        throw new Error("Invalid command line arguments: Usage: lazygoal inspect [--dir <dir>] [goalId]");
    }

    if (!hasContinue && parsed.positionals.length === 0 && customDir === undefined) {
        return { kind: "home" };
    }

    throw new Error("Invalid command line arguments: Usage: lazygoal [-c|resume|inspect [--dir <dir>] [goalId]]");
}

/**
 * Composition Root 构造选项。
 *
 * @remarks
 * `cwd` 和 `env` 主要用于测试隔离；生产调用省略它们时分别使用当前工作区
 * 和进程环境。Profile 从 `<workspaceRoot>/.lazygoal/profiles/default.json`
 * 加载；ID 生成器可注入确定性实现，但默认使用随机 UUID。
 *
 * @example
 * ```ts
 * const root = await createCompositionRoot({ cwd: "/workspace/project" });
 * ```
 */
export interface CompositionRootOptions {
    /** 用于解析 workspaceRoot 的当前工作目录。 */
    readonly cwd?: string;
    /**
     * 独立持久化根目录。
     *
     * @remarks
     * 传入时，goals, trajectories, traces, context-sidecars 将被重定向到该目录下；
     * 省略时使用默认的 `<workspaceRoot>/.lazygoal`。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ dataDirectory: "/tmp/sandbox/attempt-1" });
     * ```
     */
    readonly dataDirectory?: string;
    /** 模型配置来源；默认读取 `process.env`。若传入显式 `adapter`，则不需要提供。 */
    readonly env?: NodeJS.ProcessEnv;
    /**
     * 显式注入的 LLMAdapter。
     *
     * @remarks
     * 传入时优先使用，跳过从环境变量中读取 LLM 配置。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ adapter: mockAdapter });
     * ```
     */
    readonly adapter?: LLMAdapter;
    /**
     * 显式注入的生效 Agent Profile。
     *
     * @remarks
     * 传入时优先使用，不再从磁盘加载默认 Profile 文件。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ profile: customProfile });
     * ```
     */
    readonly profile?: AgentProfile;
    /**
     * 显式注入的单进程 Tool Registry。
     *
     * @remarks
     * 传入时整体替代默认的五工具注册表，不与宿主工具合并。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ toolRegistry: customRegistry });
     * ```
     */
    readonly toolRegistry?: InMemoryToolRegistry;
    /**
     * 显式注入的 Tool 授权策略。
     *
     * @remarks
     * 省略时使用默认的 `createDefaultToolPolicy()`。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ toolPolicy: customPolicy });
     * ```
     */
    readonly toolPolicy?: ToolPolicy;
    /**
     * 显式注入的 Preparation 执行器。
     *
     * @remarks
     * 省略时使用默认的 `LLMPreparationExecutor`。
     *
     * @example
     * ```ts
     * const root = await createCompositionRoot({ preparationExecutor: customExecutor });
     * ```
     */
    readonly preparationExecutor?: PreparationExecutor;
    /**
     * 显式注入的根中止控制器。
     *
     * @remarks
     * 省略时内部新建一个 `AbortController`。
     *
     * @example
     * ```ts
     * const abortController = new AbortController();
     * const root = await createCompositionRoot({ abortController });
     * ```
     */
    readonly abortController?: AbortController;
    /** 新 Goal 的 ID 生成器；默认使用 `randomUUID`。 */
    readonly goalIdGenerator?: () => string;
    /** 新 Run 的 ID 生成器；默认使用 `randomUUID`。 */
    readonly runIdGenerator?: () => string;
    /** 关闭时请求退出的端口；默认调用 `process.exit(130)`。 */
    readonly exitPort?: ExitPort;
    /** 关闭流程的 grace period；默认 2 秒。 */
    readonly gracePeriodMs?: number;
    /** 可选的目标模型 Token 计量器；省略时使用 UTF-16 字符兜底。 */
    readonly modelInputEstimator?: ModelInputEstimator;
    /** 可选的总模型输入预算覆盖；非法配置在创建 Store 前失败。 */
    readonly modelContextBudget?: ModelContextBudgetPolicyInput;
    /** 可选初始屏幕；省略时默认为 "home"。 */
    readonly initialScreen?: UiScreen;
    /** 可选初始目标选择模式（"resume" 或 "inspect"），在 initialScreen 为 "goal_select" 时生效。 */
    readonly initialGoalSelectMode?: "resume" | "inspect";
    /** 可选的 Benchmark 评测输出根目录，默认自动发现 <workspaceRoot>/.lazygoal/benchmarks。 */
    readonly benchmarksDirectory?: string;
}

/**
 * 已完成项目级依赖装配的单 Goal 运行根。
 *
 * @remarks
 * 所有 Runtime、Tool 和 Controller 共享同一个 workspace 级 Store、Adapter
 * 和 Profile Registry；Store 目录是 `<workspaceRoot>/.lazygoal/goals`。
 * 构造根本身不会创建该目录或写入 Goal，第一次写入只会由合法 `create` 命令
 * 触发。一个根只暴露一个 SessionController，因而一个进程只推进一个 Goal。
 *
 * @example
 * ```ts
 * const root = await createCompositionRoot();
 * await root.controller.dispatch({ kind: "create", intent: "Inspect the repo" });
 * ```
 */
export interface CompositionRoot {
    /** `realpath(process.cwd())` 得到的工作区根。 */
    readonly workspaceRoot: string;
    /** 当前使用的持久化根目录（默认为 `<workspaceRoot>/.lazygoal`）。 */
    readonly dataDirectory: string;
    /** 项目级 Goal 快照目录。 */
    readonly goalsDirectory: string;
    /** 项目级 Domain Event JSONL 目录。 */
    readonly trajectoriesDirectory: string;
    /** 项目级 Diagnostic Trace JSONL 目录。 */
    readonly tracesDirectory: string;
    /** 项目级可删除 Warm Context Sidecar 目录。 */
    readonly contextSidecarsDirectory: string;
    /** 已校验的供应商、模型、显式凭据及固定输出模式；若显式注入 adapter 且未配置环境变量则可能为 undefined。 */
    readonly llmConfig?: LlmConfig;
    /** 启动期解析并由共享 Compactor 使用的 Conversation 字符预算。 */
    readonly conversationCharBudget: number;
    /** Preparation 与 Step Executor 共享的无状态上下文裁剪实例。 */
    readonly contextCompactor: DropOldestContextCompactor;
    /** 本轮 Hot/Warm 组装使用的只读输入计量器。 */
    readonly modelInputEstimator: ModelInputEstimator;
    /** 当前模型上下文预算使用的可选模型能力。 */
    readonly modelCapabilities?: ModelCapabilities;
    /** 本轮 Hot/Warm 使用的不可变预算策略。 */
    readonly modelContextPolicy: ModelContextBudgetPolicy;
    /** 从 committed Trajectory/Sidecar 组装分层模型上下文的无状态组件。 */
    readonly trajectoryContextAssembler: TrajectoryModelContextAssembler;
    /** Preparation 与执行阶段共享的供应商无关 Adapter；构造时固定输出模式。 */
    readonly adapter: LLMAdapter;
    /** 从当前 workspace Profile 文件或显式注入加载的生效 Agent Profile。 */
    readonly profile: AgentProfile;
    /** 只承载当前生效 Profile 的内存 Registry。 */
    readonly profiles: AgentProfileRegistry;
    /** 当前 workspaceRoot 下的只读文件 Tool；显式注入 registry 且未注册时为 undefined。 */
    readonly readFileTool?: ReadFileTool;
    /** 包含已注册 Tool 的单进程 Tool Registry。 */
    readonly toolRegistry: InMemoryToolRegistry;
    /** 当前生效的 Tool 授权策略。 */
    readonly toolPolicy: ToolPolicy;
    /** 当前生效的 Preparation 执行器。 */
    readonly preparationExecutor: PreparationExecutor;
    /** 同时实现 GoalStore 与 GoalCatalog 的项目级 Store。 */
    readonly store: GoalStore & GoalCatalog;
    /** 共享的事实事件追加与读取 Store。 */
    readonly trajectoryStore: TrajectoryStore;
    /** Coordinator 与 Runner 共享的当前 fielded BM25-lite Lookup 服务。 */
    readonly contextLookupService: IndexedContextLookupService;
    /** 可重建的 Conversation/Trajectory Retrieval Index Sidecar Store。 */
    readonly retrievalIndexStore: JsonFileContextRetrievalIndexStore;
    /** 共享的独立诊断 Trace Sink。 */
    readonly traceSink: JsonFileDiagnosticTraceSink;
    /** Launcher、Coordinator 与 Runner 共享的 Prompt/Memory 协议校验器。 */
    readonly protocolValidator: GoalProtocolValidator;
    /** structured@1 Patch 接受时共享的不可变限制配置。 */
    readonly workingMemoryLimits: WorkingMemoryLimits;
    /** Coordinator 与 Runner 共享的 Trajectory/Snapshot 提交器。 */
    readonly checkpointCommitter: TrajectoryCheckpointCommitter;
    /**
     * 只读读取指定 Goal/Run 的轨迹，并以最新 Snapshot 边界分类 committed/tail。
     * @param query - Goal、Run 与可选序列范围。
     * @returns 不修改 Runtime 或事件源的轨迹视图。
     */
    readTrajectory(
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>>;
    /** 保护项目级 Store 写入边界的单向检查点闸门。 */
    readonly checkpointStore: CheckpointGateGoalStore;
    /** 当前进程拥有的可关闭资源注册表。 */
    readonly resources: ManagedResourceRegistry;
    /** 贯穿 Controller、Coordinator、Runner 和 Adapter 的根中止控制器。 */
    readonly abortController: AbortController;
    /** 协调快照冻结、资源清理和退出码 130 的关闭器。 */
    readonly shutdownCoordinator: ShutdownCoordinator;
    /** 使用共享 Store 和 Adapter 的 GoalCoordinator。 */
    readonly coordinator: GoalCoordinator;
    /** 当前进程唯一的 SessionController。 */
    readonly controller: SessionController;
    /** Controller 创建新 Goal 时使用的 ID 生成器。 */
    readonly goalIdGenerator: () => string;
    /** Launcher 创建 Run 时使用的 ID 生成器。 */
    readonly runIdGenerator: () => string;
}

/**
 * 解析工作区的真实路径。
 *
 * @param cwd - 要解析的目录，默认是当前进程工作目录。
 * @returns 解析符号链接后的绝对工作区根。
 * @throws 目录不存在、不可访问或不是目录时传播文件系统错误。
 * @example
 * ```ts
 * const workspaceRoot = await resolveWorkspaceRoot();
 * ```
 */
export async function resolveWorkspaceRoot(
    cwd: string = process.cwd(),
): Promise<string> {
    return realpath(cwd);
}

/**
 * 创建 lazygoal 的完整项目级依赖图。
 *
 * @param options - 工作区、环境变量和可选测试 ID 生成器。
 * @returns 可直接交给 TUI CLI 的单 Goal 运行根。
 * @throws 环境变量缺失时抛出 `LlmConfigurationError`，Conversation 预算非法时
 *   抛出 `ConversationBudgetConfigurationError`；Profile 文件缺失、读取或校验
 *   失败时抛出 `AgentProfileConfigurationError`；工作区无法解析时传播文件系统
 *   错误。所有配置失败均发生在工作区访问、Goal I/O 与 LLM 调用之前。
 * @example
 * ```ts
 * const root = await createCompositionRoot({ env: process.env });
 * console.log(root.workspaceRoot, root.profile.id);
 * ```
 */
export async function createCompositionRoot(
    options: CompositionRootOptions = {},
): Promise<CompositionRoot> {
    const env = options.env ?? process.env;
    let llmConfig: LlmConfig | undefined;
    let adapter: LLMAdapter;
    if (options.adapter !== undefined) {
        adapter = options.adapter;
        try {
            llmConfig = readLlmConfig(env);
        } catch {
            llmConfig = undefined;
        }
    } else {
        try {
            llmConfig = readLlmConfig(env);
        } catch (error) {
            const xdgPaths = resolveXdgPaths(env);
            if (existsSync(xdgPaths.configFile)) {
                const runtimeConfig = await loadRuntimeConfig({ env, xdgPaths });
                llmConfig = runtimeConfig.llm;
            } else {
                throw error;
            }
        }
        adapter = createLlmAdapter(llmConfig);
    }
    const conversationCharBudget = readConversationCharBudget(env);
    const configuredEstimator = resolveModelInputEstimator(options.modelInputEstimator);
    const modelCapabilities = readModelCapabilities(env, configuredEstimator);
    const modelInputEstimator = modelCapabilities?.tokenEstimator ?? configuredEstimator;
    const workspaceRoot = await resolveWorkspaceRoot(options.cwd ?? process.cwd());
    const dataDirectory = options.dataDirectory !== undefined
        ? resolve(options.dataDirectory)
        : join(workspaceRoot, ".lazygoal");
    const goalsDirectory = join(dataDirectory, "goals");
    const trajectoriesDirectory = join(
        dataDirectory,
        "trajectories",
    );
    const tracesDirectory = join(dataDirectory, "traces");
    const contextSidecarsDirectory = join(
        dataDirectory,
        "context-sidecars",
    );
    const profilesDirectory = join(workspaceRoot, ".lazygoal", "profiles");
    const profilePath = join(
        profilesDirectory,
        `${DEFAULT_PROFILE_ID}.json`,
    );

    let profile: AgentProfile;
    let profiles: AgentProfileRegistry;
    if (options.profile !== undefined) {
        profile = options.profile;
        profiles = {
            get(profileId: string): AgentProfile | undefined {
                return profileId === profile.id ? profile : undefined;
            },
        };
    } else {
        const profileStore = new JsonFileAgentProfileStore(profilesDirectory);
        const loadedProfile = await profileStore.load(DEFAULT_PROFILE_ID);

        if (loadedProfile !== undefined) {
            profile = loadedProfile;
        } else {
            const xdgPaths = resolveXdgPaths(env);
            const xdgConfigFile = join(xdgPaths.lazygoalConfigDir, "config.toml");
            const xdgDefaultProfile = join(xdgPaths.profilesDir, `${DEFAULT_PROFILE_ID}.toml`);
            const hasXdgConfig = existsSync(xdgConfigFile);
            const hasXdgProfile = existsSync(xdgDefaultProfile);

            if (!hasXdgConfig && !hasXdgProfile) {
                throw new AgentProfileConfigurationError(
                    DEFAULT_PROFILE_ID,
                    profilePath,
                    "Profile 文件不存在",
                );
            }

            profile = {
                id: DEFAULT_PROFILE_ID,
                name: "Default Agent",
                description: "LazyGoal 默认用户 Profile",
                systemPrompt: "You are LazyGoal, a goal-driven, resumable agent runtime.",
                instructions: ["Advance the goal through safe, verified actions."],
                toolIds: [
                    READ_FILE_TOOL_ID,
                    "write_file",
                    "edit_file",
                    GREP_TOOL_ID,
                    "bash",
                ],
            };
        }

        profiles = {
            get(profileId: string): AgentProfile | undefined {
                return profileId === profile.id
                    ? profile
                    : undefined;
            },
        };
    }

    let toolRegistry: InMemoryToolRegistry;
    let readFileTool: ReadFileTool | undefined;
    if (options.toolRegistry !== undefined) {
        toolRegistry = options.toolRegistry;
        readFileTool = undefined;
    } else {
        readFileTool = new ReadFileTool(workspaceRoot);
        const writeFileTool = new WriteFileTool(workspaceRoot);
        const editFileTool = new EditFileTool(workspaceRoot);
        const grepTool = new GrepTool(workspaceRoot);
        const bashTool = new BashTool(workspaceRoot);
        toolRegistry = new InMemoryToolRegistry([
            createToolRegistration(readFileTool),
            createToolRegistration(writeFileTool),
            createToolRegistration(editFileTool),
            createToolRegistration(grepTool),
            createToolRegistration(bashTool),
        ]);
    }

    const missingToolId = profile.toolIds.find(
        (toolId) => toolRegistry.get(toolId) === undefined,
    );

    if (missingToolId !== undefined) {
        throw new AgentProfileConfigurationError(
            profile.id,
            options.profile !== undefined ? `<explicit-profile:${profile.id}>` : profilePath,
            `toolIds 引用了未注册的 Tool "${missingToolId}"`,
        );
    }

    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor(
        conversationCharBudget,
    );
    const modelContextPolicy = options.modelContextBudget === undefined
        ? modelCapabilities === undefined
            ? createDefaultModelContextBudgetPolicy(modelInputEstimator)
            : createModelContextBudgetPolicy({
                // Assembler 预算与最终 TokenBudgetPlanner 使用同一份
                // 95% 安全窗口；最终请求仍会再次以硬上限复核。
                modelInputBudget: Math.floor(modelCapabilities.contextWindowTokens * 0.95),
                responseReserve: modelCapabilities.maxOutputTokens,
            }, modelInputEstimator)
        : createModelContextBudgetPolicy(
            options.modelContextBudget,
            modelInputEstimator,
        );
    const benchmarksDirectory = options.benchmarksDirectory !== undefined
        ? resolve(options.benchmarksDirectory)
        : join(workspaceRoot, ".lazygoal", "benchmarks");
    const primaryGoalStore = new JsonFileGoalStore(goalsDirectory);
    const store = new AggregatedGoalStore(primaryGoalStore, benchmarksDirectory);
    const primaryTrajectoryStore = new JsonFileTrajectoryStore(trajectoriesDirectory);
    const trajectoryStore = new AggregatedTrajectoryStore(primaryTrajectoryStore, benchmarksDirectory);
    const retrievalIndexStore = new JsonFileContextRetrievalIndexStore(contextSidecarsDirectory);
    const contextLookupService = new IndexedContextLookupService({
        trajectoryStore,
        indexStore: retrievalIndexStore,
    });
    const traceSink = new JsonFileDiagnosticTraceSink(tracesDirectory);
    const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: modelContextPolicy,
    });
    const checkpointStore = new CheckpointGateGoalStore(store);
    const protocolValidator = createDefaultPromptBundleProtocolValidator();
    const workingMemoryLimits: WorkingMemoryLimits = DEFAULT_WORKING_MEMORY_LIMITS;
    const abortController = options.abortController ?? new AbortController();
    const resources = new ManagedResourceRegistry();
    const checkpointCommitter = new TrajectoryCheckpointCommitter({
        store: checkpointStore,
        trajectoryStore,
        traceSink,
    });
    const toolPolicy = options.toolPolicy ?? createDefaultToolPolicy();
    const preparationExecutor = options.preparationExecutor ?? new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        traceSink,
        trajectoryContextAssembler,
        ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
    });
    const runner = new Runner({
        store: checkpointStore,
        executor: new LLMStepExecutor({
            adapter,
            renderer,
            contextCompactor,
            traceSink,
            trajectoryContextAssembler,
            ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
        }),
        toolRegistry,
        toolPolicy,
        traceSink,
        trajectoryStore,
        workingMemoryLimits,
        protocolValidator,
        checkpointCommitter,
        contextLookupPort: contextLookupService,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store: checkpointStore,
        preparationExecutor,
        scheduler,
        toolRegistry,
        traceSink,
        trajectoryStore,
        workingMemoryLimits,
        protocolValidator,
        checkpointCommitter,
        contextLookupPort: contextLookupService,
    });
    const goalIdGenerator = options.goalIdGenerator ?? randomUUID;
    const runIdGenerator = options.runIdGenerator ?? randomUUID;
    const launcher: SessionLauncher = {
        launch(request, control) {
            return launch(
                request,
                {
                    profiles,
                    runIdGenerator,
                    store: checkpointStore,
                    coordinator,
                    protocolValidator,
                    trajectoryStore,
                    traceSink,
                },
                control,
            );
        },
    };
    const readTrajectory = (
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>> =>
        readTrajectoryAtSnapshot(checkpointStore, trajectoryStore, query);

    const controller = new SessionController({
        launcher,
        coordinator,
        store: checkpointStore,
        catalog: store satisfies GoalCatalog,
        profileId: profile.id,
        goalIdGenerator,
        control: { signal: abortController.signal },
        initialScreen: options.initialScreen ?? "home",
        ...(options.initialGoalSelectMode !== undefined
            ? { initialGoalSelectMode: options.initialGoalSelectMode }
            : {}),
        readTrajectory,
        environmentSummary: {
            workspaceRoot,
            profileId: profile.id,
            ...(llmConfig?.model === undefined ? {} : { modelName: llmConfig.model }),
            dataDirectory,
        },
    });
    const shutdownCoordinator = new ShutdownCoordinator({
        checkpointStore,
        resources,
        abortController,
        exitPort: options.exitPort ?? new ProcessExitPort(),
        ...(options.gracePeriodMs === undefined
            ? {}
            : { gracePeriodMs: options.gracePeriodMs }),
    });

    return {
        workspaceRoot,
        dataDirectory,
        goalsDirectory,
        trajectoriesDirectory,
        tracesDirectory,
        contextSidecarsDirectory,
        ...(llmConfig === undefined ? {} : { llmConfig }),
        conversationCharBudget,
        contextCompactor,
        modelInputEstimator,
        ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
        modelContextPolicy,
        trajectoryContextAssembler,
        adapter,
        profile,
        profiles,
        ...(readFileTool === undefined ? {} : { readFileTool }),
        toolRegistry,
        toolPolicy,
        preparationExecutor,
        store,
        trajectoryStore,
        contextLookupService,
        retrievalIndexStore,
        traceSink,
        protocolValidator,
        workingMemoryLimits,
        checkpointCommitter,
        readTrajectory,
        checkpointStore,
        resources,
        abortController,
        shutdownCoordinator,
        coordinator,
        controller,
        goalIdGenerator,
        runIdGenerator,
    };
}

/**
 * `runCli` 可注入的终端输出与 Ink 渲染实现。
 *
 * @remarks
 * 生产调用使用当前进程环境、工作目录和 Ink 默认渲染器；测试可以提供
 * 不创建真实终端的 `render`，并收集英文错误文本而不污染 stderr。
 *
 * @example
 * ```ts
 * const options: CliRunOptions = {
 *     env: testEnvironment,
 *     writeError: errors.push,
 * };
 * await runCli([], options);
 * ```
 */
export interface CliRunOptions {
    /** 模型配置来源；默认读取当前进程环境。 */
    readonly env?: NodeJS.ProcessEnv;
    /** 工作区目录；默认使用当前进程工作目录。 */
    readonly cwd?: string;
    /** Ink 渲染器；测试可注入不启动真实终端的替身。 */
    readonly render?: typeof inkRender;
    /** 输出 CLI 错误；默认写入 stderr。 */
    readonly writeError?: (message: string) => void;
    /** 关闭时使用的退出端口；测试可注入记录器避免结束当前进程。 */
    readonly exitPort?: ExitPort;
    /** 关闭流程的 grace period；测试可缩短而不等待 2 秒。 */
    readonly gracePeriodMs?: number;
    /** 可选初始屏幕；测试或特定调用场景可覆盖默认首页。 */
    readonly initialScreen?: "home" | "intent_input";
    /** 可选初始目标选择模式（"resume" 或 "inspect"）。 */
    readonly initialGoalSelectMode?: "resume" | "inspect";
}

/**
 * 挂载并运行已有 SessionController 的 TUI 实例。
 *
 * @remarks
 * 允许外部编排器拥有生命周期控制、信号监听与 Controller 装配，TUI 仅负责渲染
 * 与用户交互。
 *
 * @param options - 挂载选项，包含 controller、关闭回调及可选渲染器。
 * @returns 包含实例卸载和等待退出的可控制句柄。
 * @example
 * ```ts
 * const app = mountTuiApp({
 *     controller: root.controller,
 *     onShutdown: () => root.shutdownCoordinator.shutdown(),
 * });
 * await app.waitUntilExit();
 * ```
 */
export interface MountTuiOptions {
    /** 要挂载的单 Goal 会话控制器；沙箱准备期间可以暂不提供。 */
    readonly controller?: SessionController;
    /** 用户触发或界面请求关闭时的回调。 */
    readonly onShutdown: () => Promise<void>;
    /** 可选的 Ink 渲染器，测试可注入替身。 */
    readonly render?: typeof inkRender;
    /** 控制器尚未可用时显示的初始化状态。 */
    readonly initialStatus?: string;
}

/** 挂载的 TUI 运行句柄。 */
export interface MountedTuiApp {
    /** 等待 TUI 退出。 */
    waitUntilExit(): Promise<void>;
    /** 卸载 TUI 组件树。 */
    unmount(): void;
    /**
     * 将初始化页切换为真实会话页；自定义测试渲染器可以省略该能力。
     *
     * @param controller - 已完成沙箱准备并绑定运行时依赖的会话控制器。
     */
    setController?: (controller: SessionController) => void;
}

interface TuiMountState {
    controller: SessionController | undefined;
    status: string;
    revision: number;
    listeners: Set<() => void>;
}

function TuiMountHost({
    state,
    onShutdown,
}: {
    readonly state: TuiMountState;
    readonly onShutdown: () => Promise<void>;
}): React.JSX.Element {
    const revision = useSyncExternalStore(
        (listener) => {
            state.listeners.add(listener);
            return () => state.listeners.delete(listener);
        },
        () => state.revision,
        () => state.revision,
    );
    void revision;
    const shutdownRequested = useRef(false);
    useInput((input, key) => {
        if (state.controller === undefined && key.ctrl && input === "c") {
            if (shutdownRequested.current) return;
            shutdownRequested.current = true;
            void onShutdown().catch(() => undefined);
        }
    });

    if (state.controller === undefined) {
        return <StatusSpinner label={state.status} />;
    }

    return <TuiApp controller={state.controller} onShutdown={onShutdown} />;
}

export function mountTuiApp(options: MountTuiOptions): MountedTuiApp {
    const renderer = options.render ?? inkRender;
    const state: TuiMountState = {
        controller: options.controller,
        status: options.initialStatus ?? "Preparing TUI sandbox...",
        revision: 0,
        listeners: new Set(),
    };
    const instance = renderer(
        <TuiMountHost state={state} onShutdown={options.onShutdown} />,
        { exitOnCtrlC: false },
    );
    return {
        waitUntilExit: async () => {
            await instance.waitUntilExit();
        },
        unmount: () => instance.unmount(),
        setController: (controller) => {
            state.controller = controller;
            state.revision += 1;
            for (const listener of state.listeners) listener();
        },
    };
}

/**
 * 执行一次 lazygoal CLI 命令。
 *
 * @remarks
 * 环境变量和工作区在创建 TUI 前校验。空参数渲染 intent 页面；`resume` 先
 * 打开 Catalog 选择页；`-c` 先确认有候选项，再委托 Controller 选择排序首项。
 * 该函数不调用 `process.exit`，调用方通过返回码决定进程退出；Ctrl+C 会进入
 * `ShutdownCoordinator` 管理的幂等关闭流程。
 *
 * @param argv - 不包含 Node/bin 路径的 CLI 参数。
 * @param options - 测试可注入的环境、工作区、渲染器和错误输出。
 * @returns `0` 表示 TUI 正常结束，参数/配置/恢复初始化失败返回非零码。
 * @example
 * ```ts
 * const exitCode = await runCli(process.argv.slice(2));
 * process.exitCode = exitCode;
 * ```
 */
export async function runCli(
    argv: readonly string[] = process.argv.slice(2),
    options: CliRunOptions = {},
): Promise<number> {
    const writeError = options.writeError ?? ((message: string) => {
        console.error(message);
    });
    let command: CliCommand;

    try {
        command = parseCliArgs(argv);
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 2;
    }

    let root: CompositionRoot;

    try {
        root = await createCompositionRoot({
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            ...(options.env === undefined ? {} : { env: options.env }),
            ...(options.exitPort === undefined ? {} : { exitPort: options.exitPort }),
            ...(options.gracePeriodMs === undefined
                ? {}
                : { gracePeriodMs: options.gracePeriodMs }),
            ...(command.kind === "inspect" && command.dir !== undefined
                ? { benchmarksDirectory: command.dir }
                : {}),
            initialScreen: options.initialScreen ?? (
                command.kind === "home"
                    ? "home"
                    : command.kind === "inspect" && command.goalId !== undefined
                        ? "inspector"
                        : command.kind === "inspect" || command.kind === "resume"
                            ? "goal_select"
                            : "intent_input"
            ),
            ...(options.initialGoalSelectMode !== undefined
                ? { initialGoalSelectMode: options.initialGoalSelectMode }
                : command.kind === "inspect" && command.goalId === undefined
                    ? { initialGoalSelectMode: "inspect" as const }
                    : {}),
        });
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 1;
    }

    if (command.kind === "continueLatest") {
        let resumable;

        try {
            resumable = await root.store.listResumable();
        } catch (error: unknown) {
            writeError(toErrorMessage(error));
            return 1;
        }

        if (resumable.length === 0) {
            writeError("No resumable Goal was found");
            return 1;
        }
    }

    const renderer = options.render ?? inkRender;
    let app: MountedTuiApp | undefined;
    let shutdownRequested = false;
    let shutdownPromise: Promise<void> | undefined;
    let unregisterSigint: (() => void) | undefined;
    const requestShutdown = (): Promise<void> => {
        if (shutdownPromise !== undefined) {
            return shutdownPromise;
        }

        shutdownRequested = true;
        root.controller.beginShutdown();
        root.checkpointStore.freeze();
        root.abortController.abort();
        shutdownPromise = (async () => {
            app?.unmount();
            if (app !== undefined) {
                await app.waitUntilExit();
            }
            await root.shutdownCoordinator.shutdown();
        })();
        return shutdownPromise;
    };
    const onSigint = (): void => {
        void requestShutdown();
    };

    try {
        process.on("SIGINT", onSigint);
        unregisterSigint = root.resources.register({
            close: () => {
                process.off("SIGINT", onSigint);
            },
        });
        // 首帧 loading 来自真实查询，不能在构造时占用 dispatch 的 busy 锁。
        const initialListing = command.kind === "resume"
            ? root.controller.dispatch({ kind: "resume" })
            : command.kind === "inspect" && command.goalId === undefined
                ? root.controller.dispatch({ kind: "openHistory" })
                : undefined;
        app = mountTuiApp({
            controller: root.controller,
            onShutdown: requestShutdown,
            render: renderer,
        });

        if (initialListing !== undefined) {
            await initialListing;
        } else if (command.kind === "continueLatest") {
            await root.controller.dispatch({ kind: "continueLatest" });
        } else if (command.kind === "create") {
            await root.controller.dispatch({ kind: "openIntentInput" });
        } else if (command.kind === "inspect") {
            if (command.goalId !== undefined) {
                let goal;
                try {
                    goal = await root.store.restore(command.goalId);
                } catch (error: unknown) {
                    writeError(toErrorMessage(error));
                    return 1;
                }
                if (goal === undefined) {
                    writeError(`Goal not found: ${command.goalId}`);
                    return 1;
                }
                let trajectoryResult;
                try {
                    trajectoryResult = await root.readTrajectory({
                        goalId: command.goalId,
                        runId: goal.state.run.id,
                    });
                } catch (error: unknown) {
                    writeError(`Failed to read trajectory: ${toErrorMessage(error)}`);
                    return 1;
                }
                const hasCommitted = trajectoryResult.committed.length > 0;
                const hasUncommitted = (trajectoryResult.uncommittedTail?.length ?? 0) > 0;
                if (!hasCommitted && !hasUncommitted) {
                    writeError(`Trajectory for Goal "${command.goalId}" contains no events`);
                    return 1;
                }
                const steps = projectTrajectoryEvents({
                    goalId: command.goalId,
                    goal,
                    committedEvents: trajectoryResult.committed,
                    ...(trajectoryResult.uncommittedTail !== undefined
                        ? { uncommittedTail: trajectoryResult.uncommittedTail }
                        : {}),
                });
                if (steps.length === 0) {
                    writeError(`Trajectory for Goal "${command.goalId}" yielded no inspectable steps`);
                    return 1;
                }
                await root.controller.dispatch({
                    kind: "openInspector",
                    goalId: command.goalId,
                    steps,
                });
            }
        }

        await app.waitUntilExit();
        if (shutdownPromise !== undefined) {
            await shutdownPromise;
        }
        return shutdownRequested ? 130 : 0;
    } catch (error: unknown) {
        writeError(toErrorMessage(error));
        return 1;
    } finally {
        unregisterSigint?.();
    }
}

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

const entrypoint = process.argv[1] === undefined
    ? undefined
    : resolve(process.argv[1]);

if (entrypoint === fileURLToPath(import.meta.url)) {
    void runCli().then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error: unknown) => {
        console.error(toErrorMessage(error));
        process.exitCode = 1;
    });
}
