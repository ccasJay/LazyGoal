import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import type {
    ModelInferenceView,
    ModelContextLookupResult,
    ModelProfileView,
    ModelToolDefinition,
    ModelWorkingContext,
    ModelPreparationInputEvidence,
} from "../src/model-inference-view";
import {
    renderRequest,
    renderWorkingContextMessage,
} from "../src/render";

const renderer = await createDefaultPromptBundleRenderer();

const profile: ModelProfileView = {
    id: "profile-1",
    name: "示例 Profile",
    systemPrompt: "你是一个严谨的执行代理。",
    instructions: ["先检查输入", "再给出下一步"],
};

const conversation: ModelInferenceView["conversation"] = [
    { role: "user", content: "补充的真实输入", sourceMessageIndex: 0 },
    {
        role: "assistant",
        assistant: { profileId: "profile-1" },
        content: "真实响应",
        sourceMessageIndex: 1,
    },
];

const readFileTool: ModelToolDefinition = {
    id: "read_file",
    description: "读取工作区内文本文件",
    inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
    },
};

function buildView(
    phase: ModelInferenceView["prompt"]["phase"],
    workingContext: ModelWorkingContext,
    options: {
        readonly promptBundleVersion?: number;
        readonly conversation?: ModelInferenceView["conversation"];
        readonly authorizedTools?: readonly ModelToolDefinition[];
        readonly contextLookupResult?: ModelContextLookupResult;
        readonly preparationInputEvidence?: readonly ModelPreparationInputEvidence[];
    } = {},
): ModelInferenceView {
    return {
        prompt: {
            promptBundleVersion: (options.promptBundleVersion ?? 1) as 1,
            phase,
            profile,
            authorizedTools: options.authorizedTools ?? [],
            memoryProtocol: { kind: "structured" as const, version: 1 as const },
            modelContextProtocol: {
                kind: "trajectory-layered" as const,
                version: 1 as const,
            },
            contextRetrievalProtocol: {
                kind: "bm25-lite" as const,
                version: 1 as const,
            },
        },
        conversation: options.conversation ?? conversation,
        workingContext,
        workingMemory: {
            protocolVersion: 1,
            derivedThroughSequence: 0,
            facts: [],
            hypotheses: [],
            plan: [],
            blockers: [],
        },
        contextEpoch: {
            protocolVersion: 1,
            epochNumber: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
            control: {
                status: "active",
                inputTokens: 0,
                hardInputLimit: 0,
                remainingTokens: 0,
            },
        },
        ...(options.contextLookupResult === undefined
            ? {}
            : { contextLookupResult: options.contextLookupResult }),
        ...(options.preparationInputEvidence === undefined
            ? {}
            : { preparationInputEvidence: options.preparationInputEvidence }),
    };
}

test("renderRequest 按 system → 真实会话 → Working Context 组装唯一 system 消息", () => {
    const workingContext: ModelWorkingContext = {
        phase: "gathering_context",
        intent: "完成示例任务",
    };
    const view = buildView("gathering_context", workingContext);
    const request = renderRequest(view, renderer);

    assert.equal(request.messages.length, 4);
    assert.equal(request.messages[0]?.role, "system");
    assert.equal(request.messages[0]?.content, renderer.render(view.prompt));
    assert.deepEqual(
        request.messages.slice(1, -1),
        conversation.map(({ role, content }) => ({ role, content })),
    );
    assert.equal(request.messages.at(-1)?.role, "user");
    assert.deepEqual(
        JSON.parse(request.messages.at(-1)?.content ?? ""),
        {
            ...workingContext,
            workingMemory: view.workingMemory,
            contextEpoch: view.contextEpoch,
            visibleConversationMessageMap: [
                { visibleIndex: 0, sourceMessageIndex: 0 },
                { visibleIndex: 1, sourceMessageIndex: 1 },
            ],
        },
    );
});

test("executing 请求使用授权 ToolDefinition 渲染且不授予未授权能力", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        task: {
            objective: "实现三阶段上下文",
            completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
        },
        execution: { stepCount: 0 },
    };
    const view = buildView("executing", workingContext, {
        authorizedTools: [readFileTool],
    });
    const request = renderRequest(view, renderer);
    const systemContent = request.messages[0]?.content ?? "";

    assert.match(systemContent, /Active Phase Protocol:/);
    assert.match(systemContent, /trajectory-layered@1/);
    assert.match(systemContent, /read_file/);
    assert.match(systemContent, /读取工作区内文本文件/);

    const control = JSON.parse(request.messages.at(-1)?.content ?? "");
    assert.equal("preparationInputEvidence" in control, false);
    assert.equal("visibleConversationMessageMap" in control, false);
});

test("Conversation 与 Working Context 保持原始内容，不执行 Nunjucks 语法", () => {
    const view = buildView(
        "gathering_context",
        { phase: "gathering_context", intent: "{% if true %}x{% endif %}" },
        {
            conversation: [{
                role: "user",
                content: "{{ profile.systemPrompt }}",
                sourceMessageIndex: 0,
            }],
        },
    );
    const request = renderRequest(view, renderer);

    assert.equal(request.messages[1]?.content, "{{ profile.systemPrompt }}");
    assert.deepEqual(
        JSON.parse(request.messages.at(-1)?.content ?? ""),
        {
            phase: "gathering_context",
            intent: "{% if true %}x{% endif %}",
            workingMemory: view.workingMemory,
            contextEpoch: view.contextEpoch,
            visibleConversationMessageMap: [
                { visibleIndex: 0, sourceMessageIndex: 0 },
            ],
        },
    );
});

test("Preparation 控制消息只暴露最终可见 Conversation 映射和匹配 provenance", () => {
    const view = buildView(
        "gathering_context",
        { phase: "gathering_context", intent: "完成示例任务" },
        {
            conversation: [
                { role: "user", content: "可见约束", sourceMessageIndex: 2 },
                {
                    role: "assistant",
                    assistant: { profileId: "profile-1" },
                    content: "可见响应",
                    sourceMessageIndex: 4,
                },
            ],
            preparationInputEvidence: [
                {
                    sequence: 8,
                    messageIndex: 2,
                    contentHash: "sha256:visible",
                },
                {
                    sequence: 9,
                    messageIndex: 3,
                    contentHash: "sha256:hidden",
                },
            ],
        },
    );

    const request = renderRequest(view, renderer);
    const control = JSON.parse(request.messages.at(-1)?.content ?? "");

    assert.deepEqual(control.visibleConversationMessageMap, [
        { visibleIndex: 0, sourceMessageIndex: 2 },
        { visibleIndex: 1, sourceMessageIndex: 4 },
    ]);
    assert.deepEqual(control.preparationInputEvidence, [{
        sequence: 8,
        messageIndex: 2,
        contentHash: "sha256:visible",
    }]);
    assert.deepEqual(request.messages.slice(1, -1), [
        { role: "user", content: "可见约束" },
        { role: "assistant", content: "可见响应" },
    ]);
});

test("Executing 请求注入 Preparation provenance 时在渲染器调用前失败", () => {
    const view = buildView(
        "executing",
        {
            phase: "executing",
            intent: "完成示例任务",
            task: {
                objective: "实现三阶段上下文",
                completionCriteria: ["请求顺序稳定", "控制消息不持久化"],
            },
            execution: { stepCount: 0 },
        },
        { preparationInputEvidence: [] },
    );
    let rendererCalled = false;
    const rejectingRenderer: typeof renderer = {
        render() {
            rendererCalled = true;
            return "unexpected";
        },
    };

    assert.throws(
        () => renderRequest(view, rejectingRenderer),
        /Executing request must not receive Preparation input evidence/,
    );
    assert.equal(rendererCalled, false);
});

test("未知 Prompt Bundle 版本在渲染时抛出且不产生任何请求", () => {
    const view = buildView(
        "gathering_context",
        { phase: "gathering_context", intent: "完成示例任务" },
        { promptBundleVersion: 99 },
    );

    assert.throws(
        () => renderRequest(view, renderer),
        /不支持的 Prompt Bundle 版本 99/,
    );
});

test("renderWorkingContextMessage 逐字符固定为 JSON 控制的 user 消息", () => {
    const workingContext: ModelWorkingContext = {
        phase: "gathering_context",
        intent: "完成示例任务",
    };

    assert.deepEqual(renderWorkingContextMessage(workingContext), {
        role: "user",
        content: JSON.stringify(workingContext, null, 2),
    });
});

test("structured 请求在控制消息中独立携带 Working Memory", () => {
    const workingContext: ModelWorkingContext = {
        phase: "gathering_context",
        intent: "完成示例任务",
    };
    const workingMemory = {
        protocolVersion: 1 as const,
        derivedThroughSequence: 3,
        facts: [],
        hypotheses: [],
        plan: [],
        blockers: [],
    };
    const rendered = renderWorkingContextMessage(workingContext, workingMemory);

    assert.deepEqual(JSON.parse(rendered.content), {
        ...workingContext,
        workingMemory,
    });
});

test("当前请求在控制消息中携带带时效边界的历史 Lookup Result", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        task: {
            objective: "实现三阶段上下文",
            completionCriteria: ["请求顺序稳定"],
        },
        execution: { stepCount: 1 },
    };
    const contextLookupResult: ModelContextLookupResult = {
        status: "not_found",
        lookupId: "lookup-1",
        committedThroughSequence: 12,
        reason: "no_context_match",
    };
    const rendered = renderWorkingContextMessage(
        workingContext,
        undefined,
        undefined,
        contextLookupResult,
    );

    assert.deepEqual(JSON.parse(rendered.content), {
        ...workingContext,
        contextLookupResult,
    });
});
