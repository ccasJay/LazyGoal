import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createGoal,
    InMemoryGoalStore,
    Runner,
} from "../../runtime/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import type {
    Goal,
    GoalInput,
    GoalMessage,
} from "../../runtime/src/domain";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    TOOLS_NOT_SUPPORTED_ERROR_CODE,
    LLMResponseProtocolError,
    ToolsNotSupportedError,
    LLMStepExecutor,
} from "../src/index";
import { buildStepRequest } from "../src/prompt";

const goal: GoalInput = {
    id: "goal-1",
    objective: "完成单步执行",
    completionCriteria: ["返回结构化结果"],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个执行代理。",
    instructions: ["检查当前上下文"],
    toolIds: [],
};

function createTestGoal(
    runId = "run-1",
    runProfile: AgentProfile = profile,
    messages: readonly GoalMessage[] = [],
): Goal {
    const currentGoal = createGoal({
        id: goal.id,
        task: goal,
        profile: runProfile,
        messages,
        runId,
    });

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

test("LLMStepExecutor 只调用一次 Adapter 并返回解析后的 StepResult", async () => {
    const currentGoal = createTestGoal("run-1", profile, [
        { role: "user", content: "已恢复的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "已恢复的历史响应" },
    ]);
    const responseContent = JSON.stringify({
        kind: "continue",
        summary: "继续执行",
    });
    const adapter = new FakeAdapter(responseContent);
    const executor = new LLMStepExecutor({ adapter });

    const result = await executor.execute(currentGoal);

    assert.deepEqual(result, {
        result: {
            kind: "continue",
            summary: "继续执行",
        },
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(adapter.requests[0], buildStepRequest(currentGoal));
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, 3),
        currentGoal.state.messages.map(({ role, content }) => ({ role, content })),
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
                    kind: "legacy",
                    result: {
                        kind: "continue",
                        summary: "已有进度",
                    },
                },
            },
        },
    };
    const before = JSON.stringify(currentGoal);
    const executor = new LLMStepExecutor({
        adapter: new FakeAdapter(JSON.stringify({
            kind: "complete",
            summary: "已完成",
        })),
    });

    await executor.execute(currentGoal);

    assert.equal(JSON.stringify(currentGoal), before);
});

test("toolIds 非空时抛出稳定错误且不调用 Adapter", async () => {
    const currentGoal = createTestGoal("run-3", {
        ...profile,
        toolIds: ["web-search"],
    });
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "complete",
        summary: "不应调用",
    }));
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(currentGoal),
        (error: unknown) => {
            assert.ok(error instanceof ToolsNotSupportedError);
            assert.equal(error.code, TOOLS_NOT_SUPPORTED_ERROR_CODE);
            assert.match(error.message, /^TOOLS_NOT_SUPPORTED: /);
            assert.deepEqual(error.toolIds, ["web-search"]);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 0);
});

test("Adapter 原始异常会原样传播且不会重试", async () => {
    const currentGoal = createTestGoal("run-4");
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(currentGoal),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("协议错误不会触发修复或第二次 Adapter 调用", async () => {
    const currentGoal = createTestGoal("run-5");
    const adapter = new FakeAdapter("不是合法 JSON");
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(currentGoal),
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
    return store.save(createGoal({
        id: goal.id,
        task: goal,
        profile: runProfile,
        runId,
        messages,
    }));
}

test("Runner 通过 LLMStepExecutor 完成 continue 到 complete 的同步 Loop", async () => {
    const store = new InMemoryGoalStore();
    const continueContent = JSON.stringify({ kind: "continue", summary: "继续" });
    const completeContent = JSON.stringify({ kind: "complete", summary: "完成" });
    const adapter = new SequenceAdapter([continueContent, completeContent]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
    });

    const initialMessages: readonly GoalMessage[] = [
        { role: "user", content: "恢复后的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "恢复后的历史响应" },
    ];
    await createStoredGoal(store, "run-loop", profile, initialMessages);
    const result = await runner.run({ goalId: goal.id, runId: "run-loop" });
    const persisted = await store.restore(goal.id);

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    assert.deepEqual(result.state.lastStep, {
        kind: "legacy",
        result: { kind: "complete", summary: "完成" },
    });
    assert.deepEqual(persisted?.state.run, result.state);
    assert.equal(adapter.requests.length, 2);

    const firstContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as { readonly execution: { readonly previousStep?: unknown } };
    const secondContext = JSON.parse(
        adapter.requests[1]?.messages.at(-1)?.content ?? "",
    ) as { readonly execution: { readonly previousStep?: unknown } };
    assert.equal(firstContext.execution.previousStep, undefined);
    assert.deepEqual(secondContext.execution.previousStep, {
        kind: "legacy",
        result: { kind: "continue", summary: "继续" },
    });
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, 3),
        initialMessages.map(({ role, content }) => ({ role, content })),
    );
    assert.deepEqual(
        adapter.requests[1]?.messages.slice(1, -1),
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

test("Runner 持久化 Tool 不受支持错误并只计一次 Step", async () => {
    const store = new InMemoryGoalStore();
    const adapter = new SequenceAdapter([]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-tool", {
        ...profile,
        toolIds: ["web-search"],
    });
    const result = await runner.run({ goalId: goal.id, runId: "run-tool" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    const lastResult = result.state.lastStep !== undefined
        && "result" in result.state.lastStep
        ? result.state.lastStep.result
        : undefined;
    assert.equal(
        lastResult?.kind,
        "fail",
    );
    assert.match(
        lastResult?.kind === "fail"
            ? lastResult.error
            : "",
        /^TOOLS_NOT_SUPPORTED: /,
    );
    assert.equal(adapter.requests.length, 0);
    assert.deepEqual((await store.restore(goal.id))?.state.run, result.state);
});

test("Runner 持久化协议错误并只计一次 Step", async () => {
    const store = new InMemoryGoalStore();
    const adapter = new SequenceAdapter(["不是合法 JSON"]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-protocol");
    const result = await runner.run({ goalId: goal.id, runId: "run-protocol" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    const lastResult = result.state.lastStep !== undefined
        && "result" in result.state.lastStep
        ? result.state.lastStep.result
        : undefined;
    assert.equal(
        lastResult?.kind,
        "fail",
    );
    assert.match(
        lastResult?.kind === "fail"
            ? lastResult.error
            : "",
        /^INVALID_LLM_RESPONSE: /,
    );
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goal.id))?.state.run, result.state);
});

test("Runner 持久化 Adapter 原始错误并只计一次 Step", async () => {
    const store = new InMemoryGoalStore();
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
    });

    await createStoredGoal(store, "run-adapter");
    const result = await runner.run({ goalId: goal.id, runId: "run-adapter" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    assert.deepEqual(result.state.lastStep, {
        kind: "legacy",
        result: { kind: "fail", error: adapterError.message },
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goal.id))?.state.run, result.state);
});
