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
    createCompositionRoot,
    type CompositionRoot,
    type CompositionRootOptions,
} from "./composition-root";

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
                configuredProvider, configuredSelection.modelId, preference, models,
            );
            return {
                catalog,
                selection: selected === undefined ? undefined : {
                    provider: configuredProvider,
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
            saveModelPreference: (selection) => preferenceStore.set({ provider: selection.provider, modelId: selection.modelId }),
            restoreModelBinding: async (goal) => {
                const provider = root.llmConfig?.provider ?? root.defaultModelSelection.provider;
                if (goal.state.modelSelection.provider !== provider) return false;
                try {
                    root.alignModelBinding(goal.state.modelSelection);
                    return true;
                } catch {
                    return false;
                }
            },
            resolveModelSelection: async (modelId, current) => {
                if (root.llmConfig === undefined || current.provider !== root.llmConfig.provider) {
                    return undefined;
                }
                const models = await root.modelCatalog.list(
                    { ...root.llmConfig, model: current.modelId },
                    { requireTokenCapacity: current.inputEstimator.kind === "token-encoding" },
                );
                const model = models.find((entry) => entry.provider === current.provider && entry.id === modelId && entry.selectable);
                if (model === undefined) return undefined;
                return {
                    provider: model.provider,
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
            resume: (goalId, command) => commandService.resume(goalId, command),
            enterPlanMode: (goalId, command) => commandService.enterPlanMode(goalId, command),
            selectModel: (goalId, command) => commandService.selectModel(goalId, command),
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
                    await preferenceStore.set({ provider: root.llmConfig.provider, modelId });
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
