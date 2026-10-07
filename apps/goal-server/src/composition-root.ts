import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../../packages/tool-core/src/index";
import {
    CheckpointGateGoalStore,
    ManagedResourceRegistry,
    ProcessExitPort,
    ShutdownCoordinator,
    GoalCoordinator,
    DefaultGoalModelSelectionCoordinator,
    InlineScheduler,
    Runner,
    TrajectoryCheckpointCommitter,
    readTrajectoryAtSnapshot,
    launch,
    type AgentProfile,
    type AgentProfileRegistry,
    type GoalCatalog,
    type GoalStore,
    type GoalModelSelection,
    type GoalModelSelectionCoordinator,
    type ExitPort,
    type GoalProtocolValidator,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
    type ToolPolicy,
    IndexedContextLookupService,
} from "../../../packages/runtime/src/index";
import {
    DEFAULT_WORKING_MEMORY_LIMITS,
    type WorkingMemoryLimits,
} from "../../../packages/working-memory/src/index";
import {
    AgentProfileConfigurationError,
    JsonFileDiagnosticTraceSink,
    JsonFileModelInputStore,
    JsonFileAgentProfileStore,
    JsonFileGoalStore,
    JsonFileMetricsStore,
    JsonFileTrajectoryStore,
    JsonFileContextRetrievalIndexStore,
    JsonFileToolGrantStore,
    JsonFileSandboxGrantStore,
    JsonFileProjectPermissionModeStore,
    JsonFileModelPreferenceStore,
    JsonFileProcessSessionStore,
} from "../../../packages/storage/src/index";
import {
    createHttpService,
    type HttpService,
    type HttpServiceMiddleware,
} from "../../../packages/http/src/index";
import {
    BrowserGoalCommandService,
    BrowserGoalStreamService,
    createBrowserGoalRoutes,
    createBrowserTrajectoryRoutes,
    createBrowserModelInputRoutes,
    createBrowserWorkspaceRoutes,
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
    listBrowserGoals,
    projectBrowserModelCatalog,
    resolveBrowserDraftModelCatalog,
    readBrowserGoalSession,
    type BrowserModelCatalog,
} from "../../../packages/browser/src/index";
import { createSessionMetricsRoutes, SessionMetricsService } from "../../../packages/session-metrics/src/index";
import {
    createDefaultModelContextBudgetPolicy,
    createDefaultPromptBundleRenderer,
    createDefaultPromptBundleProtocolValidator,
    createModelExecutionBinding,
    createModelContextBudgetPolicy,
    DEFAULT_LLM_CONVERSATION_CHAR_BUDGET,
    DropOldestContextCompactor,
    LLMStepExecutor,
    MutableModelBinding,
    resolveModelInputEstimator,
    createModelCapabilities,
    ModelCapabilitiesError,
    resolveTokenEstimatorEncoding,
    type ModelCapabilities,
    type ModelContextBudgetPolicy,
    type ModelContextBudgetPolicyInput,
    type ModelExecutionBinding,
    type ModelInputEstimator,
    TrajectoryModelContextAssembler,
} from "../../../packages/agent/src/index";
import { LLMConfigurationError, readLLMConfig, type LLMConfig } from "../../../packages/config/src/index";
import { loadRuntimeConfig } from "../../../packages/llm/src/config-loader";
import {
    ensureSecureConfigFile,
    ensureSecureHomeDirectories,
    ensureSecureWorkspaceDirectories,
    ensureWorkspaceManifest,
    resolveLazyGoalHomePaths,
    resolveWorkspaceHomePaths,
} from "../../../packages/config/src/index";
import { createLlmStageAdapters, type LlmStageAdapters } from "../../../packages/llm/src/factory";
import type { LLMAdapter } from "../../../packages/llm/src/core/adapter";
import {
    createLlmModelCatalog,
    ModelCatalogError,
    type LlmModelCatalog,
    type LlmModelDescriptor,
} from "../../../packages/llm/src/model-catalog";
import {
    DEFAULT_TOOL_IDS,
    createDefaultToolRegistrations,
    BASH_TOOL_ID,
    BashTool,
    EXECUTE_PROGRAM_TOOL_ID,
    createExecuteProgramRegistration,
    EditFileTool,
    GREP_TOOL_ID,
    GrepTool,
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WriteFileTool,
    ProcessManager,
} from "../../../packages/tools/src/index";
import {
    InMemoryExecutionStreamPublisher,
    type ExecutionStreamPublisher,
} from "../../../packages/execution-stream/src/index";
import { NotifyingGoalStore } from "./notifying-goal-store";

const DEFAULT_PROFILE_ID = "default";

/**
 * 默认 Tool 授权策略。
 */
export function createDefaultToolPolicy(options?: {
    readonly platform?: NodeJS.Platform;
}): ToolPolicy {
    const platform = options?.platform ?? process.platform;
    const autoAllowedToolIds = new Set(
        platform === "darwin"
            ? [READ_FILE_TOOL_ID, GREP_TOOL_ID, BASH_TOOL_ID, EXECUTE_PROGRAM_TOOL_ID]
            : [READ_FILE_TOOL_ID, GREP_TOOL_ID, EXECUTE_PROGRAM_TOOL_ID],
    );

    return {
        evaluate: ({ tool }) =>
            autoAllowedToolIds.has(tool.id)
                ? "allow"
                : "require_approval",
    };
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

export interface CompositionRootOptions {
    readonly cwd?: string;
    readonly dataDirectory?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly adapter?: LLMAdapter;
    readonly thinkAdapter?: LLMAdapter;
    readonly profile?: AgentProfile;
    readonly toolRegistry?: InMemoryToolRegistry;
    readonly toolPolicy?: ToolPolicy;
    readonly abortController?: AbortController;
    readonly goalIdGenerator?: () => string;
    readonly runIdGenerator?: () => string;
    readonly httpMiddleware?: HttpServiceMiddleware;
    readonly exitPort?: ExitPort;
    readonly gracePeriodMs?: number;
    readonly modelInputEstimator?: ModelInputEstimator;
    readonly modelContextBudget?: ModelContextBudgetPolicyInput;
    readonly modelCatalog?: LlmModelCatalog;
    readonly modelBinding?: MutableModelBinding;
    readonly goalModelSelectionCoordinator?: GoalModelSelectionCoordinator;
    readonly adapterFactory?: (
        selection: GoalModelSelection,
        stage: "think" | "decide",
    ) => LLMAdapter;
}

export interface CompositionRoot {
    readonly workspaceRoot: string;
    readonly workspaceHomeDirectory: string;
    readonly dataDirectory: string;
    readonly goalsDirectory: string;
    readonly trajectoriesDirectory: string;
    readonly tracesDirectory: string;
    readonly metricsDirectory: string;
    readonly contextSidecarsDirectory: string;
    readonly llmConfig?: LLMConfig;
    readonly conversationCharBudget: number;
    readonly contextCompactor: DropOldestContextCompactor;
    readonly modelInputEstimator: ModelInputEstimator;
    readonly modelCapabilities?: ModelCapabilities;
    readonly modelContextPolicy: ModelContextBudgetPolicy;
    readonly trajectoryContextAssembler: TrajectoryModelContextAssembler;
    readonly adapter: LLMAdapter;
    readonly profile: AgentProfile;
    readonly profiles: AgentProfileRegistry;
    readonly readFileTool?: ReadFileTool;
    readonly toolRegistry: InMemoryToolRegistry;
    readonly toolPolicy: ToolPolicy;
    readonly store: GoalStore & GoalCatalog;
    readonly workspaceGoalStore: Pick<GoalStore, "restore"> & GoalCatalog;
    readonly manageGoal: {
        readonly setArchived: (goalId: string, archived: boolean) => Promise<"ok" | "goal_not_found" | "goal_not_terminal">;
        readonly delete: (goalId: string) => Promise<"ok" | "goal_not_found" | "goal_not_terminal">;
    };
    readonly notifyingStore: NotifyingGoalStore;
    readonly trajectoryStore: TrajectoryStore;
    readonly contextLookupService: IndexedContextLookupService;
    readonly modelCatalog: LlmModelCatalog;
    readonly modelBinding: MutableModelBinding;
    readonly alignModelBinding: (selection: GoalModelSelection) => void;
    readonly goalModelSelectionCoordinator: GoalModelSelectionCoordinator;
    readonly defaultModelSelection: GoalModelSelection;
    readonly retrievalIndexStore: JsonFileContextRetrievalIndexStore;
    readonly traceSink: JsonFileDiagnosticTraceSink;
    readonly metricsStore: JsonFileMetricsStore;
    readonly httpService: HttpService;
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
    readWorkspaceModelInputs(goalId: string, runId: string): Promise<readonly import("../../../packages/runtime/src/model-input").ModelInputRecord[]>;
    readonly checkpointStore: CheckpointGateGoalStore;
    readonly resources: ManagedResourceRegistry;
    readonly abortController: AbortController;
    readonly shutdownCoordinator: ShutdownCoordinator;
    readonly coordinator: GoalCoordinator;
    readonly launcher: {
        launch: (request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) => ReturnType<typeof launch>;
    };
    readonly browserLauncher: {
        launch: (request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) => ReturnType<typeof launch>;
    };
    readonly goalIdGenerator: () => string;
    readonly runIdGenerator: () => string;
}

export async function resolveWorkspaceRoot(
    cwd: string = process.cwd(),
): Promise<string> {
    return realpath(cwd);
}

export async function createCompositionRoot(
    options: CompositionRootOptions = {},
): Promise<CompositionRoot> {
    const env = options.env ?? process.env;
    let llmConfig: LLMConfig | undefined;
    let adapter: LLMAdapter;
    let configuredStageAdapters: Readonly<LlmStageAdapters> | undefined;
    if (options.adapter !== undefined) {
        adapter = options.adapter;
        try {
            llmConfig = readLLMConfig(env);
            configuredStageAdapters = createLlmStageAdapters(llmConfig);
        } catch {
            llmConfig = undefined;
            configuredStageAdapters = undefined;
        }
    } else {
        try {
            llmConfig = readLLMConfig(env);
        } catch (error) {
            const homePaths = resolveLazyGoalHomePaths(env);
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
        configuredStageAdapters = createLlmStageAdapters(llmConfig);
        adapter = configuredStageAdapters.decideAdapter;
    }
    const conversationCharBudget = readConversationCharBudget(env);
    const configuredEstimator = resolveModelInputEstimator(options.modelInputEstimator);
    const modelCapabilities = readModelCapabilities(env, configuredEstimator);
    const modelInputEstimator = modelCapabilities?.tokenEstimator ?? configuredEstimator;
    const workspaceRoot = await resolveWorkspaceRoot(options.cwd ?? process.cwd());
    const homePaths = resolveLazyGoalHomePaths(env);
    const workspaceHomePaths = await resolveWorkspaceHomePaths(homePaths, workspaceRoot);
    const dataDirectory = options.dataDirectory !== undefined
        ? resolve(options.dataDirectory)
        : workspaceHomePaths.workspaceDirectory;
    const goalsDirectory = join(dataDirectory, "goals");
    const trajectoriesDirectory = join(dataDirectory, "trajectories");
    const tracesDirectory = join(dataDirectory, "traces");
    const metricsDirectory = dataDirectory === workspaceHomePaths.workspaceDirectory
        ? workspaceHomePaths.metricsDirectory
        : join(dataDirectory, "metrics");
    const contextSidecarsDirectory = join(dataDirectory, "context-sidecars");
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
    const resources = new ManagedResourceRegistry();
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
    const store = primaryGoalStore;
    const metricsStore = new JsonFileMetricsStore(metricsDirectory);
    const sessionMetricsService = new SessionMetricsService(store, metricsStore, metricsStore);
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
    const primaryTrajectoryStore = new JsonFileTrajectoryStore(trajectoriesDirectory);
    const toolGrantStore = new JsonFileToolGrantStore(workspaceHomePaths.workspaceDirectory);
    const sandboxGrantStore = new JsonFileSandboxGrantStore(workspaceHomePaths.workspaceDirectory);
    const permissionModeStore = new JsonFileProjectPermissionModeStore(workspaceHomePaths.workspaceDirectory);
    const trajectoryStore = primaryTrajectoryStore;
    const retrievalIndexStore = new JsonFileContextRetrievalIndexStore(contextSidecarsDirectory);
    const contextLookupService = new IndexedContextLookupService({
        trajectoryStore,
        indexStore: retrievalIndexStore,
    });
    const traceSink = new JsonFileDiagnosticTraceSink(tracesDirectory);
    const modelInputStore = new JsonFileModelInputStore(join(dataDirectory, "model-inputs"));
    const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
        trajectoryStore,
        policy: modelContextPolicy,
    });
    const notifyingStore = new NotifyingGoalStore(metricsAwareGoalStore);
    const unsubscribeMetricUpdates = notifyingStore.onSave((goal) => {
        sessionMetricsService.notifyGoalSaved(goal.id);
    });
    const rejectWriteAfterShutdown = (method: string): boolean =>
        abortController.signal.aborted
        && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE");
    const shutdownAdmission: HttpServiceMiddleware = async (context, next) => {
        if (rejectWriteAfterShutdown(context.req.method)) {
            return context.json({ error: "service_shutting_down" }, 503);
        }
        await next();
    };
    const httpMiddleware: HttpServiceMiddleware = options.httpMiddleware === undefined
        ? shutdownAdmission
        : async (context, next) => {
            let rejectedForShutdown = false;
            const middlewareResult = await options.httpMiddleware!(context, async () => {
                if (rejectWriteAfterShutdown(context.req.method)) {
                    rejectedForShutdown = true;
                    return;
                }
                await next();
            });
            if (rejectedForShutdown) return context.json({ error: "service_shutting_down" }, 503);
            return middlewareResult;
        };
    const httpService = createHttpService({ middleware: httpMiddleware });
    httpService.mount("/", createSessionMetricsRoutes(sessionMetricsService));
    const checkpointStore = new CheckpointGateGoalStore(notifyingStore);
    const shutdownCoordinator = new ShutdownCoordinator({
        checkpointStore,
        resources,
        abortController,
        exitPort: options.exitPort ?? new ProcessExitPort(),
        gracePeriodMs: options.gracePeriodMs ?? 2000,
    });
    const protocolValidator = createDefaultPromptBundleProtocolValidator();
    const workingMemoryLimits: WorkingMemoryLimits = DEFAULT_WORKING_MEMORY_LIMITS;
    resources.register({
        async close() {
            unsubscribeMetricUpdates();
            await httpService.close();
        },
    });
    const checkpointCommitter = new TrajectoryCheckpointCommitter({
        store: checkpointStore,
        trajectoryStore,
        traceSink,
    });
    const executionStream = new InMemoryExecutionStreamPublisher();
    resources.register({ close: () => executionStream.dispose() });
    const toolPolicy = options.toolPolicy ?? createDefaultToolPolicy();
    const defaultModelSelection: GoalModelSelection = options.modelBinding?.current().selection ?? {
        provider: llmConfig?.provider ?? ((adapter as { readonly provider?: string }).provider as GoalModelSelection["provider"] | undefined) ?? "openai",
        modelId: llmConfig?.model ?? (adapter as { readonly modelId?: string }).modelId ?? "default-model",
        structuredOutputMode: llmConfig?.structuredOutputMode ?? adapter.structuredOutputMode ?? "prompt_only",
        ...(modelCapabilities === undefined ? {} : {
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
    const createStageAdaptersForSelection = (
        selection: GoalModelSelection,
    ): Readonly<LlmStageAdapters> => {
        if (options.adapterFactory !== undefined) {
            return Object.freeze({
                thinkAdapter: options.adapterFactory(selection, "think"),
                decideAdapter: options.adapterFactory(selection, "decide"),
            });
        }
        if (llmConfig !== undefined) {
            return createLlmStageAdapters({ ...llmConfig, model: selection.modelId });
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
    const runner = new Runner({
        store: checkpointStore,
        executor: new LLMStepExecutor({
            bindingProvider: modelBinding,
            renderer,
            contextCompactor,
            traceSink,
            modelInputStore,
            metricsRecorder: sessionMetricsService,
            trajectoryContextAssembler,
            ...(modelCapabilities === undefined ? {} : { modelCapabilities }),
        }),
        toolRegistry,
        toolPolicy,
        toolGrantLookup: toolGrantStore,
        sandboxGrantLookup: sandboxGrantStore,
        permissionModeStore,
        workspaceId: workspaceHomePaths.workspaceId,
        workspaceRoot,
        traceSink,
        trajectoryStore,
        workingMemoryLimits,
        protocolValidator,
        checkpointCommitter,
        contextLookupPort: contextLookupService,
        executionStream,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store: checkpointStore,
        scheduler,
        toolRegistry,
        toolGrantStore,
        sandboxGrantStore,
        permissionModeStore,
        workspaceId: workspaceHomePaths.workspaceId,
        workspaceRoot,
        traceSink,
        trajectoryStore,
        workingMemoryLimits,
        protocolValidator,
        checkpointCommitter,
        contextLookupPort: contextLookupService,
        executionStream,
    });
    const goalIdGenerator = options.goalIdGenerator ?? randomUUID;
    const runIdGenerator = options.runIdGenerator ?? randomUUID;
    const launcher = {
        async launch(request: Parameters<typeof launch>[0], control?: Parameters<typeof launch>[2]) {
            try {
                await sessionMetricsService.initializeNewGoal(request.goalId);
            } catch {
                // 覆盖标记旁路失败忽略
            }
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

    const goalModelSelectionCoordinator = options.goalModelSelectionCoordinator
        ?? new DefaultGoalModelSelectionCoordinator({ store: checkpointStore });

    return {
        workspaceRoot,
        workspaceHomeDirectory: workspaceHomePaths.workspaceDirectory,
        dataDirectory,
        goalsDirectory,
        trajectoriesDirectory,
        tracesDirectory,
        metricsDirectory,
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
        store,
        workspaceGoalStore: primaryGoalStore,
        manageGoal: {
            setArchived: async (goalId, archived) => {
                const goal = await primaryGoalStore.restore(goalId);
                if (goal === undefined) return "goal_not_found";
                const status = goal.state.run.status;
                if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
                await primaryGoalStore.setArchived(goalId, archived);
                return "ok";
            },
            delete: async (goalId) => {
                const goal = await primaryGoalStore.restore(goalId);
                if (goal === undefined) return "goal_not_found";
                const status = goal.state.run.status;
                if (status !== "completed" && status !== "failed" && status !== "cancelled") return "goal_not_terminal";
                const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
                for (const directory of [trajectoriesDirectory, tracesDirectory, metricsDirectory, contextSidecarsDirectory, join(dataDirectory, "model-inputs")]) {
                    await rm(join(directory, encodedGoalId), { recursive: true, force: true });
                }
                await toolGrantStore.deleteGoalGrants(workspaceHomePaths.workspaceId, goalId);
                await sandboxGrantStore.deleteGoalGrants(workspaceHomePaths.workspaceId, goalId);
                await processSessionStore.deleteGoalSessions(goalId);
                await primaryGoalStore.deleteTerminal(goalId);
                return "ok";
            },
        },
        notifyingStore,
        trajectoryStore,
        contextLookupService,
        retrievalIndexStore,
        traceSink,
        metricsStore,
        httpService,
        protocolValidator,
        workingMemoryLimits,
        checkpointCommitter,
        executionStream,
        readTrajectory,
        readWorkspaceTrajectory,
        readWorkspaceModelInputs: (goalId, runId) => new JsonFileModelInputStore(join(workspaceHomePaths.workspaceDirectory, "model-inputs")).read(goalId, runId),
        checkpointStore,
        resources,
        abortController,
        shutdownCoordinator,
        coordinator,
        modelCatalog,
        modelBinding,
        alignModelBinding,
        goalModelSelectionCoordinator,
        defaultModelSelection,
        launcher,
        browserLauncher,
        goalIdGenerator,
        runIdGenerator,
    };
}
