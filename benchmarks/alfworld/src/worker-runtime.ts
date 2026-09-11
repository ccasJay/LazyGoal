import { writeFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import {
    createPromptBundleRenderer,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    DropOldestContextCompactor,
    type ContextCompactor,
    type LLMAdapter,
    type ModelConversationMessage,
    type PromptBundleRenderer,
} from "../../../packages/agent/src/index.js";
import {
    serveLazyGoalAcpAgent,
    type AcpPromptContent,
    type AcpPromptResult,
    type AcpSession,
    type AcpSessionFactory,
} from "../../../packages/acp/src/index.js";
import {
    createAcpMuxStream,
    MultiplexedConnection,
} from "../../src/multiplex.js";
import { RpcLlmAdapter } from "../../src/llm-rpc.js";
import {
    HeadlessCompositionRoot,
    type HeadlessEpisodeResult,
} from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import {
    ALFWORLD_CONTAINER_DATA_ROOT,
    ALFWORLD_CONTAINER_SIDECAR_PATH,
    ALFWORLD_ACP_WORKER_PROMPT_ASSET_IDS,
    ALFWORLD_ACP_WORKER_PROMPT_ASSETS,
} from "./worker-config.js";
import { AlfworldBenchmarkAdapter } from "./alfworld-adapter.js";
import { SidecarClient } from "./sidecar-client.js";
import type { AlfworldManifestTask } from "./manifest.js";
import { ALFWORLD_PROFILE_TOOL_IDS } from "./profile.js";
import type { EpisodeEnvironmentFacts } from "./report.js";

type EmbeddedPromptAssets = Readonly<Record<string, string>>;

/** ALFWorld Worker 容器内固定的 Profile；只注册读取和环境 Tool。 */
export const ALFWORLD_WORKER_PROFILE = Object.freeze({
    id: "alfworld-profile",
    name: "ALFWorld TextWorld container",
    description: "Container profile for the ALFWorld TextWorld sidecar.",
    systemPrompt: "You are an ALFWorld TextWorld evaluation agent. Use only the authorized tools and treat environment observations as the source of truth.",
    instructions: Object.freeze([
        "Call alfworld_reset before the first environment action.",
        "Call alfworld_step at most once per decision with exactly one admissible command.",
        "Do not use Bash or write tools; complete only when the environment reports won=true.",
    ]),
    toolIds: ALFWORLD_PROFILE_TOOL_IDS,
});

/** Worker 通过 ACP session metadata 接收的单题身份和容器路径。 */
export interface AlfworldAcpTaskMetadata extends AlfworldManifestTask {
    readonly problemStatement: string;
    readonly goalId: string;
    readonly runId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    readonly dataRoot?: string;
    readonly pythonExecutable?: string;
    readonly sidecarPath?: string;
}

/**
 * 校验来自 ACP wire boundary 的 ALFWorld metadata。
 *
 * @param value - `session/new` 的 `_meta` 未知对象。
 * @returns 通过身份、路径和输出模式校验的当前任务。
 * @throws metadata 缺失或字段违反当前 Worker 协议时抛出异常。
 * @example
 * ```ts
 * const task = parseAlfworldAcpTaskMetadata(input.sessionMeta);
 * console.log(task.taskId, task.maxSteps);
 * ```
 */
export function parseAlfworldAcpTaskMetadata(value: unknown): AlfworldAcpTaskMetadata {
    if (!isRecord(value)
        || !Number.isSafeInteger(value.order) || (value.order as number) < 0
        || typeof value.taskId !== "string" || !/^[-A-Za-z0-9_.]+$/u.test(value.taskId)
        || !isAlfworldSplit(value.split)
        || typeof value.gameFile !== "string" || value.gameFile.trim() === "" || value.gameFile.startsWith("/") || value.gameFile.split("/").includes("..")
        || !Number.isSafeInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) > 0xffffffff
        || !Number.isSafeInteger(value.maxSteps) || (value.maxSteps as number) < 1
        || typeof value.problemStatement !== "string" || value.problemStatement.trim() === ""
        || typeof value.goalId !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(value.goalId)
        || typeof value.runId !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(value.runId)
        || (value.structuredOutputMode !== "strict" && value.structuredOutputMode !== "prompt_only")
        || (value.dataRoot !== undefined && (typeof value.dataRoot !== "string" || !value.dataRoot.startsWith("/")))
        || (value.pythonExecutable !== undefined && typeof value.pythonExecutable !== "string")
        || (value.sidecarPath !== undefined && (typeof value.sidecarPath !== "string" || !value.sidecarPath.startsWith("/")))) {
        throw new TypeError("Invalid ALFWorld ACP session metadata");
    }
    const order = value.order as number;
    const seed = value.seed as number;
    const maxSteps = value.maxSteps as number;
    return {
        order,
        taskId: value.taskId,
        split: value.split,
        gameFile: value.gameFile,
        seed,
        maxSteps,
        problemStatement: value.problemStatement,
        goalId: value.goalId,
        runId: value.runId,
        structuredOutputMode: value.structuredOutputMode,
        ...(value.dataRoot === undefined ? {} : { dataRoot: value.dataRoot }),
        ...(value.pythonExecutable === undefined ? {} : { pythonExecutable: value.pythonExecutable }),
        ...(value.sidecarPath === undefined ? {} : { sidecarPath: value.sidecarPath }),
    };
}

/** Worker Headless Root 的装配配置。 */
export interface AlfworldAcpRuntimeOptions {
    readonly metadata: AlfworldAcpTaskMetadata;
    readonly llmAdapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly workspaceRoot?: string;
    readonly stateRoot?: string;
    readonly sidecarPath?: string;
    readonly pythonExecutable?: string;
    readonly dataRoot?: string;
    readonly signal?: AbortSignal;
}

/**
 * 在 ALFWorld 容器内启动一次 Headless Root，并保存领域结果供宿主回收。
 *
 * @param options - ACP metadata、宿主 LLM RPC Adapter 和 Worker 资源配置。
 * @returns Root 的领域、模型和持久化事实。
 * @throws Root、sidecar 或持久化边界失败时抛出原始错误。
 * @example
 * ```ts
 * const result = await runAlfworldAcpTask({ metadata, llmAdapter, renderer, contextCompactor });
 * console.log(result.outcome.won);
 * ```
 */
export async function runAlfworldAcpTask(
    options: AlfworldAcpRuntimeOptions,
): Promise<HeadlessEpisodeResult<EpisodeEnvironmentFacts>> {
    const metadata = options.metadata;
    if (options.llmAdapter.structuredOutputMode !== metadata.structuredOutputMode) {
        throw new TypeError("LLM structured-output mode does not match ALFWorld Worker metadata");
    }
    const workspaceRoot = options.workspaceRoot ?? "/workspace";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";
    const client = new SidecarClient({
        pythonExecutable: options.pythonExecutable ?? metadata.pythonExecutable ?? "python3",
        scriptPath: options.sidecarPath ?? metadata.sidecarPath ?? ALFWORLD_CONTAINER_SIDECAR_PATH,
        dataRoot: options.dataRoot ?? metadata.dataRoot ?? ALFWORLD_CONTAINER_DATA_ROOT,
    });
    const benchmarkAdapter = new AlfworldBenchmarkAdapter({
        workspaceRoot,
        createClient: () => client,
    });
    const persistence = new JsonFileBenchmarkPersistenceAdapter<AlfworldManifestTask>({
        rootDirectory: stateRoot,
        namespaceFor: (task) => task.taskId,
        enableTrace: true,
    });
    const root = new HeadlessCompositionRoot<AlfworldManifestTask, EpisodeEnvironmentFacts>({
        benchmarkId: "alfworld",
        workspaceRoot,
        profile: ALFWORLD_WORKER_PROFILE,
        llmAdapter: options.llmAdapter,
        renderer: options.renderer,
        contextCompactor: options.contextCompactor,
        adapter: benchmarkAdapter,
        persistence,
        toolPolicy: { evaluate: () => "allow" },
        goalIdGenerator: () => metadata.goalId,
        runIdGenerator: () => metadata.runId,
    });
    const result = await root.run(metadata, options.signal === undefined ? {} : { signal: options.signal });
    await writeFile(ALFWORLD_RESULT_PATH, JSON.stringify({
        environment: result.outcome,
        model: result.model,
        persistence: result.persistence,
    }) + "\n", "utf8");
    return result;
}

/**
 * 创建单连接 ALFWorld ACP Session 工厂；每个连接只允许一次 Prompt。
 *
 * @param options - 宿主 RPC Adapter、Prompt Renderer 和上下文策略。
 * @returns ACP Agent 可直接使用的 Session 工厂。
 * @example
 * ```ts
 * const sessions = createAlfworldAcpSessionFactory({
 *   llmAdapter, renderer, contextCompactor,
 * });
 * ```
 */
export function createAlfworldAcpSessionFactory(
    options: Omit<AlfworldAcpRuntimeOptions, "metadata" | "signal"> & { readonly problemStatement: string },
): AcpSessionFactory {
    if (options.problemStatement.trim() === "") throw new TypeError("problemStatement must be non-empty");
    return {
        async create(input): Promise<AcpSession> {
            let disposed = false;
            let prompting = false;
            return {
                async prompt(content, control): Promise<AcpPromptResult> {
                    if (disposed) throw new Error("ALFWorld ACP Session is disposed");
                    if (prompting) throw new Error("ALFWorld ACP Session already has a Prompt in progress");
                    const statement = readPrompt(content);
                    if (statement.trim() !== options.problemStatement.trim()) throw new Error("ACP Prompt does not match ALFWorld task metadata");
                    const metadata = parseAlfworldAcpTaskMetadata(input.sessionMeta);
                    prompting = true;
                    try {
                        if (control.signal.aborted) return { stopReason: "cancelled" };
                        const result = await runAlfworldAcpTask({ ...options, metadata, signal: control.signal });
                        if (control.signal.aborted) return { stopReason: "cancelled" };
                        const stopReason = result.runner?.ok && result.runner.state.stopReason?.kind === "max_steps_exceeded"
                            ? "max_turn_requests" : "end_turn";
                        return {
                            stopReason,
                            meta: {
                                goalId: metadata.goalId,
                                runId: metadata.runId,
                                environment: result.outcome,
                                model: result.model,
                                persistence: result.persistence,
                            },
                        };
                    } finally {
                        prompting = false;
                    }
                },
                async dispose(): Promise<void> { disposed = true; },
            };
        },
    };
}

/** ALFWorld Worker 的 ACP/LLM 进程入口；stdout 仅承载 Mux 帧。 */
export async function runAlfworldWorker(): Promise<void> {
    const mux = new MultiplexedConnection({
        input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
        output: Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    });
    let adapter: RpcLlmAdapter | undefined;
    const renderer = createEmbeddedPromptRenderer();
    const sessions: AcpSessionFactory = {
        async create(input) {
            if (adapter !== undefined) throw new Error("ALFWorld Worker supports one ACP Session per connection");
            const metadata = parseAlfworldAcpTaskMetadata(input.sessionMeta);
            adapter = new RpcLlmAdapter({ stream: mux.channel("llm"), structuredOutputMode: metadata.structuredOutputMode });
            const factory = createAlfworldAcpSessionFactory({
                problemStatement: metadata.problemStatement,
                llmAdapter: adapter,
                renderer,
                contextCompactor: new DropOldestContextCompactor(),
            });
            const session = await factory.create(input);
            return {
                prompt: session.prompt.bind(session),
                dispose: async () => {
                    try { await session.dispose(); }
                    finally { await adapter?.close(); adapter = undefined; }
                },
            };
        },
    };
    const connection = serveLazyGoalAcpAgent({
        stream: createAcpMuxStream(mux),
        sessions,
        agentInfo: { name: "lazygoal-alfworld-worker", version: "1" },
    });
    try {
        await connection.closed;
    } finally {
        await adapter?.close().catch(() => undefined);
        await mux.close();
    }
}

/** Worker 写给 EnvironmentSpec 的领域结果文件。 */
export const ALFWORLD_RESULT_PATH = "/opt/lazygoal/alfworld-result.json" as const;

function createEmbeddedPromptRenderer(): PromptBundleRenderer {
    const assets = (globalThis as typeof globalThis & { __lazygoalPromptAssets?: EmbeddedPromptAssets }).__lazygoalPromptAssets;
    if (assets === undefined) throw new Error("Embedded Worker Prompt assets are missing");
    const templates = ALFWORLD_ACP_WORKER_PROMPT_ASSETS.map((path, index) => {
        const source = assets[path];
        const id = ALFWORLD_ACP_WORKER_PROMPT_ASSET_IDS[index];
        if (source === undefined || id === undefined) throw new Error(`Embedded Prompt asset is missing: ${path}`);
        return { id, source };
    });
    return createPromptBundleRenderer({ templates, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST] });
}

function readPrompt(content: readonly AcpPromptContent[]): string {
    if (content.length !== 1 || content[0]?.type !== "text" || content[0].text.trim() === "") {
        throw new Error("ALFWorld ACP Prompt must contain one non-empty problem statement");
    }
    return content[0].text;
}

function isAlfworldSplit(value: unknown): value is AlfworldManifestTask["split"] {
    return value === "train" || value === "valid_seen" || value === "valid_unseen" || value === "test_seen" || value === "test_unseen";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 该模块由 WorkerBuilder 打包后以 `worker.mjs` 作为直接入口。 */
if (process.argv[1] !== undefined && process.argv[1].endsWith("worker.mjs")) {
    void runAlfworldWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
