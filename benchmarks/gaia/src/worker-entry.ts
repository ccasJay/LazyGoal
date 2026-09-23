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
import { validatePromptEvaluationProfile } from "../../src/prompt-evaluation/profile.js";
import {
    GAIA_PROFILE_TOOL_IDS,
    GAIA_STRUCTURED_OUTPUT_MODE,
    GAIA_WORKER_PROFILE,
} from "./profile.js";
import type { GaiaManifestTask } from "./types.js";
import { SUBMIT_ANSWER_TOOL_ID, SubmitAnswerTool } from "./submit-answer.js";
import { GaiaBashTool } from "./bash.js";

export {
    GAIA_PROFILE_TOOL_IDS,
    GAIA_STRUCTURED_OUTPUT_MODE,
    GAIA_WORKER_PROFILE,
} from "./profile.js";

/** GAIA Worker 默认执行步数；Runtime 以 0 表示不设置步数上限。 */
export const GAIA_DEFAULT_MAX_STEPS = 0;

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
 * 该注册表包含且仅包含 `read_file`、`web_search`、`web_fetch`、`bash`、`submit_answer` 五个工具。
 *
 * @param options - 工具初始化配置。
 * @returns 包含固定五个工具的 InMemoryToolRegistry。
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
        createToolRegistration(new GaiaBashTool(workspaceRoot)),
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
    /** Prompt Evaluation 提供时用于校验宿主基准身份。 */
    readonly baseProfile?: AgentProfile;
    /** Prompt Evaluation 实际冻结到 Goal 的候选 Profile。 */
    readonly profile?: AgentProfile;
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
    if (mode !== GAIA_STRUCTURED_OUTPUT_MODE) {
        throw new TypeError(
            `Invalid GAIA ACP session metadata: structuredOutputMode must be ${GAIA_STRUCTURED_OUTPUT_MODE}`,
        );
    }

    const promptProfiles = parseGaiaPromptEvaluationProfiles(record);
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
        ...promptProfiles,
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
        profile: options.metadata.profile ?? GAIA_WORKER_PROFILE,
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
 * 将 GAIA Headless Runtime 结果映射为 ACP Prompt 终态。
 *
 * @remarks
 * `max_turn_requests` 只表示 Runtime 实际触发 `max_steps_exceeded`；不能把所有
 * 未提交答案的结果都伪装成轮数上限。普通完成或等待返回 `end_turn`，取消返回
 * `cancelled`；由模型自身决策行为引起的终止（如 `INVALID_AGENT_DECISION`）映射为
 * `end_turn` 并通过 meta 记录 executionError 作为未作答领域失败（badcase）；
 * 其他 Runtime 或清理错误保留为基础设施失败，不伪装成受支持终态。
 *
 * @param result - 已恢复并包含 Runtime 终态的 Headless 结果。
 * @returns 与 ACP v1 一致的 Prompt 终态和可审计元数据。
 * @throws Runtime、协议或清理未达到受支持终态时抛出错误。
 *
 * @example
 * ```ts
 * const response = projectGaiaAcpResult(result);
 * console.log(response.stopReason);
 * ```
 */
export function projectGaiaAcpResult(
    result: HeadlessEpisodeResult<GaiaEpisodeOutcome>,
): AcpPromptResult {
    const run = result.goal.state.run;
    const meta = {
        modelCompleted: result.model.completed,
        runStatus: result.model.runStatus,
        stepCount: run.stepCount,
        submitted: result.outcome.submitted,
    };

    if (result.cleanupError !== undefined) {
        throw new Error("GAIA Worker cleanup failed");
    }
    if (!result.progress.ok) {
        throw new Error(`GAIA Runtime did not reach a valid terminal state: ${result.progress.error.code}`);
    }
    if (result.runner !== null && !result.runner.ok) {
        throw new Error(`GAIA Runner did not reach a valid terminal state: ${result.runner.error.code}`);
    }
    if (result.model.runStatus !== run.status) {
        throw new Error("GAIA model and Goal Run statuses disagree");
    }
    if (run.status === "completed" || run.status === "waiting") {
        return { stopReason: "end_turn", meta };
    }
    if (run.status === "cancelled") {
        return { stopReason: "cancelled", meta };
    }
    if (run.status === "failed" && run.stopReason?.kind === "max_steps_exceeded") {
        return { stopReason: "max_turn_requests", meta };
    }
    if (result.outcome.submitted) {
        return {
            stopReason: "end_turn",
            meta: {
                ...meta,
                ...(run.stopReason?.kind === "execution_error" ? { executionError: run.stopReason.code } : {}),
            },
        };
    }
    if (
        run.status === "failed"
        && run.stopReason?.kind === "execution_error"
        && (run.stopReason.code === "INVALID_AGENT_DECISION" || run.stopReason.code === "INVALID_TOOL_INPUT")
    ) {
        return {
            stopReason: "end_turn",
            meta: {
                ...meta,
                executionError: run.stopReason.code,
            },
        };
    }

    const reason = run.stopReason?.kind === "execution_error"
        ? run.stopReason.code
        : "RUN_NOT_TERMINAL";
    throw new Error(`GAIA Runtime failed before a supported ACP terminal state: ${reason}`);
}

/**
 * 校验候选 Profile 保持 GAIA 固定 Tool 白名单和提交协议。
 *
 * @param profile - 公共层派生或 ACP metadata 反序列化的候选。
 * @returns 深冻结且可交给 Headless Root 的候选 Profile。
 * @throws 冻结字段变化或指令删除 GAIA 必需工具协议时抛出。
 * @example
 * ```ts
 * const candidate = validateGaiaPromptEvaluationProfile(profile);
 * ```
 */
export function validateGaiaPromptEvaluationProfile(profile: unknown): AgentProfile {
    const validated = validatePromptEvaluationProfile(profile, GAIA_WORKER_PROFILE);
    const promptText = `${validated.systemPrompt}\n${validated.instructions.join("\n")}`;
    for (const toolId of GAIA_PROFILE_TOOL_IDS) {
        if (!promptText.includes(toolId)) {
            throw new TypeError(`GAIA candidate instructions must reference ${toolId}`);
        }
    }
    return validated;
}

function parseGaiaPromptEvaluationProfiles(
    record: Record<string, unknown>,
): Pick<GaiaAcpTaskMetadata, "baseProfile" | "profile"> {
    if (record.baseProfile === undefined && record.profile === undefined) return {};
    if (record.baseProfile === undefined || record.profile === undefined) {
        throw new TypeError("GAIA Prompt Evaluation metadata requires baseProfile and profile together");
    }
    const baseProfile = validatePromptEvaluationProfile(record.baseProfile, GAIA_WORKER_PROFILE);
    if (baseProfile.systemPrompt !== GAIA_WORKER_PROFILE.systemPrompt
        || !sameStrings(baseProfile.instructions, GAIA_WORKER_PROFILE.instructions)) {
        throw new TypeError("GAIA Prompt Evaluation baseProfile must match the Worker base Profile");
    }
    const profile = validateGaiaPromptEvaluationProfile(record.profile);
    return { baseProfile, profile };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
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
                    return projectGaiaAcpResult(result);
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
