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

/** 经 ACP wire 接收的 TUA-Bench 任务 metadata。 */
export interface TuaBenchAcpTaskMetadata extends TuaBenchTaskDefinition {
    readonly goalId: string;
    readonly runId: string;
    readonly structuredOutputMode: LLMAdapter["structuredOutputMode"];
}

/**
 * 校验并解析来自 ACP session metadata 的 TUA-Bench 任务数据。
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
    };
}

/** TUA-Bench ACP 运行配置。 */
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
 */
export async function runTuaBenchAcpTask(
    options: TuaBenchAcpRuntimeOptions,
): Promise<HeadlessEpisodeResult<TuaBenchEpisodeOutcome>> {
    const workspaceRoot = options.workspaceRoot ?? "/home/agent";
    const stateRoot = options.stateRoot ?? "/opt/lazygoal/state";

    const adapter = new TuaBenchWorkerAdapter(workspaceRoot);
    const persistence = new JsonFileBenchmarkPersistenceAdapter<TuaBenchTaskDefinition>({
        rootDirectory: stateRoot,
        namespaceFor: (t) => t.taskId,
        enableTrace: true,
    });

    const root = new HeadlessCompositionRoot<TuaBenchTaskDefinition, TuaBenchEpisodeOutcome>({
        benchmarkId: "tua-bench",
        workspaceRoot,
        profile: TUA_BENCH_WORKER_PROFILE,
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
        await mux.close();
    }
}

if (process.argv[1] !== undefined && (process.argv[1].endsWith("worker.mjs") || process.argv[1].endsWith("worker-entry.ts"))) {
    void runTuaBenchWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
