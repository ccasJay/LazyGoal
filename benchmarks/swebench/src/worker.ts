import { Readable, Writable } from "node:stream";
import {
    createPromptBundleRenderer,
    DEFAULT_PROMPT_BUNDLE_MANIFEST,
    type PromptBundleRenderer,
    DropOldestContextCompactor,
} from "../../../packages/agent/src/index.js";
import {
    serveLazyGoalAcpAgent,
    type AcpSession,
    type AcpSessionFactory,
} from "../../../packages/acp/src/index.js";
import {
    createAcpMuxStream,
    MultiplexedConnection,
} from "./multiplex.js";
import { RpcLlmAdapter } from "./llm-rpc.js";
import {
    createSwebenchAcpSessionFactory,
    parseSwebenchAcpTaskMetadata,
} from "./worker-runtime.js";
import {
    SWE_ACP_WORKER_PROMPT_ASSET_IDS,
    SWE_ACP_WORKER_PROMPT_ASSETS,
} from "./worker-config.js";

type EmbeddedPromptAssets = Readonly<Record<string, string>>;

/**
 * Worker 的 ACP/LLM 进程入口。
 *
 * @remarks
 * stdout 只承载 Mux 字节；诊断写入 stderr。Session metadata 在 Worker 边界校验，
 * 结构化输出模式据此创建一次性的 RPC Adapter，模型凭据永远不在容器内解析。
 *
 * @example
 * ```ts
 * // WorkerBuilder 将本文件打包为 worker.mjs 后由 docker exec -i 启动。
 * await runSwebenchWorker();
 * ```
 */
export async function runSwebenchWorker(): Promise<void> {
    const mux = new MultiplexedConnection({
        input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
        output: Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    });
    let adapter: RpcLlmAdapter | undefined;
    const renderer = createEmbeddedPromptRenderer();
    const sessions: AcpSessionFactory = {
        async create(input): Promise<AcpSession> {
            if (adapter !== undefined) throw new Error("Worker supports one ACP Session per connection");
            const metadata = parseSwebenchAcpTaskMetadata(input.sessionMeta);
            adapter = new RpcLlmAdapter({
                stream: mux.channel("llm"),
                structuredOutputMode: metadata.structuredOutputMode,
            });
            const factory = createSwebenchAcpSessionFactory({
                metadata,
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
                    finally {
                        await adapter?.close();
                        adapter = undefined;
                    }
                },
            };
        },
    };
    const connection = serveLazyGoalAcpAgent({
        stream: createAcpMuxStream(mux),
        sessions,
        agentInfo: { name: "lazygoal-swebench-worker", version: "1" },
    });
    try {
        await connection.closed;
    } finally {
        await adapter?.close().catch(() => undefined);
        await mux.close();
    }
}

function createEmbeddedPromptRenderer(): PromptBundleRenderer {
    const globalAssets = (globalThis as typeof globalThis & {
        __lazygoalPromptAssets?: EmbeddedPromptAssets;
    }).__lazygoalPromptAssets;
    if (globalAssets === undefined) throw new Error("Embedded Worker Prompt assets are missing");
    const templates = SWE_ACP_WORKER_PROMPT_ASSETS.map((assetPath, index) => {
        const source = globalAssets[assetPath];
        const id = SWE_ACP_WORKER_PROMPT_ASSET_IDS[index];
        if (source === undefined || id === undefined) throw new Error(`Embedded Prompt asset is missing: ${assetPath}`);
        return { id, source };
    });
    return createPromptBundleRenderer({ templates, bundles: [DEFAULT_PROMPT_BUNDLE_MANIFEST] });
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker.mjs")) {
    void runSwebenchWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
