import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { test, type TestContext } from "node:test";

import { ExecutionAbortedError } from "../../packages/execution-control/src/index.js";
import type { ToolExecutionContext } from "../../packages/tool-core/src/index.js";
import { MultiplexedConnection } from "../src/multiplex.js";
import { RpcLlmAdapter } from "../src/llm-rpc.js";
import { ToolRpcClient, ToolRpcError } from "../src/tool-rpc.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const workerEntry = fileURLToPath(new URL("./fixtures/real-process-rpc-worker.ts", import.meta.url));

interface RealWorker {
    readonly child: ChildProcessWithoutNullStreams;
    readonly mux: MultiplexedConnection;
    readonly tools: ToolRpcClient;
    readonly llm: RpcLlmAdapter;
    readonly stderr: string[];
}

function startWorker(t: TestContext): RealWorker {
    const child = spawn(process.execPath, ["--import", "tsx", workerEntry], {
        cwd: projectRoot,
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    const stderr: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk.toString("utf8")); });

    const mux = new MultiplexedConnection({
        input: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
        output: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    });
    const tools = new ToolRpcClient({ stream: mux.channel("tools") });
    const llm = new RpcLlmAdapter({ stream: mux.channel("llm") });

    t.after(async () => {
        await tools.close().catch(() => undefined);
        await llm.close().catch(() => undefined);
        child.kill("SIGKILL");
        await mux.close().catch(() => undefined);
    });

    return { child, mux, tools, llm, stderr };
}

function context(goalId = "goal-real", runId = "run-real"): ToolExecutionContext {
    return { goalId, runId };
}

test("真实子进程完成 LLM RPC 合法生成与协议拒绝", async (t) => {
    const worker = startWorker(t);

    const response = await worker.llm.generate({ messages: [{ role: "user", content: "hello" }] });
    assert.equal(response.blocks[0]?.type, "text");
    if (response.blocks[0]?.type === "text") {
        assert.equal(response.blocks[0].text, "hello from worker");
    }

    await assert.rejects(
        () => worker.llm.generate({ messages: [{ role: "user", content: "invalid" }] }),
        /Invalid LLM response/,
    );

    const recovered = await worker.llm.generate({ messages: [{ role: "user", content: "hello again" }] });
    assert.equal(recovered.blocks[0]?.type, "text");
    assert.equal(worker.stderr.join(""), "");
});

test("真实子进程 LLM RPC 取消后仍可继续服务", async (t) => {
    const worker = startWorker(t);
    const controller = new AbortController();

    const pending = worker.llm.generate(
        { messages: [{ role: "user", content: "wait for cancellation" }] },
        { signal: controller.signal },
    );
    controller.abort();
    await assert.rejects(() => pending, (error: unknown) => error instanceof ExecutionAbortedError);

    const response = await worker.llm.generate({ messages: [{ role: "user", content: "hello after cancel" }] });
    assert.equal(response.blocks[0]?.type, "text");
});

test("真实子进程工具 RPC 执行合法输入并保留 Goal/Run 身份", async (t) => {
    const worker = startWorker(t);
    const observation = await worker.tools.execute({
        actionId: "action-real-1",
        toolId: "echo",
        input: { text: "cross-process" },
        context: context(),
    });

    assert.equal(observation.kind, "success");
    if (observation.kind === "success") {
        assert.deepEqual(observation.output, { text: "cross-process" });
    }
});

test("真实子进程工具 RPC 拒绝缺失 Goal/Run 身份", async (t) => {
    const worker = startWorker(t);
    await assert.rejects(
        () => worker.tools.execute({
            actionId: "action-real-invalid-context",
            toolId: "echo",
            input: { text: "should not execute" },
            context: context("", "run-real"),
        }),
        (error: unknown) => error instanceof ToolRpcError && error.code === "invalid_message",
    );
});

test("真实子进程工具 RPC 拒绝未知工具与重复 Action", async (t) => {
    const worker = startWorker(t);

    const unknown = await worker.tools.execute({
        actionId: "action-real-unknown",
        toolId: "missing",
        input: {},
        context: context(),
    });
    assert.equal(unknown.kind, "failure");
    if (unknown.kind === "failure") assert.equal(unknown.code, "TOOL_NOT_FOUND");

    const first = await worker.tools.execute({
        actionId: "action-real-duplicate",
        toolId: "echo",
        input: { value: 1 },
        context: context(),
    });
    assert.equal(first.kind, "success");

    await assert.rejects(
        () => worker.tools.execute({
            actionId: "action-real-duplicate",
            toolId: "echo",
            input: { value: 1 },
            context: context(),
        }),
        (error: unknown) => error instanceof ToolRpcError && error.code === "duplicate_execution",
    );
});

test("真实子进程工具 RPC 取消在途执行后仍可继续服务", async (t) => {
    const worker = startWorker(t);
    const controller = new AbortController();

    const pending = worker.tools.execute({
        actionId: "action-real-cancel",
        toolId: "wait",
        input: {},
        context: context(),
        control: { signal: controller.signal },
    });
    controller.abort();
    await assert.rejects(() => pending, (error: unknown) => error instanceof ExecutionAbortedError);

    const response = await worker.tools.execute({
        actionId: "action-real-after-cancel",
        toolId: "echo",
        input: { ok: true },
        context: context(),
    });
    assert.equal(response.kind, "success");
});
