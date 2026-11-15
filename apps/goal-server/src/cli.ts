import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    BrowserGoalCommandService,
    createBrowserGoalRoutes,
    createBrowserModelInputRoutes,
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
    createBrowserTrajectoryRoutes,
    createBrowserWorkspaceRoutes,
    listBrowserGoals,
    projectBrowserModelCatalog,
    readBrowserGoalActivity,
    readBrowserGoalSession,
    resolveBrowserDraftModelCatalog,
    type BrowserModelCatalog,
    type BrowserModelSource,
    type BrowserPermissionExemptionSummary,
    type BrowserSessionAccess,
} from "../../../packages/browser/src/index";
import { DefaultProviderModelFetcher } from "../../../packages/model-catalog/src/index";
import { ModelCatalogError } from "../../../packages/model-catalog/src/index";
import type { LlmModelDescriptor } from "../../../packages/model-catalog/src/index";
import {
    RuntimeLifecycleUnavailableError,
    type GoalModelSelection,
} from "../../../packages/runtime/src/index";
import type { GoalTriggerContext } from "../../../packages/runtime/src/domain";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { JsonFileModelPreferenceStore } from "../../../packages/storage/src/index";
import {
    isSupportedLlmProvider,
    supportsBaseUrl,
    isAcceptableBaseUrl,
    maskProviderApiKey,
    ProviderProfileActiveDeletionError,
    ProviderProfileConflictError,
    ProviderProfileNotFoundError,
    ProviderProfileProtocolError,
    ProviderProfileValidationError,
    toLlmConfig,
    type ProviderProfile,
    type ProviderProfileDraft,
    type ProviderProfilePatch,
} from "../../../packages/config/src/index";
import type {
    BrowserExecutionState,
    BrowserModelSourceRef,
    BrowserProviderProfile,
    BrowserProviderProfileInput,
    BrowserProviderSettingsError,
} from "../../../packages/web-contracts/src/index";
import {
    createCompositionRoot,
    type CompositionRoot,
    type CompositionRootOptions,
} from "./composition-root";
import { allocateGoalWorkspace, resumeUnroutedWorkTriggers, WorkerScheduler } from "./runtime/index";
import { createTriggerBrowserSessionPort } from "./browser-session-port";

/** 把目录领域描述映射为 Web 投影允许接收的非敏感字段。 */
function toBrowserModelSources(models: readonly LlmModelDescriptor[]): readonly BrowserModelSource[] {
    return models.map((model) => ({
        id: model.id,
        displayName: model.displayName,
        provider: model.provider,
        availabilitySource: model.availabilitySource,
        metadataSource: model.metadataSource,
        selectable: model.selectable,
        ...(model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens }),
        ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
        ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
        ...(model.vision === undefined ? {} : { vision: model.vision }),
        ...(model.unavailableReason === undefined ? {} : { unavailableReason: model.unavailableReason }),
    }));
}

/** 把受管档案投影为不含明文凭据的 wire 形态。 */
function toBrowserProviderProfile(profile: ProviderProfile): BrowserProviderProfile {
    return {
        id: profile.id,
        label: profile.label,
        kind: profile.kind,
        defaultModel: profile.defaultModel,
        ...(profile.baseURL === undefined ? {} : { baseURL: profile.baseURL }),
        ...(profile.contextWindowTokens === undefined ? {} : { contextWindowTokens: profile.contextWindowTokens }),
        ...(profile.maxOutputTokens === undefined ? {} : { maxOutputTokens: profile.maxOutputTokens }),
        ...(profile.structuredOutputMode === undefined ? {} : { structuredOutputMode: profile.structuredOutputMode }),
        hasApiKey: profile.apiKey.trim().length > 0,
        apiKeyMask: maskProviderApiKey(profile.apiKey),
    };
}

/** 把 wire 输入映射为创建草稿；缺省 `apiKey` 由校验层拒绝。 */
function toProfileDraft(input: BrowserProviderProfileInput): ProviderProfileDraft {
    return {
        label: input.label,
        kind: input.kind,
        defaultModel: input.defaultModel,
        apiKey: input.apiKey ?? "",
        ...(input.baseURL == null ? {} : { baseURL: input.baseURL }),
        ...(input.contextWindowTokens == null ? {} : { contextWindowTokens: input.contextWindowTokens }),
        ...(input.maxOutputTokens == null ? {} : { maxOutputTokens: input.maxOutputTokens }),
        ...(input.structuredOutputMode == null ? {} : { structuredOutputMode: input.structuredOutputMode }),
    };
}

/** 把 wire 输入映射为部分更新；缺省 `apiKey` 保留原凭据，其余可选字段缺省表示清空。 */
function toProfilePatch(input: BrowserProviderProfileInput): ProviderProfilePatch {
    return {
        label: input.label,
        kind: input.kind,
        defaultModel: input.defaultModel,
        ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
        baseURL: input.baseURL ?? undefined,
        contextWindowTokens: input.contextWindowTokens ?? undefined,
        maxOutputTokens: input.maxOutputTokens ?? undefined,
        structuredOutputMode: input.structuredOutputMode ?? undefined,
    };
}

/** 把档案存储错误映射为稳定的 wire 错误分类。 */
function mapProviderSettingsError(
    error: unknown,
): { readonly error: BrowserProviderSettingsError; readonly fields?: readonly string[] } {
    if (error instanceof ProviderProfileValidationError) {
        return { error: "provider_profile_invalid", fields: error.fields };
    }
    if (error instanceof ProviderProfileNotFoundError) return { error: "provider_profile_not_found" };
    if (error instanceof ProviderProfileConflictError) return { error: "provider_profile_conflict" };
    if (error instanceof ProviderProfileActiveDeletionError) return { error: "provider_profile_active" };
    if (error instanceof ProviderProfileProtocolError) return { error: "provider_profile_unavailable" };
    return { error: "provider_profile_unavailable" };
}

export interface CliRunOptions extends CompositionRootOptions {
    readonly writeOutput?: (message: string) => void;
    readonly writeError?: (message: string) => void;
}

export type CliCommand =
    | { readonly kind: "browser" }
    | { readonly kind: "legacy"; readonly command: string };

export function parseCliArgs(argv: readonly string[]): CliCommand {
    if (argv.length === 0) {
        return { kind: "browser" };
    }
    const first = argv[0];
    if (first === "web" && argv.length === 1) {
        return { kind: "browser" };
    }
    if (first === "-c" || first === "--continue") {
        return { kind: "legacy", command: "-c" };
    }
    if (first === "resume") {
        return { kind: "legacy", command: "resume" };
    }
    if (first === "inspect") {
        return { kind: "legacy", command: "inspect" };
    }
    throw new Error(`Unknown command line arguments: ${argv.join(" ")}`);
}

export async function runServerSession(
    root: CompositionRoot,
    access: BrowserSessionAccess,
    writeOutput: (message: string) => void,
): Promise<number> {
    let shutdownPromise: Promise<void> | undefined;
    let resolveShutdown: (() => void) | undefined;
    const shutdownSignal = new Promise<void>((resolve) => {
        resolveShutdown = resolve;
    });

    const requestShutdown = (): Promise<void> => {
        if (shutdownPromise !== undefined) {
            return shutdownPromise;
        }
        shutdownPromise = root.shutdownCoordinator.shutdown();
        return shutdownPromise;
    };

    const onSigint = (): void => {
        void requestShutdown().then(() => {
            resolveShutdown?.();
        }).catch(() => {
            resolveShutdown?.();
        });
    };

    process.on("SIGINT", onSigint);
    try {
        await mkdir(root.dataDirectory, { recursive: true, mode: 0o700 });
        const triggerOwner = new SupervisorOwnership(join(root.dataDirectory, "supervisor-owner.db"));
        const triggerStore = new TriggerStore(join(root.dataDirectory, "triggers.db"));
        const supervisorGoals = new JsonFileGoalStore(root.goalsDirectory);
        const workerScheduler = new WorkerScheduler({
            owner: triggerOwner,
            triggers: triggerStore,
            goals: supervisorGoals,
            cwd: root.workspaceRoot,
            dataDirectory: root.dataDirectory,
            env: process.env,
            readPermissionProfile: () => root.permissionProfileStore.get(root.workspaceId),
            commitContinuation: ({ goalId, runId, inputId, content }) =>
                root.commands.commitContinuation({ goalId, runId }, content, inputId),
        });
        root.resources.register({ close: async () => {
            try { await workerScheduler.detachAll(); }
            finally {
                triggerStore.close();
                await triggerOwner.close();
            }
        } });
        const createRecoveredGoal = async (
            intent: string,
            reservedGoalId: string | undefined,
            workspaceMode: "shared" | "worktree",
        ) => {
            const goalId = reservedGoalId ?? root.goalIdGenerator();
            const workspace = await allocateGoalWorkspace(root.workspaceRoot, root.dataDirectory, goalId, workspaceMode);
            const goal = await workerScheduler.createGoal({
                goalId,
                intent,
                mode: "normal",
                modelSelection: root.defaultModelSelection,
            }, workspace);
            const authorization: GoalTriggerContext["authorization"] = {
                workspace,
                toolIds: goal.definition.profile.toolIds.filter((toolId) => root.toolRegistry.get(toolId) !== undefined),
            };
            return { goal, authorization };
        };
        for (const queued of triggerStore.goalQueueRecords()) {
            await supervisorGoals.releaseCreationIntent(queued.triggerId);
        }
        await resumeUnroutedWorkTriggers(triggerOwner, triggerStore, supervisorGoals, root.adapter, createRecoveredGoal);
        await workerScheduler.pump();
        const staticDirectory = process.env.LAZYGOAL_STATIC_DIR
            ? resolve(process.env.LAZYGOAL_STATIC_DIR)
            : resolve(dirname(fileURLToPath(import.meta.url)), "../../goal-board/dist");
        if (!existsSync(join(staticDirectory, "index.html"))) {
            process.stderr.write("警告: WebUI 尚未构建，已启用引导模式。可运行 npm run build:web 进行构建。\n");
        }
        const preferenceStore = new JsonFileModelPreferenceStore(root.workspaceHomeDirectory);
        const configuredSelection = root.defaultModelSelection;
        const configuredProvider = root.llmConfig?.provider;
        const providerSources = (): readonly BrowserModelSourceRef[] => {
            const sources: BrowserModelSourceRef[] = root.providerProfiles.map((profile) => ({
                profileId: profile.id,
                kind: profile.kind,
                label: profile.label,
                active: configuredSelection.profileId === profile.id,
            }));
            if (root.llmConfig !== undefined && configuredSelection.profileId === undefined) {
                sources.push({ kind: root.llmConfig.provider, label: root.llmConfig.provider, active: true });
            }
            return sources;
        };
        /** 解析目标来源：显式请求的受管档案，否则进程启动来源。 */
        const resolveSource = (
            requestedProfileId: string | undefined,
        ): { readonly config: NonNullable<typeof root.llmConfig>; readonly profileId?: string } | undefined => {
            if (requestedProfileId === undefined) {
                return root.llmConfig === undefined
                    ? undefined
                    : {
                        config: root.llmConfig,
                        ...(configuredSelection.profileId === undefined ? {} : { profileId: configuredSelection.profileId }),
                    };
            }
            try {
                return {
                    config: root.resolveProviderProfileConfig(requestedProfileId, configuredSelection.modelId),
                    profileId: requestedProfileId,
                };
            } catch {
                return undefined;
            }
        };
        const readDraftModel = async (signal?: AbortSignal, requestedProfileId?: string): Promise<{
            readonly catalog: BrowserModelCatalog;
            readonly selection: GoalModelSelection | undefined;
        }> => {
            const preference = requestedProfileId === undefined ? await preferenceStore.get() : undefined;
            // 偏好指向的档案不可用时回退启动来源，并由投影给出 provider_changed。
            const target = resolveSource(requestedProfileId ?? preference?.profileId) ?? resolveSource(undefined);
            if (target === undefined) {
                throw new Error("Model catalog unavailable.");
            }
            const models = await root.modelCatalog.list(
                { ...target.config, model: configuredSelection.modelId },
                { signal, requireTokenCapacity: configuredSelection.inputEstimator.kind === "token-encoding" },
            );
            const { catalog, selected } = resolveBrowserDraftModelCatalog(
                {
                    provider: target.config.provider,
                    ...(target.profileId === undefined ? {} : { profileId: target.profileId }),
                    sources: providerSources(),
                },
                configuredSelection.modelId,
                preference,
                toBrowserModelSources(models),
            );
            const selectedModel = selected === undefined ? undefined : models.find((model) =>
                model.provider === target.config.provider && model.id === selected.id && model.selectable);
            return {
                catalog,
                selection: selectedModel === undefined ? undefined : {
                    provider: target.config.provider,
                    ...(target.profileId === undefined ? {} : { profileId: target.profileId }),
                    modelId: selectedModel.id,
                    ...(target.config.provider === "openai-compatible"
                        ? {}
                        : { structuredOutputMode: configuredSelection.structuredOutputMode }),
                    ...(selectedModel.contextWindowTokens === undefined ? {} : { contextWindowTokens: selectedModel.contextWindowTokens }),
                    ...(selectedModel.maxOutputTokens === undefined ? {} : { maxOutputTokens: selectedModel.maxOutputTokens }),
                    ...(selectedModel.executionApi === undefined ? {} : { executionApi: selectedModel.executionApi }),
                    ...(selectedModel.reasoning === undefined ? {} : { reasoning: selectedModel.reasoning }),
                    ...(selectedModel.vision === undefined ? {} : { vision: selectedModel.vision }),
                    ...(selectedModel.supportsRequiredToolChoice === undefined
                        ? {}
                        : { supportsRequiredToolChoice: selectedModel.supportsRequiredToolChoice }),
                    inputEstimator: configuredSelection.inputEstimator,
                },
            };
        };
        /** 由本机模型目录验证 ID 并构造完整非敏感选择。 */
        const resolveModelSelection = async (
            modelId: string,
            current: GoalModelSelection,
            providerProfileId?: string,
        ): Promise<GoalModelSelection | undefined> => {
            const targetProfileId = providerProfileId ?? current.profileId;
            let config = root.llmConfig;
            if (targetProfileId !== undefined) {
                try {
                    config = root.resolveProviderProfileConfig(targetProfileId, current.modelId);
                } catch {
                    return undefined;
                }
            }
            if (config === undefined) return undefined;
            const models = await root.modelCatalog.list(
                { ...config, model: current.modelId },
                { requireTokenCapacity: current.inputEstimator.kind === "token-encoding" },
            );
            const model = models.find((entry) => entry.provider === config.provider && entry.id === modelId && entry.selectable);
            if (model === undefined) return undefined;
            return {
                provider: config.provider,
                ...(targetProfileId === undefined ? {} : { profileId: targetProfileId }),
                modelId: model.id,
                ...(config.provider === "openai-compatible"
                    ? {}
                    : { structuredOutputMode: current.structuredOutputMode }),
                ...(model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens }),
                ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
                ...(model.executionApi === undefined ? {} : { executionApi: model.executionApi }),
                ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
                ...(model.vision === undefined ? {} : { vision: model.vision }),
                ...(model.supportsRequiredToolChoice === undefined
                    ? {}
                    : { supportsRequiredToolChoice: model.supportsRequiredToolChoice }),
                inputEstimator: current.inputEstimator,
            };
        };
        const hasExecutionOwner = (goalId: string): boolean => workerScheduler.assignments()
            .some((assignment) => assignment.goalId === goalId);
        const executionStateFor = (goalId: string): BrowserExecutionState => {
            if (triggerStore.workerRecovery(goalId)?.status === "pending") return "recoverable";
            const queued = triggerStore.queueRecord(goalId);
            if (hasExecutionOwner(goalId) || queued?.status === "queued" || queued?.status === "claimed" || queued?.status === "waiting") return "active";
            return "inactive";
        };
        const readActiveGoalId = (): string | undefined => workerScheduler.assignments()
            .find((assignment) => assignment.goalId !== undefined)?.goalId;
        const readTriggerGoalList = async () => {
            const result = await listBrowserGoals(root.workspaceGoalStore);
            return {
                ...result,
                goals: result.goals.map((goal) => ({
                    ...goal,
                    execution: {
                        state: executionStateFor(goal.goalId),
                        committedThroughSequence: goal.execution?.committedThroughSequence ?? 0,
                    },
                })),
            };
        };
        const commandService = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            coordinator: {
                ...root.commands,
                listPermissionExemptions: async (ref): Promise<readonly BrowserPermissionExemptionSummary[]> => {
                    const grants = await root.commands.listGrants(ref);
                    return grants.flatMap((grant) => grant.kind === "sandbox"
                        ? [{
                            id: grant.id,
                            scope: grant.scope,
                            network: grant.network,
                            extraFiles: grant.extraFiles.map((file) => ({
                                canonicalPath: file.canonicalPath,
                                access: file.access,
                                kind: file.kind,
                            })),
                            status: grant.status,
                        }]
                        : []);
                },
                revokePermissionExemption: ({ ref, exemptionId }) =>
                    root.commands.revokeGrant({ ref, kind: "sandbox", grantId: exemptionId }),
            },
            modelSelectionCoordinator: root.goalModelSelectionCoordinator,
            resolveModelSelection,
            saveModelPreference: (selection) => preferenceStore.set({
                ...(selection.profileId === undefined ? {} : { profileId: selection.profileId }),
                modelId: selection.modelId,
            }),
            readActiveGoalId,
            control: { signal: root.abortController.signal },
        });
        const browserSessionPort = createTriggerBrowserSessionPort({
            externalId: access.externalId,
            root,
            owner: triggerOwner,
            triggers: triggerStore,
            scheduler: workerScheduler,
            goals: supervisorGoals,
            resolveModelSelection: async (command) => {
                if (command.modelId === undefined) {
                    try {
                        return { ok: true, selection: (await readDraftModel()).selection ?? root.defaultModelSelection };
                    } catch {
                        return { ok: false, error: "model_catalog_unavailable" };
                    }
                }
                try {
                    const resolved = await resolveModelSelection(command.modelId, root.defaultModelSelection);
                    return resolved === undefined ? { ok: false, error: "model_not_selectable" } : { ok: true, selection: resolved };
                } catch {
                    return { ok: false, error: "model_catalog_unavailable" };
                }
            },
        });
        root.httpService.mount("/", createBrowserWorkspaceRoutes(root.workspaceRoot));
        root.httpService.mount("/", createBrowserGoalRoutes({
            list: readTriggerGoalList,
            setArchived: async (goalId, archived) => {
                const result = await commandService.manageTerminalGoal(goalId, async () => {
                    await root.manageGoal.setArchived(goalId, archived);
                });
                return result === "ok" ? { ok: true } : { ok: false, error: result };
            },
            deleteGoal: async (goalId) => {
                const result = await commandService.manageTerminalGoal(goalId, async () => {
                    await root.manageGoal.delete(goalId);
                });
                return result === "ok" ? { ok: true } : { ok: false, error: result };
            },
            read: async (goalId) => {
                const goal = await readBrowserGoalSession(
                    goalId,
                    root.workspaceGoalStore,
                    root.readWorkspaceTrajectory,
                );
                return goal === undefined ? undefined : {
                    ...goal,
                    execution: {
                        state: executionStateFor(goalId),
                        committedThroughSequence: goal.execution?.committedThroughSequence ?? 0,
                    },
                };
            },
            readState: browserSessionPort.readControlSnapshot,
            readActivity: (goalId, query) => readBrowserGoalActivity(
                goalId,
                query,
                root.workspaceGoalStore,
                root.readWorkspaceTrajectory,
            ),
            session: browserSessionPort,
            enterPlanMode: (goalId, command) => commandService.enterPlanMode(goalId, command),
            selectModel: (goalId, command) => commandService.selectModel(goalId, command),
            providerSettings: {
                fetchModels: async (input, signal) => {
                    if (!isSupportedLlmProvider(input.kind)
                        || (input.baseURL !== undefined && (!supportsBaseUrl(input.kind) || !isAcceptableBaseUrl(input.baseURL)))
                        || (input.kind === "openai-compatible" && input.baseURL === undefined)) {
                        return { ok: false, error: "provider_profile_invalid" };
                    }
                    try {
                        const saved = input.profileId === undefined ? undefined : await root.providerProfileStore.get(input.profileId);
                        if (input.profileId !== undefined && saved === undefined) return { ok: false, error: "provider_profile_not_found" };
                        const apiKey = input.apiKey ?? (saved?.kind === input.kind ? saved.apiKey : undefined);
                        if (!apiKey) return { ok: false, error: "provider_profile_invalid" };
                        const models = await new DefaultProviderModelFetcher().fetchModels({ provider: input.kind, apiKey, ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }) }, { signal });
                        return { ok: true, models: models.map(model => ({ id: model.id, name: model.displayName ?? model.id })) };
                    } catch (error) {
                        const category = error instanceof ModelCatalogError ? error.kind : undefined;
                        return { ok: false, error: category === "authentication" ? "model_catalog_authentication" : category === "permission" ? "model_catalog_permission" : category === "protocol" ? "model_catalog_protocol" : "model_catalog_unavailable" };
                    }
                },
                read: async () => {
                    try {
                        const profiles = await root.providerProfileStore.list();
                        const activeProfileId = await root.providerProfileStore.activeProfileId();
                        return {
                            ok: true as const,
                            settings: {
                                ...(activeProfileId === undefined ? {} : { activeProfileId }),
                                profiles: profiles.map(toBrowserProviderProfile),
                                ...(root.llmConfig === undefined ? {} : {
                                    fallback: {
                                        source: "config" as const,
                                        provider: root.llmConfig.provider,
                                        model: root.llmConfig.model,
                                    },
                                }),
                            },
                        };
                    } catch {
                        return { ok: false as const, error: "provider_profile_unavailable" as const };
                    }
                },
                create: async (input) => {
                    try {
                        return await root.runTrackedOperation("provider_profile_create", async () => {
                            const profile = await root.providerProfileStore.create(toProfileDraft(input));
                            await root.refreshProviderProfiles();
                            return { ok: true as const, profile: toBrowserProviderProfile(profile) };
                        });
                    } catch (error) {
                        return { ok: false as const, ...mapProviderSettingsError(error) };
                    }
                },
                update: async (profileId, input) => {
                    try {
                        return await root.runTrackedOperation("provider_profile_update", async () => {
                            const profile = await root.providerProfileStore.update(profileId, toProfilePatch(input));
                            await root.refreshProviderProfiles();
                            return { ok: true as const, profile: toBrowserProviderProfile(profile) };
                        });
                    } catch (error) {
                        return { ok: false as const, ...mapProviderSettingsError(error) };
                    }
                },
                remove: async (profileId) => {
                    try {
                        return await root.runTrackedOperation("provider_profile_remove", async () => {
                            const profile = await root.providerProfileStore.delete(profileId);
                            await root.refreshProviderProfiles();
                            return {
                                ok: true as const,
                                profile: toBrowserProviderProfile(profile),
                                mayBeReferencedByGoals: true,
                            };
                        });
                    } catch (error) {
                        return { ok: false as const, error: mapProviderSettingsError(error).error };
                    }
                },
                activate: async (profileId) => {
                    try {
                        return await root.runTrackedOperation("provider_profile_activate", async () => {
                            await root.providerProfileStore.setActive(profileId);
                            await root.refreshProviderProfiles();
                            return { ok: true as const, activeProfileId: profileId };
                        });
                    } catch (error) {
                        return { ok: false as const, error: mapProviderSettingsError(error).error };
                    }
                },
                test: async (profileId) => {
                    let profile: ProviderProfile | undefined;
                    try {
                        profile = await root.providerProfileStore.get(profileId);
                    } catch {
                        return { ok: false as const, error: "model_catalog_unavailable" as const };
                    }
                    if (profile === undefined) {
                        return { ok: false as const, error: "provider_profile_not_found" as const };
                    }
                    try {
                        const models = await root.modelCatalog.list(toLlmConfig(profile, { model: profile.defaultModel }));
                        return { ok: true as const, modelCount: models.length };
                    } catch (error) {
                        if (!(error instanceof ModelCatalogError)) {
                            return { ok: false as const, error: "model_catalog_unavailable" as const };
                        }
                        if (error.kind === "authentication") return { ok: false as const, error: "model_catalog_authentication" as const };
                        if (error.kind === "permission") return { ok: false as const, error: "model_catalog_permission" as const };
                        if (error.kind === "protocol") return { ok: false as const, error: "model_catalog_protocol" as const };
                        return { ok: false as const, error: "model_catalog_unavailable" as const };
                    }
                },
            },
            setModelPreference: async (modelId, providerProfileId) => {
                if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                return root.runTrackedOperation("model_preference", async (): Promise<
                    | { readonly ok: true; readonly modelId: string }
                    | {
                        readonly ok: false;
                        readonly error:
                            | "model_catalog_unavailable"
                            | "model_not_selectable"
                            | "model_preference_unavailable"
                            | "service_shutting_down";
                    }
                > => {
                    const target = resolveSource(providerProfileId);
                    if (target === undefined) return { ok: false, error: "model_catalog_unavailable" };
                    let selectable = false;
                    try {
                        const models = await root.modelCatalog.list(
                            { ...target.config, model: configuredSelection.modelId },
                            { requireTokenCapacity: configuredSelection.inputEstimator.kind === "token-encoding" },
                        );
                        selectable = models.some((model) => model.provider === target.config.provider && model.id === modelId && model.selectable);
                    } catch {
                        if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                        return { ok: false, error: "model_catalog_unavailable" };
                    }
                    if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                    if (!selectable) return { ok: false, error: "model_not_selectable" };
                    try {
                        if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                        await preferenceStore.set({
                            ...(target.profileId === undefined ? {} : { profileId: target.profileId }),
                            modelId,
                        });
                        return { ok: true, modelId };
                    } catch {
                        return { ok: false, error: "model_preference_unavailable" };
                    }
                }).catch((error: unknown) => {
                    if (error instanceof RuntimeLifecycleUnavailableError) {
                        return { ok: false as const, error: "service_shutting_down" as const };
                    }
                    throw error;
                });
            },
            models: async (target, signal, providerProfileId) => {
                if (target === undefined) {
                    try {
                        return { ok: true, catalog: (await readDraftModel(signal, providerProfileId)).catalog };
                    } catch (error) {
                        if (!(error instanceof ModelCatalogError)) return { ok: false, error: "model_catalog_unavailable" };
                        if (error.kind === "authentication") return { ok: false, error: "model_catalog_authentication" };
                        if (error.kind === "permission") return { ok: false, error: "model_catalog_permission" };
                        if (error.kind === "protocol") return { ok: false, error: "model_catalog_protocol" };
                        return { ok: false, error: "model_catalog_unavailable" };
                    }
                }
                let currentModelId = root.defaultModelSelection.modelId;
                let requireTokenCapacity = root.defaultModelSelection.inputEstimator.kind === "token-encoding";
                let requestedProfileId = providerProfileId;
                if (target !== undefined) {
                    const goal = await root.workspaceGoalStore.restore(target.goalId);
                    if (goal === undefined) return { ok: false, error: "goal_not_found" };
                    if (goal.state.run.id !== target.runId) return { ok: false, error: "stale_run" };
                    currentModelId = goal.state.modelSelection.modelId;
                    requireTokenCapacity = goal.state.modelSelection.inputEstimator.kind === "token-encoding";
                    requestedProfileId = providerProfileId ?? goal.state.modelSelection.profileId;
                }
                const source = resolveSource(requestedProfileId);
                if (source === undefined) return { ok: false, error: "model_catalog_unavailable" };
                try {
                    const models = await root.modelCatalog.list(
                        { ...source.config, model: currentModelId },
                        { signal, requireTokenCapacity },
                    );
                    return {
                        ok: true,
                        catalog: projectBrowserModelCatalog(source.config.provider, currentModelId, toBrowserModelSources(models), undefined, {
                            ...(source.profileId === undefined ? {} : { profileId: source.profileId }),
                            sources: providerSources(),
                        }),
                    };
                } catch (error) {
                    if (!(error instanceof ModelCatalogError)) return { ok: false, error: "model_catalog_unavailable" };
                    if (error.kind === "authentication") return { ok: false, error: "model_catalog_authentication" };
                    if (error.kind === "permission") return { ok: false, error: "model_catalog_permission" };
                    if (error.kind === "protocol") return { ok: false, error: "model_catalog_protocol" };
                    return { ok: false, error: "model_catalog_unavailable" };
                }
            },
            readActionDetails: (goalId, runId, actionId) => commandService.readActionDetails(goalId, runId, actionId),
            readInteractionDetails: (goalId, runId, interactionId) => commandService.readInteractionDetails(goalId, runId, interactionId),
            listPermissionExemptions: (goalId, runId) => commandService.listPermissionExemptions(goalId, runId),
            revokePermissionExemption: (goalId, command) => commandService.revokePermissionExemption(goalId, command),
            reviewActionApproval: (goalId, command) => commandService.reviewActionApproval(goalId, command),
            getPermissionProfile: () => commandService.getPermissionProfile(),
            setPermissionProfile: (command) => commandService.setPermissionProfile(command),
        }));
        root.httpService.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.workspaceTrajectoryStore));
        root.httpService.mount("/", createBrowserModelInputRoutes(root.workspaceGoalStore, root.readWorkspaceModelInputs, root.workspaceTrajectoryStore));
        root.httpService.mount("/", createBrowserStaticRoutes(staticDirectory));
        const address = await root.httpService.start(0);
        access.bindOrigin(address.origin);
        writeOutput(access.createLaunchUrl(address.origin));
        await shutdownSignal;
        try {
            await shutdownPromise;
        } catch (error: unknown) {
            process.stderr.write(`Runtime shutdown incomplete: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        return 130;
    } finally {
        process.off("SIGINT", onSigint);
        if (shutdownPromise === undefined) {
            await root.httpService.close().catch((error: unknown) => {
                process.stderr.write(`HTTP shutdown incomplete: ${error instanceof Error ? error.message : String(error)}\n`);
            });
            await root.lifecycle.close().catch((error: unknown) => {
                process.stderr.write(`Runtime shutdown incomplete: ${error instanceof Error ? error.message : String(error)}\n`);
            });
        }
    }
}

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
        writeError(error instanceof Error ? error.message : String(error));
        return 2;
    }

    if (command.kind === "legacy") {
        writeError(`终端命令 "${command.command}" 已被移除。请使用 lazygoal 或 lazygoal web 启动 Web 服务。`);
        return 2;
    }

    const browserAccess = createBrowserSessionAccess();
    let root: CompositionRoot;
    try {
        root = await createCompositionRoot({
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            ...(options.env === undefined ? {} : { env: options.env }),
            ...(options.exitPort === undefined ? {} : { exitPort: options.exitPort }),
            ...(options.gracePeriodMs === undefined ? {} : { gracePeriodMs: options.gracePeriodMs }),
            httpMiddleware: browserAccess.middleware,
            ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
            ...(options.thinkAdapter !== undefined ? { thinkAdapter: options.thinkAdapter } : {}),
            ...(options.profile !== undefined ? { profile: options.profile } : {}),
            ...(options.toolRegistry !== undefined ? { toolRegistry: options.toolRegistry } : {}),
            ...(options.toolPolicy !== undefined ? { toolPolicy: options.toolPolicy } : {}),
            ...(options.abortController !== undefined ? { abortController: options.abortController } : {}),
            ...(options.goalIdGenerator !== undefined ? { goalIdGenerator: options.goalIdGenerator } : {}),
            ...(options.runIdGenerator !== undefined ? { runIdGenerator: options.runIdGenerator } : {}),
            ...(options.modelInputEstimator !== undefined ? { modelInputEstimator: options.modelInputEstimator } : {}),
            ...(options.modelContextBudget !== undefined ? { modelContextBudget: options.modelContextBudget } : {}),
            ...(options.modelCatalog !== undefined ? { modelCatalog: options.modelCatalog } : {}),
            ...(options.modelBinding !== undefined ? { modelBinding: options.modelBinding } : {}),
            ...(options.goalModelSelectionCoordinator !== undefined ? { goalModelSelectionCoordinator: options.goalModelSelectionCoordinator } : {}),
            ...(options.adapterFactory !== undefined ? { adapterFactory: options.adapterFactory } : {}),
            ...(options.dataDirectory !== undefined ? { dataDirectory: options.dataDirectory } : {}),
        });
    } catch (error: unknown) {
        writeError(error instanceof Error ? error.message : String(error));
        return 1;
    }

    try {
        return await runServerSession(
            root,
            browserAccess,
            options.writeOutput ?? ((message) => console.log(message)),
        );
    } catch (error: unknown) {
        writeError(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

const entrypoint = process.argv[1] === undefined
    ? undefined
    : resolve(process.argv[1]);

if (entrypoint === fileURLToPath(import.meta.url)) {
    void runCli().then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
