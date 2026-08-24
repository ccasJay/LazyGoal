import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest } from "../../llm/src/core/types";
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

function assertPreparationSystemContent(
    content: string,
    phase: "gathering_context" | "planning",
): void {
    assert.ok(content.includes("Global Overview:"));
    assert.ok(content.includes("Profile System Prompt:\n你是一个任务准备代理。"));
    assert.ok(content.includes("Profile Instructions:\n1. 只收集必要信息"));
    assert.ok(content.includes("Active Phase Protocol:"));

    if (phase === "gathering_context") {
        assert.ok(content.includes('"kind":"question"'));
    } else {
        assert.ok(content.includes('"kind":"task_proposal"'));
    }

    assert.ok(
        content.endsWith(
            "Authorized Tool definitions (only these Tool IDs may be requested):\n[]",
        ),
    );
}

test("gathering_context 只解析 question/context_ready 协议", async () => {
    const goal = createPreparationGoal();
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "question",
        question: "任务需要兼容旧快照吗？",
    }));
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    const result = await executor.execute(goal, []);

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
    assert.deepEqual(
        JSON.parse(adapter.requests[0]?.messages.at(-1)?.content ?? ""),
        { phase: "gathering_context", intent: goal.definition.intent },
    );
});

test("planning 只解析 task_proposal 协议", async () => {
    const goal = createPreparationGoal("planning");
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "task_proposal",
        task: {
            objective: "实现可恢复 Agent",
            completionCriteria: ["恢复测试通过"],
        },
        approvalRequest: "是否批准该任务？",
    }));
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    const tool: ToolDefinition = {
        id: "read_file",
        description: "v1 不应看见",
        inputSchema: { type: "object" },
    };
    const result = await executor.execute(goal, [tool]);

    assert.deepEqual(result, {
        kind: "task_proposal",
        task: {
            objective: "实现可恢复 Agent",
            completionCriteria: ["恢复测试通过"],
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
    assert.deepEqual(
        JSON.parse(adapter.requests[0]?.messages.at(-1)?.content ?? ""),
        { phase: "planning", intent: goal.definition.intent },
    );
});

test("v2 planning 请求以实际 Tool Observation 能力约束证据并保留外部依赖", async () => {
    const v1Goal = createPreparationGoal("planning");
    const goal: Goal = {
        ...v1Goal,
        definition: {
            ...v1Goal.definition,
            promptBundleVersion: 2,
            intent: "生成发布包，并由外部审核人确认签字",
        },
    };
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "task_proposal",
        task: {
            objective: "生成可审核的发布包",
            completionCriteria: [
                "通过 inspect_release 的 Observation 验证发布包内容",
                "取得外部审核人的签字确认",
            ],
        },
        approvalRequest: "是否批准该完整任务契约及外部签字依赖？",
    }));
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });
    const tool: ToolDefinition = {
        id: "inspect_release",
        description: "检查发布包并返回文件清单 Observation",
        inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
        },
    };

    await executor.execute(goal, [tool]);

    assert.equal(adapter.requests.length, 1);
    const systemContent = adapter.requests[0]?.messages[0]?.content ?? "";
    const workingContext = JSON.parse(
        adapter.requests[0]?.messages.at(-1)?.content ?? "",
    ) as { readonly phase: string; readonly intent: string };

    assert.ok(systemContent.includes(
        "Define completionCriteria as observable evidence that is collectively sufficient to judge the objective complete and obtainable from Conversation, Working Context, or Authorized Tool Observations available in this runtime.",
    ));
    assert.ok(systemContent.includes(
        "If the user explicitly requires evidence that this runtime cannot obtain, preserve it as an external dependency and state that dependency in both completionCriteria and approvalRequest.",
    ));
    const toolsMarker = [
        "Authorized Tool definitions (only these Tool IDs may be requested):",
        "",
    ].join("\n");
    const toolsOffset = systemContent.lastIndexOf(toolsMarker);

    assert.notEqual(toolsOffset, -1);
    assert.deepEqual(
        JSON.parse(systemContent.slice(toolsOffset + toolsMarker.length)),
        [tool],
    );
    assert.deepEqual(workingContext, {
        phase: "planning",
        intent: "生成发布包，并由外部审核人确认签字",
    });
});

test("模型返回其他 phase 的 PreparationResult 时不重试", async () => {
    const adapter = new FakeAdapter(JSON.stringify({
        kind: "question",
        question: "不属于 planning",
    }));
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(createPreparationGoal("planning"), []),
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
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(createPreparationGoal(), []),
        (error: unknown) => error === adapterError,
    );
    assert.equal(adapter.requests.length, 1);
});

test("Preparation Profile 含 Tool 时仍允许 Adapter", async () => {
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });
    const goal = createPreparationGoal("gathering_context", {
        ...profile,
        toolIds: ["filesystem"],
    });

    assert.deepEqual(await executor.execute(goal, []), { kind: "context_ready" });
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
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(waiting, []),
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
    const executor = new LLMPreparationExecutor({ adapter, renderer, contextCompactor });

    await assert.rejects(
        executor.execute(unsupportedGoal, []),
        (error: unknown) => {
            assert.ok(error instanceof UnsupportedPromptBundleVersionError);
            assert.equal(error.bundleVersion, 99);
            assert.deepEqual(error.supportedVersions, [1, 2, 3]);
            return true;
        },
    );
    assert.equal(adapter.requests.length, 0);
});

test("Compactor 错误原样传播且不会调用业务 Adapter", async () => {
    const failure = new Error("context compaction failed");
    const failingCompactor: ContextCompactor<ModelConversationMessage> = {
        async compact(): Promise<never> {
            throw failure;
        },
    };
    const adapter = new FakeAdapter(JSON.stringify({ kind: "context_ready" }));
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor: failingCompactor,
    });

    await assert.rejects(
        executor.execute(createPreparationGoal(), []),
        (error: unknown) => error === failure,
    );
    assert.equal(adapter.requests.length, 0);
});
