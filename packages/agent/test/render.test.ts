import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import type {
    ModelInferenceView,
    ModelContextLookupResult,
    ModelProfileView,
    ModelToolDefinition,
    ModelWorkingContext,
    ModelContextEpochView,
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
    workingContext: ModelWorkingContext,
    options: {
        readonly promptBundleVersion?: number;
        readonly conversation?: ModelInferenceView["conversation"];
        readonly authorizedTools?: readonly ModelToolDefinition[];
        readonly task?: ModelInferenceView["dynamicContext"]["task"];
        readonly contextLookupResult?: ModelContextLookupResult;
    } = {},
): ModelInferenceView {
    return {
        prompt: {
            promptBundleVersion: (options.promptBundleVersion ?? 1) as 1,
            phase: "executing",
            stage: "decide",
            profile,
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
        dynamicContext: {
            runMode: "normal",
            goalPlanWritable: false,
            authorizedTools: options.authorizedTools ?? [],
            ...(options.task === undefined ? {} : { task: options.task }),
        },
        conversation: options.conversation ?? conversation,
        workingContext,
        workingMemory: {
            protocolVersion: 1,
            derivedThroughSequence: 0,
            facts: [],
            hypotheses: [],
            blockers: [],
        },
        contextEpoch: {
            protocolVersion: 1,
            epochNumber: 0,
            conversationStartIndex: 0,
            openedAtSequence: 0,
            control: {
                status: "active",
            },
        },
        ...(options.contextLookupResult === undefined
            ? {}
            : { contextLookupResult: options.contextLookupResult }),
    };
}

test("renderRequest 按固定 system → Conversation → 动态 section → 本轮输入组装", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: { stepCount: 0 },
    };
    const view = buildView(workingContext);
    const request = renderRequest(view, renderer);

    assert.equal(request.messages.length, 7);
    assert.equal(request.messages[0]?.role, "system");
    assert.equal(request.messages[0]?.content, renderer.render(view.prompt));
    assert.deepEqual(
        request.messages.slice(1, 3),
        conversation.map(({ role, content }) => ({ role, content })),
    );
    assert.ok(request.messages.slice(3, 6).every((message) => message.role === "user"));
    assert.match(request.messages[3]?.content ?? "", /section: run_mode/);
    assert.match(request.messages[4]?.content ?? "", /section: authorized_tools/);
    assert.match(request.messages[5]?.content ?? "", /section: working_memory/);
    assert.equal(request.messages.at(-1)?.role, "user");
    assert.deepEqual(
        JSON.parse(request.messages.at(-1)?.content ?? ""),
        {
            phase: "executing",
            execution: { stepCount: 0 },
        },
    );
});

test("executing 请求使用授权 ToolDefinition 渲染且不授予未授权能力", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: { stepCount: 0 },
    };
    const view = buildView(workingContext, {
        task: {
            objective: "实现三阶段上下文",
            completionCriteria: [{ text: "请求顺序稳定" }, { text: "控制消息不持久化" }],
        },
        authorizedTools: [readFileTool],
    });
    const request = renderRequest(view, renderer);
    const systemContent = request.messages[0]?.content ?? "";
    const dynamicText = request.messages.slice(1, -1).map((message) => message.content).join("\n");

    assert.match(systemContent, /Active Decide Instructions:/);
    assert.doesNotMatch(systemContent, /Plan Phase|probe/i);
    assert.match(systemContent, /trajectory-layered@1/);
    assert.doesNotMatch(systemContent, /read_file/);
    assert.match(dynamicText, /read_file/);
    assert.match(dynamicText, /读取工作区内文本文件/);
    assert.match(dynamicText, /Objective: 实现三阶段上下文/);

    const control = JSON.parse(request.messages.at(-1)?.content ?? "");
    assert.equal("preparationInputEvidence" in control, false);
    assert.equal("visibleConversationMessageMap" in control, false);
});

test("Conversation 与 Working Context 保持原始内容，不执行 Nunjucks 语法", () => {
    const view = buildView(
        { phase: "executing", intent: "{% if true %}x{% endif %}", execution: { stepCount: 0 } },
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
            phase: "executing",
            execution: { stepCount: 0 },
        },
    );
});

test("未知 Prompt Bundle 版本在渲染时抛出且不产生任何请求", () => {
    const view = buildView(
        { phase: "executing", intent: "完成示例任务", execution: { stepCount: 0 } },
        { promptBundleVersion: 99 },
    );

    assert.throws(
        () => renderRequest(view, renderer),
        /不支持的 Prompt Bundle 版本 99/,
    );
});

test("renderWorkingContextMessage 逐字符固定为 JSON 控制的 user 消息", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: { stepCount: 0 },
    };

    assert.deepEqual(renderWorkingContextMessage(workingContext), {
        role: "user",
        content: JSON.stringify({ phase: "executing", execution: { stepCount: 0 } }, null, 2),
    });
});

test("Working Memory 在独立动态 section 中注入，不重复进入本轮控制消息", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: { stepCount: 0 },
    };
    const target = buildView(workingContext);
    const request = renderRequest(target, renderer);
    const messages = renderer.renderDynamicSections(target);
    assert.equal(messages.find((message) => message.sectionId === "working_memory")?.role, "user");
    assert.equal("workingMemory" in JSON.parse(request.messages.at(-1)?.content ?? ""), false);
});

test("当前请求在控制消息中携带带时效边界的历史 Lookup Result", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
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
        contextLookupResult,
    );

    assert.deepEqual(JSON.parse(rendered.content), {
        phase: "executing",
        execution: { stepCount: 1 },
        contextLookupResult,
    });
});

test("Epoch-stable 前缀隔离微观 Token 水位并在需要时注入离散检查点信号", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: { stepCount: 1 },
    };
    const activeEpoch: ModelContextEpochView = {
        protocolVersion: 1,
        epochNumber: 1,
        conversationStartIndex: 0,
        openedAtSequence: 5,
        control: { status: "active" },
    };
    const renderedActive = renderWorkingContextMessage(
        workingContext,
        undefined,
        undefined,
        activeEpoch,
    );
    const parsedActive = JSON.parse(renderedActive.content);
    assert.equal("intent" in parsedActive, false);
    assert.equal("task" in parsedActive, false);
    assert.equal("contextEpoch" in parsedActive, false);
    assert.equal("checkpointRequired" in parsedActive, false);

    const checkpointEpoch: ModelContextEpochView = {
        ...activeEpoch,
        control: { status: "checkpoint_required", reason: "input_threshold" },
    };
    const renderedCheckpoint = renderWorkingContextMessage(
        workingContext,
        undefined,
        undefined,
        checkpointEpoch,
    );
    const parsedCheckpoint = JSON.parse(renderedCheckpoint.content);
    assert.equal(parsedCheckpoint.checkpointRequired, true);
    assert.equal(parsedCheckpoint.checkpointReason, "input_threshold");
});

test("Step-dynamic 尾部控制消息精简为纯动态增量且剥离冗余 budget", () => {
    const workingContext: ModelWorkingContext = {
        phase: "executing",
        intent: "完成示例任务",
        execution: {
            stepCount: 2,
            previousStep: {
                kind: "action" as const,
                action: {
                    actionId: "act_1",
                    toolId: "test_tool",
                    input: {},
                },
                observation: {
                    kind: "success",
                    output: { text: "ok" },
                },
            },
        },
    };
    const trajectoryContext = {
        measuredAs: "character" as const,
        softOverflow: false,
        hot: [
            {
                executionUnitId: "unit-1",
                goalId: "goal-1",
                runId: "run-1",
                phase: "executing" as const,
                firstSequence: 1,
                lastSequence: 2,
                events: [],
            },
        ],
        warm: [],
        budget: {
            measuredAs: "character" as const,
            modelInputBudget: 100000,
            responseReserve: 10000,
            fixedInput: { unit: "character" as const, count: 5000 },
            historyBudget: 85000,
            warmBudget: 20000,
            hotBudget: 65000,
            softOverflow: false,
        },
    };

    const rendered = renderWorkingContextMessage(
        workingContext,
        trajectoryContext,
    );
    const parsed = JSON.parse(rendered.content);

    assert.equal(parsed.phase, "executing");
    assert.equal(parsed.execution.stepCount, 2);
    assert.equal(parsed.execution.previousStep.action.toolId, "test_tool");
    assert.equal(parsed.trajectoryContext.hot.length, 1);
    assert.equal("budget" in parsed.trajectoryContext, false);
    assert.equal("intent" in parsed, false);
    assert.equal("task" in parsed, false);
});
