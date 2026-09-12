import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createGoal,
    ExecutionAbortedError,
    type AgentProfile,
    type ExecutionControl,
    type Goal,
    type GoalMessage,
    type GoalTask,
} from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
    TwoStageStepExecutor,
    THOUGHT_TRUNCATION_MARKER,
} from "../src/index";
import {
    currentProtocols,
    currentWorkingMemory,
    createCurrentContextAssembler,
} from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

function createTwoStageExecutor(adapter: LLMAdapter): TwoStageStepExecutor {
    return new TwoStageStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

function createLLMStepExecutor(adapter: LLMAdapter): LLMStepExecutor {
    return new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
}

const task: GoalTask = {
    objective: "验证两阶段决策调度",
    completionCriteria: [{ text: "先思考后决策" }],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个两阶段执行代理。",
    instructions: ["深度思考后再输出动作"],
    toolIds: [],
};

function createTestGoal(): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: "goal-two-stage-1",
        intent: task.objective,
        ...currentProtocols,
        profile,
        runId: "run-two-stage-1",
    });

    return {
        ...created,
        state: {
            ...created.state,
            run: { ...created.state.run, status: "running" },
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task,
            },
            messages: [],
        },
    };
}

class MockTwoStageAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    readonly structuredOutputMode = "two_stage" as const;

    constructor(
        private readonly stage1Content: string | (() => string | Promise<string>),
        private readonly stage2Content: string | (() => string | Promise<string>),
    ) {}

    async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        if (control?.signal?.aborted) {
            throw new ExecutionAbortedError();
        }
        this.requests.push(request);

        if (this.requests.length === 1) {
            const content = typeof this.stage1Content === "function"
                ? await this.stage1Content()
                : this.stage1Content;
            return { content };
        } else {
            const content = typeof this.stage2Content === "function"
                ? await this.stage2Content()
                : this.stage2Content;
            return { content };
        }
    }
}

test("TwoStageStepExecutor 串行执行思考捕获与结构化提取并返回带思考链的决策", async () => {
    const stage1CoT = "这是我的第一阶段自由思考推演：已确认完成全部任务，应当提交完成决策。";
    const stage2Output = JSON.stringify({
        result: {
            kind: "complete",
            summary: "任务已按推演成功完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = createTwoStageExecutor(adapter);

    const result = await executor.execute({
        goal: createTestGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    // 验证调用次数为 2 次
    assert.equal(adapter.requests.length, 2);

    // 验证 Stage 1 请求：无 structuredOutput
    const req1 = adapter.requests[0]!;
    assert.equal(req1.structuredOutput, undefined);
    assert.ok(req1.messages.some(m => m.content.includes("free-form text")));

    // 验证 Stage 2 请求：有 structuredOutput 且包含第一阶段思考链
    const req2 = adapter.requests[1]!;
    assert.ok(req2.structuredOutput !== undefined);
    assert.ok(req2.messages.some(m => m.content.includes(stage1CoT)));

    // 验证返回结果
    assert.equal(result.thought, stage1CoT);
    assert.equal(result.decision.kind, "complete");
    if (result.decision.kind === "complete") {
        assert.equal(result.decision.summary, "任务已按推演成功完成");
    }
});

test("TwoStageStepExecutor 在 Stage 1 遇到取消信号时立即中止且不进入 Stage 2", async () => {
    const abortController = new AbortController();
    const adapter = new MockTwoStageAdapter(
        () => {
            abortController.abort();
            throw new ExecutionAbortedError();
        },
        "{}",
    );

    const executor = createTwoStageExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: createTestGoal(),
            authorizedTools: [],
            control: { signal: abortController.signal },
            workingMemory: currentWorkingMemory,
        }),
        (err: unknown) => err instanceof ExecutionAbortedError,
    );

    assert.equal(adapter.requests.length, 1); // Stage 1 中止后不进入 Stage 2
});

test("TwoStageStepExecutor 在 Stage 2 遇到取消信号时立即中止", async () => {
    const abortController = new AbortController();
    const adapter = new MockTwoStageAdapter(
        "思考已完成",
        () => {
            abortController.abort();
            throw new ExecutionAbortedError();
        },
    );

    const executor = createTwoStageExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: createTestGoal(),
            authorizedTools: [],
            control: { signal: abortController.signal },
            workingMemory: currentWorkingMemory,
        }),
        (err: unknown) => err instanceof ExecutionAbortedError,
    );

    // Stage 1 触发了一次，Stage 2 中止
    assert.equal(adapter.requests.length, 2);
});

test("TwoStageStepExecutor 在 Stage 1 发生网络错误时直接抛出且不调用 Stage 2", async () => {
    class NetworkErrorAdapter implements LLMAdapter {
        readonly requests: LLMRequest[] = [];
        readonly structuredOutputMode = "two_stage" as const;

        async generate(req: LLMRequest): Promise<never> {
            this.requests.push(req);
            throw new Error("Network timeout in Stage 1");
        }
    }

    const adapter = new NetworkErrorAdapter();
    const executor = createTwoStageExecutor(adapter);

    await assert.rejects(
        executor.execute({
            goal: createTestGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        /Network timeout in Stage 1/,
    );

    assert.equal(adapter.requests.length, 1);
});

test("LLMStepExecutor 在 two_stage 模式下自动委托给两阶段调度", async () => {
    const stage1CoT = "LLMStepExecutor 思考链";
    const stage2Output = JSON.stringify({
        result: {
            kind: "complete",
            summary: "两阶段完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = createLLMStepExecutor(adapter);

    const result = await executor.execute({
        goal: createTestGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.equal((result as any).thought, stage1CoT);
    assert.equal((result as any).decision.kind, "complete");
});

test("TwoStageStepExecutor 在思考文本超长时执行安全截断并注入截断标记", async () => {
    const longThought = "A".repeat(5000);
    const stage2Output = JSON.stringify({
        result: {
            kind: "complete",
            summary: "截断测试完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(longThought, stage2Output);
    const executor = new TwoStageStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
        maxThoughtChars: 500,
    });

    const result = await executor.execute({
        goal: createTestGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.ok(result.thought?.includes(THOUGHT_TRUNCATION_MARKER));
    assert.ok(result.thought.length <= 500);
    const req2 = adapter.requests[1]!;
    assert.ok(req2.messages.some(m => m.content.includes(THOUGHT_TRUNCATION_MARKER)));
});

test("TwoStageStepExecutor 在 Stage 2 输出非法协议时抛出异常并向 traceSink 记录", async () => {
    const traces: any[] = [];
    const traceSink = {
        async append(entry: any) {
            traces.push(entry);
        },
    };

    const adapter = new MockTwoStageAdapter("自由思考", "非法输出不是有效JSON");
    const executor = new TwoStageStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
        traceSink,
    });

    await assert.rejects(
        executor.execute({
            goal: createTestGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
    );

    // 验证 trace 记录了 stage1 req/res, stage2 req/res 与 error
    assert.ok(traces.some(t => t.kind === "model_error" && t.payload?.stage === "response_parse"));
});


