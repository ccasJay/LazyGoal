import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MultiplexedConnection } from "../../src/multiplex.js";
import { ToolRpcClient } from "../../src/tool-rpc.js";
import { GAIA_TOOL_IDS, getGaiaToolManifest } from "../src/tool-manifest.js";
import { runGaiaToolsWorker } from "../src/tools-worker-entry.js";

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

test("GAIA tools worker describe 与 getGaiaToolManifest 一致", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "gaia-tools-test-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const workerPromise = runGaiaToolsWorker({
        input: pipe.workerInput,
        output: pipe.workerOutput,
        workspaceRoot: workspace,
        taskId: "test-task-1",
    });

    const hostMux = new MultiplexedConnection({
        input: pipe.hostInput,
        output: pipe.hostOutput,
    });
    const client = new ToolRpcClient({ stream: hostMux.channel("tools") });

    const tools = await client.describe();
    const manifest = getGaiaToolManifest();

    assert.equal(tools.length, 4);
    assert.deepEqual(
        tools.map((t) => t.id),
        [...GAIA_TOOL_IDS],
    );
    assert.deepEqual(
        tools.map((t) => ({ id: t.id, replayPolicy: t.replayPolicy })),
        manifest.map((t) => ({ id: t.id, replayPolicy: t.replayPolicy })),
    );

    await client.close();
    await hostMux.close();
    await workerPromise;
});

test("GAIA tools worker 执行 read_file, web_search, web_fetch 与 submit_answer", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "gaia-tools-exec-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const answerFilePath = join(workspace, "answer.json");
    await writeFile(join(workspace, "question.txt"), "What is 2+2?");

    const pipe = createMemoryPipe();
    let submittedAnswerFromWorker: string | undefined;

    const workerPromise = runGaiaToolsWorker({
        input: pipe.workerInput,
        output: pipe.workerOutput,
        workspaceRoot: workspace,
        taskId: "test-task-exec",
        answerFilePath,
        onSubmit: (ans) => {
            submittedAnswerFromWorker = ans;
        },
    });

    let searchCalls = 0;
    let fetchCalls = 0;

    const hostMux = new MultiplexedConnection({
        input: pipe.hostInput,
        output: pipe.hostOutput,
    });
    const client = new ToolRpcClient({
        stream: hostMux.channel("tools"),
        backendHandler: async (call) => {
            if (call.toolId === "web_search" && call.method === "web_search") {
                searchCalls++;
                return [
                    { title: "Search Result", url: "https://example.com/math", snippet: "2+2=4" },
                ];
            }
            if (call.toolId === "web_fetch" && call.method === "web_fetch") {
                fetchCalls++;
                return "Full page text about 2+2=4";
            }
            throw new Error(`Unexpected backend call: ${call.toolId}.${call.method}`);
        },
    });

    // 1. read_file
    const readRes = await client.execute({
        actionId: "act-read",
        toolId: "read_file",
        input: { path: "question.txt" },
    });
    assert.equal(readRes.kind, "success");
    assert.match((readRes as any).output, /What is 2\+2\?/);

    // 2. web_search
    const searchRes = await client.execute({
        actionId: "act-search",
        toolId: "web_search",
        input: { query: "2+2" },
    });
    assert.equal(searchRes.kind, "success");
    assert.equal(searchCalls, 1);
    assert.equal((searchRes as any).output[0]?.snippet, "2+2=4");

    // 3. web_fetch
    const fetchRes = await client.execute({
        actionId: "act-fetch",
        toolId: "web_fetch",
        input: { url: "https://example.com/math" },
    });
    assert.equal(fetchRes.kind, "success");
    assert.equal(fetchCalls, 1);
    assert.match((fetchRes as any).output, /Full page text/);

    // 4. submit_answer
    const submitRes = await client.execute({
        actionId: "act-submit",
        toolId: "submit_answer",
        input: { answer: "4" },
    });
    assert.equal(submitRes.kind, "success");
    assert.equal(submittedAnswerFromWorker, "4");

    const writtenAnswer = JSON.parse(await readFile(answerFilePath, "utf8"));
    assert.equal(writtenAnswer.answer, "4");
    assert.equal(writtenAnswer.taskId, "test-task-exec");

    // 重复提交被拒绝
    const duplicateSubmit = await client.execute({
        actionId: "act-submit-2",
        toolId: "submit_answer",
        input: { answer: "4" },
    });
    assert.equal(duplicateSubmit.kind, "failure");

    await client.close();
    await hostMux.close();
    await workerPromise;
});

test("GAIA tools worker 启动时缺少 taskId 抛出错误快速失败", async () => {
    const pipe = createMemoryPipe();
    await assert.rejects(
        runGaiaToolsWorker({
            input: pipe.workerInput,
            output: pipe.workerOutput,
            taskId: "",
        }),
        /taskId/i,
    );
});
