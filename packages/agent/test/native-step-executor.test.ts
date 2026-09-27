import assert from "node:assert/strict";
import { test } from "node:test";
import { contract, validateModelOutputSemantics } from "../../contracts/src/index";
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
            },
            run: { ...created.state.run, status: "running" , mode: "plan", approvedTask: mockTask },
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

test("LLMStepExecutor 的兼容 execute 入口单次 Decide 返回 AgentDecision", async () => {
    const goal = createExecutingGoal();
    const mockBashTool: ToolDefinition = {
        id: "bash",
        description: "执行命令",
        inputContract: contract.object({ command: contract.string() }),
        isReadOnly: false,
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
    assert.equal(result.kind, "complete");
    assert.equal((result as any).summary, "执行完毕且通过检验");
});

test("LLMStepExecutor 单步调用业务工具生成非空合规 actionId 并通过语义校验", async () => {
    const goal = createExecutingGoal();
    const mockBashTool: ToolDefinition = {
        id: "bash",
        description: "执行命令",
        inputContract: contract.object({ command: contract.string() }),
        isReadOnly: false,
    };

    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(req: LLMRequest): Promise<LLMResponse> {
            return {
                content: "分析需要执行 ls 命令查看目录",
                toolCalls: [
                    {
                        callId: "call-bash-1",
                        toolId: "bash",
                        argumentsJson: JSON.stringify({ command: "ls -la" }),
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

    assert.equal(result.kind, "tool_call");
    if (result.kind === "tool_call") {
        assert.equal(result.action.toolId, "bash");
        assert.deepEqual(result.action.input, { command: "ls -la" });
        assert.ok(typeof result.action.actionId === "string" && result.action.actionId.trim().length > 0);
        const issues = validateModelOutputSemantics(result);
        assert.equal(issues.length, 0, "生成的 AgentDecision 必须完全通过领域语义规则校验");
    }
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
