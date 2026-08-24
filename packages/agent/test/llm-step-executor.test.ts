import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createGoal,
    Runner,
} from "../../runtime/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import type {
    Goal,
    GoalMessage,
    GoalTask,
} from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
    LLMStepExecutor,
} from "../src/index";
import { buildStepRequest } from "../src/prompt";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const goalId = "goal-1";
const task: GoalTask = {
    objective: "完成单步执行",
    completionCriteria: ["返回结构化结果"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个执行代理。",
    instructions: ["检查当前上下文"],
    toolIds: [],
};

function createExecutingGoal(
    runId: string,
    runProfile: AgentProfile,
    messages: readonly GoalMessage[],
): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: goalId,
        intent: task.objective,
        profile: runProfile,
        runId,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            messages: [...messages],
        },
    };
}

function createTestGoal(
    runId = "run-1",
    runProfile: AgentProfile = profile,
    messages: readonly GoalMessage[] = [],
): Goal {
    const currentGoal = createExecutingGoal(runId, runProfile, messages);

    return {
        ...currentGoal,
        state: {
            ...currentGoal.state,
            run: { ...currentGoal.state.run, status: "running" },
        },
    };
}

class FakeAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(private readonly content: string) {}

    async generate(request: LLMRequest): Promise<{ content: string }> {
        this.requests.push(request);
        return { content: this.content };
    }
}

class RejectingAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(private readonly failure: unknown) {}

    async generate(request: LLMRequest): Promise<never> {
        this.requests.push(request);
        throw this.failure;
    }
}

class SequenceAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(private readonly contents: readonly string[]) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        const content = this.contents[this.requests.length - 1];

        if (content === undefined) {
            throw new Error("fake adapter responses exhausted");
        }

        return { content };
    }
}

test("LLMStepExecutor 只调用一次 Adapter 并返回解析后的 AgentDecision", async () => {
    const currentGoal = createTestGoal("run-1", profile, [
        { role: "user", content: "已恢复的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "已恢复的历史响应" },
    ]);
    const responseContent = JSON.stringify({
        kind: "complete",
        checkpoint: "已完成上下文检查",
        summary: "继续执行",
    });
    const adapter = new FakeAdapter(responseContent);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });

    const result = await executor.execute(currentGoal, []);

    assert.deepEqual(result, {
        kind: "complete",
        checkpoint: "已完成上下文检查",
        summary: "继续执行",
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(
        adapter.requests[0],
        await buildStepRequest(
            currentGoal,
            [],
            renderer,
            contextCompactor,
        ),
    );
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, -1),
        currentGoal.state.messages.map(({ role, content }) => ({ role, content })),
    );
    assert.equal(adapter.requests[0]?.messages[0]?.role, "system");
    assert.equal(adapter.requests[0]?.messages.at(-1)?.role, "user");
    const systemContent = adapter.requests[0]?.messages[0]?.content ?? "";
    assert.match(systemContent, /Global Overview:/);
    assert.match(systemContent, /Profile System Prompt:\n你是一个执行代理。/);
    assert.match(systemContent, /Profile Instructions:\n1\. 检查当前上下文/);
    assert.match(systemContent, /Active Phase Protocol:/);
    assert.match(systemContent, /AgentDecision 协议/);
    assert.match(
        systemContent,
        /Authorized Tool definitions \(only these Tool IDs may be requested\):\n\[\]/,
    );
    assert.deepEqual(
        JSON.parse(adapter.requests[0]?.messages.at(-1)?.content ?? ""),
        {
            phase: "executing",
            intent: task.objective,
            task,
            execution: { stepCount: 0 },
        },
    );
});

test("LLMStepExecutor 不修改传入的 Goal", async () => {
    const baseGoal = createTestGoal("run-2", profile, [
        { role: "user", content: "已有消息" },
    ]);
    const currentGoal: Goal = {
        ...baseGoal,
        state: {
            ...baseGoal.state,
            run: {
                ...baseGoal.state.run,
                status: "running",
                stepCount: 3,
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        checkpoint: "已有进度检查点",
                        reason: "已有进度",
                    },
                },
            },
        },
    };
    const before = JSON.stringify(currentGoal);
    const executor = new LLMStepExecutor({
        adapter: new FakeAdapter(JSON.stringify({
            kind: "complete",
            checkpoint: "已检查当前状态",
            summary: "已完成",
        })),
        renderer,
        contextCompactor,
    });

    await executor.execute(currentGoal, []);

    assert.equal(JSON.stringify(currentGoal), before);
});

test("LLMStepExecutor 在未知 Prompt Bundle 版本时不调用 Adapter", async () => {
    const goal = createTestGoal("run-unknown-prompt");
    const unsupportedGoal = {
        ...goal,
        definition: {
            ...goal.definition,
            promptBundleVersion: 99,
        },
    } as unknown as Goal;
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "complete",
        checkpoint: "不应生成",
        summary: "不应生成",
    }));
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(unsupportedGoal, []),
        /不支持的 Prompt Bundle 版本 99/,
    );
    assert.equal(adapter.requests.length, 0);
});

test("LLMStepExecutor 使用传入的授权 ToolDefinition 生成 Tool Action", async () => {
    const currentGoal = createTestGoal("run-3", {
        ...profile,
        toolIds: ["web-search"],
    });
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "tool_call",
        checkpoint: "已确定要读取任务文件",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    }));
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });
    const readFileTool: ToolDefinition = {
        id: "read_file",
        description: "读取工作区文件",
        inputSchema: { type: "object" },
    };

    assert.deepEqual(
        await executor.execute(currentGoal, [readFileTool]),
        {
            kind: "tool_call",
            checkpoint: "已确定要读取任务文件",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
    );
    assert.equal(adapter.requests.length, 1);
    assert.match(adapter.requests[0]?.messages[0]?.content ?? "", /read_file/);
});

test("Adapter 原始异常会原样传播且不会重试", async () => {
    const currentGoal = createTestGoal("run-4");
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(currentGoal, []),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("协议错误不会触发修复或第二次 Adapter 调用", async () => {
    const currentGoal = createTestGoal("run-5");
    const adapter = new FakeAdapter("不是合法 JSON");
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(currentGoal, []),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 1);
});

function createStoredGoal(
    store: InMemoryGoalStore,
    runId: string,
    runProfile: AgentProfile = profile,
    messages: readonly GoalMessage[] = [],
): Promise<void> {
    return store.save(createExecutingGoal(runId, runProfile, messages));
}

test("Runner 通过 LLMStepExecutor 兼容持久化终止 AgentDecision", async () => {
    const store = new InMemoryGoalStore();
    const completeContent = JSON.stringify({
        kind: "complete",
        checkpoint: "已完成目标",
        summary: "完成",
    });
    const adapter = new SequenceAdapter([completeContent]);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });
    const runner = new Runner({
        store,
        executor,
    });

    const initialMessages: readonly GoalMessage[] = [
        { role: "user", content: "恢复后的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "恢复后的历史响应" },
    ];
    await createStoredGoal(store, "run-loop", profile, initialMessages);
    const result = await runner.run({ goalId: goalId, runId: "run-loop" });
    const persisted = await store.restore(goalId);

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 1);
    assert.deepEqual(result.state.lastStep, {
        kind: "decision",
        result: {
            kind: "complete",
            checkpoint: "已完成目标",
            summary: "完成",
        },
    });
    assert.deepEqual(persisted?.state.run, result.state);
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, -1),
        initialMessages.map(({ role, content }) => ({ role, content })),
    );
    assert.deepEqual(persisted?.state.messages, [
        ...initialMessages,
        {
            role: "assistant",
            assistant: { profileId: "profile-1" },
            content: "完成",
        },
    ]);
});

test("Runner 对未注册 Tool 保存稳定执行错误且不消费 Step", async () => {
    const store = new InMemoryGoalStore();
    const adapter = new SequenceAdapter([JSON.stringify({
        kind: "tool_call",
        checkpoint: "已确定需要读取文件",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    })]);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-tool", {
        ...profile,
        toolIds: ["read_file"],
    });
    const result = await runner.run({ goalId: goalId, runId: "run-tool" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.deepEqual(result.state.stopReason, {
        kind: "execution_error",
        code: "TOOL_NOT_FOUND",
        message: 'Authorized Tool "read_file" is not registered',
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
});

test("Runner 将 AgentDecision 协议错误保存为稳定执行错误", async () => {
    const store = new InMemoryGoalStore();
    const adapter = new SequenceAdapter(["不是合法 JSON"]);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-protocol");
    const result = await runner.run({ goalId: goalId, runId: "run-protocol" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.code
            : undefined,
        "INVALID_AGENT_DECISION",
    );
    assert.match(
        result.state.stopReason?.kind === "execution_error"
            ? result.state.stopReason.message
            : "",
        /^INVALID_LLM_RESPONSE: /,
    );
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
});

test("Runner 将 Adapter 原始错误规范化为 fail Decision 并只计一次 Step", async () => {
    const store = new InMemoryGoalStore();
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-adapter");
    const result = await runner.run({ goalId: goalId, runId: "run-adapter" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    assert.deepEqual(result.state.lastStep, {
        kind: "decision",
        result: {
            kind: "fail",
            checkpoint: "Executor failed before returning an AgentDecision.",
            error: adapterError.message,
        },
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
    assert.deepEqual((await store.restore(goalId))?.state.messages.at(-1), {
        role: "assistant",
        assistant: { profileId: profile.id },
        content: adapterError.message,
    });
});
