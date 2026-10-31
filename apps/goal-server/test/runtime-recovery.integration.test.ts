import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import type { LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import {
    ManagedResourceRegistry,
    RuntimeLifecycleIncompleteError,
    RuntimeLifecycleUnavailableError,
    type AgentProfile,
    type GoalProgressResult,
} from "../../../packages/runtime/src/index";
import {
    AgentProfileConfigurationError,
    GoalSnapshotProtocolError,
} from "../../../packages/storage/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
    type Tool,
} from "../../../packages/tool-core/src/index";
import type { JsonValue } from "../../../packages/contracts/src/index";
import { createTestBinding, objectInputSchema } from "../../../packages/tool-core/test/binding-fixtures";
import { createRuntimeComposition } from "../src/runtime/index";
import { BashTool } from "../../../packages/tools/src/bash";
import { createTestToolRegistration } from "../../../packages/tool-core/test/helpers";

function wire(toolId: string, args: Record<string, unknown>): LLMResponse {
    return toolCallResponse({
        callId: `fixture-${toolId}`,
        toolId,
        argumentsJson: JSON.stringify(args),
    });
}

const askUserWire = (): LLMResponse => wire("ask_user", {
    questions: [{
        header: "继续方式",
        question: "Which path should be taken?",
        options: [{ label: "Path A" }, { label: "Path B" }],
        multiSelect: false,
    }],
});

const stageUpdateWire = (): LLMResponse => wire("system_start_run_stage", {
    target: "完成任务",
    acceptanceCriteria: ["事实已提交"],
});

const waitWire = (): LLMResponse => wire("system_wait_for_input", { reason: "等待用户确认" });

const discoveryWire = (query: string): LLMResponse => wire("system_find_tools", { query });

const failWire = (): LLMResponse => wire("system_fail_goal", { error: "按脚本失败" });

class ScriptedAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    calls = 0;

    constructor(private readonly script: readonly LLMResponse[]) {}

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        const response = this.script[this.calls];
        this.calls += 1;
        if (response === undefined) {
            throw new Error(`Unexpected model call #${this.calls}`);
        }
        return response;
    }
}

function readFileTool(onExecute: () => void): Tool {
    return {
        definition: {
            id: "read_file",
            description: "Read a file",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ path: { type: "string" } })),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            onExecute();
            return {
                kind: "success",
                output: { path: (input as { readonly path: string }).path, content: "recovery facts" },
                summary: "Read recovery facts",
            };
        },
    };
}

function manualTool(onExecute: () => void): Tool {
    return {
        definition: {
            id: "manual_tool",
            description: "Manual effect",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute() {
            onExecute();
            throw new TransientToolExecutionFailure("network_unavailable", 0);
        },
    };
}

const baseProfile: AgentProfile = {
    id: "profile-recovery",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Follow the scripted wire responses."],
    toolIds: ["read_file"],
};

async function setupFixture(): Promise<{
    readonly workspace: string;
    readonly home: string;
    readonly dataDirectory: string;
    readonly cleanup: () => Promise<void>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lg-runtime-recovery-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(home, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    return {
        workspace,
        home,
        dataDirectory,
        cleanup: async () => {
            await rm(root, { recursive: true, force: true });
        },
    };
}

function requireSuccess(result: GoalProgressResult): Extract<GoalProgressResult, { readonly ok: true }> {
    if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message}`);
    return result;
}

test("重建服务后，沙箱审批为真实 Bash 调用恢复绑定 Action 的执行计划", async () => {
    const fixture = await setupFixture();
    const target = join(fixture.home, "approved.txt");
    await writeFile(target, "approved read");
    // 只验证宿主审批接线与 Bash 的计划检查；OS 沙箱行为由 sandbox 测试覆盖。
    const registry = () => new InMemoryToolRegistry([createTestToolRegistration(new BashTool(fixture.workspace, { enableSeatbelt: false }))]);
    const options = {
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        profile: { ...baseProfile, toolIds: ["bash"] },
        toolPolicy: { evaluate: () => "allow" as const },
    };
    const first = await createRuntimeComposition({ ...options, toolRegistry: registry(), adapter: new ScriptedAdapter([
        stageUpdateWire(),
        discoveryWire("bash"),
        wire("bash", { command: `cat '${target}'`, timeoutMs: null,
            sandboxAccess: { files: [{ path: target, access: "read", kind: "file", purpose: "Read the approved fixture" }], network: null } }),
    ]) });
    try {
        const waiting = requireSuccess(await first.commands.launch({ goalId: "sandbox-recovery", intent: "Read the fixture", profileId: baseProfile.id }));
        assert.equal(waiting.kind, "waiting", JSON.stringify(waiting.goal.state.run.stopReason));
        const pending = waiting.goal.state.run.pendingAction;
        assert.equal(pending?.approvalKind, "sandbox");
        assert.ok(pending);
        await first.lifecycle.close();
        const second = await createRuntimeComposition({ ...options, toolRegistry: registry(), adapter: new ScriptedAdapter([waitWire()]) });
        try {
            const resumed = requireSuccess(await second.commands.resume({
                ref: { goalId: waiting.goal.id, runId: waiting.goal.state.run.id },
                action: { kind: "approve_action", actionId: pending.action.actionId },
            }));
            assert.equal(resumed.kind, "waiting");
            const trajectory = await second.readWorkspaceTrajectory({ goalId: waiting.goal.id, runId: waiting.goal.state.run.id });
            const finished = trajectory.committed.find((event) => event.eventType === "tool_finished");
            assert.ok(finished?.eventType === "tool_finished");
            assert.equal(finished.payload.observation.kind, "success");
            assert.match(JSON.stringify(finished.payload.observation), /approved read/);
        } finally { await second.lifecycle.close(); }
    } finally {
        await first.lifecycle.close();
        await fixture.cleanup();
    }
});

test("重建实例后恢复同一 Run：匹配交互身份、累计 Step、轨迹与工具调用次数", async () => {
    const fixture = await setupFixture();
    let toolCalls = 0;
    const toolRegistry = new InMemoryToolRegistry([createTestToolRegistration(readFileTool(() => {
        toolCalls += 1;
    }))]);
    const goalId = "goal-recovery-identity";
    let runCounter = 0;
    const runIdGenerator = (): string => `run-${++runCounter}`;

    const first = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter([askUserWire()]),
        profile: baseProfile,
        toolRegistry,
        toolPolicy: { evaluate: () => "require_approval" },
        runIdGenerator,
    });
    try {
        const launched = await first.commands.launch({
            goalId,
            intent: "声明阶段并执行读取",
            profileId: baseProfile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "waiting");
        assert.equal(launched.waitingFor, "ask_user");
        const runId = launched.goal.state.run.id;
        assert.equal(runId, "run-1");

        const pending = launched.goal.state.run.pendingInteraction;
        if (pending?.kind !== "ask_user") assert.fail("Expected pending ask_user");
        const question = pending.questions[0]!;
        const option = question.options[0]!;

        // 错误 requestId 与错误 Run 身份沿用既有拒绝边界。
        const wrongRequest = await first.commands.resume({
            ref: { goalId, runId },
            action: {
                kind: "answer_ask_user",
                requestId: "wrong-request",
                answers: [{ questionId: question.id, optionIds: [option.id] }],
            },
        });
        assert.equal(wrongRequest.ok, false);
        if (wrongRequest.ok) assert.fail("Expected a requestId mismatch rejection");
        assert.equal(wrongRequest.error.code, "INVALID_GOAL_INPUT");
        const wrongRun = await first.commands.resume({
            ref: { goalId, runId: "run-other" },
            action: {
                kind: "answer_ask_user",
                requestId: pending.requestId,
                answers: [{ questionId: question.id, optionIds: [option.id] }],
            },
        });
        assert.equal(wrongRun.ok, false);
        if (wrongRun.ok) assert.fail("Expected a Run mismatch rejection");
        assert.equal(wrongRun.error.code, "RUN_NOT_FOUND");
        assert.equal(toolCalls, 0);

        // 关闭实例后按同一持久化位置重建。
        await first.lifecycle.close();
        assert.equal(first.lifecycle.state, "closed");

        const secondAdapter = new ScriptedAdapter([
            stageUpdateWire(),
            discoveryWire("read_file"),
            wire("read_file", { path: "README.md" }),
            waitWire(),
        ]);
        const second = await createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: secondAdapter,
            profile: baseProfile,
            toolRegistry,
            toolPolicy: { evaluate: () => "require_approval" },
            runIdGenerator,
        });
        try {
            // 只读恢复不推进：身份、等待点与轨迹边界保持，不调用模型。
            const restored = await second.workspaceGoalStore.restore(goalId);
            assert.equal(restored?.state.run.id, runId);
            assert.equal(restored?.state.run.status, "waiting");
            const restoredPending = restored?.state.run.pendingInteraction;
            if (restoredPending?.kind !== "ask_user") assert.fail("Expected persisted ask_user");
            assert.equal(restoredPending.requestId, pending.requestId);
            assert.equal(secondAdapter.calls, 0);

            // 回答等待点后声明阶段并请求需要审批的 Tool 调用。
            const awaitingApproval = requireSuccess(await second.commands.resume({
                ref: { goalId, runId },
                action: {
                    kind: "answer_ask_user",
                    requestId: restoredPending.requestId,
                    answers: [{ questionId: question.id, optionIds: [option.id] }],
                },
            }));
            assert.equal(awaitingApproval.kind, "waiting");
            assert.equal(awaitingApproval.waitingFor, "action_approval");
            assert.equal(awaitingApproval.goal.state.run.id, runId);
            assert.equal(toolCalls, 0);
            const pendingAction = awaitingApproval.goal.state.run.pendingAction;
            assert.equal(pendingAction?.status, "awaiting_approval");
            const actionId = pendingAction?.action.actionId;
            assert.ok(actionId);

            // 错误 actionId 不被授权，工具不会执行。
            const wrongAction = await second.commands.resume({
                ref: { goalId, runId },
                action: { kind: "approve_action", actionId: "action-other" },
            });
            assert.equal(wrongAction.ok, false);
            assert.equal(toolCalls, 0);

            const executed = requireSuccess(await second.commands.resume({
                ref: { goalId, runId },
                action: { kind: "approve_action", actionId: actionId! },
            }));
            assert.equal(executed.kind, "waiting");
            assert.equal(executed.waitingFor, "blocked");
            assert.equal(executed.goal.state.run.id, runId);
            assert.equal(toolCalls, 1);
            assert.ok(executed.goal.state.run.stepCount >= 2);
            assert.equal(secondAdapter.calls, 4);

            // Trajectory 事实跨实例来自同一文件存储。
            const trajectory = await second.readWorkspaceTrajectory({ goalId, runId });
            const eventTypes = trajectory.committed.map((event) => event.eventType);
            assert.ok(eventTypes.includes("goal_created"));
            assert.ok(eventTypes.includes("action_staged"));
            assert.ok(eventTypes.includes("observation_recorded"));
            assert.ok(eventTypes.includes("run_waiting"));
            const persisted = await second.workspaceGoalStore.restore(goalId);
            assert.equal(persisted?.state.run.committedThroughSequence, executed.goal.state.run.committedThroughSequence);
        } finally {
            await second.lifecycle.close().catch(() => undefined);
        }
    } finally {
        await first.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});

test("终态后显式 continue 归档旧 Run 并创建后继 Run", async () => {
    const fixture = await setupFixture();
    const goalId = "goal-recovery-continue";
    let runCounter = 0;
    const runIdGenerator = (): string => `run-${++runCounter}`;
    const toolRegistry = new InMemoryToolRegistry([createTestToolRegistration(readFileTool(() => undefined))]);

    const first = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter([failWire()]),
        profile: baseProfile,
        toolRegistry,
        runIdGenerator,
    });
    try {
        const launched = await first.commands.launch({ goalId, intent: "失败一次", profileId: baseProfile.id });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "terminal");
        assert.equal(launched.goal.state.run.status, "failed");
        await first.lifecycle.close();

        const second = await createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: new ScriptedAdapter([waitWire()]),
            profile: baseProfile,
            toolRegistry,
            runIdGenerator,
        });
        try {
            const continued = requireSuccess(await second.commands.continue(
                { goalId, runId: "run-1" },
                "在新 Run 继续",
            ));
            assert.equal(continued.kind, "waiting");
            assert.equal(continued.goal.state.run.id, "run-2");
            assert.equal(continued.goal.state.run.status, "waiting");
            const archived = continued.goal.state.completedRuns?.find((record) => record.runId === "run-1");
            assert.equal(archived?.status, "failed");
            assert.ok((archived?.messageRange.end ?? 0) > (archived?.messageRange.start ?? 0));

            // 旧 Run 不能再被继续；恢复事实来自文件快照。
            const persisted = await second.workspaceGoalStore.restore(goalId);
            assert.equal(persisted?.state.run.id, "run-2");
            assert.equal(persisted?.state.completedRuns?.length, 1);
        } finally {
            await second.lifecycle.close().catch(() => undefined);
        }
    } finally {
        await first.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});

test("损坏 Snapshot 与缺失工具按既有边界 fail-closed", async () => {
    const fixture = await setupFixture();
    const toolRegistry = new InMemoryToolRegistry([createTestToolRegistration(readFileTool(() => undefined))]);
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter([waitWire()]),
        profile: baseProfile,
        toolRegistry,
        runIdGenerator: () => "run-1",
    });
    try {
        const corruptedGoalId = "goal-corrupted";
        await mkdir(runtime.goalsDirectory, { recursive: true });
        await writeFile(
            join(runtime.goalsDirectory, `${Buffer.from(corruptedGoalId, "utf8").toString("base64url")}.json`),
            "{ not a valid snapshot",
        );
        await assert.rejects(
            runtime.commands.advance({ goalId: corruptedGoalId, runId: "run-1" }),
            (error: unknown) => error instanceof GoalSnapshotProtocolError,
        );
    } finally {
        await runtime.lifecycle.close().catch(() => undefined);
    }

    await assert.rejects(
        createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: new ScriptedAdapter([waitWire()]),
            profile: baseProfile,
            toolRegistry: new InMemoryToolRegistry([]),
        }),
        (error: unknown) => error instanceof AgentProfileConfigurationError,
    );
    await fixture.cleanup();
});

test("结果未知的 manual Tool 在重建后不被盲重试", async () => {
    const fixture = await setupFixture();
    let manualCalls = 0;
    const manualRegistry = new InMemoryToolRegistry([
        createTestToolRegistration(manualTool(() => {
            manualCalls += 1;
        })),
    ]);
    const goalId = "goal-recovery-unknown";
    let runCounter = 0;
    const runIdGenerator = (): string => `run-${++runCounter}`;
    const profile: AgentProfile = { ...baseProfile, toolIds: ["manual_tool"] };

    const first = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter([
            askUserWire(),
            stageUpdateWire(),
            discoveryWire("manual_tool"),
            wire("manual_tool", { value: "x" }),
        ]),
        profile,
        toolRegistry: manualRegistry,
        toolPolicy: { evaluate: () => "allow" },
        runIdGenerator,
    });
    try {
        const launched = await first.commands.launch({
            goalId,
            intent: "触发未知结果",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        const runId = launched.goal.state.run.id;
        const pending = launched.goal.state.run.pendingInteraction;
        if (pending?.kind !== "ask_user") assert.fail("Expected ask_user");
        const question = pending.questions[0]!;
        const option = question.options[0]!;
        const awaitingTool = requireSuccess(await first.commands.resume({
            ref: { goalId, runId },
            action: {
                kind: "answer_ask_user",
                requestId: pending.requestId,
                answers: [{ questionId: question.id, optionIds: [option.id] }],
            },
        }));
        assert.equal(awaitingTool.kind, "waiting");
        assert.equal(awaitingTool.goal.state.run.pendingAction?.status, "outcome_unknown");
        assert.equal(manualCalls, 1);
        await first.lifecycle.close();
        assert.equal(first.lifecycle.state, "closed");

        const second = await createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: new ScriptedAdapter([waitWire()]),
            profile,
            toolRegistry: manualRegistry,
            toolPolicy: { evaluate: () => "allow" },
            runIdGenerator,
        });
        try {
            const advanced = requireSuccess(await second.commands.advance({ goalId, runId }));
            assert.equal(advanced.kind, "waiting");
            assert.equal(advanced.goal.state.run.pendingAction?.status, "outcome_unknown");
            assert.equal(manualCalls, 1);
        } finally {
            await second.lifecycle.close().catch(() => undefined);
        }
    } finally {
        await first.lifecycle.close().catch(() => undefined);
        await fixture.cleanup();
    }
});

test("关闭超时的旧实例保持 closing、拒绝新执行，不作为安全重建依据", async () => {
    const fixture = await setupFixture();
    const toolRegistry = new InMemoryToolRegistry([createTestToolRegistration(readFileTool(() => undefined))]);
    let neverSettles = true;
    try {
        const resources = new ManagedResourceRegistry();
        resources.register({
            close(): Promise<void> {
                return neverSettles ? new Promise<void>(() => undefined) : Promise.resolve();
            },
        });
        const timedOut = await createRuntimeComposition({
            cwd: fixture.workspace,
            env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
            dataDirectory: fixture.dataDirectory,
            adapter: new ScriptedAdapter([waitWire()]),
            profile: baseProfile,
            toolRegistry,
            resources,
            gracePeriodMs: 10,
            runIdGenerator: () => "run-1",
        });

        await assert.rejects(
            timedOut.lifecycle.close(),
            (error: unknown) => error instanceof RuntimeLifecycleIncompleteError,
        );
        assert.equal(timedOut.lifecycle.state, "closing");
        assert.equal(resources.pendingResources.length, 1);
        await assert.rejects(
            timedOut.commands.launch({ goalId: "goal-after-timeout", intent: "不应受理", profileId: baseProfile.id }),
            RuntimeLifecycleUnavailableError,
        );
        neverSettles = false;
    } finally {
        neverSettles = false;
        await fixture.cleanup();
    }
});
