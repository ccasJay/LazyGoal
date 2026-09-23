import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentDecision, LLMAdapter, StepExecutionInput, StepExecutor } from "../../packages/agent/src/index.js";
import type { ExitPort } from "../../packages/runtime/src/index.js";
import { InMemoryGoalStore } from "../../packages/storage/src/index.js";
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

const mockAdapterCalls = new Map<string, number>();
const mockAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate(request) {
        const key = request.messages.find((message) => message.role === "user")?.content ?? "default";
        const calls = (mockAdapterCalls.get(key) ?? 0) + 1;
        mockAdapterCalls.set(key, calls);
        return {
            content: JSON.stringify({
                result: {
                    kind: "complete",
                    summary: "Done",
                    evidenceSequences: [],
                    memoryPatch: null,
                },
            }),
        };
    },
};

function withDirectExecution(
    next: (input: StepExecutionInput) => Promise<AgentDecision> | AgentDecision,
): StepExecutor {
    return {
        async execute(input) {
            return next(input);
        },
    };
}

test("默认 LLMStepExecutor 装配完整模型上下文依赖并完成单步执行", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-default-executor-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);
    const spec: EnvironmentSpec<{ id: string }, null> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() { return null; },
    };

    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { id: "task-default-executor" },
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
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "completed");
});

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

test("正常完成：auto 模式直接运行普通 Run 并收集产物", async (t) => {
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

    const mockExecutor = withDirectExecution(async () => {
            return {
                kind: "complete",
                summary: "Task finished successfully",
                evidenceSequences: [],
            };
        });

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
    const mockExecutor = withDirectExecution(async (input: StepExecutionInput) => {
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
        });

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

    const mockExecutor = withDirectExecution(async () => {
            return {
                kind: "complete",
                summary: "Done",
                evidenceSequences: [],
            };
        });

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

test("auto 与 review 都直接执行普通 Run，不创建或批准任务提案", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-det-prep-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

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

    for (const mode of ["auto", "review"] as const) {
        const calls: string[] = [];
        const store = new InMemoryGoalStore();
        const mockExecutor = withDirectExecution(async (input: StepExecutionInput) => {
            calls.push("executor:step");
            assert.equal(input.goal.state.workflow.phase, "executing");
            assert.equal(input.goal.state.run.mode, "normal");
            assert.equal(input.goal.state.run.approvedTask, undefined);
            assert.match(input.goal.state.messages[0]?.content ?? "", /Fix bug/);
            assert.match(input.goal.state.messages[0]?.content ?? "", /Criteria 1/);
            return {
                kind: "complete",
                summary: "Deterministic execution finished",
                evidenceSequences: [],
            };
        });

        const goalId = `unique-goal-${mode}`;
        const result = await runTuiWithSandbox({
            benchmarkId: "swebench",
            goalId,
            runId: `unique-run-${mode}`,
            task: { id: `task-direct-${mode}` },
            descriptor: {
                intent: "Fix specific bug",
                objective: "Fix bug",
                completionCriteria: ["Criteria 1"],
                maxSteps: 10,
            },
            spec,
            outputDirectory: outputDir,
            mode,
            profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
            adapter: mockAdapter,
            stepExecutor: mockExecutor,
            store,
            container: customContainer(calls),
            render: () => ({
                waitUntilExit: async () => {},
                unmount: () => {},
            }),
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.status, "completed");
        assert.ok(calls.includes("executor:step"));
        const goal = await store.restore(goalId);
        assert.ok(goal);
        assert.equal(goal.state.run.mode, "normal");
        assert.equal(goal.state.run.approvedTask, undefined);
        assert.equal(goal.state.run.pendingInteraction, undefined);
        assert.equal(goal.state.goalPlan, undefined);
    }
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

    const mockExecutor = withDirectExecution(async () => {
            calls.push("executor:wait");
            return {
                kind: "wait",
                reason: "Which file should I edit?",
            };
        });

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

test("GAIA 错误答案：正常完成返回退出码 0，Attempt 与摘要显示 correct=false 且不覆盖宿主 Goal", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-gaia-wrong-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);
    const printedLines: string[] = [];

    const spec: EnvironmentSpec<{ taskId: string; expectedAnswer: string }, { submittedAnswer: string }> = {
        benchmarkId: "gaia",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return { submittedAnswer: "London" }; // 错误答案
        },
    };

    const mockExecutor = withDirectExecution(async () => {
            calls.push("executor:step");
            return {
                kind: "complete",
                summary: "Answer submitted",
                evidenceSequences: [],
            };
        });

    const result = await runTuiWithSandbox({
        benchmarkId: "gaia",
        task: { taskId: "gaia-q1", expectedAnswer: "Paris" },
        descriptor: {
            intent: "Capital of France",
            objective: "Answer question",
            completionCriteria: ["submit answer"],
            maxSteps: 3,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        evaluateOutcome: (art) => ({
            correct: art?.submittedAnswer === "Paris",
            score: art?.submittedAnswer === "Paris" ? 1 : 0,
            expectedAnswer: "Paris",
            submittedAnswer: art?.submittedAnswer ?? null,
        }),
        writeOut: (msg) => printedLines.push(msg),
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    // 1. GAIA correct=false 不改变执行成功退出码（仍为 0）
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "completed");
    assert.equal((result.outcome as { correct: boolean })?.correct, false);
    assert.equal((result.outcome as { score: number })?.score, 0);

    // 2. 检查 Attempt 记录真实写入磁盘
    const attemptFile = join(outputDir, "attempts", encodeURIComponent("gaia-q1"), "attempt-1.json");
    const recordJson = JSON.parse(await readFile(attemptFile, "utf8"));
    assert.equal(recordJson.benchmarkId, "gaia");
    assert.equal(recordJson.taskId, "gaia-q1");
    assert.equal(recordJson.status, "completed");
    assert.equal(recordJson.domainResult.correct, false);
    assert.equal(recordJson.domainResult.score, 0);
    assert.ok(recordJson.artifactLocator?.goalSnapshot !== undefined);

    // 3. 检查结束摘要输出真实评分，没有被 completed 掩盖
    const joinedOutput = printedLines.join("\n");
    assert.match(joinedOutput, /GAIA Evaluation: correct=false, score=0\/1/);
    assert.match(joinedOutput, /Expected: "Paris"/);
    assert.match(joinedOutput, /Submitted: "London"/);
    assert.match(joinedOutput, /Cleanup: SUCCESS/);
});

test("SWE-bench 补丁导出：Attempt 与摘要显示 gradingStatus=pending 且 resolved 为 null", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-swebench-patch-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);
    const printedLines: string[] = [];

    const patchContent = "diff --git a/fix.py b/fix.py\n+resolved bug\n";
    const spec: EnvironmentSpec<{ instance_id: string }, { patch: string }> = {
        benchmarkId: "swebench",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return { patch: patchContent };
        },
    };

    const mockExecutor = withDirectExecution(async () => {
            calls.push("executor:step");
            return {
                kind: "complete",
                summary: "Bug fixed",
                evidenceSequences: [],
            };
        });

    const result = await runTuiWithSandbox({
        benchmarkId: "swebench",
        task: { instance_id: "astropy__astropy-1234" },
        descriptor: {
            intent: "Fix astropy",
            objective: "Fix bug",
            completionCriteria: ["resolve issue"],
            maxSteps: 3,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        createAttemptDomainResult: ({ artifact }) => ({
            patch: (artifact as { patch: string })?.patch ?? null,
            gradingStatus: "pending",
            resolved: null,
        }),
        writeOut: (msg) => printedLines.push(msg),
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "completed");

    // 检查 Attempt 记录
    const attemptFile = join(outputDir, "attempts", encodeURIComponent("astropy__astropy-1234"), "attempt-1.json");
    const recordJson = JSON.parse(await readFile(attemptFile, "utf8"));
    assert.equal(recordJson.benchmarkId, "swebench");
    assert.equal(recordJson.taskId, "astropy__astropy-1234");
    assert.equal(recordJson.domainResult.gradingStatus, "pending");
    assert.equal(recordJson.domainResult.resolved, null);

    // 检查结束摘要
    const joinedOutput = printedLines.join("\n");
    assert.match(joinedOutput, /SWE-bench Patch: Exported/);
    assert.match(joinedOutput, /Grading Status: pending/);
});

test("必要产物缺失：requireArtifact 开启且未产生必要产物时返回退出码 1", async (t) => {
    const outputDir = await mkdtemp(join(tmpdir(), "runner-missing-artifact-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));

    const calls: string[] = [];
    const container = customContainer(calls);

    const spec: EnvironmentSpec<{ taskId: string }, { submittedAnswer: null }> = {
        benchmarkId: "gaia",
        resolveImage: () => ({ mode: "custom", image: "test:latest" }),
        getWorkerEntryConfig: () => ({}),
        async prepareEnvironment() {},
        async preflight() { return { ok: true }; },
        async collectArtifacts() {
            return { submittedAnswer: null }; // 未提交
        },
    };

    const mockExecutor = withDirectExecution(async () => {
            return {
                kind: "complete",
                summary: "Done without submitting",
                evidenceSequences: [],
            };
        });

    const result = await runTuiWithSandbox({
        benchmarkId: "gaia",
        task: { taskId: "gaia-no-ans" },
        descriptor: {
            intent: "Question",
            objective: "Answer",
            completionCriteria: ["submit"],
            maxSteps: 3,
        },
        spec,
        outputDirectory: outputDir,
        mode: "auto",
        requireArtifact: true,
        profile: { id: "p1", systemPrompt: "s", instructions: [], toolIds: [] },
        adapter: mockAdapter,
        stepExecutor: mockExecutor,
        container,
        render: () => ({
            waitUntilExit: async () => {},
            unmount: () => {},
        }),
    });

    // 缺少必要产物，返回退出码 1 且错误诊断保留
    assert.equal(result.exitCode, 1);
    assert.ok(result.errors.some((err) => err.includes("Required GAIA answer was not submitted")));
});
