import { contract } from "../../packages/contracts/src/index.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ExecutionAbortedError,
} from "../../packages/execution-control/src/index.js";
import {
    createToolRegistration,
    type ToolObservation,
    type ToolRegistration,
} from "../../packages/tool-core/src/index.js";
import {
    MultiplexedConnection,
    type MuxChannelStream,
} from "../src/multiplex.js";
import {
    ToolRpcClient,
    ToolRpcServer,
    ToolRpcError,
    type ToolRpcMessage,
    type ToolManifestEntry,
} from "../src/tool-rpc.js";
import { ReadFileTool } from "../../packages/tools/src/index.js";

function createMemoryPipe(): {
    hostStream: MuxChannelStream<ToolRpcMessage>;
    workerStream: MuxChannelStream<ToolRpcMessage>;
    close(): Promise<void>;
} {
    const hostToWorker = new TransformStream<Uint8Array, Uint8Array>();
    const workerToHost = new TransformStream<Uint8Array, Uint8Array>();

    const hostMux = new MultiplexedConnection({
        input: workerToHost.readable,
        output: hostToWorker.writable,
    });
    const workerMux = new MultiplexedConnection({
        input: hostToWorker.readable,
        output: workerToHost.writable,
    });

    return {
        hostStream: hostMux.channel<ToolRpcMessage>("tools"),
        workerStream: workerMux.channel<ToolRpcMessage>("tools"),
        async close() {
            await hostMux.close();
            await workerMux.close();
        },
    };
}

test("ToolRpcClient 和 ToolRpcServer 握手 describe 返回完整清单", async () => {
    const pipe = createMemoryPipe();
    const readFileTool = new ReadFileTool("/tmp");
    const registration = createToolRegistration(readFileTool);

    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => [registration],
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const tools = await client.describe();
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.id, readFileTool.definition.id);
    assert.equal(tools[0]?.replayPolicy, "safe");
    assert.ok(tools[0]?.inputSchema !== undefined);

    await client.close();
    server.close();
    await pipe.close();
});

test("ToolRpcClient 调用 execute 获得真实 Observation 且 Worker 执行计数为 1", async () => {
    const pipe = createMemoryPipe();
    let executionCount = 0;

    const mockTool: ToolRegistration = {
        definition: {
            id: "echo_tool",
            description: "Echo tool for testing",
            isReadOnly: true, inputContract: contract.object({ text: contract.string() }),
        },
        replayPolicy: "safe",
        prepare: (input) => {
            return {
                ok: true,
                input: input,
                execute: async () => {
                    executionCount += 1;
                    return {
                        kind: "success",
                        output: `Echo: ${JSON.stringify(input)}`, summary: "Echo result",
                    };
                },
            };
        },
    };

    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => [mockTool],
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const observation = await client.execute({ context: { goalId: "test-goal", runId: "test-run" },
        actionId: "act-1",
        toolId: "echo_tool",
        input: { text: "hello" },
    });

    assert.equal(observation.kind, "success");
    assert.match((observation as any).output, /Echo: {"text":"hello"}/);
    assert.equal(executionCount, 1);

    // 重复相同 actionId 被客户端拦截快速失败，且 Worker 计数不增加
    await assert.rejects(
        client.execute({ context: { goalId: "test-goal", runId: "test-run" },
            actionId: "act-1",
            toolId: "echo_tool",
            input: { text: "hello" },
        }),
        (error: unknown) => error instanceof ToolRpcError && error.code === "duplicate_execution",
    );
    assert.equal(executionCount, 1);

    await client.close();
    server.close();
    await pipe.close();
});

test("ToolRpcClient 严格禁止并发 execute 请求", async () => {
    const pipe = createMemoryPipe();

    let resolveExecution!: () => void;
    const blockPromise = new Promise<void>((r) => { resolveExecution = r; });

    const mockTool: ToolRegistration = {
        definition: { id: "slow_tool", description: "slow", isReadOnly: true, inputContract: contract.object({}) },
        replayPolicy: "safe",
        prepare: () => ({
            ok: true,
            input: {},
            execute: async () => {
                await blockPromise;
                return { kind: "success", output: "done", summary: "done" };
            },
        }),
    };

    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => [mockTool],
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const p1 = client.execute({ context: { goalId: "test-goal", runId: "test-run" }, actionId: "a1", toolId: "slow_tool", input: {} });

    // 尝试并发发送 a2
    await assert.rejects(
        client.execute({ context: { goalId: "test-goal", runId: "test-run" }, actionId: "a2", toolId: "slow_tool", input: {} }),
        (error: unknown) => error instanceof ToolRpcError && error.code === "concurrent_execution",
    );

    resolveExecution();
    const obs1 = await p1;
    assert.equal(obs1.kind, "success");

    await client.close();
    server.close();
    await pipe.close();
});

test("execute 支持在途 cancel 并抛出 ExecutionAbortedError", async () => {
    const pipe = createMemoryPipe();
    const controller = new AbortController();

    const mockTool: ToolRegistration = {
        definition: { id: "hanging_tool", description: "hang", isReadOnly: true, inputContract: contract.object({}) },
        replayPolicy: "safe",
        prepare: () => ({
            ok: true,
            input: {},
            execute: async (_actionId, _context, control) => {
                return new Promise((_, reject) => {
                    control?.signal?.addEventListener("abort", () => {
                        reject(new ExecutionAbortedError());
                    }, { once: true });
                });
            },
        }),
    };

    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => [mockTool],
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const executePromise = client.execute({ context: { goalId: "test-goal", runId: "test-run" },
        actionId: "act-cancel",
        toolId: "hanging_tool",
        input: {},
        control: { signal: controller.signal },
    });

    // 稍后触发取消
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(executePromise, (error: unknown) => error instanceof ExecutionAbortedError);

    await client.close();
    server.close();
    await pipe.close();
});

test("execute 支持受限 backend 调用代理回宿主", async () => {
    const pipe = createMemoryPipe();

    let backendCalls = 0;
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: (backend) => [{
            definition: { id: "web_search", description: "search", isReadOnly: true, inputContract: contract.object({}) },
            replayPolicy: "safe",
            prepare: (input) => ({
                ok: true,
                input: input,
                execute: async () => {
                    const res = await backend.call("search", { q: "test" });
                    return { kind: "success", output: JSON.stringify(res), summary: "Search result" };
                },
            }),
        }],
    });

    const client = new ToolRpcClient({
        stream: pipe.hostStream,
        backendHandler: async (call) => {
            assert.equal(call.toolId, "web_search");
            assert.equal(call.method, "search");
            backendCalls += 1;
            return { hits: ["item1", "item2"] };
        },
    });

    const obs = await client.execute({ context: { goalId: "test-goal", runId: "test-run" },
        actionId: "act-backend",
        toolId: "web_search",
        input: {},
    });

    assert.equal(obs.kind, "success");
    assert.equal(backendCalls, 1);
    assert.match((obs as any).output, /item1/);

    await client.close();
    server.close();
    await pipe.close();
});
