import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest } from "../../llm/src/core/types";
import { contract } from "../../contracts/src/index";
import type { AgentProfile } from "../../runtime/src/agent-profile";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../runtime/src/tool";
import type { ContextCompactor } from "../src/context-compactor";
import type { ModelConversationMessage } from "../src/model-inference-view";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMPreparationExecutor,
    LLMResponseProtocolError,
    UnsupportedPromptBundleVersionError,
} from "../src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";
import type { TrajectoryModelContextAssembler } from "../src/trajectory-model-context-assembler";

const EMPTY_INPUT_CONTRACT = contract.object({});
const PATH_INPUT_CONTRACT = contract.object({ path: contract.string() });

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "你是一个任务准备代理。",
    instructions: ["只收集必要信息"],
    toolIds: [],
};

function createPreparationGoal(
    phase: "gathering_context" | "planning" = "gathering_context",
    runProfile: AgentProfile = profile,
): Goal {
    const goal = createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "实现可恢复 Agent",
        ...currentProtocols,
        profile: runProfile,
        runId: "run-1",
    });

    if (phase === "gathering_context") {
        return goal;
    }

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "planning",
                preparation: { status: "active" },
            },
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

    async generate(request: LLMRequest): Promise<{ content: string }> {
        this.requests.push(request);
        return { content: this.content };
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

function assertPreparationSystemContent(
    content: string,
    phase: "gathering_context" | "planning",
): void {
    assert.ok(content.includes("Global Overview:"));
    assert.ok(content.includes("Profile System Prompt:\n你是一个任务准备代理。"));
    assert.ok(content.includes("Profile Instructions:\n1. 只收集必要信息"));
    assert.ok(content.includes("Active Phase Protocol:"));

    if (phase === "gathering_context") {
        assert.ok(content.includes("return exactly one question, context_ready, or context_lookup result in the result envelope"));
    } else {
        assert.ok(content.includes("return exactly one task_proposal or context_lookup result in the result envelope"));
    }

    assert.ok(content.includes("Authorized Tool definitions (only these Tool IDs may be requested):"));
}

test("gathering_context 只解析 question/context_ready 协议", async () => {
    const goal = createPreparationGoal();
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "question",
            question: "任务需要兼容旧快照吗？",
            memoryPatch: null,
        },
    }));
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

    assert.deepEqual(result, {
        kind: "question",
        question: "任务需要兼容旧快照吗？",
    });
    assert.equal(adapter.requests.length, 1);
    assert.equal(adapter.requests[0]?.messages[0]?.role, "system");
    assert.equal(adapter.requests[0]?.messages.at(-1)?.role, "user");
    assertPreparationSystemContent(
        adapter.requests[0]?.messages[0]?.content ?? "",
        "gathering_context",
    );
    const workingContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as Record<string, unknown>;
    assert.equal(workingContext.phase, "gathering_context");
    assert.equal(workingContext.intent, goal.definition.intent);
    assert.deepEqual(workingContext.workingMemory, currentWorkingMemory);
    assert.equal(typeof workingContext.trajectoryContext, "object");
    assert.equal(typeof workingContext.contextEpoch, "object");
});

test("planning 只解析 task_proposal 协议", async () => {
    const goal = createPreparationGoal("planning");
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "task_proposal",
            task: {
                objective: "实现可恢复 Agent",
                completionCriteria: [{ text: "恢复测试通过", acceptance: null }],
            },
            approvalRequest: "是否批准该任务？",
            memoryPatch: null,
        },
    }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    const tool: ToolDefinition = {
        id: "read_file",
        description: "v1 不应看见",
        inputContract: EMPTY_INPUT_CONTRACT,
    };
    const result = await executor.execute({
        goal,
        authorizedTools: [tool],
        workingMemory: currentWorkingMemory,
    });

    assert.deepEqual(result, {
        kind: "task_proposal",
        task: {
            objective: "实现可恢复 Agent",
            completionCriteria: [{ text: "恢复测试通过" }],
        },
        approvalRequest: "是否批准该任务？",
    });
    assert.equal(adapter.requests.length, 1);
    assert.equal(adapter.requests[0]?.messages[0]?.role, "system");
    assert.equal(adapter.requests[0]?.messages.at(-1)?.role, "user");
    assertPreparationSystemContent(
        adapter.requests[0]?.messages[0]?.content ?? "",
        "planning",
    );
    const workingContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as Record<string, unknown>;
    assert.equal(workingContext.phase, "planning");
    assert.equal(workingContext.intent, goal.definition.intent);
    assert.deepEqual(workingContext.workingMemory, currentWorkingMemory);
    assert.equal(typeof workingContext.trajectoryContext, "object");
    assert.equal(typeof workingContext.contextEpoch, "object");
});

test("当前 planning 请求以实际 Tool Observation 能力约束证据并保留外部依赖", async () => {
    const v1Goal = createPreparationGoal("planning");
    const goal: Goal = {
        ...v1Goal,
        definition: {
            ...v1Goal.definition,
            intent: "生成发布包，并由外部审核人确认签字",
        },
    };
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "task_proposal",
            task: {
                objective: "生成可审核的发布包",
                completionCriteria: [
                    { text: "通过 inspect_release 的 Observation 验证发布包内容", acceptance: null },
                    { text: "取得外部审核人的签字确认", acceptance: null },
                ],
            },
            approvalRequest: "是否批准该完整任务契约及外部签字依赖？",
            memoryPatch: null,
        },
    }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
    const tool: ToolDefinition = {
        id: "inspect_release",
        description: "检查发布包并返回文件清单 Observation",
        inputContract: PATH_INPUT_CONTRACT,
    };

    await executor.execute({
        goal,
        authorizedTools: [tool],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(adapter.requests.length, 1);
    const systemContent = adapter.requests[0]?.messages[0]?.content ?? "";
    const workingContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as { readonly phase: string; readonly intent: string };

    assert.match(systemContent, /planning \(structured@1; trajectory-layered@1; bm25-lite@1\)/);
    const toolsMarker = [
        "Authorized Tool definitions (only these Tool IDs may be requested):",
        "",
    ].join("\n");
    const toolsOffset = systemContent.lastIndexOf(toolsMarker);

    assert.notEqual(toolsOffset, -1);
    assert.deepEqual(
        JSON.parse(systemContent.slice(toolsOffset + toolsMarker.length)),
        [{
            id: tool.id,
            description: tool.description,
            inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
                additionalProperties: false,
            },
        }],
    );
    assert.equal(workingContext.phase, "planning");
    assert.equal(workingContext.intent, "生成发布包，并由外部审核人确认签字");
});

test("模型返回其他 phase 的 PreparationResult 时不重试", async () => {
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "question",
            question: "不属于 planning",
            memoryPatch: null,
        },
    }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: createPreparationGoal("planning"),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            assert.match(error.message, /planning/);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 1);
});

test("Adapter 异常保持原对象传播且不重试", async () => {
    const adapterError = new Error("供应商暂不可用");
    const adapter = new RejectingAdapter(adapterError);
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: createPreparationGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("Preparation Profile 含 Tool 时仍允许 Adapter", async () => {
    const adapter = new FakeAdapter(JSON.stringify({
        result: {
            kind: "context_ready",
            memoryPatch: null,
        },
    }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
    const goal = createPreparationGoal("gathering_context", {
        ...profile,
        toolIds: ["filesystem"],
    });

    assert.deepEqual(await executor.execute({
        goal,
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    }), { kind: "context_ready" });
    assert.equal(adapter.requests.length, 1);
});

test("非 active Preparation Goal 在 Adapter 调用前被拒绝", async () => {
    const active = createPreparationGoal();
    const waiting: Goal = {
        ...active,
        state: {
            ...active.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
        },
    };
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({ goal: waiting, authorizedTools: [], workingMemory: currentWorkingMemory }),
        /active preparation Goal/,
    );
    assert.equal(adapter.requests.length, 0);
});

test("未知 Prompt Bundle 版本在 Adapter 调用前失败", async () => {
    const goal = createPreparationGoal();
    const unsupportedGoal = {
        ...goal,
        definition: {
            ...goal.definition,
            promptBundleVersion: 99,
        },
    } as unknown as Goal;
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: unsupportedGoal,
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => {
            assert.ok(error instanceof UnsupportedPromptBundleVersionError);
            assert.equal(error.bundleVersion, 99);
            assert.deepEqual(error.supportedVersions, [1]);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 0);
});

test("Context Assembler 错误原样传播且不会调用业务 Adapter", async () => {
    const failure = new Error("context compaction failed");
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: {
            async assemble(): Promise<never> {
                throw failure;
            },
        } as unknown as TrajectoryModelContextAssembler,
    });

    await assert.rejects(
        executor.execute({
            goal: createPreparationGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
        (error: unknown) => error === failure,
    );
    assert.equal(adapter.requests.length, 0);
});
