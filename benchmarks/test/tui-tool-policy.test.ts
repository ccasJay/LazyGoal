import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
} from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
import {
    currentProtocols,
    InMemoryTrajectoryStore,
} from "../../packages/runtime/test/current-fixtures.js";
import { MultiplexedConnection, type MuxChannelStream } from "../src/multiplex.js";
import { ToolRpcClient, ToolRpcServer, type ToolRpcMessage } from "../src/tool-rpc.js";
import {
    createSwebenchRemoteToolRegistry,
    createGaiaRemoteToolRegistry,
} from "../src/remote-tool-registry.js";
import {
    createSwebenchTuiToolPolicy,
    createGaiaTuiToolPolicy,
} from "../src/tui-tool-policy.js";
import { createSwebenchToolRegistrations } from "../swebench/src/tool-manifest.js";
import { createGaiaToolRegistrations } from "../gaia/src/tool-manifest.js";

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
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "Test policy execution",
        profile: runProfile,
        runId,
        maxSteps: 5,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                task: {
                    objective: "Test policy execution",
                    completionCriteria: [],
                },
            },
        },
    };
}

test("auto 模式下自动放行合法授权动作，无需审批直接发往 Worker 执行", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "policy-auto-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    let workerExecutions = 0;
    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => {
            const tools = createSwebenchToolRegistrations(workspace);
            return tools.map((tool) => ({
                ...tool,
                prepare(input, control) {
                    const prep = tool.prepare(input, control);
                    if (!prep.ok) return prep;
                    return {
                        ...prep,
                        async execute(actionId, execControl) {
                            workerExecutions++;
                            return await prep.execute(actionId, execControl);
                        },
                    };
                },
            }));
        },
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const registry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const policy = createSwebenchTuiToolPolicy("auto");

    let step = 0;
    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            step++;
            if (step === 1) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-auto-write",
                        toolId: "write_file",
                        input: { path: "auto.txt", content: "auto content" },
                    },
                };
            }
            return {
                kind: "complete",
                summary: "All done",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: registry,
        executor: mockExecutor,
        toolPolicy: policy,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler,
    });

    const goal = createTestGoal("goal-auto", "run-auto", {
        id: "swe-profile",
        systemPrompt: "Solve",
        instructions: [],
        toolIds: ["write_file"],
    });
    await store.save(goal);

    const result = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal(result.kind, "terminal");
    assert.equal(workerExecutions, 1);
    assert.equal(await readFile(join(workspace, "auto.txt"), "utf8"), "auto content");

    await client.close();
    server.close();
    await pipe.close();
});

test("review 模式下自动放行只读工具（read_file），无需审批", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "policy-review-read-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => createSwebenchToolRegistrations(workspace),
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const registry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const policy = createSwebenchTuiToolPolicy("review");

    let step = 0;
    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            step++;
            if (step === 1) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-review-read",
                        toolId: "read_file",
                        input: { path: "hello.txt" },
                    },
                };
            }
            return {
                kind: "complete",
                summary: "Finished read",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: registry,
        executor: mockExecutor,
        toolPolicy: policy,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler,
    });

    const goal = createTestGoal("goal-review-read", "run-review-read", {
        id: "swe-profile",
        systemPrompt: "Solve",
        instructions: [],
        toolIds: ["read_file"],
    });
    await store.save(goal);

    const result = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    // 只读工具自动放行，无需人工批准即可进入下一步终态
    assert.equal(result.kind, "terminal");

    await client.close();
    server.close();
    await pipe.close();
});

test("review 模式拦截非只读动作（write_file），审批前 Worker 计数为 0，批准后恰好执行一次，后续写动作仍需审批", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "policy-review-write-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    let workerExecutions = 0;
    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => {
            const tools = createSwebenchToolRegistrations(workspace);
            return tools.map((tool) => ({
                ...tool,
                prepare(input, control) {
                    const prep = tool.prepare(input, control);
                    if (!prep.ok) return prep;
                    return {
                        ...prep,
                        async execute(actionId, execControl) {
                            workerExecutions++;
                            return await prep.execute(actionId, execControl);
                        },
                    };
                },
            }));
        },
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const registry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const policy = createSwebenchTuiToolPolicy("review");

    let step = 0;
    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            step++;
            if (step === 1) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-write-1",
                        toolId: "write_file",
                        input: { path: "reviewed.txt", content: "approved content 1" },
                    },
                };
            }
            if (step === 2) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-write-2",
                        toolId: "write_file",
                        input: { path: "reviewed2.txt", content: "approved content 2" },
                    },
                };
            }
            return {
                kind: "complete",
                summary: "All finished",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: registry,
        executor: mockExecutor,
        toolPolicy: policy,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler,
    });

    const goal = createTestGoal("goal-review-write", "run-review-write", {
        id: "swe-profile",
        systemPrompt: "Solve",
        instructions: [],
        toolIds: ["write_file"],
    });
    await store.save(goal);

    // 1. 启动执行
    const firstRunResult = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    // 动作被拦截，暂停在 awaiting_approval，Worker 执行次数为 0！
    assert.equal(firstRunResult.kind, "waiting");
    assert.equal(firstRunResult.goal.state.run.pendingAction?.status, "awaiting_approval");
    assert.equal(firstRunResult.goal.state.run.pendingAction?.action.actionId, "act-write-1");
    assert.equal(workerExecutions, 0);

    // 2. 用户批准 act-write-1
    const approveResult = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: { kind: "approve_action", actionId: "act-write-1" },
    });

    // 批准后恰好执行一次，act-write-1 落地，Worker 计数变为 1！
    assert.equal(workerExecutions, 1);
    assert.equal(await readFile(join(workspace, "reviewed.txt"), "utf8"), "approved content 1");

    // 紧接着 Agent 发出了 act-write-2，再次被拦截暂停，单次授权不自动放行后续动作！
    assert.equal(approveResult.kind, "waiting");
    assert.equal(approveResult.goal.state.run.pendingAction?.status, "awaiting_approval");
    assert.equal(approveResult.goal.state.run.pendingAction?.action.actionId, "act-write-2");
    assert.equal(workerExecutions, 1);

    await client.close();
    server.close();
    await pipe.close();
});

test("review 模式下拒绝动作（reject_action），Worker 执行计数保持为 0，产生 rejected Observation", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "policy-review-reject-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    let workerExecutions = 0;
    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: () => {
            const tools = createSwebenchToolRegistrations(workspace);
            return tools.map((tool) => ({
                ...tool,
                prepare(input, control) {
                    const prep = tool.prepare(input, control);
                    if (!prep.ok) return prep;
                    return {
                        ...prep,
                        async execute(actionId, execControl) {
                            workerExecutions++;
                            return await prep.execute(actionId, execControl);
                        },
                    };
                },
            }));
        },
    });
    const client = new ToolRpcClient({ stream: pipe.hostStream });
    const registry = createSwebenchRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const policy = createSwebenchTuiToolPolicy("review");

    let step = 0;
    let receivedRejectedObservation = false;

    const mockExecutor: StepExecutor = {
        async execute(input: StepExecutionInput): Promise<AgentDecision> {
            step++;
            if (step === 1) {
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-danger-bash",
                        toolId: "bash",
                        input: { command: "rm -rf /" },
                    },
                };
            }
            if (step === 2) {
                const lastStep = input.goal.state.run.lastStep;
                if (lastStep?.kind === "action" && lastStep.observation.kind === "rejected") {
                    receivedRejectedObservation = true;
                }
                return {
                    kind: "complete",
                    summary: "Handled rejection gracefully",
                    completionEvidence: [],
                };
            }
            return {
                kind: "complete",
                summary: "Done",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: registry,
        executor: mockExecutor,
        toolPolicy: policy,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler,
    });

    const goal = createTestGoal("goal-review-reject", "run-review-reject", {
        id: "swe-profile",
        systemPrompt: "Solve",
        instructions: [],
        toolIds: ["bash"],
    });
    await store.save(goal);

    // 1. 启动，等待审批
    const startResult = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    assert.equal(startResult.kind, "waiting");
    assert.equal(workerExecutions, 0);

    // 2. 用户明确拒绝
    const rejectResult = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: {
            kind: "reject_action",
            actionId: "act-danger-bash",
            reason: "危险命令已被管理员拦截",
        },
    });

    // 拒绝未发往 Worker，Worker 执行次数恒为 0！
    assert.equal(workerExecutions, 0);
    assert.equal(receivedRejectedObservation, true);
    assert.equal(rejectResult.kind, "terminal");

    await client.close();
    server.close();
    await pipe.close();
});

test("GAIA review 模式自动放行 web_search 但拦截 submit_answer", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "policy-gaia-review-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));

    const pipe = createMemoryPipe();
    const server = new ToolRpcServer({
        stream: pipe.workerStream,
        getTools: (backendPort) =>
            createGaiaToolRegistrations({
                workspaceRoot: workspace,
                taskId: "gaia-task-review",
                answerFilePath: join(workspace, "answer.json"),
                backendPort,
            }),
    });
    const client = new ToolRpcClient({
        stream: pipe.hostStream,
        backendHandler: async (call) => {
            if (call.toolId === "web_search") {
                return [{ title: "Result", url: "https://example.com", snippet: "42" }];
            }
            throw new Error(`Unexpected call ${call.toolId}`);
        },
    });
    const registry = createGaiaRemoteToolRegistry(client);

    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const policy = createGaiaTuiToolPolicy("review");

    let step = 0;
    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            step++;
            if (step === 1) {
                // web_search 是只读工具，应该自动放行
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-gaia-search",
                        toolId: "web_search",
                        input: { query: "meaning of life" },
                    },
                };
            }
            if (step === 2) {
                // submit_answer 应该被拦截审批
                return {
                    kind: "tool_call",
                    action: {
                        actionId: "act-gaia-submit",
                        toolId: "submit_answer",
                        input: { answer: "42" },
                    },
                };
            }
            return {
                kind: "complete",
                summary: "GAIA solved",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore,
        toolRegistry: registry,
        executor: mockExecutor,
        toolPolicy: policy,
    });
    const scheduler = new InlineScheduler(runner);
    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore,
        scheduler,
    });

    const goal = createTestGoal("goal-gaia-review", "run-gaia-review", {
        id: "gaia-profile",
        systemPrompt: "Answer question",
        instructions: [],
        toolIds: ["web_search", "submit_answer"],
    });
    await store.save(goal);

    // 启动，第 1 步 web_search 自动放行，第 2 步 submit_answer 暂停审批
    const startResult = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    assert.equal(startResult.kind, "waiting");
    assert.equal(startResult.goal.state.run.pendingAction?.action.actionId, "act-gaia-submit");

    // 批准提交答案
    const approveResult = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: { kind: "approve_action", actionId: "act-gaia-submit" },
    });

    assert.equal(approveResult.kind, "terminal");
    const writtenAnswer = JSON.parse(await readFile(join(workspace, "answer.json"), "utf8"));
    assert.equal(writtenAnswer.answer, "42");

    await client.close();
    server.close();
    await pipe.close();
});
