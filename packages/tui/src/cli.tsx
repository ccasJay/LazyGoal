import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import React from "react";
import { render as inkRender } from "ink";

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
    type ExitPort,
    type GoalProtocolValidator,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
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
import { OpenAICompatible } from "../../llm/src/openai-compatible";
import type { StructuredOutputMode } from "../../llm/src/core/types";
import {
    BashTool,
    EditFileTool,
    GREP_TOOL_ID,
    GrepTool,
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WriteFileTool,
} from "../../tools/src/index";
import { SessionController, TuiApp } from "./index";
import type { SessionLauncher } from "./types";

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
 * OpenAI-compatible CLI 所需的已校验模型配置。
 *
 * @remarks
 * 三个字段均已去除首尾空白且保证非空；该值可以直接传给
 * `OpenAICompatible`，不会再次从进程环境读取凭据。
 *
 * @example
 * ```ts
 * const config: LlmConfig = {
 *     apiKey: "secret",
 *     baseURL: "https://api.example.test/v1",
 *     model: "agent-model",
 * };
 * ```
 */
export interface LlmConfig {
    /** `LLM_API_KEY` 的去除首尾空白值。 */
    readonly apiKey: string;
    /** `LLM_BASE_URL` 的去除首尾空白值。 */
    readonly baseURL: string;
    /** `LLM_MODEL` 的去除首尾空白值。 */
    readonly model: string;
    /** `LLM_STRUCTURED_OUTPUT_MODE` 的已校验模式（"strict" 或 "prompt_only"）。 */
    readonly structuredOutputMode: StructuredOutputMode;
}

/**
 * 表示 CLI 启动前环境变量校验失败。
 *
 * @remarks
 * 该错误在创建 Store、Adapter、Tool 或 SessionController 之前抛出，因此
 * 缺失配置不会创建、恢复或修改任何 Goal。`missing` 保留稳定的变量顺序。
 *
 * @example
 * ```ts
 * try {
 *     readLlmConfig(process.env);
 * } catch (error) {
 *     if (error instanceof CliConfigurationError) console.error(error.missing);
 * }
 * ```
 */
export class CliConfigurationError extends Error {
    /** 可供 CLI 和测试判断的稳定错误码。 */
    readonly code = "INVALID_LLM_CONFIG" as const;
    /** 去除空白后仍缺失的环境变量。 */
    readonly missing: readonly string[];

    /**
     * @param missing - 缺失变量名，按协议顺序排列。
     * @param customMessage - 可选自定义错误消息。
     */
    constructor(missing: readonly string[], customMessage?: string) {
        const names = [...missing];
        super(customMessage ?? `Missing required environment variable(s): ${names.join(", ")}`);
        this.name = "CliConfigurationError";
        this.missing = names;
    }
}

/**
 * 读取并严格校验模型环境变量。
 *
 * @param env - 要读取的环境对象；默认使用当前进程环境。
 * @returns 可直接传给 `OpenAICompatible` 的配置。
 * @throws `CliConfigurationError` 在任一变量不存在、去除空白后为空或模式值非法时抛出。
 * @example
 * ```ts
 * const config = readLlmConfig({
 *     LLM_API_KEY: "secret",
 *     LLM_BASE_URL: "https://api.example.test/v1",
 *     LLM_MODEL: "agent-model",
 *     LLM_STRUCTURED_OUTPUT_MODE: "strict",
 * });
 * ```
 */
export function readLlmConfig(
    env: NodeJS.ProcessEnv = process.env,
): LlmConfig {
    const names = [
        "LLM_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL",
        "LLM_STRUCTURED_OUTPUT_MODE",
    ] as const;
    const missing = names.filter((name) => (env[name] ?? "").trim() === "");

    if (missing.length > 0) {
        throw new CliConfigurationError(missing);
    }

    const modeRaw = env.LLM_STRUCTURED_OUTPUT_MODE!.trim();
    if (modeRaw !== "strict" && modeRaw !== "prompt_only") {
        throw new CliConfigurationError(
            [],
            `Invalid LLM_STRUCTURED_OUTPUT_MODE "${modeRaw}": must be either "strict" or "prompt_only"`,
        );
    }

    return {
        apiKey: env.LLM_API_KEY!.trim(),
        baseURL: env.LLM_BASE_URL!.trim(),
        model: env.LLM_MODEL!.trim(),
        structuredOutputMode: modeRaw,
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

/** CLI 只支持的三个入口意图。 */
export type CliCommand =
    | { readonly kind: "create" }
    | { readonly kind: "continueLatest" }
    | { readonly kind: "resume" };

/**
 * 使用 Node `parseArgs` 解析 CLI 参数。
 *
 * @param argv - 不包含 Node 和 bin 路径的参数数组。
 * @returns 空参数、`-c` 或 `resume` 对应的入口意图。
 * @throws 参数未知、重复或组合不合法时抛出带英文用法的 `Error`。
 * @example
 * ```ts
 * parseCliArgs([]); // { kind: "create" }
 * parseCliArgs(["-c"]); // { kind: "continueLatest" }
 * ```
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
    let parsed: ReturnType<typeof parseArgs>;

    try {
        parsed = parseArgs({
            args: [...argv],
            options: {
                continue: { type: "boolean", short: "c" },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid command line arguments: ${message}`);
    }

    const hasContinue = parsed.values.continue === true;

    if (hasContinue && parsed.positionals.length === 0) {
        return { kind: "continueLatest" };
    }

    if (!hasContinue && parsed.positionals.length === 1
        && parsed.positionals[0] === "resume") {
        return { kind: "resume" };
    }

    if (!hasContinue && parsed.positionals.length === 0) {
        return { kind: "create" };
    }

    throw new Error("Invalid command line arguments: Usage: lazygoal [-c|resume]");
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
    /** 模型配置来源；默认读取 `process.env`。 */
    readonly env?: NodeJS.ProcessEnv;
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
    /** 项目级 Goal 快照目录。 */
    readonly goalsDirectory: string;
    /** 项目级 Domain Event JSONL 目录。 */
    readonly trajectoriesDirectory: string;
    /** 项目级 Diagnostic Trace JSONL 目录。 */
    readonly tracesDirectory: string;
    /** 项目级可删除 Warm Context Sidecar 目录。 */
    readonly contextSidecarsDirectory: string;
    /** 已校验的 OpenAI-compatible 配置。 */
    readonly llmConfig: LlmConfig;
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
    /** 组合根使用的 LLM Adapter。 */
    readonly adapter: OpenAICompatible;
    /** 从当前 workspace Profile 文件加载的生效 Agent Profile。 */
    readonly profile: AgentProfile;
    /** 只承载当前生效 Profile 的内存 Registry。 */
    readonly profiles: AgentProfileRegistry;
    /** 当前 workspaceRoot 下的只读文件 Tool。 */
    readonly readFileTool: ReadFileTool;
    /** 包含 `read_file`、`write_file`、`edit_file`、`grep` 与 `bash` 的单进程 Tool Registry。 */
    readonly toolRegistry: InMemoryToolRegistry;
    /** 同时实现 GoalStore 与 GoalCatalog 的项目级 Store。 */
    readonly store: JsonFileGoalStore;
    /** 共享的事实事件追加与读取 Store。 */
    readonly trajectoryStore: JsonFileTrajectoryStore;
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
 * @throws 环境变量缺失时抛出 `CliConfigurationError`，Conversation 预算非法时
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
    const llmConfig = readLlmConfig(env);
    const conversationCharBudget = readConversationCharBudget(env);
    const configuredEstimator = resolveModelInputEstimator(options.modelInputEstimator);
    const modelCapabilities = readModelCapabilities(env, configuredEstimator);
    const modelInputEstimator = modelCapabilities?.tokenEstimator ?? configuredEstimator;
    const workspaceRoot = await resolveWorkspaceRoot(options.cwd ?? process.cwd());
    const goalsDirectory = join(workspaceRoot, ".lazygoal", "goals");
    const trajectoriesDirectory = join(
        workspaceRoot,
        ".lazygoal",
        "trajectories",
    );
    const tracesDirectory = join(workspaceRoot, ".lazygoal", "traces");
    const contextSidecarsDirectory = join(
        workspaceRoot,
        ".lazygoal",
        "context-sidecars",
    );
    const profilesDirectory = join(workspaceRoot, ".lazygoal", "profiles");
    const profileStore = new JsonFileAgentProfileStore(profilesDirectory);
    const profilePath = join(
        profilesDirectory,
        `${DEFAULT_PROFILE_ID}.json`,
    );
    const loadedProfile = await profileStore.load(DEFAULT_PROFILE_ID);

    if (loadedProfile === undefined) {
        throw new AgentProfileConfigurationError(
            DEFAULT_PROFILE_ID,
            profilePath,
            "Profile 文件不存在",
        );
    }

    const profile: AgentProfile = loadedProfile;
    const profiles: AgentProfileRegistry = {
        get(profileId: string): AgentProfile | undefined {
            return profileId === profile.id
                ? profile
                : undefined;
        },
    };
    const readFileTool = new ReadFileTool(workspaceRoot);
    const writeFileTool = new WriteFileTool(workspaceRoot);
    const editFileTool = new EditFileTool(workspaceRoot);
    const grepTool = new GrepTool(workspaceRoot);
    const bashTool = new BashTool(workspaceRoot);
    const toolRegistry = new InMemoryToolRegistry([
        createToolRegistration(readFileTool),
        createToolRegistration(writeFileTool),
        createToolRegistration(editFileTool),
        createToolRegistration(grepTool),
        createToolRegistration(bashTool),
    ]);
    const missingToolId = profile.toolIds.find(
        (toolId) => toolRegistry.get(toolId) === undefined,
    );

    if (missingToolId !== undefined) {
        throw new AgentProfileConfigurationError(
            profile.id,
            profilePath,
            `toolIds 引用了未注册的 Tool "${missingToolId}"`,
        );
    }

    const adapter = new OpenAICompatible(llmConfig);
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
    const store = new JsonFileGoalStore(goalsDirectory);
    const trajectoryStore = new JsonFileTrajectoryStore(trajectoriesDirectory);
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
    const abortController = new AbortController();
    const resources = new ManagedResourceRegistry();
    const checkpointCommitter = new TrajectoryCheckpointCommitter({
        store: checkpointStore,
        trajectoryStore,
        traceSink,
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
        toolPolicy: createDefaultToolPolicy(),
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
        preparationExecutor: new LLMPreparationExecutor({
            adapter,
            renderer,
            contextCompactor,
            traceSink,
            trajectoryContextAssembler,
            ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
        }),
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
    const controller = new SessionController({
        launcher,
        coordinator,
        store: checkpointStore,
        catalog: store satisfies GoalCatalog,
        profileId: profile.id,
        goalIdGenerator,
        control: { signal: abortController.signal },
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

    const readTrajectory = (
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>> =>
        readTrajectoryAtSnapshot(checkpointStore, trajectoryStore, query);

    return {
        workspaceRoot,
        goalsDirectory,
        trajectoriesDirectory,
        tracesDirectory,
        contextSidecarsDirectory,
        llmConfig,
        conversationCharBudget,
        contextCompactor,
        modelInputEstimator,
        ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
        modelContextPolicy,
        trajectoryContextAssembler,
        adapter,
        profile,
        profiles,
        readFileTool,
        toolRegistry,
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
    let instance: ReturnType<typeof inkRender> | undefined;
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
            instance?.unmount();
            if (instance !== undefined) {
                await instance.waitUntilExit();
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
        instance = renderer(
            <TuiApp
                controller={root.controller}
                onShutdown={requestShutdown}
            />,
            { exitOnCtrlC: false },
        );

        if (command.kind === "resume") {
            await root.controller.dispatch({ kind: "resume" });
        } else if (command.kind === "continueLatest") {
            await root.controller.dispatch({ kind: "continueLatest" });
        }

        await instance.waitUntilExit();
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
