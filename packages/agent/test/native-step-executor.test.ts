import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../../contracts/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import { createGoal } from "../../runtime/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import type { Goal, GoalTask } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
    LLMStepExecutor,
    LLMPreparationExecutor,
} from "../src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const mockTask: GoalTask = {
    objective: "实现原生双通道调用",
    completionCriteria: [{ text: "验证单步 1 RTT 与工具解析" }],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "系统助手",
    instructions: ["按规范执行"],
    toolIds: [],
};

function createExecutingGoal(): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: "goal-native-1",
        intent: mockTask.objective,
        ...currentProtocols,
        profile,
        runId: "run-1",
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: mockTask,
            },
            run: { ...created.state.run, status: "running" },
            messages: [],
        },
    };
}

function createGatheringGoal(): Goal {
    const created = createGoal({
        promptBundleVersion: 1,
        id: "goal-native-2",
        intent: "准备阶段需求澄清",
        ...currentProtocols,
        profile,
        runId: "run-2",
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "active" },
            },
            run: { ...created.state.run, status: "running" },
            messages: [],
        },
    };
}

class ToolCallingAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    readonly structuredOutputMode = "strict" as const;

    constructor(private readonly response: LLMResponse) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return this.response;
    }
}

test("LLMStepExecutor 单步 1 RTT 原生工具调用返回 AgentDecision 与 thought", async () => {
    const goal = createExecutingGoal();
    const mockBashTool: ToolDefinition = {
        id: "bash",
        description: "执行命令",
        inputContract: contract.object({ command: contract.string() }),
        outputContract: contract.string(),
    };

    let callCount = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(req: LLMRequest): Promise<LLMResponse> {
            callCount++;
            assert.ok(req.tools);
            assert.equal(req.toolChoice, "required");
            // 包含业务工具 bash 与系统工具 complete, wait, fail, lookup
            assert.ok(req.tools.some(t => t.id === "bash"));
            assert.ok(req.tools.some(t => t.id === "system_complete_task"));
            assert.ok(req.tools.some(t => t.id === "system_wait_for_input"));

            return {
                content: "思考推演：已确认目标达成，调用完成动作。",
                toolCalls: [
                    {
                        callId: "call-1",
                        toolId: "system_complete_task",
                        argumentsJson: JSON.stringify({
                            summary: "执行完毕且通过检验",
                            completionEvidence: [],
                            memoryPatch: null,
                        }),
                    },
                ],
            };
        },
    };

    const executor = new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal,
        authorizedTools: [mockBashTool],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(callCount, 1, "单步执行严格发起 1 次网络调用 (1 RTT)");
    assert.equal((result as any).thought, "思考推演：已确认目标达成，调用完成动作。");
    assert.equal(result.kind, "complete");
    assert.equal((result as any).summary, "执行完毕且通过检验");
});

test("LLMStepExecutor 当模型缺失工具调用且非结构化文本时抛出 LLMResponseProtocolError", async () => {
    const goal = createExecutingGoal();
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            return {
                content: "我正在思考，但我没有返回任何工具调用！",
            };
        },
    };

    const executor = new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({ goal, authorizedTools: [], workingMemory: currentWorkingMemory }),
        (err: unknown) => {
            assert.ok(err instanceof LLMResponseProtocolError);
            assert.equal(err.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            return true;
        },
    );
});

test("LLMPreparationExecutor 单步 1 RTT 原生工具调用解析 PreparationResult", async () => {
    const goal = createGatheringGoal();
    let callCount = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(req: LLMRequest): Promise<LLMResponse> {
            callCount++;
            assert.ok(req.tools);
            assert.equal(req.toolChoice, "required");
            assert.ok(req.tools.some(t => t.id === "system_ask_clarification"));
            assert.ok(req.tools.some(t => t.id === "system_context_ready"));

            return {
                content: "分析发现用户意图不完整，需要提问澄清。",
                toolCalls: [
                    {
                        callId: "call-prep-1",
                        toolId: "system_ask_clarification",
                        argumentsJson: JSON.stringify({
                            question: "请问具体的测试框架是哪一个？",
                            memoryPatch: null,
                        }),
                    },
                ],
            };
        },
    };

    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const result = await executor.execute({
        goal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(callCount, 1, "准备阶段单步严格发起 1 次网络调用 (1 RTT)");
    assert.equal(result.kind, "question");
    assert.equal((result as any).question, "请问具体的测试框架是哪一个？");
});
