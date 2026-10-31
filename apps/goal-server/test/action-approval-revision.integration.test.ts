import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import type { JsonValue } from "../../../packages/contracts/src/index";
import { createTestBinding, objectInputSchema } from "../../../packages/tool-core/test/binding-fixtures";
import type { AgentProfile } from "../../../packages/runtime/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
    type Tool,
} from "../../../packages/tool-core/src/index";
import { createRuntimeComposition } from "../src/runtime/index";
import { createTestToolRegistration } from "../../../packages/tool-core/test/helpers";

/** 确定性模型：先请求一次写入，再完成任务。 */
class ScriptedAdapter implements LLMAdapter {
    readonly provider = "openai";
    readonly structuredOutputMode = "strict" as const;
    calls = 0;

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        this.calls += 1;
        const script: readonly { readonly toolId: string; readonly args: Record<string, unknown> }[] = [
            { toolId: "system_start_run_stage", args: { target: "写入受控文件", acceptanceCriteria: ["事实已提交"] } },
            { toolId: "system_find_tools", args: { query: "controlled_write" } },
            { toolId: "controlled_write", args: { value: "original" } },
            { toolId: "system_complete_goal", args: { summary: "done" } },
        ];
        const step = script[Math.min(this.calls - 1, script.length - 1)]!;
        return toolCallResponse({
            callId: `fixture-${step.toolId}-${this.calls}`,
            toolId: step.toolId,
            argumentsJson: JSON.stringify(step.args),
        });
    }
}

/** 受控写入 Tool：记录真实执行入参。 */
function controlledWriteTool(executed: { value: string }[]): Tool {
    return {
        definition: {
            id: "controlled_write",
            description: "Controlled write",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            executed.push({ value: (input as { readonly value: string }).value });
            return { kind: "success", output: "stored", summary: "Stored" };
        },
    };
}

const profile: AgentProfile = {
    id: "profile-host-approval",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Follow the scripted wire responses."],
    toolIds: ["controlled_write"],
};

async function setupFixture(): Promise<{
    readonly workspace: string;
    readonly home: string;
    readonly dataDirectory: string;
    readonly cleanup: () => Promise<void>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lg-host-approval-"));
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
            await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        },
    };
}

test("无界面宿主经正式预检返回修订决定，工具按最终参数执行", async () => {
    const fixture = await setupFixture();
    const executed: { value: string }[] = [];
    const toolRegistry = new InMemoryToolRegistry([
        createTestToolRegistration(controlledWriteTool(executed)),
    ]);
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter(),
        profile,
        toolRegistry,
        toolPolicy: { evaluate: () => "require_approval" },
        runIdGenerator: (() => {
            let counter = 0;
            return () => `run-${++counter}`;
        })(),
    });
    try {
        const goalId = "goal-host-revision";
        const launched = await runtime.commands.launch({
            goalId,
            intent: "写入受控文件",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "waiting");
        assert.equal(launched.waitingFor, "action_approval");

        // 宿主处理器：先预检，再返回绑定审阅引用的修订决定。
        const attached = await runtime.interactions.attach(goalId, {
            onActionApproval: async ({ request, review }) => {
                assert.equal(request.kind, "action_approval");
                assert.ok(review !== undefined);
                const result = await review!({ input: { value: "revised" } });
                assert.equal(result.ok, true);
                if (!result.ok) return { kind: "unhandled" };
                return {
                    kind: "respond",
                    response: {
                        kind: "approve_action_revision",
                        actionId: result.review.actionId,
                        input: result.review.finalInput,
                        reviewRef: result.review.reviewRef,
                    },
                };
            },
        });
        if (!attached.ok) assert.fail(`${attached.code}: ${attached.message}`);
        await unlockWaitingGoal(runtime, goalId);

        await waitFor(() => executed.length > 0, "the controlled tool to run");
        assert.deepEqual(executed, [{ value: "revised" }]);
    } finally {
        await runtime.lifecycle.close();
        await fixture.cleanup();
    }
});

test("无界面宿主缺少恢复处理器时，未知结果等待不被普通审批函数代办", async () => {
    const fixture = await setupFixture();
    const executed: { value: string }[] = [];
    const toolRegistry = new InMemoryToolRegistry([
        createTestToolRegistration(failingManualTool(executed)),
    ]);
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new ScriptedAdapter(),
        profile,
        toolRegistry,
        toolPolicy: { evaluate: () => "require_approval" },
        runIdGenerator: (() => {
            let counter = 0;
            return () => `run-${++counter}`;
        })(),
    });
    try {
        const goalId = "goal-host-recovery";
        const launched = await runtime.commands.launch({
            goalId,
            intent: "写入受控文件",
            profileId: profile.id,
        });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);

        let approvalCalls = 0;
        const attached = await runtime.interactions.attach(goalId, {
            onActionApproval: async () => {
                approvalCalls += 1;
                return { kind: "unhandled" };
            },
        });
        if (!attached.ok) assert.fail(`${attached.code}: ${attached.message}`);
        await unlockWaitingGoal(runtime, goalId);

        // 普通审批处理器不消费未知结果等待。
        await waitFor(async () => {
            const view = await runtime.interactions.read(goalId);
            return view?.kind === "action_approval" ? view : undefined;
        }, "the approval wait");
        const approved = await runtime.commands.resume({
            ref: { goalId, runId: launched.goal.state.run.id },
            action: { kind: "approve_action", actionId: launched.goal.state.run.pendingAction?.action.actionId ?? "" },
        });
        assert.equal(approved.ok, true);
        await waitFor(async () => {
            const view = await runtime.interactions.read(goalId);
            return view?.kind === "action_recovery" ? view : undefined;
        }, "the unknown outcome wait");
        assert.equal(approvalCalls, 1, "恢复等待不落入普通工具审批函数");
    } finally {
        await runtime.lifecycle.close();
        await fixture.cleanup();
    }
});

async function waitFor(
    callback: () => Promise<unknown> | unknown,
    description: string,
    timeoutMs = 15_000,
): Promise<void> {
    const startedAt = Date.now();
    let lastError: unknown;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const result = await callback();
            if (result !== undefined && result !== false) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${description}${lastError === undefined ? "" : `: ${String(lastError)}`}`);
}


/**
 * 显式解锁历史等待，使已注册的宿主处理器可以收到当前请求。
 *
 * @remarks 注册与读取本身不触发历史任务执行；解锁只投递等待，不代替用户决定。
 */
async function unlockWaitingGoal(
    runtime: Awaited<ReturnType<typeof createRuntimeComposition>>,
    goalId: string,
): Promise<void> {
    const state = await runtime.sessions.readSessionState(goalId);
    assert.ok(state !== undefined);
    // 显式恢复在仍需交互时返回 INTERACTION_REQUIRED，但它解锁了已注册处理器。
    await runtime.sessions.sendSessionInput(goalId, {
        kind: "resume",
        inputId: `unlock-${goalId}`,
        runId: state.runId,
        commitRevision: state.commitRevision,
    });
}


/** 手动重放策略的失败 Tool：外部效果未知，等待显式恢复决定。 */
function failingManualTool(executed: { value: string }[]): Tool {
    return {
        definition: {
            id: "controlled_write",
            description: "Controlled write with an unknown effect",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            executed.push({ value: (input as { readonly value: string }).value });
            throw new TransientToolExecutionFailure("network_unavailable", 0);
        },
    };
}
