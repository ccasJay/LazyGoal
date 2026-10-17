import { toolResponseFixture } from "./tool-response-fixture";
import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm/src/core/types";
import {
    createGoal,
    ModelStageFeedbackError,
    Runner,
} from "../../runtime/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type ToolDefinition,
} from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import type {
    Goal,
    GoalMessage,
    GoalTask,
} from "../../runtime/src/domain";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
    createModelExecutionBinding,
    MutableModelBinding,
} from "../src/index";
import { buildStepRequest } from "../src/prompt";
import {
    createCurrentContextAssembler,
    createInMemoryTrajectoryStore,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";

const EMPTY_INPUT_CONTRACT = contract.object({});

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const goalId = "goal-1";
const task: GoalTask = {
    objective: "完成单步执行",
    completionCriteria: [{ text: "返回结构化结果" }],
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
    runTask: GoalTask = task,
): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: goalId,
        intent: task.objective,
        ...currentProtocols,
        profile: runProfile,
        runId,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...created.state.run,
                mode: "plan",
                approvedTask: runTask,
                exposedToolIds: [...runProfile.toolIds],
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
    readonly structuredOutputMode: "strict" | "prompt_only";

    constructor(
        private readonly content: string,
        structuredOutputMode: "strict" | "prompt_only" = "strict",
    ) {
        this.structuredOutputMode = structuredOutputMode;
    }

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return { ...toolResponseFixture(this.content), content: "Accompanying response text." };
    }
}

class RejectingAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    readonly structuredOutputMode = "strict" as const;

    constructor(private readonly failure: unknown) {}

    async generate(request: LLMRequest): Promise<never> {
        this.requests.push(request);
        throw this.failure;
    }
}

class SequenceAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    readonly structuredOutputMode = "strict" as const;

    constructor(private readonly contents: readonly string[]) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        const content = this.contents[this.requests.length - 1];

        if (content === undefined) {
            throw new Error("fake adapter responses exhausted");
        }

        return toolResponseFixture(content);
    }
}

class StreamingAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    generateCalls = 0;

    async generate(): Promise<LLMResponse> {
        this.generateCalls += 1;
        throw new Error("stream adapter should not call generate");
    }

    async *stream(): AsyncIterable<LLMStreamEvent> {
        yield { kind: "started" };
        yield { kind: "reasoning_delta", text: "Checking context..." };
        yield { kind: "assistant_text_delta", text: "{\"result\":" };
        yield {
            kind: "completed",
            response: toolResponseFixture(JSON.stringify({
                    result: {
                        kind: "complete",
                        summary: "streamed",
                        completionEvidence: [],
                        memoryPatch: null,
                        contextNotes: null,
                    },
                })),
        };
    }
}

function createExecutor(adapter: LLMAdapter): LLMStepExecutor {
    return new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

test("LLMStepExecutor 只调用一次 Adapter 并返回解析后的 AgentDecision", async () => {
    const currentGoal = createTestGoal("run-1", profile, [
        { role: "user", content: "已恢复的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "已恢复的历史响应" },
    ]);
    const responseContent = JSON.stringify({
        result: {
            kind: "complete",
            summary: "继续执行",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    });
    const adapter = new FakeAdapter(responseContent);
    const executor = createExecutor(adapter);

    const result = await executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.deepEqual(result, {
        kind: "complete",
        summary: "继续执行",
        completionEvidence: [],
    });
    assert.equal(adapter.requests.length, 1);
    const expectedPlan = await buildStepRequest(
        currentGoal,
        [],
        renderer,
        contextCompactor,
        undefined,
        currentWorkingMemory,
        createCurrentContextAssembler(),
    );
    assert.deepEqual(adapter.requests[0], { ...expectedPlan.request, sessionId: currentGoal.id });
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, 3),
        currentGoal.state.messages.map(({ role, content }) => ({ role, content })),
    );
    assert.equal(adapter.requests[0]?.messages[0]?.role, "system");
    assert.equal(adapter.requests[0]?.messages.at(-1)?.role, "user");
    const systemContent = adapter.requests[0]?.messages[0]?.content ?? "";
    assert.match(systemContent, /Global Overview:/);
    assert.match(systemContent, /Profile System Prompt:\n你是一个执行代理。/);
    assert.match(systemContent, /Profile Instructions:\n1\. 检查当前上下文/);
    assert.match(systemContent, /call exactly one declared Tool/);
    const dynamicContent = adapter.requests[0]?.messages.slice(3, -1).map(({ content }) => content).join("\n") ?? "";
    assert.match(
        dynamicContent,
        /Authorized business Tool definitions \(only these business Tool IDs may be requested; system tools are declared separately for this request\):\n\[\]/,
    );
    assert.match(dynamicContent, /Approved Goal Task Contract:/);
    assert.match(dynamicContent, /Objective: 完成单步执行/);
    const workingContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as Record<string, unknown>;
    assert.deepEqual(workingContext.phase, "executing");
    assert.equal("intent" in workingContext, false);
    assert.equal("task" in workingContext, false);
    assert.equal("contextEpoch" in workingContext, false);
    assert.deepEqual(workingContext.execution, { stepCount: 0 });
    assert.equal("workingMemory" in workingContext, false);
    assert.match(dynamicContent, /Current structured@1 Working Memory:/);
    assert.match(dynamicContent, /"derivedThroughSequence": 0/);
    assert.equal(typeof workingContext.trajectoryContext, "object");
});

test("LLMStepExecutor 归一化 Provider 流并按可见性发布模型事件", async () => {
    const currentGoal = createTestGoal("run-stream", profile);
    const adapter = new StreamingAdapter();
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(
        { goalId: currentGoal.id, runId: currentGoal.state.run.id },
        { minimumVisibility: "restricted", includeReasoning: true },
    );
    const events: string[] = [];
    subscription.onEvent((event) => events.push(`${event.kind}:${event.visibility}`));
    const executor = createExecutor(adapter);

    const result = await executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
        executionUnitId: "execution-unit-stream",
        executionStream: publisher,
    });

    assert.equal(result.kind, "complete");
    assert.equal(adapter.generateCalls, 0);
    assert.ok(events.includes("model_started:public"));
    assert.ok(events.includes("reasoning_delta:restricted"));
    assert.ok(events.includes("assistant_text_delta:public"));
    assert.ok(events.includes("model_completed:public"));
});

test("LLMStepExecutor 对不支持流式的 Adapter 保留 generate 回退并发布一次性事件", async () => {
    const currentGoal = createTestGoal("run-fallback", profile);
    const responseContent = JSON.stringify({
        result: {
            kind: "complete",
            summary: "fallback",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    });
    const adapter = new FakeAdapter(responseContent);
    const publisher = new InMemoryExecutionStreamPublisher();
    const subscription = publisher.subscribe(
        { goalId: currentGoal.id, runId: currentGoal.state.run.id },
    );
    const events: string[] = [];
    subscription.onEvent((event) => events.push(event.kind));

    const result = await createExecutor(adapter).execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
        executionUnitId: "execution-unit-fallback",
        executionStream: publisher,
    });

    assert.equal(result.kind, "complete");
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual(events, ["model_started", "assistant_text_delta", "model_completed"]);
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
                        reason: "已有进度",
                    },
                },
            },
        },
    };
    const before = JSON.stringify(currentGoal);
    const executor = createExecutor(new FakeAdapter(JSON.stringify({
        result: {
            kind: "complete",
            summary: "已完成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    })));

    await executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

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
        result: {
            kind: "complete",
            summary: "不应生成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    }));
    const executor = createExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: unsupportedGoal,
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        /不支持的 Prompt Bundle 版本 99/,
    );
    assert.equal(adapter.requests.length, 0);
});

test("LLMStepExecutor 使用传入的授权 ToolDefinition 生成 Tool Action", async () => {
    const currentGoal = createTestGoal("run-3", {
        ...profile,
        toolIds: ["read_file"],
    });
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
            memoryPatch: null,
        },
    }));
    const executor = createExecutor(adapter);
    const readFileTool: ToolDefinition = {
        id: "read_file",
        description: "读取工作区文件",
        inputContract: contract.object({ path: contract.string() }),
        isReadOnly: true,
    };

    assert.deepEqual(
        await executor.execute({
            goal: currentGoal,
            authorizedTools: [readFileTool],
            workingMemory: currentWorkingMemory,
        }),
        {
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
    );
    assert.equal(adapter.requests.length, 1);
    assert.match(
        adapter.requests[0]?.messages.find((message) => message.content.includes("Dynamic section: authorized_tools"))?.content ?? "",
        /read_file/,
    );
});

test("Adapter 原始异常会原样传播且不会重试", async () => {
    const currentGoal = createTestGoal("run-4");
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = createExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: currentGoal,
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("协议错误转换为不含原始输出的 Decide RuntimeFeedback", async () => {
    const currentGoal = createTestGoal("run-5");
    const adapter = new FakeAdapter("不是合法 JSON");
    const executor = createExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: currentGoal,
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => {
            assert.ok(error instanceof ModelStageFeedbackError);
            assert.equal(error.feedback.stage, "decide");
            assert.equal(error.feedback.origin, "tool_input");
            assert.equal(error.feedback.issues[0]?.code, "invalid_tool_arguments");
            assert.equal(JSON.stringify(error.feedback).includes("不是合法 JSON"), false);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 1);
});

test("LLMStepExecutor 收到非 executing 分支时生成输出契约 RuntimeFeedback", async () => {
    const currentGoal = createTestGoal("run-exclusive");
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "task_proposal",
            planRoute: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] },
            task: { objective: "不属于 executing", completionCriteria: [] },
            approvalRequest: "请批准",
            memoryPatch: null,
        },
    }));
    const executor = createExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: currentGoal,
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => {
            assert.ok(error instanceof ModelStageFeedbackError);
            assert.equal(error.feedback.origin, "output_contract");
            assert.equal(error.feedback.stage, "decide");
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
    runTask: GoalTask = task,
): Promise<void> {
    return store.save(createExecutingGoal(runId, runProfile, messages, runTask));
}

test("Runner 通过 LLMStepExecutor 兼容持久化终止 AgentDecision", async () => {
    const store = new InMemoryGoalStore();
    const completeContent = JSON.stringify({
        result: {
            kind: "complete",
            summary: "完成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    });
    const adapter = new SequenceAdapter([completeContent, JSON.stringify({ result: { kind: "accept" } })]);
    const executor = createExecutor(adapter);
    const trajectoryStore = createInMemoryTrajectoryStore();
    const runner = new Runner({
        store,
        executor,
        trajectoryStore,
    });

    const initialMessages: readonly GoalMessage[] = [
        { role: "user", content: "恢复后的历史输入" },
        { role: "assistant", assistant: { profileId: "profile-1" }, content: "恢复后的历史响应" },
    ];
    await createStoredGoal(store, "run-loop", profile, initialMessages, {
        ...task,
        completionCriteria: [],
    });
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
            summary: "完成",
            completionEvidence: [],
        },
    });
    assert.deepEqual(persisted?.state.run, result.state);
    assert.equal(adapter.requests.length, 2);
    assert.deepEqual(
        adapter.requests[0]?.messages.slice(1, 3),
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

test("Runner 对未授权 Tool 保存稳定执行错误且不消费 Step", async () => {
    const store = new InMemoryGoalStore();
    const invalidDecision = JSON.stringify({
        result: {
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
    });
    const adapter = new SequenceAdapter([invalidDecision, invalidDecision, invalidDecision]);
    const executor = createExecutor(adapter);
    const trajectoryStore = createInMemoryTrajectoryStore();
    const runner = new Runner({
        store,
        executor,
        trajectoryStore,
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
        code: "INVALID_AGENT_DECISION",
        message: "Model output correction exhausted after three decide attempts (INVALID_LLM_RESPONSE)",
    });
    assert.equal(adapter.requests.length, 3);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
});

test("Runner 将 AgentDecision 协议错误保存为稳定执行错误", async () => {
    const store = new InMemoryGoalStore();
    const adapter = new SequenceAdapter(["不是合法 JSON", "不是合法 JSON", "不是合法 JSON"]);
    const executor = createExecutor(adapter);
    const trajectoryStore = createInMemoryTrajectoryStore();
    const runner = new Runner({
        store,
        executor,
        trajectoryStore,
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
        /Model output correction exhausted after three decide attempts/,
    );
    assert.equal(adapter.requests.length, 3);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
});

test("Runner 将阶段 Adapter 原始错误作为执行错误保存且不伪造 Decision", async () => {
    const store = new InMemoryGoalStore();
    const adapterError = new Error("供应商连接失败");
    const adapter = new RejectingAdapter(adapterError);
    const executor = createExecutor(adapter);
    const trajectoryStore = createInMemoryTrajectoryStore();
    const runner = new Runner({
        store,
        executor,
        trajectoryStore,
    });

    await createStoredGoal(store, "run-adapter");
    const result = await runner.run({ goalId: goalId, runId: "run-adapter" });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }

    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stepCount, 0);
    assert.equal(result.state.lastStep, undefined);
    assert.equal(result.state.stopReason?.kind, "execution_error");
    assert.equal(
        result.state.stopReason?.kind === "execution_error" ? result.state.stopReason.code : undefined,
        "INVALID_AGENT_DECISION",
    );
    assert.equal(adapter.requests.length, 1);
    assert.deepEqual((await store.restore(goalId))?.state.run, result.state);
    assert.notEqual((await store.restore(goalId))?.state.messages.at(-1)?.content, adapterError.message);
});

test("LLMStepExecutor: 连续调用能感知 bindingProvider 发布的新 generation 和新 Adapter", async () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const adapter1 = new FakeAdapter(JSON.stringify({
        result: {
            kind: "complete",
            summary: "第一代完成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    }));
    const adapter2 = new FakeAdapter(JSON.stringify({
        result: {
            kind: "complete",
            summary: "第二代完成",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    }));

    const initialBinding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider: "openai",
            modelId: "model-v1",
            structuredOutputMode: "strict",
            contextWindowTokens: 100_000,
            maxOutputTokens: 4000,
            inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
        },
        thinkAdapter: new FakeAdapter("", "prompt_only"),
        decideAdapter: adapter1,
        trajectoryStore,
    });
    const bindingManager = new MutableModelBinding(initialBinding);

    const executor = new LLMStepExecutor({
        bindingProvider: bindingManager,
        renderer,
        contextCompactor,
    });

    const currentGoal = createTestGoal("run-switch-1");

    // 第一次调用
    const decision1 = await executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });
    assert.equal(decision1.kind, "complete");
    assert.equal((decision1 as any).summary, "第一代完成");
    assert.equal(adapter1.requests.length, 1);
    assert.equal(adapter2.requests.length, 0);

    // 外部切换并发布新 generation
    const candidateBinding = bindingManager.createCandidate({
        selection: {
            provider: "openai",
            modelId: "model-v2",
            structuredOutputMode: "strict",
            contextWindowTokens: 120_000,
            maxOutputTokens: 8000,
            inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
        },
        thinkAdapter: new FakeAdapter("", "prompt_only"),
        decideAdapter: adapter2,
        trajectoryStore,
    });
    bindingManager.publish(candidateBinding);

    // 第二次调用，应使用 adapter2
    const decision2 = await executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });
    assert.equal(decision2.kind, "complete");
    assert.equal((decision2 as any).summary, "第二代完成");
    assert.equal(adapter1.requests.length, 1);
    assert.equal(adapter2.requests.length, 1);
});

test("LLMStepExecutor: 进行中的 execute 调用保持旧 generation，外部发布不会中途换模", async () => {
    const trajectoryStore = createInMemoryTrajectoryStore();
    let resolveAdapter1!: (val: { content: string }) => void;
    const adapter1Promise = new Promise<{ content: string }>((resolve) => {
        resolveAdapter1 = resolve;
    });

    const adapter1: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate() {
            return adapter1Promise.then(response => toolResponseFixture(response.content));
        },
    };
    const adapter2 = new FakeAdapter(JSON.stringify({
        result: {
            kind: "complete",
            summary: "第二代",
            completionEvidence: [],
            memoryPatch: null,
            contextNotes: null,
        },
    }));

    const initialBinding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider: "openai",
            modelId: "model-v1",
            structuredOutputMode: "strict",
            contextWindowTokens: 100_000,
            maxOutputTokens: 4000,
            inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
        },
        thinkAdapter: new FakeAdapter("", "prompt_only"),
        decideAdapter: adapter1,
        trajectoryStore,
    });
    const bindingManager = new MutableModelBinding(initialBinding);

    const executor = new LLMStepExecutor({
        bindingProvider: bindingManager,
        renderer,
        contextCompactor,
    });

    const currentGoal = createTestGoal("run-switch-inflight");

    // 发起 execute 调用，此时卡在 adapter1 generate
    const executePromise = executor.execute({
        goal: currentGoal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    // 外部在中途发布新 Binding
    const candidateBinding = bindingManager.createCandidate({
        selection: {
            provider: "openai",
            modelId: "model-v2",
            structuredOutputMode: "strict",
            contextWindowTokens: 100_000,
            maxOutputTokens: 4000,
            inputEstimator: { kind: "token-encoding", encoding: "o200k_base" },
        },
        thinkAdapter: new FakeAdapter("", "prompt_only"),
        decideAdapter: adapter2,
        trajectoryStore,
    });
    bindingManager.publish(candidateBinding);

    // 释放 adapter1
    resolveAdapter1({
        content: JSON.stringify({
            result: {
                kind: "complete",
                summary: "第一代挂起完成",
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
        }),
    });

    const decision = await executePromise;
    assert.equal(decision.kind, "complete");
    assert.equal((decision as any).summary, "第一代挂起完成");
    assert.equal(adapter2.requests.length, 0); // adapter2 绝未被调用
});


for (const mode of ["strict", "prompt_only"] as const) {
    test(`读取参数错误在 ${mode} 工具调用中保留字段级安全反馈`, async () => {
        const adapter: LLMAdapter = {
            structuredOutputMode: mode,
            async generate() {
                const input = { command: "PRIVATE_INPUT_VALUE", timeoutMs: null, sandboxAccess: null };
                return {
                    content: "", toolCalls: [{ callId: "read-1", toolId: "read_file", argumentsJson: JSON.stringify(input) }],
                };
            },
        };
        await assert.rejects(createExecutor(adapter).execute({
            goal: createTestGoal("run-read-feedback", { ...profile, toolIds: ["read_file"] }), workingMemory: currentWorkingMemory,
            authorizedTools: [{ id: "read_file", description: "Read a file", isReadOnly: true,
                inputContract: contract.object({ path: contract.string() }) }],
        }), (error: unknown) => {
            assert.ok(error instanceof ModelStageFeedbackError);
            assert.equal(error.feedback.origin, "tool_input");
            assert.ok(error.feedback.issues.some(issue => issue.code === "missing_field" && issue.path.at(-1) === "path" && /Supply/.test(issue.message)));
            assert.ok(error.feedback.issues.some(issue => issue.code === "extra_field" && issue.path.at(-1) === "command" && /Remove/.test(issue.message)));
            assert.equal(JSON.stringify(error.feedback).includes("PRIVATE_INPUT_VALUE"), false);
            assert.ok(error.feedback.constraints?.some(text => /continue the original task/.test(text)));
            return true;
        });
    });
}

test("Runner 在读取请求纠错后继续取证，反馈和无效调用不进入 Conversation 或 Tool 执行", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const definitions: ToolDefinition[] = [
        { id: "bash", description: "List files", isReadOnly: true, inputContract: contract.object({ command: contract.string() }) },
        { id: "read_file", description: "Read a file", isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
    ];
    const registry = new InMemoryToolRegistry(definitions.map(definition => createToolRegistration({
        definition, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute({ input }) {
            executed.push(definition.id);
            assert.deepEqual(input, definition.id === "bash" ? { command: "ls -la" } : { path: "AGENTS.md" });
            return { kind: "success", output: { text: definition.id === "bash" ? "AGENTS.md" : "Read source and report evidence." }, summary: "Observed" };
        },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(request) {
            requests.push(request);
            const call = (toolId: string, args: unknown): LLMResponse => ({ content: "", toolCalls: [{ callId: `call-${requests.length}`, toolId, argumentsJson: JSON.stringify(args) }] });
            if (requests.length === 1) return call("bash", { command: "ls -la" });
            if (requests.length === 2) return call("read_file", { command: "" });
            if (requests.length === 3) {
                const feedback = request.messages.find(message => message.content.includes('"source":"runtime_feedback"'));
                assert.ok(feedback);
                assert.match(feedback.content, /missing_field/);
                assert.match(feedback.content, /continue the original task/);
                assert.deepEqual(executed, ["bash"]);
                return call("read_file", { path: "AGENTS.md" });
            }
            if (requests.length === 5) {
                assert.equal(request.tools?.[0]?.id, "system_review_completion");
                return call("system_review_completion", { result: { kind: "accept" } });
            }
            assert.equal(requests.length, 4);
            const events = await trajectoryStore.read({ goalId, runId: "run-repair-read" });
            const evidence = events.filter(event => event.payload.type === "observation_recorded").at(-1)!;
            return call("system_complete_task", { summary: "The rules require source inspection and evidence.", evidenceSequences: [evidence.sequence], memoryPatch: null });
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-repair-read", intent: "Evaluate repository rules", promptBundleVersion: 1,
        profile: { ...profile, toolIds: definitions.map(tool => tool.id) } });
    const initial = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                exposedToolIds: definitions.map((tool) => tool.id),
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "Evaluate repository rules",
                    acceptanceCriteria: ["Rule evaluated"],
                },
            },
        },
    };
    await store.save(initial);
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-repair-read" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed", JSON.stringify({ state: result.state, calls: requests.length, executed }));
    assert.equal(requests.length, 5);
    assert.deepEqual(executed, ["bash", "read_file"]);
    const messages = (await store.restore(goalId))!.state.messages;
    assert.equal(messages.some(message => /runtime_feedback|invalid-read|__lazygoal_null__/.test(message.content)), false);
    const events = await trajectoryStore.read({ goalId, runId: "run-repair-read" });
    assert.equal(events.filter(event => event.payload.type === "model_repair_feedback_recorded").length, 1);
    assert.equal(events.filter(event => event.payload.type === "tool_started").length, 2);
});

for (const mode of ["strict", "prompt_only"] as const) {
    test(`${mode} Decide accepts text JSON and trace-shaped text as an assistant message`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: '{"result":{"kind":"complete","summary":"done","completionEvidence":[],"memoryPatch":null}}' };
        } };
        const jsonLike = await createExecutor(adapter).decide({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory, thinkHistory: [] });
        assert.equal(jsonLike.kind, "assistant_message");
        assert.equal(jsonLike.kind === "assistant_message" && jsonLike.text, '{"result":{"kind":"complete","summary":"done","completionEvidence":[],"memoryPatch":null}}');

        const traceAdapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: 'I need to read the workspace.\n{"result":{"kind":"tool_call","action":{"toolId":"read_file","input":{"path":"README.md"}}}}' };
        } };
        const traceShaped = await createExecutor(traceAdapter).decide({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory, thinkHistory: [] });
        assert.equal(traceShaped.kind, "assistant_message");
        assert.equal(traceShaped.kind === "assistant_message" && traceShaped.text.includes("I need to read the workspace."), true);
    });

    test(`${mode} Decide accepts multiple calls as an ordered batch preserving callId order`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: "", toolCalls: [1, 2, 3].map(i => ({ callId: `call-${i}`, toolId: "read_file",
                argumentsJson: JSON.stringify({ path: `file-${i}.md` }) })) };
        } };
        const result = await createExecutor(adapter).decide({
            goal: createTestGoal("run-batch-order", { ...profile, toolIds: ["read_file"] }),
            workingMemory: currentWorkingMemory,
            thinkHistory: [],
            authorizedTools: [{ id: "read_file", description: "Read a file", isReadOnly: true,
                inputContract: contract.object({ path: contract.string() }) }],
        });
        assert.equal(result.kind, "batch");
        assert.equal(result.kind === "batch" && result.decisions.length, 3);
        assert.deepEqual(
            result.kind === "batch" ? result.decisions.map(decision => decision.kind === "tool_call" ? decision.action.input : undefined) : [],
            [{ path: "file-1.md" }, { path: "file-2.md" }, { path: "file-3.md" }],
        );
    });

    test(`${mode} Decide ignores accompanying text and decodes only a declared call`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: 'not JSON or a decision', toolCalls: [{ callId: "trace-valid", toolId: "system_complete_task",
                argumentsJson: '{"summary":"Declared result","completionEvidence":[],"memoryPatch":null}' }] };
        } };
        const result = await createExecutor(adapter).execute({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory });
        assert.equal(result.kind, "complete");
        assert.equal(result.kind === "complete" && result.summary, "Declared result");
    });
}

test("invalid completion memory patch retains field feedback in the tool protocol", async () => {
    const adapter: LLMAdapter = { structuredOutputMode: "prompt_only", async generate() {
        return { content: "", toolCalls: [{ callId: "bad-patch", toolId: "system_complete_task",
            argumentsJson: '{"summary":"done","completionEvidence":[],"memoryPatch":"__lazygoal_null__"}' }] };
    } };
    await assert.rejects(createExecutor(adapter).execute({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory }), (error: unknown) => {
        assert.ok(error instanceof ModelStageFeedbackError);
        assert.ok(error.feedback.issues.some(issue => issue.path.join(".") === "result.memoryPatch"));
        return true;
    });
});

for (const mode of ["strict", "prompt_only"] as const) {
    test(`${mode} Decide accepts zero calls with non-empty text as an assistant message`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: "我已看完目录结构，先说明我的判断，再决定下一步。" };
        } };
        const result = await createExecutor(adapter).decide({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory, thinkHistory: [] });
        assert.equal(result.kind, "assistant_message");
        assert.equal(result.kind === "assistant_message" && result.text, "我已看完目录结构，先说明我的判断，再决定下一步。");
    });

    test(`${mode} Decide classifies empty or reasoning-only output as no usable result`, async () => {
        const adapter: LLMAdapter = { structuredOutputMode: mode, async generate() {
            return { content: "", reasoning: "only thinking, no answer" };
        } };
        await assert.rejects(createExecutor(adapter).decide({ goal: createTestGoal(), authorizedTools: [], workingMemory: currentWorkingMemory, thinkHistory: [] }), (error: unknown) => {
            assert.ok(error instanceof ModelStageFeedbackError);
            assert.equal(error.feedback.origin, "output_contract");
            assert.equal(error.feedback.issues[0]?.code, "no_usable_result");
            return true;
        });
    });
}

test("Runner 把零调用正文本提交为 Assistant 消息，不推进 Step 并在有界尝试后失败", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const definitions: ToolDefinition[] = [
        { id: "bash", description: "List files", isReadOnly: true, inputContract: contract.object({ command: contract.string() }) },
    ];
    const registry = new InMemoryToolRegistry(definitions.map(definition => createToolRegistration({
        definition, replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { executed.push(definition.id); return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(request) {
            requests.push(request);
            return { content: `我先说明判断，这是第 ${requests.length} 次只说话。` };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-assistant-text", intent: "Explain the workspace", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["bash"] } });
    await store.save(created);
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-assistant-text" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.deepEqual(executed, [], "零调用正文不得触发工具执行");
    assert.equal(result.state.stepCount, 0, "零调用正文不得推进 Step");
    const messages = (await store.restore(goalId))!.state.messages;
    const committed = messages.filter(message => message.role === "assistant" && message.content.startsWith("我先说明判断"));
    assert.equal(committed.length, 3, "三次尝试的正文都应已提交");
    const events = await trajectoryStore.read({ goalId, runId: "run-assistant-text" });
    const feedback = events.filter(event => event.payload.type === "model_repair_feedback_recorded");
    assert.equal(feedback.length, 3, "每次失败尝试都应记录一次反馈，用尽后终结");
    assert.ok(feedback.every(event => event.payload.type === "model_repair_feedback_recorded"
        && event.payload.feedback.code === "NO_USABLE_RESULT"));
});

test("Runner 的不推进预算与协议纠错预算互不占用", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const registry = new InMemoryToolRegistry([createToolRegistration({
        definition: { id: "read_file", description: "Read a file", isReadOnly: true,
            inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })]);
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request) {
            requests.push(request);
            // 2 次零调用正文本 + 2 次 Tool 输入纠错 + 1 次零调用正文本：共享预算会在第 4 次前终止，
            // 独立预算下两类各自 3 次，因此可以走到第 5 次。
            if (requests.length === 1 || requests.length === 2 || requests.length === 5) {
                return { content: `第 ${requests.length} 次只说话。` };
            }
            return { content: "", toolCalls: [{ callId: `call-${requests.length}`, toolId: "read_file",
                argumentsJson: JSON.stringify({ command: "ls" }) }] };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-independent-budget", intent: "Explain the workspace", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_file"] } });
    await store.save(created);
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-independent-budget" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(requests.length, 5, "两类预算独立时第 5 次调用仍可发生");
    assert.equal(result.state.status, "failed");
    const events = await trajectoryStore.read({ goalId, runId: "run-independent-budget" });
    const codes = events.filter(event => event.payload.type === "model_repair_feedback_recorded")
        .map(event => event.payload.type === "model_repair_feedback_recorded" ? event.payload.feedback.code : "");
    assert.deepEqual(codes, ["NO_USABLE_RESULT", "NO_USABLE_RESULT", "INVALID_LLM_RESPONSE", "INVALID_LLM_RESPONSE", "NO_USABLE_RESULT"]);
});

test("Runner 在有效 request_think 后重新开始不推进计数", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const registry = new InMemoryToolRegistry([createToolRegistration({
        definition: { id: "read_file", description: "Read a file", isReadOnly: true,
            inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute() { return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })]);
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request) {
            requests.push(request);
            // 2 次零调用正文本 → 1 次 request_think → 再 2 次零调用正文本。
            if (requests.length === 3) {
                return { content: "", toolCalls: [{ callId: "think-1", toolId: "system_request_think",
                    argumentsJson: JSON.stringify({ goal: "比较两种修复方案" }) }] };
            }
            return { content: `第 ${requests.length} 次只说话。` };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-think-reset", intent: "Explain the workspace", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_file"] } });
    await store.save(created);
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-think-reset" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(requests.length >= 4, true, "request_think 后必须还能继续 Decide");
    const events = await trajectoryStore.read({ goalId, runId: "run-think-reset" });
    assert.equal(events.filter(event => event.payload.type === "think_requested").length, 1);
});

test("Runner 按模型返回顺序执行多调用批次，各计一次 Step 且 Observation 独立归属", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry(["a.md", "b.md", "c.md"].map(name => createToolRegistration({
        definition: { id: `read_${name[0]}`, description: `Read ${name}`, isReadOnly: true,
            inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute({ input }) {
            executed.push((input as { path: string }).path);
            return { kind: "success", output: { text: `content of ${(input as { path: string }).path}` }, summary: "Observed" };
        },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request) {
            requests.push(request);
            if (requests.length === 1) {
                return { content: "", toolCalls: [
                    { callId: "call-a", toolId: "read_a", argumentsJson: '{"path":"a.md"}' },
                    { callId: "call-b", toolId: "read_b", argumentsJson: '{"path":"b.md"}' },
                    { callId: "call-c", toolId: "read_c", argumentsJson: '{"path":"c.md"}' },
                ] };
            }
            return { content: "已完成全部读取。" };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-batch-order", intent: "Read three files", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_a", "read_b", "read_c"] } });
    await store.save({
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                exposedToolIds: ["read_a", "read_b", "read_c"],
                currentStage: {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing" as const,
                    target: "Read three files",
                    acceptanceCriteria: ["All three files read"],
                },
            },
        },
    });
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-batch-order" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // 本用例只验证批次执行；桩在批次后只返回文本，因此按不推进类预算终态失败（该行为由 TODO1/TODO2 用例覆盖）。
    assert.equal(result.state.status, "failed");
    assert.deepEqual(executed, ["a.md", "b.md", "c.md"], "必须按模型返回顺序执行");
    assert.equal(result.state.stepCount, 3, "每个 Action 的成功结果各计一次 Step");
    const events = await trajectoryStore.read({ goalId, runId: "run-batch-order" });
    const observations = events.filter(event => event.payload.type === "observation_recorded");
    assert.equal(observations.length, 3);
    assert.deepEqual(
        observations.map(event => event.payload.type === "observation_recorded"
            && event.payload.observation.kind === "success"
            ? (event.payload.observation.output as { text: string }).text : ""),
        ["content of a.md", "content of b.md", "content of c.md"],
        "每个 Action 的 Observation 必须独立归属",
    );
});

test("Runner 顺序执行两调用批次后回到模型并正常终止", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry(["read_a", "read_b"].map(id => createToolRegistration({
        definition: { id, description: id, isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute({ input }) { executed.push((input as { path: string }).path); return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            requests.push({ messages: [] });
            // 只在对第一次请求返回批次，之后返回普通文本，验证批次结束后不再自增循环。
            return requests.length === 1
                ? { content: "", toolCalls: [
                    { callId: "call-a", toolId: "read_a", argumentsJson: '{"path":"a.md"}' },
                    { callId: "call-b", toolId: "read_b", argumentsJson: '{"path":"b.md"}' },
                ] }
                : { content: "批次已完成。" };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-batch-two", intent: "Read two files", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_a", "read_b"] } });
    await store.save({
        ...created,
        state: { ...created.state, run: { ...created.state.run,
            exposedToolIds: ["read_a", "read_b"],
            currentStage: { stageId: "stage-1", revision: 1, status: "executing" as const, target: "Read two files", acceptanceCriteria: ["done"] } } },
    });
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-batch-two" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(executed, ["a.md", "b.md"]);
    assert.equal(result.state.stepCount, 2);
});

test("Runner 在批次中途需要审批时停止后续执行并保留已执行结果与剩余队列", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const definitions: ToolDefinition[] = [
        { id: "read_a", description: "Read a", isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
        { id: "write_b", description: "Write b", isReadOnly: false,
            inputContract: contract.object({ path: contract.string() }) },
        { id: "read_c", description: "Read c", isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
    ];
    const registry = new InMemoryToolRegistry(definitions.map(definition => createToolRegistration({
        definition, replayPolicy: "safe", validate: () => ({ ok: true }),
        ...(definition.id === "write_b" ? { evaluatePolicy: () => "require_approval" as const } : {}),
        async execute({ input }) { executed.push((input as { path: string }).path); return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            requests.push({ messages: [] });
            // 仅第一次请求返回批次；后续返回文本，避免用恒定桩制造无限批次。
            return requests.length === 1
                ? { content: "", toolCalls: [
                    { callId: "call-a", toolId: "read_a", argumentsJson: '{"path":"a.md"}' },
                    { callId: "call-b", toolId: "write_b", argumentsJson: '{"path":"b.md"}' },
                    { callId: "call-c", toolId: "read_c", argumentsJson: '{"path":"c.md"}' },
                ] }
                : { content: "等待审批。" };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-batch-approval", intent: "Read and write", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_a", "write_b", "read_c"] } });
    await store.save({
        ...created,
        state: { ...created.state, run: { ...created.state.run,
            exposedToolIds: ["read_a", "write_b", "read_c"],
            currentStage: { stageId: "stage-1", revision: 1, status: "executing" as const, target: "Read and write", acceptanceCriteria: ["done"] } } },
    });
    const runner = new Runner({
        store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry,
        toolPolicy: { evaluate: ({ action }) => action.toolId === "write_b" ? "require_approval" : "allow" },
    });
    const result = await runner.run({ goalId, runId: "run-batch-approval" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const restored = (await store.restore(goalId))!;
    assert.equal(result.state.status, "waiting", JSON.stringify({ status: result.state.status, executed, pending: restored.state.run.pendingAction?.action.actionId }));
    assert.deepEqual(executed, ["a.md"], "等待前只执行第一个 Action，后续不得执行");
    assert.equal(restored.state.run.pendingAction?.action.actionId, "call-b");
    assert.deepEqual(restored.state.run.pendingActionBatch?.remaining.map(call => call.actionId), ["call-c"], "未执行的后续 Action 必须保留在批次队列中");
});

test("Runner 拒绝重放已提交结果的 Action，并在有界尝试后终止", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry(["read_a", "read_b"].map(id => createToolRegistration({
        definition: { id, description: id, isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute({ input }) { executed.push(`${id}:${(input as { path: string }).path}`); return { kind: "success", output: { text: "ok" }, summary: "Observed" }; },
    })));
    const requests: LLMRequest[] = [];
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            requests.push({ messages: [] });
            // 恒定返回同一批次：第一批执行后再次提交相同 actionId 必须被拒绝，而不是重放。
            return { content: "", toolCalls: [
                { callId: "call-a", toolId: "read_a", argumentsJson: '{"path":"a.md"}' },
                { callId: "call-b", toolId: "read_b", argumentsJson: '{"path":"b.md"}' },
            ] };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-batch-replay", intent: "Read twice", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_a", "read_b"] } });
    await store.save({
        ...created,
        state: { ...created.state, run: { ...created.state.run,
            exposedToolIds: ["read_a", "read_b"],
            currentStage: { stageId: "stage-1", revision: 1, status: "executing" as const, target: "Read twice", acceptanceCriteria: ["done"] } } },
    });
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const result = await runner.run({ goalId, runId: "run-batch-replay" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(executed, ["read_a:a.md", "read_b:b.md"], "每次 Action 只允许执行一次，不得重放");
    const events = await trajectoryStore.read({ goalId, runId: "run-batch-replay" });
    const repairs = events.filter(event => event.payload.type === "model_repair_feedback_recorded");
    assert.equal(repairs.length, 3, "重复提交必须被有界拒绝（三次尝试），而不是执行");
    assert.equal(result.state.status, "failed");
});

test("Runner 在批次执行中被取消时不再启动后续 Action", async () => {
    const store = new InMemoryGoalStore();
    const trajectoryStore = createInMemoryTrajectoryStore();
    const controller = new AbortController();
    const executed: string[] = [];
    const registry = new InMemoryToolRegistry(["read_a", "read_b"].map(id => createToolRegistration({
        definition: { id, description: id, isReadOnly: true, inputContract: contract.object({ path: contract.string() }) },
        replayPolicy: "safe", validate: () => ({ ok: true }),
        async execute({ input }) {
            executed.push((input as { path: string }).path);
            // 第一个 Action 执行期间取消：后续 Action 与后续模型调用都不得开始。
            if (executed.length === 1) controller.abort();
            return { kind: "success", output: { text: "ok" }, summary: "Observed" };
        },
    })));
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() {
            return { content: "", toolCalls: [
                { callId: "call-a", toolId: "read_a", argumentsJson: '{"path":"a.md"}' },
                { callId: "call-b", toolId: "read_b", argumentsJson: '{"path":"b.md"}' },
            ] };
        },
    };
    const created = createGoal({ ...currentProtocols, id: goalId, runId: "run-batch-cancel", intent: "Read two files", promptBundleVersion: 1,
        profile: { ...profile, toolIds: ["read_a", "read_b"] } });
    await store.save({
        ...created,
        state: { ...created.state, run: { ...created.state.run,
            exposedToolIds: ["read_a", "read_b"],
            currentStage: { stageId: "stage-1", revision: 1, status: "executing" as const, target: "Read two files", acceptanceCriteria: ["done"] } } },
    });
    const runner = new Runner({ store, trajectoryStore, executor: createExecutor(adapter), toolRegistry: registry });
    const outcome = await runner.run({ goalId, runId: "run-batch-cancel" }, {}, { signal: controller.signal })
        .then(() => "returned", (error: unknown) => error);
    assert.deepEqual(executed, ["a.md"], "取消后不得启动后续 Action");
    assert.equal(outcome === "returned" || outcome instanceof Error, true);
    // 取消不终止 Run：停在最后一次提交边界，保持可恢复（R6-1）。
    const restored = (await store.restore(goalId))!;
    assert.equal(restored.state.run.status, "running");
    assert.equal(restored.state.run.pendingAction?.action.actionId, "call-a", "取消点仍是已暂存且未完成的 Action");
    assert.deepEqual(restored.state.run.pendingActionBatch?.remaining.map(call => call.actionId), ["call-b"],
        "未启动的 Action 必须保留在批次队列中，未被视为已完成");
});
