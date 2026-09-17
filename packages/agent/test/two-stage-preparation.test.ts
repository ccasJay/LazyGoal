import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createGoal,
    ExecutionAbortedError,
    type AgentProfile,
    type ExecutionControl,
    type Goal,
    type GoalTask,
} from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMPreparationExecutor,
    THOUGHT_TRUNCATION_MARKER,
} from "../src/index";
import {
    currentProtocols,
    currentWorkingMemory,
    createCurrentContextAssembler,
} from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "profile-prep-1",
    systemPrompt: "你是一个准备阶段执行代理。",
    instructions: ["深度推演再输出结构"],
    toolIds: [],
};

function createGatheringGoal(): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: "goal-prep-1",
        intent: "准备测试目标",
        ...currentProtocols,
        profile,
        runId: "run-prep-1",
    });

    return {
        ...created,
        state: {
            ...created.state,
            run: { ...created.state.run, status: "running" },
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
            messages: [],
        },
    };
}

function createPlanningGoal(): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: "goal-prep-2",
        intent: "规划测试目标",
        ...currentProtocols,
        profile,
        runId: "run-prep-2",
    });

    return {
        ...created,
        state: {
            ...created.state,
            run: { ...created.state.run, status: "running" },
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
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

test("LLMPreparationExecutor 在 gathering_context 阶段 two_stage 模式下串行执行思考与结构化提取 (question)", async () => {
    const stage1CoT = "思考：用户提出的意图不明确，需要提问澄清。";
    const stage2Output = JSON.stringify({
        result: {
            kind: "question",
            question: "请问具体的测试要求是什么？",
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal: createGatheringGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);

    // Stage 1: 无 structuredOutput, 包含 free-form text 引导
    const req1 = adapter.requests[0]!;
    assert.equal(req1.structuredOutput, undefined);
    assert.ok(req1.messages.some(m => m.content.includes("Do not output JSON")));

    // Stage 2: 包含 structuredOutput, 包含 Stage 1 思考
    const req2 = adapter.requests[1]!;
    assert.ok(req2.structuredOutput !== undefined);
    assert.ok(req2.messages.some(m => m.content.includes(stage1CoT)));

    // 验证返回结果
    assert.equal(result.kind, "question");
    if (result.kind === "question") {
        assert.equal(result.question, "请问具体的测试要求是什么？");
    }
});

test("LLMPreparationExecutor 在 gathering_context 阶段 two_stage 模式下成功返回 context_ready", async () => {
    const stage1CoT = "思考：上下文已经完全充分，无需额外提问，可以直接进入就绪状态。";
    const stage2Output = JSON.stringify({
        result: {
            kind: "context_ready",
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal: createGatheringGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.equal(result.kind, "context_ready");
});

test("LLMPreparationExecutor 在 planning 阶段 two_stage 模式下串行执行并返回 task_proposal", async () => {
    const stage1CoT = "思考：规划拆解，分为阅读代码和执行两个子目标。";
    const stage2Output = JSON.stringify({
        result: {
            kind: "task_proposal",
            task: {
                objective: "完成两阶段规划执行",
                completionCriteria: [{ text: "所有测试通过", acceptance: null }],
            },
            approvalRequest: "是否批准任务规划？",
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal: createPlanningGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.equal(result.kind, "task_proposal");
    if (result.kind === "task_proposal") {
        assert.equal(result.task.objective, "完成两阶段规划执行");
        assert.equal(result.approvalRequest, "是否批准任务规划？");
    }
});

test("LLMPreparationExecutor 在 Stage 1 收到取消信号时立即中止且不进入 Stage 2", async () => {
    const abortController = new AbortController();
    const adapter = new MockTwoStageAdapter(
        () => {
            abortController.abort();
            throw new ExecutionAbortedError();
        },
        "{}",
    );

    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: createGatheringGoal(),
            authorizedTools: [],
            control: { signal: abortController.signal },
            workingMemory: currentWorkingMemory,
        }),
        (err: unknown) => err instanceof ExecutionAbortedError,
    );

    assert.equal(adapter.requests.length, 1);
});

test("LLMPreparationExecutor 在 Stage 2 收到取消信号时立即中止", async () => {
    const abortController = new AbortController();
    const adapter = new MockTwoStageAdapter(
        "思考已完成",
        () => {
            abortController.abort();
            throw new ExecutionAbortedError();
        },
    );

    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: createGatheringGoal(),
            authorizedTools: [],
            control: { signal: abortController.signal },
            workingMemory: currentWorkingMemory,
        }),
        (err: unknown) => err instanceof ExecutionAbortedError,
    );

    assert.equal(adapter.requests.length, 2);
});

test("LLMPreparationExecutor 在思考文本超长时执行安全截断", async () => {
    const longThought = "P".repeat(5000);
    const stage2Output = JSON.stringify({
        result: {
            kind: "context_ready",
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(longThought, stage2Output);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
        maxThoughtChars: 400,
    });

    const result = await executor.execute({
        goal: createGatheringGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.equal(result.kind, "context_ready");
    const req2 = adapter.requests[1]!;
    assert.ok(req2.messages.some(m => m.content.includes(THOUGHT_TRUNCATION_MARKER)));
});

test("LLMPreparationExecutor 在 gathering_context 阶段 two_stage 模式下成功返回 probe_action", async () => {
    const stage1CoT = "思考：需要使用 grep 搜索最近的 spec 文件。";
    const stage2Output = JSON.stringify({
        result: {
            kind: "probe_action",
            action: { toolId: "grep", input: { pattern: "spec", ignoreCase: true } },
            memoryPatch: null,
        },
    });

    const adapter = new MockTwoStageAdapter(stage1CoT, stage2Output);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal: createGatheringGoal(),
        authorizedTools: [{
            id: "grep",
            description: "grep files",
            inputContract: contract.object({
                pattern: contract.string(),
                ignoreCase: contract.optional(contract.boolean()),
            }),
            isReadOnly: true,
        }],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 2);
    assert.equal(result.kind, "probe_action");
    if (result.kind === "probe_action") {
        assert.equal(result.action.toolId, "grep");
        assert.deepEqual(result.action.input, { pattern: "spec", ignoreCase: true });
    }
});
