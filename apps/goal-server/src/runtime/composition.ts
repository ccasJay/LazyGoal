import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../../../packages/tool-core/src/index";
import {
    CheckpointGateGoalStore,
    ManagedResourceRegistry,
    RuntimeLifecycle,
    DEFAULT_GOAL_MODEL_SELECTION,
    DefaultGoalModelSelectionCoordinator,
    TrajectoryCheckpointCommitter,
    allocateDiagnosticTraceRecord,
    readTrajectoryAtSnapshot,
    launch,
    SessionManager,
    type SessionManagerDependencies,
    type GoalInteractionView,
    type InteractionHandlerAttachOptions,
    type InteractionHandlerAttachResult,
    type SessionInteractionHandlers,
    type AgentProfile,
    type AgentProfileRegistry,
    type Goal,
    type GoalCatalog,
    type GoalStore,
    type GoalModelSelection,
    type GoalModelSelectionCoordinator,
    type GoalProtocolValidator,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryQueryPort,
    type TrajectoryStore,
    type ToolPolicy,
    type RunnerDependencies,
    IndexedContextLookupService,
    hasUnsettledSessionWork,
} from "../../../../packages/runtime/src/index";
import type { ProjectPermissionProfileStore } from "../../../../packages/permission/src/index";
import {
    DEFAULT_WORKING_MEMORY_LIMITS,
    type WorkingMemoryLimits,
} from "../../../../packages/working-memory/src/index";
import {
    AgentProfileConfigurationError,
    JsonFileDiagnosticTraceSink,
    JsonFileModelInputStore,
    JsonFileAgentProfileStore,
    JsonFileGoalStore,
    JsonFileMetricsStore,
    JsonFileTrajectoryStore,
    JsonFileContextRetrievalIndexStore,
    JsonFileSandboxGrantStore,
    JsonFileProjectPermissionProfileStore,
    JsonFileModelPreferenceStore,
    JsonFileProcessSessionStore,
} from "../../../../packages/storage/src/index";
import { SessionMetricsService } from "../../../../packages/session-metrics/src/index";
import { createAgentExecutor } from "../../../../packages/agent/src/index";
import {
    createDefaultModelContextBudgetPolicy,
    createModelContextBudgetPolicy,
    DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    DropOldestContextCompactor,
    resolveModelInputEstimator,
    createModelCapabilities,
    ModelCapabilitiesError,
    resolveTokenEstimatorEncoding,
    resolveEpochCapacity,
    tryResolveEpochCapacity,
    type EpochCapacity,
    type ModelCapabilities,
    type ModelContextBudgetPolicy,
    type ModelContextBudgetPolicyInput,
    type ModelInputEstimator,
} from "../../../../packages/context-budget/src/index";
import { TrajectoryModelContextAssembler } from "../../../../packages/model-context/src/index";
import {
    createModelExecutionBinding,
    MutableModelBinding,
    type ModelExecutionBinding,
} from "../../../../packages/model-execution/src/index";
import {
    createDefaultPromptBundleRenderer,
    renderContextCompactionPrompt,
    createDefaultPromptBundleProtocolValidator,
} from "../../../../packages/prompt-bundle/src/index";
import {
    JsonFileProviderProfileStore,
    readLLMConfig,
    toLlmConfig,
    ProviderProfileResolutionError,
    type ProviderProfile,
} from "../../../../packages/config/src/index";
import {
    LLMConfigurationError,
    readAssistantText,
    type LLMConfig,
} from "../../../../packages/llm-core/src/index";
import { loadContextConfig, loadRuntimeConfig } from "../../../../packages/config/src/index";
import {
    ensureSecureConfigFile,
    ensureSecureHomeDirectories,
    ensureSecureWorkspaceDirectories,
    ensureWorkspaceManifest,
    resolveLazyGoalHomePaths,
    resolveWorkspaceHomePaths,
} from "../../../../packages/config/src/index";
import { createLlmStageAdapters, type LlmStageAdapters } from "../../../../packages/llm/src/index";
import type { LLMAdapter } from "../../../../packages/llm-core/src/index";
import {
    createLlmModelCatalog,
    resolveOpenCodeGoExecutionMetadata,
    type LlmModelCatalog,
} from "../../../../packages/model-catalog/src/index";
import {
    DEFAULT_TOOL_IDS,
    createDefaultToolRegistrations,
    BashTool,
    createExecuteProgramRegistration,
    EditFileTool,
    ReadFileTool,
    WriteFileTool,
} from "../../../../packages/tools/src/index";
import { ProcessManager } from "../../../../packages/process-runtime/src/index";
import {
    InMemoryExecutionStreamPublisher,
    type ExecutionStreamPublisher,
} from "../../../../packages/execution-stream/src/index";
import { NotifyingGoalStore } from "../notifying-goal-store";
import {
    createExecutionComponents,
    type ExecutionCommands,
} from "./execution-composition";

const DEFAULT_PROFILE_ID = "default";

/**
 * 默认 Tool 执行策略。
 *
 * @remarks
 * 工具不再逐条申请审批：资源边界由工作区权限档位的 `sandbox`、`approvals` 与
 * `reviewer` 在执行期裁决，Tool 的暴露与输入校验由 Registry 和 Input Contract
 * 负责。因此该策略对已注册 Tool 一律返回 `allow`，不产生 Tool 级审批或授权记录。
 *
 * @returns 允许所有已注册 Tool 的确定性策略。
 * @example
 * ```ts
 * const policy = createDefaultToolPolicy();
 * ```
 */
export function createDefaultToolPolicy(): ToolPolicy {
    return { evaluate: () => "allow" };
}

/**
 * 会话执行前显式失败使用的模型绑定错误。
 *
 * @remarks
 * Goal 的模型选择无法由本进程提供服务时抛出：不会回退另一个 Provider 或进程
 * 默认配置，调用方应保持可恢复状态并显式重新选择模型。
 *
 * @example
 * ```ts
 * throw new ModelBindingUnavailableError("anthropic", "openai");
 * ```
 */
export class ModelBindingUnavailableError extends Error {
    readonly code = "MODEL_BINDING_UNAVAILABLE" as const;

    /**
     * @param selectionProvider - Goal 快照中记录的 Provider。
     * @param availableProvider - 本进程当前可服务的 Provider。
     */
    constructor(
        readonly selectionProvider: string,
        readonly availableProvider: string,
    ) {
        super(`Goal model selection requires provider "${selectionProvider}" but this instance serves "${availableProvider}"`);
        this.name = "ModelBindingUnavailableError";
    }
}

export class ConversationBudgetConfigurationError extends Error {
    readonly code = "INVALID_LLM_CONVERSATION_CHAR_BUDGET" as const;
    readonly variableName = "LLM_CONVERSATION_CHAR_BUDGET" as const;

    constructor() {
        super("LLM_CONVERSATION_CHAR_BUDGET must be a positive safe integer");
        this.name = "ConversationBudgetConfigurationError";
    }
}

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

/** 为服务端明确配置的登记 OpenCode Go 模型补齐 Adapter 执行契约。 */
function configuredModelAdapterConfig(config: LLMConfig): LLMConfig {
    if (config.provider !== "opencode-go") return config;
    const metadata = resolveOpenCodeGoExecutionMetadata(config.model);
    return metadata === undefined ? config : {
        ...config,
        executionApi: metadata.executionApi,
        contextWindowTokens: metadata.contextWindowTokens,
        maxOutputTokens: metadata.maxOutputTokens,
        reasoning: metadata.reasoning,
        vision: metadata.vision,
        supportsRequiredToolChoice: metadata.supportsRequiredToolChoice,
    };
}

/**
 * 创建 Runtime 装配时由宿主提供的工作区与资源边界。
 *
 * @remarks
 * `cwd` 是实际工具与沙箱执行目录；使用 Git worktree 时，`workspaceIdentityRoot`
 * 仍指向其所属项目根，用于解析项目级权限及工作区数据。注入的 GoalStore 仍由宿主拥有。
 *
 * @example
 * ```ts
 * const options: RuntimeCompositionOptions = {
 *   cwd: "/var/lib/lazygoal/worktrees/goal-1",
 *   workspaceIdentityRoot: "/workspace/project",
 * };
 * ```
 */
export interface RuntimeCompositionOptions {
    readonly cwd?: string;
    /** 将执行工作目录映射回拥有权限账本的项目根目录。 */
    readonly workspaceIdentityRoot?: string;
    readonly dataDirectory?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly adapter?: LLMAdapter;
    /** 由 Supervisor 持有的 Goal 快照 Port；注入后本实例不直接写 Goal 文件。 */
    readonly goalStore?: GoalStore;
    readonly thinkAdapter?: LLMAdapter;
    readonly profile?: AgentProfile;
    readonly toolRegistry?: InMemoryToolRegistry;
    readonly toolPolicy?: ToolPolicy;
    readonly abortController?: AbortController;
    /** 项目权限档位存储；省略时使用工作区下的默认文件存储。 */
    readonly permissionProfileStore?: ProjectPermissionProfileStore;
    /**
     * 实例自有资源集合；省略时由本装配创建。
     *
     * @remarks 显式交付时，其中的资源视为实例自有资源：装配失败与实例关闭都会结算它们；宿主借出的 Port 不属于该集合。
     */
    readonly resources?: ManagedResourceRegistry;
    readonly goalIdGenerator?: () => string;
    readonly runIdGenerator?: () => string;
    readonly gracePeriodMs?: number;
    readonly modelInputEstimator?: ModelInputEstimator;
    readonly modelContextBudget?: ModelContextBudgetPolicyInput;
    /** 显式覆盖 `[context]` 小节；省略时从 Home 配置文件读取。 */
    readonly contextConfig?: {
        readonly epochLimitTokens?: number;
        readonly compactThresholdPercent?: number;
    };
    readonly modelCatalog?: LlmModelCatalog;
    readonly modelBinding?: MutableModelBinding;
    readonly goalModelSelectionCoordinator?: GoalModelSelectionCoordinator;
    readonly adapterFactory?: (
        selection: GoalModelSelection,
        stage: "think" | "decide",
    ) => LLMAdapter;
    /** 受管 Provider 档案存储；省略时使用 LazyGoal Home 下的默认文件存储。 */
    readonly providerProfileStore?: JsonFileProviderProfileStore;
    /** 显式注入的 Provider 档案集合；省略时从存储读取。 */
    readonly providerProfiles?: readonly ProviderProfile[];
}

/**
 * 无界面宿主可用的交互接入端口。
 *
 * @remarks
 * `attach` 打开（或复用）指定 Goal 的 Runtime 会话并注册按交互种类分派的处理函数；
 * 历史等待不会因此被自动回答，只有本实例新产生的等待或宿主显式恢复发现的请求才会
 * 投递。`read` 只读读取当前等待的类型化视图，不推进状态。解除句柄不取消 Goal。
 *
 * @example
 * ```ts
 * const attached = await root.interactions.attach("goal-1", { onTaskApproval: async () => ({ kind: "unhandled" }) });
 * ```
 */
export interface RuntimeInteractionPort {
    /**
     * 打开 Goal 会话并注册交互处理器。
     *
     * @param goalId - 目标 Goal 的稳定标识。
     * @param handlers - 按交互种类注册的处理函数。
     * @param options - 可选的故障报告回调。
     * @returns 已连接句柄，或会话不可用、已有自动所有者时的稳定拒绝。
     */
    attach(
        goalId: string,
        handlers: SessionInteractionHandlers,
        options?: InteractionHandlerAttachOptions,
    ): Promise<InteractionHandlerAttachResult>;
    /**
     * 只读读取当前等待的类型化视图。
     *
     * @param goalId - 目标 Goal 的稳定标识。
     * @returns 当前等待视图；Goal 缺失或没有可决定等待时返回 `undefined`。
     */
    read(goalId: string): Promise<GoalInteractionView | undefined>;
}

export interface RuntimeComposition {
    readonly workspaceRoot: string;
    /** 本工作区的稳定身份；权限档位、授权账本与 Trigger 绑定都使用它。 */
    readonly workspaceId: string;
    readonly workspaceHomeDirectory: string;
    readonly dataDirectory: string;
    readonly goalsDirectory: string;
    readonly llmConfig?: LLMConfig;
    /** 受管 Provider 档案存储，供 Settings 管理接口使用。 */
    readonly providerProfileStore: JsonFileProviderProfileStore;
    /** 当前工作区权限档位的持久化存储；worker 与 Web 共用同一记录。 */
    readonly permissionProfileStore: ProjectPermissionProfileStore;
    /** 启动时读取的受管 Provider 档案快照；最新状态以 `providerProfileStore` 为准。 */
    readonly providerProfiles: readonly ProviderProfile[];
    /** 受管档案变更后刷新运行时解析视图。 */
    readonly refreshProviderProfiles: () => Promise<void>;
    /**
     * 解析指定档案与模型对应的连接配置。
     * @throws ProviderProfileResolutionError 档案不在当前集合中时抛出。
     */
    readonly resolveProviderProfileConfig: (profileId: string, modelId: string) => LLMConfig;
    readonly conversationCharBudget: number;
    readonly contextCompactor: DropOldestContextCompactor;
    readonly modelInputEstimator: ModelInputEstimator;
    readonly modelCapabilities?: ModelCapabilities;
    readonly modelContextPolicy: ModelContextBudgetPolicy;
    readonly trajectoryContextAssembler: TrajectoryModelContextAssembler;
    readonly adapter: LLMAdapter;
    /**
     * 为一次性纯文本请求构造指定模型选择对应的摘要 Adapter。
     *
     * @remarks
     * 只构造 Adapter，不发布或修改进程级模型绑定；档案身份与动态执行元数据按该选择解析。
     * 返回的 Adapter 用于不携带结构化输出、不携带工具的一次性文本生成，调用方应传入
     * 服务端已解析的模型选择，并为 OpenCode Go 请求提供稳定的 `sessionId`。
     *
     * @param selection - 经服务端模型目录确认可选的完整模型选择。
     * @returns 与该选择对应、可独立用于一次性纯文本请求的 Adapter。
     * @throws ProviderProfileResolutionError 当选择引用的档案不再可用时抛出。
     * @throws ModelBindingUnavailableError 当选择的 Provider 与其连接配置不一致时抛出。
     * @throws LLMConfigurationError 当动态模型执行元数据不完整或无效时抛出。
     * @example
     * ```ts
     * const adapter = root.createSummaryAdapterForSelection(selection);
     * ```
     */
    readonly createSummaryAdapterForSelection: (selection: GoalModelSelection) => LLMAdapter;
    readonly profile: AgentProfile;
    readonly profiles: AgentProfileRegistry;
    readonly readFileTool?: ReadFileTool;
    readonly toolRegistry: InMemoryToolRegistry;
    readonly toolPolicy: ToolPolicy;
    readonly store: GoalStore & GoalCatalog;
    readonly workspaceGoalStore: Pick<GoalStore, "restore"> & GoalCatalog;
    readonly manageGoal: {
        readonly setArchived: (goalId: string, archived: boolean) => Promise<"ok" | "goal_not_found" | "goal_not_terminal" | "goal_has_pending_inputs">;
        readonly delete: (goalId: string) => Promise<"ok" | "goal_not_found" | "goal_not_terminal" | "goal_has_pending_inputs">;
    };
    readonly notifyingStore: NotifyingGoalStore;
    readonly trajectoryStore: TrajectoryStore;
    /** 正式工作区的可查询 Trajectory Store；Browser 轨迹路由只使用这一实例。 */
    readonly workspaceTrajectoryStore: TrajectoryStore & TrajectoryQueryPort;
    readonly contextLookupService: IndexedContextLookupService;
    readonly modelCatalog: LlmModelCatalog;
    readonly modelBinding: MutableModelBinding;
    /** 按已保存的 Goal 选择发布阶段适配器。档案或供应商不可用时抛出异常并保留当前绑定。 */
    readonly alignModelBinding: (selection: GoalModelSelection) => void;
    readonly goalModelSelectionCoordinator: GoalModelSelectionCoordinator;
    readonly defaultModelSelection: GoalModelSelection;
    readonly retrievalIndexStore: JsonFileContextRetrievalIndexStore;
    readonly traceSink: JsonFileDiagnosticTraceSink;
    readonly metricsStore: JsonFileMetricsStore;
    /** 指标核心服务；HTTP 指标路由由消费者装配。 */
    readonly sessionMetricsService: SessionMetricsService;
    readonly protocolValidator: GoalProtocolValidator;
    readonly workingMemoryLimits: WorkingMemoryLimits;
    readonly checkpointCommitter: TrajectoryCheckpointCommitter;
    readonly executionStream: ExecutionStreamPublisher;
    readTrajectory(
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>>;
    readWorkspaceTrajectory(
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>>;
    readWorkspaceModelInputs(goalId: string, runId: string): Promise<readonly import("../../../../packages/runtime/src/model-input").ModelInputRecord[]>;
    readonly checkpointStore: CheckpointGateGoalStore;
    /**
     * 现有无界面装配暴露的内部会话操作。
     *
     * @remarks
     * 仓库内调用方通过该入口完成创建、流式交互、审批、关闭与重建恢复，不需要启动
     * HTTP、绑定端口或手工组合 Runner。它不是对外稳定的 SDK API。
     *
     * @example
     * ```ts
     * const created = await root.sessions.create({
     *     goalId: "goal-1", inputId: "input-1", content: "实现恢复能力", profileId: "default",
     * });
     * if (created.ok) await created.session.send({ kind: "message", inputId: "input-2", content: "继续" });
     * ```
     */
    readonly sessions: SessionManager;
    /**
     * 无界面宿主接入会话交互处理器的窄入口。
     *
     * @remarks
     * 只做「打开 Goal 会话 → 注册处理器」与只读等待视图读取，不暴露 SessionManager
     * 内部对象，也不需要启动 HTTP 或绑定进程信号。处理器结果仍按统一 `send`
     * 受理，受既有身份、授权与提交规则约束；同一 Goal 只允许一个自动所有者。
     *
     * @example
     * ```ts
     * const attached = await root.interactions.attach("goal-1", {
     *     onQuestion: async () => ({ kind: "respond", response: { kind: "skip_question" } }),
     * });
     * if (!attached.ok) console.error(attached.code);
     * ```
     */
    readonly interactions: RuntimeInteractionPort;
    readonly resources: ManagedResourceRegistry;
    readonly abortController: AbortController;
    readonly lifecycle: RuntimeLifecycle;
    /** 调用方需要的执行与控制命令；写控制已纳入实例受理与关闭结算边界。 */
    readonly commands: ExecutionCommands;
    readonly launcher: {
        launch: (request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) => ReturnType<typeof launch>;
    };
    readonly browserLauncher: {
        launch: (request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) => ReturnType<typeof launch>;
    };
    /**
     * 把宿主已受理的写操作纳入同一生命周期受理边界。
     *
     * @param label - 关闭失败报告中使用的操作类别。
     * @param operation - 已受理的实际写操作。
     * @returns 操作结果；实例进入 closing 或 closed 后以 `RuntimeLifecycleUnavailableError` 拒绝，并持续参与关闭结算直到完成。
     */
    runTrackedOperation<T>(label: string, operation: () => Promise<T>): Promise<T>;
    /** 默认 Goal ID 生成器；省略时使用随机 UUID，调用方通常显式提供目标 Goal ID。 */
    readonly goalIdGenerator: () => string;
    readonly runIdGenerator: () => string;
}

export async function resolveWorkspaceRoot(
    cwd: string = process.cwd(),
): Promise<string> {
    return realpath(cwd);
}

/**
 * 读取受管激活档案。
 *
 * @remarks
 * 未设置激活标识时返回 `undefined`；标识存在但不在集合中时由 Store 读取阶段 fail-fast，不静默回退。
 */
async function readActiveProviderProfile(
    store: JsonFileProviderProfileStore,
    profiles: readonly ProviderProfile[],
): Promise<ProviderProfile | undefined> {
    const activeProfileId = await store.activeProfileId();
    if (activeProfileId === undefined) return undefined;
    return profiles.find((profile) => profile.id === activeProfileId);
}

export async function createRuntimeComposition(
    options: RuntimeCompositionOptions = {},
): Promise<RuntimeComposition> {
    const resources = options.resources ?? new ManagedResourceRegistry();
    try {
        return await assembleRuntimeComposition(options, resources);
    } catch (error) {
        // 装配失败时只结算实例自有资源；借出的 Port、Store 与控制器保持原状，初始故障原样抛出。
        await resources.closeAll().catch(() => undefined);
        throw error;
    }
}

async function assembleRuntimeComposition(
    options: RuntimeCompositionOptions,
    resources: ManagedResourceRegistry,
): Promise<RuntimeComposition> {
    const env = options.env ?? process.env;
    const homePaths = resolveLazyGoalHomePaths(env);
    const providerProfileStore = options.providerProfileStore ?? new JsonFileProviderProfileStore(homePaths);
    // 注入适配器时由调用方拥有模型构造，不读取真实 Home 的 Provider 档案，保持测试与外部组合的确定性。
    const managesProviderProfiles = options.providerProfiles !== undefined || options.adapter === undefined;
    let providerProfiles: readonly ProviderProfile[] = managesProviderProfiles
        ? options.providerProfiles ?? await providerProfileStore.list()
        : [];
    let providerProfileById = new Map(providerProfiles.map((profile) => [profile.id, profile]));
    const activeProviderProfile = managesProviderProfiles && options.providerProfiles === undefined
        ? await readActiveProviderProfile(providerProfileStore, providerProfiles)
        : undefined;
    /**
     * 受管档案变更后刷新运行时解析视图。
     *
     * @remarks
     * 仅重建档案视图；已发布的模型绑定保持不变，后续解析使用刷新后的视图。
     * 注入档案集合时由调用方拥有该集合，刷新为空操作。
     */
    const refreshProviderProfiles = async (): Promise<void> => {
        if (!managesProviderProfiles || options.providerProfiles !== undefined) return;
        providerProfiles = await providerProfileStore.list();
        providerProfileById = new Map(providerProfiles.map((profile) => [profile.id, profile]));
    };
    let llmConfig: LLMConfig | undefined;
    let bootConfigFromProfile = false;
    let adapter: LLMAdapter;
    let configuredStageAdapters: Readonly<LlmStageAdapters> | undefined;
    if (options.adapter !== undefined) {
        adapter = options.adapter;
        try {
            llmConfig = readLLMConfig(env);
            configuredStageAdapters = createLlmStageAdapters(configuredModelAdapterConfig(llmConfig));
        } catch {
            llmConfig = undefined;
            configuredStageAdapters = undefined;
        }
    } else {
        try {
            llmConfig = readLLMConfig(env);
        } catch (error) {
            if (activeProviderProfile !== undefined) {
                // 受管激活档案优先于 TOML 回退；环境变量仍是显式覆盖。
                llmConfig = toLlmConfig(activeProviderProfile, { model: activeProviderProfile.defaultModel });
                bootConfigFromProfile = true;
            } else {
                const hasHomeConfig = existsSync(homePaths.configFile)
                    || existsSync(join(homePaths.profilesDir, "default.toml"));
                if (hasHomeConfig) {
                    const runtimeConfig = await loadRuntimeConfig({ env, homePaths });
                    llmConfig = runtimeConfig.llm;
                } else {
                    if (error instanceof LLMConfigurationError) {
                        throw new LLMConfigurationError(
                            error.missing,
                            `${error.message}。请在 ${homePaths.configFile} 配置，或通过环境变量传入；如需迁移，请手动复制到该 Home 文件。`,
                        );
                    }
                    throw error;
                }
            }
        }
        configuredStageAdapters = createLlmStageAdapters(configuredModelAdapterConfig(llmConfig));
        adapter = configuredStageAdapters.decideAdapter;
    }
    const conversationCharBudget = readConversationCharBudget(env);
    const configuredEstimator = resolveModelInputEstimator(options.modelInputEstimator);
    const modelCapabilities = readModelCapabilities(env, configuredEstimator);
    const modelInputEstimator = modelCapabilities?.tokenEstimator ?? configuredEstimator;
    const contextConfig = options.contextConfig ?? await loadContextConfig({ homePaths });
    const resolveGoalEpochCapacity = (goal: Goal): EpochCapacity => resolveEpochCapacity({
        modelContextWindowTokens: goal.state.modelSelection.contextWindowTokens
            ?? modelCapabilities?.contextWindowTokens,
        configuredLimitTokens: contextConfig?.epochLimitTokens,
        thresholdPercent: contextConfig?.compactThresholdPercent,
    });
    const workspaceRoot = await resolveWorkspaceRoot(options.cwd ?? process.cwd());
    const workspaceIdentityRoot = await resolveWorkspaceRoot(options.workspaceIdentityRoot ?? workspaceRoot);
    const workspaceHomePaths = await resolveWorkspaceHomePaths(homePaths, workspaceIdentityRoot);
    const dataDirectory = options.dataDirectory !== undefined
        ? resolve(options.dataDirectory)
        : workspaceHomePaths.workspaceDirectory;
    const goalsDirectory = join(dataDirectory, "goals");
    const profilesDirectory = homePaths.agentProfilesDir;
    const profilePath = join(profilesDirectory, `${DEFAULT_PROFILE_ID}.json`);

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
            const hasHomeConfig = existsSync(homePaths.configFile);
            const hasHomeProfile = existsSync(join(homePaths.profilesDir, `${DEFAULT_PROFILE_ID}.toml`));
            if (!hasHomeConfig && !hasHomeProfile) {
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
                toolIds: [...DEFAULT_TOOL_IDS],
            };
        }

        profiles = {
            get(profileId: string): AgentProfile | undefined {
                return profileId === profile.id ? profile : undefined;
            },
        };
    }

    const abortController = options.abortController ?? new AbortController();
    const hostInstanceId = randomUUID();
    const processSessionStore = new JsonFileProcessSessionStore(dataDirectory, hostInstanceId);
    const processManager = new ProcessManager({
        store: processSessionStore,
        hostInstanceId,
        resources,
    });

    let toolRegistry: InMemoryToolRegistry;
    let readFileTool: ReadFileTool | undefined;
    if (options.toolRegistry !== undefined) {
        toolRegistry = options.toolRegistry;
        readFileTool = undefined;
    } else {
        readFileTool = new ReadFileTool(workspaceRoot);
        toolRegistry = new InMemoryToolRegistry(createDefaultToolRegistrations(workspaceRoot, {
            processManager,
            processSessionStore,
        }));
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

    if (options.dataDirectory === undefined) {
        await ensureSecureHomeDirectories(homePaths);
        if (existsSync(homePaths.configFile)) {
            await ensureSecureConfigFile(homePaths.configFile);
        }
        if (existsSync(profilePath)) {
            await ensureSecureConfigFile(profilePath);
        }
        await ensureWorkspaceManifest(workspaceHomePaths, workspaceRoot);
        if (dataDirectory === workspaceHomePaths.workspaceDirectory) {
            await ensureSecureWorkspaceDirectories(workspaceHomePaths);
        }
    }

    const modelContextPolicy = options.modelContextBudget === undefined
        ? modelCapabilities === undefined
            ? createDefaultModelContextBudgetPolicy(modelInputEstimator)
            : createModelContextBudgetPolicy({
                modelInputBudget: Math.floor(modelCapabilities.contextWindowTokens * 0.95),
                responseReserve: modelCapabilities.maxOutputTokens,
            }, modelInputEstimator)
        : createModelContextBudgetPolicy(
            options.modelContextBudget,
            modelInputEstimator,
        );
    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor(
        conversationCharBudget,
    );

    // Web Composition Root 直接使用正式工作区 GoalStore 与 TrajectoryStore，不使用终端 AggregatedStore
    const primaryGoalStore = new JsonFileGoalStore(goalsDirectory);
    const store: GoalStore & GoalCatalog = options.goalStore === undefined
        ? primaryGoalStore
        : {
            save: (goal) => options.goalStore!.save(goal),
            restore: (goalId) => options.goalStore!.restore(goalId),
            ...(options.goalStore.readRevision === undefined
                ? {}
                : { readRevision: (goalId: string) => options.goalStore!.readRevision!(goalId) }),
            listResumable: () => primaryGoalStore.listResumable(),
            listHistory: () => primaryGoalStore.listHistory(),
        };
    const metricsStore = new JsonFileMetricsStore(goalsDirectory);
    const sessionMetricsService = new SessionMetricsService(store, metricsStore, metricsStore, (goal) => tryResolveEpochCapacity({
        modelContextWindowTokens: goal.state.modelSelection.contextWindowTokens
            ?? modelCapabilities?.contextWindowTokens,
        configuredLimitTokens: contextConfig?.epochLimitTokens,
        thresholdPercent: contextConfig?.compactThresholdPercent,
    }));
    const metricsAwareGoalStore: GoalStore = {
        async save(goal) {
            await store.save(goal);
        },
        async restore(goalId) {
            const goal = await store.restore(goalId);
            if (goal !== undefined) {
                try {
                    await sessionMetricsService.initializeExistingGoal(goalId);
                } catch {
                    // 缺少覆盖标记时保守报告
                }
            }
            return goal;
        },
    };
    const primaryTrajectoryStore = new JsonFileTrajectoryStore(goalsDirectory);
    const sandboxGrantStore = new JsonFileSandboxGrantStore(workspaceHomePaths.workspaceDirectory);
    const permissionProfileStore = options.permissionProfileStore
        ?? new JsonFileProjectPermissionProfileStore(workspaceHomePaths.workspaceDirectory);
    const trajectoryStore = primaryTrajectoryStore;
    const retrievalIndexStore = new JsonFileContextRetrievalIndexStore(goalsDirectory);
    const contextLookupService = new IndexedContextLookupService({
        trajectoryStore,
        indexStore: retrievalIndexStore,
    });
    const traceSink = new JsonFileDiagnosticTraceSink(goalsDirectory);
    const modelInputStore = new JsonFileModelInputStore(goalsDirectory);
    const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: modelContextPolicy,
    });
    const notifyingStore = new NotifyingGoalStore(metricsAwareGoalStore);
    const unsubscribeMetricUpdates = notifyingStore.onSave((goal) => {
        sessionMetricsService.notifyGoalSaved(goal.id);
    });
    resources.register({ close: () => unsubscribeMetricUpdates() });
    const checkpointStore = new CheckpointGateGoalStore(notifyingStore);
    const lifecycle = new RuntimeLifecycle({
        checkpointStore,
        resources,
        abortController,
        ...(options.gracePeriodMs === undefined ? {} : { gracePeriodMs: options.gracePeriodMs }),
    });
    const protocolValidator = createDefaultPromptBundleProtocolValidator();
    const workingMemoryLimits: WorkingMemoryLimits = DEFAULT_WORKING_MEMORY_LIMITS;
    const checkpointCommitter = new TrajectoryCheckpointCommitter({
        store: checkpointStore,
        trajectoryStore,
        traceSink,
    });
    const executionStream = new InMemoryExecutionStreamPublisher();
    resources.register({ close: () => executionStream.dispose() });
    const toolPolicy = options.toolPolicy ?? createDefaultToolPolicy();
    const defaultExecutionMetadata = llmConfig?.provider === "opencode-go"
        ? resolveOpenCodeGoExecutionMetadata(llmConfig.model)
        : undefined;
    const defaultModelSelection: GoalModelSelection = options.modelBinding?.current().selection ?? {
        provider: llmConfig?.provider ?? ((adapter as { readonly provider?: string }).provider as GoalModelSelection["provider"] | undefined) ?? "openai",
        ...(bootConfigFromProfile && activeProviderProfile !== undefined ? { profileId: activeProviderProfile.id } : {}),
        modelId: llmConfig?.model ?? (adapter as { readonly modelId?: string }).modelId ?? "default-model",
        structuredOutputMode: llmConfig?.structuredOutputMode ?? adapter.structuredOutputMode ?? "prompt_only",
        ...(defaultExecutionMetadata === undefined ? {} : { executionApi: defaultExecutionMetadata.executionApi }),
        ...(defaultExecutionMetadata === undefined ? {} : { reasoning: defaultExecutionMetadata.reasoning }),
        ...(defaultExecutionMetadata === undefined ? {} : { vision: defaultExecutionMetadata.vision }),
        ...(defaultExecutionMetadata === undefined
            ? {}
            : { supportsRequiredToolChoice: defaultExecutionMetadata.supportsRequiredToolChoice }),
        ...(defaultExecutionMetadata !== undefined ? {
            contextWindowTokens: defaultExecutionMetadata.contextWindowTokens,
            maxOutputTokens: defaultExecutionMetadata.maxOutputTokens,
        } : modelCapabilities === undefined ? {
            contextWindowTokens: DEFAULT_GOAL_MODEL_SELECTION.contextWindowTokens!,
            maxOutputTokens: DEFAULT_GOAL_MODEL_SELECTION.maxOutputTokens!,
        } : {
            contextWindowTokens: modelCapabilities.contextWindowTokens,
            maxOutputTokens: modelCapabilities.maxOutputTokens,
        }),
        inputEstimator: modelCapabilities !== undefined && "encoding" in modelCapabilities.tokenEstimator
            ? { kind: "token-encoding" as const, encoding: (modelCapabilities.tokenEstimator as { encoding: "cl100k_base" | "o200k_base" }).encoding }
            : { kind: "character-v1" as const },
    };
    const initialStageAdapters = Object.freeze({
        thinkAdapter: options.thinkAdapter
            ?? (options.adapterFactory !== undefined
                ? options.adapterFactory(defaultModelSelection, "think")
                : configuredStageAdapters?.thinkAdapter ?? adapter),
        decideAdapter: adapter,
    });
    const resolveProviderProfileConfig = (profileId: string, modelId: string): LLMConfig => {
        const profile = providerProfileById.get(profileId);
        if (profile === undefined) throw new ProviderProfileResolutionError(profileId);
        return toLlmConfig(profile, { model: modelId });
    };
    const createStageAdaptersForSelection = (
        selection: GoalModelSelection,
    ): Readonly<LlmStageAdapters> => {
        if (options.adapterFactory !== undefined) {
            return Object.freeze({
                thinkAdapter: options.adapterFactory(selection, "think"),
                decideAdapter: options.adapterFactory(selection, "decide"),
            });
        }
        const baseConfig = selection.profileId === undefined
            ? llmConfig
            : resolveProviderProfileConfig(selection.profileId, selection.modelId);
        if (baseConfig !== undefined) {
            let selectionConfig: LLMConfig = { ...baseConfig, model: selection.modelId };
            if (selection.executionApi !== undefined) {
                const metadata = resolveOpenCodeGoExecutionMetadata(selection.modelId);
                if (baseConfig.provider !== "opencode-go") {
                    throw new LLMConfigurationError([], `Saved execution metadata requires OpenCode Go for model "${selection.modelId}"`);
                }
                if (selection.executionApi !== "openai-completions"
                    || selection.contextWindowTokens === undefined
                    || selection.maxOutputTokens === undefined) {
                    throw new LLMConfigurationError([], `Saved execution metadata is unavailable for model "${selection.modelId}"`);
                }
                selectionConfig = {
                    provider: "opencode-go",
                    model: selection.modelId,
                    apiKey: baseConfig.apiKey,
                    structuredOutputMode: baseConfig.structuredOutputMode,
                    executionApi: selection.executionApi,
                    contextWindowTokens: selection.contextWindowTokens,
                    maxOutputTokens: selection.maxOutputTokens,
                    reasoning: selection.reasoning ?? metadata?.reasoning ?? false,
                    ...(selection.vision === undefined && metadata === undefined
                        ? {}
                        : { vision: selection.vision ?? metadata?.vision ?? false }),
                    ...(selection.supportsRequiredToolChoice === undefined && metadata === undefined
                        ? {}
                        : {
                            supportsRequiredToolChoice: selection.supportsRequiredToolChoice
                                ?? metadata?.supportsRequiredToolChoice,
                        }),
                };
            }
            return createLlmStageAdapters(selectionConfig);
        }
        if (selection.executionApi !== undefined) {
            throw new LLMConfigurationError([], `Provider configuration is unavailable for dynamic model "${selection.modelId}"`);
        }
        return Object.freeze({ thinkAdapter: adapter, decideAdapter: adapter });
    };
    const modelCatalog = options.modelCatalog ?? createLlmModelCatalog();
    const modelBinding = options.modelBinding ?? new MutableModelBinding(
        createModelExecutionBinding({
            generation: 1,
            selection: defaultModelSelection,
            ...initialStageAdapters,
            trajectoryStore,
            modelContextBudget: options.modelContextBudget,
            customEstimator: modelInputEstimator,
        }),
    );
    const alignModelBinding = (selection: GoalModelSelection): void => {
        const candidate = modelBinding.createCandidate({
            selection,
            ...createStageAdaptersForSelection(selection),
            trajectoryStore,
            modelContextBudget: options.modelContextBudget,
            customEstimator: modelInputEstimator,
        });
        modelBinding.publish(candidate);
    };
    const assertModelSelectionProvider = (selection: GoalModelSelection): void => {
        const expectedProvider = selection.profileId === undefined
            ? defaultModelSelection.provider
            : resolveProviderProfileConfig(selection.profileId, selection.modelId).provider;
        if (selection.provider !== expectedProvider) {
            throw new ModelBindingUnavailableError(selection.provider, expectedProvider);
        }
    };
    const createSummaryAdapterForSelection = (selection: GoalModelSelection): LLMAdapter => {
        assertModelSelectionProvider(selection);
        return createStageAdaptersForSelection(selection).thinkAdapter;
    };
    const goalIdGenerator = options.goalIdGenerator ?? randomUUID;
    const runIdGenerator = options.runIdGenerator ?? randomUUID;
    /**
     * 会话执行前的模型绑定对齐。
     *
     * @remarks
     * 缺失或本进程不可服务的模型选择必须明确失败，而不是回退另一个 Goal 或进程
     * 默认 Provider 的配置：这里在发布 Binding 前核验 Goal 选择的 provider 与本
     * 进程真正可用的连接一致。核验失败会中止本次推进，Run 保留真实可恢复状态。
     */
    const alignGoalModelBinding = (selection: GoalModelSelection): void => {
        assertModelSelectionProvider(selection);
        alignModelBinding(selection);
    };
    const contextCompaction: NonNullable<RunnerDependencies["contextCompaction"]> = {
        readOccupancy: async (goal) => {
            const snapshot = await sessionMetricsService.read(goal.id);
            const usage = snapshot?.contextUsage;
            if (usage === undefined || usage === null) return null;
            const capacity = tryResolveEpochCapacity({
                modelContextWindowTokens: goal.state.modelSelection.contextWindowTokens
                    ?? modelCapabilities?.contextWindowTokens,
                configuredLimitTokens: contextConfig?.epochLimitTokens,
                thresholdPercent: contextConfig?.compactThresholdPercent,
            });
            if (capacity === undefined) return null;
            return {
                occupiedTokens: Math.round(usage.usedPercent * usage.capacityTokens),
                capacityTokens: usage.capacityTokens,
                thresholdPercent: capacity.thresholdPercent,
            };
        },
        compact: async (input) => {
            const prompt = await renderContextCompactionPrompt(input);
            const response = await modelBinding.current().decideAdapter.generate({
                messages: [{ role: "system", content: prompt }],
                ...(modelCapabilities === undefined
                    ? {}
                    : { maxOutputTokens: modelCapabilities.maxOutputTokens }),
            });
            const text = readAssistantText(response).trim();
            return text.length === 0 ? undefined : text;
        },
    };
    const executionComponents = createExecutionComponents({
        store: checkpointStore,
        executor: await createAgentExecutor({
            bindingProvider: modelBinding,
            renderer,
            contextCompactor,
            traceSink,
            modelInputStore,
            metricsRecorder: sessionMetricsService,
            trajectoryContextAssembler,
            ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
            assertEpochCapacity: (goal) => {
                resolveGoalEpochCapacity(goal);
            },
        }),
        profiles,
        toolRegistry,
        toolPolicy,
        sandboxGrantStore,
        permissionProfileStore,
        workspaceId: workspaceHomePaths.workspaceId,
        workspaceRoot,
        sandboxPlanResolver: ({ workspaceRoot, action, effectiveScope }) => effectiveScope === undefined
            ? undefined
            : { actionId: action.actionId, workspaceRoot, scope: effectiveScope },
        contextCompaction,
        trajectoryStore,
        traceSink,
        workingMemoryLimits,
        protocolValidator,
        checkpointCommitter,
        contextLookupPort: contextLookupService,
        executionStream,
        runIdGenerator,
    });
    const sessionDependencies: SessionManagerDependencies = {
        store: checkpointStore,
        committer: checkpointCommitter,
        coordinator: executionComponents.commands,
        profiles,
        runIdGenerator,
        protocolValidator,
        trajectoryStore,
        traceSink,
        alignModelBinding: alignGoalModelBinding,
        defaultModelSelection,
        executionStream,
        onBackgroundFailure: (goalId, error) => {
            // 后台执行异常已经写入真实恢复状态；这里只保留诊断事实。
            void traceSink.append(allocateDiagnosticTraceRecord({
                goalId,
                runId: "session-execution",
                kind: "session_execution_failed",
                payload: { reason: error instanceof Error ? error.message : String(error) },
            })).catch(() => undefined);
        },
        trackBackgroundTask: (label, task) => {
            const release = lifecycle.beginOperation(label);
            void task.finally(() => release());
        },
    };
    const sessions = new SessionManager(sessionDependencies);
    resources.register({
        close: () => sessions.close({ timeoutMs: 5000 }),
    });
    const rawCommands = executionComponents.commands;
    /** 将已受理的写操作纳入同一生命周期边界；读取保持可用，不受关闭阻塞。 */
    const runTrackedOperation = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
        const release = lifecycle.beginOperation(label);
        try {
            return await operation();
        } finally {
            release();
        }
    };
    const commands: ExecutionCommands = {
        launch: (request, control) =>
            runTrackedOperation("launch", () => rawCommands.launch(
                request.modelSelection === undefined
                    ? { ...request, modelSelection: defaultModelSelection }
                    : request,
                control,
            )),
        advance: (ref, control) =>
            runTrackedOperation("advance", () => rawCommands.advance(ref, control)),
        resume: (request, control) =>
            runTrackedOperation("resume", () => rawCommands.resume(request, control)),
        resumeForSession: (request, sessionInput, control) =>
            runTrackedOperation(
                "resume_for_session",
                () => rawCommands.resumeForSession(request, sessionInput, control),
            ),
        scheduleAuthorizedAction: (ref, authorizedActionId, control) =>
            runTrackedOperation(
                "schedule_authorized_action",
                () => rawCommands.scheduleAuthorizedAction(ref, authorizedActionId, control),
            ),
        continue: (ref, content, control, continuation, queueBinding) =>
            runTrackedOperation("continue", () => rawCommands.continue(ref, content, control, continuation, queueBinding)),
        commitContinuation: (ref, content, inputId, control) =>
            runTrackedOperation("commit_continuation", () => rawCommands.commitContinuation(ref, content, inputId, control)),
        steer: (ref, messageId, content, ledger) =>
            runTrackedOperation("steer", () => rawCommands.steer(ref, messageId, content, ledger)),
        interrupt: (ref, requestId, ledger) =>
            runTrackedOperation("interrupt", () => rawCommands.interrupt(ref, requestId, ledger)),
        enterPlanMode: (ref, control) =>
            runTrackedOperation("enter_plan_mode", () => rawCommands.enterPlanMode(ref, control)),
        getPermissionProfile: () => rawCommands.getPermissionProfile(),
        setPermissionProfile: (profile, expectedRevision) =>
            runTrackedOperation("set_permission_profile", () => rawCommands.setPermissionProfile(profile, expectedRevision)),
        listGrants: (ref) => rawCommands.listGrants(ref),
        revokeGrant: (request) =>
            runTrackedOperation("revoke_grant", () => rawCommands.revokeGrant(request)),
        reviewActionApproval: (request, control) =>
            runTrackedOperation("review_action_approval", () => rawCommands.reviewActionApproval(request, control)),
    };
    const launcher = {
        async launch(request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) {
            return runTrackedOperation("launch", async () => {
                try {
                    await sessionMetricsService.initializeNewGoal(request.goalId);
                } catch {
                    // 覆盖标记旁路失败忽略
                }
                // 未指定选择时冻结本实例真正服务的默认选择，避免记录无法在本实例执行的占位值。
                return rawCommands.launch(
                    request.modelSelection === undefined
                        ? { ...request, modelSelection: defaultModelSelection }
                        : request,
                    control,
                );
            });
        },
    };
    const browserLauncher = {
        async launch(request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) {
            if (request.modelSelection === undefined) throw new Error("Browser launch requires model selection");
            const previous = modelBinding.current().selection;
            alignModelBinding(request.modelSelection);
            try {
                return await launcher.launch(request, control);
            } finally {
                const saved = await primaryGoalStore.restore(request.goalId);
                if (saved === undefined) alignModelBinding(previous);
            }
        },
    };
    const readTrajectory = (
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>> =>
        readTrajectoryAtSnapshot(checkpointStore, trajectoryStore, query);
    const readWorkspaceTrajectory = (
        query: TrajectoryReadQuery,
    ): Promise<Readonly<TrajectoryReadResult>> =>
        readTrajectoryAtSnapshot(primaryGoalStore, primaryTrajectoryStore, query);

    const rawModelSelectionCoordinator = options.goalModelSelectionCoordinator
        ?? new DefaultGoalModelSelectionCoordinator({ store: checkpointStore });
    const goalModelSelectionCoordinator: GoalModelSelectionCoordinator = {
        updateModelSelection: (request, control) =>
            runTrackedOperation("model_selection", () => rawModelSelectionCoordinator.updateModelSelection(request, control)),
    };

    return {
        workspaceRoot,
        workspaceId: workspaceHomePaths.workspaceId,
        workspaceHomeDirectory: workspaceHomePaths.workspaceDirectory,
        dataDirectory,
        goalsDirectory,
        ...(llmConfig === undefined ? {} : { llmConfig }),
        providerProfileStore,
        permissionProfileStore,
        providerProfiles,
        refreshProviderProfiles,
        resolveProviderProfileConfig,
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
        store,
        workspaceGoalStore: primaryGoalStore,
        manageGoal: {
            setArchived: (goalId, archived) =>
                runTrackedOperation("archive_goal", async () => {
                    const goal = await primaryGoalStore.restore(goalId);
                    if (goal === undefined) return "goal_not_found";
                    const status = goal.state.run.status;
                    if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
                    if (hasUnsettledSessionWork(goal)) return "goal_has_pending_inputs";
                    await primaryGoalStore.setArchived(goalId, archived);
                    return "ok";
                }),
            delete: (goalId) =>
                runTrackedOperation("delete_goal", async () => {
                    const goal = await primaryGoalStore.restore(goalId);
                    if (goal === undefined) return "goal_not_found";
                    const status = goal.state.run.status;
                    if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
                    if (hasUnsettledSessionWork(goal)) return "goal_has_pending_inputs";
                    await sandboxGrantStore.deleteGoalGrants(workspaceHomePaths.workspaceId, goalId);
                    await processSessionStore.deleteGoalSessions(goalId);
                    await primaryGoalStore.deleteTerminal(goalId);
                    return "ok";
                }),
        },
        notifyingStore,
        trajectoryStore,
        workspaceTrajectoryStore: primaryTrajectoryStore,
        contextLookupService,
        retrievalIndexStore,
        traceSink,
        metricsStore,
        sessionMetricsService,
        protocolValidator,
        workingMemoryLimits,
        checkpointCommitter,
        executionStream,
        readTrajectory,
        readWorkspaceTrajectory,
        readWorkspaceModelInputs: (goalId, runId) => new JsonFileModelInputStore(goalsDirectory).read(goalId, runId),
        checkpointStore,
        sessions,
        interactions: {
            attach: async (goalId, handlers, options) => {
                const opened = await runTrackedOperation("interaction-attach", () => sessions.open(goalId));
                if (!opened.ok) {
                    return { ok: false, code: "SESSION_DETACHED", message: opened.error.message };
                }
                return opened.session.attachInteractionHandlers(handlers, options);
            },
            read: (goalId) => sessions.readSessionInteraction(goalId),
        },
        resources,
        abortController,
        lifecycle,
        commands,
        runTrackedOperation,
        modelCatalog,
        modelBinding,
        createSummaryAdapterForSelection,
        alignModelBinding: alignGoalModelBinding,
        goalModelSelectionCoordinator,
        defaultModelSelection,
        launcher,
        browserLauncher,
        goalIdGenerator,
        runIdGenerator,
    };
}
