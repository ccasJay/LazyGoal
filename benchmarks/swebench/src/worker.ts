import { Readable, Writable } from "node:stream";
import type { PromptBundleRenderer } from "../../../packages/prompt-renderer/src/index.js";
import { DropOldestContextCompactor } from "../../../packages/context-budget/src/index.js";
import {
    serveLazyGoalAcpAgent,
    type AcpSession,
    type AcpSessionFactory,
} from "../../../packages/acp/src/index.js";
import {
    createAcpMuxStream,
    MultiplexedConnection,
} from "../../src/multiplex.js";
import { RpcLlmAdapter } from "../../src/llm-rpc.js";
import { buildVerifiedPromptBundleRenderer } from "../../src/prompt-evaluation/template-overrides.js";
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
 * 模型调用据此创建一次性的 RPC Adapter，模型凭据永远不在容器内解析。
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
    const defaultRenderer = createEmbeddedPromptRenderer();
    const sessions: AcpSessionFactory = {
        async create(input): Promise<AcpSession> {
            if (adapter !== undefined) throw new Error("Worker supports one ACP Session per connection");
            const metadata = parseSwebenchAcpTaskMetadata(input.sessionMeta);
            const renderer = metadata.templateOverrides === undefined
                ? defaultRenderer
                : createEmbeddedPromptRenderer(metadata.templateOverrides);
            adapter = new RpcLlmAdapter({
                stream: mux.channel("llm"),
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

/**
 * 从 Worker 内嵌模板资产与可选覆盖构建经过 Golden Fixture 校验的 `PromptBundleRenderer`。
 *
 * @param templateOverrides - 可选的模板覆盖映射。
 * @returns 已编译的 `PromptBundleRenderer`。
 * @throws 内嵌模板缺失或覆盖模板未通过编译/锚点校验时抛出异常。
 * @example
 * ```ts
 * const renderer = createEmbeddedPromptRenderer({ "global-overview@1": "Global Overview:\n..." });
 * ```
 */
export function createEmbeddedPromptRenderer(
    templateOverrides?: Readonly<Record<string, string>>,
): PromptBundleRenderer {
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
    return buildVerifiedPromptBundleRenderer(templates, templateOverrides);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("worker.mjs")) {
    void runSwebenchWorker().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
