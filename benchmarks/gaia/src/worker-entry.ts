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
    type AcpPromptResult,
    type AcpSession,
    type AcpSessionFactory,
    type AcpSessionInput,
} from "../../../packages/acp/src/index.js";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type AgentProfile,
    type ToolRegistry,
} from "../../../packages/runtime/src/index.js";
import {
    READ_FILE_TOOL_ID,
    ReadFileTool,
    WEB_FETCH_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WebFetchTool,
    WebSearchTool,
    type WebFetchHandler,
    type WebSearchBackend,
} from "../../../packages/tools/src/index.js";
import {
    HeadlessCompositionRoot,
    type BenchmarkAdapter,
    type BenchmarkEpisode,
    type BenchmarkEpisodeContext,
    type BenchmarkTaskDescriptor,
    type HeadlessEpisodeResult,
} from "../../src/headless-composition-root.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { createAcpMuxStream, MultiplexedConnection } from "../../src/multiplex.js";
import { RpcLlmAdapter } from "../../src/llm-rpc.js";
import type { GaiaManifestTask } from "./types.js";
import { SUBMIT_ANSWER_TOOL_ID, SubmitAnswerTool } from "./submit-answer.js";

/** GAIA Worker 支持且仅支持的四个工具 ID 列表。 */
export const GAIA_PROFILE_TOOL_IDS = Object.freeze([
    READ_FILE_TOOL_ID,
    WEB_SEARCH_TOOL_ID,
    WEB_FETCH_TOOL_ID,
    SUBMIT_ANSWER_TOOL_ID,
] as const);

/** GAIA Worker 默认最大执行步数。 */
export const GAIA_DEFAULT_MAX_STEPS = 30;

/** GAIA 容器内固定的 Agent Profile。 */
export const GAIA_WORKER_PROFILE: AgentProfile = Object.freeze({
    id: "gaia-worker-profile",
    name: "GAIA QA evaluation agent",
    description: "Container profile for GAIA question answering evaluation.",
    systemPrompt: "You are an AI assistant solving a GAIA benchmark question. Read the question in /workspace/question.txt, use available tools (read_file, web_search, web_fetch) to research facts, and call submit_answer exactly once with your final answer.",
    instructions: Object.freeze([
        "Inspect files and attachments in /workspace using read_file.",
        "Search information online using web_search and web_fetch.",
        "Submit your final answer using submit_answer as soon as you have found the answer.",
        "You may call submit_answer only once. After submitting, your task is completed.",
    ]),
    toolIds: GAIA_PROFILE_TOOL_IDS,
});

/** GAIA Worker 工具装配选项。 */
export interface GaiaWorkerToolOptions {
    /** 工作区根目录，默认 `/workspace`。 */
    readonly workspaceRoot?: string;
    /** 任务唯一标识。 */
    readonly taskId: string;
    /** 答案文件落盘路径，默认 `/workspace/answer.json`。 */
    readonly answerFilePath?: string;
    /** 宿主代理搜索后端。 */
    readonly searchBackend?: WebSearchBackend;
    /** 宿主代理抓取实现。 */
    readonly fetchHandler?: WebFetchHandler;
    /** 答案提交成功时的回调。 */
    readonly onSubmit?: (answer: string) => void;
}

/**
 * 装配 GAIA Worker 的 ToolRegistry。
 *
 * @remarks
 * 该注册表包含且仅包含 `read_file`、`web_search`、`web_fetch`、`submit_answer` 四个工具。
 *
 * @param options - 工具初始化配置。
 * @returns 包含固定四个工具的 InMemoryToolRegistry。
 *
 * @example
 * ```ts
 * const registry = createGaiaWorkerToolRegistry({ taskId: "gaia-1" });
 * ```
 */
export function createGaiaWorkerToolRegistry(
    options: GaiaWorkerToolOptions,
): InMemoryToolRegistry {
    const workspaceRoot = options.workspaceRoot ?? "/workspace";
    const submitAnswerTool = new SubmitAnswerTool({
        taskId: options.taskId,
        ...(options.answerFilePath !== undefined ? { answerFilePath: options.answerFilePath } : {}),
        ...(options.onSubmit !== undefined ? { onSubmit: options.onSubmit } : {}),
    });

    return new InMemoryToolRegistry([
        createToolRegistration(new ReadFileTool(workspaceRoot)),
        createToolRegistration(new WebSearchTool(options.searchBackend)),
        createToolRegistration(new WebFetchTool(options.fetchHandler)),
        createToolRegistration(submitAnswerTool),
    ]);
}

/** GAIA Worker 任务执行产物结果。 */
export interface GaiaEpisodeOutcome {
    readonly submitted: boolean;
    readonly submittedAnswer: string | null;
}

/**
 * GAIA 对 HeadlessCompositionRoot 的适配器。
 */
export class GaiaBenchmarkAdapter
    implements BenchmarkAdapter<GaiaManifestTask, GaiaEpisodeOutcome> {
    private submittedAnswer: string | null = null;
    private submitted = false;

    constructor(private readonly toolOptions: Omit<GaiaWorkerToolOptions, "taskId" | "onSubmit">) {}

    describeTask(task: GaiaManifestTask): BenchmarkTaskDescriptor {
        return {
            intent: task.question,
            objective: "回答 GAIA 任务问题并通过 submit_answer 提交最终短答案",
            completionCriteria: ["调用 submit_answer 提交最终答案"],
            maxSteps: GAIA_DEFAULT_MAX_STEPS,
        };
    }

    async createEpisode(
        task: GaiaManifestTask,
        _context: BenchmarkEpisodeContext,
    ): Promise<BenchmarkEpisode<GaiaEpisodeOutcome>> {
        const registry = createGaiaWorkerToolRegistry({
            ...this.toolOptions,
            taskId: task.taskId,
            onSubmit: (answer) => {
                this.submitted = true;
                this.submittedAnswer = answer;
            },
        });

        return {
            registry,
            readOutcome: () => ({
                submitted: this.submitted,
                submittedAnswer: this.submittedAnswer,
            }),
            close: async () => {},
        };
    }
}

/** 经 ACP wire 接收的 GAIA 任务 metadata。 */
export interface GaiaAcpTaskMetadata extends GaiaManifestTask {
    readonly goalId: string;
    readonly runId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    readonly problemStatement?: string;
}

/**
 * 校验并解析来自 ACP session metadata 的 GAIA 任务数据。
 */
export function parseGaiaAcpTaskMetadata(value: unknown): GaiaAcpTaskMetadata {
    if (typeof value !== "object" || value === null) {
        throw new TypeError("Invalid GAIA ACP session metadata: expected an object");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.taskId !== "string" || record.taskId.trim().length === 0) {
        throw new TypeError("Invalid GAIA ACP session metadata: missing taskId");
    }
    if (typeof record.question !== "string" || record.question.trim().length === 0) {
        throw new TypeError("Invalid GAIA ACP session metadata: missing question");
    }
    if (record.level !== 1 && record.level !== 2 && record.level !== 3) {
        throw new TypeError("Invalid GAIA ACP session metadata: invalid level");
    }
    if (record.split !== "validation" && record.split !== "test") {
        throw new TypeError("Invalid GAIA ACP session metadata: invalid split");
    }
    if (typeof record.goalId !== "string" || typeof record.runId !== "string") {
        throw new TypeError("Invalid GAIA ACP session metadata: missing goalId or runId");
    }
    const mode = record.structuredOutputMode;
    if (mode !== "strict" && mode !== "prompt_only") {
        throw new TypeError("Invalid GAIA ACP session metadata: invalid structuredOutputMode");
    }

    return {
        taskId: record.taskId,
        question: record.question,
        expectedAnswer: typeof record.expectedAnswer === "string" ? record.expectedAnswer : null,
        level: record.level,
        split: record.split,
        attachments: Array.isArray(record.attachments) ? record.attachments : [],
        goalId: record.goalId,
        runId: record.runId,
        structuredOutputMode: mode,
        problemStatement: typeof record.problemStatement === "string" ? record.problemStatement : record.question,
    };
}

/** GAIA ACP 运行配置。 */
export interface GaiaAcpRuntimeOptions {
    readonly metadata: GaiaAcpTaskMetadata;
    readonly llmAdapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly workspaceRoot?: string;
    readonly stateRoot?: string;
    readonly signal?: AbortSignal;
}

/**
 * 在 GAIA 容器内执行一次 HeadlessCompositionRoot 任务。
 */
export async function runGaiaAcpTask(
    options: GaiaAcpRuntimeOptions,
): Promise<HeadlessEpisodeResult<GaiaEpisodeOutcome>> {
    const workspaceRoot = options.workspaceRoot ?? "/workspace";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";

    const adapter = new GaiaBenchmarkAdapter({ workspaceRoot });
    const persistence = new JsonFileBenchmarkPersistenceAdapter<GaiaManifestTask>({
        rootDirectory: stateRoot,
        namespaceFor: (t) => t.taskId,
        enableTrace: true,
    });

    const root = new HeadlessCompositionRoot<GaiaManifestTask, GaiaEpisodeOutcome>({
        benchmarkId: "gaia",
        workspaceRoot,
        profile: GAIA_WORKER_PROFILE,
        llmAdapter: options.llmAdapter,
        renderer: options.renderer,
        contextCompactor: options.contextCompactor,
        adapter,
        persistence,
        toolPolicy: { evaluate: () => "allow" },
        goalIdGenerator: () => options.metadata.goalId,
        runIdGenerator: () => options.metadata.runId,
    });

    return await root.run(
        options.metadata,
        options.signal === undefined ? {} : { signal: options.signal },
    );
}

/**
 * GAIA Worker 内置 Prompt 模板相对路径。
 */
export const GAIA_ACP_WORKER_PROMPT_ASSETS = Object.freeze([
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
] as const);

/** GAIA Worker Prompt 资产 ID 映射。 */
export const GAIA_ACP_WORKER_PROMPT_ASSET_IDS = Object.freeze([
    "global-overview@1",
    "profile@1",
    "agent-decision@1",
    "authorized-tools@1",
] as const);

type EmbeddedPromptAssets = Readonly<Record<string, string>>;

function createEmbeddedPromptRenderer(): PromptBundleRenderer {
    const assets = (globalThis as typeof globalThis & { __lazygoalPromptAssets?: EmbeddedPromptAssets }).__lazygoalPromptAssets;
    if (assets === undefined) throw new Error("Embedded Worker Prompt assets are missing");
    const templates = GAIA_ACP_WORKER_PROMPT_ASSETS.map((path, index) => {
        const source = assets[path];
        const id = GAIA_ACP_WORKER_PROMPT_ASSET_IDS[index];
        if (source === undefined || id === undefined) throw new Error(`Embedded Prompt asset is missing: ${path}`);
        return { id, source };
    });
    return createPromptBundleRenderer({ templates, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST] });
}

/**
 * GAIA Worker 入口函数。
 *
 * @remarks
 * 建立与宿主的 MultiplexedConnection，在 llm 频道运行 RpcLlmAdapter，在 acp 频道提供 ACP Agent 服务。
 */
export async function runGaiaWorker(): Promise<void> {
    const mux = new MultiplexedConnection({
        input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
        output: Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    });

    let adapter: RpcLlmAdapter | undefined;
    const renderer = createEmbeddedPromptRenderer();

    const sessions: AcpSessionFactory = {
        async create(input: AcpSessionInput): Promise<AcpSession> {
            if (adapter !== undefined) {
                throw new Error("Worker supports one ACP Session per connection");
            }
            const metadata = parseGaiaAcpTaskMetadata(input.sessionMeta);
            adapter = new RpcLlmAdapter({
                stream: mux.channel("llm"),
                structuredOutputMode: metadata.structuredOutputMode,
            });

            return {
                async prompt(_content, control): Promise<AcpPromptResult> {
                    if (control.signal.aborted) return { stopReason: "cancelled" };
                    const result = await runGaiaAcpTask({
                        metadata,
                        llmAdapter: adapter!,
                        renderer,
                        contextCompactor: new DropOldestContextCompactor(),
                        signal: control.signal,
                    });
                    if (control.signal.aborted) return { stopReason: "cancelled" };
                    const stopReason = result.outcome.submitted ? "end_turn" : "max_turn_requests";
                    return { stopReason };
                },
                dispose: async () => {
                    await adapter?.close();
                    adapter = undefined;
                },
            };
        },
    };

    const connection = serveLazyGoalAcpAgent({
        stream: createAcpMuxStream(mux),
        sessions,
        agentInfo: { name: "lazygoal-gaia-worker", version: "1" },
    });

    try {
        await connection.closed;
    } finally {
        await adapter?.close().catch(() => undefined);
        await mux.close();
    }
}

if (process.argv[1] !== undefined && (process.argv[1].endsWith("worker.mjs") || process.argv[1].endsWith("worker-entry.ts"))) {
    void runGaiaWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
