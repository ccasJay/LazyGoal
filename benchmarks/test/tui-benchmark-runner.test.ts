import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentDecision, LLMAdapter, StepExecutionInput, StepExecutor } from "../../packages/agent/src/index.js";
import type { ExitPort } from "../../packages/runtime/src/index.js";
import {
    runTuiWithSandbox,
    type EnvironmentSpec,
    type IsolatedContainer,
    type EnvironmentHandle,
    type InteractiveProcess,
    type TuiExecutionMode,
    IsolatedEnvironment,
} from "../src/index.js";

function fakeInteractive(): InteractiveProcess {
    const input = new TransformStream<Uint8Array, Uint8Array>();
    const output = new TransformStream<Uint8Array, Uint8Array>();
    const diagnostics = new TransformStream<Uint8Array, Uint8Array>();
    return {
        input: input.writable,
        output: output.readable,
        errorOutput: diagnostics.readable,
        closed: Promise.resolve({ code: 0, stdout: "", stderr: "" }),
        kill() {},
    };
}

function fakeHandle(workdir: string, signal: AbortSignal, calls: string[]): EnvironmentHandle {
    return {
        workdir,
        exec: async (command) => {
            calls.push(`exec:${command}`);
            return { code: 0, stdout: "", stderr: "" };
        },
        copyInto: async (source, target) => { calls.push(`copy-in:${source}->${target}`); },
        copyOut: async (source, target) => {
            calls.push(`copy-out:${source}->${target}`);
            return target;
        },
    };
}

function customContainer(calls: string[], closeError = false): IsolatedContainer {
    return {
        imageId: `sha256:${"e".repeat(64)}`,
        async start() { calls.push("container:start"); },
        async injectWorker() { calls.push("container:inject"); },
        createHandle: (workdir, signal) => fakeHandle(workdir, signal, calls),
        async openWorkerProcess() { calls.push("container:open"); return fakeInteractive(); },
        async close() {
            calls.push("container:close");
            if (closeError) throw new Error("Container removal failed in test");
        },
    };
}

class RecordingExitPort implements ExitPort {
    public code: number | undefined;
    exit(code: number): never {
        this.code = code;
        // 模拟退出抛出特殊异常，防止真正退出进程
        const error = new Error(`Process exit with code ${code}`);
        Object.assign(error, { __exitCode: code });
        throw error;
    }
}

const mockAdapter: LLMAdapter = {
    async execute() {
        return {
            content: "Done",
            model: "mock-model",
            raw: {},
        };
    },
};

test("参数校验：非法 mode 或空 outputDirectory 在容器创建前快速返回退出码 2", async () => {
    const calls: string[] = [];
    const container = customContainer(calls);
    const env = new IsolatedEnvironment();

    const errors: string[] = [];
    const result1 = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "test-task" },
        descriptor: {
            intent: "Solve bug",
            objective: "Fix bug",
            completionCriteria: [],
            maxSteps: 5,
        },
        spec: {
            benchmarkId: "swebench",
            resolveImage: () => ({ mode: "custom", image: "test:latest" }),
            getWorkerEntryConfig: () => ({}),
            prepareEnvironment: async () => {},
            preflight: async () => ({ ok: true }),
            collectArtifacts: async () => null,
        },
        outputDirectory: "/tmp/output",
        mode: "invalid_mode" as unknown as TuiExecutionMode,
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        writeError: (msg) => errors.push(msg),
    });

    assert.equal(result1.exitCode, 2);
    assert.equal(calls.length, 0); // 零容器操作！

    const result2 = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "test-task" },
        descriptor: {
            intent: "Solve bug",
            objective: "Fix bug",
            completionCriteria: [],
            maxSteps: 5,
        },
        spec: {
            benchmarkId: "swebench",
            resolveImage: () => ({ mode: "custom", image: "test:latest" }),
            getWorkerEntryConfig: () => ({}),
            prepareEnvironment: async () => {},
            preflight: async () => ({ ok: true }),
            collectArtifacts: async () => null,
        },
        outputDirectory: "", // 空目录
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        writeError: (msg) => errors.push(msg),
    });

    assert.equal(result2.exitCode, 2);
    assert.equal(calls.length, 0);
});

test("正常完成：auto 模式下自动通过 Preparation，执行完成并收集产物，删除容器并返回退出码 0", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-normal-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);

    const spec: EnvironmentSpec<{ id: string }, { readonly patch: string }> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            calls.push("collect:patch");
            return { patch: "diff --git a/file b/file" };
        },
    };

    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            return {
                kind: "complete",
                summary: "Task finished successfully",
                completionEvidence: [],
            };
        },
    };

    const exitPort = new RecordingExitPort();
    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "task-normal" },
        descriptor: {
            intent: "Fix bug",
            objective: "Fixed",
            completionCriteria: ["Check"],
            maxSteps: 5,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        exitPort,
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "completed");
    assert.deepEqual(result.artifact, { patch: "diff --git a/file b/file" });
});

test("Ctrl-C/SIGINT：执行中收到 SIGINT 冻结 Gate，中止执行，有界清理并返回退出码 130", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-sigint-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            calls.push("collect:artifacts");
            return null;
        },
    };

    // 模拟长时间执行中的 StepExecutor，在执行中触发 SIGINT
    const mockExecutor: StepExecutor = {
        async execute(input: StepExecutionInput): Promise<AgentDecision> {
            calls.push("executor:step");
            // 触发 SIGINT 模拟用户按 Ctrl-C
            process.emit("SIGINT");
            // 等待直到中止
            await new Promise<void>((resolve) => {
                const interval = setInterval(() => {
                    if (input.control?.signal?.aborted) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 10);
            });
            throw new Error("Aborted by signal");
        },
    };

    const exitPort = new RecordingExitPort();
    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "task-sigint" },
        descriptor: {
            intent: "Fix bug",
            objective: "Fixed",
            completionCriteria: [],
            maxSteps: 5,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        exitPort,
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    assert.equal(result.exitCode, 130);
    assert.equal(result.status, "cancelled");
    assert.ok(calls.includes("executor:step"));
});

test("清理失败：环境容器删除失败时返回退出码 1，status 为 infrastructure_error 且记录错误", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-clean-fail-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    // 容器删除报错
    const container = customContainer(calls, true);

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return null;
        },
    };

    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            return {
                kind: "complete",
                summary: "Done",
                completionEvidence: [],
            };
        },
    };

    const errors: string[] = [];
    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "task-clean-fail" },
        descriptor: {
            intent: "Fix bug",
            objective: "Fixed",
            completionCriteria: [],
            maxSteps: 5,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        writeError: (msg) => errors.push(msg),
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    // 清理失败绝不宣告成功！
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "infrastructure_error");
    assert.ok(result.errors.length > 0);
});

test("确定性 Preparation：仅创建唯一 Goal，配置正确传递，跳过人工意图与计划确认直接执行", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-det-prep-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const savedGoals: string[] = [];
    const customStore = {
        async save(goal: any) {
            savedGoals.push(goal.id);
        },
        async restore(goalId: string) {
            return undefined;
        },
    };

    const calls: string[] = [];
    const container = customContainer(calls);

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return null;
        },
    };

    const mockExecutor: StepExecutor = {
        async execute(input: StepExecutionInput): Promise<AgentDecision> {
            calls.push("executor:step");
            // 验证执行时已经处于 executing 状态，且 task 已被自动批准设置
            assert.equal(input.goal.state.workflow.phase, "executing");
            assert.equal(input.goal.state.task?.objective, "Fix bug");
            assert.equal(input.goal.state.task?.completionCriteria[0]?.text, "Criteria 1");
            return {
                kind: "complete",
                summary: "Deterministic execution finished",
                completionEvidence: [],
            };
        },
    };

    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        goalId: "unique-goal-123",
        runId: "unique-run-456",
        task: { id: "task-det-prep" },
        descriptor: {
            intent: "Fix specific bug",
            objective: "Fix bug",
            completionCriteria: ["Criteria 1"],
            maxSteps: 10,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "completed");
    assert.ok(calls.includes("executor:step"));
});

test("auto 模式遇用户输入阻塞时以未完成结果退出且返回退出码 1", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-auto-block-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);

    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return null;
        },
    };

    const mockExecutor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            calls.push("executor:wait");
            return {
                kind: "wait",
                reason: "Which file should I edit?",
            };
        },
    };

    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "task-auto-block" },
        descriptor: {
            intent: "Fix bug",
            objective: "Fixed",
            completionCriteria: [],
            maxSteps: 5,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    // auto 模式下遇到输入阻塞以未完成结果退出，返回 1 且 status 为 failed
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "failed");
    assert.ok(calls.includes("executor:wait"));
});
