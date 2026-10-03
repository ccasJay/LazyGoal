import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MultiplexedConnection } from "../../src/multiplex.js";
import { ToolRpcClient } from "../../src/tool-rpc.js";
import { getSwebenchToolManifest, SWEBENCH_TOOL_IDS } from "../src/tool-manifest.js";
import { runSwebenchToolsWorker } from "../src/tools-worker-entry.js";

function createMemoryPipe(): {
    hostInput: ReadableStream<Uint8Array>;
    hostOutput: WritableStream<Uint8Array>;
    workerInput: ReadableStream<Uint8Array>;
    workerOutput: WritableStream<Uint8Array>;
} {
    const hostToWorker = new TransformStream<Uint8Array, Uint8Array>();
    const workerToHost = new TransformStream<Uint8Array, Uint8Array>();

    return {
        hostInput: workerToHost.readable,
        hostOutput: hostToWorker.writable,
        workerInput: hostToWorker.readable,
        workerOutput: workerToHost.writable,
    };
}

test("SWE-bench tools worker describe 与 getSwebenchToolManifest 一致", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "swe-tools-test-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const workerPromise = runSwebenchToolsWorker({
        input: pipe.workerInput,
        output: pipe.workerOutput,
        workspaceRoot: workspace,
    });

    const hostMux = new MultiplexedConnection({
        input: pipe.hostInput,
        output: pipe.hostOutput,
    });
    const client = new ToolRpcClient({ stream: hostMux.channel("tools") });

    const tools = await client.describe();
    const manifest = getSwebenchToolManifest();

    assert.equal(tools.length, 5);
    assert.deepEqual(
        tools.map((t) => t.id),
        [...SWEBENCH_TOOL_IDS],
    );
    assert.deepEqual(
        tools.map((t) => ({ id: t.id, replayPolicy: t.replayPolicy })),
        manifest.map((t) => ({ id: t.id, replayPolicy: t.replayPolicy })),
    );

    await client.close();
    await hostMux.close();
    await workerPromise;
});

test("SWE-bench tools worker 执行 write_file, read_file, grep, edit_file 和 bash", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "swe-tools-exec-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const workerPromise = runSwebenchToolsWorker({
        input: pipe.workerInput,
        output: pipe.workerOutput,
        workspaceRoot: workspace,
    });

    const hostMux = new MultiplexedConnection({
        input: pipe.hostInput,
        output: pipe.hostOutput,
    });
    const client = new ToolRpcClient({ stream: hostMux.channel("tools") });

    // 1. write_file
    const writeRes = await client.execute({
        actionId: "act-1",
        toolId: "write_file",
        input: { path: "hello.py", content: "print('hello from worker')\n" },
    });
    assert.equal(writeRes.kind, "success");
    assert.equal(await readFile(join(workspace, "hello.py"), "utf8"), "print('hello from worker')\n");

    // 2. read_file
    const readRes = await client.execute({
        actionId: "act-2",
        toolId: "read_file",
        input: { path: "hello.py" },
    });
    assert.equal(readRes.kind, "success");
    assert.match((readRes as any).output.text, /hello from worker/);

    // 3. grep
    const grepRes = await client.execute({
        actionId: "act-3",
        toolId: "grep",
        input: { pattern: "hello" },
    });
    assert.equal(grepRes.kind, "success");
    const grepOutput = (grepRes as any).output;
    assert.equal(grepOutput.matches.length, 1);
    assert.equal(grepOutput.matches[0]?.path, "hello.py");

    // 4. edit_file
    const editRes = await client.execute({
        actionId: "act-4",
        toolId: "edit_file",
        input: {
            path: "hello.py",
            oldString: "print('hello from worker')\n",
            newString: "print('edited content')\n",
        },
    });
    assert.equal(editRes.kind, "success");
    assert.equal(await readFile(join(workspace, "hello.py"), "utf8"), "print('edited content')\n");

    // 5. bash
    const bashRes = await client.execute({
        actionId: "act-5",
        toolId: "bash",
        input: { command: "python3 hello.py" },
    });
    assert.equal(bashRes.kind, "success");
    assert.match((bashRes as any).output.stdout, /edited content/);

    await client.close();
    await hostMux.close();
    await workerPromise;
});

test("SWE-bench tools worker 支持在途 cancel 终止慢任务", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "swe-tools-cancel-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const workerPromise = runSwebenchToolsWorker({
        input: pipe.workerInput,
        output: pipe.workerOutput,
        workspaceRoot: workspace,
    });

    const hostMux = new MultiplexedConnection({
        input: pipe.hostInput,
        output: pipe.hostOutput,
    });
    const client = new ToolRpcClient({ stream: hostMux.channel("tools") });

    const controller = new AbortController();
    const executePromise = client.execute({
        actionId: "act-sleep",
        toolId: "bash",
        input: { command: "sleep 10" },
        control: { signal: controller.signal },
    });

    setTimeout(() => controller.abort(), 50);

    await assert.rejects(executePromise, /aborted|cancel/i);

    await client.close();
    await hostMux.close();
    await workerPromise;
});
