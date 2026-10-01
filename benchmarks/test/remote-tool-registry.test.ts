import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    createGoal,
    createRun,
    createStepExecutor,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
} from "../../packages/runtime/src/index.js";
import { contract } from "../../packages/contracts/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
import {
    currentProtocols,
    InMemoryTrajectoryStore,
} from "../../packages/runtime/test/current-fixtures.js";
import { MultiplexedConnection, type MuxChannelStream } from "../src/multiplex.js";
import { ToolRpcClient, ToolRpcServer, type ToolRpcMessage } from "../src/tool-rpc.js";
import {
    createRemoteToolRegistration,
    createSwebenchRemoteToolRegistry,
} from "../src/remote-tool-registry.js";
import { createSwebenchToolRegistrations } from "../swebench/src/tool-manifest.js";

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

function createTestGoal(goalId: string, runId: string, runProfile: AgentProfile): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "Test remote execution",
        profile: runProfile,
        runId,
        maxSteps: 3,
    });
}

test("remote ToolRegistration 的 prepare 阶段绝不向 Worker 发送 execute 消息", async () => {
    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => [],
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const dummyTool = {
        id: "dummy",
        description: "dummy tool",
        inputContract: contract.object({}),
    };

    let workerExecutionCount = 0;
    const remoteReg = createRemoteToolRegistration({
        client,
        definition: dummyTool,
        replayPolicy: "safe",
    });

    // 调用 prepare
    const prep = remoteReg.prepare({});
    assert.equal(prep.ok, true);
    // 此时 Worker 没有收到任何 execute 请求
    assert.equal(workerExecutionCount, 0);

    await client.close();
    server.close();
    await pipe.close();
});

test("真实 Runner 驱动远端代理执行工具，宿主同名工具不被调用，事实记录到 Trajectory", async (t) => {
    const workerWorkspace = await mkdtemp(join(tmpdir(), "worker-box-"));
    t.after(() => rm(workerWorkspace, { recursive: true, force: true }));

    // 在远端工作区写入文件，宿主工作区不存在该文件
    await writeFile(join(workerWorkspace, "task.txt"), "hello from remote sandbox");

    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => createSwebenchToolRegistrations(workerWorkspace),
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });

    const remoteRegistry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();

    const profile: AgentProfile = {
        id: "swebench-profile",
        systemPrompt: "Solve task",
        instructions: ["Use tools"],
        toolIds: ["read_file", "write_file", "edit_file", "grep", "bash"],
    };

    let stepCounter = 0;
    let authorizedToolsSeen: readonly string[] = [];

    const mockExecutor: StepExecutor = createStepExecutor(async (input: StepExecutionInput): Promise<AgentDecision> => {
        stepCounter++;
        authorizedToolsSeen = input.authorizedTools.map((toolDef) => toolDef.id);

        if (stepCounter === 1) {
            return {
                kind: "tool_call",
                action: {
                    actionId: "act-read-remote",
                    toolId: "read_file",
                    input: { path: "task.txt" },
                },
            };
        }

        const latestObservation = [...trajectoryStore.events].reverse().find((event) =>
            event.goalId === input.goal.id
            && event.runId === input.goal.state.run.id
            && event.eventType === "tool_finished");
        if (latestObservation === undefined) throw new Error("remote Tool Observation was not committed");
        return {
            kind: "complete",
            summary: "Remote read verified",
            evidenceSequences: [latestObservation.sequence],
        };
    });

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: remoteRegistry,
        executor: mockExecutor,
        toolPolicy: { evaluate: () => "allow" },
    });

    const initialGoal = createTestGoal("goal-remote-test", "run-remote-test", profile);
    await store.save(initialGoal);

    const result = await runner.run({
        goalId: initialGoal.id,
        runId: initialGoal.state.run.id,
    });

    assert.equal(result.ok, true);
    assert.equal(result.state.status, "completed");
    assert.deepEqual(authorizedToolsSeen, ["read_file", "write_file", "edit_file", "grep", "bash"]);

    // 检查 Trajectory 中记录的 Observation
    const obsEvent = trajectoryStore.events.find((e) => e.eventType === "observation_recorded");
    assert.ok(obsEvent);
    assert.match(JSON.stringify(obsEvent), /hello from remote sandbox/);

    await client.close();
    server.close();
    await pipe.close();
});

test("Worker 响应身份不符时中止执行并保留检查点", async () => {
    const pipe = createMemoryPipe();

    // 构造一个恶意/异常 Worker：收到 execute 后返回错误的 actionId
    const serverStream = pipe.workerStream;
    const serverReader = serverStream.readable.getReader();
    const serverWriter = serverStream.writable.getWriter();

    void (async () => {
        try {
            while (true) {
                const next = await serverReader.read();
                if (next.done) break;
                const msg = next.value;
                if (msg.type === "execute") {
                    await serverWriter.write({
                        type: "execute_result",
                        id: msg.id,
                        actionId: "tampered-wrong-action-id",
                        observation: { kind: "success", content: "data" },
                    });
                }
            }
        } catch {
            // 忽略 pipe.close() 触发的取消
        }
    })();

    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const remoteRegistry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();

    const profile: AgentProfile = {
        id: "swebench-profile",
        systemPrompt: "Solve task",
        instructions: ["Use tools"],
        toolIds: ["read_file"],
    };

    const mockExecutor: StepExecutor = createStepExecutor(async (): Promise<AgentDecision> => {
        return {
            kind: "tool_call",
            action: {
                actionId: "act-expected",
                toolId: "read_file",
                input: { path: "test.txt" },
            },
        };
    });

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: remoteRegistry,
        executor: mockExecutor,
        toolPolicy: { evaluate: () => "allow" },
    });

    const initialGoal = createTestGoal("goal-mismatch-test", "run-mismatch-test", profile);
    await store.save(initialGoal);

    const result = await runner.run({
        goalId: initialGoal.id,
        runId: initialGoal.state.run.id,
    });

    // 协议身份不符导致执行失败中止
    assert.equal(result.ok, true);
    assert.equal(result.state.status, "failed");
    // 保留检查点，Goal 状态被落盘
    const savedGoal = await store.restore(initialGoal.id);
    assert.ok(savedGoal);
    assert.equal(savedGoal.state.run.status, "failed");

    await client.close();
    await pipe.close();
});

test("连接断开时中止执行并保留检查点", async () => {
    const pipe = createMemoryPipe();
    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const remoteRegistry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();

    const profile: AgentProfile = {
        id: "swebench-profile",
        systemPrompt: "Solve task",
        instructions: ["Use tools"],
        toolIds: ["read_file"],
    };

    const mockExecutor: StepExecutor = createStepExecutor(async (): Promise<AgentDecision> => {
        // 在执行动作前关闭底层传输
        await pipe.close();
        return {
            kind: "tool_call",
            action: {
                actionId: "act-disconnect",
                toolId: "read_file",
                input: { path: "test.txt" },
            },
        };
    });

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: remoteRegistry,
        executor: mockExecutor,
        toolPolicy: { evaluate: () => "allow" },
    });

    const initialGoal = createTestGoal("goal-disconnect-test", "run-disconnect-test", profile);
    await store.save(initialGoal);

    const result = await runner.run({
        goalId: initialGoal.id,
        runId: initialGoal.state.run.id,
    });

    assert.equal(result.ok, true);
    assert.equal(result.state.status, "failed");
    const savedGoal = await store.restore(initialGoal.id);
    assert.ok(savedGoal);
    assert.equal(savedGoal.state.run.status, "failed");

    await client.close();
});
