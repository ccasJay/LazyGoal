import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import { ModelStageFeedbackError } from "../../runtime/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import {
    createEmptyWorkingMemory,
} from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
    createModelExecutionBinding,
    MutableModelBinding,
} from "../src/index";
import { createInMemoryTrajectoryStore, currentProtocols } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const profile = {
    id: "stage-binding-profile",
    systemPrompt: "stage binding",
    instructions: [],
    toolIds: [],
};

class ReplyAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(
        readonly structuredOutputMode: "strict" | "prompt_only",
        private readonly reply: string,
    ) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return { content: this.reply };
    }
}

class RequestThinkFunctionAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    request?: LLMRequest;

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.request = request;
        return {
            content: "",
            toolCalls: [{
                callId: "think-request-1",
                toolId: "system_request_think",
                argumentsJson: JSON.stringify({ goal: "检查工具调用协议" }),
            }],
        };
    }
}

function createRunningGoal(runId: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: "stage-binding-goal",
        runId,
        promptBundleVersion: 1,
        intent: "使用当前阶段 Adapter 作出决策",
        profile,
        maxSteps: 5,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run,
                status: "running",
                mode: "plan",
                approvedTask: {
                    objective: "完成直接 Decide 阶段测试",
                    completionCriteria: [{ text: "返回合法完成决策" }],
                },
            },
        },
    };
}

function createExecutor(
    thinkAdapter: LLMAdapter,
    decideAdapter: LLMAdapter,
    provider: "openai" | "anthropic",
): LLMStepExecutor {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const binding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider,
            modelId: provider === "openai" ? "gpt-4o" : "claude-sonnet-4-5",
            structuredOutputMode: "two_stage",
            inputEstimator: { kind: "character-v1" },
        },
        thinkAdapter,
        decideAdapter,
        trajectoryStore,
    });
    return new LLMStepExecutor({
        bindingProvider: new MutableModelBinding(binding),
        renderer,
        contextCompactor: new DropOldestContextCompactor(),
    });
}

test("直接 Decide 只调用 Decide Adapter，并保留原生 strict schema", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "不得调用");
    const decideAdapter = new ReplyAdapter("strict", JSON.stringify({
        result: {
            kind: "complete",
            summary: "直接完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    }));
    const executor = createExecutor(thinkAdapter, decideAdapter, "openai");

    const result = await executor.execute({
        goal: createRunningGoal("stage-binding-direct"),
        authorizedTools: [],
        workingMemory: createEmptyWorkingMemory(),
    });

    assert.equal(result.kind, "complete");
    assert.equal(thinkAdapter.requests.length, 0);
    assert.equal(decideAdapter.requests.length, 1);
    assert.ok(decideAdapter.requests[0]?.structuredOutput !== undefined);
});

test("prompt_only Decide 仍经本地输出契约拒绝非法响应", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "不得调用");
    const decideAdapter = new ReplyAdapter("prompt_only", "not-json");
    const executor = createExecutor(thinkAdapter, decideAdapter, "anthropic");

    await assert.rejects(
        executor.execute({
            goal: createRunningGoal("stage-binding-prompt-only"),
            authorizedTools: [],
            workingMemory: createEmptyWorkingMemory(),
        }),
        (error: unknown) => error instanceof ModelStageFeedbackError
            && error.feedback.stage === "decide"
            && error.feedback.code === "INVALID_LLM_RESPONSE",
    );

    assert.equal(thinkAdapter.requests.length, 0);
    assert.equal(decideAdapter.requests.length, 1);
    assert.equal(decideAdapter.requests[0]?.structuredOutput, undefined);
});

test("Decide 可请求 Think，Think 使用 prompt_only 且不挂载工具或结构化 Schema", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "目标相关的可验证差异是检查点必须先持久化。");
    const decideAdapter = new ReplyAdapter("strict", JSON.stringify({
        result: {
            kind: "request_think",
            goal: "比较两种恢复方案的持久化边界",
        },
    }));
    const executor = createExecutor(thinkAdapter, decideAdapter, "openai");
    const input = {
        goal: createRunningGoal("stage-binding-think"),
        authorizedTools: [],
        workingMemory: createEmptyWorkingMemory(),
        thinkHistory: [],
    } as const;

    const request = await executor.decide(input);
    assert.equal(request.kind, "request_think");
    if (request.kind !== "request_think") return;
    assert.equal(request.goal, "比较两种恢复方案的持久化边界");
    assert.equal(request.modelContextFrame?.stage, "decide");
    assert.equal(decideAdapter.requests.length, 1);
    assert.equal(thinkAdapter.requests.length, 0);
    assert.ok(decideAdapter.requests[0]?.structuredOutput !== undefined);
    assert.ok(decideAdapter.requests[0]?.tools?.some((tool) => tool.id === "system_request_think"));

    const thought = await executor.think({
        ...input,
        thinkGoal: request.goal,
    });
    assert.equal(thought.goal, request.goal);
    assert.match(thought.output, /可验证差异/);
    assert.equal(thinkAdapter.requests.length, 1);
    assert.equal(thinkAdapter.requests[0]?.structuredOutput, undefined);
    assert.equal(thinkAdapter.requests[0]?.tools, undefined);
    assert.ok(thinkAdapter.requests[0]?.messages.some((message) => message.content.includes(request.goal)));
});

test("原生 Function Calling 的 request_think 解码为 Runtime 控制结果", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "不应在本测试调用");
    const decideAdapter = new RequestThinkFunctionAdapter();
    const executor = createExecutor(thinkAdapter, decideAdapter, "openai");
    const result = await executor.decide({
        goal: createRunningGoal("stage-binding-think-function"),
        authorizedTools: [],
        workingMemory: createEmptyWorkingMemory(),
        thinkHistory: [],
    });

    assert.equal(result.kind, "request_think");
    if (result.kind !== "request_think") return;
    assert.equal(result.goal, "检查工具调用协议");
    assert.ok(decideAdapter.request?.tools?.some((tool) => tool.id === "system_request_think"));
    assert.equal(thinkAdapter.requests.length, 0);
});

test("Think 拒绝空文本和任何工具调用", async () => {
    const input = {
        goal: createRunningGoal("stage-binding-think-invalid"),
        authorizedTools: [],
        workingMemory: createEmptyWorkingMemory(),
        thinkGoal: "列出待验证的证据",
        thinkHistory: [],
    } as const;
    const decideAdapter = new ReplyAdapter("strict", "unused");
    const emptyAdapter = new ReplyAdapter("prompt_only", " \n ");
    const emptyExecutor = createExecutor(emptyAdapter, decideAdapter, "openai");
    await assert.rejects(
        emptyExecutor.think(input),
        (error: unknown) => error instanceof ModelStageFeedbackError
            && error.feedback.stage === "think"
            && error.feedback.code === "INVALID_LLM_RESPONSE",
    );

    const toolAdapter = new RequestThinkFunctionAdapter();
    const toolExecutor = createExecutor(toolAdapter, decideAdapter, "openai");
    await assert.rejects(
        toolExecutor.think(input),
        (error: unknown) => error instanceof ModelStageFeedbackError
            && error.feedback.stage === "think"
            && error.feedback.code === "INVALID_LLM_RESPONSE",
    );
    assert.equal(toolAdapter.request?.tools, undefined);
    assert.equal(toolAdapter.request?.structuredOutput, undefined);
});
