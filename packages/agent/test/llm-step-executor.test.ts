import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createRun,
    Runner,
} from "../../runtime/src/index";
import { InMemoryRunStore } from "../../runtime/src/run-store";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import type { GoalDefinition, RunState } from "../../runtime/src/domain";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    TOOLS_NOT_SUPPORTED_ERROR_CODE,
    LLMResponseProtocolError,
    ToolsNotSupportedError,
    LLMStepExecutor,
} from "../src/index";
import { buildStepRequest } from "../src/prompt";

const goal: GoalDefinition = {
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
    const state = createRun(goal, "run-1", profile);
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "continue",
        summary: "继续执行",
    }));
    const executor = new LLMStepExecutor({ adapter });

    const result = await executor.execute(state);

    assert.deepEqual(result, {
        kind: "continue",
        summary: "继续执行",
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(adapter.requests[0], buildStepRequest(state));
});

test("LLMStepExecutor 不修改传入的 RunState", async () => {
    const state: RunState = {
        ...createRun(goal, "run-2", profile),
        status: "running",
        stepCount: 3,
        lastResult: {
            kind: "continue",
            summary: "已有进度",
        },
    };
    const before = JSON.stringify(state);
    const executor = new LLMStepExecutor({
        adapter: new FakeAdapter(JSON.stringify({
            kind: "complete",
            summary: "已完成",
        })),
    });

    await executor.execute(state);

    assert.equal(JSON.stringify(state), before);
});

test("toolIds 非空时抛出稳定错误且不调用 Adapter", async () => {
    const state: RunState = {
        ...createRun(goal, "run-3", {
            ...profile,
            toolIds: ["web-search"],
        }),
        status: "running",
    };
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "complete",
        summary: "不应调用",
    }));
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(state),
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
    const state = createRun(goal, "run-4", profile);
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(state),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("协议错误不会触发修复或第二次 Adapter 调用", async () => {
    const state = createRun(goal, "run-5", profile);
    const adapter = new FakeAdapter("不是合法 JSON");
    const executor = new LLMStepExecutor({ adapter });

    await assert.rejects(
        executor.execute(state),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 1);
});

function createStoredRun(
    store: InMemoryRunStore,
    runId: string,
    runProfile: AgentProfile = profile,
): Promise<void> {
    return store.save(createRun(goal, runId, runProfile));
}

test("Runner 通过 LLMStepExecutor 完成 continue 到 complete 的同步 Loop", async () => {
    const store = new InMemoryRunStore();
    const adapter = new SequenceAdapter([
        JSON.stringify({ kind: "continue", summary: "继续" }),
        JSON.stringify({ kind: "complete", summary: "完成" }),
    ]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
        maxSteps: 4,
    });

    await createStoredRun(store, "run-loop");
    const result = await runner.run("run-loop");
    const persisted = await store.load("run-loop");

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "completed");
    assert.equal(result.state.stepCount, 2);
    assert.deepEqual(result.state.lastResult, {
        kind: "complete",
        summary: "完成",
    });
    assert.deepEqual(persisted, result.state);
    assert.equal(adapter.requests.length, 2);
});

test("Runner 持久化 Tool 不受支持错误并只计一次 Step", async () => {
    const store = new InMemoryRunStore();
    const adapter = new SequenceAdapter([]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
        maxSteps: 4,
    });

    await createStoredRun(store, "run-tool", {
        ...profile,
        toolIds: ["web-search"],
    });
    const result = await runner.run("run-tool");

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastResult?.kind, "fail");
    assert.match(result.state.lastResult?.error ?? "", /^TOOLS_NOT_SUPPORTED: /);
    assert.equal(adapter.requests.length, 0);
    assert.deepEqual(await store.load("run-tool"), result.state);
});

test("Runner 持久化协议错误并只计一次 Step", async () => {
    const store = new InMemoryRunStore();
    const adapter = new SequenceAdapter(["不是合法 JSON"]);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
        maxSteps: 4,
    });

    await createStoredRun(store, "run-protocol");
    const result = await runner.run("run-protocol");

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    assert.equal(result.state.lastResult?.kind, "fail");
    assert.match(result.state.lastResult?.error ?? "", /^INVALID_LLM_RESPONSE: /);
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(await store.load("run-protocol"), result.state);
});

test("Runner 持久化 Adapter 原始错误并只计一次 Step", async () => {
    const store = new InMemoryRunStore();
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
        maxSteps: 4,
    });

    await createStoredRun(store, "run-adapter");
    const result = await runner.run("run-adapter");

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 1);
    assert.deepEqual(result.state.lastResult, {
        kind: "fail",
        error: adapterError.message,
    });
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(await store.load("run-adapter"), result.state);
});
