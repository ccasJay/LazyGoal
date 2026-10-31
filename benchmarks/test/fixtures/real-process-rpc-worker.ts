import { Readable, Writable } from "node:stream";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index.js";
import type { ToolRegistration } from "../../../packages/tool-core/src/index.js";
import { MultiplexedConnection } from "../../src/multiplex.js";
import { ToolRpcServer } from "../../src/tool-rpc.js";
import { createLlmRpcServer } from "../../src/llm-rpc.js";

/**
 * 真实子进程 Worker 入口：在 stdio 上承载 Mux 的 tools 与 llm 通道。
 *
 * @remarks
 * 用于验证跨进程边界而不是工具输入 Schema；因此测试工具不声明可编译的输入契约，
 * 也不响应 `describe`。`invalid` 与 `wait` 是供 LLM RPC 拒绝与取消场景使用的固定提示。
 */
const mux = new MultiplexedConnection({
    input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
    output: Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
});

const echoTool = {
    definition: {
        id: "echo",
        description: "Echo the input",
        isReadOnly: true,
        inputContract: {} as never,
    },
    replayPolicy: "safe",
    prepare(input: unknown) {
        return {
            ok: true,
            input,
            execute: async () => ({ kind: "success", output: input, summary: "echo" }),
        };
    },
} as unknown as ToolRegistration;

const waitTool = {
    definition: {
        id: "wait",
        description: "Wait until cancelled",
        isReadOnly: true,
        inputContract: {} as never,
    },
    replayPolicy: "safe",
    prepare(input: unknown) {
        return {
            ok: true,
            input,
            execute: async (_actionId: string, _context: unknown, control?: { readonly signal?: AbortSignal }) => {
                return new Promise<never>((_resolve, reject) => {
                    const signal = control?.signal;
                    if (signal === undefined) return;
                    signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
                });
            },
        };
    },
} as unknown as ToolRegistration;

const toolServer = new ToolRpcServer({
    stream: mux.channel("tools"),
    getTools: () => [echoTool, waitTool],
});

const adapter: LLMAdapter = {
    structuredOutputMode: "prompt_only",
    async generate(request: LLMRequest, control): Promise<LLMResponse> {
        const content = request.messages[0]?.content;
        const prompt = typeof content === "string" ? content : "";
        if (prompt.includes("invalid")) {
            return { blocks: [{ index: 0, type: "bogus" }] } as unknown as LLMResponse;
        }
        if (prompt.includes("wait")) {
            return new Promise<never>((_resolve, reject) => {
                const signal = control?.signal;
                if (signal === undefined) return;
                signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
            });
        }
        return {
            blocks: [{ index: 0, type: "text", format: "plain", text: "hello from worker" }],
        };
    },
};

const llmServer = createLlmRpcServer({ stream: mux.channel("llm"), adapter });

const shutdown = () => {
    toolServer.close();
    void llmServer.close().catch(() => undefined);
    void mux.close().catch(() => undefined);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.stdin.once("end", shutdown);
