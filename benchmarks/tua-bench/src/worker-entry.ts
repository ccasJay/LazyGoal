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
    InMemoryToolRegistry,
    type AgentProfile,
} from "../../../packages/runtime/src/index.js";
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
import { BASH_EXEC_TOOL_ID, BashExecTool } from "./bash-exec-tool.js";
import type { TuaBenchTaskDefinition } from "./types.js";

/** TUA-Bench 默认单任务最大执行步数。 */
export const TUA_BENCH_DEFAULT_MAX_STEPS = 50;

/** TUA-Bench 容器内固定的 Agent Profile。 */
export const TUA_BENCH_WORKER_PROFILE: AgentProfile = Object.freeze({
    id: "tua-bench-worker-profile",
    name: "TUA-Bench terminal agent",
    description: "Container agent profile for TUA-Bench terminal evaluation tasks.",
    systemPrompt: "You are an autonomous terminal assistant solving a TUA-Bench evaluation task. Use the bash_exec tool to inspect the environment, execute shell commands, and accomplish the task. When you are confident the task requirements are fully satisfied, mark your decision as complete.",
    instructions: Object.freeze([
        "Inspect directory contents, configuration files, and instructions.",
        "Execute terminal commands using bash_exec to perform required operations.",
        "When all objectives are accomplished, declare completion directly.",
    ]),
    toolIds: Object.freeze([BASH_EXEC_TOOL_ID]),
});

import { TuaBenchBenchmarkAdapter as TuaBenchWorkerAdapter, type TuaBenchEpisodeOutcome } from "./adapter.js";
export { TuaBenchWorkerAdapter, type TuaBenchEpisodeOutcome };

/**
 * 经 ACP wire 接收的 TUA-Bench 任务 metadata。
 *
 * @remarks
 * Prompt Evaluation 请求中的 `baseProfile` 与 `profile` 必须成对出现，且 base 必须
 * 与 Worker 内置 TUA Profile 的 Prompt 文本相同。Worker 用候选的完整 `systemPrompt`
 * 和 `instructions` 创建 Goal，同时固定 Profile 身份、展示字段和工具白名单。
 *
 * @example
 * ```ts
 * const metadata: TuaBenchAcpTaskMetadata = {
 *   ...task,
 *   goalId: "goal-1",
 *   runId: "run-1",
 *   structuredOutputMode: "strict",
 *   baseProfile: TUA_BENCH_WORKER_PROFILE,
 *   profile: {
 *     ...TUA_BENCH_WORKER_PROFILE,
 *     systemPrompt: "Solve carefully.",
 *     instructions: ["Inspect, act, and verify the task."],
 *   },
 * };
 * ```
 */
export interface TuaBenchAcpTaskMetadata extends TuaBenchTaskDefinition {
    readonly goalId: string;
    readonly runId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
    /** Prompt Evaluation 请求所依据的 Worker 基准 Profile。 */
    readonly baseProfile?: AgentProfile;
    /** 覆盖 systemPrompt 与 instructions 后冻结到 Goal 的候选 Profile。 */
    readonly profile?: AgentProfile;
}

/**
 * 校验并解析来自 ACP session metadata 的 TUA-Bench 任务数据与可选 Prompt 候选。
 *
 * @param raw - ACP session/new metadata 的未知值。
 * @returns 任务定义及经 Worker 基准约束校验的候选 Profile。
 * @throws 任务身份、输出模式、候选 Profile 配对或冻结字段无效时抛出异常。
 * @example
 * ```ts
 * const metadata = parseTuaBenchAcpTaskMetadata(sessionMeta);
 * ```
 */
export function parseTuaBenchAcpTaskMetadata(raw: unknown): TuaBenchAcpTaskMetadata {
    if (raw === null || typeof raw !== "object") {
        throw new TypeError("Invalid TUA-Bench ACP session metadata: expected object");
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.taskId !== "string" || typeof record.goalId !== "string" || typeof record.runId !== "string") {
        throw new TypeError("Invalid TUA-Bench ACP session metadata: missing taskId, goalId or runId");
    }
    const mode = record.structuredOutputMode;
    if (mode !== "strict" && mode !== "prompt_only") {
        throw new TypeError("Invalid TUA-Bench ACP session metadata: invalid structuredOutputMode");
    }
    const promptProfiles = parseTuaBenchPromptProfiles(record);

    const task: TuaBenchTaskDefinition = {
        taskId: record.taskId,
        name: typeof record.name === "string" ? record.name : record.taskId,
        instruction: typeof record.instruction === "string" ? record.instruction : "",
        taskFamily: typeof record.taskFamily === "string" ? record.taskFamily : "unknown",
        imageRef: typeof record.imageRef === "string" ? record.imageRef : `tua-bench/${record.taskId}:latest`,
        networkMode: record.networkMode === "public" ? "public" : "none",
        agentTimeoutSec: typeof record.agentTimeoutSec === "number" ? record.agentTimeoutSec : 600,
        verifierTimeoutSec: typeof record.verifierTimeoutSec === "number" ? record.verifierTimeoutSec : 600,
        verifierUser: typeof record.verifierUser === "string" ? record.verifierUser : "root",
        taskDir: typeof record.taskDir === "string" ? record.taskDir : "/home/agent",
        ...(typeof record.setupScript === "string" ? { setupScript: record.setupScript } : {}),
        ...(typeof record.verifierPath === "string" ? { verifierPath: record.verifierPath } : {}),
    };

    return {
        ...task,
        goalId: record.goalId,
        runId: record.runId,
        structuredOutputMode: mode,
        ...promptProfiles,
    };
}

/**
 * TUA-Bench 单任务 ACP 执行所需的依赖与冻结 metadata。
 *
 * @example
 * ```ts
 * const options: TuaBenchAcpRuntimeOptions = {
 *   metadata,
 *   llmAdapter,
 *   renderer,
 *   contextCompactor: new DropOldestContextCompactor(),
 * };
 * ```
 */
export interface TuaBenchAcpRuntimeOptions {
    readonly metadata: TuaBenchAcpTaskMetadata;
    readonly llmAdapter: LLMAdapter;
    readonly renderer: PromptBundleRenderer;
    readonly contextCompactor: ContextCompactor<ModelConversationMessage>;
    readonly workspaceRoot?: string;
    readonly stateRoot?: string;
    readonly signal?: AbortSignal;
}

/**
 * 在 TUA-Bench 容器内执行一次 HeadlessCompositionRoot 任务。
 *
 * @param options - 单任务 metadata、LLM、Prompt renderer、压缩器及可选运行目录。
 * @returns 任务的权威 Headless 执行结果。
 * @throws Prompt Profile、任务执行或持久化失败时抛出错误。
 * @example
 * ```ts
 * const result = await runTuaBenchAcpTask(options);
 * ```
 */
export async function runTuaBenchAcpTask(
    options: TuaBenchAcpRuntimeOptions,
): Promise<HeadlessEpisodeResult<TuaBenchEpisodeOutcome>> {
    const workspaceRoot = options.workspaceRoot ?? "/home/agent";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";

    const adapter = new TuaBenchWorkerAdapter({ workdir: workspaceRoot });
    const persistence = new JsonFileBenchmarkPersistenceAdapter<TuaBenchTaskDefinition>({
        rootDirectory: stateRoot,
        namespaceFor: (t) => t.taskId,
        enableTrace: true,
    });

    const root = new HeadlessCompositionRoot<TuaBenchTaskDefinition, TuaBenchEpisodeOutcome>({
        benchmarkId: "tua-bench",
        workspaceRoot,
        profile: options.metadata.profile ?? TUA_BENCH_WORKER_PROFILE,
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

function parseTuaBenchPromptProfiles(
    record: Record<string, unknown>,
): Pick<TuaBenchAcpTaskMetadata, "baseProfile" | "profile"> {
    if (record.baseProfile === undefined && record.profile === undefined) return {};
    if (record.baseProfile === undefined || record.profile === undefined) {
        throw new TypeError("TUA-Bench Prompt Evaluation metadata requires baseProfile and profile together");
    }
    const baseProfile = validatePromptEvaluationProfile(record.baseProfile, TUA_BENCH_WORKER_PROFILE);
    if (baseProfile.systemPrompt !== TUA_BENCH_WORKER_PROFILE.systemPrompt
        || !sameStrings(baseProfile.instructions, TUA_BENCH_WORKER_PROFILE.instructions)) {
        throw new TypeError("TUA-Bench Prompt Evaluation baseProfile must match the Worker base Profile");
    }
    const profile = validateTuaBenchPromptEvaluationProfile(record.profile);
    return { baseProfile, profile };
}

/**
 * 校验 TUA 候选只覆盖 Prompt 文本并保留 Worker 的 Profile 冻结字段。
 *
 * @param value - Prompt Evaluation ACP metadata 中的未知候选 Profile。
 * @returns 深冻结且仍使用 TUA Worker 固定身份、描述和工具白名单的候选 Profile。
 * @throws 候选 Profile 结构无效或改变任一冻结字段时抛出错误。
 * @example
 * ```ts
 * const candidate = validateTuaBenchPromptEvaluationProfile(rawProfile);
 * ```
 */
export function validateTuaBenchPromptEvaluationProfile(value: unknown): AgentProfile {
    return validatePromptEvaluationProfile(value, TUA_BENCH_WORKER_PROFILE);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** TUA-Bench Worker 内置 Prompt 模板相对路径。 */
export const TUA_BENCH_ACP_WORKER_PROMPT_ASSETS = Object.freeze([
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
] as const);

/** TUA-Bench Worker Prompt 资产 ID 映射。 */
export const TUA_BENCH_ACP_WORKER_PROMPT_ASSET_IDS = Object.freeze([
    "global-overview@1",
    "profile@1",
    "agent-decision@1",
    "authorized-tools@1",
] as const);

type EmbeddedPromptAssets = Readonly<Record<string, string>>;

export function createEmbeddedPromptRenderer(): PromptBundleRenderer {
    const assets = (globalThis as typeof globalThis & { __lazygoalPromptAssets?: EmbeddedPromptAssets }).__lazygoalPromptAssets;
    if (assets === undefined) throw new Error("Embedded Worker Prompt assets are missing");
    const templates = TUA_BENCH_ACP_WORKER_PROMPT_ASSETS.map((path, index) => {
        const source = assets[path];
        const id = TUA_BENCH_ACP_WORKER_PROMPT_ASSET_IDS[index];
        if (source === undefined || id === undefined) throw new Error(`Embedded Prompt asset is missing: ${path}`);
        return { id, source };
    });
    return createPromptBundleRenderer({ templates, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST] });
}

/**
 * TUA-Bench Worker 主入口函数。
 */
export async function runTuaBenchWorker(): Promise<void> {
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
            const metadata = parseTuaBenchAcpTaskMetadata(input.sessionMeta);
            adapter = new RpcLlmAdapter({
                stream: mux.channel("llm"),
                structuredOutputMode: metadata.structuredOutputMode,
            });

            return {
                async prompt(_content, control): Promise<AcpPromptResult> {
                    if (control.signal.aborted) return { stopReason: "cancelled" };
                    await runTuaBenchAcpTask({
                        metadata,
                        llmAdapter: adapter!,
                        renderer,
                        contextCompactor: new DropOldestContextCompactor(),
                        signal: control.signal,
                    });
                    if (control.signal.aborted) return { stopReason: "cancelled" };
                    return { stopReason: "end_turn" };
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
        agentInfo: { name: "lazygoal-tua-bench-worker", version: "1" },
    });

    try {
        await connection.closed;
    } finally {
        await adapter?.close().catch(() => undefined);
        await mux.close().catch(() => undefined);
        try { process.stdin.destroy(); } catch {}
    }
}

if (process.argv[1] !== undefined && (process.argv[1].endsWith("worker.mjs") || process.argv[1].endsWith("worker-entry.ts"))) {
    void runTuaBenchWorker()
        .then(() => {
            process.exit(0);
        })
        .catch((error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exit(1);
        });
}
