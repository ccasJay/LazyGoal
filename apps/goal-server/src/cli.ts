import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    BrowserGoalCommandService,
    BrowserGoalStreamService,
    createBrowserGoalRoutes,
    createBrowserModelInputRoutes,
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
    createBrowserTrajectoryRoutes,
    createBrowserWorkspaceRoutes,
    listBrowserGoals,
    projectBrowserModelCatalog,
    readBrowserGoalSession,
    resolveBrowserDraftModelCatalog,
    type BrowserModelCatalog,
    type BrowserSessionAccess,
} from "../../../packages/browser/src/index";
import { ModelCatalogError } from "../../../packages/llm/src/model-catalog";
import type { GoalModelSelection } from "../../../packages/runtime/src/index";
import { JsonFileModelPreferenceStore } from "../../../packages/storage/src/index";
import {
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
    BrowserProviderProfile,
    BrowserProviderProfileInput,
    BrowserProviderSettingsError,
} from "../../../packages/web-contracts/src/index";
import {
    createCompositionRoot,
    type CompositionRoot,
    type CompositionRootOptions,
} from "./composition-root";

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
        ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
        ...(input.contextWindowTokens === undefined ? {} : { contextWindowTokens: input.contextWindowTokens }),
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        ...(input.structuredOutputMode === undefined ? {} : { structuredOutputMode: input.structuredOutputMode }),
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
        root.checkpointStore.freeze();
        root.abortController.abort();
        shutdownPromise = (async () => {
            await root.shutdownCoordinator.shutdown();
        })();
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
        const staticDirectory = process.env.LAZYGOAL_STATIC_DIR
            ? resolve(process.env.LAZYGOAL_STATIC_DIR)
            : resolve(dirname(fileURLToPath(import.meta.url)), "../../goal-board/dist");
        if (!existsSync(join(staticDirectory, "index.html"))) {
            process.stderr.write("警告: WebUI 尚未构建，已启用引导模式。可运行 npm run build:web 进行构建。\n");
        }
        const preferenceStore = new JsonFileModelPreferenceStore(root.workspaceHomeDirectory);
        const configuredSelection = root.defaultModelSelection;
        const configuredProvider = root.llmConfig?.provider;
        const readDraftModel = async (signal?: AbortSignal): Promise<{
            readonly catalog: BrowserModelCatalog;
            readonly selection: GoalModelSelection | undefined;
        }> => {
            if (root.llmConfig === undefined || configuredProvider === undefined) {
                throw new Error("Model catalog unavailable.");
            }
            const preference = await preferenceStore.get();
            const models = await root.modelCatalog.list(
                { ...root.llmConfig, model: configuredSelection.modelId },
                { signal, requireTokenCapacity: configuredSelection.inputEstimator.kind === "token-encoding" },
            );
            const { catalog, selected } = resolveBrowserDraftModelCatalog(
                {
                    provider: configuredProvider,
                    ...(configuredSelection.profileId === undefined ? {} : { profileId: configuredSelection.profileId }),
                },
                configuredSelection.modelId,
                preference,
                models,
            );
            return {
                catalog,
                selection: selected === undefined ? undefined : {
                    provider: configuredProvider,
                    ...(configuredSelection.profileId === undefined ? {} : { profileId: configuredSelection.profileId }),
                    modelId: selected.id,
                    structuredOutputMode: configuredSelection.structuredOutputMode,
                    ...(selected.contextWindowTokens === undefined ? {} : { contextWindowTokens: selected.contextWindowTokens }),
                    ...(selected.maxOutputTokens === undefined ? {} : { maxOutputTokens: selected.maxOutputTokens }),
                    inputEstimator: configuredSelection.inputEstimator,
                },
            };
        };
        const commandService = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            launcher: root.browserLauncher,
            coordinator: root.coordinator,
            modelSelectionCoordinator: root.goalModelSelectionCoordinator,
            defaultModelSelection: root.defaultModelSelection,
            resolveDefaultModelSelection: async () => (await readDraftModel()).selection,
            saveModelPreference: (selection) => preferenceStore.set({
                ...(selection.profileId === undefined ? {} : { profileId: selection.profileId }),
                modelId: selection.modelId,
            }),
            restoreModelBinding: async (goal) => {
                const selection = goal.state.modelSelection;
                if (selection.profileId === undefined) {
                    const provider = root.llmConfig?.provider ?? root.defaultModelSelection.provider;
                    if (selection.provider !== provider) return false;
                } else {
                    try {
                        if (root.resolveProviderProfileConfig(selection.profileId, selection.modelId).provider !== selection.provider) {
                            return false;
                        }
                    } catch {
                        return false;
                    }
                }
                try {
                    root.alignModelBinding(selection);
                    return true;
                } catch {
                    return false;
                }
            },
            resolveModelSelection: async (modelId, current) => {
                let config = root.llmConfig;
                if (current.profileId !== undefined) {
                    try {
                        config = root.resolveProviderProfileConfig(current.profileId, current.modelId);
                    } catch {
                        return undefined;
                    }
                }
                if (config === undefined) return undefined;
                const models = await root.modelCatalog.list(
                    { ...config, model: current.modelId },
                    { requireTokenCapacity: current.inputEstimator.kind === "token-encoding" },
                );
                const model = models.find((entry) => entry.provider === current.provider && entry.id === modelId && entry.selectable);
                if (model === undefined) return undefined;
                return {
                    provider: model.provider,
                    ...(current.profileId === undefined ? {} : { profileId: current.profileId }),
                    modelId: model.id,
                    structuredOutputMode: current.structuredOutputMode,
                    ...(model.contextWindowTokens === undefined ? {} : { contextWindowTokens: model.contextWindowTokens }),
                    ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
                    inputEstimator: current.inputEstimator,
                };
            },
            profileId: root.profile.id,
            control: { signal: root.abortController.signal },
        });
        const streamService = new BrowserGoalStreamService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            publisher: root.executionStream,
            onGoalActivityChanged: (listener) => commandService.onGoalActivityChanged(listener),
        });
        root.httpService.mount("/", createBrowserWorkspaceRoutes(root.workspaceRoot));
        root.httpService.mount("/", createBrowserGoalRoutes({
            list: () => listBrowserGoals(root.workspaceGoalStore, commandService.getActiveGoalId()),
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
            read: (goalId) => readBrowserGoalSession(
                goalId,
                root.workspaceGoalStore,
                root.readWorkspaceTrajectory,
                commandService.getActiveGoalId(),
            ),
            create: (command) => commandService.create(command),
            interact: (goalId, command) => commandService.interact(goalId, command),
            message: (goalId, command) => commandService.message(goalId, command),
            interrupt: (goalId, command) => commandService.interrupt(goalId, command),
            resume: (goalId, command) => commandService.resume(goalId, command),
            enterPlanMode: (goalId, command) => commandService.enterPlanMode(goalId, command),
            selectModel: (goalId, command) => commandService.selectModel(goalId, command),
            providerSettings: {
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
                        const profile = await root.providerProfileStore.create(toProfileDraft(input));
                        await root.refreshProviderProfiles();
                        return { ok: true as const, profile: toBrowserProviderProfile(profile) };
                    } catch (error) {
                        return { ok: false as const, ...mapProviderSettingsError(error) };
                    }
                },
                update: async (profileId, input) => {
                    try {
                        const profile = await root.providerProfileStore.update(profileId, toProfilePatch(input));
                        await root.refreshProviderProfiles();
                        return { ok: true as const, profile: toBrowserProviderProfile(profile) };
                    } catch (error) {
                        return { ok: false as const, ...mapProviderSettingsError(error) };
                    }
                },
                remove: async (profileId) => {
                    try {
                        const profile = await root.providerProfileStore.delete(profileId);
                        await root.refreshProviderProfiles();
                        return {
                            ok: true as const,
                            profile: toBrowserProviderProfile(profile),
                            mayBeReferencedByGoals: true,
                        };
                    } catch (error) {
                        return { ok: false as const, error: mapProviderSettingsError(error).error };
                    }
                },
                activate: async (profileId) => {
                    try {
                        await root.providerProfileStore.setActive(profileId);
                        await root.refreshProviderProfiles();
                        return { ok: true as const, activeProfileId: profileId };
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
            setModelPreference: async (modelId) => {
                if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                if (root.llmConfig === undefined) return { ok: false, error: "model_catalog_unavailable" };
                let selectable = false;
                try {
                    const models = await root.modelCatalog.list(
                        { ...root.llmConfig, model: configuredSelection.modelId },
                        { requireTokenCapacity: configuredSelection.inputEstimator.kind === "token-encoding" },
                    );
                    selectable = models.some((model) => model.provider === root.llmConfig?.provider && model.id === modelId && model.selectable);
                } catch {
                    if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                    return { ok: false, error: "model_catalog_unavailable" };
                }
                if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                if (!selectable) return { ok: false, error: "model_not_selectable" };
                try {
                    if (root.abortController.signal.aborted) return { ok: false, error: "service_shutting_down" };
                    await preferenceStore.set({
                        ...(configuredSelection.profileId === undefined ? {} : { profileId: configuredSelection.profileId }),
                        modelId,
                    });
                    return { ok: true, modelId };
                } catch {
                    return { ok: false, error: "model_preference_unavailable" };
                }
            },
            models: async (target, signal) => {
                if (target === undefined) {
                    try {
                        return { ok: true, catalog: (await readDraftModel(signal)).catalog };
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
                if (target !== undefined) {
                    const goal = await root.workspaceGoalStore.restore(target.goalId);
                    if (goal === undefined) return { ok: false, error: "goal_not_found" };
                    if (goal.state.run.id !== target.runId) return { ok: false, error: "stale_run" };
                    currentModelId = goal.state.modelSelection.modelId;
                    requireTokenCapacity = goal.state.modelSelection.inputEstimator.kind === "token-encoding";
                }
                if (root.llmConfig === undefined) return { ok: false, error: "model_catalog_unavailable" };
                try {
                    const models = await root.modelCatalog.list(
                        { ...root.llmConfig, model: currentModelId },
                        { signal, requireTokenCapacity },
                    );
                    return {
                        ok: true,
                        catalog: projectBrowserModelCatalog(root.llmConfig.provider, currentModelId, models),
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
            listToolGrants: (goalId, runId) => commandService.listToolGrants(goalId, runId),
            revokeToolGrant: (goalId, command) => commandService.revokeToolGrant(goalId, command),
            getPermissionMode: () => commandService.getPermissionMode(),
            setPermissionMode: (command) => commandService.setPermissionMode(command),
            openStream: (goalId, runId, signal) => streamService.open(goalId, runId, signal),
        }));
        root.httpService.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.readWorkspaceTrajectory));
        root.httpService.mount("/", createBrowserModelInputRoutes(root.workspaceGoalStore, root.readWorkspaceModelInputs));
        root.httpService.mount("/", createBrowserStaticRoutes(staticDirectory));
        const address = await root.httpService.start(0);
        access.bindOrigin(address.origin);
        writeOutput(access.createLaunchUrl(address.origin));
        await shutdownSignal;
        await shutdownPromise;
        return 130;
    } finally {
        process.off("SIGINT", onSigint);
        if (shutdownPromise === undefined) {
            root.checkpointStore.freeze();
            root.abortController.abort();
            await root.resources.closeAll();
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
